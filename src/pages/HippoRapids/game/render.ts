// Draws Hippo Rapids: a smooth, cartoon-bright river at dusk, seen from behind the raft.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  geyserAt,
  getCourse,
  gustAt,
  logAt,
  seatRadius,
  raftRadius,
  type Course,
  type Snapshot,
} from "../../../../server/shared/hippoRapids/index.js";

// How the hippos look, by seat.
export const HIPPO_LOOKS = [
  { name: "Slate", body: "#4f7d92", belly: "#9cc3d1" },
  { name: "Moss", body: "#6fae45", belly: "#c4e68f" },
  { name: "Clay", body: "#c98a5e", belly: "#f1c9a0" },
  { name: "Bubblegum", body: "#e486a8", belly: "#f8c6d8" },
];

const lerpTo = (cur: number, target: number, dt: number, rate: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

const SEG = 5; // the bank segments, matching the physics walls
const C = (hex: string) => new THREE.Color(hex);

export interface View extends Omit<Snapshot, "ev"> {
  // Which seat this player is in (-1: none, e.g. the title screen).
  me: number;
  names: string[];
  // True for the seats a person is sitting in.
  humans: boolean[];
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Paints a whole geometry one colour, so differently coloured parts can be merged into one mesh.
function tint(geo: THREE.BufferGeometry, color: THREE.Color | string) {
  const c = typeof color === "string" ? C(color) : color;
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.deleteAttribute("uv");
  return g;
}

const place = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
  geo.scale(sx, sy, sz);
  geo.translate(x, y, z);
  return geo;
};

const lambert = (opts: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });

function nameSprite(text: string, color: string) {
  const tex = canvasTexture(256, 64, (g) => {
    g.font = "bold 40px 'Trebuchet MS', 'Arial Rounded MT Bold', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 9;
    g.strokeStyle = "#1b1030";
    g.lineJoin = "round";
    g.strokeText(text, 128, 34);
    g.fillStyle = color;
    g.fillText(text, 128, 34);
  });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(2.1, 0.52, 1);
  s.renderOrder = 10;
  return s;
}

// Paints a geometry with soft top-light shading baked in, so the hippos read as round.
function skin(geo: THREE.BufferGeometry, color: THREE.Color | string, shade = 0.2) {
  const c = typeof color === "string" ? C(color) : color;
  const g = geo.index ? geo.toNonIndexed() : geo;
  const normal = g.getAttribute("normal");
  const n = g.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = 1 - shade + shade * (normal ? normal.getY(i) * 0.5 + 0.5 : 1) * 1.15;
    col[i * 3] = Math.min(1, c.r * k);
    col[i * 3 + 1] = Math.min(1, c.g * k);
    col[i * 3 + 2] = Math.min(1, c.b * k);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.deleteAttribute("uv");
  return g;
}

const ball = (r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 16) => place(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), x, y, z, sx, sy, sz);

// A cartoon outline: the same shape pushed out along its normals and drawn inside out.
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x1b1030, side: THREE.BackSide });
function outline(geo: THREE.BufferGeometry, width = 0.03) {
  const g = geo.clone();
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * width, pos.getY(i) + nor.getY(i) * width, pos.getZ(i) + nor.getZ(i) * width);
  return new THREE.Mesh(g, OUTLINE);
}

// What each hippo wears, by seat.
function accessory(kind: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  if (kind === 0) {
    // Swim goggles on the forehead.
    for (const x of [-0.12, 0.12]) {
      out.push(skin(place(new THREE.TorusGeometry(0.085, 0.03, 8, 14).rotateX(-1.1), x, 0.43, 0.02), "#ffd23a", 0.1));
      out.push(skin(place(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12).rotateX(-1.1), x, 0.425, 0.025), "#7fd8ff", 0.05));
    }
    out.push(skin(place(new THREE.BoxGeometry(0.5, 0.05, 0.05), 0, 0.3, -0.12).rotateX(0), "#ffd23a", 0.1));
  } else if (kind === 1) {
    // A flower tucked by the ear.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      out.push(skin(ball(0.06, 0.3 + Math.cos(a) * 0.075, 0.5 + Math.sin(a) * 0.075, 0.0, 1, 1, 0.5, 8), "#ff7aa8", 0.1));
    }
    out.push(skin(ball(0.045, 0.3, 0.5, 0.01, 1, 1, 0.8, 8), "#ffe45e", 0.1));
  } else if (kind === 2) {
    // A little bucket hat.
    out.push(skin(place(new THREE.CylinderGeometry(0.2, 0.25, 0.2, 14), 0, 0.5, 0.1), "#f1e4c0", 0.15));
    out.push(skin(place(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 18), 0, 0.41, 0.1), "#f1e4c0", 0.15));
    out.push(skin(place(new THREE.CylinderGeometry(0.255, 0.255, 0.05, 14), 0, 0.46, 0.1), "#e0483a", 0.1));
  } else {
    // A big red bow.
    out.push(skin(place(new THREE.ConeGeometry(0.14, 0.26, 8).rotateZ(Math.PI / 2), -0.14, 0.53, 0.12), "#e0483a", 0.12));
    out.push(skin(place(new THREE.ConeGeometry(0.14, 0.26, 8).rotateZ(-Math.PI / 2), 0.14, 0.53, 0.12), "#e0483a", 0.12));
    out.push(skin(ball(0.065, 0, 0.53, 0.12, 1, 1, 1, 8), "#b02a22", 0.1));
  }
  return out;
}

// A chunky, round hippo with a big goofy face. Nose toward +z, tail toward -z, feet on y = 0.
function buildHippo(look: { body: string; belly: string }, outfit: number) {
  const g = new THREE.Group();
  const body = C(look.body);
  const belly = C(look.belly);
  const dark = body.clone().multiplyScalar(0.6);
  const pink = C("#f29aa8");
  const cream = "#fff4dc";

  // Body: barrel, two round cheeks at the back, a lighter belly, stubby legs.
  const trunk: THREE.BufferGeometry[] = [
    skin(ball(0.5, 0, 0.6, -0.08, 1.05, 1.02, 1.12, 20), body),
    skin(ball(0.32, -0.2, 0.58, -0.48, 1, 1, 1, 14), body),
    skin(ball(0.32, 0.2, 0.58, -0.48, 1, 1, 1, 14), body),
    skin(ball(0.46, 0, 0.42, 0, 0.88, 0.55, 1.05, 14), belly, 0.1),
    skin(ball(0.3, 0, 0.88, 0.1, 1.1, 0.55, 1.1, 12), body.clone().lerp(C("#ffffff"), 0.08)),
  ];
  for (const [x, z] of [[-0.34, 0.3], [0.34, 0.3], [-0.32, -0.42], [0.32, -0.42]]) {
    trunk.push(skin(place(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10), x, 0.25, z), dark, 0.1));
  }
  const bodyGeo = mergeGeometries(trunk)!;
  g.add(new THREE.Mesh(bodyGeo, lambert()));
  g.add(outline(bodyGeo, 0.028));

  // The head hangs off a neck pivot so it can nod, shake and strain.
  const head = new THREE.Group();
  head.position.set(0, 0.78, 0.4);
  const skull: THREE.BufferGeometry[] = [
    skin(ball(0.44, 0, 0.1, 0.16, 1.02, 0.95, 0.95, 20), body),
    skin(ball(0.3, -0.17, -0.03, 0.5, 1, 0.9, 1.0, 14), belly),
    skin(ball(0.3, 0.17, -0.03, 0.5, 1, 0.9, 1.0, 14), belly),
    skin(ball(0.28, 0, 0.0, 0.5, 1.2, 0.85, 1.0, 14), belly),
    // nostrils
    skin(ball(0.075, -0.15, 0.17, 0.74, 1, 0.8, 1, 8), dark),
    skin(ball(0.075, 0.15, 0.17, 0.74, 1, 0.8, 1, 8), dark),
    skin(ball(0.045, -0.15, 0.2, 0.78, 1, 0.5, 1, 6), "#2a1830", 0),
    skin(ball(0.045, 0.15, 0.2, 0.78, 1, 0.5, 1, 6), "#2a1830", 0),
    // blushing cheeks
    skin(ball(0.075, -0.33, 0.0, 0.42, 0.6, 1, 1, 8), pink, 0),
    skin(ball(0.075, 0.33, 0.0, 0.42, 0.6, 1, 1, 8), pink, 0),
    // eye sockets and heavy brows
    skin(ball(0.14, -0.22, 0.35, 0.2, 1, 1, 1, 12), body),
    skin(ball(0.14, 0.22, 0.35, 0.2, 1, 1, 1, 12), body),
    // inside the mouth, seen when the jaw drops
    skin(ball(0.26, 0, -0.1, 0.48, 1.1, 0.35, 1, 10), "#6e2538", 0),
    // the upper tusks
    skin(place(new THREE.ConeGeometry(0.04, 0.12, 6).rotateX(Math.PI), -0.17, -0.12, 0.74), cream, 0.1),
    skin(place(new THREE.ConeGeometry(0.04, 0.12, 6).rotateX(Math.PI), 0.17, -0.12, 0.74), cream, 0.1),
    ...accessory(outfit),
  ];
  const skullGeo = mergeGeometries(skull)!;
  head.add(new THREE.Mesh(skullGeo, lambert()));
  head.add(outline(skullGeo, 0.025));
  // Ears, with pink insides.
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(side * 0.27, 0.43, 0.02);
    const geo = mergeGeometries([skin(ball(0.1, 0, 0.06, 0, 0.8, 1.3, 0.7, 10), body), skin(ball(0.06, side * 0.01, 0.06, 0.03, 0.6, 1, 0.5, 8), pink, 0)])!;
    ear.add(new THREE.Mesh(geo, lambert()));
    ear.add(outline(geo, 0.02));
    head.add(ear);
    ears.push(ear);
  }
  // Big googly eyes: white, pupil and a glint, squashed flat to blink.
  const eyes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.22, 0.4, 0.3);
    const geo = mergeGeometries([
      skin(ball(0.12, 0, 0, 0, 1, 1, 0.8, 12), "#ffffff", 0.05),
      skin(ball(0.07, side * 0.01, 0, 0.075, 1, 1, 0.6, 10), "#1b1030", 0),
      skin(ball(0.022, side * 0.025, 0.025, 0.1, 1, 1, 0.6, 6), "#ffffff", 0),
      // the lid droops over the top half
      skin(ball(0.13, 0, 0.05, -0.005, 1, 0.62, 0.85, 12), body, 0.1),
    ])!;
    eye.add(new THREE.Mesh(geo, lambert()));
    head.add(eye);
    eyes.push(eye);
  }
  // Lower jaw: hinged under the head, drops when the hippo lets one go.
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.06, 0.28);
  jaw.add(
    new THREE.Mesh(
      mergeGeometries([
        skin(ball(0.28, 0, -0.1, 0.27, 1.15, 0.4, 1, 14), belly, 0.1),
        skin(place(new THREE.ConeGeometry(0.035, 0.1, 6), -0.15, 0.0, 0.46), cream, 0.1),
        skin(place(new THREE.ConeGeometry(0.035, 0.1, 6), 0.15, 0.0, 0.46), cream, 0.1),
      ])!,
      lambert(),
    ),
  );
  head.add(jaw);
  g.add(head);

  // A stub of a tail with a tuft.
  const tail = new THREE.Group();
  tail.position.set(0, 0.8, -0.78);
  tail.add(
    new THREE.Mesh(
      mergeGeometries([skin(ball(0.09, 0, 0.02, -0.06, 1, 1, 1.4, 8), dark, 0.1), skin(ball(0.07, 0, 0.06, -0.2, 1, 1, 1.1, 8), body, 0.1)])!,
      lambert(),
    ),
  );
  g.add(tail);
  return { group: g, head, jaw, eyes, ears, tail };
}

