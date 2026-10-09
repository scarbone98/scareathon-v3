import type { GameState, Scene } from "../../game/sim.ts";
import { TILE, getWorld, isBlocked } from "../../game/world.ts";
import { availablePickups } from "../../game/collectibles.ts";
import { mapDefinition } from "../../../../../server/shared/waysideFury/campaign.js";

const radarState = (s: GameState) => s.relicRadar ??= { owned: false, enabled: false };
const itemWithinReach = (s: GameState, target: { x: number; y: number }) => Math.hypot(s.x - target.x, s.y - target.y) < 28;
type TargetProvider = (s: GameState) => readonly HiddenRadarTarget[];
let relicProvider: TargetProvider = () => [];
/** ITEMS installs its per-player, unfound relic registry after integration. */
export function registerRelicRadarTargets(provider: TargetProvider): () => void {
  relicProvider = provider;
  return () => { if (relicProvider === provider) relicProvider = () => []; };
}

/** JOB E can supply its per-player registry here without sharing an inventory. */
export interface HiddenRadarTarget {
  mapId?: string; id: string; name?: string; scene: Scene; room?: number; area?: string;
  x: number; y: number; kind?: "hidden" | "relic"; found?: boolean; collected?: boolean;
}
export interface RadarTarget extends HiddenRadarTarget { name: string; kind: "hidden" | "relic" }
export interface RadarReading {
  id: string; name: string; kind: "hidden" | "relic";
  /** World distance, with a tile-scale companion for the HUD. */
  distance: number; distanceTiles: number;
  /** Degrees clockwise from north, suitable for rotating a north-pointing needle. */
  bearing: number; direction: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
}
export const RADAR_PICKUP = Object.freeze({
  id: "u1-relic-radar", name: "Relic Radar", scene: "hub" as const, room: 0,
  area: "wayside", x: 448, y: 384, kind: "radar" as const,
});
const DIRECTIONS: readonly RadarReading["direction"][] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function currentRadarArea(s: GameState): string | null {
  return mapDefinition(s.mapId)?.areaId ?? null;
}
function canonicalArea(area: string): string {
  if (area === "hub") return "wayside";
  if (area === "dungeon" || /^blast-\d+$/.test(area)) return "blast";
  if (area === "realm" || area === "realm-0") return "eightbit-realm";
  return area;
}
export function radarTargets(s: GameState, hiddenTargets: readonly HiddenRadarTarget[] = []): RadarTarget[] {
  const area = currentRadarArea(s);
  if (!area) return [];
  const collected = s.foundItems;
  const targets: HiddenRadarTarget[] = [...relicProvider(s), ...availablePickups(s).map(item => ({ ...item, kind: "hidden" as const, mapId: s.mapId })), ...hiddenTargets];
  return targets.filter(target =>
    (!target.mapId || target.mapId === s.mapId) && target.scene === s.scene && (target.room ?? 0) === s.room
    && (!target.area || canonicalArea(target.area) === area)
    && !target.found && !target.collected && Number.isFinite(target.x) && Number.isFinite(target.y)
    && !(target.kind === "relic" && collected.includes(target.id))
  ).map(target => ({ ...target, name: target.name ?? "Hidden find", kind: target.kind ?? "hidden" }));
}
export function radarReading(s: GameState, hiddenTargets: readonly HiddenRadarTarget[] = []): RadarReading | null {
  const radar = radarState(s);
  if (!radar.owned || !radar.enabled) return null;
  const targets = radarTargets(s, hiddenTargets).map(target => ({ target, distance: Math.hypot(target.x - s.x, target.y - s.y) }));
  targets.sort((a, b) => {
    const difference = a.distance - b.distance;
    if (difference) return difference;
    const aKey = `${a.target.kind}:${a.target.id}`, bKey = `${b.target.kind}:${b.target.id}`;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });
  const nearest = targets[0];
  if (!nearest) return null;
  const { target, distance } = nearest;
  const bearing = distance === 0 ? 0 : (Math.atan2(target.x - s.x, s.y - target.y) * 180 / Math.PI + 360) % 360;
  return { id: target.id, name: target.name, kind: target.kind, distance, distanceTiles: distance / TILE,
    bearing, direction: DIRECTIONS[Math.round(bearing / 45) % 8] };
}
export function radarPickupTarget(s: GameState): typeof RADAR_PICKUP | null {
  return s.mapId === "hub" && s.scene === RADAR_PICKUP.scene && s.room === RADAR_PICKUP.room && !radarState(s).owned
    && !isBlocked(getWorld(s.scene, s.room), RADAR_PICKUP.x, RADAR_PICKUP.y, 7) ? RADAR_PICKUP : null;
}
export function collectRadar(s: GameState): boolean {
  const target = radarPickupTarget(s);
  if (!target || !itemWithinReach(s, target)) return false;
  const radar = radarState(s);
  radar.owned = true; radar.enabled = true;
  s.notice = "Relic Radar found! Toggle relic mode on the minimap to track nearby relics and hidden finds.";
  s.events.push({ type: "quest-save", id: RADAR_PICKUP.id, kind: "claimed" });
  return true;
}
export function toggleRadar(s: GameState): boolean {
  const radar = radarState(s);
  if (!radar.owned) return false;
  radar.enabled = !radar.enabled;
  s.notice = `Relic Radar ${radar.enabled ? "on" : "off"}.`;
  return true;
}


/** TODO(MINIMAP): register this layer in the minimap's relic-radar mode selector.
 * Coordinates stay in world space; the minimap owns camera transforms and DPR.
 * No independent HUD widget is created, including when ?gfx=3d uses 2D fallback.
 */
export const relicRadarLayer = {
  id: "relic-radar" as const,
  available: (s: GameState) => radarState(s).owned,
  enabled: (s: GameState) => radarState(s).owned && radarState(s).enabled,
  toggle: toggleRadar,
  reading: radarReading,
  targets: radarTargets,
  draw(c: CanvasRenderingContext2D, s: GameState, targets: readonly HiddenRadarTarget[] = []) {
    if (!this.enabled(s)) return;
    const reading = radarReading(s, targets);
    const nearest = radarTargets(s, targets).find(target => target.id === reading?.id);
    if (!nearest) return;
    c.save(); c.strokeStyle = "#e8cd83"; c.fillStyle = "#e8cd83"; c.lineWidth = 1;
    c.beginPath(); c.arc(nearest.x, nearest.y, 6, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(nearest.x, nearest.y, 2, 0, Math.PI * 2); c.fill();
    c.setLineDash([4, 4]); c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(nearest.x, nearest.y); c.stroke();
    c.restore();
  },
};
