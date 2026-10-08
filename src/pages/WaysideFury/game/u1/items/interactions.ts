import type { GameState } from "../../sim.ts";
import { chipTargets, collectChip, itemWithinReach } from "./pickups.ts";
import { relicTargets, collectRelic, readyToSummon, RELIC_SUMMON } from "./relics.ts";

export interface ItemInteractionCandidate {
  id: string; name: string; kind: "use"; x: number; y: number; distance: number; radius: number;
}
/** Add these local candidates to JOB E's once-per-frame context selection. */
export function itemInteractionCandidates(s: GameState): ItemInteractionCandidate[] {
  if (s.overlay || s.heroes[s.active].hp <= 0 || s.coop?.downed) return [];
  const targets = [...chipTargets(s), ...relicTargets(s)]
    .filter(target => itemWithinReach(s, target)).map(target => ({
      id: target.id, name: `Collect ${target.name}`, kind: "use" as const,
      x: target.x, y: target.y, distance: Math.hypot(target.x - s.x, target.y - s.y), radius: 24,
    }));
  if (readyToSummon(s)) targets.push({ id: "relic-summon", name: "Summon Wayside wish", kind: "use",
    ...RELIC_SUMMON, distance: Math.hypot(s.x - RELIC_SUMMON.x, s.y - RELIC_SUMMON.y) });
  return targets.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
}
/** Run before guest world-interaction rejection; it never changes shared spawns. */
export function interactItem(s: GameState, id: string): boolean {
  if (id === "relic-summon" && readyToSummon(s)) {
    s.overlay = "wish"; s.vx = s.vy = 0; s.moving = false; return true;
  }
  return collectChip(s, id) || collectRelic(s, id);
}
