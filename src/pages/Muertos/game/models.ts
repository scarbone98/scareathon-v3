// Low-poly models, all built from boxes and cylinders and coloured per
// vertex: the props around San Juan, the zombies, and the guns in your hands.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "./sim";
import { WEAPONS, type WeaponId } from "./weapons";

export const C = (hex: string) => new THREE.Color(hex);

// Flat-shaded, with a colour on every vertex.
export function paint(geo: THREE.BufferGeometry, color: THREE.Color | ((x: number, y: number, z: number) => THREE.Color)) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = typeof color === "function" ? color(pos.getX(i), pos.getY(i), pos.getZ(i)) : color;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts)!;
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt: number, rb: number, h: number, seg: number, x = 0, y = 0, z = 0) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);

// ---------- props ----------

// Garita: the domed sentry box on the corners of San Juan's walls.
export function garita() {
  const sand = C("#d9c79c");
  const trim = C("#b9a577");
  const parts = [
    paint(cyl(1.05, 0.7, 1.0, 8, 0, 0.5, 0), trim),
    paint(cyl(0.85, 0.85, 1.9, 8, 0, 1.95, 0), (_x, y) => (y > 2.2 && y < 2.55 ? C("#2a2230") : sand)),
    paint(cyl(1.0, 1.0, 0.18, 8, 0, 2.95, 0), trim),
    paint(new THREE.SphereGeometry(0.88, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 3.02, 0), sand),
    paint(cyl(0.08, 0.14, 0.45, 5, 0, 4.05, 0), trim),
    paint(new THREE.SphereGeometry(0.12, 5, 3).translate(0, 4.32, 0), trim),
  ];
  return merge(parts);
}

// El Morro's lighthouse: a square tower, tapering, with the lamp on top.
export function lighthouse() {
  const wall = C("#dccb9e");
  const band = C("#b49a66");
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const w = 3.4 - i * 0.35;
    parts.push(paint(box(w, 3.2, w, 0, 1.6 + i * 3.2, 0), (_x, y) => (y - i * 3.2 > 2.9 ? band : wall)));
  }
  parts.push(paint(box(2.6, 0.3, 2.6, 0, 12.95, 0), band));
  parts.push(paint(cyl(0.8, 0.8, 1.3, 8, 0, 13.75, 0), C("#2e3a3a")));
  parts.push(paint(cyl(0.2, 0.95, 0.7, 8, 0, 14.75, 0), C("#3c4a46")));
  return merge(parts);
}

export function cannon() {
  const iron = C("#2c2d31");
  const wood = C("#5b3b22");
  const barrel = cyl(0.16, 0.26, 2.0, 7).rotateX(Math.PI / 2).translate(0, 0.72, -0.25);
  return merge([
    paint(box(0.9, 0.35, 1.3, 0, 0.35, 0.15), wood),
    paint(cyl(0.3, 0.3, 0.12, 8).rotateZ(Math.PI / 2).translate(-0.52, 0.3, -0.3), wood),
    paint(cyl(0.3, 0.3, 0.12, 8).rotateZ(Math.PI / 2).translate(0.52, 0.3, -0.3), wood),
    paint(cyl(0.3, 0.3, 0.12, 8).rotateZ(Math.PI / 2).translate(-0.52, 0.3, 0.55), wood),
    paint(cyl(0.3, 0.3, 0.12, 8).rotateZ(Math.PI / 2).translate(0.52, 0.3, 0.55), wood),
    paint(barrel, iron),
    paint(new THREE.SphereGeometry(0.2, 6, 4).translate(0, 0.72, 0.8), iron),
  ]);
}

// White marble tombs, some with a cross, some with a little angel.
export function tomb(seed: number) {
  const rnd = mulberry32(seed);
  const white = C("#e9e6dd").lerp(C("#c9c4b8"), rnd() * 0.6);
  const parts = [paint(box(1.7, 0.9, 1.1, 0, 0.45, 0), white), paint(box(1.85, 0.12, 1.25, 0, 0.96, 0), white)];
  if (rnd() < 0.5) {
    parts.push(paint(box(0.14, 1.1, 0.14, 0, 1.5, 0), white), paint(box(0.6, 0.14, 0.14, 0, 1.72, 0), white));
  } else {
    parts.push(
      paint(box(0.5, 0.6, 0.4, 0, 1.32, 0), white),
      paint(box(0.28, 0.5, 0.26, 0, 1.87, 0), white),
      paint(box(0.18, 0.18, 0.18, 0, 2.21, 0), white),
      paint(box(0.08, 0.5, 0.36, -0.2, 1.95, 0.08).rotateX(-0.3), white),
      paint(box(0.08, 0.5, 0.36, 0.2, 1.95, 0.08).rotateX(-0.3), white)
    );
  }
  return merge(parts);
}

