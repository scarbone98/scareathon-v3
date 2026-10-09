import { sameCampaignMap } from "../../campaign.ts";
import { fieldWorld } from "../../fieldAbilities.ts";
import type { GameState, Scene } from "../../sim.ts";
import { isBlocked } from "../../world.ts";
import { itemsState } from "./chips.ts";
import { gatedItemTarget } from "./gating.ts";
import { itemWithinReach } from "./pickups.ts";

export type RelicId = "station-crest" | "blast-ember" | "realm-prism" | "forest-sigil" | "city-medallion" | "frost-bell" | "final-star";
export interface RelicDefinition {
  id: RelicId; name: string; area: string; chapter: number; locked: boolean;
  scene?: Scene; room?: number; mapId?: string; requires?: string; anchors: readonly { x: number; y: number }[];
}
// Slots belong to chapters, rather than seven rooms in the first dungeon. Later
// chapters supply their own scene and reachable scatter anchors in this registry.
export const RELICS: readonly RelicDefinition[] = [
  { id: "station-crest", name: "Station Crest", area: "wayside", chapter: 1, locked: false, scene: "hub",
    anchors: [{ x: 288, y: 224 }, { x: 632, y: 368 }, { x: 688, y: 320 }] },
  { id: "blast-ember", name: "Blast Ember", area: "blast", chapter: 1, locked: false, scene: "dungeon", room: 8,
    anchors: [{ x: 440, y: 192 }, { x: 400, y: 112 }, { x: 552, y: 280 }] },
  { id: "realm-prism", name: "Realm Prism", area: "eightbit-realm", chapter: 2, locked: false, scene: "realm", room: 0,
    anchors: [{ x: 480, y: 288 }, { x: 176, y: 288 }, { x: 384, y: 80 }] },
  { id: "forest-sigil", name: "Forest Sigil", area: "woods", chapter: 2, locked: false, scene: "dungeon", room: 7, mapId: "woods-lunch-shed", anchors: [{ x: 400, y: 224 }, { x: 544, y: 280 }, { x: 176, y: 224 }] },
  { id: "city-medallion", name: "City Medallion", area: "city", chapter: 4, locked: false, scene: "dungeon", room: 11, mapId: "city-gallery", anchors: [{ x: 480, y: 320 }, { x: 208, y: 320 }, { x: 560, y: 208 }] },
  { id: "frost-bell", name: "Frost Bell", area: "moon", chapter: 3, locked: false, scene: "dungeon", room: 8, mapId: "moon-m09", anchors: [{ x: 352, y: 160 }, { x: 176, y: 160 }, { x: 400, y: 224 }] },
  { id: "final-star", name: "Final Star", area: "finale", chapter: 5, locked: false, scene: "hub", room: 0, requires: "city-complete", anchors: [{ x: 688, y: 416 }, { x: 336, y: 256 }, { x: 624, y: 432 }] },
];
export const RELIC_REGISTRY = RELICS;
export const RELIC_SUMMON = { x: 480, y: 208, radius: 28 } as const;
export interface RelicTarget {
  id: RelicId; name: string; area: string; scene: Scene; room?: number;
  x: number; y: number; mapId?: string; kind: "relic"; gateId?: string;
}

export function relicTargets(s: GameState): RelicTarget[] {
  const { collected, cycle } = itemsState(s).relics;
  return RELICS.flatMap(relic => {
    if (relic.locked || !relic.scene || !relic.anchors.length || collected.includes(relic.id)
      || !sameCampaignMap(s, { scene: relic.scene, room: relic.room ?? 0, mapId: relic.mapId })
      || relic.requires && !s.campaignMilestones.includes(relic.requires) && !s.coop?.worldCampaignMilestones?.includes(relic.requires)) return [];
    const target: RelicTarget = gatedItemTarget(s, { id: relic.id, name: relic.name, area: relic.area, scene: relic.scene,
      ...(relic.mapId ? { mapId: relic.mapId } : {}), ...(relic.room === undefined ? {} : { room: relic.room }), ...relic.anchors[cycle % relic.anchors.length], kind: "relic" as const }, cycle);
    // Keep new prop dressing honest: a collision introduced by a later merge
    // must never put a pickup inside a solid object.
    if (isBlocked(fieldWorld(s), target.x, target.y, 7)) return [];
    return [target];
  });
}

export function collectRelic(s: GameState, id: string): boolean {
  const target = relicTargets(s).find(relic => relic.id === id);
  if (!target || !itemWithinReach(s, target)) return false;
  itemsState(s).relics.collected.push(target.id);
  s.notice = `${target.name} found! ${itemsState(s).relics.collected.length}/7 Wayside Relics.`;
  s.events.push({ type: "item", id: target.id, kind: "relic" });
  return true;
}