interface HippoRig {
  holder: THREE.Group;
  rig: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  eyes: THREE.Group[];
  ears: THREE.Group[];
  tail: THREE.Group;
  // When the hippo next blinks and flicks an ear.
  blinkAt: number;
  earAt: number;
  label: THREE.Sprite;
  marker: THREE.Mesh;
  puffTimer: number;
  walk: number;
  look: number;
  labelText: string;
  bubble: THREE.Sprite;
  sayUntil: number;
}

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  gravity: number;
  from: THREE.Color;
  to: THREE.Color;
}

const MAX_PARTICLES = 400;
const WATER_SIZE = 260;
const HIPPO_SCALE = 0.72;
const WATER_REPEAT = 7;

// How windy it is around the raft, 0..1, and which way it blows (dx: -1 left, 1 right; dz: -1 toward
// the camera). It's felt a little before the raft reaches a gust or a headwind, so you can see it coming.
export function windFeel(course: Course, view: { z: number; t: number }) {
  let i = 0;
  let dx = 0;
  let dz = 0;
  const reach = (start: number, len: number) => {
    if (view.z > start + len) return 0;
    const d = start - view.z;
    return d > 0 ? Math.max(0, 1 - d / 34) * 0.5 : 1;
  };
  for (const g of course.gusts) {
    const r = reach(g.z, g.len);
    if (r <= 0) continue;
    const a = gustAt(g, view.t) / Math.max(0.01, Math.abs(g.force));
    const w = r * (g.period > 0 ? 0.3 + 0.7 * Math.abs(a) : 1);
    if (w > i) {
      i = w;
      dx = a >= 0 ? 1 : -1;
      dz = 0;
    }
  }
  for (const h of course.headwinds) {
    const w = reach(h.z, h.len);
    if (w > i) {
      i = w;
      dx = 0;
      dz = -1;
    }
  }
  return { i, dx, dz };
}

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.5, 400);
  private course: Course = getCourse('lagoon');
  private disposables: { dispose(): void }[] = [];
  private clockT = 0;
  // Where the camera is, smoothed. camHeading is which way "up the screen" points in the world.
  private cam = { x: 0, z: -14, look: new THREE.Vector3(), heading: 0, shake: 0 };
  private water!: THREE.Mesh;
  private waterTex!: THREE.Texture;
  private raft = new THREE.Group();
  private raftBody = new THREE.Group();
  private raftSeats = 0;
  private rigs: HippoRig[] = [];
  private mines!: THREE.InstancedMesh;
  private sweepers: THREE.Mesh[] = [];
  private logs: THREE.Mesh[] = [];
  private boostPads: THREE.Mesh[] = [];
  private whirl: THREE.Mesh | null = null;
  private world = new THREE.Group();
  private levelOwned: { dispose(): void }[] = [];
  private levelBuild = false;
  private ringMeshes: THREE.Group[] = [];
  private gates: { grp: THREE.Group; bars: THREE.Group; lamps: THREE.Mesh[]; mode: number }[] = [];
  private winds: { tex: THREE.Texture; z: number; len: number }[] = [];
  private rails: { grp: THREE.Group; side: number; slack: number; x: number }[] = [];
  private gustFx: { tex: THREE.Texture; mesh: THREE.Mesh; g: Course["gusts"][number] }[] = [];
  private bubbleTex = new Map<string, THREE.Texture>();
  private ringsGot = new Set<number>();
  private geysers: { ring: THREE.Mesh; column: THREE.Mesh; spit: number }[] = [];
  private gators: THREE.Group[] = [];
  private spinners: THREE.Group[] = [];
  private bumpers: THREE.Group[] = [];
  private flags: THREE.Mesh[] = [];
  private flagsUp = -1;
  private particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, grow: 0, gravity: 0, from: C("#fff"), to: C("#fff") }));
  private puffMesh!: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private sky!: THREE.Group;
  private lastView: View | null = null;
  // For screenshots: [eye, target] replaces the follow camera.
  debugCam: [[number, number, number], [number, number, number]] | null = null;
  private seats = 4;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    // Phones have a lot of pixels and not much GPU: render a bit under native.
    const phone = window.matchMedia("(pointer: coarse)").matches;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2));
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.buildWorld();
    this.setSeats(4);
  }

  get heading() {
    return this.cam.heading;
  }

  resize(width: number, height: number) {
    this.gl.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Portrait phones need a wider field to see the same river.
    this.camera.fov = width / height < 1 ? 70 : 55;
    this.camera.updateProjectionMatrix();
  }

  // --- the world ----------------------------------------------------------------------

  private own<T extends { dispose(): void }>(d: T): T {
    (this.levelBuild ? this.levelOwned : this.disposables).push(d);
    return d;
  }

  // Swaps in a new river: everything specific to the old one is thrown away and rebuilt.
  setCourse(course: Course) {
    for (const d of this.levelOwned) d.dispose();
    this.levelOwned = [];
    this.world.clear();
    this.sweepers = [];
    this.logs = [];
    this.boostPads = [];
    this.flags = [];
    this.geysers = [];
    this.gators = [];
    this.spinners = [];
    this.bumpers = [];
    this.ringMeshes = [];
    this.gates = [];
    this.winds = [];
    this.rails = [];
    this.gustFx = [];
    this.ringsGot = new Set();
    this.whirl = null;
    this.flagsUp = -1;
    this.course = course;
    this.levelBuild = true;
    this.buildBanks();
    this.buildDecor();
    this.buildObstacles(course);
    this.buildLandmarks();
    this.levelBuild = false;
  }

  private buildWorld() {
    const { scene, course } = this;
    scene.background = this.own(
      canvasTexture(8, 256, (g) => {
        const grad = g.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, "#2a1d63");
        grad.addColorStop(0.45, "#a0457d");
        grad.addColorStop(0.8, "#ff9a62");
        grad.addColorStop(1, "#ffd08a");
        g.fillStyle = grad;
        g.fillRect(0, 0, 8, 256);
      }),
    );
    scene.fog = new THREE.Fog(0xe39a78, 55, 190);
    scene.add(new THREE.HemisphereLight(0xffd9b8, 0x4c5fa8, 1.25));
    const sun = new THREE.DirectionalLight(0xffe2b8, 1.6);
    sun.position.set(-30, 50, -20);
    scene.add(sun);

    // The moon and a scatter of stars ride along with the camera so they never come nearer.
    this.sky = new THREE.Group();
    const moon = new THREE.Mesh(this.own(new THREE.CircleGeometry(16, 32)), this.own(new THREE.MeshBasicMaterial({ color: 0xfff1c9, fog: false })));
    moon.position.set(-90, 95, 300);
    moon.rotation.y = Math.PI;
    this.sky.add(moon);
    scene.add(this.sky);

    this.buildWater();
    scene.add(this.world);
    this.setCourse(course);
    this.buildPuffs();
    scene.add(this.raft);
    this.raft.add(this.raftBody);
  }

  private buildWater() {
    this.waterTex = this.own(
      canvasTexture(
        256,
        256,
        (g) => {
          g.fillStyle = "#2b8fe0";
          g.fillRect(0, 0, 256, 256);
          const rng = mulberry32(5);
          g.lineCap = "round";
          for (let i = 0; i < 46; i++) {
            const x = rng() * 256;
            const y = rng() * 256;
            const len = 14 + rng() * 34;
            g.strokeStyle = rng() < 0.5 ? "rgba(255,255,255,0.28)" : "rgba(20,70,160,0.25)";
            g.lineWidth = 2 + rng() * 3;
            for (const dx of [-256, 0, 256]) {
              for (const dy of [-256, 0, 256]) {
                g.beginPath();
                g.moveTo(x + dx, y + dy);
                g.quadraticCurveTo(x + dx + len * 0.5, y + dy - 5, x + dx + len, y + dy);
                g.stroke();
              }
            }
          }
        },
        true,
      ),
    );
    this.waterTex.repeat.set(WATER_REPEAT, WATER_REPEAT);
    const mat = this.own(new THREE.MeshLambertMaterial({ map: this.waterTex, color: 0xffffff }));
    this.water = new THREE.Mesh(this.own(new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE)), mat);
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);
  }

  private buildBanks() {
    const { course } = this;
    const clay = C("#d4687a");
    const clayDark = C("#a8465f");
    const grass = C("#7fc24a");
    const grassFar = C("#4f9a3c");
    const zs: number[] = [];
    for (let z = -60; z <= course.length + 110; z += SEG) zs.push(z);
    const hedgeParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const pos: number[] = [];
      const col: number[] = [];
      const idx: number[] = [];
      const rows = (z: number) => {
        const e = course.centerX(z) + side * course.halfWidth(z);
        return [
          [e, -0.6, z, clayDark],
          [e, 0.55, z, clay],
          [e, 1.15, z, clay],
          [e + side * 0.9, 1.15, z, grass],
          [e + side * 7, 1.3, z, grass],
          [e + side * 60, 3.5, z, grassFar],
        ] as [number, number, number, THREE.Color][];
      };
      zs.forEach((z, i) => {
        for (const [x, y, zz, c] of rows(z)) {
          pos.push(x, y, zz);
          col.push(c.r, c.g, c.b);
        }
        if (i > 0) {
          for (let r = 0; r < 5; r++) {
            const a = (i - 1) * 6 + r;
            const b = i * 6 + r;
            idx.push(a, b, a + 1, a + 1, b, b + 1);
          }
        }
      });
      const geo = this.own(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      this.world.add(new THREE.Mesh(geo, this.own(lambert({ side: THREE.DoubleSide }))));
      // The rounded hedge along the water's edge.
      const curve = new THREE.CatmullRomCurve3(zs.map((z) => new THREE.Vector3(course.centerX(z) + side * (course.halfWidth(z) + 0.15), 1.45, z)));
      const tube = new THREE.TubeGeometry(curve, zs.length * 2, 0.5, 8, false);
      hedgeParts.push(tint(tube, "#4fae3e"));
    }
    this.world.add(new THREE.Mesh(this.own(mergeGeometries(hedgeParts)!), this.own(lambert())));
  }

  private buildDecor() {
    const { course } = this;
    const rng = mulberry32(77);
    const trunk = tint(new THREE.CylinderGeometry(0.28, 0.4, 3, 6).translate(0, 1.5, 0), "#6b4630");
    const canopy = mergeGeometries([
      tint(new THREE.IcosahedronGeometry(2.2, 1).translate(0, 4.2, 0), "#6bbf4a"),
      tint(new THREE.IcosahedronGeometry(1.6, 1).translate(1.2, 5.4, 0.4), "#7ccf55"),
      tint(new THREE.IcosahedronGeometry(1.4, 1).translate(-1.2, 3.6, -0.5), "#58a83f"),
    ])!;
    const trees = new THREE.InstancedMesh(mergeGeometries([trunk, canopy])!, this.own(lambert({ flatShading: true })), 400);
    const pumpkin = mergeGeometries([
      tint(new THREE.SphereGeometry(0.7, 10, 8).scale(1.1, 0.85, 1.1).translate(0, 0.6, 0), "#ff8a1f"),
      tint(new THREE.CylinderGeometry(0.08, 0.12, 0.3, 5).translate(0, 1.25, 0), "#4a6a24"),
    ])!;
    const pumpkins = new THREE.InstancedMesh(pumpkin, this.own(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x6a2a00 })), 110);
    const stone = tint(new THREE.BoxGeometry(0.9, 1.4, 0.3).translate(0, 0.7, 0), "#9a94b3");
    const stones = new THREE.InstancedMesh(stone, this.own(lambert()), 75);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const scale = new THREE.Vector3();
    const at = (i: number, mesh: THREE.InstancedMesh, z: number, minOff: number, maxOff: number, s: number, rotRange: number) => {
      const side = rng() < 0.5 ? -1 : 1;
      const x = course.centerX(z) + side * (course.halfWidth(z) + minOff + rng() * (maxOff - minOff));
      const k = s * (0.8 + rng() * 0.5);
      scale.set(k, k * (0.9 + rng() * 0.3), k);
      e.set(0, rng() * rotRange, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, 1.2, z), q, scale);
      mesh.setMatrixAt(i, m);
    };
    for (let i = 0; i < 400; i++) at(i, trees, -50 + rng() * (course.length + 130), 3, 38, 1, 6.28);
    for (let i = 0; i < 110; i++) at(i, pumpkins, -40 + rng() * (course.length + 100), 1.6, 7, 0.9, 6.28);
    for (let i = 0; i < 75; i++) at(i, stones, -40 + rng() * (course.length + 100), 2, 9, 1, 0.6);
    for (const mesh of [trees, pumpkins, stones]) {
      mesh.instanceMatrix.needsUpdate = true;
      this.world.add(mesh);
    }
  }

  private buildObstacles(course: Course) {
    // Boulders.
    const rng = mulberry32(91);
    for (const r of course.rocks) {
      const geo = new THREE.IcosahedronGeometry(r.r, 1);
      const pos = geo.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const k = 0.86 + rng() * 0.28;
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.85, pos.getZ(i) * k);
      }
      geo.computeVertexNormals();
      const body = new THREE.Mesh(this.own(tint(geo, "#9b94ad")), this.own(lambert({ flatShading: true })));
      body.position.set(r.x, 0.2, r.z);
      body.rotation.y = rng() * 6;
      const moss = new THREE.Mesh(this.own(tint(new THREE.SphereGeometry(r.r * 0.62, 8, 6).scale(1, 0.4, 1), "#6bbf4a")), this.own(lambert({ flatShading: true })));
      moss.position.set(r.x + r.r * 0.1, 0.2 + r.r * 0.62, r.z);
      this.world.add(body, moss);
    }
    // Spiked buoys.
    const spikes: THREE.BufferGeometry[] = [tint(new THREE.SphereGeometry(0.6, 12, 9).translate(0, 0.35, 0), "#7a2fd0")];
    const dir = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 12; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / 12);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      dir.set(Math.cos(theta) * Math.sin(phi), Math.cos(phi), Math.sin(theta) * Math.sin(phi));
      const cone = new THREE.ConeGeometry(0.17, 0.5, 6);
      cone.translate(0, 0.25 + 0.55, 0);
      cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
      cone.translate(0, 0.35, 0);
      spikes.push(tint(cone, "#f4ecd2"));
    }
    this.mines = new THREE.InstancedMesh(mergeGeometries(spikes)!, this.own(lambert({ flatShading: true })), Math.max(1, course.mines.length));
    this.mines.count = course.mines.length;
    this.world.add(this.mines);
    // Sweepers: a spiked log turning on a post in the bank.
    for (const s of course.sweepers) {
      const parts: THREE.BufferGeometry[] = [
        tint(new THREE.CylinderGeometry(0.42, 0.42, s.len, 10).rotateX(Math.PI / 2).translate(0, 0.55, s.len / 2), "#8a5a38"),
        tint(new THREE.CylinderGeometry(0.8, 0.9, 1.4, 10).translate(0, 0.6, 0), "#5a3a26"),
      ];
      for (let d = 1.2; d < s.len; d += 1.1) {
        for (const side of [-1, 1]) {
          parts.push(tint(new THREE.ConeGeometry(0.16, 0.7, 5).rotateZ((side * Math.PI) / 2).translate(side * 0.6, 0.55, d), "#f4ecd2"));
        }
      }
      const mesh = new THREE.Mesh(this.own(mergeGeometries(parts)!), this.own(lambert({ flatShading: true })));
      mesh.position.set(s.x, 0, s.z);
      this.world.add(mesh);
      this.sweepers.push(mesh);
    }
    // Logs.
    for (const l of course.logs) {
      const len = l.half * 2;
      const parts = [
        tint(new THREE.CylinderGeometry(l.r, l.r, len, 12).rotateZ(Math.PI / 2).translate(0, 0.25, 0), "#a06b3c"),
        tint(new THREE.CylinderGeometry(l.r * 0.8, l.r * 0.8, 0.1, 12).rotateZ(Math.PI / 2).translate(len / 2 + 0.02, 0.25, 0), "#e6c48e"),
        tint(new THREE.CylinderGeometry(l.r * 0.8, l.r * 0.8, 0.1, 12).rotateZ(Math.PI / 2).translate(-len / 2 - 0.02, 0.25, 0), "#e6c48e"),
        tint(new THREE.TorusGeometry(l.r + 0.03, 0.07, 6, 14).rotateY(Math.PI / 2).translate(-len * 0.2, 0.25, 0), "#6a4326"),
        tint(new THREE.TorusGeometry(l.r + 0.03, 0.07, 6, 14).rotateY(Math.PI / 2).translate(len * 0.2, 0.25, 0), "#6a4326"),
      ];
      const mesh = new THREE.Mesh(this.own(mergeGeometries(parts)!), this.own(lambert()));
      mesh.position.set(l.x, 0, l.z);
      this.world.add(mesh);
      this.logs.push(mesh);
    }
    // Boost pads.
    const padTex = this.own(
      canvasTexture(128, 128, (g) => {
        g.clearRect(0, 0, 128, 128);
        const rad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
        rad.addColorStop(0, "rgba(255,240,120,0.95)");
        rad.addColorStop(1, "rgba(255,200,40,0.35)");
        g.fillStyle = rad;
        g.beginPath();
        g.arc(64, 64, 62, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#a35a00";
        g.lineWidth = 12;
        g.lineCap = "round";
        g.lineJoin = "round";
        for (const y of [40, 76]) {
          g.beginPath();
          g.moveTo(34, y + 18);
          g.lineTo(64, y - 8);
          g.lineTo(94, y + 18);
          g.stroke();
        }
      }),
    );
    for (const b of course.boosts) {
      const pad = new THREE.Mesh(this.own(new THREE.CircleGeometry(b.r, 28)), this.own(new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, fog: false })));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(b.x, 0.06, b.z);
      this.world.add(pad);
      this.boostPads.push(pad);
    }
    this.buildHazards(course);
    this.buildCoop(course);
    this.buildFine(course);
    // The whirlpool.
    if (!course.vortex) return;
    const swirl = this.own(
      canvasTexture(256, 256, (g) => {
        g.clearRect(0, 0, 256, 256);
        g.translate(128, 128);
        for (let arm = 0; arm < 4; arm++) {
          g.beginPath();
          for (let t = 0; t < 1; t += 0.02) {
            const a = arm * (Math.PI / 2) + t * 5;
            const r = 10 + t * 112;
            const x = Math.cos(a) * r;
            const y = Math.sin(a) * r;
            if (t === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.strokeStyle = "rgba(255,255,255,0.55)";
          g.lineWidth = 9;
          g.lineCap = "round";
          g.stroke();
        }
        const rad = g.createRadialGradient(0, 0, 0, 0, 0, 128);
        rad.addColorStop(0, "rgba(10,40,110,0.8)");
        rad.addColorStop(0.5, "rgba(10,40,110,0.25)");
        rad.addColorStop(1, "rgba(10,40,110,0)");
        g.fillStyle = rad;
        g.fillRect(-128, -128, 256, 256);
      }),
    );
    this.whirl = new THREE.Mesh(this.own(new THREE.CircleGeometry(course.vortex.r, 48)), this.own(new THREE.MeshBasicMaterial({ map: swirl, transparent: true, depthWrite: false, fog: false })));
    this.whirl.rotation.x = -Math.PI / 2;
    this.whirl.position.set(course.vortex.x, 0.05, course.vortex.z);
    this.world.add(this.whirl);
  }

  // Geysers, lily pads, pumpkin bumpers, gators and paddle wheels.
  private buildHazards(course: Course) {
    const rng = mulberry32(404);
    // Geysers: a foamy ring on the water and a column that shoots up when they blow.
    const columnMat = this.own(new THREE.MeshBasicMaterial({ color: 0xcdf3ff, transparent: true, opacity: 0.75, depthWrite: false }));
    const ringMat = this.own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    for (const g of course.geysers) {
      const ring = new THREE.Mesh(this.own(new THREE.TorusGeometry(g.r * 0.55, 0.22, 6, 28).rotateX(Math.PI / 2)), ringMat);
      ring.position.set(g.x, 0.12, g.z);
      const vent = new THREE.Mesh(this.own(tint(new THREE.CylinderGeometry(g.r * 0.4, g.r * 0.5, 0.2, 20).translate(0, 0.02, 0), "#1f6fb0")), this.own(lambert()));
      vent.position.set(g.x, 0, g.z);
      const column = new THREE.Mesh(this.own(new THREE.CylinderGeometry(1, 1.5, 1, 14, 1, true).translate(0, 0.5, 0)), columnMat);
      column.position.set(g.x, 0, g.z);
      column.visible = false;
      this.world.add(vent, ring, column);
      this.geysers.push({ ring, column, spit: 0 });
    }
    // Lily pads.
    const padGeo: THREE.BufferGeometry[] = [];
    for (const l of course.lily) {
      for (let i = 0; i < 16; i++) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * l.r * 0.9;
        const r = 0.6 + rng() * 0.6;
        padGeo.push(tint(new THREE.CylinderGeometry(r, r, 0.06, 12).translate(l.x + Math.cos(a) * d, 0.07, l.z + Math.sin(a) * d), rng() < 0.5 ? "#4fb04a" : "#3a9a52"));
        if (rng() < 0.22) padGeo.push(tint(new THREE.ConeGeometry(0.22, 0.4, 7).translate(l.x + Math.cos(a) * d, 0.3, l.z + Math.sin(a) * d), "#ff7aa8"));
      }
    }
    if (padGeo.length) this.world.add(new THREE.Mesh(this.own(mergeGeometries(padGeo)!), this.own(lambert())));
    // Pumpkin bumpers: round, ribbed, glowing.
    for (const b of course.bumpers) {
      const parts: THREE.BufferGeometry[] = [];
      for (let k = -2; k <= 2; k++) parts.push(skin(ball(b.r * 0.62, k * b.r * 0.26, b.r * 0.62, 0, 1, 0.95, 1.05, 12), k % 2 ? "#ff8a1f" : "#ff9a3a", 0.18));
      parts.push(skin(place(new THREE.CylinderGeometry(0.1, 0.16, 0.45, 6), 0, b.r * 1.35, 0), "#4a6a24", 0.1));
      parts.push(skin(place(new THREE.ConeGeometry(0.16, 0.3, 4), -b.r * 0.35, b.r * 0.8, b.r * 0.9).rotateX(0), "#2a1830", 0));
      parts.push(skin(place(new THREE.ConeGeometry(0.16, 0.3, 4), b.r * 0.35, b.r * 0.8, b.r * 0.9), "#2a1830", 0));
      const grp = new THREE.Group();
      const geo = mergeGeometries(parts)!;
      grp.add(new THREE.Mesh(geo, this.own(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x7a3200 }))));
      grp.add(outline(geo, 0.03));
      const base = new THREE.Mesh(this.own(new THREE.TorusGeometry(b.r * 1.05, 0.14, 6, 24).rotateX(Math.PI / 2)), ringMat);
      base.position.y = 0.1;
      grp.add(base);
      grp.position.set(b.x, 0, b.z);
      this.world.add(grp);
      this.bumpers.push(grp);
    }
    // Gators, lying along x with the snout toward +x.
    for (const g of course.gators) {
      const hide = "#3f8f3a";
      const parts: THREE.BufferGeometry[] = [
        skin(ball(1, 0, 0.2, 0, 1.25, 0.32, 0.55, 14), hide, 0.2),
        skin(ball(0.6, -1.5, 0.15, 0, 1.6, 0.22, 0.3, 10), hide, 0.2),
        skin(place(new THREE.BoxGeometry(1.0, 0.22, 0.5), 1.75, 0.18, 0), "#4aa343", 0.2),
        skin(place(new THREE.BoxGeometry(0.95, 0.12, 0.5), 1.78, 0.02, 0), "#d9e6a0", 0.1),
        skin(ball(0.14, 1.2, 0.5, -0.28, 1, 1, 1, 8), hide, 0.2),
        skin(ball(0.14, 1.2, 0.5, 0.28, 1, 1, 1, 8), hide, 0.2),
        skin(ball(0.07, 1.27, 0.55, -0.28, 1, 1, 1, 6), "#ffe45e", 0),
        skin(ball(0.07, 1.27, 0.55, 0.28, 1, 1, 1, 6), "#ffe45e", 0),
        skin(ball(0.03, 1.32, 0.56, -0.28, 1, 1, 1, 5), "#1b1030", 0),
        skin(ball(0.03, 1.32, 0.56, 0.28, 1, 1, 1, 5), "#1b1030", 0),
      ];
      for (let k = 0; k < 5; k++) parts.push(skin(place(new THREE.ConeGeometry(0.1, 0.22, 4), -1 + k * 0.5, 0.52, 0), "#2c6b2a", 0.1));
      for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) parts.push(skin(place(new THREE.ConeGeometry(0.035, 0.1, 4).rotateX(Math.PI), 1.4 + k * 0.22, 0.13, sd * 0.24), "#ffffff", 0));
      const grp = new THREE.Group();
      const geo = mergeGeometries(parts)!;
      grp.add(new THREE.Mesh(geo, this.own(lambert())));
      grp.add(outline(geo, 0.03));
      grp.scale.setScalar(0.85);
      grp.position.set(g.x, 0, g.z);
      this.world.add(grp);
      this.gators.push(grp);
    }
    // Spinning things: friendly paddle wheels with striped blades, and spiked propellers that hurt.
    for (const sp of course.spinners) {
      const bars = sp.bars ?? 2;
      const parts: THREE.BufferGeometry[] = [
        skin(place(new THREE.CylinderGeometry(0.85, 1, 0.9, 14), 0, 0.4, 0), sp.hazard ? "#5a3a26" : "#e07a3c", 0.15),
        skin(place(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 12), 0, 0.92, 0), sp.hazard ? "#e0483a" : "#ffd23a", 0.1),
      ];
      for (let k = 0; k < bars; k++) {
        const rot = (k * Math.PI) / bars;
        const turn = (geo: THREE.BufferGeometry) => geo.rotateY(rot);
        if (sp.hazard) {
          parts.push(skin(turn(new THREE.CylinderGeometry(0.42, 0.42, sp.len * 2, 10).rotateX(Math.PI / 2).translate(0, 0.55, 0)), "#8a5a38", 0.15));
          for (let d = -sp.len + 0.9; d < sp.len - 0.3; d += 1.1) {
            for (const side of [-1, 1]) parts.push(skin(turn(new THREE.ConeGeometry(0.16, 0.7, 5).rotateZ((side * Math.PI) / 2).translate(side * 0.6, 0.55, d)), "#f4ecd2", 0.1));
          }
          for (const sd of [-1, 1]) parts.push(skin(turn(new THREE.ConeGeometry(0.22, 0.8, 6).rotateX((sd * Math.PI) / 2).translate(0, 0.55, sd * (sp.len + 0.2))), "#f4ecd2", 0.1));
        } else {
          parts.push(skin(turn(new THREE.BoxGeometry(0.5, 0.4, sp.len * 2).translate(0, 0.55, 0)), "#8a5a38", 0.15));
          for (const sd of [-1, 1]) parts.push(skin(turn(new THREE.BoxGeometry(1.5, 0.7, 0.35).translate(0, 0.6, sd * (sp.len - 0.1))), (sd > 0) === (k % 2 === 0) ? "#ffd23a" : "#ff7a3a", 0.15));
        }
      }
      const grp = new THREE.Group();
      const geo = mergeGeometries(parts)!;
      grp.add(new THREE.Mesh(geo, this.own(lambert({ flatShading: !!sp.hazard }))));
      grp.add(outline(geo, 0.03));
      grp.position.set(sp.x, 0, sp.z);
      this.world.add(grp);
      this.spinners.push(grp);
    }
    // Rings to fly through: each is worth a second off your time.
    const hoop = this.own(mergeGeometries([skin(new THREE.TorusGeometry(1.8, 0.17, 8, 30), "#ffd23a", 0.2), skin(new THREE.TorusGeometry(1.8, 0.05, 6, 30).translate(0, 0, 0.12), "#fff6b0", 0)])!);
    const hoopMat = this.own(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x9a7000 }));
    const glow = this.own(new THREE.CircleGeometry(1.75, 24));
    const glowMat = this.own(new THREE.MeshBasicMaterial({ color: 0xffe45e, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    for (const r of course.rings) {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(hoop, hoopMat), new THREE.Mesh(glow, glowMat));
      grp.position.set(r.x, 1.9, r.z);
      this.world.add(grp);
      this.ringMeshes.push(grp);
    }
  }

  // Teamwork sections: lock gates that wait for a chorus, and headwinds.
  private buildCoop(course: Course) {
    const iron = this.own(lambert({ flatShading: true }));
    for (const g of course.gates) {
      const grp = new THREE.Group();
      grp.position.set(g.x, 0, g.z);
      const span = g.hw + 1.6;
      const stone: THREE.BufferGeometry[] = [skin(place(new THREE.BoxGeometry(span * 2 + 2.4, 1.1, 1.8), 0, 7.8, 0), "#8f8aa8", 0.2)];
      for (const sd of [-1, 1]) {
        stone.push(skin(place(new THREE.BoxGeometry(2.4, 8.6, 2.4), sd * span, 4.3, 0), "#8f8aa8", 0.2));
        stone.push(skin(place(new THREE.BoxGeometry(3, 0.7, 3), sd * span, 8.8, 0), "#6f6a88", 0.2));
      }
      const geo = mergeGeometries(stone)!;
      grp.add(new THREE.Mesh(geo, iron), outline(geo, 0.04));
      const bars = new THREE.Group();
      const barGeo: THREE.BufferGeometry[] = [];
      for (let x = -span + 1.5; x <= span - 1.4; x += 1.4) barGeo.push(skin(place(new THREE.CylinderGeometry(0.17, 0.17, 7.2, 8), x, 3.6, 0), "#3d3858", 0.25));
      for (const y of [1.4, 3.6, 5.8]) barGeo.push(skin(place(new THREE.BoxGeometry(span * 2 - 2, 0.25, 0.35), 0, y, 0), "#4a4468", 0.2));
      bars.add(new THREE.Mesh(mergeGeometries(barGeo)!, iron));
      grp.add(bars);
      // Lamps along the beam: the crew's progress (taps so far, or how full the chorus is).
      const n = g.mode === 1 ? g.count : 8;
      const lamps: THREE.Mesh[] = [];
      const lampGeo = this.own(new THREE.SphereGeometry(0.3, 10, 8));
      for (let k = 0; k < n; k++) {
        const lamp = new THREE.Mesh(lampGeo, this.own(new THREE.MeshBasicMaterial({ color: 0x40395a })));
        lamp.position.set((k - (n - 1) / 2) * Math.min(1.1, (span * 1.6) / n), 7.8, -1.05);
        grp.add(lamp);
        lamps.push(lamp);
      }
      this.world.add(grp);
      this.gates.push({ grp, bars, lamps, mode: g.mode });
    }
    const chev = this.own(
      canvasTexture(
        128,
        128,
        (g) => {
          g.clearRect(0, 0, 128, 128);
          g.strokeStyle = "rgba(255,255,255,0.75)";
          g.lineWidth = 12;
          g.lineCap = "round";
          g.lineJoin = "round";
          g.beginPath();
          g.moveTo(24, 98);
          g.lineTo(64, 52);
          g.lineTo(104, 98);
          g.stroke();
        },
        true,
      ),
    );
    for (const w of course.headwinds) {
      const hw = course.halfWidth(w.z + w.len / 2) * 2 + 1;
      const tex = chev.clone();
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(Math.round(hw / 4.5), Math.max(1, Math.round(w.len / 4.5)));
      this.own(tex);
      const mat = this.own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xd8f4ff, opacity: 0.55 }));
      const plane = new THREE.Mesh(this.own(new THREE.PlaneGeometry(hw, w.len)), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(course.centerX(w.z + w.len / 2), 0.12, w.z + w.len / 2);
      this.world.add(plane);
      const foam = this.own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
      for (const edge of [w.z, w.z + w.len]) {
        const bar = new THREE.Mesh(this.own(new THREE.PlaneGeometry(hw, 0.7)), foam);
        bar.rotation.x = -Math.PI / 2;
        bar.position.set(course.centerX(edge), 0.14, edge);
        this.world.add(bar);
      }
      this.winds.push({ tex, z: w.z, len: w.len });
    }
  }

  // Fine-tuning obstacles: tight channels between spiked rails, and crosswinds.
  private buildFine(course: Course) {
    const mat = this.own(lambert({ flatShading: true }));
    for (const n of course.needles) {
      for (const side of [-1, 1]) {
        const parts: THREE.BufferGeometry[] = [skin(place(new THREE.BoxGeometry(0.7, 1, n.len), 0, 0.5, n.len / 2), "#efe6cf", 0.2), skin(place(new THREE.BoxGeometry(0.76, 0.3, n.len), 0, 0.9, n.len / 2), "#9a3ad0", 0.15)];
        for (let z = 0.8; z < n.len; z += 1.5) parts.push(skin(place(new THREE.ConeGeometry(0.2, 0.9, 5).rotateZ((-side * Math.PI) / 2), -side * 0.7, 0.75, z), "#f4ecd2", 0.1));
        // The flared mouth: plain mud banks that only guide you in.
        const len = Math.hypot(4, 8);
        const guide = skin(place(new THREE.BoxGeometry(0.7, 0.8, len), 0, 0.4, 0), "#a8465f", 0.2);
        guide.rotateY(Math.atan2(-side * 4, 8));
        guide.translate(side * 2, 0, -4);
        parts.push(guide);
        const geo = mergeGeometries(parts)!;
        const grp = new THREE.Group();
        grp.add(new THREE.Mesh(geo, mat), outline(geo, 0.03));
        grp.position.set(n.x, 0, n.z);
        this.world.add(grp);
        this.rails.push({ grp, side, slack: n.slack, x: n.x });
      }
    }
    const arrows = this.own(
      canvasTexture(
        128,
        128,
        (g) => {
          g.clearRect(0, 0, 128, 128);
          g.strokeStyle = "rgba(255,255,255,0.8)";
          g.lineWidth = 11;
          g.lineCap = "round";
          g.lineJoin = "round";
          g.beginPath();
          g.moveTo(22, 64);
          g.lineTo(106, 64);
          g.moveTo(76, 36);
          g.lineTo(106, 64);
          g.lineTo(76, 92);
          g.stroke();
        },
        true,
      ),
    );
    for (const gu of course.gusts) {
      const hw = course.halfWidth(gu.z + gu.len / 2) * 2 + 1;
      const tex = arrows.clone();
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(Math.max(1, Math.round(hw / 5)), Math.max(1, Math.round(gu.len / 5)));
      this.own(tex);
      const mesh = new THREE.Mesh(this.own(new THREE.PlaneGeometry(hw, gu.len)), this.own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xfff0b0, opacity: 0.7 })));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(course.centerX(gu.z + gu.len / 2), 0.11, gu.z + gu.len / 2);
      this.world.add(mesh);
      this.gustFx.push({ tex, mesh, g: gu });
    }
  }

  // A speech bubble over a hippo's head, for the crew's call-outs.
  private makeBubble(holder: THREE.Group) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
    s.scale.set(2.6, 1.1, 1);
    s.position.set(0, 2.85, 0);
    s.renderOrder = 12;
    s.visible = false;
    holder.add(s);
    return s;
  }

  say(seat: number, text: string) {
    const rig = this.rigs[seat];
    if (!rig) return;
    let tex = this.bubbleTex.get(text);
    if (!tex) {
      tex = canvasTexture(256, 112, (g) => {
        g.fillStyle = "#1b1030";
        g.beginPath();
        g.roundRect(6, 6, 244, 70, 24);
        g.moveTo(112, 74);
        g.lineTo(128, 104);
        g.lineTo(144, 74);
        g.fill();
        g.fillStyle = "#fff7e0";
        g.beginPath();
        g.roundRect(12, 12, 232, 58, 19);
        g.fill();
        g.fillStyle = "#1b1030";
        g.font = "bold 40px 'Trebuchet MS', 'Arial Black', sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, 128, 42);
      });
      this.bubbleTex.set(text, tex);
    }
    rig.bubble.material.map = tex;
    rig.bubble.material.needsUpdate = true;
    rig.sayUntil = this.clockT + 2.4;
  }

  // Start and finish arches, and a flag at each checkpoint.
  private buildLandmarks() {
    const { course } = this;
    const sign = (text: string, bg: string, fg: string, w: number) => {
      const tex = this.own(
        canvasTexture(512, 128, (g) => {
          g.fillStyle = "#e07a3c";
          g.fillRect(0, 0, 512, 128);
          g.fillStyle = bg;
          g.fillRect(10, 10, 492, 108);
          g.fillStyle = fg;
          g.font = "bold 88px 'Trebuchet MS', 'Arial Black', sans-serif";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.lineWidth = 10;
          g.strokeStyle = "rgba(0,0,0,0.35)";
          g.strokeText(text, 256, 68);
          g.fillText(text, 256, 68);
        }),
      );
      const mesh = new THREE.Mesh(this.own(new THREE.PlaneGeometry(w, 5)), this.own(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })));
      return mesh;
    };
    const arch = (z: number, text: string, bg: string, fg: string) => {
      const hw = course.halfWidth(z);
      const cx = course.centerX(z);
      const brick = this.own(lambert({ flatShading: true }));
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(this.own(tint(new THREE.BoxGeometry(1.4, 13, 1.4).translate(0, 6, 0), "#e07a3c")), brick);
        post.position.set(cx + side * (hw + 0.1), 0, z);
        this.world.add(post);
      }
      const board = sign(text, bg, fg, hw * 2 + 3);
      board.position.set(cx, 13.2, z);
      // Seen from upriver, so it faces back down the course.
      board.rotation.y = Math.PI;
      this.world.add(board);
    };
    arch(14, "START", "#3a9bd0", "#ffe45e");
    arch(course.finishZ, "FINISH", "#d03a8a", "#fff4a8");
    // Checkpoints: a flag on each bank. They turn from grey to green once the crew has passed.
    course.checkpoints.forEach((z) => {
      const hw = course.halfWidth(z);
      const cx = course.centerX(z);
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(this.own(tint(new THREE.CylinderGeometry(0.1, 0.12, 6, 6).translate(0, 3, 0), "#f1e6cf")), this.own(lambert()));
        pole.position.set(cx + side * (hw + 1.4), 1.2, z);
        const flag = new THREE.Mesh(this.own(new THREE.PlaneGeometry(2.4, 1.4).translate(1.2 * -side, 0, 0)), this.own(new THREE.MeshBasicMaterial({ color: 0x8a8aa0, side: THREE.DoubleSide })));
        flag.position.set(cx + side * (hw + 1.4), 6.2, z);
        flag.rotation.y = Math.PI / 2;
        this.world.add(pole, flag);
        this.flags.push(flag);
      }
    });
  }

  private buildPuffs() {
    const geo = this.own(new THREE.IcosahedronGeometry(1, 1));
    const mat = this.own(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.puffMesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.puffMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    this.puffMesh.frustumCulled = false;
    this.scene.add(this.puffMesh);
  }

  // --- the raft and its crew --------------------------------------------------------------

  setSeats(seats: number) {
    if (seats === this.raftSeats) return;
    this.seats = seats;
    this.raftSeats = seats;
    this.raftBody.clear();
    for (const r of this.rigs) {
      r.label.material.map?.dispose();
      r.label.material.dispose();
    }
    this.rigs = [];
    const R = raftRadius(seats);
    // Ring: red tube with cream bands.
    const ringGeo = new THREE.TorusGeometry(R - 0.4, 0.42, 12, 48).toNonIndexed();
    ringGeo.rotateX(Math.PI / 2);
    ringGeo.deleteAttribute("uv");
    const pos = ringGeo.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 3) {
      // One colour per triangle, by where its middle sits round the ring, so the bands stay crisp.
      const a = Math.atan2(pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2), pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2));
      const band = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16) % 2;
      const c = band ? C("#fff0d6") : C("#e0483a");
      for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
    }
    ringGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    ringGeo.translate(0, 0.28, 0);
    const deck = tint(new THREE.CylinderGeometry(R - 0.5, R - 0.5, 0.3, 36).translate(0, 0.14, 0), "#7ccf7a");
    const deckRing = tint(new THREE.CylinderGeometry(R - 0.8, R - 0.8, 0.34, 36).translate(0, 0.15, 0), "#a6e29c");
    const hull = tint(new THREE.CylinderGeometry(R - 0.1, R - 0.45, 0.5, 36).translate(0, -0.05, 0), "#58c9d9");
    // Rope grab-lines round the tube, a ring pattern on the deck, and the inflation valve.
    const trim: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const loop = new THREE.TorusGeometry(0.2, 0.04, 6, 12, Math.PI).rotateX(Math.PI / 2).rotateY(-a + Math.PI / 2);
      loop.translate(Math.sin(a) * (R - 0.4), 0.62, Math.cos(a) * (R - 0.4));
      trim.push(tint(loop, "#f6ecd2"));
    }
    trim.push(tint(new THREE.TorusGeometry(R - 1.15, 0.05, 6, 36).rotateX(Math.PI / 2).translate(0, 0.33, 0), "#3a9a4a"));
    trim.push(tint(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8).translate(Math.sin(2.4) * (R - 0.4), 0.72, Math.cos(2.4) * (R - 0.4)), "#ffd23a"));
    const body = new THREE.Mesh(this.own(mergeGeometries([ringGeo, deck, deckRing, hull, ...trim])!), this.own(lambert()));
    this.raftBody.add(body);
    for (let i = 0; i < seats; i++) {
      const look = HIPPO_LOOKS[i];
      const { group, head, jaw, eyes, ears, tail } = buildHippo(look, i);
      const holder = new THREE.Group();
      const s = HIPPO_SCALE;
      group.scale.setScalar(s);
      holder.add(group);
      const label = nameSprite("", "#fff");
      label.position.set(0, 1.9, 0);
      holder.add(label);
      const marker = new THREE.Mesh(this.own(new THREE.ConeGeometry(0.22, 0.45, 4).rotateX(Math.PI)), this.own(new THREE.MeshBasicMaterial({ color: 0xffe45e, depthTest: false })));
      marker.position.set(0, 2.6, 0);
      marker.renderOrder = 11;
      marker.visible = false;
      holder.add(marker);
      this.raftBody.add(holder);
      this.rigs.push({ holder, rig: group, head, jaw, eyes, ears, tail, blinkAt: 1 + Math.random() * 3, earAt: 2 + Math.random() * 4, label, marker, puffTimer: 0, walk: 0, look: i, labelText: "", bubble: this.makeBubble(holder), sayUntil: 0 });
    }
  }

  private emit(p: Omit<Partial<Particle>, "from" | "to"> & { from: string | THREE.Color; to: string | THREE.Color }) {
    const slot = this.particles.find((q) => !q.alive);
    if (!slot) return;
    Object.assign(slot, { alive: true, age: 0, life: 0.8, size: 0.5, grow: 0, gravity: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, p);
    slot.from = typeof p.from === "string" ? C(p.from) : p.from;
    slot.to = typeof p.to === "string" ? C(p.to) : p.to;
  }

  burst(x: number, z: number, kind: "splash" | "hit" | "sink" | "cp") {
    const n = kind === "splash" ? 8 : kind === "cp" ? 22 : 18;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * (kind === "hit" ? 5 : 3);
      this.emit({
        x,
        y: 0.5,
        z,
        vx: Math.cos(a) * sp,
        vy: 2 + Math.random() * 3,
        vz: Math.sin(a) * sp,
        life: 0.6 + Math.random() * 0.5,
        size: kind === "cp" ? 0.22 : 0.25,
        gravity: 9,
        from: kind === "hit" ? "#ffe45e" : kind === "cp" ? (Math.random() < 0.5 ? "#7cff8a" : "#ffe45e") : "#ffffff",
        to: kind === "hit" ? "#ff6a3a" : "#8fd0ff",
      });
    }
  }

  // --- frame ----------------------------------------------------------------------------------

  update(view: View, dt: number, hits: { x: number; z: number }[] = []) {
    this.lastView = view;
    this.clockT += dt;
    const t = this.clockT;
    this.setSeats(view.h.length);
    for (const h of hits) {
      this.burst(h.x, h.z, "hit");
      this.cam.shake = 1;
    }

    // Raft.
    const sinking = view.sunk > 0;
    const sink = sinking ? Math.min(1, 1 - view.sunk / 2.6) : 0;
    const bob = Math.sin(t * 2.1) * 0.07 + Math.sin(t * 3.3 + 1) * 0.04;
    this.raft.position.set(view.x, bob - sink * 2.2, view.z);
    this.raft.rotation.set(Math.sin(t * 1.7) * 0.025 + sink * 0.4, view.yaw, Math.cos(t * 1.3) * 0.025 + view.vx * -0.012);
    // Rotation order: keep yaw first so the tilt stays on the raft's own axes.
    this.raft.rotation.order = "YXZ";
    this.raft.visible = !(view.inv && !sinking && Math.floor(t * 12) % 2 === 0);

    // Hippos.
    const seatR = seatRadius(this.seats);
    view.h.forEach((state, i) => {
      const rig = this.rigs[i];
      const [ang, farting, , spent, mv] = state;
      rig.holder.position.set(Math.sin(ang) * seatR, 0.38, Math.cos(ang) * seatR);
      rig.holder.rotation.y = ang + Math.PI;
      rig.walk += mv !== 0 ? dt * 9 : 0;
      const waddle = mv !== 0 ? Math.sin(rig.walk) * 0.12 : 0;
      const push = farting ? Math.sin(t * 38) * 0.05 : 0;
      rig.rig.rotation.z = waddle;
      rig.rig.scale.set(HIPPO_SCALE * (1 + push), HIPPO_SCALE * (1 - push * 0.8 + (spent ? -0.05 : 0)), HIPPO_SCALE * (1 + push * 0.5));
      rig.rig.position.y = Math.abs(waddle) * 0.4 + (farting ? Math.abs(Math.sin(t * 25)) * 0.05 : 0);
      // Faces: blink, flick an ear, strain and gape when letting one go, droop when out of beans.
      const fr = farting ? 1 : 0;
      rig.blinkAt -= dt;
      const blink = rig.blinkAt < 0.12 && rig.blinkAt > 0 ? 0.12 : 1;
      if (rig.blinkAt <= 0) rig.blinkAt = 1.5 + Math.random() * 3.5;
      const squint = farting ? 0.45 : spent ? 0.6 : 1;
      for (const eye of rig.eyes) eye.scale.set(1, Math.min(blink, squint), 1);
      rig.jaw.rotation.x = lerpTo(rig.jaw.rotation.x, fr ? 0.5 + Math.sin(t * 30) * 0.12 : spent ? 0.18 : 0, dt, 18);
      rig.head.rotation.x = lerpTo(rig.head.rotation.x, spent && !farting ? 0.3 : fr ? -0.18 : Math.sin(t * 1.8 + i) * 0.03, dt, 10);
      rig.head.rotation.z = fr ? Math.sin(t * 34) * 0.06 : 0;
      rig.earAt -= dt;
      if (rig.earAt <= 0) rig.earAt = 2 + Math.random() * 4;
      const flick = rig.earAt > 1.8 ? Math.sin((rig.earAt - 1.8) * 40) * 0.5 : 0;
      rig.ears.forEach((ear, k) => (ear.rotation.z = (k ? -1 : 1) * (fr ? 0.5 : flick)));
      rig.tail.rotation.y = fr ? Math.sin(t * 36) * 0.7 : Math.sin(t * 2.5 + i) * 0.15;
      rig.tail.position.y = 0.8 + fr * 0.08;
      const talking = t < rig.sayUntil;
      rig.bubble.visible = talking;
      if (talking) {
        const age = 2.4 - (rig.sayUntil - t);
        const pop = age < 0.2 ? 0.6 + (age / 0.2) * 0.4 : 1;
        rig.bubble.scale.set(2.6 * pop, 1.1 * pop, 1);
        rig.bubble.position.y = 2.85 + Math.sin(t * 6) * 0.04;
      }
      const mine = i === view.me;
      rig.marker.visible = mine;
      rig.marker.position.y = 2.6 + Math.sin(t * 5) * 0.15;
      const label = view.names[i] ?? "";
      if (label !== rig.labelText) {
        rig.labelText = label;
        rig.label.material.map?.dispose();
        const fresh = nameSprite(label, mine ? "#ffe45e" : view.humans[i] ? "#ffffff" : "#c9c3e0");
        rig.label.material.map = fresh.material.map;
        rig.label.material.needsUpdate = true;
        fresh.material.dispose();
      }
      rig.label.visible = !!label;
      // Fart clouds out of the tail.
      if (farting) {
        rig.puffTimer -= dt;
        if (rig.puffTimer <= 0) {
          rig.puffTimer = 0.035;
          const wa = view.yaw + ang;
          const ox = Math.sin(wa);
          const oz = Math.cos(wa);
          const px = view.x + ox * (seatR + 0.9);
          const pz = view.z + oz * (seatR + 0.9);
          this.emit({
            x: px,
            y: 0.7 + Math.random() * 0.3,
            z: pz,
            vx: ox * (3 + Math.random() * 2) + view.vx + (Math.random() - 0.5) * 1.2,
            vy: 0.4 + Math.random() * 0.8,
            vz: oz * (3 + Math.random() * 2) + view.vz + (Math.random() - 0.5) * 1.2,
            life: 0.6 + Math.random() * 0.5,
            size: 0.16,
            grow: 0.9 + Math.random() * 0.5,
            from: Math.random() < 0.5 ? "#c2f23c" : "#9be03a",
            to: "#e6f78c",
          });
          if (Math.random() < 0.3) {
            this.emit({ x: px, y: 0.1, z: pz, vx: ox * 2, vy: 1.5, vz: oz * 2, life: 0.5, size: 0.14, gravity: 8, from: "#ffffff", to: "#8fd0ff" });
          }
        }
      } else rig.puffTimer = 0;
    });

    // Obstacles that move by themselves.
    const sim = view.t;
    const m = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3(1, 1, 1);
    this.course.mines.forEach((mine, i) => {
      pos.set(mine.x, Math.sin(t * 2 + i * 1.7) * 0.07 - 0.1, mine.z);
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i + t * 0.3);
      m.compose(pos, quat, sc);
      this.mines.setMatrixAt(i, m);
    });
    this.mines.instanceMatrix.needsUpdate = true;
    this.course.sweepers.forEach((s, i) => {
      this.sweepers[i].rotation.y = s.phase + s.speed * sim;
    });
    this.course.logs.forEach((l, i) => {
      const { x } = logAt(l, sim);
      this.logs[i].position.set(x, Math.sin(t * 2 + i) * 0.05, l.z);
      this.logs[i].rotation.x = Math.sin(sim * 2 + i) * 0.1;
    });
    this.boostPads.forEach((p, i) => {
      const s = 1 + Math.sin(t * 6 + i) * 0.06;
      p.scale.set(s, s, s);
    });
    if (this.whirl) this.whirl.rotation.z = -t * 0.9;
    // Lock gates: lamps fill as the crew sings, and the portcullis lifts when it opens.
    this.gates.forEach((gt, i) => {
      const [open, charge, taps] = view.gt[i] ?? [0, 0, 0];
      const lit = gt.mode === 1 ? taps : Math.round(charge * gt.lamps.length);
      gt.lamps.forEach((lamp, k) => {
        const mat = lamp.material as THREE.MeshBasicMaterial;
        mat.color.set(open ? 0x5cff7a : k < lit ? 0xffe45e : 0x40395a);
        lamp.scale.setScalar(k < lit || open ? 1.15 + Math.sin(t * 8 + k) * 0.08 : 1);
      });
      const target = open ? 7.8 : charge * 0.9 + (gt.mode === 0 && charge > 0 ? Math.sin(t * 30) * 0.05 : 0);
      gt.bars.position.y += (target - gt.bars.position.y) * Math.min(1, dt * (open ? 3 : 8));
    });
    // Rails sit just outside the raft, whichever size it is.
    const railR = raftRadius(this.seats);
    for (const r of this.rails) r.grp.position.x = r.x + r.side * (railR + r.slack + 0.45);
    // Crosswinds: the arrows swing with the gusts.
    for (const f of this.gustFx) {
      const a = gustAt(f.g, view.t);
      const mag = Math.min(1, Math.abs(a) / Math.max(0.01, Math.abs(f.g.force)));
      f.mesh.scale.x = a >= 0 ? 1 : -1;
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.05 + mag * 0.2;
      f.tex.offset.x = a >= 0 ? -t * 0.8 * mag : t * 0.8 * mag;
      if (Math.abs(view.z - f.g.z - f.g.len / 2) < 30 && Math.random() < mag * 0.7) {
        this.emit({ x: this.course.centerX(f.g.z) + (a >= 0 ? -9 : 9), y: 0.5 + Math.random(), z: f.g.z + Math.random() * f.g.len, vx: a >= 0 ? 9 : -9, vy: 0.2, vz: 0, life: 0.7, size: 0.1, from: "#ffffff", to: "#ffe9a0" });
      }
    }
    // Wind you can see coming: streaks of air across the screen, before and during a gust.
    const wind = windFeel(this.course, view);
    for (let n = 0; n < 4; n++) {
      if (wind.i < 0.04 || Math.random() > wind.i) continue;
      const sp = 10 + wind.i * 10;
      this.emit({
        x: view.x + (Math.random() - 0.5) * 26 - wind.dx * 12,
        y: 0.5 + Math.random() * 4,
        z: view.z + Math.random() * 20 - 5 - wind.dz * 6,
        vx: wind.dx * sp,
        vy: 0,
        vz: wind.dz * sp * 1.4,
        life: 0.6,
        size: 0.09 + wind.i * 0.05,
        from: "#ffffff",
        to: "#cfe8ff",
      });
    }
    // Headwinds stream back toward the camera.
    for (const w of this.winds) {
      w.tex.offset.y = -t * 0.9;
      if (Math.abs(view.z - w.z - w.len / 2) < 28 && Math.random() < 0.6) {
        const cx = this.course.centerX(w.z);
        this.emit({ x: cx + (Math.random() - 0.5) * this.course.halfWidth(w.z) * 1.8, y: 0.5 + Math.random() * 0.6, z: w.z + Math.random() * w.len, vx: 0, vy: 0.3, vz: -7, life: 0.55, size: 0.12, from: "#ffffff", to: "#a8e0ff" });
      }
    }
    // Rings pop when the crew flies through; a new run brings them all back.
    const gotNow = new Set(view.rg);
    if (view.rg.length < this.ringsGot.size) this.ringsGot = new Set();
    this.ringMeshes.forEach((m, i) => {
      const got = gotNow.has(i);
      if (got && !this.ringsGot.has(i)) this.burst(m.position.x, m.position.z, "cp");
      m.scale.setScalar(m.scale.x + ((got ? 0 : 1) - m.scale.x) * Math.min(1, dt * 9));
      m.visible = m.scale.x > 0.03;
      m.position.y = 1.9 + Math.sin(t * 2.2 + i) * 0.12;
      m.rotation.y = Math.sin(t * 1.3 + i) * 0.25;
    });
    this.ringsGot = gotNow;
    this.course.geysers.forEach((g, i) => {
      const fx = this.geysers[i];
      const st = geyserAt(g, sim);
      const near = Math.abs(g.z - view.z) < 70;
      fx.column.visible = st.state === "erupt";
      if (st.state === "erupt") {
        const k = Math.sin(Math.min(1, st.k * 1.3) * Math.PI * 0.5);
        const fall = st.k > 0.7 ? 1 - (st.k - 0.7) / 0.3 : 1;
        fx.column.scale.set(g.r * 0.32 * (1 + 0.1 * Math.sin(t * 40)), 7.5 * k * fall, g.r * 0.32 * (1 + 0.1 * Math.cos(t * 37)));
        if (near) for (let n = 0; n < 2; n++) this.emit({ x: g.x + (Math.random() - 0.5) * 1.5, y: 5 * k * fall, z: g.z + (Math.random() - 0.5) * 1.5, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.8, size: 0.28, gravity: 9, from: "#ffffff", to: "#8fd0ff" });
      } else if (st.state === "warn" && near) {
        fx.spit -= dt;
        if (fx.spit <= 0) {
          fx.spit = 0.07;
          const a = Math.random() * Math.PI * 2;
          this.emit({ x: g.x + Math.cos(a) * g.r * 0.4, y: 0.2, z: g.z + Math.sin(a) * g.r * 0.4, vx: 0, vy: 1.5 + st.k * 3, vz: 0, life: 0.6, size: 0.14, gravity: 5, from: "#ffffff", to: "#bfe6ff" });
        }
      }
      const pulse = st.state === "warn" ? 1 + Math.sin(t * (12 + st.k * 20)) * 0.12 : st.state === "erupt" ? 1.25 : 1;
      fx.ring.scale.setScalar(pulse);
    });
    this.course.gators.forEach((g, i) => {
      const { x, vx } = logAt(g, sim);
      const m = this.gators[i];
      m.position.set(x, Math.sin(t * 3 + i) * 0.04, g.z);
      const face = vx >= 0 ? 0 : Math.PI;
      m.rotation.y += (face - m.rotation.y) * 0.2;
      m.rotation.z = Math.sin(t * 6 + i) * 0.04;
    });
    this.course.spinners.forEach((sp, i) => {
      this.spinners[i].rotation.y = sp.phase + sp.speed * sim;
    });
    this.bumpers.forEach((b, i) => {
      const k = 1 + Math.sin(t * 3 + i * 2) * 0.04;
      b.scale.set(k, 1 / k, k);
    });
    // Flags: green once passed.
    if (view.cp !== this.flagsUp) {
      this.flagsUp = view.cp;
      this.flags.forEach((f, i) => {
        const done = Math.floor(i / 2) <= view.cp;
        (f.material as THREE.MeshBasicMaterial).color.set(done ? 0x4ee06a : 0x8a8aa0);
      });
    }
    this.flags.forEach((f, i) => {
      f.rotation.y = Math.PI / 2 + Math.sin(t * 4 + i) * 0.12;
    });

    this.updateParticles(dt);
    this.updateCamera(view, dt);
    this.updateWater(t);
    this.gl.render(this.scene, this.camera);
  }

  private updateParticles(dt: number) {
    const d = this.dummy;
    const color = new THREE.Color();
    let i = 0;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.gravity && p.y < 0.1) {
        p.alive = false;
        continue;
      }
      // Drag, so clouds hang about instead of flying off.
      const drag = Math.max(0, 1 - 1.8 * dt);
      p.vx *= drag;
      p.vz *= drag;
      const k = p.age / p.life;
      const size = (p.size + p.grow * p.age) * (1 - k * k * 0.7);
      d.position.set(p.x, p.y, p.z);
      d.scale.setScalar(size);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.puffMesh.setMatrixAt(i, d.matrix);
      color.copy(p.from).lerp(p.to, k);
      this.puffMesh.setColorAt(i, color);
      i++;
    }
    this.puffMesh.count = i;
    this.puffMesh.instanceMatrix.needsUpdate = true;
    if (this.puffMesh.instanceColor) this.puffMesh.instanceColor.needsUpdate = true;
  }

  private updateCamera(view: View, dt: number) {
    const { course, cam, camera } = this;
    const ahead = 10;
    // Look down the river, turning with its bends.
    const targetHeading = Math.atan2(course.centerX(view.z + ahead * 2) - course.centerX(view.z), ahead * 2) * 0.7;
    const k = 1 - Math.exp(-2.2 * dt);
    cam.heading += (targetHeading - cam.heading) * k;
    const back = 10.5;
    const high = 8.2;
    const bx = view.x - Math.sin(cam.heading) * back;
    const bz = view.z - Math.cos(cam.heading) * back;
    const follow = 1 - Math.exp(-5 * dt);
    cam.x += (bx - cam.x) * follow;
    cam.z += (bz - cam.z) * follow;
    cam.shake = Math.max(0, cam.shake - dt * 3);
    const sh = cam.shake * cam.shake * 0.5;
    camera.position.set(cam.x + (Math.random() - 0.5) * sh, high + (Math.random() - 0.5) * sh, cam.z + (Math.random() - 0.5) * sh);
    const lx = view.x + Math.sin(cam.heading) * 4 + view.vx * 0.3;
    const lz = view.z + Math.cos(cam.heading) * 4 + view.vz * 0.3;
    cam.look.x += (lx - cam.look.x) * follow;
    cam.look.z += (lz - cam.look.z) * follow;
    camera.lookAt(cam.look.x, 0, cam.look.z);
    if (this.debugCam) {
      camera.position.set(...this.debugCam[0]);
      camera.lookAt(...this.debugCam[1]);
    }
    this.sky.position.set(camera.position.x, 0, camera.position.z);
  }

  private updateWater(t: number) {
    const { camera, water, waterTex } = this;
    // The plane follows the camera; the texture slides with the current so the water looks fixed in the world and flowing.
    const px = Math.round(camera.position.x / 10) * 10;
    const pz = Math.round(camera.position.z / 10) * 10 + 60;
    water.position.set(px, 0, pz);
    const k = WATER_REPEAT / WATER_SIZE;
    const flow = this.lastView ? this.course.flowAt(this.lastView.x, this.lastView.z)[1] : 1.2;
    waterTex.offset.set(k * px, k * (flow * t - pz));
  }

  // The camera has to follow the raft even when nothing is moving (the title screen).
  snapCamera(view: View) {
    this.cam.x = view.x;
    this.cam.z = view.z - 10.5;
    this.cam.look.set(view.x, 0, view.z + 5);
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.puffMesh.dispose();
    this.gl.dispose();
  }
}
