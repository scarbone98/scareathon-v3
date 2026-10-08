import { ALL_WORLDS, HUB_WORLD } from "./world.ts";
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
  { id: "woods", locationId: "forest", mapIds: [], levelBand: [6, 10], prerequisites: ["realm-0"], environment: EARTH_ENVIRONMENT, renderer: "shared-2d", available: false },
  { id: "space", mapIds: [], levelBand: [9, 14], prerequisites: ["woods-complete"], environment: lunar, renderer: "space", available: false },
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
  chapter("space", 3, "One Small Step, Four Big Mouths", ["woods-complete"], ["space"], "space-complete"),
  chapter("city", 4, "The Architect's Last Order", ["space-complete"], ["city"], "city-complete"),
  chapter("finale", 5, "Last Stop: Everywhere", ["city-complete"], ["finale"], "campaign-complete"),
];
export function getArea(id: string) { return AREAS.find(area => area.id === id || area.locationId === id); }
export function getMap(id: string) { return ALL_WORLDS.find(map => map.id === id); }
export function canEnter(progress: CampaignProgress, locationId: string): boolean {
  const area = getArea(locationId);
  return !!area && area.prerequisites.every(id => progress.clearedRooms.includes(id) || progress.bosses.includes(id) || progress.campaignMilestones.includes(id) ||
    progress.coop?.worldClearedRooms?.includes(id) || progress.coop?.worldBosses?.includes(id) || progress.coop?.worldCampaignMilestones?.includes(id));
}
export function campaignLocations(progress: CampaignProgress) { return LOCATIONS.map(location => ({ ...location, locked: !canEnter(progress, location.id) })); }
export function resolveCampaignMap(id: string) {
  const map = getMap(id), definition = mapDefinition(id);
  return map && definition ? { map, definition, fallback: false } : { map: HUB_WORLD, definition: mapDefinition("hub")!, fallback: true };
}
export { legacyMapId };
export const WOODS_HANDOFF = "Chapter 2 · Hollow Woods: Alex traced the egg's signal to the forestry radio. The crew is ready; the Woods route is coming next.";

// Numeric rooms remain a legacy adapter, never an identity for new areas.
export function sameCampaignMap(a: { scene: string; room: number; mapId?: string }, b: { scene: string; room: number; mapId?: string }): boolean {
  const id = a.mapId ?? legacyMapId(a.scene, a.room);
  return a.scene === b.scene && !!id && id === (b.mapId ?? legacyMapId(b.scene, b.room));
}
