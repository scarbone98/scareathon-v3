// A bot that walks a loop through the map and shoots whatever's closest.
// It plays the title-screen demo, and it's how the rounds get tested
// headless.
import { CELL, clearLine } from "./map";
import { curWeapon, type Game, type Input } from "./sim";

// A grand tour: the south loop, out across the campo, round El Morro's
// terraces, back through the cemetery and along Norzagaray.
const WAYPOINTS: [number, number][] = [
  [70.5, 35],
  [70, 37.5],
  [70, 44],
  [70.5, 50.5],
  [70, 47],
  [66, 46],
  [56, 46],
  [56, 36],
  [56, 31],
  [52, 30],
  [40, 28],
  [30, 21],
  [26, 21],
  [22, 21],
  [16, 23],
  [16, 17],
  [12.9, 15],
  [12.9, 13],
  [12.9, 9],
  [8, 7.5],
  [20, 8.5],
  [13, 9],
  [12.9, 13],
  [12.9, 15],
  [9.9, 26],
  [9.9, 30],
  [9.9, 34],
  [4, 34],
  [3.5, 17],
  [4, 34],
  [9.9, 34],
  [9.9, 27],
  [16, 22],
  [22, 21],
  [27, 21],
  [40, 22],
  [46, 16],
  [50, 16],
  [50.5, 12.5],
  [53.5, 13.5],
  [60, 13.5],
  // Down into La Perla, round the court and back up.
  [70.5, 13],
  [70.5, 10.5],
  [70.5, 8.5],
  [63.5, 8.5],
  [63.5, 5.5],
  [64.5, 5.5],
  [64.5, 2.5],
  [68.5, 1.5],
  [69.5, 2.5],
  [69.5, 5.5],
  [69.5, 8.5],
  [70.5, 8.5],
  [70.5, 10.5],
  [70.5, 13],
  [77, 13.5],
  [77, 20],
  [77, 24.5],
  [72, 24.5],
  [68.5, 27],
  [68.5, 34],
].map(([c, r]) => [c * CELL, r * CELL]);

export type Bot = { wp: number; aimT: number; fireHeld: boolean; knifeTap: boolean; stuckT: number; lastD: number };
export const newBot = (): Bot => ({ wp: 1, aimT: 0, fireHeld: false, knifeTap: false, stuckT: 0, lastD: 1e9 });

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
  let pitch = 0;
  let fire = false;
  if (target) {
    pitch = Math.atan2(target.gy + target.y + 1.5 - (p.y + 1.6), Math.max(best, 0.5));
    const want = Math.atan2(target.x - p.x, -(target.z - p.z));
    yaw = p.yaw + wrap(want - p.yaw) * Math.min(1, dt * 9);
    const off = Math.abs(wrap(want - yaw));
    b.aimT = off < 0.08 ? b.aimT + dt : 0;
    // Semi-automatics need the trigger let go between shots. Up close,
    // just shoot.
    fire = (b.aimT > 0.1 || best < 2.2) && (autoGun(g) || !b.fireHeld);
    b.fireHeld = fire;
  } else {
    if (opts.roam && d > 0.5) yaw = p.yaw + wrap(Math.atan2(wx - p.x, -(wz - p.z)) - p.yaw) * Math.min(1, dt * 3);
    b.fireHeld = false;
  }

  const w = curWeapon(g);
  const pace = target ? 0.75 : 0.6;
  return {
    mx: mvx * pace,
    mz: mvz * pace,
    yaw,
    pitch,
    flat: false,
    ads: false,
    fire,
    reload: !target && w.mag < 4,
    use: false,
    // The knife swings on a fresh press, so tap it.
    knife: !!target && best < 1.4 && (b.knifeTap = !b.knifeTap),
    swap: false,
    sprint: false,
  };
}

const autoGun = (g: Game) => ["metralleta", "rifle", "ametralladora"].includes(curWeapon(g).id);