export function palm(seed: number) {
  const rnd = mulberry32(seed);
  const trunk = C("#6a5a44");
  const leaf = C("#2f5a2e");
  const parts: THREE.BufferGeometry[] = [];
  const lean = (rnd() - 0.5) * 0.5;
  let x = 0;
  let y = 0;
  for (let i = 0; i < 6; i++) {
    const seg = cyl(0.13 - i * 0.012, 0.16 - i * 0.012, 1.25, 5).translate(x, y + 0.62, 0);
    parts.push(paint(seg, i % 2 ? trunk : C("#57493a")));
    y += 1.2;
    x += lean * (i / 5) * 0.4;
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.4;
    const frond = new THREE.PlaneGeometry(0.7, 2.6, 1, 3);
    const p = frond.getAttribute("position");
    for (let k = 0; k < p.count; k++) {
      const t = (p.getY(k) + 1.3) / 2.6;
      p.setZ(k, -t * t * 1.3);
      p.setX(k, p.getX(k) * (1 - t * 0.7));
    }
    frond.translate(0, 1.3, 0).rotateX(-1.25).rotateY(a).translate(x, y, 0);
    parts.push(paint(frond, leaf.clone().multiplyScalar(0.8 + rnd() * 0.4)));
  }
  return merge(parts);
}

// Ponce de León on his pedestal in Plaza de San José, cast in bronze.
export function statue() {
  const stone = C("#bfb7a6");
  const bronze = C("#3f5a48");
  const b2 = C("#34493b");
  return merge([
    paint(box(2.6, 0.5, 2.6, 0, 0.25, 0), stone),
    paint(box(1.6, 2.2, 1.6, 0, 1.6, 0), stone),
    paint(box(1.9, 0.3, 1.9, 0, 2.85, 0), stone),
    paint(box(0.5, 0.9, 0.34, 0, 3.5, 0), bronze),
    paint(box(0.58, 0.8, 0.4, 0, 4.3, 0), bronze),
    paint(box(0.3, 0.34, 0.3, 0, 4.9, 0), b2),
    paint(cyl(0.3, 0.3, 0.06, 8, 0, 5.1, 0), b2),
    paint(box(0.14, 0.7, 0.14, 0.38, 4.25, 0), bronze),
    paint(box(0.14, 0.14, 0.75, -0.38, 4.55, -0.3), bronze),
    paint(box(0.05, 0.05, 1.0, 0.44, 3.85, -0.1).rotateX(0.5), C("#8a8f86")),
  ]);
}

// San José church's bell gable, above its front.
export function espadana() {
  const white = C("#f1ece0");
  const dark = C("#221c24");
  const bronze = C("#8a6a2a");
  const parts = [paint(box(7, 3.4, 0.9, 0, 1.7, 0), white), paint(box(3.4, 1.6, 0.9, 0, 4.2, 0), white), paint(box(0.3, 0.9, 0.3, 0, 5.4, 0), white)];
  for (const [x, y, w, h] of [
    [-2, 1.7, 1.1, 1.8],
    [2, 1.7, 1.1, 1.8],
    [0, 4.1, 1.0, 1.1],
  ]) {
    parts.push(paint(box(w, h, 0.95, x, y, 0), dark));
    parts.push(paint(cyl(0.22, 0.34, 0.5, 6, x, y + 0.1, 0), bronze));
  }
  return merge(parts);
}

