// Frog Ball rules and physics, with no DOM or three.js so the stage checker
// can play it headlessly. Like Monkey Ball, you don't push the ball: you tilt
// the world, which here means tilting gravity, and the ball rolls downhill.
import type { PartDef, StageDef, Vec } from "./stages.ts";

export type V3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export const BALL_R = 0.5;
export const GRAVITY = 30;
// How far the stage tips at full tilt, like Monkey Ball's ~23 degrees.
export const MAX_TILT = (23 * Math.PI) / 180;
export const SUBSTEP = 1 / 240;
export const READY_TIME = 1.6;
const ROLL_DRAG = 0.32; // per second, relative to the surface you're on
const AIR_DRAG = 0.04;
const GOAL_DRAG = 6;
const RESTITUTION = 0.4;
const BOUNCE_MIN = 4; // slower hits than this don't bounce
const BUMPER_KICK = 11;
const BOOST_SPEED = 24;
const MAX_SPEED = 55;
// How much of a moving floor's change in speed the ball picks up, so lifts and
// turntables carry you instead of sliding out from under you.
const CARRY = 0.85;
const FLY_REACH = BALL_R + 0.35;
const BIG_FLY_REACH = BALL_R + 0.6;

// --- vector math ---------------------------------------------------------

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const fromVec = (a: Vec): V3 => ({ x: a[0], y: a[1], z: a[2] });
const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

const Q_ID: Quat = { x: 0, y: 0, z: 0, w: 1 };
export function qAxis(axis: V3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  const l = len(axis) || 1;
  return { x: (axis.x / l) * s, y: (axis.y / l) * s, z: (axis.z / l) * s, w: Math.cos(angle / 2) };
}
export function qMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
const qConj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
export function qRotate(q: Quat, v: V3): V3 {
  // v + 2w(u x v) + 2u x (u x v)
  const u = { x: q.x, y: q.y, z: q.z };
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q.w)), cross(u, t));
}
// rot is [pitch, yaw, roll] in degrees: yaw about world up first, then pitch,
// then roll about the part's own length.
const DEG = Math.PI / 180;
export function qEuler(rot: Vec | undefined): Quat {
  if (!rot) return Q_ID;
  const qy = qAxis(v3(0, 1, 0), rot[1] * DEG);
  const qx = qAxis(v3(1, 0, 0), rot[0] * DEG);
  const qz = qAxis(v3(0, 0, 1), rot[2] * DEG);
  return qMul(qMul(qy, qx), qz);
}

// Heading 0 faces -z (three.js's forward); positive turns left.
export const headingDir = (h: number): V3 => ({ x: -Math.sin(h), y: 0, z: -Math.cos(h) });
export const headingRight = (h: number): V3 => ({ x: Math.cos(h), y: 0, z: -Math.sin(h) });

// --- stage bodies ----------------------------------------------------------

export interface Body {
  def: PartDef;
  // Rest pose; motion is applied on top each step.
  base: V3;
  baseQ: Quat;
  half: V3; // box half extents, or (r, hh, r) for a cylinder
  bound: number;
  c: V3;
  q: Quat;
  vel: V3;
  omega: V3;
  origin: V3;
  moving: boolean;
  hitAt: number; // time of the last bump, for the bumper wobble
}

function makeBody(def: PartDef): Body {
  const base = fromVec(def.at);
  const half = def.shape === "box" ? v3(def.size[0] / 2, def.size[1] / 2, def.size[2] / 2) : v3(def.r, def.h / 2, def.r);
  const body: Body = {
    def,
    base,
    baseQ: qEuler(def.rot),
    half,
    bound: len(half),
    c: base,
    q: Q_ID,
    vel: v3(),
    omega: v3(),
    origin: base,
    moving: !!(def.move || def.spin || def.swing),
    hitAt: -10,
  };
  poseBody(body, 0);
  return body;
}

