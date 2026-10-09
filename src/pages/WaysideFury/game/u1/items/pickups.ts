import { sameCampaignMap } from "../../campaign.ts";
import { fieldWorld } from "../../fieldAbilities.ts";
import type { GameState, Scene } from "../../sim.ts";
import { isBlocked } from "../../world.ts";
import { CHIP_REGISTRY, grantChip, itemsState, type ChipId } from "./chips.ts";
import { gateAvailable, gatedItemTarget } from "./gating.ts";

export interface ChipPickup {
  id: string; chip: ChipId; name: string; kind: "chip";
  scene: Scene; room: number; x: number; y: number; gateId?: string;
}
// Chip caches extend the personal inventory; hidden lore and snacks remain in
// JOB E's registry and Collection page. No new found-item save or ticket count.
export const CHIP_FINDS: readonly ChipPickup[] = [
  ["scanner", "hub", 0, 560, 208],
  ["sprinter", "hub", 0, 640, 352],
  ["ki-coil", "dungeon", 0, 176, 112],
  ["combo-extender", "dungeon", 2, 416, 304],
  ["quickstep", "dungeon", 3, 592, 432],
  ["second-wind", "dungeon", 8, 368, 272],
  ["vital-spark", "dungeon", 9, 416, 304],
  ["lucky-star", "realm", 0, 144, 288],
].map(([chip, scene, room, x, y]) => ({
  id: `chip-find-${chip}`, chip: chip as ChipId, name: CHIP_REGISTRY[chip as ChipId].name,
  kind: "chip", scene: scene as Scene, room: room as number, x: x as number, y: y as number,
}));

export function chipTargets(s: GameState): ChipPickup[] {
  const owned = itemsState(s).chips.owned;
  return CHIP_FINDS.filter(p => sameCampaignMap(s, p) && !owned.includes(p.chip))
    .map(target => gatedItemTarget(s, target));
}
export function itemWithinReach(s: GameState, target: { x: number; y: number; gateId?: string }, radius = 24): boolean {
  if (!gateAvailable(s, target.gateId) || s.heroes[s.active].hp <= 0 || s.coop?.downed || s.overlay || Math.hypot(target.x - s.x, target.y - s.y) > radius) return false;
  const world = fieldWorld(s);
  const steps = Math.max(1, Math.ceil(Math.hypot(target.x - s.x, target.y - s.y) / 2));
  for (let n = 0; n <= steps; n++) {
    if (isBlocked(world, s.x + (target.x - s.x) * n / steps, s.y + (target.y - s.y) * n / steps, 1)) return false;
  }
  return true;
}
export function collectChip(s: GameState, id: string): boolean {
  const target = chipTargets(s).find(p => p.id === id);
  return !!target && itemWithinReach(s, target) && grantChip(s, target.chip, "secret cache");
}
export function grantCheckpointChip(s: GameState, id: string): boolean {
  const chip = ({ "blast-gatekeeper": "iron-guard", "blast-watcher": "focus-lens",
    "blast-4": "iron-guard", "blast-7": "focus-lens",
    "loot-blast-8": "candy-magnet", "loot-blast-9": "ki-saver" } as Record<string, ChipId>)[id];
  return chip ? grantChip(s, chip, "guardian or supply cache") : false;
}
