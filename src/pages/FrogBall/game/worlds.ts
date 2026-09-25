// The five dream worlds: sky shader settings, stage colours, and the floating
// scenery around each stage.
import * as THREE from "three";
import type { Tone } from "./stages";

export interface Palette {
  sky: { top: string; mid: string; horizon: string; bottom: string };
  sun: { dir: [number, number, number]; color: string; size: number; moon?: boolean };
  clouds?: { amount: number; color: string };
  stars?: number;
  nebula?: { amount: number; a: string; b: string };
  aurora?: number;
  rays?: number;
  stripes?: number;
  fog: { color: string; near: number; far: number };
  light: { sky: string; ground: string; sun: string; sunIntensity: number; ambient: number };
  tones: Record<Tone, { top: string; side: string; line: string; glow?: boolean }>;
}

const tone = (top: string, side: string, line: string, glow = false) => ({ top, side, line, glow });

export const PALETTES: Palette[] = [
  // Lily Dawn
  {
    sky: { top: "#7b6cf0", mid: "#ff9ec8", horizon: "#ffd6a0", bottom: "#f59ab8" },
    sun: { dir: [0.25, 0.1, -1], color: "#fff4c8", size: 0.012 },
    clouds: { amount: 0.85, color: "#fff0f4" },
    fog: { color: "#ffc6bd", near: 45, far: 170 },
    light: { sky: "#ffe8f0", ground: "#8a6ab8", sun: "#fff0d8", sunIntensity: 1.5, ambient: 0.9 },
    tones: {
      floor: tone("#9eeab4", "#4f9e7a", "#6fc995"),
      alt: tone("#fff1c9", "#c9a07a", "#f5d9a0"),
      wall: tone("#ff9ec0", "#c76a93", "#ff7fae"),
      bumper: tone("#ff6f9f", "#b8406c", "#ffd1e2", true),
      spring: tone("#ff5a6a", "#b0304a", "#ffffff", true),
      cap: tone("#f7a6cf", "#b5669a", "#ffffff"),
      moving: tone("#8fd8ff", "#4a86b8", "#c8efff"),
      goal: tone("#ffffff", "#ffd6ea", "#ff9ec8"),
      pillar: tone("#dcc9ff", "#9a84d6", "#c2aaff"),
    },
  },
  // Candy Carnival
  {
    sky: { top: "#5fd3ff", mid: "#ffb0e8", horizon: "#fff2a6", bottom: "#ff85d6" },
    sun: { dir: [-0.5, 0.35, -1], color: "#fffbe0", size: 0.01 },
    clouds: { amount: 0.7, color: "#ffd7f3" },
    stripes: 0.6,
    fog: { color: "#ffc8ee", near: 50, far: 180 },
    light: { sky: "#fff0fa", ground: "#7a5ab8", sun: "#ffffff", sunIntensity: 1.5, ambient: 0.95 },
    tones: {
      floor: tone("#ff9ad5", "#c2508f", "#ffc6e8"),
      alt: tone("#fffaf2", "#d6a7c4", "#ffd1ea"),
      wall: tone("#7de0ff", "#3f98c2", "#c2f1ff"),
      bumper: tone("#ffd84a", "#d08a1a", "#ff5ab0", true),
      spring: tone("#ff5a6a", "#b0304a", "#ffffff", true),
      cap: tone("#ff9ad5", "#c2508f", "#ffffff"),
      moving: tone("#b2f27a", "#6aa83a", "#e2ffc2"),
      goal: tone("#ffffff", "#ffd6ea", "#7de0ff"),
      pillar: tone("#9f8cff", "#6a54d6", "#ffd84a"),
    },
  },
  // Bubble Lagoon
  {
    sky: { top: "#c6fff4", mid: "#35b7c9", horizon: "#1a78a6", bottom: "#082a58" },
    sun: { dir: [0.1, 1, -0.2], color: "#e8fffb", size: 0.03 },
    rays: 1,
    fog: { color: "#1f86ad", near: 25, far: 120 },
    light: { sky: "#c8fff5", ground: "#0b3a6a", sun: "#dffcff", sunIntensity: 1.35, ambient: 0.9 },
    tones: {
      floor: tone("#ffd9a0", "#b8875a", "#f2c080"),
      alt: tone("#ff9a86", "#b85a52", "#ffc2b5"),
      wall: tone("#7af0d8", "#34a890", "#c2fff0"),
      bumper: tone("#ff7ab8", "#b0407a", "#ffd1e8", true),
      spring: tone("#ff7ab8", "#b0407a", "#ffffff", true),
      cap: tone("#ffb2d4", "#b86a90", "#ffffff"),
      moving: tone("#c79bff", "#7a52c2", "#ecdcff", true),
      goal: tone("#ffffff", "#bff6ff", "#7af0d8"),
      pillar: tone("#5fe0c6", "#2a9a86", "#b5fff0"),
    },
  },
  // Moonshroom Grove
  {
    sky: { top: "#0e0930", mid: "#2f1a6e", horizon: "#c46ad8", bottom: "#3a1f72" },
    sun: { dir: [-0.45, 0.32, -1], color: "#fff4d2", size: 0.035, moon: true },
    clouds: { amount: 0.45, color: "#8a5ad0" },
    stars: 0.9,
    aurora: 0.8,
    fog: { color: "#4a2a86", near: 40, far: 160 },
    light: { sky: "#b9a6ff", ground: "#2a1450", sun: "#dcd4ff", sunIntensity: 1.1, ambient: 0.85 },
    tones: {
      floor: tone("#6f52c8", "#3a2680", "#7df9ff", true),
      alt: tone("#3a2d7a", "#1f1650", "#c77dff", true),
      wall: tone("#7df9ff", "#3aa6b8", "#e0fdff", true),
      bumper: tone("#ff6ad5", "#a0308a", "#ffe0f7", true),
      spring: tone("#ff4f6a", "#a02040", "#fff2c2", true),
      cap: tone("#ff8fe0", "#a04a90", "#fff2c2", true),
      moving: tone("#5affc8", "#2a9a7a", "#e0fff4", true),
      goal: tone("#fff4d2", "#c7b8ff", "#7df9ff"),
      pillar: tone("#e8dcc4", "#9c8a70", "#ffffff"),
    },
  },
  // Starlight Nebula
  {
    sky: { top: "#04020e", mid: "#140a36", horizon: "#3b1466", bottom: "#04020e" },
    sun: { dir: [0.6, 0.25, -1], color: "#ffe6ff", size: 0.004 },
    stars: 1,
    nebula: { amount: 1, a: "#ff4fd8", b: "#3fd0ff" },
    fog: { color: "#1c0d44", near: 60, far: 230 },
    light: { sky: "#d6d0ff", ground: "#2a0f55", sun: "#ffffff", sunIntensity: 1.3, ambient: 0.9 },
    tones: {
      floor: tone("#eaf4ff", "#8b8fd6", "#6fe7ff", true),
      alt: tone("#b8a6ff", "#5d4bb8", "#ffffff", true),
      wall: tone("#6fe7ff", "#2b8fb8", "#ffffff", true),
      bumper: tone("#ff4fd8", "#9a1f86", "#ffe0fa", true),
      spring: tone("#ffd84a", "#b88a1a", "#ffffff", true),
      cap: tone("#ffd84a", "#b88a1a", "#ffffff", true),
      moving: tone("#ffd84a", "#b88a1a", "#fff4c2", true),
      goal: tone("#ffffff", "#c9c2ff", "#ff4fd8"),
      pillar: tone("#a6b4ff", "#5a64c2", "#ffffff"),
    },
  },
];