// A basketball hoop, facing -z: pole, backboard, orange rim, a ragged net.
export function hoop() {
  const rim = new THREE.TorusGeometry(0.23, 0.025, 4, 10).rotateX(Math.PI / 2).translate(0, 3.05, -0.95);
  return merge([
    paint(cyl(0.07, 0.09, 3.4, 6, 0, 1.7, 0), C("#3a3a40")),
    paint(box(0.08, 0.08, 0.7, 0, 3.3, -0.35), C("#3a3a40")),
    paint(box(1.6, 1.0, 0.06, 0, 3.4, -0.72), C("#f4f2ee")),
    paint(box(0.6, 0.45, 0.07, 0, 3.25, -0.74), C("#d8231f")),
    paint(rim, C("#ff7a1a")),
    paint(new THREE.CylinderGeometry(0.22, 0.14, 0.4, 8, 1, true).translate(0, 2.83, -0.95), C("#e8e8e8")),
  ]);
}

// A bar counter with bottles along it.
export function counter(seed: number) {
  const rnd = mulberry32(seed);
  const parts = [paint(box(1.96, 1.0, 0.9, 0, 0.5, 0), C("#5a3420")), paint(box(2.0, 0.08, 1.0, 0, 1.04, 0), C("#2a1a10"))];
  for (let i = 0; i < 5; i++) {
    const col = ["#3a7a3a", "#8a3a1a", "#c9a23a", "#e8e0d0", "#2a4a8a"][Math.floor(rnd() * 5)];
    parts.push(paint(cyl(0.04, 0.05, 0.28, 6, -0.8 + i * 0.4 + rnd() * 0.1, 1.22, (rnd() - 0.5) * 0.4), C(col)));
  }
  return merge(parts);
}

// A café table with a parasol, for the terraces.
export function patioTable(color: string) {
  return merge([
    paint(cyl(0.45, 0.45, 0.06, 10, 0, 0.75, 0), C("#e8e2d4")),
    paint(cyl(0.05, 0.08, 0.75, 6, 0, 0.37, 0), C("#2a2a2a")),
    paint(cyl(0.03, 0.03, 1.6, 4, 0, 1.55, 0), C("#2a2a2a")),
    paint(new THREE.ConeGeometry(1.3, 0.5, 8, 1, true).translate(0, 2.3, 0), C(color)),
    paint(box(0.4, 0.45, 0.4, 0.7, 0.22, 0), C("#6a4028")),
    paint(box(0.4, 0.45, 0.4, -0.7, 0.22, 0), C("#6a4028")),
  ]);
}

// An open umbrella hung upside-up over Calle Fortaleza.
export function umbrella(color: string) {
  const g = new THREE.ConeGeometry(0.75, 0.35, 8, 1, true).translate(0, 0.17, 0);
  return merge([paint(g, C(color)), paint(cyl(0.02, 0.02, 0.6, 4, 0, -0.1, 0), C("#222"))]);
}

// The Cathedral's dome and lantern.
export function dome() {
  const white = C("#efe9dc");
  return merge([
    paint(cyl(3, 3, 1.4, 12, 0, 0.7, 0), white),
    paint(new THREE.SphereGeometry(2.9, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.4, 0), C("#e6ddc8")),
    paint(cyl(0.5, 0.6, 1.2, 8, 0, 4.8, 0), white),
    paint(new THREE.SphereGeometry(0.55, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 5.4, 0), C("#e6ddc8")),
    paint(box(0.08, 0.7, 0.08, 0, 6.2, 0), C("#c9a23a")),
    paint(box(0.4, 0.08, 0.08, 0, 6.3, 0), C("#c9a23a")),
  ]);
}

// The round cistern in the middle of El Morro's plaza.
export function cistern() {
  const stone = C("#cdbb90");
  const dark = C("#2a2420");
  return merge([
    paint(cyl(1.7, 1.8, 0.9, 12, 0, 0.45, 0), stone),
    paint(cyl(1.5, 1.5, 0.05, 12, 0, 0.92, 0), dark),
    paint(box(0.2, 1.6, 0.2, -1.2, 1.6, 0), stone),
    paint(box(0.2, 1.6, 0.2, 1.2, 1.6, 0), stone),
    paint(box(2.8, 0.2, 0.2, 0, 2.4, 0), stone),
    paint(cyl(0.18, 0.18, 0.4, 6, 0, 2.1, 0), C("#4a3a28")),
  ]);
}

