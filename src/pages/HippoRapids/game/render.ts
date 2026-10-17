// Draws Hippo Rapids: a smooth, cartoon-bright river at dusk, seen from behind the raft.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  CHECKPOINTS,
  FINISH_Z,
  getCourse,
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

// A chunky hippo, nose toward +z, tail toward -z.
function buildHippo(look: { body: string; belly: string }) {
  const g = new THREE.Group();
  const body = C(look.body);
  const belly = C(look.belly);
  const dark = body.clone().multiplyScalar(0.62);
  const parts: THREE.BufferGeometry[] = [
    tint(place(new THREE.SphereGeometry(0.5, 16, 12), 0, 0.5, -0.05, 1.05, 0.9, 1.3), body),
    tint(place(new THREE.SphereGeometry(0.5, 14, 10), 0, 0.32, 0.0, 0.85, 0.45, 1.05), belly),
    // head and snout
    tint(place(new THREE.SphereGeometry(0.42, 16, 12), 0, 0.72, 0.62, 1, 0.9, 1), body),
    tint(place(new THREE.SphereGeometry(0.4, 16, 12), 0, 0.58, 0.95, 1.15, 0.75, 0.85), belly),
    tint(place(new THREE.SphereGeometry(0.06, 8, 6), -0.17, 0.66, 1.24), dark),
    tint(place(new THREE.SphereGeometry(0.06, 8, 6), 0.17, 0.66, 1.24), dark),
    // eyes: whites with pupils looking forward
    tint(place(new THREE.SphereGeometry(0.1, 10, 8), -0.2, 1.05, 0.68), "#ffffff"),
    tint(place(new THREE.SphereGeometry(0.1, 10, 8), 0.2, 1.05, 0.68), "#ffffff"),
    tint(place(new THREE.SphereGeometry(0.05, 8, 6), -0.2, 1.06, 0.77), "#161022"),
    tint(place(new THREE.SphereGeometry(0.05, 8, 6), 0.2, 1.06, 0.77), "#161022"),
    // ears
    tint(place(new THREE.SphereGeometry(0.1, 8, 6), -0.36, 1.1, 0.45, 1, 1.2, 0.8), dark),
    tint(place(new THREE.SphereGeometry(0.1, 8, 6), 0.36, 1.1, 0.45, 1, 1.2, 0.8), dark),
    // tail
    tint(place(new THREE.SphereGeometry(0.1, 8, 6), 0, 0.72, -0.72, 1, 1, 1.3), dark),
  ];
  for (const [x, z] of [[-0.35, 0.35], [0.35, 0.35], [-0.35, -0.4], [0.35, -0.4]]) {
    parts.push(tint(place(new THREE.CylinderGeometry(0.15, 0.17, 0.4, 8), x, 0.2, z), dark));
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts)!, lambert());
  g.add(mesh);
  return { group: g };
}