// Where a part is at time t, and how fast it's moving there.
export function poseBody(b: Body, t: number) {
  const d = b.def;
  let q = b.baseQ;
  let c = b.base;
  let omega = v3();
  let pivot = b.base;
  let offset = v3();
  let vel = v3();
  if (d.spin || d.swing) {
    const axis = fromVec((d.spin ?? d.swing)!.axis ?? (d.spin ? [0, 1, 0] : [0, 0, 1]));
    const al = len(axis);
    const unit = scale(axis, 1 / al);
    let angle: number;
    let rate: number;
    if (d.spin) {
      angle = d.spin.speed * DEG * t + (d.spin.phase ?? 0) * DEG;
      rate = d.spin.speed * DEG;
    } else {
      const s = d.swing!;
      const w = (2 * Math.PI) / s.period;
      angle = s.amp * DEG * Math.sin(w * t + (s.phase ?? 0) * 2 * Math.PI);
      rate = s.amp * DEG * w * Math.cos(w * t + (s.phase ?? 0) * 2 * Math.PI);
    }
    const r = qAxis(unit, angle);
    q = qMul(r, b.baseQ);
    pivot = (d.spin ?? d.swing)!.pivot ? fromVec((d.spin ?? d.swing)!.pivot!) : b.base;
    c = add(pivot, qRotate(r, sub(b.base, pivot)));
    omega = scale(unit, rate);
  }
  if (d.move) {
    const w = (2 * Math.PI) / d.move.period;
    const ph = w * t + (d.move.phase ?? 0) * 2 * Math.PI;
    const by = fromVec(d.move.by);
    offset = scale(by, Math.sin(ph));
    vel = scale(by, w * Math.cos(ph));
  }
  b.c = add(c, offset);
  b.q = q;
  b.vel = vel;
  b.omega = omega;
  b.origin = add(pivot, offset);
}

function surfaceVel(b: Body, p: V3): V3 {
  if (!b.moving) return v3();
  return add(b.vel, cross(b.omega, sub(p, b.origin)));
}

// Closest point on the body to p, and the push-out normal, if the ball overlaps.
function contact(b: Body, p: V3): { n: V3; pen: number; at: V3 } | null {
  const rel = sub(p, b.c);
  if (len(rel) > b.bound + BALL_R) return null;
  const inv = qConj(b.q);
  const l = qRotate(inv, rel);
  const h = b.half;
  let cl: V3;
  let nl: V3;
  let dist: number;
  if (b.def.shape === "box") {
    cl = v3(clamp(l.x, -h.x, h.x), clamp(l.y, -h.y, h.y), clamp(l.z, -h.z, h.z));
    const diff = sub(l, cl);
    dist = len(diff);
    if (dist > BALL_R) return null;
    if (dist > 1e-6) {
      nl = scale(diff, 1 / dist);
    } else {
      // Centre inside the box: leave by the nearest face.
      const dx = h.x - Math.abs(l.x);
      const dy = h.y - Math.abs(l.y);
      const dz = h.z - Math.abs(l.z);
      if (dy <= dx && dy <= dz) nl = v3(0, Math.sign(l.y) || 1, 0);
      else if (dx <= dz) nl = v3(Math.sign(l.x) || 1, 0, 0);
      else nl = v3(0, 0, Math.sign(l.z) || 1);
      dist = -Math.min(dx, dy, dz);
      cl = l;
    }
  } else {
    const radial = Math.hypot(l.x, l.z);
    const k = radial > h.x ? h.x / radial : 1;
    cl = v3(l.x * k, clamp(l.y, -h.y, h.y), l.z * k);
    const diff = sub(l, cl);
    dist = len(diff);
    if (dist > BALL_R) return null;
    if (dist > 1e-6) {
      nl = scale(diff, 1 / dist);
    } else {
      const dy = h.y - Math.abs(l.y);
      const dr = h.x - radial;
      if (dy <= dr) {
        nl = v3(0, Math.sign(l.y) || 1, 0);
        dist = -dy;
      } else {
        nl = radial > 1e-6 ? v3(l.x / radial, 0, l.z / radial) : v3(1, 0, 0);
        dist = -dr;
      }
    }
  }
  return { n: qRotate(b.q, nl), pen: BALL_R - dist, at: add(b.c, qRotate(b.q, cl)) };
}

