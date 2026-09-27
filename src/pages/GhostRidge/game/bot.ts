// A rider that plays itself: it rides the title screen and checks that the
// course can be finished in time.
import { centerAt, G, halfAt, heightAt, nearbyObstacles } from "./course";
import { distance, NO_INPUT, speedOf, wrapPi, type Game, type Input } from "./sim";

export type Bot = { lane: number; laneT: number; spins: number; flips: number; grab: boolean; landing: number; wantJump: boolean };

export const newBot = (): Bot => ({ lane: 0, laneT: 0, spins: 0, flips: 0, grab: false, landing: 0, wantJump: false });

// Seconds until a jump from here comes back down, roughly.
function airtime(g: Game) {
  let { x, y, z } = g.p;
  let vy = g.v.y;
  for (let t = 0; t < 4; t += 1 / 30) {
    x += g.v.x / 30;
    y += vy / 30;
    z += g.v.z / 30;
    vy -= G / 30;
    if (y < heightAt(g.course, x, z)) return t;
  }
  return 4;
}

function laneClear(g: Game, u: number, from: number, to: number) {
  const c = g.course;
  let worst = 99;
  for (let d = from; d < to; d += 6) {
    for (const list of nearbyObstacles(c, d)) {
      if (!list) continue;
      for (const o of list) {
        const od = -o.z;
        if (od < from || od > to) continue;
        worst = Math.min(worst, Math.abs(o.x - (centerAt(c, od) + u)) - o.r);
      }
    }
  }
  return worst;
}

export function botInput(g: Game, bot: Bot, dt: number, skill = 1): Input {
  if (g.status !== "ride" || g.crashT > 0) return NO_INPUT;
  const c = g.course;
  const d = distance(g);
  if (!g.onGround) {
    if (bot.landing === 0) {
      // Just left the snow: pick tricks that fit the air.
      const t = airtime(g);
      bot.landing = t;
      const turns = Math.max(0, t - 0.35) * 7.4;
      bot.spins = Math.floor((turns / Math.PI) * skill) * Math.PI * (Math.random() < 0.5 ? 1 : -1);
      bot.flips = t > 1.3 && Math.random() < 0.4 * skill ? -Math.PI * 2 : 0;
      if (bot.flips) bot.spins = 0;
      bot.grab = t > 0.7;
    }
    const steer = Math.abs(bot.spins - g.spin) > 0.15 ? Math.sign(bot.spins - g.spin) : 0;
    const lean = Math.abs(bot.flips - g.flip) > 0.15 ? Math.sign(bot.flips - g.flip) : 0;
    return { steer, lean, jump: false, grab: bot.grab && g.airT < bot.landing - 0.2, boost: false };
  }
  bot.landing = 0;

  // Pick a clear lane every so often.
  bot.laneT -= dt;
  if (bot.laneT <= 0) {
    bot.laneT = 0.4;
    const hw = halfAt(c, d + 20);
    let best = bot.lane;
    let bestScore = -1e9;
    for (let u = -hw + 3; u <= hw - 3; u += 2) {
      const gap = laneClear(g, u, d + 4, d + 40);
      const score = Math.min(gap, 4) * 3 - Math.abs(u - bot.lane) * 0.15 - Math.abs(u) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = u;
      }
    }
    // Line up with any kicker coming up.
    for (const k of c.kickers) {
      if (k.d > d + 4 && k.d < d + 90) best = k.u;
    }
    bot.lane = best;
  }
  const look = d + 16;
  const tx = centerAt(c, look) + bot.lane;
  const want = Math.atan2(tx - g.p.x, look - d);
  const steer = Math.max(-1, Math.min(1, wrapPi(want - g.heading) * 3));

  // Ollie at the lip of a kicker.
  let jump = false;
  for (const k of c.kickers) {
    const lip = k.d + k.len;
    if (d > lip - 6 && d < lip - 0.6) jump = true;
  }
  const release = bot.wantJump && !jump;
  bot.wantJump = jump;
  return { steer, lean: speedOf(g) < 34 ? 1 : 0, jump: jump && !release, grab: false, boost: g.boost > 0.5 };
}