// Rubble across the street: carts, crates, sandbags, a fallen balcony.
export function rubble() {
  const rnd = mulberry32(12);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const w = 0.6 + rnd() * 0.9;
    const h = 0.4 + rnd() * 0.8;
    const g = box(w, h, 0.5 + rnd() * 0.8).rotateY(rnd() * 3).rotateZ((rnd() - 0.5) * 0.5);
    g.translate((rnd() - 0.5) * 1.4, h / 2 + rnd() * 1.2, -3.6 + i * 0.48);
    parts.push(paint(g, [C("#7a5230"), C("#8a8474"), C("#5d4632"), C("#a18f6c")][i % 4]));
  }
  for (let i = 0; i < 6; i++) {
    const g = box(0.12, 0.2, 3.2).rotateX((rnd() - 0.5) * 0.9).rotateY((rnd() - 0.5) * 0.6);
    g.translate((rnd() - 0.5) * 1.2, 1 + rnd() * 1.4, -2 + rnd() * 4);
    parts.push(paint(g, C("#6b4424")));
  }
  parts.push(paint(cyl(0.7, 0.7, 0.12, 10).rotateZ(Math.PI / 2).rotateY(0.3).translate(0.3, 0.8, 2.6), C("#5a3a1e")));
  parts.push(paint(box(0.06, 1.1, 2.4, -0.5, 2.2, -0.6).rotateX(0.2), C("#1c1c1e")));
  return merge(parts);
}

// A big wooden double door in a stone arch.
export function gateDoors(width: number, height: number) {
  const wood = C("#5b3a1f");
  const iron = C("#1e1c1e");
  const parts: THREE.BufferGeometry[] = [];
  const half = width / 2;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const pw = half / 5;
      parts.push(paint(box(pw - 0.03, height, 0.18, side * (i + 0.5) * pw, height / 2, 0), wood.clone().multiplyScalar(0.85 + (i % 2) * 0.2)));
    }
    for (const y of [0.8, height / 2, height - 0.8]) parts.push(paint(box(half - 0.1, 0.12, 0.22, (side * half) / 2, y, 0), iron));
  }
  return merge(parts);
}

// The mystery box: a battered crate with question marks. The lid's apart so
// it can open.
export function boxBase() {
  const wood = C("#4a2e17");
  const band = C("#2a1a10");
  return merge([paint(box(1.8, 0.7, 0.8, 0, 0.35, 0), wood), paint(box(1.84, 0.1, 0.84, 0, 0.1, 0), band), paint(box(1.84, 0.1, 0.84, 0, 0.62, 0), band)]);
}
export function boxLid() {
  return merge([paint(box(1.84, 0.16, 0.84, 0, 0.08, 0.42), C("#4f3219")), paint(box(0.3, 0.1, 0.1, 0, 0.05, 0.86), C("#c9a23a"))]).translate(0, 0, -0.42);
}

// A perk machine, front toward -z.
export function perkMachine() {
  return merge([paint(box(1.1, 2.1, 0.8, 0, 1.05, 0), C("#ffffff")), paint(box(1.2, 0.18, 0.9, 0, 2.18, 0), C("#d8d8d8"))]);
}

export function papMachine() {
  const body = C("#3a2f4a");
  const metal = C("#6a6a72");
  const purple = C("#8c3fe0");
  return merge([
    paint(box(2.2, 1.1, 1.3, 0, 0.55, 0), body),
    paint(box(1.8, 0.7, 1.1, 0, 1.45, 0), metal),
    paint(box(2.3, 0.14, 1.4, 0, 1.1, 0), purple),
    paint(cyl(0.12, 0.12, 1.2, 6, -0.8, 2.3, 0), metal),
    paint(cyl(0.12, 0.12, 1.2, 6, 0.8, 2.3, 0), metal),
    paint(box(2.0, 0.3, 0.5, 0, 2.95, 0), body),
    paint(box(0.9, 0.5, 0.2, 0, 1.45, -0.6), C("#111018")),
  ]);
}

// A soft dark blob on the ground under anyone standing, for top-down.
const shadowGeo = new THREE.CircleGeometry(0.45, 10).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
const shadowMat = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.4, depthWrite: false });
const blob = () => {
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.renderOrder = 1;
  return m;
};

// ---------- zombies ----------

