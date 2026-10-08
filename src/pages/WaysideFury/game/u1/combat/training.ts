import type { GameState, HeroId, Projectile } from "../../sim.ts";
import { getWorld, isBlocked } from "../../world.ts";
import type { TrainingTier } from "../../../../../../server/shared/waysideFury/u1Combat.js";

export const TRAINING_BOARD = { id: "training-board", name: "Training grounds", x: 304, y: 360, range: 30 } as const;
export const TRAINING_YARD = { x: 288, y: 376, width: 112, height: 112 } as const;
export type ChallengeTier = Exclude<TrainingTier, 0>;
export type TrainingKind = "time-trial" | "target-break" | "combo";
export interface TrainingRing { x: number; y: number; radius: number }
export interface TrainingTarget { id: number; x: number; y: number; radius: number; broken: boolean; hitFlash: number }
export interface TrainingRuntime {
  hero: HeroId; tier: ChallengeTier; kind: TrainingKind; elapsed: number; timeLimit: number;
  rings: TrainingRing[]; ringIndex: number; targets: TrainingTarget[]; hits: number; requiredHits: number;
  lastHitAt: number; lastSwingAt: number; previousX: number; previousY: number;
}
export type TrainingFailure = "time" | "left-yard" | "hero-changed" | "interrupted";
export const TRAINING_TIER_NAMES = ["Untrained", "Footwork", "Precision", "Mastery"] as const;
const COMBO_MIN_GAP = 0.18, COMBO_MAX_GAP = 0.72;
const HERO_LIMITS: Record<HeroId, number> = { you: 9, joe: 10, matt: 8, alex: 9, jon: 9 };

