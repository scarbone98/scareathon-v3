// Riding physics, tricks and scoring for Ghost Ridge. No three.js here, so
// the bot and balance checks can run it without a screen.
import { buildCourse, centerAt, courseHeading, G, GATE_BONUS, GATES, heightAt, LENGTH, nearbyObstacles, normalAt, START_D, type Course } from "./course";

export const START_TIME = 55;
const DT = 1 / 120;
const SPIN_RATE = 7.4; // rad/s in the air
const FLIP_RATE = 6.4;
const CANDY_POINTS = 25;
const FINISH_POINTS = 2000;
const TIME_POINTS = 100; // per second left at the finish

export type Input = { steer: number; lean: number; jump: boolean; grab: boolean; boost: boolean };
export const NO_INPUT: Input = { steer: 0, lean: 0, jump: false, grab: false, boost: false };

export type V3 = { x: number; y: number; z: number };
export type Status = "ready" | "ride" | "finish" | "timeup";

export type GameEvent =
  | { type: "go" }
  | { type: "jump" }
  | { type: "land"; clean: boolean; hard: number }
  | { type: "trick"; name: string; points: number }
  | { type: "crash"; reason: string }
  | { type: "candy" }
  | { type: "gate"; bonus: number; split: number }
  | { type: "finish"; bonus: number }
  | { type: "timeup" };

export type Game = {
  course: Course;
  status: Status;
  statusT: number;
  p: V3;
  v: V3;
  heading: number;
  onGround: boolean;
  airT: number;
  spin: number;
  flip: number;
  grabT: number;
  grabName: string;
  charge: number;
  jumpHeld: boolean;
  popped: boolean;
  crashT: number;
  boosting: boolean;
  boost: number;
  time: number;
  elapsed: number;
  score: number;
  tricks: number;
  bestTrick: { name: string; points: number } | null;
  candy: number;
  candyTaken: Uint8Array;
  nextGate: number;
  finishBonus: number;
  carve: number; // how hard the edge is biting, for sound and spray
  events: GameEvent[];
  clock: number;
  acc: number;
  // The title-screen rider passes through graves, trees and ghosts.
  ghostly: boolean;
};

const GRABS = ["Indy", "Method", "Mute", "Stalefish", "Tail Grab", "Nose Grab", "Crail", "Graveyard Grab", "Mummy Wrap"];

let shared: Course | null = null;
export function sharedCourse() {
  return (shared ??= buildCourse());
}

export function newGame(course = sharedCourse()): Game {
  const z = -START_D; // downhill is -z
  return {
    course,
    status: "ready",
    statusT: 0,
    p: { x: 0, y: heightAt(course, 0, z), z },
    v: { x: 0, y: 0, z: 0 },
    heading: 0,
    onGround: true,
    airT: 0,
    spin: 0,
    flip: 0,
    grabT: 0,
    grabName: "",
    charge: 0,
    jumpHeld: false,
    popped: false,
    crashT: 0,
    boosting: false,
    boost: 0.35,
    time: START_TIME,
    elapsed: 0,
    score: 0,
    tricks: 0,
    bestTrick: null,
    candy: 0,
    candyTaken: new Uint8Array(course.candy.length),
    nextGate: 0,
    finishBonus: 0,
    carve: 0,
    events: [],
    clock: 0,
    acc: 0,
    ghostly: false,
  };
}

export const distance = (g: Game) => -g.p.z;
export const speedOf = (g: Game) => Math.hypot(g.v.x, g.v.y, g.v.z);
export const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function step(g: Game, dt: number, input: Input) {
  g.acc = Math.min(g.acc + dt, 0.1);
  while (g.acc >= DT) {
    g.acc -= DT;
    tick(g, input);
  }
}

function tick(g: Game, input: Input) {
  const dt = DT;
  g.clock += dt;
  g.statusT += dt;
  if (g.status === "ready") {
    if (g.statusT >= 3) {
      g.status = "ride";
      g.statusT = 0;
      g.events.push({ type: "go" });
      // A push off the start.
      g.v.z = -9;
    }
    return;
  }
  if (g.status === "ride") {
    g.elapsed += dt;
    g.time -= dt;
    if (g.time <= 0) {
      g.time = 0;
      g.status = "timeup";
      g.statusT = 0;
      g.events.push({ type: "timeup" });
    }
  }
  // After the run the rider coasts to a stop.
  const riding = g.status === "ride";
  const inp = riding ? input : { ...NO_INPUT, lean: -0.6 };

  if (g.crashT > 0) crashed(g, dt);
  else if (g.onGround) ground(g, dt, inp);
  else air(g, dt, inp);

  if (riding) {
    pickups(g);
    gates(g);
    if (g.crashT <= 0 && !g.ghostly) hits(g);
  }
}