const SKINS = ["#7d8f6a", "#8a9270", "#6f7d62", "#98927a", "#7a7466", "#8c8a6c"];
const OUTFITS: [string, string][] = [
  ["#e7dfc8", "#3a3a40"], // guayabera
  ["#e7dfc8", "#6b5a44"],
  ["#2c3a5c", "#232838"], // policía
  ["#c84a3a", "#2f3b52"], // tourist
  ["#3f8fbf", "#c7b58c"],
  ["#6b7a3a", "#4a4230"], // fisherman
  ["#a8342e", "#e0d6c0"], // colonial soldier
  ["#f0c24a", "#34343c"],
  ["#5a2d4a", "#1e1e24"],
];

export class ZombieModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly hips = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  readonly stump: THREE.Mesh;
  private meshes: THREE.Mesh[] = [];

  constructor(seed: number, mat: THREE.Material, eyeMat: THREE.Material) {
    const rnd = mulberry32(seed * 7919 + 13);
    const skin = C(SKINS[Math.floor(rnd() * SKINS.length)]);
    const [shirtHex, pantsHex] = OUTFITS[Math.floor(rnd() * OUTFITS.length)];
    const shirt = C(shirtHex).lerp(C("#5a4a3a"), 0.15 + rnd() * 0.2);
    const pants = C(pantsHex);
    const blood = C("#5a1414");
    const shoe = C("#1e1a18");
    const grime = (c: THREE.Color) => (x: number, y: number, z: number) => {
      const n = Math.sin(x * 37 + y * 53 + z * 71 + seed) * 0.5 + 0.5;
      return n > 0.82 ? blood : c.clone().multiplyScalar(0.8 + n * 0.3);
    };
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m = mat) => {
      const mesh = new THREE.Mesh(geo, m);
      parent.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };

    this.root.add(this.body, blob());
    this.body.add(this.hips);
    this.hips.position.y = 0.92;
    this.hips.add(this.torso, this.legL, this.legR);

    for (const [leg, x] of [
      [this.legL, -0.12],
      [this.legR, 0.12],
    ] as const) {
      leg.position.x = x;
      add(leg, merge([paint(box(0.19, 0.84, 0.21, 0, -0.42, 0), grime(pants)), paint(box(0.2, 0.12, 0.32, 0, -0.86, -0.05), shoe)]));
    }
    const shirtTop = paint(box(0.48, 0.62, 0.27, 0, 0.31, 0), grime(shirt));
    add(this.torso, merge([shirtTop, paint(box(0.44, 0.14, 0.25, 0, 0.02, 0), pants)]));

    this.head.position.y = 0.66;
    this.torso.add(this.head);
    add(
      this.head,
      merge([
        paint(box(0.1, 0.1, 0.1, 0, 0.02, 0), skin),
        paint(box(0.27, 0.3, 0.29, 0, 0.2, 0), grime(skin)),
        paint(box(0.2, 0.08, 0.1, 0, 0.04, -0.12), C("#2a1616")),
        paint(box(0.29, 0.08, 0.31, 0, 0.36, 0.01), C(rnd() < 0.5 ? "#1d1a18" : "#4a4038")),
      ])
    );
    add(this.head, merge([paint(box(0.07, 0.045, 0.02, -0.065, 0.24, -0.15), C("#ffffff")), paint(box(0.07, 0.045, 0.02, 0.065, 0.24, -0.15), C("#ffffff"))]), eyeMat);
    this.stump = add(this.torso, paint(box(0.14, 0.08, 0.14, 0, 0.66, 0), C("#7a1010")));
    this.stump.visible = false;

    for (const [arm, x] of [
      [this.armL, -0.3],
      [this.armR, 0.3],
    ] as const) {
      arm.position.set(x, 0.56, 0);
      this.torso.add(arm);
      add(arm, merge([paint(box(0.14, 0.4, 0.15, 0, -0.18, 0), grime(shirt)), paint(box(0.12, 0.3, 0.13, 0, -0.52, 0), grime(skin)), paint(box(0.12, 0.12, 0.08, 0, -0.72, 0), skin)]));
    }
  }

  // Top-down, a flat silhouette of each part draws wherever a roof or wall
  // hides it.
  readonly ghosts: THREE.Mesh[] = [];
  addGhosts(mat: THREE.Material) {
    for (const m of this.meshes) {
      m.renderOrder = 10;
      const g = new THREE.Mesh(m.geometry, mat);
      g.renderOrder = 5;
      g.visible = false;
      m.parent!.add(g);
      this.ghosts.push(g);
    }
  }
  showGhosts(on: boolean) {
    for (const g of this.ghosts) g.visible = on && g.parent!.visible !== false;
  }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
  }
}

