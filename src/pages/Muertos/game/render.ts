// Draws Muertos like a PS1 game: a low-res frame, wobbly snapped vertices,
// close fog, and 15-bit colour with a dither. The town's lighting is baked
// into its vertex colours from the moon and the lanterns; zombies and your
// hands are lit live.
import * as THREE from "three";
import {
  at,
  BASE,
  BOX_SPOT,
  CELL,
  COLS,
  DOORS,
  doorCenter,
  floorAt,
  GRID,
  isDoor,
  isHouse,
  isWalkChar,
  LAMPS,
  PAP_SPOT,
  PERK_SPOTS,
  PERKS,
  ROWS,
  SPAWNS,
  TOP,
  WALLBUYS,
} from "./map";
import {
  armsGeometry,
  bottleGeometry,
  boxBase,
  boxLid,
  C,
  cannon,
  espadana,
  garita,
  gateDoors,
  gunGeometry,
  knifeGeometry,
  cistern,
  dome,
  lighthouse,
  merge,
  paint,
  palm,
  papMachine,
  perkMachine,
  PlayerModel,
  rubble,
  statue,
  tomb,
  umbrella,
  ZombieModel,
} from "./models";
import { rayWall } from "./map";
import { GUN_Y, mulberry32, rayZombie, WINDOW_BOARDS, type Ev, type Game, type PowerKind, type Zombie } from "./sim";
import { atlasTexture, cathedralTexture, chalkTexture, churchTexture, flashTexture, glowTexture, perkTexture, powerTexture, signTexture, TILE, tileUV } from "./textures";
import { WEAPONS, type WeaponId } from "./weapons";

const FOG = new THREE.Color("#1a1c36");
const PIXELS = 320 * 240;
// Pixel budgets, from full quality down.
const QUALITY = [1, 0.7, 0.5];

// Every material snaps its vertices to the pixel grid, the PS1 wobble.
const snap = { value: new THREE.Vector2(160, 120) };
function psx<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = snap;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec2 uSnap;")
      .replace("#include <project_vertex>", "#include <project_vertex>\ngl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;");
  };
  return m;
}
const lambert = (o: THREE.MeshLambertMaterialParameters) => psx(new THREE.MeshLambertMaterial(o));
const basic = (o: THREE.MeshBasicMaterialParameters) => psx(new THREE.MeshBasicMaterial(o));

// Top-down, buildings between the camera and the player are cut away in a
// dithered hole so you can always see yourself.
// Top-down also squashes the town to about half height above the ground
// floor, so the houses don't hide the streets.
const SQUASH_FROM = 3.2;
const SQUASH = 0.35;
const squashY = (y: number, on: boolean) => (on && y > SQUASH_FROM ? SQUASH_FROM + (y - SQUASH_FROM) * SQUASH : y);
const cut = {
  uCutCam: { value: new THREE.Vector3() },
  uCutPlayer: { value: new THREE.Vector3() },
  uCutR: { value: 0 },
  uSquash: { value: 1 },
  uCutRoof: { value: 0 },
};