// --- game state ---------------------------------------------------------------

export type Status = "ready" | "play" | "goal" | "fallout" | "timeover";

export type GameEvent =
  | { type: "go" }
  | { type: "fly"; big: boolean; at: V3 }
  | { type: "bump"; body: number; strength: number }
  | { type: "land"; strength: number }
  | { type: "wall"; strength: number }
  | { type: "spring"; body: number }
  | { type: "boost" }
  | { type: "goal" }
  | { type: "fallout" }
  | { type: "timeover" }
  | { type: "tick"; seconds: number };

export interface Fly {
  at: V3;
  big: boolean;
  taken: boolean;
}

export interface Game {
  stage: StageDef;
  t: number; // stage clock, including the READY count
  timeLeft: number;
  status: Status;
  statusT: number; // seconds in the current status
  p: V3;
  v: V3;
  grounded: boolean;
  groundN: V3;
  groundVel: V3;
  groundBody: number;
  airT: number;
  bodies: Body[];
  flies: Fly[];
  fliesTaken: number;
  killY: number;
  goalQ: Quat;
  boosting: boolean;
  events: GameEvent[];
}

export const GOAL_W = 3.2;
export const GOAL_H = 2.6;
export const GOAL_POST_R = 0.22;

export function goalFrame(stage: StageDef) {
  const h = stage.goal.heading * DEG;
  return { at: fromVec(stage.goal.at), forward: headingDir(h), right: headingRight(h), width: stage.goal.width ?? GOAL_W };
}

export function newGame(stage: StageDef): Game {
  const parts: PartDef[] = [...stage.parts];
  // The goal's two posts are solid, like Monkey Ball's.
  const g = goalFrame(stage);
  for (const side of [-1, 1]) {
    const at = add(g.at, scale(g.right, (side * g.width) / 2));
    parts.push({ shape: "cyl", at: [at.x, at.y + GOAL_H / 2, at.z], r: GOAL_POST_R, h: GOAL_H, tone: "goal" });
  }
  const bodies = parts.map(makeBody);
  let minY = Infinity;
  for (const b of bodies) minY = Math.min(minY, b.base.y - b.bound);
  const start = fromVec(stage.start);
  return {
    stage,
    t: 0,
    timeLeft: stage.time,
    status: "ready",
    statusT: 0,
    p: v3(start.x, start.y + BALL_R, start.z),
    v: v3(),
    grounded: true,
    groundN: v3(0, 1, 0),
    groundVel: v3(),
    groundBody: -1,
    airT: 0,
    bodies,
    flies: stage.flies.map((f) => ({ at: fromVec(f.at), big: !!f.big, taken: false })),
    fliesTaken: 0,
    killY: minY - 10,
    goalQ: qAxis(v3(0, 1, 0), stage.goal.heading * DEG),
    boosting: false,
    events: [],
  };
}

// The gravity you get from tilting: tilt is a horizontal world-space vector
// with length up to 1 (full tilt).
export function tiltedGravity(tilt: { x: number; z: number }): V3 {
  const m = Math.min(1, Math.hypot(tilt.x, tilt.z));
  if (m < 1e-4) return v3(0, -GRAVITY, 0);
  const a = m * MAX_TILT;
  const s = (Math.sin(a) * GRAVITY) / Math.hypot(tilt.x, tilt.z);
  return v3(tilt.x * s, -Math.cos(a) * GRAVITY, tilt.z * s);
}

function setStatus(g: Game, status: Status) {
  g.status = status;
  g.statusT = 0;
}

// Advance by dt seconds (any size; it substeps). tilt is ignored once the
// stage is over.
export function step(g: Game, dt: number, tilt: { x: number; z: number }) {
  let remaining = dt;
  while (remaining > 1e-9) {
    const h = Math.min(SUBSTEP, remaining);
    substep(g, h, tilt);
    remaining -= h;
  }
}