const tmpN = { x: 0, y: 1, z: 0 };

function ground(g: Game, dt: number, inp: Input) {
  const { course } = g;
  const n = normalAt(course, g.p.x, g.p.z, tmpN);
  const v = g.v;
  // Gravity along the slope.
  const gn = -G * n.y;
  v.x += -gn * n.x * dt;
  v.y += (-G - gn * n.y) * dt;
  v.z += -gn * n.z * dt;

  let speed = Math.hypot(v.x, v.y, v.z);
  const tuck = inp.lean > 0.3 && !inp.jump;
  const brake = inp.lean < -0.3;

  // Steer the board; slower to turn at speed and in a tuck.
  const turn = (2.5 - Math.min(speed, 40) / 40 * 0.9) * (tuck ? 0.6 : 1) * (brake ? 1.3 : 1);
  g.heading += inp.steer * turn * dt;
  // Keep the nose pointed down the mountain.
  const fall = courseHeading(course, -g.p.z);
  const off = wrapPi(g.heading - fall);
  const lim = 1.35;
  if (Math.abs(off) > lim) g.heading = fall + Math.sign(off) * lim;

  // The board's direction, laid on the snow.
  let fx = Math.sin(g.heading);
  let fy = 0;
  let fz = -Math.cos(g.heading);
  const fn = fx * n.x + fz * n.z;
  fx -= n.x * fn;
  fy -= n.y * fn;
  fz -= n.z * fn;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;

  // The edge carves the travel toward where the board points.
  let carve = 0;
  if (speed > 0.3) {
    let dx = v.x / speed;
    let dy = v.y / speed;
    let dz = v.z / speed;
    const cos = Math.max(-1, Math.min(1, dx * fx + dy * fy + dz * fz));
    const ang = Math.acos(cos);
    const grip = brake ? 3 : 8;
    const k = 1 - Math.exp(-grip * dt);
    dx += (fx - dx) * k;
    dy += (fy - dy) * k;
    dz += (fz - dz) * k;
    const dl = Math.hypot(dx, dy, dz) || 1;
    // Skidding sideways scrubs speed.
    speed *= 1 - Math.min(0.9, ang * (brake ? 2.2 : 0.55)) * dt;
    if (brake) speed *= 1 - 0.9 * dt;
    v.x = (dx / dl) * speed;
    v.y = (dy / dl) * speed;
    v.z = (dz / dl) * speed;
    carve = Math.min(1, ang * 2 + Math.abs(inp.steer) * 0.4 + (brake ? 0.6 : 0)) * Math.min(1, speed / 12);
  } else {
    v.x += fx * 3 * dt;
    v.y += fy * 3 * dt;
    v.z += fz * 3 * dt;
  }
  g.carve = carve;

  // Boost, if there's any in the meter.
  g.boosting = inp.boost && g.boost > 0 && g.status === "ride";
  if (g.boosting) {
    const push = 18 * dt;
    v.x += fx * push;
    v.y += fy * push;
    v.z += fz * push;
    g.boost = Math.max(0, g.boost - 0.32 * dt);
  }

  // Air resistance, less in a tuck.
  speed = Math.hypot(v.x, v.y, v.z);
  // Past cruising speed the air gets much thicker.
  const drag = (tuck ? 0.0048 : 0.0075) * speed + 0.015 + Math.max(0, speed - 40) * 0.02;
  const keep = Math.max(0, 1 - drag * dt);
  v.x *= keep;
  v.y *= keep;
  v.z *= keep;

  // Crouch to load an ollie; let go to jump.
  if (inp.jump) g.charge = Math.min(1, g.charge + dt / 0.45);
  const released = g.jumpHeld && !inp.jump;
  g.jumpHeld = inp.jump;

  g.p.x += v.x * dt;
  g.p.y += v.y * dt;
  g.p.z += v.z * dt;
  const h = heightAt(course, g.p.x, g.p.z);
  if (released && g.status === "ride") {
    g.p.y = Math.max(g.p.y, h) + 0.05;
    takeOff(g);
    ollie(g, n);
    return;
  }
  if (!inp.jump) g.charge = 0;
  if (g.p.y - h > 0.22) {
    // The snow fell away beneath us.
    takeOff(g);
    return;
  }
  g.p.y = h;
  // Follow the snow's new tilt, keeping speed.
  const n2 = normalAt(course, g.p.x, g.p.z, tmpN);
  const s = Math.hypot(v.x, v.y, v.z);
  const vn = v.x * n2.x + v.y * n2.y + v.z * n2.z;
  // Moving away from the snow (off a lip or over a crest): take off.
  if (vn > 1.8) {
    takeOff(g);
    return;
  }
  if (vn !== 0) {
    v.x -= n2.x * vn;
    v.y -= n2.y * vn;
    v.z -= n2.z * vn;
    const s2 = Math.hypot(v.x, v.y, v.z) || 1;
    v.x *= s / s2;
    v.y *= s / s2;
    v.z *= s / s2;
  }
}

