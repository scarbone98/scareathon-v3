import { defaultCombatProgress } from "../../../../../../server/shared/waysideFury/u1Combat.js";
import { createItemsSave } from "../../../../../../server/shared/waysideFury/u1Items.js";
import type { GameState, HeroId } from "../../sim.ts";
import { getWorld, isBlocked, type CollisionRect } from "../../world.ts";
import { sanitizeWorldSave, type WorldSave } from "../../../../../../server/shared/waysideFury/u1World.js";

export interface HeroObstacle extends CollisionRect {
  id: string; worldId: string; kind: "boulder" | "vent" | "terminal" | "vines";
  hero: HeroId; glyph: string; name: string; walls: CollisionRect[];
  rewardAnchor: { x: number; y: number }; rewardId?: string;
}
const make = (id: string, worldId: string, kind: HeroObstacle["kind"], hero: HeroId,
  left: number, top: number, rewardId?: string): HeroObstacle => ({
  id, worldId, kind, hero, glyph: { you: "★", joe: "✊", matt: "↔", alex: "⌘", jon: "♨" }[hero],
  name: { boulder: "Smash cracked boulder", vent: "Squeeze through vent", terminal: "Hack terminal", vines: "Burn thorn vines" }[kind],
  x: left + 6, y: top + 68, w: 60, h: 10,
  walls: [{ x: left, y: top, w: 72, h: 6 }, { x: left, y: top + 6, w: 6, h: 72 }, { x: left + 66, y: top + 6, w: 6, h: 72 }],
  rewardAnchor: { x: left + 36, y: top + 40 }, rewardId,
});
// Enclosed side alcoves leave all story routes open. Orchard/depot enclose
// existing supply chests; the other anchors are consumed by U2 and JOB E.
export const HERO_OBSTACLES: readonly HeroObstacle[] = [
  make("world-joe-road", "blast-0", "boulder", "joe", 128, 56),
  make("world-matt-station", "hub", "vent", "matt", 288, 64),
  make("world-alex-yard", "blast-2", "terminal", "alex", 336, 48),
  make("world-jon-orchard", "blast-8", "vines", "jon", 456, 136, "loot-blast-8"),
  make("world-alex-depot", "blast-9", "terminal", "alex", 456, 136, "loot-blast-9"),
  make("world-joe-county", "overworld", "boulder", "joe", 752, 320),
];
export function worldSave(s: GameState): WorldSave {
  s.u1 ??= { combat: defaultCombatProgress(), items: createItemsSave() }; s.u1.world ??= sanitizeWorldSave(undefined); return s.u1.world;
}
export function obstaclesForState(s: Pick<GameState, "scene" | "room">): readonly HeroObstacle[] {
  const id = s.scene === "dungeon" ? `blast-${s.room}` : s.scene === "realm" ? `realm-${s.room}` : s.scene;
  return HERO_OBSTACLES.filter(gate => gate.worldId === id);
}
export function isObstacleCleared(s: GameState, id: string): boolean {
  return (s.coop?.worldObstacles ?? worldSave(s).clearedObstacles).includes(id);
}
const hits = (r: CollisionRect, x: number, y: number, radius: number) => {
  const nx = Math.max(r.x, Math.min(x, r.x + r.w)), ny = Math.max(r.y, Math.min(y, r.y + r.h));
  return radius === 0 ? x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h : (x - nx) ** 2 + (y - ny) ** 2 < radius ** 2;
};
export function obstacleBlocks(s: GameState, x: number, y: number, radius = 7): boolean {
  return obstaclesForState(s).some(gate => gate.walls.some(wall => hits(wall, x, y, radius)) || !isObstacleCleared(s, gate.id) && hits(gate, x, y, radius));
}
export function getHeroObstacleTarget(s: GameState): (HeroObstacle & { label: string }) | null {
  const targets = obstaclesForState(s).filter(gate => !isObstacleCleared(s, gate.id) &&
    Math.hypot(s.x - Math.max(gate.x, Math.min(s.x, gate.x + gate.w)), s.y - Math.max(gate.y, Math.min(s.y, gate.y + gate.h))) < 28);
  targets.sort((a, b) => Math.hypot(s.x-a.x-a.w/2,s.y-a.y-a.h/2)-Math.hypot(s.x-b.x-b.w/2,s.y-b.y-b.h/2));
  const gate = targets[0];
  if (!gate) return null;
  const hero = gate.hero[0].toUpperCase() + gate.hero.slice(1);
  return { ...gate, label: `${gate.glyph} ${s.active === gate.hero ? hero : `Tag ${hero}`} · ${gate.name}` };
}
export function canClearHeroObstacle(s: GameState, id: string, remoteActor?: { hero: HeroId; x: number; y: number; hp: number }): boolean {
  const actor = remoteActor ?? { hero: s.active, x: s.x, y: s.y, hp: s.heroes[s.active].hp };
  const gate = obstaclesForState(s).find(gate => gate.id === id);
  return !!gate && !isObstacleCleared(s, id) && actor.hero === gate.hero && actor.hp > 0 && (!!remoteActor || !s.overlay) &&
    Math.hypot(actor.x - Math.max(gate.x, Math.min(actor.x, gate.x + gate.w)), actor.y - Math.max(gate.y, Math.min(actor.y, gate.y + gate.h))) < 28;
}
export function clearHeroObstacle(s: GameState, id: string, actor?: { hero: HeroId; x: number; y: number; hp: number }): boolean {
  if (s.coop?.role === "guest" || !canClearHeroObstacle(s, id, actor)) return false;
  const gate = HERO_OBSTACLES.find(gate => gate.id === id)!;
  if (s.coop) { s.coop.worldObstacles ??= [...worldSave(s).clearedObstacles]; s.coop.worldObstacles.push(id); }
  // Opening shared geometry also records this discovery for participants. It
  // never overwrites any other personal inventory or progress namespace.
  if (!worldSave(s).clearedObstacles.includes(id)) worldSave(s).clearedObstacles.push(id);
  s.notice = `${gate.hero[0].toUpperCase() + gate.hero.slice(1)} cleared the way. Explore the cache inside!`;
  s.events.push({ type: "obstacle-cleared", id, x: gate.x + gate.w / 2, y: gate.y + gate.h / 2, hero: gate.hero });
  return true;
}
export function obstacleRewardAvailable(s: GameState, rewardId: string): boolean {
  const gate = HERO_OBSTACLES.find(gate => gate.rewardId === rewardId);
  return !gate || isObstacleCleared(s, gate.id);
}
export function syncWorldObstacles(s: GameState, ids: readonly string[]): void {
  if (!s.coop) return;
  const previous = s.coop.worldObstacles;
  s.coop.worldObstacles = [...ids];
  if (!previous) return;
  for (const id of ids) if (!previous.includes(id) && !worldSave(s).clearedObstacles.includes(id)) {
    const gate = HERO_OBSTACLES.find(gate => gate.id === id);
    if (!gate) continue;
    worldSave(s).clearedObstacles.push(id);
    s.events.push({ type: "obstacle-cleared", id, x: gate.x + gate.w / 2, y: gate.y + gate.h / 2, hero: gate.hero });
  }
}
export function releaseBorrowedObstacles(s: GameState, shared: readonly string[]): void {
  const radius = s.scene === "overworld" ? 10 : 7;
  for (const gate of obstaclesForState(s)) {
    if (!shared.includes(gate.id) || worldSave(s).clearedObstacles.includes(gate.id)) continue;
    const left = gate.walls[0].x, top = gate.walls[0].y;
    if (s.x < left - radius || s.x > left + 72 + radius || s.y < top - radius || s.y > gate.y + gate.h + radius) continue;
    const world = getWorld(s.scene, s.room);
    for (let offset = 0; offset <= 48; offset += 4) for (const dx of [0, -12, 12, -24, 24]) {
      const x = gate.x + gate.w / 2 + dx, y = gate.y + gate.h + radius + 3 + offset;
      if (!isBlocked(world, x, y, radius) && !obstacleBlocks(s, x, y, radius)) {
        s.x = x; s.y = y; s.vx = s.vy = s.knockX = s.knockY = 0; return;
      }
    }
  }
}
