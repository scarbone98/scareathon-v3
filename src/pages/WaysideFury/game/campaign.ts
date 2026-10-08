import { WOODS_IDS } from "./chapters/ch2Worlds.ts";
import { ALL_WORLDS, HUB_WORLD } from "./world.ts";
import { LAUNCH_WORLD, MOON_WORLDS } from "./chapters/ch3Worlds.ts";
import { LOCATIONS } from "./content.ts";
import { CHAPTER_REWARDS, mapDefinition, legacyMapId } from "../../../../server/shared/waysideFury/campaign.js";
import type { AreaDefinition, ChapterDefinition, CampaignProgress, EnvironmentProfile } from "./campaignTypes.ts";
// Environment metadata is a contract; M0 adds no day/night gameplay clock.
export const EARTH_ENVIRONMENT: EnvironmentProfile = { id: "earth", movement: "earth", suitRequired: false, oxygen: "off", lighting: "earth", clock: "shared-earth" };
const lunar: EnvironmentProfile = { id: "moon", movement: "lunar", suitRequired: true, oxygen: "exploration", lighting: "earthshine", clock: "fixed" };
export const AREAS: readonly AreaDefinition[] = [
  { id: "wayside", locationId: "wayside", mapIds: ["hub"], levelBand: [1, 3], prerequisites: [], environment: EARTH_ENVIRONMENT, renderer: "shared-2d", available: true },
  { id: "blast", locationId: "blast", mapIds: ALL_WORLDS.filter(m => m.id.startsWith("blast-")).map(m => m.id), levelBand: [1, 9], prerequisites: [], environment: EARTH_ENVIRONMENT, renderer: "shared-2d", available: true },
  { id: "eightbit-realm", mapIds: ["realm-0"], levelBand: [6, 9], prerequisites: ["blast-watcher"], environment: EARTH_ENVIRONMENT, renderer: "shared-2d", available: true },
  { id: "woods", locationId: "forest", mapIds: WOODS_IDS, levelBand: [1, 14], prerequisites: ["realm-0"], environment: EARTH_ENVIRONMENT, renderer: "shared-2d", available: true },
  { id: "space", mapIds: [LAUNCH_WORLD.id], levelBand: [1, 14], prerequisites: ["woods-complete"], environment: EARTH_ENVIRONMENT, renderer: "space", available: true },
  { id: "moon", mapIds: MOON_WORLDS.map(m=>m.id), levelBand: [1, 14], prerequisites: ["moon-departed"], environment: lunar, renderer: "space", available: true },
  { id: "city", locationId: "city", mapIds: [], levelBand: [13, 18], prerequisites: ["space-complete"], environment: EARTH_ENVIRONMENT, renderer: "shared-2d", available: false },
  { id: "finale", mapIds: [], levelBand: [17, 22], prerequisites: ["city-complete"], environment: EARTH_ENVIRONMENT, renderer: "shared-2d", available: false },
];
function chapter(id: string, number: number, name: string, prerequisites: string[], areaIds: string[], completionMilestone: string): ChapterDefinition {
  const mapIds = AREAS.filter(area => areaIds.includes(area.id)).flatMap(area => area.mapIds);
  return { id, number, name, prerequisites, areaIds, mapIds, completionMilestone,
    entry: { mapId: number === 1 ? "blast-0" : "hub", x: number === 1 ? 56 : 480, y: number === 1 ? 192 : 416 },
    storyBeatIds: number === 2 ? ["woods-invitation"] : [],
    rewardIds: CHAPTER_REWARDS.filter(reward => mapIds.includes(reward.id) || areaIds.includes(reward.id)).map(reward => reward.id),
  };
}
export const CHAPTERS: readonly ChapterDefinition[] = [
  chapter("blast", 1, "The Blast Site", [], ["wayside", "blast", "eightbit-realm"], "realm-0"),
  chapter("woods", 2, "The Woods Have Receipts", ["realm-0"], ["woods"], "woods-complete"),
  chapter("space", 3, "One Small Step, Four Big Mouths", ["woods-complete"], ["space", "moon"], "space-complete"),
  chapter("city", 4, "The Architect's Last Order", ["space-complete"], ["city"], "city-complete"),
  chapter("finale", 5, "Last Stop: Everywhere", ["city-complete"], ["finale"], "campaign-complete"),
];
export function getArea(id: string) { return AREAS.find(area => area.id === id || area.locationId === id); }
export function getMap(id: string) { return ALL_WORLDS.find(map => map.id === id); }
export function canEnter(progress: CampaignProgress, locationId: string): boolean {
  const area = getArea(locationId);
  return !!area && area.prerequisites.every(id => progress.clearedRooms.includes(id) || progress.bosses.includes(id) || progress.campaignMilestones.includes(id) || (id === "woods-complete" && progress.campaignMilestones.includes("space-dev-entry")) || (id === "blast-watcher" && (progress.campaignMilestones.includes("space-dev-entry") || progress.clearedRooms.includes("realm-0") || progress.coop?.worldClearedRooms?.includes("realm-0"))) ||
    progress.coop?.worldClearedRooms?.includes(id) || progress.coop?.worldBosses?.includes(id) || progress.coop?.worldCampaignMilestones?.includes(id));
}
export function campaignLocations(progress: CampaignProgress) { return LOCATIONS.map(location => ({ ...location, locked: !canEnter(progress, location.id) })); }
export function resolveCampaignMap(id: string) {
  const map = getMap(id), definition = mapDefinition(id);
  return map && definition ? { map, definition, fallback: false } : { map: HUB_WORLD, definition: mapDefinition("hub")!, fallback: true };
}
export { legacyMapId };
export const WOODS_HANDOFF = "Chapter 2 · Hollow Woods: Alex traced the egg's signal to the forestry radio. Drive north to Hollow Woods. Rescue the maintenance ghost at the Ranger Lay-by.";

// Numeric rooms remain a legacy adapter, never an identity for new areas.
export function sameCampaignMap(a: { scene: string; room: number; mapId?: string }, b: { scene: string; room: number; mapId?: string }): boolean {
  const id = a.mapId ?? legacyMapId(a.scene, a.room);
  return a.scene === b.scene && !!id && id === (b.mapId ?? legacyMapId(b.scene, b.room));
}

export function campaignHandoff(progress:CampaignProgress) {
  return canEnter(progress,"space") ? "Chapter 3 · Launch key and Moon coordinates recovered. Drive east to the fenced Wayside Aerospace compound." : WOODS_HANDOFF;
}