// ---------- guns ----------

// A gun in the hand, barrel along -z, the grip at the origin. Returns the
// muzzle position too.
export function gunGeometry(id: WeaponId, pap: boolean) {
  const def = WEAPONS[id];
  const body = pap ? C("#4a2a78") : C(def.look.body);
  const wood = pap ? C("#9a3ad0") : C(def.look.wood ?? def.look.body);
  const steel = pap ? C("#e070ff") : C("#55585e");
  const L = def.look.long;
  const parts: THREE.BufferGeometry[] = [];
  const glow = pap ? C("#ff8af0") : C("#7dff9a");
  let muzzle = new THREE.Vector3(0, 0.07, -L - 0.1);
  switch (id) {
    case "pistola":
      parts.push(paint(box(0.05, 0.07, 0.26, 0, 0.07, -0.1), body));
      parts.push(paint(box(0.045, 0.14, 0.07, 0, -0.03, 0.0).rotateX(0.25), C("#3b2a1c")));
      parts.push(paint(box(0.02, 0.03, 0.05, 0, 0.0, -0.06), steel));
      muzzle = new THREE.Vector3(0, 0.08, -0.25);
      break;
    case "rayo":
      parts.push(paint(cyl(0.05, 0.07, 0.3, 8).rotateX(Math.PI / 2).translate(0, 0.08, -0.12), body));
      for (const z of [-0.05, -0.13, -0.21]) parts.push(paint(cyl(0.085, 0.085, 0.025, 8).rotateX(Math.PI / 2).translate(0, 0.08, z), C("#d33")));
      parts.push(paint(cyl(0.025, 0.025, 0.14, 6).rotateX(Math.PI / 2).translate(0, 0.08, -0.32), steel));
      parts.push(paint(cyl(0.035, 0.035, 0.12, 6).translate(0, 0.16, -0.05), glow));
      parts.push(paint(box(0.05, 0.14, 0.07, 0, -0.03, 0.01).rotateX(0.2), C("#333")));
      muzzle = new THREE.Vector3(0, 0.08, -0.4);
      break;
    default: {
      // Long guns: receiver, barrel, stock, grip, magazine.
      parts.push(paint(box(0.06, 0.09, L * 0.45, 0, 0.07, -L * 0.2), body));
      parts.push(paint(cyl(0.017, 0.017, L * 0.55, 6).rotateX(Math.PI / 2).translate(0, 0.085, -L * 0.42 - L * 0.27), steel));
      parts.push(paint(box(0.045, 0.12, 0.06, 0, -0.03, 0.0).rotateX(0.3), def.look.wood ? wood : body));
      if (def.look.wood) {
        parts.push(paint(box(0.055, 0.075, L * 0.35, 0, 0.04, -L * 0.52), wood));
        parts.push(paint(box(0.05, 0.11, 0.28, 0, 0.03, 0.2), wood));
      } else parts.push(paint(box(0.02, 0.05, 0.26, 0, 0.06, 0.18), steel));
      if (id === "escopeta") parts.push(paint(box(0.06, 0.05, 0.16, 0, 0.03, -L * 0.62), wood));
      else if (id === "ametralladora") {
        parts.push(paint(box(0.12, 0.12, 0.12, -0.08, 0.02, -0.12), body));
        parts.push(paint(box(0.012, 0.12, 0.012, -0.04, 0.0, -L * 0.8), steel), paint(box(0.012, 0.12, 0.012, 0.04, 0.0, -L * 0.8), steel));
      } else if (id !== "carabina") parts.push(paint(box(0.035, id === "metralleta" ? 0.2 : 0.15, 0.05, 0, -0.06, -L * 0.28).rotateX(id === "rifle" ? 0.2 : 0), steel));
      else parts.push(paint(box(0.035, 0.08, 0.05, 0, 0.0, -L * 0.2), steel));
      parts.push(paint(box(0.012, 0.03, 0.012, 0, 0.13, -L * 0.85), steel));
      muzzle = new THREE.Vector3(0, 0.085, -L * 0.97);
    }
  }
  return { geo: merge(parts), muzzle };
}