function substep(g: Game, dt: number, tilt: { x: number; z: number }) {
  g.t += dt;
  g.statusT += dt;
  for (const b of g.bodies) if (b.moving) poseBody(b, g.t);

  if (g.status === "ready") {
    if (g.statusT >= READY_TIME) {
      setStatus(g, "play");
      g.events.push({ type: "go" });
    }
    return;
  }

  if (g.status === "play") {
    const before = Math.ceil(g.timeLeft);
    g.timeLeft = Math.max(0, g.timeLeft - dt);
    const after = Math.ceil(g.timeLeft);
    if (after !== before && after <= 10 && after > 0) g.events.push({ type: "tick", seconds: after });
    if (g.timeLeft <= 0) {
      setStatus(g, "timeover");
      g.events.push({ type: "timeover" });
    }
  }

  const control = g.status === "play" ? tilt : { x: 0, z: 0 };
  // After the goal the ball brakes hard and floats, so it celebrates on the
  // goal platform instead of rolling off the end of the stage.
  const grav = g.status === "goal" && !g.grounded ? scale(tiltedGravity(control), 0.15) : tiltedGravity(control);
  g.v = add(g.v, scale(grav, dt));
  g.p = add(g.p, scale(g.v, dt));

  // Collide twice so corners where two parts meet settle.
  const prevBody = g.groundBody;
  const prevVel = g.groundVel;
  g.grounded = false;
  g.groundBody = -1;
  let bestUp = 0.55;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < g.bodies.length; i++) {
      const b = g.bodies[i];
      const hit = contact(b, g.p);
      if (!hit || hit.pen <= 0) continue;
      const { n } = hit;
      g.p = add(g.p, scale(n, hit.pen));
      const vs = surfaceVel(b, hit.at);
      let rel = sub(g.v, vs);
      const vn = dot(rel, n);
      if (vn < 0) {
        const d = b.def;
        const e = -vn > BOUNCE_MIN ? RESTITUTION : 0;
        rel = sub(rel, scale(n, vn * (1 + e)));
        if (d.bumper) {
          const out = dot(rel, n);
          rel = add(rel, scale(n, Math.max(0, BUMPER_KICK - out)));
          b.hitAt = g.t;
          g.events.push({ type: "bump", body: i, strength: 1 });
        } else if (d.spring && n.y > 0.7) {
          const out = dot(rel, n);
          rel = add(rel, scale(n, d.spring - out));
          b.hitAt = g.t;
          g.events.push({ type: "spring", body: i });
        } else if (-vn > BOUNCE_MIN && pass === 0) {
          g.events.push({ type: n.y > 0.55 ? "land" : "wall", strength: Math.min(1, -vn / 20) });
        }
        g.v = add(rel, vs);
      }
      if (n.y > bestUp) {
        bestUp = n.y;
        g.grounded = true;
        g.groundN = n;
        g.groundVel = vs;
        g.groundBody = i;
      }
    }
  }
  if (!g.grounded) g.airT += dt;
  else g.airT = 0;
  if (g.grounded && g.groundBody === prevBody && g.bodies[prevBody].moving) {
    g.v = add(g.v, scale(sub(g.groundVel, prevVel), CARRY));
  }

  // Rolling resistance, relative to whatever you're rolling on.
  if (g.grounded) {
    const rel = sub(g.v, g.groundVel);
    const k = 1 - Math.exp(-(g.status === "goal" ? GOAL_DRAG : ROLL_DRAG) * dt);
    g.v = sub(g.v, scale(rel, k));
  } else {
    g.v = scale(g.v, g.status === "goal" ? Math.exp(-GOAL_DRAG * dt) : 1 - AIR_DRAG * dt);
  }

  // Boost pads.
  const wasBoosting = g.boosting;
  g.boosting = false;
  if (g.stage.pads && g.status === "play") {
    for (const pad of g.stage.pads) {
      const dir = headingDir(pad.heading * DEG);
      const rel = sub(g.p, fromVec(pad.at));
      if (Math.abs(rel.y - BALL_R) > 0.8) continue;
      const right = headingRight(pad.heading * DEG);
      const [w, d] = pad.size ?? [2.4, 2.4];
      if (Math.abs(dot(rel, right)) > w / 2 || Math.abs(dot(rel, dir)) > d / 2) continue;
      g.boosting = true;
      const along = dot(g.v, dir);
      if (along < BOOST_SPEED) g.v = add(g.v, scale(dir, Math.min(BOOST_SPEED - along, 80 * dt)));
    }
    if (g.boosting && !wasBoosting) g.events.push({ type: "boost" });
  }

  const speed = len(g.v);
  if (speed > MAX_SPEED) g.v = scale(g.v, MAX_SPEED / speed);

  // Flies.
  for (const f of g.flies) {
    if (f.taken) continue;
    const reach = f.big ? BIG_FLY_REACH : FLY_REACH;
    if (len(sub(f.at, g.p)) < reach && g.status !== "fallout") {
      f.taken = true;
      g.fliesTaken += f.big ? 10 : 1;
      g.events.push({ type: "fly", big: f.big, at: f.at });
    }
  }

  // Goal: the ball's centre passes between the posts.
  if (g.status === "play") {
    const gf = goalFrame(g.stage);
    const rel = sub(g.p, gf.at);
    const x = dot(rel, gf.right);
    const z = dot(rel, gf.forward);
    if (Math.abs(x) < gf.width / 2 - GOAL_POST_R && rel.y > -0.2 && rel.y < GOAL_H && Math.abs(z) < 0.35) {
      setStatus(g, "goal");
      g.events.push({ type: "goal" });
    }
  }

  if (g.p.y < g.killY && (g.status === "play" || g.status === "timeover")) {
    if (g.status === "play") {
      setStatus(g, "fallout");
      g.events.push({ type: "fallout" });
    }
  }
}

