import { QualityRecovery } from './qualityRecovery';
// Optional overworld presentation. Simulation positions are x/z; elevation is visual only.
import * as THREE from 'three';
import { LOCATIONS } from './content';
import { OVERWORLD, type WorldProp } from './world';
import { getRenderViewport } from './viewport';
import { buildOverworldTerrain } from './terrain3d';
import { AMBIENT_TAXI, TAXI_ROCK_IMPACT, roadsideBirds, taxiRockPosition, trafficForState } from './dressing';
import { availablePickups } from './collectibles';
import type { AvatarStrip, HeroAvatar } from './avatar';
import type { GameEvent, GameState, HeroId } from './sim';
import type { RenderLabel, RenderPresentation } from './render';

const SHEETS = {
  joe: { url: '/royale/joe_idle.png', w: 16, h: 24, frames: 6 },
  matt: { url: '/royale/matt_idle.png', w: 16, h: 24, frames: 6 },
  alex: { url: '/royale/ui/alex_idle.png', w: 16, h: 24, frames: 6 },
  jon: { url: '/royale/ui/jon_idle.png', w: 16, h: 24, frames: 5 },
  zombie: { url: '/sprites/zombiesprite-1.png', w: 16, h: 24, frames: 6 },
  pumpkin: { url: '/sprites/pumpkin.png', w: 16, h: 16, frames: 6 },
  ghost: { url: '/sprites/ghost.png', w: 16, h: 32, frames: 6 },
  imp: { url: '/sprites/imp.png', w: 16, h: 16, frames: 4 },
  shadowbeast: { url: '/sprites/shadowbeast.png', w: 32, h: 32, frames: 6 },
};
type SpriteId = keyof typeof SHEETS;
interface SpriteSheet { texture: THREE.Texture; frames: number; w: number; h: number; fps: number }
interface Billboard { group: THREE.Group; sprites: THREE.Sprite[]; sheets: SpriteSheet[]; shadow: THREE.Mesh; source: string; x: number; y: number }
interface RemoteTaxi { group: THREE.Group; wheels: THREE.Mesh[]; shadow: THREE.Mesh }
interface Portal { group: THREE.Group; ring: THREE.Mesh; core: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>; x: number; y: number }
interface LightSource { x: number; y: number; height: number; color: number; strength: number }
interface Burst { x: number; y: number; age: number; color: number }
const clamp = THREE.MathUtils.clamp;
const FORWARD = new THREE.Vector3(.24, .82, .52).normalize();
const QUALITY = [
  { name: 'high', cap: 3, shadows: true, fx: 2 },
  { name: 'medium', cap: 3, shadows: false, fx: 1 },
  { name: 'balanced', cap: 2, shadows: false, fx: 1 },
  { name: 'low', cap: 1.5, shadows: false, fx: 0 },
  { name: 'minimum', cap: 1, shadows: false, fx: 0 },
] as const;