function ollie(g: Game, n: V3) {
  const pop = 5.5 + g.charge * 4.5;
  g.v.x += n.x * pop;
  g.v.y += n.y * pop;
  g.v.z += n.z * pop;
  g.charge = 0;
  g.popped = true;
  g.events.push({ type: "jump" });
}

function takeOff(g: Game) {
  g.popped = false;
  g.onGround = false;
  g.airT = 0;
  g.spin = 0;
  g.flip = 0;
  g.grabT = 0;
  g.grabName = "";
  g.carve = 0;
  g.boosting = false;
}

function air(g: Game, dt: number, inp: Input) {
  const v = g.v;
  v.y -= G * dt;
  const keep = 1 - 0.0022 * Math.hypot(v.x, v.y, v.z) * dt;
  v.x *= keep;
  v.y *= keep;
  v.z *= keep;
  g.airT += dt;
  if (g.status === "ride") {
    g.spin += inp.steer * SPIN_RATE * dt;
    g.flip += inp.lean * FLIP_RATE * dt;
    if (inp.grab) {
      if (!g.grabName) g.grabName = GRABS[Math.floor(Math.random() * GRABS.length)];
      g.grabT += dt;
    }
  }
  // Letting go of jump just after leaving a lip still pops.
  if (g.jumpHeld && !inp.jump && !g.popped && g.airT < 0.15 && g.status === "ride") ollie(g, { x: 0, y: 1, z: 0 });
  if (!inp.jump && !g.popped) g.charge = Math.max(0, g.charge - dt * 4);
  g.jumpHeld = inp.jump;
  // The board faces the way we're flying (spins are drawn on top).
  if (Math.hypot(v.x, v.z) > 1) g.heading = Math.atan2(v.x, -v.z);
  g.p.x += v.x * dt;
  g.p.y += v.y * dt;
  g.p.z += v.z * dt;
  const h = heightAt(g.course, g.p.x, g.p.z);
  if (g.p.y <= h) {
    g.p.y = h;
    land(g);
  }
}

// How far a rotation is from a landable angle (a whole turn, or a half
// turn for spins, since you can land riding backwards).
const offBy = (a: number, period: number) => {
  const m = ((Math.abs(a) % period) + period) % period;
  return Math.min(m, period - m);
};

function land(g: Game) {
  g.onGround = true;
  const n = normalAt(g.course, g.p.x, g.p.z, tmpN);
  const v = g.v;
  const into = -(v.x * n.x + v.y * n.y + v.z * n.z);
  const clean = offBy(g.flip, Math.PI * 2) < 0.75 && offBy(g.spin, Math.PI) < 0.8;
  g.events.push({ type: "land", clean, hard: Math.min(1, into / 22) });
  if (!clean) {
    crash(g, "Bailed!");
    return;
  }
  // Keep most of the speed along the slope.
  const s = Math.hypot(v.x, v.y, v.z);
  v.x += n.x * into;
  v.y += n.y * into;
  v.z += n.z * into;
  const s2 = Math.hypot(v.x, v.y, v.z) || 1;
  const keep = Math.min(1, (s / s2) * (1 - Math.min(0.35, into / 90)));
  v.x *= keep;
  v.y *= keep;
  v.z *= keep;
  scoreTrick(g);
}

function scoreTrick(g: Game) {
  const parts: string[] = [];
  let points = 0;
  const halfSpins = Math.round(Math.abs(g.spin) / Math.PI);
  const flips = Math.round(Math.abs(g.flip) / (Math.PI * 2));
  if (halfSpins > 0) {
    parts.push(`${g.spin > 0 ? "Frontside" : "Backside"} ${halfSpins * 180}`);
    points += Math.round(120 * Math.pow(halfSpins, 1.35));
  }
  if (flips > 0) {
    const name = g.flip > 0 ? "Frontflip" : "Backflip";
    parts.push(flips === 1 ? name : `${["", "", "Double", "Triple", "Quad"][Math.min(flips, 4)]} ${name}`);
    points += 550 * flips + (flips > 1 ? 400 * (flips - 1) : 0);
  }
  if (g.grabT > 0.2) {
    parts.push(g.grabName);
    points += Math.round(120 + g.grabT * 280);
  }
  if (parts.length > 1) points = Math.round(points * (1 + 0.35 * (parts.length - 1)));
  if (g.airT > 0.9) {
    const air = Math.round(g.airT * 60);
    if (!parts.length) parts.push("Big Air");
    points += air;
  }
  if (!parts.length || points < 50) return;
  const name = parts.join(" + ");
  g.score += points;
  g.tricks++;
  g.boost = Math.min(1, g.boost + points / 2200);
  if (!g.bestTrick || points > g.bestTrick.points) g.bestTrick = { name, points };
  g.events.push({ type: "trick", name, points });
}