// Forearms in rolled-up guayabera sleeves.
export function armsGeometry() {
  const skin = C("#b98563");
  const sleeve = C("#ece4cc");
  return {
    right: merge([paint(box(0.085, 0.085, 0.34, 0, 0, 0.17), skin), paint(box(0.11, 0.11, 0.22, 0, 0, 0.42), sleeve), paint(box(0.08, 0.09, 0.1, 0, 0, -0.02), skin)]),
    left: merge([paint(box(0.085, 0.085, 0.34, 0, 0, 0.17), skin), paint(box(0.11, 0.11, 0.22, 0, 0, 0.42), sleeve), paint(box(0.08, 0.06, 0.12, 0, 0, -0.03), skin)]),
  };
}

export function knifeGeometry() {
  return merge([paint(box(0.025, 0.035, 0.22, 0, 0, -0.14), C("#c9ccd2")), paint(box(0.03, 0.04, 0.1, 0, 0, 0.01), C("#2a1d14"))]);
}

export function bottleGeometry(color: string) {
  return merge([paint(cyl(0.035, 0.04, 0.16, 7, 0, 0.08, 0), C(color)), paint(cyl(0.015, 0.03, 0.07, 6, 0, 0.19, 0), C(color)), paint(box(0.075, 0.06, 0.02, 0, 0.08, -0.035), C("#fff4d0"))]);
}

// You: a survivor in a guayabera and a cap, gun held out in front. Faces
// -z like everything else; the gun is swapped in by the renderer.
export class PlayerModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly gun: THREE.Mesh;
  readonly hand = new THREE.Group();

  constructor(mat: THREE.Material, gunMat: THREE.Material, ghostMat: THREE.Material) {
    const skin = C("#b98563");
    const shirt = C("#f1ead6");
    const pants = C("#34405a");
    const cap = C("#b8120f");
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry) => {
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 10;
      const g = new THREE.Mesh(geo, ghostMat);
      g.renderOrder = 5;
      parent.add(m, g);
      return m;
    };
    // A ring round your feet, so you can find yourself in a crowd.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.68, 20).rotateX(-Math.PI / 2).translate(0, 0.04, 0),
      new THREE.MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.75, depthWrite: false })
    );
    this.root.add(this.body, blob(), ring);
    const hips = new THREE.Group();
    hips.position.y = 0.9;
    this.body.add(hips);
    hips.add(this.torso, this.legL, this.legR);
    for (const [leg, x] of [
      [this.legL, -0.12],
      [this.legR, 0.12],
    ] as const) {
      leg.position.x = x;
      add(leg, merge([paint(box(0.19, 0.82, 0.21, 0, -0.41, 0), pants), paint(box(0.2, 0.12, 0.32, 0, -0.84, -0.05), C("#2a2020"))]));
    }
    add(this.torso, merge([paint(box(0.48, 0.62, 0.28, 0, 0.31, 0), shirt), paint(box(0.44, 0.1, 0.26, 0, 0.02, 0), C("#3a2a1a"))]));
    add(
      this.torso,
      merge([
        paint(box(0.26, 0.28, 0.27, 0, 0.83, 0), skin),
        paint(box(0.3, 0.1, 0.31, 0, 0.99, 0.01), cap),
        paint(box(0.24, 0.04, 0.16, 0, 0.95, -0.2), cap),
      ])
    );
    for (const [arm, x] of [
      [this.armL, -0.3],
      [this.armR, 0.3],
    ] as const) {
      arm.position.set(x, 0.56, 0);
      this.torso.add(arm);
      add(arm, merge([paint(box(0.14, 0.3, 0.15, 0, -0.13, 0), shirt), paint(box(0.12, 0.34, 0.13, 0, -0.44, 0), skin)]));
    }
    // Arms out front, the gun between the hands.
    this.armL.rotation.set(1.35, -0.35, 0);
    this.armR.rotation.set(1.45, 0.15, 0);
    this.hand.position.set(0.08, 0.38, -0.5);
    this.torso.add(this.hand);
    this.gun = new THREE.Mesh(undefined, gunMat);
    this.gun.scale.setScalar(1.35);
    this.hand.add(this.gun);
  }
}