// Depth-aware tilt shift and a soft highlight bloom share one native-resolution
// pass. The focal distance tracks the taxi, so readable sprites stay sharp.
const POST_VERTEX = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const POST_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D colorMap;
uniform sampler2D depthMap;
uniform vec2 texel;
uniform float nearPlane;
uniform float farPlane;
uniform float focus;
uniform float quality;
float viewDistance(float d){return nearPlane*farPlane/(farPlane-d*(farPlane-nearPlane));}
vec3 bright(vec2 uv){vec3 c=texture2D(colorMap,uv).rgb;return c*max(0.,max(c.r,max(c.g,c.b))-.82);}
void main(){
  vec3 color=texture2D(colorMap,vUv).rgb;
  float depth=viewDistance(texture2D(depthMap,vUv).x);
  float blur=quality>1.5?clamp(abs(depth-focus)/max(focus*.28,1.)-.18,0.,1.):0.;
  // A slight screen-space focus band makes the landscape feel like a diorama.
  blur*=smoothstep(.12,.46,abs(vUv.y-.47));
  vec2 radius=texel*blur*3.4;
  if(blur>.015){
    vec3 soft=color*2.;
    soft+=texture2D(colorMap,vUv+vec2(radius.x,0.)).rgb;
    soft+=texture2D(colorMap,vUv-vec2(radius.x,0.)).rgb;
    soft+=texture2D(colorMap,vUv+vec2(0.,radius.y)).rgb;
    soft+=texture2D(colorMap,vUv-vec2(0.,radius.y)).rgb;
    soft+=texture2D(colorMap,vUv+radius*.707).rgb;
    soft+=texture2D(colorMap,vUv-radius*.707).rgb;
    color=mix(color,soft*.125,blur*.78);
  }
  vec2 bloomRadius=texel*3.5;
  vec3 bloom=bright(vUv+bloomRadius)+bright(vUv-bloomRadius);
  bloom+=bright(vUv+vec2(bloomRadius.x,-bloomRadius.y))+bright(vUv+vec2(-bloomRadius.x,bloomRadius.y));
  color+=bloom*.12;
  vec2 edge=(vUv-.5)*vec2(.88,1.);
  color*=1.-smoothstep(.20,.72,dot(edge,edge))*.23;
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class OverworldRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 1, 1800);
  private terrain: ReturnType<typeof buildOverworldTerrain>;
  private viewport = getRenderViewport(1, 1, window.devicePixelRatio);
  private sky = new THREE.Color();
  private sun = new THREE.DirectionalLight(0xffe7b4, 2.1);
  private ambient = new THREE.HemisphereLight(0xd8e9e2, 0x354035, 2.2);
  private lights = Array.from({ length: 4 }, () => new THREE.PointLight(0xffd695, 0, 100, 1.5));
  private lightSources: LightSource[] = [];
  private taxi = new THREE.Group();
  private ambientCab = new THREE.Group();
  private wreckCab = new THREE.Group();
  private trafficCars: THREE.Group[] = [];
  private strayRock: THREE.Mesh | null = null;
  private strayRockShadow: THREE.Mesh | null = null;
  private crashShake = 0;
  private wheels: THREE.Mesh[] = [];
  private taxiShadow: THREE.Mesh;
  private headlights: THREE.PointLight;
  private portals: Portal[] = [];
  private markers: THREE.Group[] = [];
  private billboards = new Map<string, Billboard>();
  private sheets = new Map<SpriteId, SpriteSheet>();
  private avatar: HeroAvatar | null = null;
  private avatarSheets: SpriteSheet[] = [];
  private remoteAvatars = new Map<number, HeroAvatar>();
  private remoteAvatarSheets = new Map<number, SpriteSheet[]>();
  private remoteTaxis = new Map<number, RemoteTaxi>();
  private images: HTMLImageElement[] = [];
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cone: new THREE.ConeGeometry(1, 1, 5),
    rock: new THREE.DodecahedronGeometry(1, 0),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
  };
  private shadowTexture: THREE.CanvasTexture;
  private shadowGeometry = new THREE.PlaneGeometry(1, 1);
  private shadowMaterial: THREE.MeshBasicMaterial;
  private effectMesh: THREE.InstancedMesh;
  private bursts: Burst[] = [];
  private target = new THREE.Vector3();
  private smoothPosition = new THREE.Vector2();
  private heading = 0;
  private cameraReady = false;
  private visualTime = 0;
  private tier = 0;
  private slowTime = 0;
  private qualityRecovery = new QualityRecovery();
  private frameEma = 16.67;
  private renderEma = 0;
  private disposed = false;
  private contextLost = false;
  private resizeObserver: ResizeObserver;
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private reducedMotion = this.motionQuery.matches;
  private motionChanged = (event: MediaQueryListEvent) => { this.reducedMotion = event.matches; };
  private loseContext = (event: Event) => { event.preventDefault(); this.contextLost = true; };
  private postTarget: THREE.WebGLRenderTarget | null = null;
  private postScene = new THREE.Scene();
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postMaterial: THREE.ShaderMaterial;
  private ray = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -5);
  private scratch = new THREE.Vector3();
  private dummy = new THREE.Object3D();
  private resize = () => {
    if (this.disposed) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    // Quality changes resolution, never camera zoom or the visible game area.
    this.viewport = getRenderViewport(width, height, window.devicePixelRatio);
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.tier].cap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.postTarget) {
      this.postTarget.setSize(this.canvas.width, this.canvas.height);
      this.postMaterial.uniforms.texel.value.set(1 / this.canvas.width, 1 / this.canvas.height);
    }
    this.canvas.dataset.renderDpr = `${dpr}`;
    this.canvas.dataset.zoom = `${this.viewport.zoom}`;
    this.canvas.dataset.worldWidth = `${this.viewport.width}`;
    this.canvas.dataset.worldHeight = `${this.viewport.height}`;
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false });
    try {
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    this.canvas.addEventListener('webglcontextlost', this.loseContext);
    this.canvas.dataset.renderer = '3d';
    this.canvas.dataset.qualityTier = QUALITY[this.tier].name;
    this.terrain = buildOverworldTerrain(OVERWORLD);
    this.scene.add(this.terrain.group);
    this.scene.fog = new THREE.Fog(0x748f8c, 320, 1100);
    this.scene.background = this.sky;
    this.scene.add(this.ambient, this.sun, this.sun.target, ...this.lights);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180, near: 20, far: 900 });
    this.sun.shadow.normalBias = .5;
    this.sun.shadow.bias = -.00025;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.shadowTexture = this.makeShadowTexture();
    this.shadowMaterial = new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false, opacity: .62, toneMapped: false });
    this.shadowGeometry.rotateX(-Math.PI / 2);
    this.taxiShadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    this.taxiShadow.scale.set(38, 1, 26);
    this.scene.add(this.taxiShadow);
    this.headlights = new THREE.PointLight(0xffe8aa, 20, 90, 1.5);
    this.taxi.add(this.headlights);
    this.makeTaxi();
    this.scene.add(this.taxi);
    this.makeRoadsideVehicles();
    this.makeProps();
    this.makeMarkers();
    this.loadSheets();
    this.effectMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffdfa6, toneMapped: false }), 96);
    this.effectMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.effectMesh.count = 0;
    this.effectMesh.frustumCulled = false;
    this.scene.add(this.effectMesh);
    this.postMaterial = new THREE.ShaderMaterial({ vertexShader: POST_VERTEX, fragmentShader: POST_FRAGMENT, uniforms: {
      colorMap: { value: null }, depthMap: { value: null }, texel: { value: new THREE.Vector2(1, 1) },
      nearPlane: { value: this.camera.near }, farPlane: { value: this.camera.far }, focus: { value: 300 }, quality: { value: 2 },
    }, depthTest: false, depthWrite: false });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial));
    this.configureQuality();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
    this.motionQuery.addEventListener('change', this.motionChanged);
    this.resize();
    } catch (error) {
      // Setup may fail after allocating the context or a render target. The
      // bridge can safely return to 2D without retaining those GPU resources.
      this.dispose();
      throw error;
    }
  }

  private makeShadowTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('Could not create 3D shadow texture');
    const gradient = c.createRadialGradient(32, 32, 3, 32, 32, 31);
    gradient.addColorStop(0, '#101e29b0'); gradient.addColorStop(.45, '#101e2980'); gradient.addColorStop(1, '#101e2900');
    c.fillStyle = gradient; c.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  private material(color: string, emissive = false) {
    const key = `${color}:${emissive}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: .88, metalness: .03, flatShading: true, emissive: emissive ? color : 0x000000, emissiveIntensity: emissive ? 1.6 : 0 });
      this.materials.set(key, material);
    }
    return material;
  }
  private taxiPart(color: string, x: number, y: number, z: number, w: number, h: number, d: number, emissive = false) {
    const mesh = new THREE.Mesh(this.geometries.box, this.material(color, emissive));
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = true; mesh.receiveShadow = true;
    this.taxi.add(mesh); return mesh;
  }
  private makeTaxi() {
    this.taxiPart('#263439', 0, 3, 0, 29, 4, 15);
    this.taxiPart('#cd8c35', 0, 6.5, 0, 30, 6, 14);
    this.taxiPart('#ffd16d', 0, 9, 0, 29, 2, 14);
    this.taxiPart('#ffe6a0', 10, 10.3, 0, 9, .8, 13);
    this.taxiPart('#eeb855', -2, 13, 0, 15, 8, 12);
    this.taxiPart('#244752', -2, 13, -6.1, 12, 5, .3);
    this.taxiPart('#376171', -2, 13, 6.1, 12, 5, .3);
    this.taxiPart('#314c57', 5.6, 13, 0, .4, 5, 10.5);
    this.taxiPart('#6b9294', -9.6, 13, 0, .3, 5, 10.5);
    this.taxiPart('#ffe4a1', -2, 17.2, 0, 16.5, 1.8, 13);
    this.taxiPart('#fff0b0', -2, 19.2, 0, 5, 2, 3);
    for (const z of [-6.15, 6.15]) {
      for (let x = -12; x < 13; x += 2.8) this.taxiPart('#3b3732', x, 6.3, z, 1.4, 1.2, .4);
      this.taxiPart('#ffefa9', 15.2, 7.6, z * .67, .8, 2.5, 3, true);
      this.taxiPart('#d36d62', -15.3, 7.8, z * .75, .7, 2.1, 2, true);
      this.taxiPart('#e7cf9d', 0, 10.2, z, 1.3, 3.7, .5);
      this.taxiPart('#ced8ca', 1.6, 10.6, z * 1.05, 2, .6, .8);
      for (const x of [-9.5, 9]) {
        const wheel = new THREE.Mesh(this.geometries.cylinder, this.material('#17272e'));
        wheel.rotation.x = Math.PI / 2; wheel.position.set(x, 4.5, z * 1.13); wheel.scale.set(3.6, 2, 3.6);
        wheel.castShadow = true; this.taxi.add(wheel); this.wheels.push(wheel);
        const hub = new THREE.Mesh(this.geometries.cylinder, this.material('#86938d'));
        hub.rotation.x = Math.PI / 2; hub.position.set(x, 4.5, z * 1.29); hub.scale.set(1.6, .5, 1.6); this.taxi.add(hub);
      }
    }
    this.taxiPart('#adbab1', 15.1, 4.8, 0, .9, 1.5, 13.8);
    this.taxiPart('#adbab1', -15.3, 4.8, 0, .9, 1.5, 13.8);
    this.headlights.position.set(24, 10, 0);
    // Pixel details are batched into a handful of material draws, leaving only
    // the four animated wheels as individual meshes.
    const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }>();
    for (const child of [...this.taxi.children]) {
      if (!(child instanceof THREE.Mesh) || this.wheels.includes(child) || Array.isArray(child.material)) continue;
      const key = `${child.geometry.uuid}:${child.material.uuid}`;
      let batch = batches.get(key);
      if (!batch) { batch = { geometry: child.geometry, material: child.material, matrices: [] }; batches.set(key, batch); }
      child.updateMatrix(); batch.matrices.push(child.matrix.clone()); this.taxi.remove(child);
    }
    for (const batch of batches.values()) {
      const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
      batch.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); this.taxi.add(mesh);
    }
  }

  private makeProps() {
    // Repeated cubes/foliage share geometry and are instanced by material. This
    // bounds draw calls independently of the hundreds of map decorations.
    const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }>();
    const part = (shape: keyof typeof this.geometries, color: string, x: number, y: number, z: number, w: number, h: number, d: number, rotation = 0, emissive = false) => {
      const key = `${shape}:${color}:${emissive}`;
      let batch = batches.get(key);
      if (!batch) { batch = { geometry: this.geometries[shape], material: this.material(color, emissive), matrices: [] }; batches.set(key, batch); }
      this.dummy.position.set(x, y, z); this.dummy.rotation.set(0, rotation, 0); this.dummy.scale.set(w, h, d); this.dummy.updateMatrix();
      batch.matrices.push(this.dummy.matrix.clone());
    };
    const shadows: THREE.Matrix4[] = [];
    for (const prop of OVERWORLD.props) {
      const x = prop.x + prop.w / 2, z = prop.y + prop.h * .8;
      const y = this.terrain.heightAt(x, z);
      const box = (color: string, ox: number, oy: number, oz: number, w: number, h: number, d: number, emissive = false) => part('box', color, x + ox, y + oy, z + oz, w, h, d, 0, emissive);
      if (prop.kind === 'tree' || prop.kind === 'pine') {
        box('#795944', 0, 11, 0, 4, 22, 4);
        box('#ad8961', -1.7, 12, 1, .6, 14, 3);
        if (prop.kind === 'pine') {
          for (let k = 0; k < 3; k++) part('cone', ['#2e4d43', '#42624c', '#527955'][k], x, y + 15 + k * 9, z, 14 - k * 3, 20 - k * 3, 14 - k * 3, x * .017);
        } else {
          part('rock', '#2d5040', x, y + 25, z, 14, 13, 12, x * .017);
          part('rock', '#49704e', x - 4, y + 31, z - 2, 10, 11, 10, z * .015);
          part('rock', '#658a57', x - 5, y + 36, z - 3, 5, 5, 5, x * .025);
          box('#92aa6f', -5, 35, 6, 2, 1, 2);
        }
        this.dummy.position.set(x + 4, y + .24, z + 4); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.set(34, 1, 27); this.dummy.updateMatrix(); shadows.push(this.dummy.matrix.clone());
      } else if (prop.kind === 'lamp') {
        box('#263d42', 0, 16, 0, 2.4, 32, 2.4); box('#364b4c', 0, 1, 0, 7, 2, 7);
        box('#bd9657', 0, 31, 0, 7, 7, 7); box('#ffe5a8', 0, 31, 0, 5.2, 5.5, 7.1, true); box('#263b3b', 0, 36, 0, 9, 2, 9);
        this.lightSources.push({ x, y: z, height: y + 31, color: 0xffcd84, strength: 85 });
      } else if (prop.kind === 'fence') {
        for (let offset = -prop.w / 2; offset <= prop.w / 2; offset += 12) {
          box('#aa9670', offset, 7, 0, 3.3, 14, 3.3); box('#e1c997', offset, 14.5, 0, 4, 1.2, 4);
        }
        box('#ad9a76', 0, 5, 0, prop.w, 2, 2); box('#c0aa7e', 0, 10, 0, prop.w, 2, 2);
      } else if (prop.kind === 'station' || prop.kind === 'home' || prop.kind === 'shop' || prop.kind === 'shed' || prop.kind === 'diner') {
        this.buildStation(prop, part);
        if (prop.kind === 'diner') {
          box('#d0b48f', 0, 27, prop.h * .3, prop.w - 8, 4, 13);
          for (let k = 0; k < 10; k++) box('#a95d54', -prop.w / 2 + 10 + k * 10, 29.4, prop.h * .3, 5, .8, 13);
        }
      } else if (prop.kind === 'bush') {
        part('rock', '#49694c', x, y + 4, z, 9, 6, 6, x);
        part('rock', '#6c8555', x - 3, y + 7, z - 1, 5, 4, 4, z);
      } else if (prop.kind === 'flower') {
        box('#678359', 0, 1, 0, 7, 2, 5);
        for (let k = 0; k < 3; k++) { box('#7e9659', k * 3 - 3, 3.5, k % 2 * 3, .6, 5, .6); box(k % 2 ? '#e2bf83' : '#d8c3a1', k * 3 - 3, 6, k % 2 * 3, 2.3, 1.5, 2.3); }
      } else if (prop.kind === 'rock') {
        part('rock', '#7c8272', x, y + 4, z, 6, 6, 5, x); part('rock', '#a0a38a', x - 2, y + 7, z - 1, 3, 3, 3, z);
      } else if (prop.kind === 'car') {
        box('#27363f', 0, 3, 0, 30, 4, 17); box('#799ba1', 0, 7, 0, 32, 7, 15); box('#a1b5a9', -2, 12, 0, 17, 5, 12);
        box('#314c59', -2, 12, 6.1, 14, 3, .3); box('#ead19a', 16, 8, -4, .5, 2, 3);
      } else if (prop.kind === 'sign') {
        box('#816a50', 0, 9, 0, 2.5, 18, 2.5); box('#466057', 0, 17, 0, 17, 9, 2); box('#c8bb8e', 0, 19, 1.1, 11, .6, .3);
      } else if (prop.kind === 'mailbox') {
        box('#715e46', 0, 8, 0, 2, 16, 2); box('#6d8b8c', 0, 17, 0, 12, 7, 6); box('#344e58', -5.8, 17, 0, .5, 5, 5); box('#d48567', 5.5, 22, 0, 5, 2, .8);
      } else if (prop.kind === 'vending') {
        box('#a9645b', 0, 16, 0, 20, 32, 11); box('#273d47', -2, 18, 5.6, 11, 18, .3); box('#e6cfaf', 0, 29, 5.7, 18, 2, .4);
        box('#27383f', 0, 4, 5.7, 13, 3, .4); box('#e1bd87', 6, 15, 5.8, 2, 6, .3);
        for (let k = 0; k < 6; k++) box(k % 2 ? '#d8a681' : '#d3d287', -5 + k % 2 * 5, 22 - Math.floor(k / 2) * 5, 5.9, 2, 3, .5);
      } else if (prop.kind === 'puddle') {
        box('#557b84', 0, .2, 0, prop.w, .25, 5); box('#b6cdcb', -3, .4, -1, prop.w * .55, .2, .5);
      } else if (prop.kind === 'debris') {
        part('rock', '#8b7561', x, y + 1, z, 3, 1.8, 2, x);
      } else if (prop.kind === 'crater') {
        for (let k = 0; k < 20; k++) { const angle = k * Math.PI / 10; part('rock', '#8f7366', x + Math.cos(angle) * prop.w * .46, y + 2, z + Math.sin(angle) * prop.h * .35, 4, 2, 3, angle); }
      }
    }
    for (const batch of batches.values()) {
      const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
      batch.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); this.scene.add(mesh);
    }
    const blobs = new THREE.InstancedMesh(this.shadowGeometry, this.shadowMaterial, shadows.length);
    shadows.forEach((matrix, index) => blobs.setMatrixAt(index, matrix)); blobs.computeBoundingSphere(); this.scene.add(blobs);
  }
  private makeRoadsideVehicles() {
    this.ambientCab = this.taxi.clone(true);
    this.ambientCab.traverse(object => { if (object instanceof THREE.PointLight) object.intensity = 0; });
    this.scene.add(this.ambientCab, this.wreckCab);
    const part = (group: THREE.Group, color: string, x: number, y: number, z: number, w: number, h: number, d: number) => {
      const mesh = new THREE.Mesh(this.geometries.box, this.material(color)); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    };
    part(this.wreckCab, '#514f42', 0, 3, 0, 32, 5, 16); part(this.wreckCab, '#a58349', 0, 6, 0, 30, 4, 14);
    part(this.wreckCab, '#696655', -2, 10, 0, 17, 5, 11); part(this.wreckCab, '#2d434c', -2, 10, 5.6, 13, 3, .4);
    part(this.wreckCab, '#c7a364', 11, 7, 0, 6, 2, 12);
    for (const x of [-11, 10]) for (const z of [-7, 7]) part(this.wreckCab, '#192b32', x, 2, z, 5, 4, 2);
    const roofRock = new THREE.Mesh(this.geometries.rock, this.material('#79786b')); roofRock.position.set(1, 14, 0); roofRock.scale.set(8, 6, 7); this.wreckCab.add(roofRock);
    this.strayRock = new THREE.Mesh(this.geometries.rock, this.material('#898476')); this.strayRock.scale.set(9, 8, 8); this.strayRock.castShadow = true;
    this.strayRockShadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial); this.strayRockShadow.scale.set(22, 1, 16);
    this.scene.add(this.strayRock, this.strayRockShadow);
    for (const color of ['#77999c', '#bd7661']) {
      const group = new THREE.Group(); part(group, '#26373e', 0, 3, 0, 30, 5, 15); part(group, color, 0, 7, 0, 32, 6, 14);
      part(group, color, -2, 12, 0, 17, 6, 11); part(group, '#314b58', -2, 12, 5.7, 14, 4, .4);
      for (const x of [-10, 10]) for (const z of [-7, 7]) part(group, '#182a31', x, 3, z, 5, 5, 2);
      part(group, '#ead9ad', 16.2, 8, 4, .5, 2, 3); this.scene.add(group); this.trafficCars.push(group);
    }
    for (const group of [this.wreckCab, ...this.trafficCars]) {
      const batches = new Map<string, { source: THREE.Mesh; matrices: THREE.Matrix4[] }>();
      for (const child of [...group.children]) {
        if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
        const key = `${child.geometry.uuid}:${child.material.uuid}`;
        let batch = batches.get(key); if (!batch) { batch = { source: child, matrices: [] }; batches.set(key, batch); }
        child.updateMatrix(); batch.matrices.push(child.matrix.clone()); group.remove(child);
      }
      for (const { source, matrices } of batches.values()) {
        const mesh = new THREE.InstancedMesh(source.geometry, source.material, matrices.length);
        matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix)); mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);
      }
    }
  }
  private updateDressing(s: GameState) {
    const { x, y } = AMBIENT_TAXI, base = this.terrain.heightAt(x, y);
    this.ambientCab.visible = !s.ambientTaxiWrecked && this.nearView(x, y, 80);
    this.wreckCab.visible = s.ambientTaxiWrecked && this.nearView(x, y, 80);
    this.ambientCab.position.set(x, base, y); this.wreckCab.position.set(x, base, y);
    const rock = taxiRockPosition(s);
    if (this.strayRock && this.strayRockShadow) {
      this.strayRock.visible = this.strayRockShadow.visible = !!rock && this.nearView(rock.x, rock.y, 190);
      if (rock) {
        const ground = this.terrain.heightAt(rock.x, rock.y); this.strayRock.position.set(rock.x, ground + rock.height + 8, rock.y); this.strayRock.rotation.set(rock.rotation, 0, rock.rotation * .6);
        this.strayRockShadow.position.set(rock.x, ground + .5, rock.y);
      }
    }
    trafficForState(s).forEach((traffic, index) => {
      const group = this.trafficCars[index]; group.position.set(traffic.x, this.terrain.heightAt(traffic.x, traffic.y), traffic.y);
      group.rotation.y = traffic.direction < 0 ? Math.PI : 0; group.visible = this.nearView(traffic.x, traffic.y, 55);
    });
  }
  private buildStation(prop: WorldProp, part: (shape: keyof OverworldRenderer['geometries'], color: string, x: number, y: number, z: number, w: number, h: number, d: number, rotation?: number, emissive?: boolean) => void) {
    const x = prop.x + prop.w / 2, z = prop.y + prop.h / 2;
    const ground = this.terrain.heightAt(x, prop.y + prop.h);
    const w = prop.w, d = prop.h * .65;
    const box = (color: string, ox: number, oy: number, oz: number, bw: number, bh: number, bd: number, emissive = false) => part('box', color, x + ox, ground + oy, z + oz, bw, bh, bd, 0, emissive);
    box('#5a6660', 0, 2, 5, w + 7, 4, d + 14);
    box('#baae87', 0, 27, 0, w, 49, d);
    box('#ded0a6', 0, 49, 0, w + 2, 6, d + 2);
    box('#2c4650', 0, 54, 0, w + 12, 8, d + 10);
    box('#3f6167', 0, 59, -d * .2, w + 8, 3, d * .66);
    box('#75928a', 0, 61, -d * .3, w + 5, .8, 2);
    for (let offset = -w / 2 + 16; offset < w / 2 - 8; offset += 25) {
      box('#57656a', offset, 29, d / 2 + .5, 16, 23, 1.5);
      box('#eac584', offset, 29, d / 2 + 1.5, 13, 20, .6, true);
      box('#9b997f', offset, 29, d / 2 + 2, 1.5, 22, 1);
      box('#9b997f', offset, 29, d / 2 + 2, 15, 1.5, 1);
      box('#e6d6ac', offset, 16, d / 2 + 2, 19, 2, 4);
    }
    box('#27474b', 0, 17, d / 2 + 2, 22, 32, 2);
    box('#759790', 0, 27, d / 2 + 3.2, 17, 9, .3);
    box('#decfa7', 9, 17, d / 2 + 3.5, 1.2, 2, 1);
    box('#466461', 0, 40, d / 2 + 10, 43, 3, 23);
    for (const offset of [-20, 20]) box('#d6c696', offset, 20, d / 2 + 19, 3, 37, 3);
    for (let k = 0; k < 4; k++) box('#9ba18a', 0, 3.5 - k * .7, d / 2 + 18 + k * 4, 42 + k * 3, 3 - k * .7, 8);
    // Station name remains a DOM label; the facade gets a geometric badge only.
    box('#e1c784', 0, 44, d / 2 + 1, 38, 5, 1.5);
    this.lightSources.push({ x, y: z + d / 2 + 11, height: ground + 34, color: 0xffcc91, strength: 110 });
  }

  private makeMarkers() {
    const ringGeometry = new THREE.TorusGeometry(1, .105, 5, 36);
    const coreGeometry = new THREE.CircleGeometry(1, 36);
    for (const location of LOCATIONS) {
      const height = this.terrain.heightAt(location.x, location.y);
      if (location.locked || location.id === 'blast') {
        const group = new THREE.Group(); group.position.set(location.x, height, location.y);
        const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: location.locked ? 0xd39df0 : 0xffc394, toneMapped: false }));
        ring.scale.set(location.locked ? 15 : 22, location.locked ? 21 : 13, 2); ring.position.y = 23;
        const core = new THREE.Mesh(coreGeometry, new THREE.MeshBasicMaterial({ color: location.locked ? 0x703e98 : 0xb47972, transparent: true, opacity: .46, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        core.scale.set(ring.scale.x * .88, ring.scale.y * .9, 1); core.position.set(0, 23, -.7);
        group.add(core, ring); this.scene.add(group); this.portals.push({ group, ring, core, x: location.x, y: location.y });
        this.lightSources.push({ x: location.x, y: location.y, height: height + 24, color: location.locked ? 0xd096ff : 0xffb58a, strength: 75 });
      } else {
        const group = new THREE.Group(); group.position.set(location.x, height + 26, location.y);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(3.6, 6.5, 4), new THREE.MeshBasicMaterial({ color: 0xffe4a0, toneMapped: false })); arrow.rotation.z = Math.PI;
        group.add(arrow); this.markers.push(group); this.scene.add(group);
      }
    }
  }
  private loadSheets() {
    for (const [id, sheet] of Object.entries(SHEETS)) {
      const image = new Image();
      image.onload = () => {
        if (this.disposed) return;
        const texture = new THREE.Texture(image); texture.needsUpdate = true;
        texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
        this.sheets.set(id as SpriteId, { texture, frames: sheet.frames, w: sheet.w, h: sheet.h, fps: 8 });
      };
      image.src = sheet.url; this.images.push(image);
    }
  }
  setAvatar(avatar: HeroAvatar) {
    if (this.disposed) return;
    this.avatar = avatar;
    for (const key of [...this.billboards.keys()]) if (key === 'crew-you' || key === 'driver') this.removeBillboard(key);
    this.avatarSheets.forEach(sheet => sheet.texture.dispose());
    this.avatarSheets = this.composeAvatarSheets(avatar);
  }
  setRemoteAvatar(seat: number, avatar: HeroAvatar) {
    if (this.disposed) return;
    this.releaseRemoteAvatarSheets(seat);
    this.remoteAvatars.set(seat, avatar);
  }
  private composeAvatarSheets(avatar: HeroAvatar) {
    const stripSheet = (strip: AvatarStrip): SpriteSheet => {
      const texture = new THREE.CanvasTexture(strip.canvas); texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
      return { texture, frames: strip.frames, w: 32, h: 48, fps: strip.fps };
    };
    return [...avatar.back, avatar.body, ...avatar.front, ...avatar.companions].map(stripSheet);
  }
  private releaseRemoteAvatarSheets(seat: number) {
    this.removeBillboard(`peer-driver-${seat}`);
    this.remoteAvatarSheets.get(seat)?.forEach(sheet => sheet.texture.dispose());
    this.remoteAvatarSheets.delete(seat);
  }
  private billboard(key: string, spriteId: SpriteId | 'you', x: number, y: number, scale = 1, remoteSeat?: number) {
    let sheets: SpriteSheet[];
    if (spriteId === 'you' && remoteSeat !== undefined && this.remoteAvatars.has(remoteSeat)) {
      sheets = this.remoteAvatarSheets.get(remoteSeat) ?? this.composeAvatarSheets(this.remoteAvatars.get(remoteSeat)!);
      this.remoteAvatarSheets.set(remoteSeat, sheets);
    } else if (spriteId === 'you' && remoteSeat === undefined && this.avatar) sheets = this.avatarSheets;
    else sheets = [this.sheets.get(spriteId === 'you' ? 'joe' : spriteId)].filter((sheet): sheet is SpriteSheet => !!sheet);
    if (!sheets.length) return null;
    const source = remoteSeat === undefined ? spriteId : `${spriteId}:${remoteSeat}`;
    let actor = this.billboards.get(key);
    if (actor && actor.source !== source) { this.removeBillboard(key); actor = undefined; }
    if (!actor) {
      const group = new THREE.Group(); const sprites: THREE.Sprite[] = [];
      for (const sheet of sheets) {
        const texture = sheet.texture.clone(); texture.needsUpdate = true; texture.repeat.set(1 / sheet.frames, 1);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: .08, depthWrite: true, toneMapped: false }));
        sprite.center.set(.5, 0); sprite.scale.set(sheet.w * scale, sheet.h * scale, 1); group.add(sprite); sprites.push(sprite);
      }
      const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial); shadow.scale.set(20 * scale, 1, 13 * scale);
      group.add(shadow); this.scene.add(group); actor = { group, sprites, sheets, shadow, source, x, y }; this.billboards.set(key, actor);
    }
    actor.x = x; actor.y = y;
    actor.group.position.set(x, this.terrain.heightAt(x, y) + .4, y);
    const time = this.reducedMotion ? 0 : this.visualTime;
    actor.sprites.forEach((sprite, index) => {
      const sheet = actor!.sheets[index]; const map = (sprite.material as THREE.SpriteMaterial).map!;
      map.offset.x = Math.floor(time * sheet.fps) % sheet.frames / sheet.frames;
      // Layer depth offsets follow the camera, preserving wardrobe order.
      const bob = this.reducedMotion ? 0 : Math.sin(time * 3 + x) * .5;
      sprite.position.set(FORWARD.x * index * .08, bob + FORWARD.y * index * .08, FORWARD.z * index * .08);
    });
    actor.group.visible = this.nearView(x, y, 80);
    return actor;
  }
  private removeBillboard(key: string) {
    const actor = this.billboards.get(key); if (!actor) return;
    this.scene.remove(actor.group);
    for (const sprite of actor.sprites) { sprite.material.map?.dispose(); sprite.material.dispose(); }
    this.billboards.delete(key);
  }
  private remoteTaxi(seat: number) {
    let taxi = this.remoteTaxis.get(seat);
    if (taxi) return taxi;
    // Clones share the car's geometry/materials and own only their instance
    // buffers. Keep the local headlight as the single moving light source.
    const group = this.taxi.clone(true);
    const wheels = this.wheels.map(wheel => group.children[this.taxi.children.indexOf(wheel)] as THREE.Mesh);
    for (const child of [...group.children]) if (child instanceof THREE.Light) group.remove(child);
    const shadow = this.taxiShadow.clone();
    this.scene.add(group, shadow);
    taxi = { group, wheels, shadow }; this.remoteTaxis.set(seat, taxi);
    return taxi;
  }
  private removeRemoteTaxi(seat: number) {
    const taxi = this.remoteTaxis.get(seat); if (!taxi) return;
    this.scene.remove(taxi.group, taxi.shadow);
    taxi.group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.removeBillboard(`peer-driver-${seat}`);
    this.remoteTaxis.delete(seat);
  }
  syncRemotePeers(s: GameState) {
    // The bridge can release departed actors even while this renderer is dormant
    // behind a 2D scene. Raw avatar canvases stay available for a later reunion.
    const seats = new Set((s.coop?.remoteHeroes ?? []).filter(peer => peer.scene === s.scene && peer.room === s.room).map(peer => peer.seat));
    for (const seat of this.remoteTaxis.keys()) if (!seats.has(seat)) this.removeRemoteTaxi(seat);
    for (const seat of this.remoteAvatarSheets.keys()) if (!seats.has(seat)) this.releaseRemoteAvatarSheets(seat);
  }
  private nearView(x: number, y: number, margin = 50) {
    const point = this.scratch.set(x, this.terrain.heightAt(x, y) + 16, y).project(this.camera);
    const pad = margin / Math.max(100, this.viewport.width);
    return point.z > -1 && point.z < 1 && point.x > -1 - pad && point.x < 1 + pad && point.y > -1 - pad && point.y < 1 + pad;
  }

  private configureQuality() {
    const quality = QUALITY[this.tier];
    this.renderer.shadowMap.enabled = quality.shadows; this.sun.castShadow = quality.shadows;
    this.postMaterial.uniforms.quality.value = quality.fx;
    if (quality.fx > 0 && !this.postTarget) {
      this.postTarget = new THREE.WebGLRenderTarget(Math.max(1, this.canvas.width), Math.max(1, this.canvas.height), { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
      this.postTarget.depthTexture = new THREE.DepthTexture(this.postTarget.width, this.postTarget.height, THREE.UnsignedIntType);
      this.postMaterial.uniforms.colorMap.value = this.postTarget.texture;
      this.postMaterial.uniforms.depthMap.value = this.postTarget.depthTexture;
    } else if (quality.fx === 0 && this.postTarget) {
      this.postTarget.dispose(); this.postTarget = null;
      this.postMaterial.uniforms.colorMap.value = null; this.postMaterial.uniforms.depthMap.value = null;
    }
    this.canvas.dataset.qualityTier = quality.name;
    this.canvas.dataset.postFx = quality.fx === 2 ? 'depth-dof,bloom,vignette' : quality.fx === 1 ? 'bloom,vignette' : 'off';
  }
  private checkQuality(frameDelta: number) {
    if (document.hidden || frameDelta <= 0) { this.slowTime = 0; this.qualityRecovery.reset(); return; }
    const ms = frameDelta * 1000;
    this.frameEma += (ms - this.frameEma) * .035;
    // Bound isolated resume gaps while still adapting to sustained severe stalls.
    const sample = Math.min(frameDelta, .25);
    this.slowTime = ms > 20 ? this.slowTime + sample : Math.max(0, this.slowTime - sample * 2);
    if (this.slowTime >= 2 && this.tier < QUALITY.length - 1) {
      this.tier++; this.slowTime = 0; this.qualityRecovery.reset(); this.configureQuality(); this.resize();
    }
    if (this.qualityRecovery.sample(frameDelta) && this.tier > 0) {
      this.tier--; this.slowTime = 0; this.configureQuality(); this.resize();
    }
    if (Math.abs(this.renderer.getPixelRatio() - Math.min(window.devicePixelRatio || 1, QUALITY[this.tier].cap)) > .01) this.resize();
  }
  private follow(s: GameState, dt: number) {
    const ease = this.reducedMotion || !this.cameraReady ? 1 : 1 - Math.exp(-dt * 11);
    if (!this.cameraReady || this.smoothPosition.distanceTo(new THREE.Vector2(s.x, s.y)) > 150) this.smoothPosition.set(s.x, s.y);
    else this.smoothPosition.lerp(new THREE.Vector2(s.x, s.y), ease);
    const x = this.smoothPosition.x, z = this.smoothPosition.y;
    const targetX = x + (s.moving ? s.faceX * 13 : 0), targetZ = z + (s.moving ? s.faceY * 9 : 0);
    const elevation = this.terrain.heightAt(x, z);
    if (!this.cameraReady) this.target.set(targetX, elevation + 7, targetZ);
    else this.target.lerp(this.scratch.set(targetX, elevation + 7, targetZ), ease);
    const distance = this.viewport.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.camera.position.copy(this.target).addScaledVector(FORWARD, distance);
    this.camera.lookAt(this.target); this.camera.updateMatrixWorld();
    // Clamp the perspective ground footprint, including its wider far edge.
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      this.ray.setFromCamera(new THREE.Vector2(sx, sy), this.camera);
      if (this.ray.ray.intersectPlane(this.groundPlane, this.scratch)) { minX = Math.min(minX, this.scratch.x); maxX = Math.max(maxX, this.scratch.x); minZ = Math.min(minZ, this.scratch.z); maxZ = Math.max(maxZ, this.scratch.z); }
    }
    const fixX = maxX - minX > OVERWORLD.width ? OVERWORLD.width / 2 - (minX + maxX) / 2 : minX < 0 ? -minX : maxX > OVERWORLD.width ? OVERWORLD.width - maxX : 0;
    const fixZ = maxZ - minZ > OVERWORLD.height ? OVERWORLD.height / 2 - (minZ + maxZ) / 2 : minZ < 0 ? -minZ : maxZ > OVERWORLD.height ? OVERWORLD.height - maxZ : 0;
    this.target.x += fixX; this.target.z += fixZ; this.camera.position.x += fixX; this.camera.position.z += fixZ;
    this.camera.lookAt(this.target); this.camera.updateMatrixWorld(); this.cameraReady = true;
    if (!this.reducedMotion && this.crashShake > 0) { this.camera.position.x += Math.sin(this.visualTime * 113) * this.crashShake; this.camera.position.z += Math.cos(this.visualTime * 97) * this.crashShake * .4; }
    // Controller already interpolates actors. Only the camera gets follow ease;
    // the taxi stays on the supplied collision/interaction position and surface.
    const actorElevation = this.terrain.heightAt(s.x, s.y);
    this.taxi.position.set(s.x, actorElevation + (s.moving && !this.reducedMotion ? Math.sin(this.visualTime * 26) * .16 : 0), s.y);
    const heading = -Math.atan2(s.faceY, s.faceX);
    const turn = Math.atan2(Math.sin(heading - this.heading), Math.cos(heading - this.heading));
    this.heading += turn * (this.reducedMotion ? 1 : 1 - Math.exp(-dt * 15)); this.taxi.rotation.y = this.heading;
    for (const wheel of this.wheels) wheel.rotation.y = this.reducedMotion || !s.moving ? 0 : this.visualTime * 16;
    this.taxiShadow.position.set(s.x + 3, actorElevation + .3, s.y + 2);
    this.sun.position.set(this.target.x - 220, 340, this.target.z - 180); this.sun.target.position.copy(this.target);
    this.postMaterial.uniforms.focus.value = this.camera.position.distanceTo(this.taxi.position) - 9;
    this.canvas.dataset.cameraX = this.target.x.toFixed(2); this.canvas.dataset.cameraY = this.target.z.toFixed(2);
  }
  private atmosphere() {
    const time = this.reducedMotion ? 0 : this.visualTime;
    // A slow dusk-to-night cycle with a bright initial golden hour.
    const daylight = .58 + Math.cos(time * Math.PI * 2 / 180) * .42;
    this.sky.setRGB(.16 + daylight * .30, .21 + daylight * .37, .30 + daylight * .34);
    const fog = this.scene.fog as THREE.Fog; fog.color.copy(this.sky);
    this.ambient.intensity = 1.25 + daylight * 1.25; this.sun.intensity = .65 + daylight * 1.9;
    this.sun.color.setRGB(1, .72 + daylight * .20, .57 + daylight * .23);
    this.headlights.intensity = 22 + (1 - daylight) * 40;
    const nearest = this.lightSources.map(light => ({ light, distance: (light.x - this.target.x) ** 2 + (light.y - this.target.z) ** 2 })).sort((a, b) => a.distance - b.distance);
    this.lights.forEach((light, index) => {
      const source = nearest[index];
      if (!source || source.distance > 240 ** 2) { light.intensity = 0; return; }
      light.position.set(source.light.x, source.light.height, source.light.y); light.color.setHex(source.light.color);
      light.intensity = source.light.strength * (.45 + (1 - daylight) * .6) * (this.reducedMotion ? 1 : .95 + Math.sin(time * 3 + source.light.x) * .05);
    });
    this.portals.forEach((portal, index) => {
      portal.group.visible = this.nearView(portal.x, portal.y, 90);
      portal.ring.rotation.z = this.reducedMotion ? 0 : Math.sin(time * .8 + index) * .08;
      portal.core.material.opacity = .40 + (this.reducedMotion ? 0 : Math.sin(time * 2.5) * .07);
      portal.group.position.y = this.terrain.heightAt(portal.x, portal.y) + (this.reducedMotion ? 0 : Math.sin(time * 2) * .8);
    });
    this.markers.forEach(marker => { marker.position.y = this.terrain.heightAt(marker.position.x, marker.position.z) + 27 + (this.reducedMotion ? 0 : Math.sin(time * 3) * 2); });
    for (const water of this.terrain.water) {
      const material = water.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissive.setHex(0x2b7890);
        material.emissiveIntensity = .045 + (this.reducedMotion ? 0 : Math.sin(time * 1.5) * .02);
        material.map?.offset.set(this.reducedMotion ? 0 : time * .027, this.reducedMotion ? 0 : Math.sin(time * .45) * .015);
      }
    }
  }
  private updateActors(s: GameState) {
    // The taxi owns movement; crew portraits are small billboard passengers and
    // stationary station greeters. They never participate in collision or saves.
    const greeters: { id: HeroId; x: number; y: number }[] = [
      { id: 'you', x: 256, y: 435 }, { id: 'joe', x: 277, y: 441 }, { id: 'matt', x: 296, y: 446 },
    ];
    for (const hero of greeters) this.billboard(`crew-${hero.id}`, hero.id, hero.x, hero.y, hero.id === 'you' ? .65 : 1);
    const driver = this.billboard('driver', s.active, s.x, s.y, s.active === 'you' ? .2 : .35);
    if (driver) {
      driver.shadow.visible = false;
      driver.group.position.copy(this.taxi.position); driver.group.position.y += 12;
      driver.group.position.addScaledVector(FORWARD, 4.7);
    }
    const peers = (s.coop?.remoteHeroes ?? []).filter(peer => peer.scene === s.scene && peer.room === s.room);
    this.syncRemotePeers(s);
    for (const peer of peers) {
      const taxi = this.remoteTaxi(peer.seat), elevation = this.terrain.heightAt(peer.x, peer.y);
      taxi.group.position.set(peer.x, elevation + (peer.moving && !this.reducedMotion ? Math.sin(this.visualTime * 26) * .16 : 0), peer.y);
      taxi.group.rotation.y = -Math.atan2(peer.faceY, peer.faceX);
      taxi.group.visible = this.nearView(peer.x, peer.y, 80);
      for (const wheel of taxi.wheels) wheel.rotation.y = this.reducedMotion || !peer.moving ? 0 : this.visualTime * 16;
      taxi.shadow.position.set(peer.x + 3, elevation + .3, peer.y + 2); taxi.shadow.visible = taxi.group.visible;
      const passenger = this.billboard(`peer-driver-${peer.seat}`, peer.hero.id, peer.x, peer.y, peer.hero.id === 'you' ? .2 : .35, peer.seat);
      if (passenger) {
        passenger.shadow.visible = false;
        passenger.group.position.copy(taxi.group.position); passenger.group.position.y += 12;
        passenger.group.position.addScaledVector(FORWARD, 4.7);
      }
    }
    const liveEnemies = new Set(s.enemies.filter(enemy => enemy.hp > 0).map(enemy => `enemy-${enemy.id}`));
    for (const key of [...this.billboards.keys()]) if (key.startsWith('enemy-') && !liveEnemies.has(key)) this.removeBillboard(key);
    for (const enemy of s.enemies) if (enemy.hp > 0) {
      const actor = this.billboard(`enemy-${enemy.id}`, enemy.sprite, enemy.x, enemy.y, enemy.radius > 10 ? 1.5 : 1);
      if (actor) for (const sprite of actor.sprites) sprite.material.color.setHex(enemy.hitTimer > 0 ? 0xffc5aa : 0xffffff);
    }
    for (const prop of OVERWORLD.props) if (prop.kind === 'npc') this.billboard(prop.id, prop.label === 'Jon' ? 'jon' : 'alex', prop.x + prop.w / 2, prop.y + prop.h);
  }
  private updateEffects(s: GameState, dt: number) {
    for (const burst of this.bursts) burst.age += dt;
    this.bursts = this.bursts.filter(burst => burst.age < .48);
    let index = 0;
    const particle = (x: number, y: number, z: number, size: number, color: number) => {
      if (index >= 96) return;
      this.dummy.position.set(x, y, z); this.dummy.rotation.set(x, y, z); this.dummy.scale.setScalar(size); this.dummy.updateMatrix();
      this.effectMesh.setMatrixAt(index, this.dummy.matrix); this.effectMesh.setColorAt(index, new THREE.Color(color)); index++;
    };
    if (!this.reducedMotion && s.moving) {
      const base = this.terrain.heightAt(s.x, s.y);
      for (let k = 0; k < 12; k++) {
        const life = (this.visualTime * 2 + k / 12) % 1;
        const dx = s.faceX * (16 + life * 23), dz = s.faceY * (16 + life * 23);
        particle(s.x - dx + Math.sin(k * 2.4) * life * 9, base + 1 + life * 4, s.y - dz + Math.cos(k * 2.4) * life * 9, (1 - life) * 1.4, 0xb6ac83);
      }
    }
    if (!this.reducedMotion) for (const burst of this.bursts) for (let k = 0; k < 8; k++) {
      const angle = k * Math.PI / 4, spread = burst.age * 50;
      particle(burst.x + Math.cos(angle) * spread, this.terrain.heightAt(burst.x, burst.y) + 8 + Math.sin(burst.age * 6) * 12, burst.y + Math.sin(angle) * spread, (1 - burst.age / .48) * 1.5, burst.color);
    }
    if (s.ambientTaxiWrecked && this.nearView(AMBIENT_TAXI.x, AMBIENT_TAXI.y, 80)) {
      for (let k = 0; k < 6; k++) {
        const life = ((this.reducedMotion ? 0 : s.time) * .42 + k / 6) % 1;
        particle(AMBIENT_TAXI.x + Math.sin(s.time + k) * life * 7, this.terrain.heightAt(AMBIENT_TAXI.x, AMBIENT_TAXI.y) + 19 + life * 30, AMBIENT_TAXI.y + life * 3, 2 + life * 3, 0x78817d);
      }
    }
    const crashAge = s.ambientTaxiGag - TAXI_ROCK_IMPACT;
    if (!this.reducedMotion && crashAge >= 0 && crashAge < .7) for (let k = 0; k < 12; k++) {
      const angle = k * 2.4, spread = crashAge * (25 + k % 5 * 9);
      particle(AMBIENT_TAXI.x + Math.cos(angle) * spread, this.terrain.heightAt(AMBIENT_TAXI.x, AMBIENT_TAXI.y) + 12 + Math.sin(crashAge * 4) * 13, AMBIENT_TAXI.y + Math.sin(angle) * spread, (1 - crashAge / .7) * (k % 3 ? 3 : 1), k % 3 ? 0xb4a482 : 0xffdda0);
    }
    for (const pickup of availablePickups(s)) {
      if (Math.hypot(pickup.x - s.x, pickup.y - s.y) > 80 || !this.nearView(pickup.x, pickup.y, 20)) continue;
      particle(pickup.x, this.terrain.heightAt(pickup.x, pickup.y) + 6 + (this.reducedMotion ? 0 : Math.sin(s.time * 3 + pickup.x) * 1.5), pickup.y, 1.3, pickup.kind === 'trinket' ? 0xedc3fa : pickup.kind === 'lore' ? 0xb9dfff : 0xffe3a3);
    }
    if (!this.reducedMotion) {
      for (const bird of roadsideBirds(s)) if (this.nearView(bird.x, bird.y, 20)) {
        const ground = this.terrain.heightAt(bird.x, bird.y) + 2 + bird.height;
        particle(bird.x, ground, bird.y, 1.2, 0x36434b); particle(bird.x - 2, ground + bird.wing, bird.y, .9, 0x36434b); particle(bird.x + 2, ground + bird.wing, bird.y, .9, 0x36434b);
      }
      for (let k = 0; k < 14; k++) {
        const x = (k * 83 + s.time * 7) % OVERWORLD.width, y = 390 + (k * 23 + s.time * 2) % 200;
        if (this.nearView(x, y, 20)) particle(x, this.terrain.heightAt(x, y) + 4 + Math.sin(s.time + k) * 2, y, .6, k % 2 ? 0xbbaa71 : 0xcf9866);
      }
    }
    for (const shot of s.projectiles) particle(shot.x, this.terrain.heightAt(shot.x, shot.y) + 10, shot.y, shot.radius, shot.owner === 'enemy' ? 0xec9aaf : 0xa3eddd);
    this.effectMesh.count = index; this.effectMesh.instanceMatrix.needsUpdate = true;
    if (this.effectMesh.instanceColor) this.effectMesh.instanceColor.needsUpdate = true;
  }

  draw(s: GameState, dt = 1 / 60, frameDelta = dt) {
    if (this.disposed || this.contextLost || this.renderer.getContext().isContextLost()) throw new Error('The 3D graphics context is unavailable');
    const started = performance.now();
    this.checkQuality(dt > 0 ? frameDelta : 0); dt = clamp(dt, 0, .05); this.visualTime += dt;
    this.crashShake = Math.max(0, this.crashShake - dt * 14);
    this.follow(s, dt); this.atmosphere(); this.updateActors(s); this.updateDressing(s); this.updateEffects(s, dt);
    this.renderer.info.reset();
    if (this.postTarget) {
      this.renderer.setRenderTarget(this.postTarget); this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null); this.renderer.render(this.postScene, this.postCamera);
    } else this.renderer.render(this.scene, this.camera);
    const renderMs = performance.now() - started; this.renderEma += (renderMs - this.renderEma) * .08;
    this.canvas.dataset.frameMs = (frameDelta * 1000).toFixed(3); this.canvas.dataset.renderMs = renderMs.toFixed(3);
    this.canvas.dataset.frameEmaMs = this.frameEma.toFixed(3); this.canvas.dataset.renderEmaMs = this.renderEma.toFixed(3);
    this.canvas.dataset.drawCalls = `${this.renderer.info.render.calls}`; this.canvas.dataset.triangles = `${this.renderer.info.render.triangles}`;
  }
  presentation(s: GameState): RenderPresentation {
    const labels: RenderLabel[] = [];
    const add = (id: string | number, text: string, x: number, z: number, height: number, kind: RenderLabel['kind'], color?: string, opacity?: number) => {
      const point = this.scratch.set(x, this.terrain.heightAt(x, z) + height, z).project(this.camera);
      const screenX = (point.x + 1) / 2, screenY = (1 - point.y) / 2;
      if (point.z < -1 || point.z > 1 || screenX < .02 || screenX > .98 || screenY < .05 || screenY > .95) return;
      labels.push({ id, text, x: screenX, y: screenY, kind, color, opacity });
    };
    for (const location of LOCATIONS) if (Math.hypot(s.x - location.x, s.y - location.y) < 140) add(location.id, location.locked ? `${location.name} · Taken over` : location.name, location.x, location.y, location.locked ? 54 : 28, location.locked ? 'locked' : 'location');
    for (const prop of OVERWORLD.props) if (prop.label && prop.kind === 'station' && Math.hypot(s.x - prop.x - prop.w / 2, s.y - prop.y - prop.h) < 165) add(prop.id, prop.label, prop.x + prop.w / 2, prop.y + prop.h / 2, 77, 'hub');
    for (const prop of OVERWORLD.props) if (prop.label && ['diner', 'sign', 'vending'].includes(prop.kind) && Math.hypot(s.x - prop.x - prop.w / 2, s.y - prop.y - prop.h) < 110) add(prop.id, prop.label, prop.x + prop.w / 2, prop.y + prop.h, prop.kind === 'diner' ? 67 : 38, 'hub');
    if (s.ambientTaxiGag >= TAXI_ROCK_IMPACT && s.ambientTaxiGag < 3.5) add('cab-driver', 'My cab!', AMBIENT_TAXI.x, AMBIENT_TAXI.y, 42, 'caption');
    for (const floater of s.floaters) add(floater.id, floater.text, floater.x, floater.y, 28, 'floater', floater.color, Math.min(1, floater.ttl * 4));
    for (const peer of s.coop?.remoteHeroes ?? []) if (peer.scene === s.scene && peer.room === s.room) add(`peer-${peer.seat}`, peer.name, peer.x, peer.y, 34, 'hub', '#b0f3d1');
    const focus = this.scratch.set(s.x, this.terrain.heightAt(s.x, s.y), s.y).project(this.camera);
    return { focus: { x: (focus.x + 1) / 2, y: (1 - focus.y) / 2 }, camera: { x: this.target.x - this.viewport.width / 2, y: this.target.z - this.viewport.height / 2, width: this.viewport.width, height: this.viewport.height }, labels };
  }
  onEvent(_s: GameState, event: GameEvent) {
    if (event.type === 'ambient-taxi-crash') { this.crashShake = 3; this.bursts.push({ x: event.x, y: event.y, age: 0, color: 0xffdfa4 }); }
    if (event.type === 'hit' || event.type === 'kill') {
      this.bursts.push({ x: event.x, y: event.y, age: 0, color: event.type === 'hit' ? 0xffd9aa : 0xc5a1e2 });
      if (this.bursts.length > 8) this.bursts.shift();
    }
  }
  reset() { this.cameraReady = false; this.slowTime = 0; this.qualityRecovery.reset(); this.bursts = []; }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.resizeObserver?.disconnect(); window.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('resize', this.resize); this.motionQuery.removeEventListener('change', this.motionChanged);
    this.canvas.removeEventListener('webglcontextlost', this.loseContext);
    this.images.forEach(image => { image.onload = null; }); this.images = [];
    for (const seat of this.remoteTaxis.keys()) this.removeRemoteTaxi(seat);
    for (const seat of this.remoteAvatarSheets.keys()) this.releaseRemoteAvatarSheets(seat);
    this.remoteAvatars.clear();
    for (const key of [...this.billboards.keys()]) this.removeBillboard(key);
    if (this.terrain) { this.scene.remove(this.terrain.group); this.terrain.dispose(); }
    const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>();
    for (const scene of [this.scene, this.postScene]) scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        if (object instanceof THREE.InstancedMesh) object.dispose();
        geometries.add(object.geometry);
        const objectMaterials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of objectMaterials) { materials.add(material); if ('map' in material && material.map instanceof THREE.Texture) textures.add(material.map); }
      }
    });
    for (const geometry of Object.values(this.geometries)) geometries.add(geometry);
    this.materials.forEach(material => materials.add(material)); this.sheets.forEach(sheet => textures.add(sheet.texture)); this.avatarSheets.forEach(sheet => textures.add(sheet.texture));
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
    this.sun.shadow.dispose(); this.postTarget?.dispose(); this.postTarget = null;
    this.scene.clear(); this.postScene.clear(); this.renderer.dispose();
    if (!this.renderer.getContext().isContextLost()) this.renderer.forceContextLoss();
  }
}