function crash(g: Game, reason: string) {
  g.crashT = 1.5;
  g.onGround = true;
  g.carve = 0;
  g.charge = 0;
  g.boosting = false;
  g.events.push({ type: "crash", reason });
}

function crashed(g: Game, dt: number) {
  g.crashT -= dt;
  const v = g.v;
  const k = Math.exp(-2.4 * dt);
  v.x *= k;
  v.z *= k;
  g.p.x += v.x * dt;
  g.p.z += v.z * dt;
  g.p.y = heightAt(g.course, g.p.x, g.p.z);
  v.y = 0;
  if (g.crashT <= 0) {
    g.crashT = 0;
    g.heading = courseHeading(g.course, -g.p.z);
    const s = Math.max(5, Math.hypot(v.x, v.z));
    v.x = Math.sin(g.heading) * s;
    v.z = -Math.cos(g.heading) * s;
    g.spin = g.flip = 0;
  }
}

function hits(g: Game) {
  const { p, course } = g;
  const speed = Math.hypot(g.v.x, g.v.z);
  for (const list of nearbyObstacles(course, -p.z)) {
    if (!list) continue;
    for (const o of list) {
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const dist = Math.hypot(dx, dz);
      const reach = o.r + 0.45;
      if (dist >= reach) continue;
      const top = heightAt(course, o.x, o.z) + o.h;
      if (p.y > top) continue;
      if (speed > 7) {
        // Bounce back off it.
        g.v.x = (dx / (dist || 1)) * 3;
        g.v.z = (dz / (dist || 1)) * 3 + (g.v.z > 0 ? 0 : -2);
        crash(g, o.kind === "grave" || o.kind === "cross" ? "Hit a grave!" : o.kind === "rock" ? "Rocked!" : "Tree'd!");
      } else {
        p.x = o.x + (dx / (dist || 1)) * reach;
        p.z = o.z + (dz / (dist || 1)) * reach;
      }
      return;
    }
  }
  for (const gh of course.ghosts) {
    if (Math.abs(gh.d + p.z) > 6) continue;
    const pos = ghostPos(g, gh);
    if (Math.hypot(pos.x - p.x, pos.y - (p.y + 0.9), pos.z - p.z) < 1.6) {
      crash(g, "Spooked!");
      return;
    }
  }
}

export function ghostPos(g: { course: Course; clock: number }, gh: Course["ghosts"][number]) {
  const t = g.clock * gh.speed + gh.phase;
  const d = gh.d + Math.sin(t * 0.7) * 3;
  const c = g.course;
  const x = centerAt(c, d) + gh.u + Math.sin(t) * gh.amp;
  const z = -d;
  return { x, y: heightAt(c, x, z) + 1.5 + Math.sin(g.clock * 2.3 + gh.phase) * 0.35, z, facing: Math.cos(t) };
}

function pickups(g: Game) {
  const { p, course } = g;
  const cy = p.y + 0.9;
  const list = course.candy;
  for (let i = 0; i < list.length; i++) {
    if (g.candyTaken[i]) continue;
    const c = list[i];
    if (Math.abs(c.z - p.z) > 2) continue;
    if (Math.hypot(c.x - p.x, c.y - cy, c.z - p.z) < 1.8) {
      g.candyTaken[i] = 1;
      g.candy++;
      g.score += CANDY_POINTS;
      g.boost = Math.min(1, g.boost + 0.03);
      g.events.push({ type: "candy" });
    }
  }
}

function gates(g: Game) {
  const d = -g.p.z;
  if (g.nextGate < GATES.length && d >= GATES[g.nextGate]) {
    g.nextGate++;
    g.time += GATE_BONUS;
    g.events.push({ type: "gate", bonus: GATE_BONUS, split: g.elapsed });
  }
  if (d >= LENGTH) {
    g.status = "finish";
    g.statusT = 0;
    g.finishBonus = FINISH_POINTS + Math.floor(g.time) * TIME_POINTS;
    g.score += g.finishBonus;
    g.events.push({ type: "finish", bonus: g.finishBonus });
  }
}
