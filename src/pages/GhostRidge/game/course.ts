// The Ghost Ridge course: one fixed run down a haunted mountain at night.
// Downhill is -z. `d` is the distance down the course (d = -z), and `u` is
// the sideways offset from the course's centre line. Everything here is
// built from one seed, so every rider gets the same mountain.

export const LENGTH = 3000;
export const START_D = -24;
export const G = 24; // gravity; a little heavier than real for snappy jumps
export const GATES = [600, 1200, 1800, 2400];
export const GATE_BONUS = 22;

const PRE = 140; // tables start this far above the start line
const TABLE_LEN = PRE + LENGTH + 320;

export type ObstacleKind = "pine" | "dead" | "grave" | "cross" | "rock";
export type Obstacle = { kind: ObstacleKind; x: number; z: number; r: number; h: number; s: number; rot: number };
export type Kicker = { d: number; len: number; h: number; u: number; w: number };
export type Candy = { x: number; y: number; z: number };
export type Ghost = { d: number; u: number; amp: number; speed: number; phase: number };
export type Pumpkin = { x: number; y: number; z: number; rot: number };

export type Course = {
  center: Float32Array;
  base: Float32Array;
  half: Float32Array;
  kickers: Kicker[];
  kickerBuckets: Kicker[][];
  obstacles: Obstacle[];
  obstacleBuckets: Obstacle[][];
  candy: Candy[];
  ghosts: Ghost[];
  pumpkins: Pumpkin[];
};

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

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function sample(table: Float32Array, d: number) {
  const f = Math.min(TABLE_LEN - 1.001, Math.max(0, d + PRE));
  const i = Math.floor(f);
  const t = f - i;
  return table[i] * (1 - t) + table[i + 1] * t;
}

export const centerAt = (c: Course, d: number) => sample(c.center, d);
export const halfAt = (c: Course, d: number) => sample(c.half, d);
export const baseAt = (c: Course, d: number) => sample(c.base, d);

const BUCKET = 20;
const bucketOf = (d: number) => Math.max(0, Math.floor((d + PRE) / BUCKET));

// Snow height at a world point.
export function heightAt(c: Course, x: number, z: number) {
  const d = -z;
  const u = x - centerAt(c, d);
  const hw = halfAt(c, d);
  let y = baseAt(c, d);
  const a = Math.abs(u);
  // A shallow half-pipe inside the course, then steep banks either side.
  if (a < hw) y += (a / hw) * (a / hw) * 1.4;
  else {
    const e = a - hw;
    y += 1.4 + e * (2.8 / hw) + e * e * 0.07;
  }
  y += 0.22 * Math.sin(x * 0.35 + z * 0.21) * Math.sin(z * 0.29 - x * 0.13);
  const list = c.kickerBuckets[bucketOf(d)];
  if (list) for (const k of list) y += kickerHeight(k, d, u);
  return y;
}

function kickerHeight(k: Kicker, d: number, u: number) {
  const along = d - k.d;
  if (along < 0 || along > k.len + 1.5) return 0;
  const lu = Math.abs(u - k.u);
  const side = lu < k.w ? 1 : 1 - smoothstep(k.w, k.w + 2.5, lu);
  if (side <= 0) return 0;
  const t = along / k.len;
  const h = t <= 1 ? k.h * t * t : k.h * (1 - (along - k.len) / 1.5);
  return h * side;
}

// Unit surface normal, from the slope around the point.
export function normalAt(c: Course, x: number, z: number, out = { x: 0, y: 1, z: 0 }) {
  const e = 0.35;
  const hx = heightAt(c, x + e, z) - heightAt(c, x - e, z);
  const hz = heightAt(c, x, z + e) - heightAt(c, x, z - e);
  const nx = -hx;
  const ny = 2 * e;
  const nz = -hz;
  const len = Math.hypot(nx, ny, nz);
  out.x = nx / len;
  out.y = ny / len;
  out.z = nz / len;
  return out;
}

// Which way the course runs at d, as a heading (0 = straight down -z).
export function courseHeading(c: Course, d: number) {
  const dx = centerAt(c, d + 4) - centerAt(c, d - 4);
  return Math.atan2(dx, 8);
}

export function nearbyObstacles(c: Course, d: number) {
  const b = bucketOf(d);
  return [c.obstacleBuckets[b - 1], c.obstacleBuckets[b], c.obstacleBuckets[b + 1]];
}