function clearSegment(s: GameState, x0: number, y0: number, x1: number, y1: number, radius: number): boolean {
  const world = getWorld(s.scene, s.room), steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
  for (let n = 0; n <= steps; n++) {
    const t = n / steps;
    if (isBlocked(world, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius)) return false;
  }
  return true;
}
function segmentHit(x0: number, y0: number, x1: number, y1: number, x: number, y: number, radius: number): number | null {
  const dx = x1 - x0, dy = y1 - y0, lengthSq = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / Math.max(0.000001, lengthSq)));
  return Math.hypot(x - x0 - dx * t, y - y0 - dy * t) <= radius ? t : null;
}
function challenge(hero: HeroId, tier: ChallengeTier, x: number, y: number): TrainingRuntime {
  const rings: TrainingRing[] = [{ x: 312, y: 384, radius: 12 }, { x: 384, y: 384, radius: 12 },
    { x: 384, y: 464, radius: 12 }, { x: 312, y: 464, radius: 12 }, { x: 352, y: 424, radius: 12 }];
  const positions = tier === 3 ? [{ x: 352, y: 424 }] :
    [{ x: 312, y: 392 }, { x: 384, y: 392 }, { x: 312, y: 464 }, { x: 384, y: 464 }];
  return {
    hero, tier, kind: tier === 1 ? "time-trial" : tier === 2 ? "target-break" : "combo",
    elapsed: 0, timeLimit: tier === 1 ? HERO_LIMITS[hero] : tier === 2 ? 18 : 14,
    rings: tier === 1 ? rings : [], ringIndex: 0,
    targets: tier === 1 ? [] : positions.map((p, i) => ({ ...p, id: -1001 - i, radius: tier === 3 ? 11 : 9, broken: false, hitFlash: 0 })),
    hits: 0, requiredHits: tier === 3 ? 9 : 4, lastHitAt: -1, lastSwingAt: -1,
    previousX: x, previousY: y,
  };
}
export function startTraining(s: GameState): boolean {
  if (s.scene !== "hub" || s.training || s.heroes[s.active].hp <= 0 || s.coop?.downed ||
    Math.hypot(s.x - TRAINING_BOARD.x, s.y - TRAINING_BOARD.y) > TRAINING_BOARD.range) return false;
  const nextTier = s.u1.combat.training[s.active] + 1;
  if (nextTier > 3) { s.notice = "Signature mastered. Switch heroes to train another move."; return false; }
  s.training = challenge(s.active, nextTier as ChallengeTier, s.x, s.y);
  s.overlay = null;
  s.notice = nextTier === 1 ? "Footwork: pass through each gold ring before time runs out."
    : nextTier === 2 ? "Precision: break all four practice targets with Attack or Ki."
    : "Mastery: land 9 consecutive melee hits, 0.18–0.72 seconds apart. Missing resets the chain.";
  return true;
}
function finishTraining(s: GameState): void {
  s.training = null;
  // Hub simulation stops advancing shots outside practice. Hero projectiles
  // are predicted locally; the shared co-op world publishes only enemy shots.
  s.projectiles = s.projectiles.filter(p => p.owner !== "hero");
}
export function cancelTraining(s: GameState): void {
  if (!s.training) return;
  finishTraining(s);
  s.notice = "Training stopped. Your earned tiers are saved.";
}
function fail(s: GameState, reason: TrainingFailure): void {
  const t = s.training;
  if (!t) return;
  s.events.push({ type: "training-failed", hero: t.hero, tier: t.tier, reason });
  finishTraining(s);
  s.notice = reason === "time" ? "Time's up. Return to the training board to retry."
    : reason === "hero-changed" ? "Train one hero at a time. Return to the board to start their next tier."
    : "Training stopped. Return to the board when you're ready.";
}
function complete(s: GameState): void {
  const t = s.training;
  if (!t) return;
  s.u1.combat.training[t.hero] = Math.max(s.u1.combat.training[t.hero], t.tier) as TrainingTier;
  s.events.push({ type: "training-complete", hero: t.hero, tier: t.tier });
  s.floaters.push({ id: s.nextId++, x: s.x, y: s.y - 14, text: `SIGNATURE TIER ${t.tier}`, color: "#ffe790", ttl: 1.5 });
  s.effects.push({ id: s.nextId++, kind: "level", x: s.x, y: s.y, dx: 0, dy: 0, ttl: 0.8, maxT: 0.8, hero: t.hero, size: 34 });
  s.notice = `${TRAINING_TIER_NAMES[t.tier]} complete! Signature upgraded to tier ${t.tier}.`;
  finishTraining(s);
}
export function tickTraining(s: GameState, dt: number): void {
  const t = s.training;
  if (!t) return;
  if (s.active !== t.hero) { fail(s, "hero-changed"); return; }
  if (s.scene !== "hub" || s.heroes[t.hero].hp <= 0 || s.coop?.downed) { fail(s, "interrupted"); return; }
  const margin = 32;
  if (s.x < TRAINING_YARD.x - margin || s.x > TRAINING_YARD.x + TRAINING_YARD.width + margin ||
    s.y < Math.min(TRAINING_YARD.y - margin, TRAINING_BOARD.y - TRAINING_BOARD.range) || s.y > TRAINING_YARD.y + TRAINING_YARD.height + margin) { fail(s, "left-yard"); return; }
  const delta = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  t.elapsed += delta;
  for (const target of t.targets) target.hitFlash = Math.max(0, target.hitFlash - delta);
  if (t.elapsed > t.timeLimit + 1e-9) { fail(s, "time"); return; }
  if (t.kind === "time-trial") {
    const ring = t.rings[t.ringIndex];
    if (ring && segmentHit(t.previousX, t.previousY, s.x, s.y, ring.x, ring.y, ring.radius) !== null &&
      clearSegment(s, t.previousX, t.previousY, s.x, s.y, 7)) {
      t.ringIndex++;
      if (t.ringIndex === t.rings.length) { complete(s); return; }
    }
  } else if (t.kind === "combo" && t.hits > 0 && t.elapsed - t.lastHitAt > COMBO_MAX_GAP + 1e-9) {
    t.hits = 0; t.lastHitAt = -1;
    s.notice = "Combo expired. Keep the next melee hit within 0.72 seconds.";
  }
  t.previousX = s.x; t.previousY = s.y;
}
function breakTarget(s: GameState, target: TrainingTarget): void {
  target.broken = true; target.hitFlash = 0.3;
  s.effects.push({ id: s.nextId++, kind: "hit", x: target.x, y: target.y, dx: 0, dy: 0,
    ttl: 0.3, maxT: 0.3, hero: s.active, size: 16 });
  if (s.training?.targets.every(item => item.broken)) complete(s);
}
export function trainingMelee(s: GameState, reach: number, faceX: number, faceY: number): boolean {
  const t = s.training;
  if (!t || t.hero !== s.active || s.scene !== "hub" || s.heroes[t.hero].hp <= 0 || s.coop?.downed ||
    t.kind === "time-trial" || !Number.isFinite(reach) || reach <= 0) return false;
  if (t.lastSwingAt >= 0 && t.elapsed - t.lastSwingAt < COMBO_MIN_GAP - 1e-9) return false;
  t.lastSwingAt = t.elapsed;
  const targets = t.targets.filter(target => {
    if (target.broken) return false;
    const dx = target.x - s.x, dy = target.y - s.y, length = Math.hypot(dx, dy);
    return length <= reach + target.radius && (dx * faceX + dy * faceY) / Math.max(1, length) >= -0.1 &&
      clearSegment(s, s.x, s.y, target.x, target.y, 0);
  });
  if (t.kind === "target-break") {
    for (const target of targets) breakTarget(s, target);
    return targets.length > 0;
  }
  if (!targets.length) {
    t.hits = 0; t.lastHitAt = -1; s.notice = "Missed. Step close, face the target, and start a new combo.";
    return false;
  }
  const gap = t.lastHitAt < 0 ? 0 : t.elapsed - t.lastHitAt;
  t.hits = t.lastHitAt >= 0 && gap >= COMBO_MIN_GAP - 1e-9 && gap <= COMBO_MAX_GAP + 1e-9 ? t.hits + 1 : 1;
  t.lastHitAt = t.elapsed; targets[0].hitFlash = 0.2;
  if (t.hits >= t.requiredHits) complete(s);
  return true;
}
export function trainingProjectile(s: GameState, p: Projectile, oldX: number, oldY: number): boolean {
  const t = s.training;
  if (!t || t.hero !== s.active || s.scene !== "hub" || s.heroes[t.hero].hp <= 0 || s.coop?.downed ||
    t.kind !== "target-break" || p.owner !== "hero" || (p.hero && p.hero !== t.hero)) return false;
  const hits = t.targets.filter(target => !target.broken && !p.hits.includes(target.id))
    .map(target => ({ target, at: segmentHit(oldX, oldY, p.x, p.y, target.x, target.y, target.radius + p.radius) }))
    .filter((hit): hit is { target: TrainingTarget; at: number } => hit.at !== null)
    .sort((a, b) => a.at - b.at);
  let hit = false;
  for (const { target, at } of hits) {
    // Root traces walls first. Keep this guard for callers using the module alone.
    if (!clearSegment(s, oldX, oldY, oldX + (p.x - oldX) * at, oldY + (p.y - oldY) * at, p.radius)) continue;
    p.hits.push(target.id); breakTarget(s, target); hit = true;
    if (!p.beam) { p.ttl = 0; break; }
  }
  return hit;
}