interface HippoRig {
  holder: THREE.Group;
  rig: THREE.Group;
  label: THREE.Sprite;
  marker: THREE.Mesh;
  puffTimer: number;
  walk: number;
  look: number;
  labelText: string;
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
const HIPPO_SCALE = 0.62;
const WATER_REPEAT = 7;

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.5, 400);
  private course: Course = getCourse();
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
  private whirl!: THREE.Mesh;
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
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
    this.disposables.push(d);
    return d;
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
    this.buildBanks();
    this.buildDecor();
    this.buildObstacles(course);
    this.buildLandmarks();
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
    for (let z = -60; z <= 640; z += SEG) zs.push(z);
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
      this.scene.add(new THREE.Mesh(geo, this.own(lambert({ side: THREE.DoubleSide }))));
      // The rounded hedge along the water's edge.
      const curve = new THREE.CatmullRomCurve3(zs.map((z) => new THREE.Vector3(course.centerX(z) + side * (course.halfWidth(z) + 0.15), 1.45, z)));
      const tube = new THREE.TubeGeometry(curve, zs.length * 2, 0.5, 8, false);
      hedgeParts.push(tint(tube, "#4fae3e"));
    }
    this.scene.add(new THREE.Mesh(this.own(mergeGeometries(hedgeParts)!), this.own(lambert())));
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
    const trees = new THREE.InstancedMesh(mergeGeometries([trunk, canopy])!, this.own(lambert({ flatShading: true })), 320);
    const pumpkin = mergeGeometries([
      tint(new THREE.SphereGeometry(0.7, 10, 8).scale(1.1, 0.85, 1.1).translate(0, 0.6, 0), "#ff8a1f"),
      tint(new THREE.CylinderGeometry(0.08, 0.12, 0.3, 5).translate(0, 1.25, 0), "#4a6a24"),
    ])!;
    const pumpkins = new THREE.InstancedMesh(pumpkin, this.own(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x6a2a00 })), 90);
    const stone = tint(new THREE.BoxGeometry(0.9, 1.4, 0.3).translate(0, 0.7, 0), "#9a94b3");
    const stones = new THREE.InstancedMesh(stone, this.own(lambert()), 60);
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
    for (let i = 0; i < 320; i++) at(i, trees, -50 + rng() * 680, 3, 38, 1, 6.28);
    for (let i = 0; i < 90; i++) at(i, pumpkins, -40 + rng() * 650, 1.6, 7, 0.9, 6.28);
    for (let i = 0; i < 60; i++) at(i, stones, -40 + rng() * 650, 2, 9, 1, 0.6);
    for (const mesh of [trees, pumpkins, stones]) {
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
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
      this.scene.add(body, moss);
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
    this.scene.add(this.mines);
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
      this.scene.add(mesh);
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
      this.scene.add(mesh);
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
      this.scene.add(pad);
      this.boostPads.push(pad);
    }
    // The whirlpool.
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
    this.scene.add(this.whirl);
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
        this.scene.add(post);
      }
      const board = sign(text, bg, fg, hw * 2 + 3);
      board.position.set(cx, 13.2, z);
      // Seen from upriver, so it faces back down the course.
      board.rotation.y = Math.PI;
      this.scene.add(board);
    };
    arch(14, "START", "#3a9bd0", "#ffe45e");
    arch(FINISH_Z, "FINISH", "#d03a8a", "#fff4a8");
    // Checkpoints: a flag on each bank. They turn from grey to green once the crew has passed.
    CHECKPOINTS.forEach((z) => {
      const hw = course.halfWidth(z);
      const cx = course.centerX(z);
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(this.own(tint(new THREE.CylinderGeometry(0.1, 0.12, 6, 6).translate(0, 3, 0), "#f1e6cf")), this.own(lambert()));
        pole.position.set(cx + side * (hw + 1.4), 1.2, z);
        const flag = new THREE.Mesh(this.own(new THREE.PlaneGeometry(2.4, 1.4).translate(1.2 * -side, 0, 0)), this.own(new THREE.MeshBasicMaterial({ color: 0x8a8aa0, side: THREE.DoubleSide })));
        flag.position.set(cx + side * (hw + 1.4), 6.2, z);
        flag.rotation.y = Math.PI / 2;
        this.scene.add(pole, flag);
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
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getX(i), pos.getZ(i));
      const band = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16) % 2;
      const c = band ? C("#fff0d6") : C("#e0483a");
      col.set([c.r, c.g, c.b], i * 3);
    }
    ringGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    ringGeo.translate(0, 0.28, 0);
    const deck = tint(new THREE.CylinderGeometry(R - 0.5, R - 0.5, 0.3, 36).translate(0, 0.14, 0), "#7ccf7a");
    const deckRing = tint(new THREE.CylinderGeometry(R - 0.8, R - 0.8, 0.34, 36).translate(0, 0.15, 0), "#a6e29c");
    const hull = tint(new THREE.CylinderGeometry(R - 0.1, R - 0.45, 0.5, 36).translate(0, -0.05, 0), "#58c9d9");
    const body = new THREE.Mesh(this.own(mergeGeometries([ringGeo, deck, deckRing, hull])!), this.own(lambert()));
    this.raftBody.add(body);
    for (let i = 0; i < seats; i++) {
      const look = HIPPO_LOOKS[i];
      const { group } = buildHippo(look);
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
      this.rigs.push({ holder, rig: group, label, marker, puffTimer: 0, walk: 0, look: i, labelText: "" });
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
      rig.holder.position.set(Math.sin(ang) * seatR, 0.3, Math.cos(ang) * seatR);
      rig.holder.rotation.y = ang + Math.PI;
      rig.walk += mv !== 0 ? dt * 9 : 0;
      const waddle = mv !== 0 ? Math.sin(rig.walk) * 0.12 : 0;
      const push = farting ? Math.sin(t * 38) * 0.05 : 0;
      rig.rig.rotation.z = waddle;
      rig.rig.scale.set(HIPPO_SCALE * (1 + push), HIPPO_SCALE * (1 - push * 0.8 + (spent ? -0.05 : 0)), HIPPO_SCALE * (1 + push * 0.5));
      rig.rig.position.y = Math.abs(waddle) * 0.4 + (farting ? Math.abs(Math.sin(t * 25)) * 0.05 : 0);
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
    this.whirl.rotation.z = -t * 0.9;
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
    const back = 9.5;
    const high = 7.4;
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
    this.cam.z = view.z - 9.5;
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
