import { availablePickups } from "../../collectibles.ts";
import type { GameState } from "../../sim.ts";
import type { HiddenRadarTarget } from "./radar.ts";
import { chipTargets } from "./pickups.ts";

interface JobEPickup { id: string; name: string; scene: string; room: number; x: number; y: number }
interface JobERegistry { availablePickups: (state: GameState) => JobEPickup[] }
export function registryRadarTargets(s: GameState, registry?: JobERegistry): HiddenRadarTarget[] {
  if (!registry) return [];
  const pickups = registry.availablePickups(s);
  return pickups.filter(item => item.scene === s.scene && item.room === s.room
    && Number.isFinite(item.x) && Number.isFinite(item.y)).map(item => ({
    id: item.id, name: item.name, scene: s.scene, room: item.room, x: item.x, y: item.y, kind: "hidden",
  }));
}
export function hiddenRadarTargets(s: GameState): HiddenRadarTarget[] {
  return [
    ...chipTargets(s).map(item => ({ ...item, kind: "hidden" as const })),
    ...registryRadarTargets(s, { availablePickups }),
  ];
}