export function buildCourse(seed = 1031): Course {
  const rnd = mulberry32(seed);
  const r = (a: number, b: number) => a + rnd() * (b - a);
  const center = new Float32Array(TABLE_LEN);
  const half = new Float32Array(TABLE_LEN);
  const base = new Float32Array(TABLE_LEN);
  const p = Array.from({ length: 6 }, () => r(0, Math.PI * 2));

  for (let i = 0; i < TABLE_LEN; i++) {
    const d = i - PRE;
    const ease = smoothstep(0, 160, d);
    center[i] = ease * (24 * Math.sin(d / 150 + p[0]) + 11 * Math.sin(d / 63 + p[1]) - 24 * Math.sin(p[0]) - 11 * Math.sin(p[1]));
    half[i] = 18 + 5 * Math.sin(d / 97 + p[2]) * ease - 4 * (1 - ease);
  }

  // Features down the mountain, each with room around it.
  const kickers: Kicker[] = [];
  const drops: { d: number; h: number }[] = [];
  const fields: { d: number; len: number }[] = [];
  const clear: [number, number][] = [];
  const hwAt = (d: number) => sample(half, d);
  const cx = (d: number) => sample(center, d);
  let d = 110;
  let n = 0;
  while (d < LENGTH - 120) {
    if (GATES.some((g) => Math.abs(g - d) < 30)) {
      d += 25;
      continue;
    }
    const roll = rnd();
    const hw = hwAt(d);
    if (roll < 0.58 || n < 2) {
      const big = rnd() < 0.35;
      const len = big ? r(11, 13) : r(8, 10);
      const h = big ? r(3.2, 3.8) : r(2, 2.7);
      const w = big ? r(5, 7) : r(4, 6);
      const u = r(-(hw - w - 3), hw - w - 3);
      kickers.push({ d, len, h, u, w });
      // A second, smaller kicker off to the side now and then.
      if (!big && rnd() < 0.35) {
        const u2 = u > 0 ? u - w - r(6, 10) : u + w + r(6, 10);
        if (Math.abs(u2) < hw - 5) kickers.push({ d: d + r(-3, 3), len: 8, h: 1.8, u: u2, w: 3.5 });
      }
      clear.push([d - 14, d + len + 45]);
      d += len + r(70, 110);
    } else if (roll < 0.74) {
      drops.push({ d, h: r(3, 5.5) });
      clear.push([d - 12, d + 30]);
      d += r(70, 100);
    } else {
      const len = r(40, 60);
      fields.push({ d, len });
      d += len + r(45, 70);
    }
    n++;
  }

  // The fall line: steep enough to carry speed, steeper after each jump so
  // landings aren't flat, and a sudden step at each drop.
  const grade = new Float32Array(TABLE_LEN);
  for (let i = 0; i < TABLE_LEN; i++) {
    const dd = i - PRE;
    grade[i] = 0.06 + (0.26 + 0.07 * Math.sin(dd / 230 + p[3]) + 0.05 * Math.sin(dd / 71 + p[4])) * smoothstep(-10, 60, dd);
    if (dd > LENGTH + 20) grade[i] *= 1 - smoothstep(LENGTH + 20, LENGTH + 90, dd) * 0.85;
  }
  for (const k of kickers) {
    const lip = k.d + k.len;
    for (let i = Math.floor(lip + 6 + PRE); i < lip + 70 + PRE && i < TABLE_LEN; i++) {
      const dd = i - PRE - lip;
      grade[i] += 0.2 * smoothstep(6, 16, dd) * (1 - smoothstep(40, 70, dd));
    }
  }
  for (const dr of drops) {
    for (let i = Math.floor(dr.d + PRE); i < dr.d + 3 + PRE; i++) grade[i] += dr.h / 3;
    for (let i = Math.floor(dr.d + 3 + PRE); i < dr.d + 30 + PRE; i++) grade[i] += 0.12;
  }
  let y = 0;
  for (let i = 0; i < TABLE_LEN; i++) {
    base[i] = y;
    y -= grade[i];
  }
  // Put the start line at height 0.
  const y0 = sample(base, START_D);
  for (let i = 0; i < TABLE_LEN; i++) base[i] -= y0;

  const kickerBuckets: Kicker[][] = [];
  for (const k of kickers) {
    for (let b = bucketOf(k.d); b <= bucketOf(k.d + k.len + 2); b++) (kickerBuckets[b] ??= []).push(k);
  }

  const course: Course = { center, half, base, kickers, kickerBuckets, obstacles: [], obstacleBuckets: [], candy: [], ghosts: [], pumpkins: [] };
  const inClear = (dd: number) => clear.some(([a, b]) => dd > a && dd < b) || dd < 30 || dd > LENGTH - 20;

  const obstacles: Obstacle[] = [];
  const add = (kind: ObstacleKind, x: number, z: number, s: number) => {
    const size = { pine: [0.7, 7], dead: [0.45, 5.5], grave: [0.75, 1.6], cross: [0.55, 2], rock: [1.1, 1.3] }[kind];
    obstacles.push({ kind, x, z, r: size[0] * s, h: size[1] * s, s, rot: r(0, Math.PI * 2) });
  };

  // Pine forest up the banks.
  for (let dd = -PRE + 10; dd < LENGTH + 300; dd += 3.2) {
    const hw = hwAt(dd);
    for (const side of [-1, 1]) {
      const near = hw + r(2.5, 9);
      add(rnd() < 0.8 ? "pine" : "dead", cx(dd) + side * near, -(dd + r(-1.5, 1.5)), r(0.8, 1.5));
      if (rnd() < 0.8) add("pine", cx(dd) + side * (hw + r(11, 40)), -(dd + r(-1.5, 1.5)), r(1, 1.8));
    }
  }
  // Graveyards to weave through.
  for (const f of fields) {
    const placed: [number, number][] = [];
    const count = Math.floor(f.len / 4);
    for (let tries = 0; tries < count * 6 && placed.length < count; tries++) {
      const dd = f.d + r(0, f.len);
      const u = r(-(hwAt(dd) - 3), hwAt(dd) - 3);
      if (placed.some(([pd, pu]) => Math.hypot(pd - dd, pu - u) < 5.5)) continue;
      placed.push([dd, u]);
      const roll = rnd();
      add(roll < 0.55 ? "grave" : roll < 0.85 ? "cross" : "dead", cx(dd) + u, -dd, roll < 0.85 ? r(0.9, 1.2) : r(0.6, 0.8));
    }
  }
  // A few loose hazards along the open runs.
  for (let dd = 60; dd < LENGTH - 30; dd += r(35, 70)) {
    if (inClear(dd) || fields.some((f) => dd > f.d - 10 && dd < f.d + f.len + 10)) continue;
    const u = r(-(hwAt(dd) - 4), hwAt(dd) - 4);
    const roll = rnd();
    add(roll < 0.4 ? "rock" : roll < 0.7 ? "grave" : "dead", cx(dd) + u, -dd, roll < 0.7 ? r(0.8, 1.2) : r(0.5, 0.7));
  }
  course.obstacles = obstacles;
  for (const o of obstacles) (course.obstacleBuckets[bucketOf(-o.z)] ??= []).push(o);

  // Candy: lines along the open runs, and arcs where the air is.
  const candy: Candy[] = [];
  for (let dd = 50; dd < LENGTH - 40; dd += r(60, 110)) {
    if (inClear(dd) || fields.some((f) => dd > f.d - 20 && dd < f.d + f.len + 5)) continue;
    const u0 = r(-(hwAt(dd) - 5), hwAt(dd) - 5);
    const bend = r(-0.25, 0.25);
    for (let i = 0; i < 6; i++) {
      const cd = dd + i * 4;
      const x = cx(cd) + u0 + bend * i * 4;
      if (nearObstacle(course, x, -cd, 2.5)) continue;
      candy.push({ x, y: heightAt(course, x, -cd) + 0.9, z: -cd });
    }
  }
  for (const k of kickers) {
    if (k.h < 2) continue;
    // Follow a straight jump off the lip at a typical speed.
    const lip = k.d + k.len;
    const x = cx(lip) + k.u;
    let py = heightAt(course, x, -lip);
    let vy = 30 * ((2 * k.h) / k.len - 0.3) + 6;
    let pd = lip;
    for (let t = 0, i = 0; t < 3 && i < 5; t += 1 / 60) {
      py += vy / 60;
      vy -= G / 60;
      pd += 30 / 60;
      if (py < heightAt(course, x, -pd) + 0.5) break;
      if (t > 0.2 + i * 0.16) {
        candy.push({ x: cx(pd) + k.u, y: py + 0.9, z: -pd });
        i++;
      }
    }
  }
  course.candy = candy;

  // Ghosts drift back and forth across the open stretches.
  for (let dd = 180; dd < LENGTH - 60; dd += r(150, 240)) {
    course.ghosts.push({ d: dd, u: r(-5, 5), amp: hwAt(dd) - 4, speed: r(0.35, 0.6), phase: r(0, Math.PI * 2) });
  }

  // Lanterns either side of each kicker's lip, so you can find them.
  for (const k of kickers) {
    const lip = k.d + k.len;
    for (const side of [-1, 1]) {
      const x = cx(lip) + k.u + side * (k.w + 0.8);
      course.pumpkins.push({ x, y: heightAt(course, x, -lip), z: -lip, rot: Math.PI });
    }
  }
  // Jack-o'-lanterns light the edges.
  for (let dd = -10, side = 1; dd < LENGTH + 40; dd += 24, side = -side) {
    const x = cx(dd) + side * (hwAt(dd) + 1.2);
    course.pumpkins.push({ x, y: heightAt(course, x, -dd), z: -dd, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  return course;
}

function nearObstacle(c: Course, x: number, z: number, gap: number) {
  for (const list of nearbyObstacles(c, -z)) {
    if (!list) continue;
    for (const o of list) if (Math.hypot(o.x - x, o.z - z) < o.r + gap) return true;
  }
  return false;
}

export { mulberry32, smoothstep };