export function hasAllRelics(s: GameState): boolean {
  const collected = itemsState(s).relics.collected;
  return RELICS.every(relic => collected.includes(relic.id));
}

export function readyToSummon(s: GameState): boolean {
  return s.scene === "hub" && s.mapId === "hub" && s.heroes[s.active].hp > 0 && !s.coop?.downed && (!s.overlay || s.overlay === "wish")
    && Math.hypot(s.x - RELIC_SUMMON.x, s.y - RELIC_SUMMON.y) <= RELIC_SUMMON.radius && hasAllRelics(s);
}

export const OUTFITS = [
  { id: "midnight-cab", name: "Midnight Cab", color: "#9e8cff", glow: "#e6d7ff" },
  { id: "starlight-crew", name: "Starlight Crew", color: "#74dcff", glow: "#e7faff" },
  { id: "orchard-gold", name: "Orchard Gold", color: "#ffd26f", glow: "#fff5ce" },
] as const;
export type WishId = "outfit-midnight-cab" | "outfit-starlight-crew" | "outfit-orchard-gold" | "wish-power" | "wish-ward" | "wish-secret-boss";
export interface WishOption {
  id: WishId; name: string; description: string; kind: "outfit" | "stat" | "boss";
  outfit?: string; stat?: "power" | "ward"; amount?: number;
}
const outfitWish = (outfit: typeof OUTFITS[number]): WishOption => ({
  id: `outfit-${outfit.id}`, name: `${outfit.name} outfit`, kind: "outfit", outfit: outfit.id,
  description: "A rare crew outfit with a luminous cosmetic aura.",
});
const powerWish: WishOption = { id: "wish-power", name: "Lasting strength", description: "Permanently gain +2 Power for every hero.", kind: "stat", stat: "power", amount: 2 };
const wardWish: WishOption = { id: "wish-ward", name: "Lasting protection", description: "Permanently gain +1 Ward for every hero.", kind: "stat", stat: "ward", amount: 1 };
const secretBossWish: WishOption = { id: "wish-secret-boss", name: "A hidden challenger", description: "Open the secret encounter at the Old Supply Depot.", kind: "boss" };
export const WISH_OPTIONS: readonly WishOption[] = [...OUTFITS.map(outfitWish), powerWish, wardWish, secretBossWish];

export function availableWishes(s: GameState): WishOption[] {
  const relics = itemsState(s).relics;
  const rotated = OUTFITS.map((_, n) => OUTFITS[(relics.cycle + n) % OUTFITS.length]);
  const unowned = rotated.filter(outfit => !relics.outfits.includes(outfit.id));
  const choices: WishOption[] = [];
  if (unowned[0]) choices.push(outfitWish(unowned[0]));
  choices.push(relics.cycle % 2 === 0 ? powerWish : wardWish);
  if (!relics.secretBossUnlocked && !s.bosses.includes("relic-echo")) choices.push(secretBossWish);
  else if (unowned[1]) choices.push(outfitWish(unowned[1]));
  else choices.push(relics.cycle % 2 === 0 ? wardWish : powerWish);
  return choices;
}

export function chooseWish(s: GameState, id: string): boolean {
  if (!readyToSummon(s)) return false;
  const choice = availableWishes(s).find(wish => wish.id === id);
  if (!choice) return false;
  const relics = itemsState(s).relics;
  if (choice.kind === "outfit" && choice.outfit) relics.outfits.push(choice.outfit);
  else if (choice.kind === "stat" && choice.stat && choice.amount) {
    const amount = Math.min(choice.amount, 10_000 - relics.statBonus[choice.stat]);
    if (amount <= 0) return false;
    relics.statBonus[choice.stat] += amount;
    const field = choice.stat === "power" ? "power" : "defense";
    for (const hero of Object.values(s.heroes)) hero[field] = Math.min(10_000, hero[field] + amount);
  } else if (choice.kind === "boss") relics.secretBossUnlocked = true;
  // These mutations are synchronous: another click/frame observes an empty
  // set, so one summon can never grant two wishes or scatter twice.
  relics.wishes = [...relics.wishes, choice.id].slice(-128);
  relics.collected = [];
  relics.cycle++;
  s.notice = `${choice.name} granted. The seven relics have scattered again!`;
  s.events.push({ type: "item", id: choice.id, kind: "wish" });
  return true;
}