// --- sky -----------------------------------------------------------------------

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w;
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop, uMid, uHorizon, uBottom, uSun, uSunDir, uCloud, uNebA, uNebB;
uniform float uSunSize, uTime, uStars, uClouds, uNebula, uAurora, uRays, uStripes, uMoon;
varying vec3 vDir;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float ang = atan(d.z, d.x);
  vec3 col = y > 0.0 ? mix(uHorizon, uMid, smoothstep(0.0, 0.3, y)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.45, y));
  col = mix(col, uTop, smoothstep(0.3, 0.95, y));

  if (uStripes > 0.0) {
    float s = sin(ang * 14.0 + uTime * 0.15 + y * 5.0);
    col = mix(col, col * 1.12 + 0.06, uStripes * smoothstep(0.0, 0.25, s) * smoothstep(-0.05, 0.25, y) * (1.0 - smoothstep(0.45, 0.85, y)));
  }
  if (uNebula > 0.0) {
    float n = fbm(d * 2.2 + vec3(0.0, uTime * 0.01, 0.0));
    float n2 = fbm(d * 3.6 + 7.0);
    col += uNebula * (uNebA * smoothstep(0.45, 0.82, n) + uNebB * smoothstep(0.5, 0.86, n2)) * 0.75;
  }
  if (uAurora > 0.0) {
    float band = fbm(vec3(d.x * 2.5, uTime * 0.05, d.z * 2.5));
    float h = smoothstep(0.1, 0.3, y) * (1.0 - smoothstep(0.4, 0.75, y));
    float curtain = pow(max(0.0, sin(ang * 4.0 + band * 7.0 + uTime * 0.25)), 3.0);
    col += uAurora * h * curtain * mix(vec3(0.2, 1.0, 0.65), vec3(0.75, 0.35, 1.0), smoothstep(0.1, 0.6, y)) * 0.8;
  }
  if (uStars > 0.0) {
    vec3 g = d * 160.0;
    vec3 id = floor(g);
    float h = hash(id);
    float s = smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * step(0.975, h);
    float tw = 0.55 + 0.45 * sin(uTime * (2.0 + h * 4.0) + h * 60.0);
    col += uStars * s * tw * smoothstep(-0.3, 0.1, y) * vec3(1.0, 0.95, 1.0);
  }
  if (uClouds > 0.0) {
    float k = 1.0 / (abs(y) + 0.22);
    float c = fbm(vec3(d.x * k * 1.3 + uTime * 0.015, d.z * k * 1.3, 2.0));
    float cm = smoothstep(0.48, 0.75, c) * smoothstep(-0.02, 0.1, y) * (1.0 - smoothstep(0.55, 0.9, y));
    col = mix(col, uCloud, cm * uClouds);
    // and a sea of cloud below the stages
    float c2 = fbm(vec3(d.x * k * 1.6 - uTime * 0.01, d.z * k * 1.6, 5.0));
    col = mix(col, mix(uCloud, uHorizon, 0.35), smoothstep(0.35, 0.6, c2) * smoothstep(-0.05, -0.2, y) * uClouds);
  }
  if (uRays > 0.0) {
    float r = pow(max(0.0, sin(ang * 9.0 + sin(uTime * 0.3 + ang * 3.0) * 1.5)), 6.0) * smoothstep(-0.2, 0.7, y);
    col += uRays * r * vec3(0.6, 1.0, 0.95) * 0.3;
    float caustic = fbm(vec3(d.xz * 9.0 / (y + 0.4), uTime * 0.4));
    col += uRays * smoothstep(0.55, 0.8, caustic) * smoothstep(0.5, 0.95, y) * 0.35;
  }
  float sd = dot(d, normalize(uSunDir));
  float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.85, sd);
  vec3 sc = uSun;
  if (uMoon > 0.0) sc *= 0.78 + 0.35 * fbm(d * 40.0);
  col = mix(col, sc, disc);
  col += uSun * (pow(max(sd, 0.0), 14.0) * 0.3 + pow(max(sd, 0.0), 220.0) * 0.45);
  gl_FragColor = vec4(col, 1.0);
}`;

const c = (s: string) => new THREE.Color(s);

export function makeSky(p: Palette) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: c(p.sky.top) },
      uMid: { value: c(p.sky.mid) },
      uHorizon: { value: c(p.sky.horizon) },
      uBottom: { value: c(p.sky.bottom) },
      uSun: { value: c(p.sun.color) },
      uSunDir: { value: new THREE.Vector3(...p.sun.dir) },
      uSunSize: { value: p.sun.size },
      uMoon: { value: p.sun.moon ? 1 : 0 },
      uCloud: { value: c(p.clouds?.color ?? "#ffffff") },
      uClouds: { value: p.clouds?.amount ?? 0 },
      uStars: { value: p.stars ?? 0 },
      uNebula: { value: p.nebula?.amount ?? 0 },
      uNebA: { value: c(p.nebula?.a ?? "#000000") },
      uNebB: { value: c(p.nebula?.b ?? "#000000") },
      uAurora: { value: p.aurora ?? 0 },
      uRays: { value: p.rays ?? 0 },
      uStripes: { value: p.stripes ?? 0 },
      uTime: { value: 0 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

// --- floating scenery ---------------------------------------------------------------

type Anim = (t: number) => void;
export interface Scenery {
  group: THREE.Group;
  update: Anim;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const lambert = (color: string, emissive?: string, opts: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, emissive: emissive ?? "#000000", ...opts });

// Places n things in a ring around the stage, away from where you play.
function around(rand: () => number, center: THREE.Vector3, radius: number, n: number, minR: number, maxR: number, yLo: number, yHi: number) {
  return Array.from({ length: n }, () => {
    const a = rand() * Math.PI * 2;
    const r = radius + minR + rand() * (maxR - minR);
    return new THREE.Vector3(center.x + Math.cos(a) * r, center.y + yLo + rand() * (yHi - yLo), center.z + Math.sin(a) * r);
  });
}

function cloudPuff(rand: () => number, color: string, size: number) {
  const g = new THREE.Group();
  const mat = lambert(color, color, { emissiveIntensity: 0.7 });
  const n = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(size * (0.5 + rand() * 0.6), 1), mat);
    m.position.set((i - n / 2) * size * 0.7, rand() * size * 0.4, (rand() - 0.5) * size);
    g.add(m);
  }
  return g;
}

function particles(count: number, center: THREE.Vector3, spread: number, height: number, color: string, size: number, rand: () => number) {
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = center.x + (rand() - 0.5) * spread;
    pos[i * 3 + 1] = center.y + (rand() - 0.5) * height;
    pos[i * 3 + 2] = center.z + (rand() - 0.5) * spread;
    seeds[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, pos, seeds, base: pos.slice() };
}

function lilyWorld(center: THREE.Vector3, radius: number): Scenery {
  const rand = rng(11);
  const group = new THREE.Group();
  const anims: Anim[] = [];
  const padMat = lambert("#63c77e", "#1f5a3a", { emissiveIntensity: 0.3 });
  const petal = lambert("#ffb3d6", "#ff7fb8", { emissiveIntensity: 0.35 });
  const heart = lambert("#fff08a", "#ffd84a", { emissiveIntensity: 0.5 });
  for (const p of around(rand, center, radius, 16, 22, 75, -40, -8)) {
    const g = new THREE.Group();
    const r = 4 + rand() * 9;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.6, 20, 1, false, 0.3, Math.PI * 2 - 0.6), padMat);
    g.add(pad);
    if (rand() < 0.6) {
      const flower = new THREE.Group();
      for (let i = 0; i < 8; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * 0.35, 4), petal);
        leaf.position.set(Math.sin((i / 8) * Math.PI * 2) * r * 0.1, r * 0.12, Math.cos((i / 8) * Math.PI * 2) * r * 0.1);
        leaf.rotation.set(Math.cos((i / 8) * Math.PI * 2) * 0.6, 0, -Math.sin((i / 8) * Math.PI * 2) * 0.6);
        flower.add(leaf);
      }
      const h = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.08, 0), heart);
      h.position.y = r * 0.14;
      flower.add(h);
      flower.position.set(r * 0.3, 0.2, 0);
      g.add(flower);
    }
    g.position.copy(p);
    g.rotation.set((rand() - 0.5) * 0.3, rand() * 6, (rand() - 0.5) * 0.3);
    const ph = rand() * 6;
    const y0 = p.y;
    anims.push((t) => {
      g.position.y = y0 + Math.sin(t * 0.5 + ph) * 1.2;
      g.rotation.y += 0.0008;
    });
    group.add(g);
  }
  for (const p of around(rand, center, radius, 14, 20, 90, -30, 25)) {
    const cl = cloudPuff(rand, "#fff0f6", 3 + rand() * 5);
    cl.position.copy(p);
    const sp = 0.3 + rand() * 0.4;
    const x0 = p.x;
    anims.push((t) => (cl.position.x = x0 + Math.sin(t * 0.05 * sp) * 8));
    group.add(cl);
  }
  // Dandelion seeds drifting up.
  const seeds = particles(260, center, radius * 2 + 60, 50, "#fff6e0", 0.35, rand);
  group.add(seeds.pts);
  anims.push((t) => {
    for (let i = 0; i < seeds.seeds.length; i++) {
      const s = seeds.seeds[i];
      seeds.pos[i * 3] = seeds.base[i * 3] + Math.sin(t * 0.3 + s * 20) * 2;
      seeds.pos[i * 3 + 1] = seeds.base[i * 3 + 1] + (((t * (0.6 + s) + s * 50) % 50) - 25);
    }
    seeds.pts.geometry.attributes.position.needsUpdate = true;
  });
  return { group, update: (t) => anims.forEach((a) => a(t)) };
}

function swirlTexture(a: string, b: string) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const x = cv.getContext("2d")!;
  x.fillStyle = a;
  x.fillRect(0, 0, 64, 64);
  x.strokeStyle = b;
  x.lineWidth = 4;
  x.beginPath();
  for (let i = 0; i < 200; i++) {
    const ang = i * 0.18;
    const r = i * 0.24;
    const px = 32 + Math.cos(ang) * r;
    const py = 32 + Math.sin(ang) * r;
    if (i === 0) x.moveTo(px, py);
    else x.lineTo(px, py);
  }
  x.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function candyWorld(center: THREE.Vector3, radius: number): Scenery {
  const rand = rng(22);
  const group = new THREE.Group();
  const anims: Anim[] = [];
  const colors = [
    ["#ff5ab0", "#ffffff"],
    ["#7de0ff", "#fff2a6"],
    ["#ffd84a", "#ff5ab0"],
    ["#b2f27a", "#ffffff"],
  ];
  const stickMat = lambert("#fffaf2");
  for (const p of around(rand, center, radius, 14, 14, 60, -30, 10)) {
    const [a, b] = colors[Math.floor(rand() * colors.length)];
    const s = 3 + rand() * 5;
    const g = new THREE.Group();
    const face = new THREE.MeshBasicMaterial({ map: swirlTexture(a, b) });
    const candy = new THREE.Mesh(new THREE.CylinderGeometry(s, s, s * 0.35, 24), [lambert(a), face, face]);
    candy.rotation.x = Math.PI / 2;
    g.add(candy);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.1, s * 0.1, s * 3, 6), stickMat);
    stick.position.y = -s * 1.6;
    g.add(stick);
    g.position.copy(p);
    g.lookAt(center.x, p.y, center.z);
    const ph = rand() * 6;
    anims.push((t) => {
      candy.rotation.y = t * 0.4 + ph;
      g.position.y = p.y + Math.sin(t * 0.6 + ph) * 1.5;
    });
    group.add(g);
  }
  // Gumdrops.
  for (const p of around(rand, center, radius, 18, 10, 70, -45, 15)) {
    const [a] = colors[Math.floor(rand() * colors.length)];
    const s = 1.5 + rand() * 3;
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.7), lambert(a, a, { emissiveIntensity: 0.3 }));
    m.position.copy(p);
    const ph = rand() * 6;
    anims.push((t) => {
      m.rotation.set(Math.sin(t * 0.3 + ph) * 0.4, t * 0.2 + ph, 0);
    });
    group.add(m);
  }
  // A far-off ferris wheel.
  const wheel = new THREE.Group();
  const wr = 26;
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(wr, 0.8, 6, 40), lambert("#ffffff", "#ffb0e8", { emissiveIntensity: 0.4 })));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.4, wr, 0.4), lambert("#ffe6f7"));
    spoke.position.set(Math.cos(a) * wr * 0.5, Math.sin(a) * wr * 0.5, 0);
    spoke.rotation.z = a - Math.PI / 2;
    wheel.add(spoke);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), lambert(colors[i % 4][0], colors[i % 4][0], { emissiveIntensity: 0.4 }));
    cab.position.set(Math.cos(a) * wr, Math.sin(a) * wr, 0);
    wheel.add(cab);
  }
  const wheelHolder = new THREE.Group();
  wheelHolder.add(wheel);
  wheelHolder.position.set(center.x - radius - 70, center.y - 10, center.z - 60);
  wheelHolder.lookAt(center);
  group.add(wheelHolder);
  anims.push((t) => {
    wheel.rotation.z = t * 0.08;
    wheel.children.forEach((ch, i) => {
      if (i > 0 && (i - 1) % 2 === 1) ch.rotation.z = -t * 0.08;
    });
  });
  for (const p of around(rand, center, radius, 10, 25, 90, -20, 25)) {
    const cl = cloudPuff(rand, "#ffd7f3", 3 + rand() * 4);
    cl.position.copy(p);
    group.add(cl);
  }
  const confetti = particles(300, center, radius * 2 + 50, 50, "#fff2a6", 0.3, rand);
  group.add(confetti.pts);
  anims.push((t) => {
    for (let i = 0; i < confetti.seeds.length; i++) {
      const s = confetti.seeds[i];
      confetti.pos[i * 3] = confetti.base[i * 3] + Math.sin(t * 0.7 + s * 30) * 1.5;
      confetti.pos[i * 3 + 1] = confetti.base[i * 3 + 1] - (((t * (1 + s) + s * 50) % 50) - 25);
    }
    confetti.pts.geometry.attributes.position.needsUpdate = true;
  });
  return { group, update: (t) => anims.forEach((a) => a(t)) };
}

function lagoonWorld(center: THREE.Vector3, radius: number): Scenery {
  const rand = rng(33);
  const group = new THREE.Group();
  const anims: Anim[] = [];
  const jellyCols = ["#ff9ad5", "#c79bff", "#7af0d8", "#fff08a"];
  for (const p of around(rand, center, radius, 16, 10, 55, -20, 20)) {
    const col = jellyCols[Math.floor(rand() * jellyCols.length)];
    const s = 1.5 + rand() * 3;
    const g = new THREE.Group();
    const bellMat = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, transparent: true, opacity: 0.75, flatShading: true });
    const bell = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), bellMat);
    g.add(bell);
    const tMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6 });
    const tentacles: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tt = new THREE.Mesh(new THREE.BoxGeometry(0.15, s * 2.2, 0.15), tMat);
      tt.position.set(Math.cos(a) * s * 0.5, -s * 1.1, Math.sin(a) * s * 0.5);
      tentacles.push(tt);
      g.add(tt);
    }
    g.position.copy(p);
    const ph = rand() * 6;
    const y0 = p.y;
    anims.push((t) => {
      const pulse = Math.sin(t * 1.6 + ph);
      bell.scale.set(1 + pulse * 0.12, 1 - pulse * 0.15, 1 + pulse * 0.12);
      g.position.y = y0 + Math.sin(t * 0.4 + ph) * 3 + t * 0.0;
      tentacles.forEach((tt, i) => (tt.rotation.z = Math.sin(t * 2 + i + ph) * 0.25));
    });
    group.add(g);
  }
  // Kelp rising from the deep.
  const kelpMat = lambert("#3fbf7a", "#1a6a4a", { emissiveIntensity: 0.3 });
  for (const p of around(rand, center, radius, 22, 12, 60, -60, -50)) {
    const g = new THREE.Group();
    const segs: THREE.Object3D[] = [];
    let parent: THREE.Object3D = g;
    const n = 8 + Math.floor(rand() * 8);
    for (let i = 0; i < n; i++) {
      const seg = new THREE.Group();
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4, 0.3), kelpMat);
      leaf.position.y = 2;
      seg.add(leaf);
      seg.position.y = i === 0 ? 0 : 4;
      parent.add(seg);
      parent = seg;
      segs.push(seg);
    }
    g.position.copy(p);
    const ph = rand() * 6;
    anims.push((t) => segs.forEach((s, i) => (s.rotation.z = Math.sin(t * 0.8 + ph + i * 0.5) * 0.08)));
    group.add(g);
  }
  // Sea floor far below.
  const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(300, 24), lambert("#e0c490", "#1a5a7a", { emissiveIntensity: 0.2 }));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(center.x, center.y - 60, center.z);
  group.add(floorMesh);
  const bubbles = particles(320, center, radius * 2 + 50, 70, "#dffcff", 0.45, rand);
  group.add(bubbles.pts);
  anims.push((t) => {
    for (let i = 0; i < bubbles.seeds.length; i++) {
      const s = bubbles.seeds[i];
      bubbles.pos[i * 3] = bubbles.base[i * 3] + Math.sin(t * 1.5 + s * 30) * 0.4;
      bubbles.pos[i * 3 + 1] = bubbles.base[i * 3 + 1] + (((t * (2 + s * 3) + s * 70) % 70) - 35);
    }
    bubbles.pts.geometry.attributes.position.needsUpdate = true;
  });
  return { group, update: (t) => anims.forEach((a) => a(t)) };
}

function dotTexture(cap: string, dot: string) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const x = cv.getContext("2d")!;
  x.fillStyle = cap;
  x.fillRect(0, 0, 32, 32);
  x.fillStyle = dot;
  for (const [dx, dy, r] of [
    [8, 8, 4],
    [24, 14, 3],
    [12, 24, 3],
    [27, 28, 2],
  ]) {
    x.beginPath();
    x.arc(dx, dy, r, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groveWorld(center: THREE.Vector3, radius: number): Scenery {
  const rand = rng(44);
  const group = new THREE.Group();
  const anims: Anim[] = [];
  const caps = ["#ff6ad5", "#7df9ff", "#c77dff", "#5affc8"];
  const stemMat = lambert("#e8dcc4", "#8a7aa0", { emissiveIntensity: 0.3 });
  for (const p of around(rand, center, radius, 16, 12, 60, -35, 12)) {
    const col = caps[Math.floor(rand() * caps.length)];
    const s = 2 + rand() * 5;
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.25, s * 0.35, s * 2.2, 7), stemMat);
    stem.position.y = -s * 1.1;
    g.add(stem);
    const tex = dotTexture(col, "#fff6d8");
    tex.repeat.set(3, 1);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(s, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: tex, emissive: col, emissiveIntensity: 0.55, flatShading: true })
    );
    g.add(cap);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s * 0.8, 0), lambert("#3a2d6a", "#1a1040"));
    rock.position.y = -s * 2.3;
    rock.scale.y = 0.6;
    g.add(rock);
    g.position.copy(p);
    g.rotation.z = (rand() - 0.5) * 0.4;
    const ph = rand() * 6;
    anims.push((t) => {
      g.position.y = p.y + Math.sin(t * 0.45 + ph) * 1.4;
      (cap.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.45 + Math.sin(t * 1.3 + ph) * 0.2;
    });
    group.add(g);
  }
  const flies = particles(220, center, radius * 2 + 40, 40, "#d8ff7a", 0.45, rand);
  group.add(flies.pts);
  anims.push((t) => {
    for (let i = 0; i < flies.seeds.length; i++) {
      const s = flies.seeds[i];
      flies.pos[i * 3] = flies.base[i * 3] + Math.sin(t * 0.5 + s * 40) * 3;
      flies.pos[i * 3 + 1] = flies.base[i * 3 + 1] + Math.sin(t * 0.7 + s * 20) * 2;
      flies.pos[i * 3 + 2] = flies.base[i * 3 + 2] + Math.cos(t * 0.4 + s * 30) * 3;
    }
    flies.pts.geometry.attributes.position.needsUpdate = true;
    (flies.pts.material as THREE.PointsMaterial).opacity = 0.7 + Math.sin(t * 3) * 0.2;
  });
  return { group, update: (t) => anims.forEach((a) => a(t)) };
}

function nebulaWorld(center: THREE.Vector3, radius: number): Scenery {
  const rand = rng(55);
  const group = new THREE.Group();
  const anims: Anim[] = [];
  // A ringed planet.
  const planet = new THREE.Group();
  planet.add(new THREE.Mesh(new THREE.IcosahedronGeometry(30, 2), lambert("#8f6bff", "#3a1a8a", { emissiveIntensity: 0.5 })));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(40, 58, 48, 1),
    new THREE.MeshBasicMaterial({ color: "#ffb0f0", side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
  );
  ring.rotation.x = Math.PI / 2.4;
  planet.add(ring);
  planet.position.set(center.x + radius + 90, center.y - 5, center.z - 80);
  group.add(planet);
  anims.push((t) => (planet.rotation.y = t * 0.03));
  const moon2 = new THREE.Mesh(new THREE.IcosahedronGeometry(8, 1), lambert("#6fe7ff", "#1a6a8a", { emissiveIntensity: 0.5 }));
  moon2.position.set(center.x - radius - 60, center.y + 25, center.z + 30);
  group.add(moon2);
  const shardCols = ["#ff4fd8", "#6fe7ff", "#ffd84a", "#b8a6ff"];
  for (const p of around(rand, center, radius, 24, 10, 60, -30, 20)) {
    const col = shardCols[Math.floor(rand() * shardCols.length)];
    const s = 0.8 + rand() * 2.5;
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), lambert(col, col, { emissiveIntensity: 0.7 }));
    m.scale.y = 1.8;
    m.position.copy(p);
    const ph = rand() * 6;
    const sp = 0.3 + rand();
    anims.push((t) => {
      m.rotation.set(t * 0.2 * sp, t * sp + ph, 0);
      m.position.y = p.y + Math.sin(t * 0.5 + ph) * 1.5;
    });
    group.add(m);
  }
  for (const p of around(rand, center, radius, 14, 20, 80, -40, 25)) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5 + rand() * 4, 0), lambert("#3b2f6a", "#150a30"));
    m.position.copy(p);
    const ph = rand() * 6;
    anims.push((t) => m.rotation.set(t * 0.1 + ph, t * 0.07, 0));
    group.add(m);
  }
  const dust = particles(300, center, radius * 2 + 60, 60, "#ffffff", 0.3, rand);
  group.add(dust.pts);
  anims.push((t) => {
    (dust.pts.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(t * 2) * 0.25;
  });
  return { group, update: (t) => anims.forEach((a) => a(t)) };
}

export const SCENERY = [lilyWorld, candyWorld, lagoonWorld, groveWorld, nebulaWorld];