// Silhouettes: drawn only where something in front hides them, before the
// real models, so they show through roofs and walls but not over the
// models themselves.
const ghostMaterial = (color: string) => new THREE.MeshBasicMaterial({ color, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false });
function cutaway<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = snap;
    Object.assign(shader.uniforms, cut);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform vec2 uSnap;\nuniform float uSquash;\nvarying vec3 vCutWorld;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        {
          float wy = (modelMatrix * vec4(transformed, 1.0)).y;
          if (wy > ${SQUASH_FROM.toFixed(2)}) transformed.y -= (wy - ${SQUASH_FROM.toFixed(2)}) * (1.0 - uSquash);
        }`)
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\ngl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;"
      );
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uCutCam;\nuniform vec3 uCutPlayer;\nuniform float uCutR;\nuniform float uCutRoof;\nvarying vec3 vCutWorld;").replace(
      "void main() {",
      `void main() {
        if (uCutR > 0.0 && vCutWorld.y > 0.3) {
          vec3 ab = uCutPlayer - uCutCam;
          float t = clamp(dot(vCutWorld - uCutCam, ab) / dot(ab, ab), 0.0, 1.0);
          float d = length(vCutWorld - (uCutCam + ab * t));
          // Only what's on the camera's side of the player.
          if (dot(vCutWorld - uCutPlayer, normalize(-ab)) > 0.6 && d < uCutR) {
            float checker = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
            if (d < uCutR * 0.72 || checker < 1.0) discard;
          }
          // Roofs and upper floors near you go see-through.
          if (uCutRoof > 0.0 && vCutWorld.y > max(uCutPlayer.y + 0.9, 4.0)) {
            float dh = length(vCutWorld.xz - uCutPlayer.xz);
            // Mostly clear near you, half and half toward the edge.
            vec2 px = mod(floor(gl_FragCoord.xy), 2.0);
            bool keepOne = px.x + px.y * 2.0 < 0.5;
            if (dh < uCutRoof * 0.6 ? !keepOne : dh < uCutRoof && px.x + px.y < 1.0 || dh < uCutRoof && px.x + px.y > 1.5) discard;
          }
        }`
    );
  };
  return m;
}

// ---------- baked light ----------

const AMB = new THREE.Color(0.2, 0.21, 0.36);
const MOON_DIR = new THREE.Vector3(-0.45, 0.72, -0.52).normalize();
const MOON = new THREE.Color(0.36, 0.42, 0.68);

function lightAt(x: number, y: number, z: number, nx: number, ny: number, nz: number, out: THREE.Color) {
  out.copy(AMB);
  const md = Math.max(0, nx * MOON_DIR.x + ny * MOON_DIR.y + nz * MOON_DIR.z);
  out.r += MOON.r * md;
  out.g += MOON.g * md;
  out.b += MOON.b * md;
  for (const L of LAMPS) {
    const dx = L.x - x;
    const dy = L.y - y;
    const dz = L.z - z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > L.radius * L.radius) continue;
    const d = Math.sqrt(d2) || 1e-3;
    const f = (1 - d / L.radius) ** 2 * Math.max(0.15, (nx * dx + ny * dy + nz * dz) / d) * 2.4;
    out.r += L.color[0] * f;
    out.g += L.color[1] * f;
    out.b += L.color[2] * f;
  }
  return out;
}

// Triangles with uv and a lit colour on every vertex.
class Mesher {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  private tmp = new THREE.Color();

  // A quad from corner o along u (to the right, seen from the front) and v
  // (up), cut into nu x nv pieces so the light has somewhere to vary. f0/f1
  // pick a part of it, as fractions of u and v, for cutting holes.
  quad(
    o: THREE.Vector3,
    u: THREE.Vector3,
    v: THREE.Vector3,
    rect: [number, number, number, number],
    base: THREE.Color,
    nu = 2,
    nv = 2,
    f0: [number, number] = [0, 0],
    f1: [number, number] = [1, 1],
    dark = 1
  ) {
    const n = new THREE.Vector3().crossVectors(u, v).normalize();
    const pt = (a: number, b: number) => {
      const s = f0[0] + (f1[0] - f0[0]) * a;
      const t = f0[1] + (f1[1] - f0[1]) * b;
      const x = o.x + u.x * s + v.x * t;
      const y = o.y + u.y * s + v.y * t;
      const z = o.z + u.z * s + v.z * t;
      const c = lightAt(x, y, z, n.x, n.y, n.z, this.tmp);
      // Darker toward the ground in front, a cheap bit of occlusion.
      let ao = 1;
      if (n.y < 0.5) {
        const up = y - floorAt(x + n.x * 0.3, z + n.z * 0.3);
        if (up < 1.2) ao = 0.7 + Math.max(0, up / 1.2) * 0.3;
      }
      return [x, y, z, rect[0] + (rect[2] - rect[0]) * s, rect[1] + (rect[3] - rect[1]) * t, base.r * c.r * ao * dark, base.g * c.g * ao * dark, base.b * c.b * ao * dark];
    };
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = pt(i / nu, j / nv);
        const b = pt((i + 1) / nu, j / nv);
        const c = pt((i + 1) / nu, (j + 1) / nv);
        const d = pt(i / nu, (j + 1) / nv);
        for (const p of [a, b, c, a, c, d]) {
          this.pos.push(p[0], p[1], p[2]);
          this.uv.push(p[3], p[4]);
          this.col.push(p[5], p[6], p[7]);
        }
      }
    }
  }

  // Bake light into an already coloured, world-placed geometry.
  static bake(geo: THREE.BufferGeometry, glow = 0) {
    const pos = geo.getAttribute("position");
    const nor = geo.getAttribute("normal");
    const col = geo.getAttribute("color");
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      lightAt(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i), c);
      col.setXYZ(i, col.getX(i) * (c.r + glow), col.getY(i) * (c.g + glow), col.getZ(i) * (c.b + glow));
    }
    return geo;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- the town's layout ----------

const PALETTE = ["#e9b64a", "#e0795a", "#5aa6a6", "#5b86cc", "#e28fae", "#8fbf5e", "#efdcb6", "#d0663d", "#a07ccc", "#f0de6a", "#6fc0d8", "#f19a6a"];
const hash = (a: number, b: number) => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
// Houses come in blocks of a few cells, each its own colour and height.
function house(c: number, r: number) {
  const bc = Math.floor((c + (r % 2)) / 3);
  const br = Math.floor(r / 3);
  const k = hash(bc, br);
  const heights = [7.8, 8.6, 9.4, 11.6];
  return { color: C(PALETTE[Math.floor(k * PALETTE.length)]), h: heights[Math.floor(hash(br, bc) * heights.length)], id: bc * 100 + br };
}

const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const STANDING = new Set(["k", "n", "T", "M", "F", "o", "Q", "J", "K", "D", "H"]);
const STONE = new Set(["W", "7", "S", "A", "Y", "R"]);

// A cell's floor, low and high (they differ on ramps), for walkable cells
// and doors; what props stand on; the top of walls and houses.
function span(c: number, r: number): { lo: number; hi: number; open: boolean } {
  const ch = at(c, r);
  if (ch === "x") return { lo: -18, hi: -18, open: true };
  const i = r * COLS + c;
  if (isWalkChar(ch) || isDoor(ch) || ch === "m") {
    const a = floorAt((c + 0.5) * CELL, r * CELL + 0.001);
    const b = floorAt((c + 0.5) * CELL, (r + 1) * CELL - 0.001);
    return { lo: Math.min(a, b, BASE[i]), hi: Math.max(a, b, BASE[i]), open: true };
  }
  if (STANDING.has(ch)) return { lo: BASE[i], hi: BASE[i], open: true };
  const top = isHouse(ch) ? house(c, r).h : TOP[i];
  return { lo: top, hi: top, open: false };
}

// The floor under a solid cell: whatever its open neighbours stand on.
function floorOf(c: number, r: number) {
  for (const [dc, dr] of DIRS) {
    const ch = at(c + dc, r + dr);
    if (isWalkChar(ch)) return ch;
  }
  return "P";
}

// The church front's first column, for its texture.
const CHURCH_C0 = (() => {
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (GRID[r][c] === "C") return c;
  return 0;
})();

// Gates in walls get a stone lintel: its bottom and top.
const LINTELS: Record<string, [number, number]> = { b: [5, 6.5], c: [5, 6.5], w: [3.6, 4.5] };
export const GATE_HEIGHT: Record<string, number> = { b: 5, c: 5, w: 3.6 };

// Where roofs fill in beyond the map: east of it, and south of the city.
function skirtAt(x: number, z: number) {
  return x >= COLS * CELL && z >= 11 * CELL && z < 55 * CELL;
}

const CATHEDRAL_R0 = (() => {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (GRID[r][c] === "Z") return r;
  return 0;
})();

const FORT_FLOOR = new Set(["P", "U", "V", "t", "=", "r", "v"]);
const FLOOR_TILE: Record<string, number> = { ".": TILE.cobbles, p: TILE.plaza, g: TILE.grass, y: TILE.grass, d: TILE.earth, e: TILE.path, m: TILE.earth };
const floorTile = (ch: string) => FLOOR_TILE[ch] ?? (FORT_FLOOR.has(ch) ? TILE.fortFloor : TILE.fortFloor);

type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; r: number; g: number; b: number; grav: number };
type Tracer = { line: THREE.Line; t: number };
type Bolt = { sprite: THREE.Sprite; from: THREE.Vector3; to: THREE.Vector3; t: number };
type FlyBoard = { mesh: THREE.Mesh; vx: number; vy: number; vz: number; spin: THREE.Vector3; t: number };

export type ViewMode = "fps" | "top";

export type View = {
  bob: number;
  kick: number;
  swayX: number;
  swayY: number;
  flash: number;
  deathT: number;
  shake: number;
  snap?: boolean;
};

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.08, 500);
  private viewScene = new THREE.Scene();
  private viewCam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  private target: THREE.WebGLRenderTarget;
  private post: { scene: THREE.Scene; camera: THREE.OrthographicCamera; mat: THREE.ShaderMaterial };
  private disposables: { dispose(): void }[] = [];
  private sky = new THREE.Group();
  private sea!: THREE.Mesh;
  private seaBase!: Float32Array;
  private beam!: THREE.Mesh;
  private boxBeam!: THREE.Mesh;
  private lamps: THREE.PointLight[] = [];
  private flashLight = new THREE.PointLight("#ffc070", 0, 12, 1.5);

  private zombieMat = lambert({ vertexColors: true });
  private eyeMat = basic({ color: "#ffb020" });
  private zombieGhost = ghostMaterial("#c0281e");
  private zombies = new Map<number, ZombieModel>();
  private spare: ZombieModel[] = [];
  private modelSeed = 1;

  private doors = new Map<string, { parts: THREE.Object3D[]; openT: number; kind: "rubble" | "gate" }>();
  private boards: THREE.Mesh[][] = [];
  private boardGeo = new THREE.BoxGeometry(1.6, 0.2, 0.06);
  private boardMat: THREE.Material;
  private flying: FlyBoard[] = [];

  private boxLid!: THREE.Object3D;
  private boxGun = new THREE.Mesh(undefined, lambert({ vertexColors: true, emissive: new THREE.Color("#302040") }));
  private boxCycle = 0;
  private boxShown: WeaponId | null = null;
  private papGlow!: THREE.Sprite;
  private papBolts!: THREE.LineSegments;

  private drops = new Map<number, THREE.Group>();
  private powerTex: Record<PowerKind, THREE.Texture>;
  private dropGlow: THREE.Texture;

  private particles: Particle[] = [];
  private points!: THREE.Points;
  private tracers: Tracer[] = [];
  private bolts: Bolt[] = [];
  private boltTex: THREE.Texture;

  // Your hands.
  private hands = new THREE.Group();
  private gun = new THREE.Mesh(undefined, lambert({ vertexColors: true }));
  private gunKey = "";
  private gunCache = new Map<string, { geo: THREE.BufferGeometry; muzzle: THREE.Vector3 }>();
  private armR: THREE.Mesh;
  private armL: THREE.Mesh;
  private knife: THREE.Group;
  private bottle: THREE.Group;
  private bottleColor = "";
  private flash: THREE.Sprite;
  private viewHemi = new THREE.HemisphereLight("#9aa6ff", "#2a2030", 1.2);
  private viewKey = new THREE.DirectionalLight("#ffd0a0", 1.4);
  private swapFrom = "";
  private mode: ViewMode = "fps";
  private player!: PlayerModel;
  private playerGunKey = "";
  private laser!: THREE.Line;
  private worldFlash!: THREE.Sprite;
  private aspect = 1;
  private topDist = 30;
  private camFollow = new THREE.Vector3();
  private quality = 0;
  private cssW = 1;
  private cssH = 1;
  private deadFall = 0;
  private lampGlow!: THREE.Sprite;
  private lampY = 13.8;
  private camY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.gl.setPixelRatio(1);
    this.gl.autoClear = false;
    this.target = new THREE.WebGLRenderTarget(320, 240, { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
    this.post = this.makePost();
    this.scene.background = FOG;
    this.scene.fog = new THREE.Fog(FOG, 18, 95);
    this.camera.rotation.order = "YXZ";

    const hemi = new THREE.HemisphereLight("#7d88cc", "#2a2030", 1.1);
    const moon = new THREE.DirectionalLight("#b8c4ff", 1.0);
    moon.position.copy(MOON_DIR).multiplyScalar(50);
    this.scene.add(hemi, moon, this.flashLight);
    // The nearest lanterns light the zombies; they're moved about each frame.
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight("#ffa050", 0, 10, 1.2);
      this.lamps.push(l);
      this.scene.add(l);
    }

    this.boardMat = lambert({ map: atlasTexture(), color: "#c9a27a" });
    const boardTex = (this.boardMat as THREE.MeshLambertMaterial).map!;
    const planks = tileUV(TILE.planks);
    boardTex.repeat.set(planks[2] - planks[0], planks[3] - planks[1]);
    boardTex.offset.set(planks[0], planks[1]);
    this.disposables.push(this.boardMat, boardTex);

    this.powerTex = { ammo: powerTexture("ammo"), insta: powerTexture("insta"), double: powerTexture("double"), nuke: powerTexture("nuke") };
    this.dropGlow = glowTexture("rgba(120,255,120,0.9)");
    this.boltTex = glowTexture("rgba(140,255,120,1)");
    this.disposables.push(...Object.values(this.powerTex), this.dropGlow, this.boltTex);

    this.buildSky();
    this.buildSea();
    this.buildTown();
    this.buildProps();
    this.buildLamps();
    this.buildDoors();
    this.buildWindows();
    this.buildBox();
    this.buildPerks();
    this.buildPap();
    this.buildWallBuys();
    this.buildParticles();

    // Hands.
    const arms = armsGeometry();
    const skinMat = lambert({ vertexColors: true });
    this.armR = new THREE.Mesh(arms.right, skinMat);
    this.armL = new THREE.Mesh(arms.left, skinMat);
    this.knife = new THREE.Group();
    this.knife.add(new THREE.Mesh(knifeGeometry(), skinMat));
    const kArm = new THREE.Mesh(arms.right, skinMat);
    this.knife.add(kArm);
    this.bottle = new THREE.Group();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flash.scale.setScalar(0.16);
    this.gun.add(this.armR, this.armL, this.flash);
    this.hands.add(this.gun, this.knife, this.bottle);
    this.hands.scale.setScalar(0.85);
    this.viewCam.add(this.hands);
    this.viewKey.position.set(-1, 2, 1);
    this.viewScene.add(this.viewCam, this.viewHemi, this.viewKey);

    // You, seen from above.
    const gunMat = lambert({ vertexColors: true });
    this.player = new PlayerModel(this.zombieMat, gunMat, ghostMaterial("#ffd84a"));
    this.player.root.visible = false;
    this.scene.add(this.player.root);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    this.laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: "#ff3a2a", transparent: true, opacity: 0.45, depthWrite: false }));
    this.laser.frustumCulled = false;
    this.laser.visible = false;
    this.worldFlash = new THREE.Sprite(this.flash.material);
    this.worldFlash.scale.setScalar(1.1);
    this.worldFlash.visible = false;
    this.scene.add(this.laser, this.worldFlash);
  }

  private makePost() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.target.texture } },
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        float bayer(vec2 p) {
          int x = int(mod(p.x, 4.0));
          int y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
          return m[i] / 16.0 - 0.5;
        }
        void main() {
          vec4 c = linearToOutputTexel(vec4(texture2D(tDiffuse, vUv).rgb, 1.0));
          vec3 o = c.rgb + bayer(gl_FragCoord.xy) / 31.0;
          o = floor(o * 31.0 + 0.5) / 31.0;
          gl_FragColor = vec4(o, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    return { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
  }

  resize(width = this.cssW, height = this.cssH) {
    this.cssW = width;
    this.cssH = height;
    const scale = Math.sqrt((PIXELS * QUALITY[this.quality]) / Math.max(1, width * height));
    const w = Math.max(64, Math.round(width * scale));
    const h = Math.max(48, Math.round(height * scale));
    this.gl.setSize(w, h, false);
    this.target.setSize(w, h);
    snap.value.set(w / 2, h / 2);
    const aspect = w / h;
    this.aspect = aspect;
    this.camera.aspect = aspect;
    // Narrow screens see a bit wider.
    this.camera.fov = aspect < 1 ? 84 : 72;
    this.camera.updateProjectionMatrix();
    this.viewCam.aspect = aspect;
    this.viewCam.fov = aspect < 1 ? 70 : 58;
    // Tall screens get a slightly smaller gun, so it doesn't fill the view.
    this.hands.scale.setScalar(aspect < 1 ? 0.72 : 0.85);
    this.viewCam.updateProjectionMatrix();
    this.frameTop();
  }

  // How far back the top-down camera sits so the view is about as wide as
  // a street on a phone, and a whole plaza on a monitor.
  private frameTop() {
    if (this.mode !== "top") return;
    const vfov = 38;
    this.camera.fov = vfov;
    this.camera.near = 1;
    this.camera.far = 400;
    this.camera.updateProjectionMatrix();
    const width = this.aspect < 1 ? 12.5 : 24;
    const hfov = 2 * Math.atan(Math.tan(((vfov / 2) * Math.PI) / 180) * this.aspect);
    this.topDist = width / 2 / Math.tan(hfov / 2);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.topDist + 8;
    fog.far = this.topDist + 60;
  }

  setView(mode: ViewMode) {
    this.mode = mode;
    const top = mode === "top";
    this.player.root.visible = top;
    cut.uCutR.value = top ? 3.2 : 0;
    cut.uSquash.value = top ? SQUASH : 1;
    cut.uCutRoof.value = top ? 7 : 0;
    // Things drawn outside the squashed town move down to match.
    this.beam.position.y = squashY(this.lampY, top);
    this.lampGlow.position.y = squashY(this.lampY, top);
    this.boxBeam.visible = !top;
    this.beam.visible = !top;
    if (!top) {
      const fog = this.scene.fog as THREE.Fog;
      fog.near = 18;
      fog.far = 95;
      this.camera.near = 0.08;
      this.camera.far = 500;
    }
    this.resize();
  }

  // 0 is full quality; each step down draws fewer pixels and less sea.
  setQuality(level: number) {
    this.quality = Math.max(0, Math.min(QUALITY.length - 1, level));
    this.resize();
  }
  get qualityLevel() {
    return this.quality;
  }

  // Where a point on screen (-1..1 each way) lands at gun height.
  groundPoint(nx: number, ny: number) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const t = (GUN_Y - ray.ray.origin.y) / (ray.ray.direction.y || -1e-6);
    return ray.ray.origin.clone().addScaledVector(ray.ray.direction, Math.max(0, t));
  }

  // ---------- sky and sea ----------

  private buildSky() {
    const sky = new THREE.SphereGeometry(400, 16, 10);
    const pos = sky.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    const top = C("#04040c");
    const mid = C("#11122a");
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / 400;
      const c = t < 0.04 ? FOG.clone() : t < 0.3 ? FOG.clone().lerp(mid, (t - 0.04) / 0.26) : mid.clone().lerp(top, (t - 0.3) / 0.7);
      col.set([c.r, c.g, c.b], i * 3);
    }
    sky.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const skyMesh = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    skyMesh.renderOrder = -10;
    const rnd = mulberry32(7);
    const stars = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      const a = rnd() * Math.PI * 2;
      const e = 0.1 + rnd() * 1.35;
      stars.set([Math.cos(a) * Math.cos(e) * 350, Math.sin(e) * 350, Math.sin(a) * Math.cos(e) * 350], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(stars, 3));
    const starPts = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: "#c9d2ff", size: 1, sizeAttenuation: false, fog: false, depthWrite: false }));
    starPts.renderOrder = -9;
    const moonTex = glowTexture("rgba(230,236,255,0.6)");
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true }));
    const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("rgba(255,255,250,1)"), fog: false, depthWrite: false, transparent: true }));
    const mp = MOON_DIR.clone().multiplyScalar(330);
    halo.position.copy(mp);
    halo.scale.setScalar(120);
    moonDisc.position.copy(mp);
    moonDisc.scale.setScalar(26);
    halo.renderOrder = moonDisc.renderOrder = -8;
    // Thin clouds drifting over the moon.
    const cloudTex = glowTexture("rgba(60,62,96,0.55)");
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false, transparent: true }));
      const a = rnd() * Math.PI * 2;
      s.position.set(Math.cos(a) * 280, 70 + rnd() * 90, Math.sin(a) * 280);
      s.scale.set(160 + rnd() * 120, 30 + rnd() * 20, 1);
      s.renderOrder = -7;
      this.sky.add(s);
    }
    this.sky.add(skyMesh, starPts, halo, moonDisc);
    this.scene.add(this.sky);
  }

  private buildSea() {
    const geo = new THREE.PlaneGeometry(800, 800, 48, 48).rotateX(-Math.PI / 2).translate(COLS, -17, ROWS);
    this.seaBase = Float32Array.from(geo.getAttribute("position").array as Float32Array);
    // The sea sits far below; it skips the fog so it still reads at night.
    this.sea = new THREE.Mesh(geo, lambert({ color: "#16304e", flatShading: true, emissive: new THREE.Color("#04081a"), fog: false }));
    this.scene.add(this.sea);

    // Rocks at the foot of the cliffs, wherever the map meets the sea.
    const rnd = mulberry32(31);
    const rockMat = lambert({ color: "#3a3834", flatShading: true });
    const rg = new THREE.IcosahedronGeometry(1, 0);
    const edge: [number, number, number, number][] = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const ch = GRID[r][c];
        if (ch === "x" || isHouse(ch)) continue;
        for (const [dc, dr] of DIRS) if (at(c + dc, r + dr) === "x") edge.push([c, r, dc, dr]);
      }
    for (let i = 0; i < 70 && edge.length; i++) {
      const [c, r, dc, dr] = edge[Math.floor(rnd() * edge.length)];
      const out = 1.5 + rnd() * 4;
      const rock = new THREE.Mesh(rg, rockMat);
      rock.scale.set(1.5 + rnd() * 3, 1 + rnd() * 2.5, 1.5 + rnd() * 3);
      rock.position.set((c + 0.5 + dc * 0.5) * CELL + dc * out, -17, (r + 0.5 + dr * 0.5) * CELL + dr * out);
      rock.rotation.set(rnd() * 3, rnd() * 3, 0);
      this.scene.add(rock);
    }
  }

  // ---------- the town ----------

  private buildTown() {
    const m = new Mesher();
    const church = new Mesher();
    const cathedral = new Mesher();
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const white = C("#ffffff");
    const stoneC = C("#f2ead8");
    const cliffC = C("#9a948a");
    // A stone (or cliff) face, cut into bands so the texture keeps its scale.
    const stoneFace = (bottom: THREE.Vector3, u: THREE.Vector3, y0: number, y1: number, tile: number, color: THREE.Color) => {
      for (let y = y0; y < y1 - 0.01; y += 2.2) {
        const t = Math.min(y1, y + 2.2);
        m.quad(bottom.clone().setY(y), u, V(0, t - y, 0), tileUV(tile), color, 2, 1);
      }
    };

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = GRID[r][c];
        if (ch === "x") continue;
        const x0 = c * CELL;
        const z0 = r * CELL;
        const me = span(c, r);
        const hs = isHouse(ch) ? house(c, r) : null;

        // Floors: walkable ground, ramps, doorways, the moat, and the ground
        // props stand on.
        if (me.open) {
          const fl = isWalkChar(ch) || ch === "m" ? ch : floorOf(c, r);
          const tint = fl === "." ? C("#e8ecff") : white;
          const ys = floorAt(x0 + 1, z0 + CELL - 0.001);
          const yn = floorAt(x0 + 1, z0 + 0.001);
          const flat = STANDING.has(ch) ? BASE[r * COLS + c] : null;
          m.quad(V(x0, flat ?? ys, z0 + CELL), V(CELL, 0, 0), V(0, flat === null ? yn - ys : 0, -CELL), tileUV(floorTile(fl)), tint, 2, 2);
        }
        if (ch === "L") {
          // Low walls under their top: the floor they sit on.
          const b = BASE[r * COLS + c];
          m.quad(V(x0, TOP[r * COLS + c], z0 + CELL), V(CELL, 0, 0), V(0, 0, -CELL), tileUV(TILE.fortWall), C("#f0e6d0"), 2, 2);
          void b;
        }

        for (const [dc, dr] of DIRS) {
          const n = span(c + dc, r + dr);
          const nch = at(c + dc, r + dr);
          const right = V(dr, 0, -dc);
          const bottom = V((c + 0.5) * CELL + dc * CELL * 0.5, 0, (r + 0.5) * CELL + dr * CELL * 0.5).addScaledVector(right, -CELL / 2);
          const u = right.clone().multiplyScalar(CELL);

          if (me.open) {
            // A terrace edge, or the cliff under anything at the sea's edge.
            const my = STANDING.has(ch) ? me.lo : me.lo;
            if (nch === "x") {
              stoneFace(bottom, u, -18, my, TILE.cliff, cliffC);
            } else if (n.open && n.hi < my - 0.3) {
              stoneFace(bottom, u, n.hi, my, ch === "g" || ch === "y" || ch === "e" ? TILE.cliff : TILE.fortWall, ch === "g" ? cliffC : stoneC);
            }
            continue;
          }

          const top = me.hi;
          const y0 = nch === "x" ? (hs ? 0 : -18) : n.lo;
          if (y0 >= top) continue;

          if (ch === "C" || ch === "Z") {
            // San José faces the plaza, the Cathedral faces Calle del
            // Cristo; their sides are plain.
            const front = ch === "C" ? dr === 1 : dc === 1;
            if (front && n.open) {
              const [i, len] = ch === "C" ? [c - CHURCH_C0, 8] : [r - CATHEDRAL_R0, 5];
              const rect: [number, number, number, number] = [i / len, 0, (i + 1) / len, 1];
              (ch === "C" ? church : cathedral).quad(bottom.clone(), u, V(0, top, 0), rect, white, 1, 6);
            } else m.quad(bottom.clone().setY(Math.max(0, y0)), u, V(0, top - Math.max(0, y0), 0), tileUV(TILE.plaster), white, 1, 3);
            continue;
          }
          if (ch === "L") {
            const b = BASE[r * COLS + c];
            if (nch === "x") stoneFace(bottom, u, -18, b, TILE.cliff, cliffC);
            stoneFace(bottom, u, Math.max(y0, nch === "x" ? b : y0), top, TILE.fortWall, C("#e6dcc8"));
            continue;
          }
          if (STONE.has(ch)) {
            // Casemates show arches and windows to the plaza; the rest is
            // plain masonry, over cliff where it meets the sea.
            if (nch === "x" && y0 < 0) stoneFace(bottom, u, y0, 0, TILE.cliff, cliffC);
            const from = nch === "x" ? Math.max(y0, 0) : y0;
            if ((ch === "A" || ch === "Y") && n.open && Math.abs(from) < 0.3) {
              if (ch === "Y") this.windowFacade(m, bottom.clone().setY(from), u, stoneC, TILE.stoneHole);
              else m.quad(bottom.clone().setY(from), u, V(0, 3.5, 0), tileUV(TILE.arcade), stoneC, 2, 2);
              stoneFace(bottom, u, from + 3.5, top, TILE.fortWall, stoneC);
            } else stoneFace(bottom, u, from, top, TILE.fortWall, ch === "S" ? stoneC : white);
            continue;
          }
          if (hs) {
            // Storeys: ground floor, upper floors, then the cornice.
            const yFrom = Math.max(0, y0);
            const k = hash(c * 3 + dc, r * 5 + dr);
            let y = 0;
            const storeys = top >= 11 ? 3 : 2;
            for (let st = 0; st < storeys; st++) {
              const t = y + 3.5;
              if (t > yFrom) {
                let tile: number = st === 0 ? (k < 0.45 ? TILE.doorGround : TILE.windowGround) : hash(r, c + st) < 0.5 ? TILE.balcony : TILE.shutters;
                if (st === 0 && ch !== "#") tile = TILE.windowGround;
                if (st === 0 && ch === "B") this.windowFacade(m, bottom, u, hs.color, TILE.windowHole);
                else m.quad(bottom.clone().setY(y), u, V(0, 3.5, 0), tileUV(tile), hs.color, 2, 2, [0, Math.max(0, (yFrom - y) / 3.5)], [1, 1]);
              }
              y = t;
            }
            if (top > y) m.quad(bottom.clone().setY(y), u, V(0, top - y, 0), tileUV(TILE.cornice), hs.color, 2, 1, [0, Math.max(0, (yFrom - y) / (top - y))], [1, 1]);
          }
        }

        // Tops: walls' walkways, masonry, and flat roofs with a
        // house-coloured tint, which top-down sees most of.
        if (me.open || ch === "L") continue;
        // A dark floor inside, for when the top-down cutaway looks in.
        {
          let lo = 0;
          for (const [dc, dr] of DIRS) {
            const n = span(c + dc, r + dr);
            if (n.open && at(c + dc, r + dr) !== "x") lo = Math.min(lo, n.lo);
          }
          m.quad(V(x0, lo, z0 + CELL), V(CELL, 0, 0), V(0, 0, -CELL), tileUV(TILE.plaster), C("#2a2420"), 1, 1, [0, 0], [1, 1], 0.4);
        }
        const topQ = V(x0, me.hi, z0 + CELL);
        if (STONE.has(ch)) m.quad(topQ, V(CELL, 0, 0), V(0, 0, -CELL), tileUV(TILE.fortFloor), C("#d8ccb0"), 1, 1);
        else if (ch === "C" || ch === "Z") m.quad(topQ, V(CELL, 0, 0), V(0, 0, -CELL), tileUV(TILE.plaster), C("#d6d2c8"), 1, 1);
        else if (hs) {
          const painted = hash(hs.id, 3) < 0.3;
          m.quad(topQ, V(CELL, 0, 0), V(0, 0, -CELL), tileUV(painted ? TILE.roofPainted : TILE.roof), painted ? white : C("#ffffff").lerp(hs.color, 0.2), 1, 1);
        }
      }
    }

    // Beyond the city's edge, more of the old town's roofs, so the world
    // doesn't just stop when seen from above.
    const rnd = mulberry32(77);
    for (let z = 0; z < ROWS * CELL + 60; z += CELL * 2) {
      for (let x = 0; x < COLS * CELL + 60; x += CELL * 2) {
        if (!skirtAt(x, z)) continue;
        const painted = rnd() < 0.3;
        const tint = painted ? white : C("#ffffff").lerp(C(PALETTE[Math.floor(rnd() * PALETTE.length)]), 0.2);
        m.quad(V(x, 8.6, z + CELL * 2), V(CELL * 2, 0, 0), V(0, 0, -CELL * 2), tileUV(painted ? TILE.roofPainted : TILE.roof), tint, 1, 1);
      }
    }

    // Stone lintels over the gates through the walls.
    for (const d of DOORS) {
      const lintel = LINTELS[d.id];
      if (!lintel) continue;
      const [yb, yt] = lintel;
      const xs = d.cells.map(([c]) => c);
      const zs = d.cells.map(([, r]) => r);
      const x0 = Math.min(...xs) * CELL;
      const x1 = (Math.max(...xs) + 1) * CELL;
      const z0 = Math.min(...zs) * CELL;
      const z1 = (Math.max(...zs) + 1) * CELL;
      const uv = tileUV(TILE.fortWall);
      m.quad(V(x0, yb, z1), V(x1 - x0, 0, 0), V(0, yt - yb, 0), uv, white, 2, 1);
      m.quad(V(x1, yb, z0), V(x0 - x1, 0, 0), V(0, yt - yb, 0), uv, white, 2, 1);
      m.quad(V(x1, yb, z1), V(0, 0, z0 - z1), V(0, yt - yb, 0), uv, white, 2, 1);
      m.quad(V(x0, yb, z0), V(0, 0, z1 - z0), V(0, yt - yb, 0), uv, white, 2, 1);
      m.quad(V(x0, yb, z0), V(x1 - x0, 0, 0), V(0, 0, z1 - z0), uv, C("#8a7a5a"), 2, 2);
      m.quad(V(x0, yt, z1), V(x1 - x0, 0, 0), V(0, 0, z0 - z1), tileUV(TILE.fortFloor), C("#d8ccb0"), 1, 1);
    }

    const tex = atlasTexture();
    const mat = cutaway(new THREE.MeshBasicMaterial({ map: tex, vertexColors: true }));
    this.scene.add(new THREE.Mesh(m.geometry(), mat));
    const ctex = churchTexture();
    const cmat = cutaway(new THREE.MeshBasicMaterial({ map: ctex, vertexColors: true }));
    this.scene.add(new THREE.Mesh(church.geometry(), cmat));
    const ktex = cathedralTexture();
    const kmat = cutaway(new THREE.MeshBasicMaterial({ map: ktex, vertexColors: true }));
    this.scene.add(new THREE.Mesh(cathedral.geometry(), kmat));
    this.disposables.push(tex, mat, ctex, cmat, ktex, kmat);
  }

  // A boarded window's facade: plaster around a hole into a dark room.
  private windowFacade(m: Mesher, bottom: THREE.Vector3, u: THREE.Vector3, base: THREE.Color, tile: number) {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const uv = tileUV(tile);
    const up = V(0, 3.5, 0);
    const h0 = 0.7 / 3.5;
    const h1 = 2.3 / 3.5;
    const w0 = 0.35 / 2;
    const w1 = 1.65 / 2;
    m.quad(bottom.clone(), u, up, uv, base, 2, 1, [0, 0], [1, h0]);
    m.quad(bottom.clone(), u, up, uv, base, 2, 1, [0, h1], [1, 1]);
    m.quad(bottom.clone(), u, up, uv, base, 1, 1, [0, h0], [w0, h1]);
    m.quad(bottom.clone(), u, up, uv, base, 1, 1, [w1, h0], [1, h1]);
    // The room behind, facing inward.
    const n = new THREE.Vector3().crossVectors(u, up).normalize();
    const depth = 1.7;
    const back = n.clone().multiplyScalar(-depth);
    const o = bottom.clone().addScaledVector(u, w0).setY(bottom.y + 0.7);
    const w = u.clone().multiplyScalar(w1 - w0);
    const hh = V(0, 1.6, 0);
    const dark = C("#6a5a4c");
    const pl = tileUV(TILE.plaster);
    m.quad(o.clone().add(back), w, hh, pl, dark, 1, 1, [0, 0], [1, 1], 0.35);
    m.quad(o.clone(), back.clone(), hh, pl, dark, 1, 1, [0, 0], [1, 1], 0.3);
    m.quad(o.clone().add(w).add(back), back.clone().negate(), hh, pl, dark, 1, 1, [0, 0], [1, 1], 0.3);
    m.quad(o.clone().add(back), w, back.clone().negate(), tileUV(TILE.planks), dark, 1, 1, [0, 0], [1, 1], 0.4);
    m.quad(o.clone().add(hh), w, back, pl, dark, 1, 1, [0, 0], [1, 1], 0.2);
  }

  private buildProps() {
    const parts: THREE.BufferGeometry[] = [];
    const place = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rotY = 0, s = 1) => {
      const g = geo.clone();
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(s, s, s)));
      parts.push(Mesher.bake(g));
    };
    const gar = garita();
    const can = cannon();
    let seed = 1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = GRID[r][c];
        const x = (c + 0.5) * CELL;
        const z = (r + 0.5) * CELL;
        const y = BASE[r * COLS + c];
        if (ch === "k") place(gar, x, y, z);
        else if (ch === "n") {
          // Point out over the sea wall.
          let rot = 0;
          for (const [dc, dr] of DIRS) if (at(c + dc, r + dr) === "L") rot = -Math.atan2(dc, -dr);
          place(can, x, y, z, rot);
        } else if (ch === "T") place(tomb(seed++), x, y, z, hash(c, r) * 0.4 - 0.2);
        else if (ch === "y") place(palm(seed++), x + 0.6, floorAt(x, z), z - 0.5, hash(r, c) * 6);
        else if (ch === "o" && GRID[r - 1]?.[c] !== "o" && GRID[r]?.[c - 1] !== "o") place(cistern(), x + CELL / 2, y, z + CELL / 2);
        else if (ch === "H" && GRID[r - 1]?.[c] !== "H" && GRID[r]?.[c - 1] !== "H") place(lighthouse(), x + CELL / 2, y, z + CELL / 2);
        else if (ch === "F" && GRID[r - 1]?.[c] !== "F" && GRID[r]?.[c - 1] !== "F") place(statue(), x + CELL / 2, y, z + CELL / 2, Math.PI);
      }
    }
    // Water tanks and the odd dish on the roofs.
    const tank = merge([paint(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 8).translate(0, 0.55, 0), C("#26262c")), paint(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 8).translate(0, 1.16, 0), C("#3a3a42"))]);
    const tankW = merge([paint(new THREE.CylinderGeometry(0.5, 0.5, 1.0, 8).translate(0, 0.5, 0), C("#e8e6e0"))]);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (GRID[r][c] !== "#" || hash(c * 7, r * 13) > 0.1) continue;
        const hh = house(c, r).h;
        place(hash(r, c) < 0.5 ? tank : tankW, (c + 0.5) * CELL, hh, (r + 0.5) * CELL);
      }
    }

    // Calle Fortaleza's umbrellas, strung overhead in rows.
    const palette = ["#e8322a", "#f2c12e", "#2e9be8", "#e84fa0", "#3fcf6a", "#ff8a1f", "#8a4fe8", "#ffffff"];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        if (GRID[r][c] !== "." || r < 45 || r > 47 || c < 57 || c > 67) continue;
        for (const [ox, oz] of [
          [0.5, 0.5],
          [1.5, 1.5],
        ]) {
          const k = Math.floor(hash(c * 2 + ox, r * 2 + oz) * palette.length);
          place(umbrella(palette[k]), c * CELL + ox, 6.2 + hash(r, c + ox) * 0.4, r * CELL + oz, hash(c, r) * 3);
        }
      }
    // The Cathedral's dome, behind its front.
    place(dome(), 66.5 * CELL, 15, (CATHEDRAL_R0 + 2.5) * CELL);

    // The church's bell gable, over the middle of its front.
    const churchRow = findCells("C")[0][1];
    place(espadana(), (CHURCH_C0 + 4) * CELL, 14, churchRow * CELL + 1.4);
    const geo = mergeAll(parts);
    const mat = cutaway(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.scene.add(new THREE.Mesh(geo, mat));
    this.disposables.push(geo, mat);

    // The lighthouse's lamp and its sweeping beam.
    const lh = findCells("H")[0];
    const lx = (lh[0] + 1) * CELL;
    const lz = (lh[1] + 1) * CELL;
    this.lampY = BASE[lh[1] * COLS + lh[0]] + 13.8;
    const lampGlow = (this.lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("rgba(255,240,190,1)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    lampGlow.position.set(lx, this.lampY, lz);
    lampGlow.scale.setScalar(5);
    const beamGeo = new THREE.ConeGeometry(4, 70, 10, 1, true).translate(0, -35, 0).rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: "#fff2c0", transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    this.beam.position.set(lx, this.lampY, lz);
    this.scene.add(lampGlow, this.beam);
  }

  private buildLamps() {
    const iron = lambert({ color: "#18161a" });
    const glass = basic({ color: "#ffcf80" });
    const glowTex = glowTexture("rgba(255,170,80,0.85)");
    const cage = new THREE.CylinderGeometry(0.16, 0.12, 0.42, 6);
    const arm = new THREE.BoxGeometry(0.05, 0.05, 0.5);
    const cap = new THREE.ConeGeometry(0.22, 0.2, 6);
    for (const L of LAMPS) {
      const g = new THREE.Group();
      g.position.set(L.x, L.y, L.z);
      g.rotation.y = -L.face;
      const a = new THREE.Mesh(arm, iron);
      a.position.set(0, 0.28, 0.1);
      const c = new THREE.Mesh(cage, glass);
      const k = new THREE.Mesh(cap, iron);
      k.position.y = 0.3;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(...L.color) }));
      glow.scale.setScalar(2.6);
      g.add(a, c, k, glow);
      this.scene.add(g);
    }
    this.disposables.push(iron, glass, glowTex, cage, arm, cap);
  }

  private buildDoors() {
    const mat = cutaway(new THREE.MeshLambertMaterial({ vertexColors: true }));
    for (const d of DOORS) {
      const ctr = doorCenter(d);
      const alongZ = d.cells.every(([c]) => c === d.cells[0][0]);
      const span = d.cells.length * CELL;
      if (d.id === "a") {
        const g = new THREE.Mesh(rubble(), mat);
        g.position.set(ctr.x, floorAt(ctr.x, ctr.z), ctr.z);
        g.rotation.y = alongZ ? 0 : Math.PI / 2;
        this.scene.add(g);
        this.doors.set(d.id, { parts: [g], openT: -1, kind: "rubble" });
      } else {
        const half = gateDoors(span - 0.1, GATE_HEIGHT[d.id] ?? 5);
        const parts: THREE.Object3D[] = [];
        for (const side of [-1, 1]) {
          const pivot = new THREE.Group();
          const mesh = new THREE.Mesh(half, mat);
          // gateDoors builds both halves about x = 0; keep the one on this side.
          mesh.position.x = -side * span * 0.25 + side * span * 0.25;
          pivot.add(mesh);
          pivot.position.set(ctr.x, floorAt(ctr.x, ctr.z), ctr.z);
          pivot.rotation.y = alongZ ? Math.PI / 2 : 0;
          if (side === 1) {
            this.scene.add(pivot);
            parts.push(pivot);
          }
        }
        this.doors.set(d.id, { parts, openT: -1, kind: "gate" });
      }
    }
    this.disposables.push(mat);
  }

  openDoor(id: string) {
    const d = this.doors.get(id);
    if (d && d.openT < 0) d.openT = 0;
  }

  private buildWindows() {
    SPAWNS.forEach((s, i) => {
      const list: THREE.Mesh[] = [];
      this.boards.push(list);
      if (s.kind !== "window") return;
      const [c, r] = s.cell;
      const dc = Math.round(Math.sin(s.face));
      const dr = Math.round(-Math.cos(s.face));
      const fx = (c + 0.5) * CELL + dc * (CELL / 2 + 0.05);
      const fz = (r + 0.5) * CELL + dr * (CELL / 2 + 0.05);
      const rnd = mulberry32(i * 31 + 5);
      for (let b = 0; b < WINDOW_BOARDS; b++) {
        const mesh = new THREE.Mesh(this.boardGeo, this.boardMat);
        mesh.position.set(fx, floorAt(s.to.x, s.to.z) + 0.85 + b * 0.27, fz);
        mesh.rotation.set(0, -s.face, (rnd() - 0.5) * 0.5);
        mesh.userData.home = { pos: mesh.position.clone(), rot: mesh.rotation.clone() };
        this.scene.add(mesh);
        list.push(mesh);
      }
    });
  }

  private buildBox() {
    const mat = lambert({ vertexColors: true });
    const g = new THREE.Group();
    g.position.set(BOX_SPOT.x, floorAt(BOX_SPOT.x, BOX_SPOT.z + 1.2), BOX_SPOT.z);
    g.rotation.y = -BOX_SPOT.face + Math.PI / 2;
    const base = new THREE.Mesh(boxBase(), mat);
    this.boxLid = new THREE.Group();
    this.boxLid.position.set(0, 0.7, 0.42);
    this.boxLid.add(new THREE.Mesh(boxLid(), mat));
    const q = signTexture("?", "#8fd8ff", "#2a1a10", 32, 32);
    const qm = basic({ map: q });
    for (const x of [-0.5, 0.5]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), qm);
      p.position.set(x, 0.38, -0.41);
      p.rotation.y = Math.PI;
      g.add(p);
      const p2 = p.clone();
      p2.position.z = 0.41;
      p2.rotation.y = 0;
      g.add(p2);
    }
    this.boxGun.visible = false;
    this.boxGun.rotation.y = Math.PI / 2;
    g.add(base, this.boxLid, this.boxGun);
    this.scene.add(g);
    // A pale beam into the sky marks where the box is.
    this.boxBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.8, 60, 8, 1, true).translate(0, 30, 0),
      new THREE.MeshBasicMaterial({ color: "#9ad8ff", transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })
    );
    this.boxBeam.position.set(BOX_SPOT.x, 0, BOX_SPOT.z);
    this.scene.add(this.boxBeam);
    this.disposables.push(mat, q, qm);
  }

  private buildPerks() {
    const geo = perkMachine();
    for (const ps of PERK_SPOTS) {
      const perk = PERKS[ps.perk];
      const g = new THREE.Group();
      g.position.set(ps.x, BASE[ps.cell[1] * COLS + ps.cell[0]], ps.z);
      g.rotation.y = -ps.face;
      const body = new THREE.Mesh(geo, lambert({ vertexColors: true, color: perk.color, emissive: new THREE.Color(perk.color).multiplyScalar(0.25) }));
      const tex = perkTexture(perk.name, perk.color);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), basic({ map: tex }));
      front.position.set(0, 1.05, -0.41);
      front.rotation.y = Math.PI;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(perk.color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.set(0, 1.2, -0.6);
      glow.scale.setScalar(3.4);
      g.add(body, front, glow);
      this.scene.add(g);
      this.disposables.push(tex);
    }
  }

  private buildPap() {
    const g = new THREE.Group();
    g.position.set(PAP_SPOT.x, BASE[PAP_SPOT.cell[1] * COLS + PAP_SPOT.cell[0]], PAP_SPOT.z);
    g.rotation.y = -PAP_SPOT.face;
    const body = new THREE.Mesh(papMachine(), lambert({ vertexColors: true, emissive: new THREE.Color("#1a0830") }));
    const tex = signTexture("PACK-A-PUNCH", "#e8b0ff", "#1a0a2a", 128, 24);
    for (const side of [-1, 1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.36), basic({ map: tex }));
      sign.position.set(0, 2.95, side * 0.26);
      sign.rotation.y = side < 0 ? Math.PI : 0;
      g.add(sign);
    }
    this.papGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("rgba(190,90,255,0.9)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.papGlow.position.set(0, 1.6, 0);
    this.papGlow.scale.setScalar(5);
    const boltGeo = new THREE.BufferGeometry();
    boltGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
    this.papBolts = new THREE.LineSegments(boltGeo, new THREE.LineBasicMaterial({ color: "#e0a0ff", transparent: true, blending: THREE.AdditiveBlending }));
    this.papBolts.frustumCulled = false;
    g.add(body, this.papGlow, this.papBolts);
    this.scene.add(g);
    this.disposables.push(tex);
  }

  private buildWallBuys() {
    for (const wb of WALLBUYS) {
      const tex = chalkTexture(wb.weapon as WeaponId);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), basic({ map: tex, transparent: true, depthWrite: false }));
      const dx = Math.sin(wb.face);
      const dz = -Math.cos(wb.face);
      p.position.set(wb.x + dx * 0.03, floorAt(wb.x + dx * 0.5, wb.z + dz * 0.5) + 1.55, wb.z + dz * 0.03);
      p.rotation.y = -wb.face + Math.PI;
      this.scene.add(p);
      this.disposables.push(tex);
    }
  }

  private buildParticles() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(700 * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(700 * 3), 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    for (let i = 0; i < 24; i++) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: "#ffe6a0", transparent: true, opacity: 0.8 }));
      line.frustumCulled = false;
      line.visible = false;
      this.scene.add(line);
      this.tracers.push({ line, t: 0 });
    }
  }

  burst(x: number, y: number, z: number, n: number, color: string, speed: number, grav = 9, life = 0.5) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n && this.particles.length < 700; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      const l = life * (0.6 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        z,
        vx: Math.cos(a) * Math.cos(e) * s,
        vy: Math.sin(e) * s + speed * 0.4,
        vz: Math.sin(a) * Math.cos(e) * s,
        life: l,
        max: l,
        r: c.r,
        g: c.g,
        b: c.b,
        grav,
      });
    }
  }

  // ---------- each frame ----------

  // React to the sim's events: tracers, blood, boards, doors.
  events(g: Game, evs: Ev[]) {
    for (const e of evs) {
      switch (e.type) {
        case "tracer": {
          if (e.ray) {
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.boltTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: e.pap ? "#ff80ff" : "#80ff80" }));
            s.scale.setScalar(0.9);
            this.scene.add(s);
            this.bolts.push({ sprite: s, from: new THREE.Vector3(e.ox, e.oy - 0.25, e.oz), to: new THREE.Vector3(e.x, e.y, e.z), t: 0 });
            break;
          }
          const tr = this.tracers.find((t) => t.t <= 0);
          if (!tr) break;
          const a = tr.line.geometry.getAttribute("position") as THREE.BufferAttribute;
          // Start a little ahead and below the eye, where the barrel is.
          const dx = e.x - e.ox;
          const dy = e.y - e.oy;
          const dz = e.z - e.oz;
          const len = Math.hypot(dx, dy, dz) || 1;
          const st = Math.min(1.5, len * 0.5) / len;
          a.setXYZ(0, e.ox + dx * st, e.oy - 0.2 + dy * st, e.oz + dz * st);
          a.setXYZ(1, e.x, e.y, e.z);
          a.needsUpdate = true;
          (tr.line.material as THREE.LineBasicMaterial).color.set(e.pap ? "#ff9cff" : "#ffe6a0");
          tr.line.visible = true;
          tr.t = 0.05;
          break;
        }
        case "impact":
          if (e.blood) this.burst(e.x, e.y, e.z, 8, "#8a1010", 2.5, 9, 0.5);
          else this.burst(e.x, e.y, e.z, 5, "#b8ad95", 1.8, 6, 0.35);
          break;
        case "splash":
          this.burst(e.x, e.y, e.z, 40, "#7dff7a", 5, 2, 0.6);
          break;
        case "kill": {
          const z = g.zombies.find((zz) => zz.id === e.id);
          if (z && e.head) this.burst(z.x, z.y + 1.65, z.z, 26, "#9a1212", 3.5, 9, 0.7);
          break;
        }
        case "board": {
          const list = this.boards[e.win];
          if (!e.fix) {
            const mesh = list[e.left];
            if (!mesh) break;
            const s = SPAWNS[e.win];
            const fly = mesh.clone();
            this.scene.add(fly);
            mesh.visible = false;
            this.flying.push({ mesh: fly, vx: Math.sin(s.face) * 3 + (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2, vz: -Math.cos(s.face) * 3 + (Math.random() - 0.5) * 2, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), t: 1.6 });
            this.burst(mesh.position.x, mesh.position.y, mesh.position.z, 8, "#7a5230", 2, 9, 0.4);
          } else {
            const mesh = list[e.left - 1];
            if (mesh) mesh.visible = true;
          }
          break;
        }
        case "door":
          this.openDoor(e.id);
          break;
        case "spawn":
          if (e.kind === "ground") this.burst(e.x, 0.1, e.z, 30, "#4a3a28", 3, 9, 0.8);
          break;
        case "shot":
          this.flashT = 0.05;
          this.flash.material.rotation = Math.random() * Math.PI;
          this.flash.material.color.set(e.weapon === "rayo" ? (e.pap ? "#ff80ff" : "#60ff60") : e.pap ? "#ffb0ff" : "#ffffff");
          break;
        case "power":
          this.burst(g.player.x, 1, g.player.z, 30, "#9dff7a", 3, 2, 0.6);
          break;
      }
    }
  }

  private flashT = 0;

  sync(g: Game, dt: number, time: number, view: View) {
    const p = g.player;

    // Camera.
    const cam = this.camera;
    const die = Math.min(1, view.deathT / 1.1);
    if (this.mode === "top") {
      // Looking down from the south, leading a little toward where you aim.
      const lead = 2.2;
      const tx = p.x + Math.sin(p.yaw) * lead;
      const tz = p.z - Math.cos(p.yaw) * lead;
      if (this.camFollow.lengthSq() === 0 || view.snap) this.camFollow.set(tx, 0, tz);
      const k = 1 - Math.exp(-5 * dt);
      this.camFollow.x += (tx - this.camFollow.x) * k;
      this.camFollow.z += (tz - this.camFollow.z) * k;
      const pitch = 1.22;
      const dist = this.topDist * (1 - die * 0.35);
      const ground = squashY(p.y, true);
      this.camY += (ground - this.camY) * (view.snap ? 1 : 1 - Math.exp(-4 * dt));
      cam.position.set(this.camFollow.x, this.camY + Math.sin(pitch) * dist, this.camFollow.z + Math.cos(pitch) * dist);
      cam.rotation.set(-pitch, 0, 0);
      cut.uCutCam.value.copy(cam.position);
      cut.uCutPlayer.value.set(p.x, ground + 1.0, p.z);
    } else {
      cam.position.set(p.x, p.y + 1.6 + view.bob - die * 1.2, p.z);
      cam.rotation.set(p.pitch + die * 0.5, -p.yaw, die * 0.9);
    }
    if (view.shake > 0) {
      const amp = this.mode === "top" ? 0.3 : 0.1;
      cam.position.x += (Math.random() - 0.5) * view.shake * amp;
      cam.position.y += (Math.random() - 0.5) * view.shake * amp;
    }
    this.sky.position.copy(cam.position);

    // Sea swell.
    const sp = this.sea.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < (this.quality < 2 ? sp.count : 0); i++) {
      const x = this.seaBase[i * 3];
      const z = this.seaBase[i * 3 + 2];
      sp.setY(i, -17 + Math.sin(x * 0.07 + time * 0.9) * 0.6 + Math.cos(z * 0.09 + time * 0.7) * 0.5);
    }
    sp.needsUpdate = true;
    if (this.quality < 2) this.sea.geometry.computeVertexNormals();
    this.beam.rotation.y = time * 0.5;
    const boxIdle = g.box.state === "idle";
    (this.boxBeam.material as THREE.MeshBasicMaterial).opacity = boxIdle ? 0.12 + Math.sin(time * 2) * 0.03 : 0.25;

    // The nearest lanterns light the zombies and the hands.
    const near = LAMPS.map((L) => ({ L, d: (L.x - p.x) ** 2 + (L.z - p.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lamps.length);
    near.forEach(({ L }, i) => {
      const pl = this.lamps[i];
      const dx = Math.sin(L.face) * 0.6;
      const dz = -Math.cos(L.face) * 0.6;
      pl.position.set(L.x + dx, L.y, L.z + dz);
      pl.color.setRGB(L.color[0], L.color[1], L.color[2]);
      pl.distance = L.radius * 1.3;
      pl.intensity = 5 + Math.sin(time * 9 + i * 3) * 0.3;
    });
    this.flashT -= dt;
    this.flashLight.position.set(p.x + Math.sin(p.yaw), 1.5, p.z - Math.cos(p.yaw));
    this.flashLight.intensity = this.flashT > 0 ? 6 : 0;

    this.syncZombies(g, dt, time);
    this.syncDoors(dt);
    this.syncBox(g, dt, time);
    this.syncPap(g, time);
    this.syncDrops(g, time);
    this.syncEffects(dt);
    if (this.mode === "fps") this.syncHands(g, dt, time, view);
    else this.syncPlayer(g, dt, time);
    this.hands.visible = this.mode === "fps" && !g.player.dead;
  }

  private syncPlayer(g: Game, dt: number, time: number) {
    const p = g.player;
    const m = this.player;
    const w = p.weapons[p.cur];
    const key = `${w.id}:${w.pap}`;
    if (key !== this.playerGunKey) {
      this.playerGunKey = key;
      m.gun.geometry = this.gunGeo(w.id, w.pap).geo;
    }
    m.root.position.set(p.x, squashY(p.y, true), p.z);
    m.root.rotation.y = -p.yaw;
    // Legs walk; the body turns to aim.
    const speed = Math.hypot(p.vx, p.vz);
    this.walkPhase += dt * speed * 2.4;
    const swing = Math.sin(this.walkPhase) * Math.min(1, speed / 3) * 0.7;
    m.legL.rotation.x = swing;
    m.legR.rotation.x = -swing;
    const recoil = this.flashT > 0 ? 0.15 : 0;
    m.torso.rotation.set(-recoil * 0.5, 0, 0);
    m.gun.visible = p.busyKind === "";
    m.gun.rotation.x = p.reloadT > 0 ? 0.8 : p.switchT > 0 ? 1.2 : 0;
    m.armR.rotation.x = p.knifeT > 0 ? 1.45 + Math.sin((1 - p.knifeT / 0.55) * Math.PI) * 0.8 : 1.45;
    if (p.dead) {
      this.deadFall = Math.min(1, this.deadFall + dt * 2);
      m.body.rotation.x = (this.deadFall * Math.PI) / 2.1;
    } else {
      this.deadFall = 0;
      m.body.rotation.x = 0;
    }
    // Muzzle flash at the end of the gun, and a faint laser sight.
    const gg = this.gunGeo(w.id, w.pap);
    m.root.updateMatrixWorld(true);
    const muzzle = gg.muzzle.clone().applyMatrix4(m.gun.matrixWorld);
    this.worldFlash.visible = this.flashT > 0;
    this.worldFlash.position.copy(muzzle);
    const dx = Math.sin(p.yaw);
    const dz = -Math.cos(p.yaw);
    const reach = rayWall(g.walk, p.x, p.y + GUN_Y, p.z, dx, 0, dz, 14);
    let end = reach;
    for (const z of g.zombies) {
      const h = rayZombie(z, p.x, p.z, dx, dz, p.y);
      if (h && h.t < end) end = h.t;
    }
    const la = this.laser.geometry.getAttribute("position") as THREE.BufferAttribute;
    la.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
    la.setXYZ(1, p.x + dx * end, muzzle.y, p.z + dz * end);
    la.needsUpdate = true;
    this.laser.visible = !p.dead && p.busyKind === "";
    void time;
  }

  private walkPhase = 0;

  private syncZombies(g: Game, dt: number, time: number) {
    const seen = new Set<number>();
    for (const z of g.zombies) {
      seen.add(z.id);
      let m = this.zombies.get(z.id);
      if (!m) {
        if (!this.spare.length) {
          const fresh = new ZombieModel(this.modelSeed++, this.zombieMat, this.eyeMat);
          fresh.addGhosts(this.zombieGhost);
          this.spare.push(fresh);
        }
        m = this.spare.pop()!;
        this.zombies.set(z.id, m);
        this.scene.add(m.root);
        m.body.rotation.set(0, 0, 0);
        m.head.visible = true;
        m.stump.visible = false;
      }
      pose(m, z, dt, time, this.mode === "top");
      m.showGhosts(this.mode === "top" && z.state !== "dead");
    }
    for (const [id, m] of this.zombies) {
      if (seen.has(id)) continue;
      this.scene.remove(m.root);
      this.zombies.delete(id);
      this.spare.push(m);
    }
  }

  private syncDoors(dt: number) {
    for (const d of this.doors.values()) {
      if (d.openT < 0 || d.openT > 2) continue;
      d.openT += dt;
      const k = Math.min(1, d.openT / 1.2);
      for (const part of d.parts) {
        if (d.kind === "rubble") {
          part.position.y = -k * k * 3;
          if (k >= 1) part.visible = false;
        } else {
          part.position.y = -k * k * 5.5;
          if (k >= 1) part.visible = false;
        }
      }
    }
  }

  private syncBox(g: Game, dt: number, time: number) {
    const b = g.box;
    const open = b.state !== "idle";
    this.boxLid.rotation.x += ((open ? -1.9 : 0) - this.boxLid.rotation.x) * Math.min(1, dt * 8);
    this.boxGun.visible = open;
    if (!open) {
      this.boxShown = null;
      return;
    }
    let id: WeaponId;
    if (b.state === "rolling") {
      this.boxCycle -= dt;
      if (this.boxCycle <= 0 || !this.boxShown) {
        const all = Object.keys(WEAPONS).filter((w) => w !== "pistola") as WeaponId[];
        this.boxShown = all[Math.floor(Math.random() * all.length)];
        this.boxCycle = 0.12 + (3.4 - b.t) * 0.05;
      }
      id = this.boxShown;
      this.boxGun.position.y = 0.6 + Math.min(1, (3.4 - b.t) / 3.4) * 0.6;
    } else {
      id = b.weapon ?? "pistola";
      this.boxGun.position.y = 1.2 + Math.sin(time * 3) * 0.04;
    }
    this.boxGun.geometry = this.gunGeo(id, false).geo;
    this.boxGun.scale.setScalar(1.8);
  }

  private syncPap(g: Game, time: number) {
    const working = g.player.busyKind === "pap";
    this.papGlow.material.opacity = working ? 0.9 + Math.random() * 0.1 : 0.45 + Math.sin(time * 2) * 0.15;
    this.papGlow.scale.setScalar(working ? 7 : 5);
    const a = this.papBolts.geometry.getAttribute("position") as THREE.BufferAttribute;
    this.papBolts.visible = working || Math.random() < 0.04;
    if (this.papBolts.visible) {
      for (let i = 0; i < 12; i++) {
        const x = (Math.random() - 0.5) * 2;
        const y = 2.0 + Math.random() * 1.2;
        a.setXYZ(i * 2, x, y, (Math.random() - 0.5) * 0.8);
        a.setXYZ(i * 2 + 1, x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8);
      }
      a.needsUpdate = true;
    }
  }

  private syncDrops(g: Game, time: number) {
    const seen = new Set<number>();
    for (const d of g.drops) {
      seen.add(d.id);
      let grp = this.drops.get(d.id);
      if (!grp) {
        grp = new THREE.Group();
        const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: this.powerTex[d.kind], transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dropGlow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.setScalar(2.6);
        grp.add(glow, icon);
        this.scene.add(grp);
        this.drops.set(d.id, grp);
      }
      grp.position.set(d.x, squashY(floorAt(d.x, d.z), this.mode === "top") + 1.1 + Math.sin(time * 3 + d.id) * 0.12, d.z);
      grp.children[1].rotation.y = time * 2.2;
      // Blinks when it's about to go.
      grp.visible = d.t > 6 || Math.floor(time * (d.t > 3 ? 4 : 8)) % 2 === 0;
    }
    for (const [id, grp] of this.drops) {
      if (seen.has(id)) continue;
      this.scene.remove(grp);
      (grp.children[1] as THREE.Mesh).geometry.dispose();
      this.drops.delete(id);
    }
  }

  private syncEffects(dt: number) {
    const pa = this.points.geometry.getAttribute("position") as THREE.BufferAttribute;
    const ca = this.points.geometry.getAttribute("color") as THREE.BufferAttribute;
    this.particles = this.particles.filter((q) => (q.life -= dt) > 0);
    let k = 0;
    for (const q of this.particles) {
      q.vy -= q.grav * dt;
      q.x += q.vx * dt;
      q.y = Math.max(floorAt(q.x, q.z) + 0.02, q.y + q.vy * dt);
      q.z += q.vz * dt;
      pa.setXYZ(k, q.x, q.y, q.z);
      const f = Math.min(1, (q.life / q.max) * 2);
      ca.setXYZ(k, q.r * f, q.g * f, q.b * f);
      k++;
    }
    for (let i = k; i < 700; i++) pa.setXYZ(i, 0, -999, 0);
    pa.needsUpdate = true;
    ca.needsUpdate = true;
    for (const t of this.tracers) {
      if (t.t <= 0) continue;
      t.t -= dt;
      if (t.t <= 0) t.line.visible = false;
    }
    this.bolts = this.bolts.filter((b) => {
      b.t += dt;
      const k2 = Math.min(1, b.t / 0.14);
      b.sprite.position.lerpVectors(b.from, b.to, k2);
      if (k2 >= 1) {
        this.scene.remove(b.sprite);
        b.sprite.material.dispose();
        return false;
      }
      return true;
    });
    this.flying = this.flying.filter((f) => {
      f.t -= dt;
      f.vy -= 12 * dt;
      f.mesh.position.x += f.vx * dt;
      f.mesh.position.y = Math.max(0.05, f.mesh.position.y + f.vy * dt);
      f.mesh.position.z += f.vz * dt;
      if (f.mesh.position.y > 0.06) {
        f.mesh.rotation.x += f.spin.x * dt;
        f.mesh.rotation.y += f.spin.y * dt;
      }
      if (f.t <= 0) {
        this.scene.remove(f.mesh);
        return false;
      }
      return true;
    });
  }

  // Match boards and doors to a fresh game.
  resetBoards(g: Game) {
    this.boards.forEach((list, i) => list.forEach((m, b) => (m.visible = b < g.boards[i])));
    for (const [id, d] of this.doors) {
      const open = g.doors.has(id);
      d.openT = open ? 99 : -1;
      for (const part of d.parts) {
        part.visible = !open;
        part.position.y = 0;
      }
    }
  }

  private gunGeo(id: WeaponId, pap: boolean) {
    const key = `${id}:${pap}`;
    let v = this.gunCache.get(key);
    if (!v) {
      v = gunGeometry(id, pap);
      this.gunCache.set(key, v);
    }
    return v;
  }

  private syncHands(g: Game, dt: number, time: number, view: View) {
    const p = g.player;
    const w = p.weapons[p.cur];
    const key = `${w.id}:${w.pap}`;
    if (key !== this.gunKey) {
      this.swapFrom = this.gunKey;
      this.gunKey = key;
      const gg = this.gunGeo(w.id, w.pap);
      this.gun.geometry = gg.geo;
      this.flash.position.copy(gg.muzzle);
      // Hands on the grip and under the barrel.
      this.armR.position.set(0.01, -0.07, 0.05);
      this.armR.rotation.set(0.25, 0.35, 0);
      const pistol = w.id === "pistola" || w.id === "rayo";
      this.armL.position.set(pistol ? -0.03 : 0, pistol ? -0.08 : 0.02, pistol ? 0.03 : -WEAPONS[w.id].look.long * 0.5);
      this.armL.rotation.set(pistol ? 0.3 : 0.2, pistol ? -0.7 : -0.45, 0);
    }
    void this.swapFrom;
    this.hands.visible = !p.dead;

    // Where the gun sits: at the hip, or up at the eye.
    const ads = p.ads ? 1 : 0;
    this.adsK += (ads - this.adsK) * Math.min(1, dt * 14);
    const a = this.adsK;
    const base = new THREE.Vector3(0.2 * (1 - a), -0.23 + 0.13 * a, -0.56 + 0.18 * a);
    const rot = new THREE.Euler(0.04 * (1 - a), 0.07 * (1 - a), 0);
    base.x += view.swayX * (1 - a * 0.7);
    base.y += view.swayY * (1 - a * 0.7) + view.bob * 0.4 * (1 - a * 0.8);
    base.z += view.kick * 0.06;
    rot.x += view.kick * 0.25;
    if (p.sprinting) {
      base.x -= 0.05;
      base.y -= 0.05;
      rot.y += 0.7;
      rot.z += 0.35;
    }
    const def = WEAPONS[w.id];
    const reloadDur = def.reload * (p.perks.includes("piragua") ? 0.5 : 1);
    if (p.reloadT > 0) {
      const k = def.perShell ? 0.6 : Math.sin(Math.min(1, 1 - p.reloadT / reloadDur) * Math.PI);
      base.y -= 0.1 * k;
      rot.z += 0.6 * k;
      rot.x += 0.3 * k;
    }
    if (p.switchT > 0) {
      const k = p.switchT / 0.55;
      base.y -= 0.3 * k;
      rot.x -= 0.6 * k;
    }
    const busy = p.busyKind !== "";
    const knifing = p.knifeT > 0;
    if (knifing) {
      base.y -= 0.15;
      rot.z -= 0.4;
    }
    this.gun.visible = !busy;
    this.gun.position.copy(base);
    this.gun.rotation.copy(rot);
    this.flash.visible = this.flashT > 0;

    // The knife slashes across.
    this.knife.visible = knifing;
    if (knifing) {
      const k = 1 - p.knifeT / 0.55;
      const s = Math.sin(k * Math.PI);
      this.knife.position.set(0.25 - k * 0.45, -0.18 + s * 0.08, -0.35 - s * 0.15);
      this.knife.rotation.set(0.2, 0.6 - k * 1.4, -1.2 + k * 0.6);
    }

    // Drinking a perk.
    this.bottle.visible = p.busyKind === "perk";
    if (this.bottle.visible) {
      const perk = p.perks[p.perks.length - 1];
      const color = perk ? PERKS[perk].color : "#fff";
      if (color !== this.bottleColor) {
        this.bottleColor = color;
        this.bottle.clear();
        this.bottle.add(new THREE.Mesh(bottleGeometry(color), this.armR.material as THREE.Material));
        const arm = new THREE.Mesh(this.armR.geometry, this.armR.material as THREE.Material);
        arm.position.set(0, 0.05, 0.02);
        arm.rotation.set(-0.3, 0.3, 0);
        this.bottle.add(arm);
      }
      const k = 1 - p.busyT / 1.6;
      const lift = Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5);
      this.bottle.position.set(0.12 - lift * 0.1, -0.3 + lift * 0.2, -0.3);
      this.bottle.rotation.set(-0.2 + lift * 1.6, 0, 0.2);
    }

    // Light the hands like the street around them.
    const c = lightAt(p.x, p.y + 1.4, p.z, 0, 1, 0, new THREE.Color());
    this.viewHemi.color.setRGB(Math.min(2, c.r * 1.3), Math.min(2, c.g * 1.3), Math.min(2, c.b * 1.3));
    this.viewKey.intensity = 0.6 + (this.flashT > 0 ? 2.5 : 0);
    void time;
  }

  private adsK = 0;

  render() {
    this.gl.setRenderTarget(this.target);
    this.gl.clear();
    this.gl.render(this.scene, this.camera);
    if (this.mode === "fps") {
      this.gl.clearDepth();
      this.gl.render(this.viewScene, this.viewCam);
    }
    this.gl.setRenderTarget(null);
    this.gl.clear();
    this.gl.render(this.post.scene, this.post.camera);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    for (const m of [...this.zombies.values(), ...this.spare]) m.dispose();
    for (const v of this.gunCache.values()) v.geo.dispose();
    for (const s of [this.scene, this.viewScene]) {
      s.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
    }
    this.target.dispose();
    this.post.mat.dispose();
    this.gl.dispose();
  }
}

function mergeAll(parts: THREE.BufferGeometry[]) {
  // Everything painted and baked has the same attributes.
  const total = parts.reduce((s, g) => s + g.getAttribute("position").count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    const n = g.getAttribute("position").count;
    pos.set(g.getAttribute("position").array as Float32Array, o * 3);
    nor.set(g.getAttribute("normal").array as Float32Array, o * 3);
    col.set(g.getAttribute("color").array as Float32Array, o * 3);
    o += n;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

function findCells(ch: string) {
  const out: [number, number][] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (GRID[r][c] === ch) out.push([c, r]);
  return out;
}

// ---------- zombie animation ----------

function pose(m: ZombieModel, z: Zombie, dt: number, time: number, top: boolean) {
  m.root.position.set(z.x, squashY(z.gy, top) + z.y, z.z);
  m.root.rotation.y = -z.yaw;
  const ph = z.phase;
  const sway = Math.sin(time * 1.3 + z.look * 10);
  let legA = 0;
  let armA = 1.4;
  let armB = 1.4;
  let lean = -0.18;
  let head = 0.15 + sway * 0.1;
  let roll = sway * 0.08;
  switch (z.state) {
    case "walk":
      if (z.gait === 0) {
        legA = Math.sin(ph) * 0.45;
        armA = 1.35 + Math.sin(ph) * 0.12;
        armB = 1.45 - Math.sin(ph) * 0.12;
        roll = Math.sin(ph) * 0.12;
      } else {
        const amp = z.gait === 2 ? 0.95 : 0.7;
        legA = Math.sin(ph) * amp;
        armA = 0.5 - Math.sin(ph) * amp * 0.9;
        armB = 0.5 + Math.sin(ph) * amp * 0.9;
        lean = z.gait === 2 ? -0.5 : -0.35;
        head = -0.1;
      }
      if (z.attackT > 0) {
        const k = 1 - z.attackT;
        const swing = k < 0.45 ? 2.6 : 2.6 - ((k - 0.45) / 0.55) * 2.2;
        armA = swing;
        armB = swing - 0.3;
        lean = -0.3;
      }
      break;
    case "window":
      armA = 1.5 + Math.sin(time * 9 + z.look * 5) * 0.5;
      armB = 1.5 - Math.sin(time * 9 + z.look * 5) * 0.5;
      lean = -0.25;
      break;
    case "spawn":
      legA = Math.sin(ph) * 0.4;
      break;
    case "climb":
      armA = armB = 2.6;
      legA = Math.sin(time * 8) * 0.5;
      lean = -0.4;
      break;
    case "rise":
      armA = 2.9 + Math.sin(time * 7) * 0.2;
      armB = 2.7 - Math.sin(time * 7) * 0.2;
      lean = -0.1;
      head = -0.3;
      break;
    case "dead": {
      const k = Math.min(1, z.deadT / 0.5);
      m.body.rotation.x = (k * k * Math.PI) / 2.05;
      m.root.position.y = squashY(z.gy, top) + z.y - Math.max(0, z.deadT - 2.4) * 0.8;
      armA = 2.2;
      armB = 1.6;
      legA = 0.2;
      lean = 0;
      break;
    }
  }
  if (z.hitT > 0) lean += 0.35;
  m.legL.rotation.x = legA;
  m.legR.rotation.x = -legA;
  m.armL.rotation.set(armA, 0, 0.08);
  m.armR.rotation.set(armB, 0, -0.08);
  m.torso.rotation.set(lean, 0, roll);
  m.head.rotation.set(head, sway * 0.3, sway * 0.2);
  m.head.visible = !z.headless;
  m.stump.visible = z.headless;
  if (z.state !== "dead") m.body.rotation.x = 0;
  void dt;
}
