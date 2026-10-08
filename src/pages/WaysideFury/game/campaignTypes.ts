import type { HeroId } from "./sim.ts";
import type { WorldMap } from "./worldBuilder.ts";
export interface CampaignProgress {
  clearedRooms: readonly string[]; bosses: readonly string[]; campaignMilestones: readonly string[];
  coop?: { worldClearedRooms?: readonly string[]; worldBosses?: readonly string[]; worldCampaignMilestones?: readonly string[] };
}
export interface EnvironmentProfile {
  id: string; movement: "earth" | "lunar"; suitRequired: boolean;
  oxygen: "off" | "exploration" | "safe"; lighting: string;
  clock: "shared-earth" | "fixed" | "story";
}
export interface CampaignAnchor { mapId: string; x: number; y: number }
export interface ChapterDefinition {
  id: string; number: number; name: string; prerequisites: readonly string[];
  entry: CampaignAnchor; areaIds: readonly string[]; mapIds: readonly string[];
  storyBeatIds: readonly string[]; rewardIds: readonly string[]; completionMilestone: string;
}
export interface AreaDefinition {
  id: string; locationId?: string; mapIds: readonly string[]; levelBand: readonly [number, number];
  prerequisites: readonly string[]; environment: EnvironmentProfile;
  renderer: "shared-2d" | "space"; available: boolean;
}
// Contracts only: the fixed-step director and render samplers arrive with films.
export interface CinematicDefinition {
  id: string; shots: readonly {
    id: string; duration: number;
    camera: { portrait: { x: number; y: number; zoom: number }; landscape: { x: number; y: number; zoom: number } };
    cast: readonly { heroId: HeroId; pose: string; x: number; y: number }[];
    captionIds: readonly string[]; cueIds: readonly string[];
  }[]; resumeAnchor: CampaignAnchor; completionMilestone: string;
}
export interface CampaignMapBundle { world: WorldMap; areaId: string; rewardIds?: readonly string[] }