export function speedOf(g: Game) {
  return len(g.v);
}

// --- scoring -----------------------------------------------------------------

export const FLY_POINTS = 100;
export const FLIES_PER_LIFE = 50;

// Monkey Ball style: 100 points per second left, 100 per fly, doubled if you
// finish with more than half the clock left.
export function stageScore(g: Game) {
  const timeBonus = Math.round(g.timeLeft * 100);
  const flyBonus = g.fliesTaken * FLY_POINTS;
  const fast = g.timeLeft > g.stage.time / 2;
  return { timeBonus, flyBonus, fast, total: (timeBonus + flyBonus) * (fast ? 2 : 1) };
}

// --- autopilot -------------------------------------------------------------------

// Steers along the stage's route. Used for the menu's attract mode and by the
// stage checker to prove every stage can be finished.
export interface Pilot {
  i: number;
  jitter: number;
  wait: number;
}

export function newPilot(jitter = 0): Pilot {
  return { i: 0, jitter, wait: 0 };
}

export function pilotTilt(g: Game, pilot: Pilot): { x: number; z: number } {
  const route = g.stage.route;
  if (!route?.length || g.status !== "play") return { x: 0, z: 0 };
  // Skip waypoints we've already passed (e.g. after being knocked forward).
  while (pilot.i < route.length - 1) {
    const w = route[pilot.i];
    const d = Math.hypot(w[0] - g.p.x, w[2] - g.p.z);
    if (d < (w[4] ?? 1.1)) {
      pilot.i++;
      pilot.wait = 0;
    } else break;
  }
  let w = route[pilot.i];
  const win = w[5];
  if (win && pilot.i > 0) {
    const m = g.t % win[0];
    if (!pilot.wait && (m < win[1] || m > win[2])) {
      w = [...route[pilot.i - 1]];
      w[3] = 0.001;
    } else pilot.wait = 1;
  }
  const dx = w[0] - g.p.x;
  const dz = w[2] - g.p.z;
  const dist = Math.hypot(dx, dz) || 1;
  const want = (w[3] ?? 7) * (1 + pilot.jitter);
  // Slow down into a waypoint that asks us to.
  const speed = Math.min(want, 0.3 + dist * 2.5);
  const tvx = (dx / dist) * speed;
  const tvz = (dz / dist) * speed;
  const gain = 0.28;
  const x = (tvx - g.v.x) * gain;
  const z = (tvz - g.v.z) * gain;
  const m = Math.hypot(x, z);
  return m > 1 ? { x: x / m, z: z / m } : { x, z };
}
