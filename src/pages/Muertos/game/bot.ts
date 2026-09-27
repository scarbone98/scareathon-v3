// A bot that walks a loop through the map and shoots whatever's closest.
// It plays the title-screen demo, and it's how the rounds get tested
// headless.
import { CELL, clearLine } from "./map";
import { curWeapon, type Game, type Input } from "./sim";

const WAYPOINTS: [number, number][] = [
  [40.5, 25],
  [38.5, 17],
  [37, 20],
  [31, 20],
  [25, 20],
  [21, 20],
  [16, 17],
  [12.9, 14],
  [12.9, 11],
  [9, 9],
  [6, 5.5],
  [11, 5.5],
  [12.9, 11],
  [12.9, 15],
  [18, 21],
  [24, 20],
  [31, 20],
  [38, 20],
  [38.5, 24.5],
].map(([c, r]) => [c * CELL, r * CELL]);

export type Bot = { wp: number; aimT: number; fireHeld: boolean; stuckT: number; lastD: number };
export const newBot = (): Bot => ({ wp: 1, aimT: 0, fireHeld: false, stuckT: 0, lastD: 1e9 });

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function botInput(g: Game, b: Bot, dt: number, opts: { roam: boolean }): Input {
  const p = g.player;
  // The nearest zombie it can see.
  let target: (typeof g.zombies)[number] | null = null;
  let best = 22;
  for (const z of g.zombies) {
    if (z.state === "dead" || z.state === "spawn" || z.y < -1.2) continue;
    const d = Math.hypot(z.x - p.x, z.z - p.z);
    if (d < best && (d < 3 || clearLine(g.walk, p.x, p.z, z.x, z.z))) {
      best = d;
      target = z;
    }
  }

  // Walking.
  let [wx, wz] = WAYPOINTS[b.wp];
  let d = Math.hypot(wx - p.x, wz - p.z);
  if (d < 1.2) {
    b.wp = (b.wp + 1) % WAYPOINTS.length;
    [wx, wz] = WAYPOINTS[b.wp];
    d = Math.hypot(wx - p.x, wz - p.z);
  }
  let mvx = opts.roam ? (wx - p.x) / Math.max(d, 1e-3) : 0;
  let mvz = opts.roam ? (wz - p.z) / Math.max(d, 1e-3) : 0;
  // Back off from anything close.
  if (target && best < 3.5) {
    mvx = (p.x - target.x) / best;
    mvz = (p.z - target.z) / best;
  }

  let yaw = p.yaw;
  let pitch = p.pitch * 0.9;
  let fire = false;
  if (target) {
    const want = Math.atan2(target.x - p.x, -(target.z - p.z));
    const wantP = Math.atan2(target.y + 1.45 - 1.6, best);
    yaw = p.yaw + wrap(want - p.yaw) * Math.min(1, dt * 7);
    pitch = p.pitch + (wantP - p.pitch) * Math.min(1, dt * 7);
    const off = Math.abs(wrap(want - yaw));
    b.aimT = off < 0.08 ? b.aimT + dt : 0;
    // Semi-automatics need the trigger let go between shots.
    fire = b.aimT > 0.12 && (autoGun(g) || !b.fireHeld);
    b.fireHeld = fire;
  } else if (opts.roam && d > 0.5) {
    const want = Math.atan2(wx - p.x, -(wz - p.z));
    yaw = p.yaw + wrap(want - p.yaw) * Math.min(1, dt * 2.5);
    b.fireHeld = false;
  }

  // Move in the world, whichever way it's looking.
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const forward = mvx * s - mvz * c;
  const strafe = mvx * c + mvz * s;
  const w = curWeapon(g);
  return {
    forward: forward * (target ? 0.7 : 0.55),
    strafe: strafe * (target ? 0.7 : 0.55),
    yaw,
    pitch,
    fire,
    ads: false,
    reload: !target && w.mag < 4,
    use: false,
    knife: !!target && best < 1.4,
    swap: false,
    sprint: false,
  };
}

const autoGun = (g: Game) => ["metralleta", "rifle", "ametralladora"].includes(curWeapon(g).id);
