import type { GameState, Scene } from "../../sim.ts";
import { TILE, getWorld, isBlocked } from "../../world.ts";
import { itemWithinReach } from "./pickups.ts";
import { itemsState } from "./chips.ts";
import { relicTargets } from "./relics.ts";

/** JOB E can supply its per-player registry here without sharing an inventory. */
export interface HiddenRadarTarget {
  id: string; name?: string; scene: Scene; room?: number; area?: string;
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
  if (s.scene === "hub") return "wayside";
  if (s.scene === "dungeon") return "blast";
  if (s.scene === "realm") return "eightbit-realm";
  if (s.scene === "overworld") return "overworld";
  return null;
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
  const collected = itemsState(s).relics.collected;
  const targets: HiddenRadarTarget[] = [...relicTargets(s), ...hiddenTargets];
  return targets.filter(target =>
    target.scene === s.scene && (target.room ?? 0) === s.room
    && (!target.area || canonicalArea(target.area) === area)
    && !target.found && !target.collected && Number.isFinite(target.x) && Number.isFinite(target.y)
    && !(target.kind === "relic" && collected.includes(target.id))
  ).map(target => ({ ...target, name: target.name ?? "Hidden find", kind: target.kind ?? "hidden" }));
}
export function radarReading(s: GameState, hiddenTargets: readonly HiddenRadarTarget[] = []): RadarReading | null {
  const radar = itemsState(s).radar;
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
  return s.scene === RADAR_PICKUP.scene && s.room === RADAR_PICKUP.room && !itemsState(s).radar.owned
    && !isBlocked(getWorld(s.scene, s.room), RADAR_PICKUP.x, RADAR_PICKUP.y, 7) ? RADAR_PICKUP : null;
}
export function collectRadar(s: GameState): boolean {
  const target = radarPickupTarget(s);
  if (!target || !itemWithinReach(s, target)) return false;
  const radar = itemsState(s).radar;
  radar.owned = true; radar.enabled = true;
  s.notice = "Relic Radar found! Toggle its compass to track nearby relics and hidden finds.";
  s.events.push({ type: "item", id: RADAR_PICKUP.id, kind: "radar" });
  return true;
}
export function toggleRadar(s: GameState): boolean {
  const radar = itemsState(s).radar;
  if (!radar.owned) return false;
  radar.enabled = !radar.enabled;
  s.notice = `Relic Radar ${radar.enabled ? "on" : "off"}.`;
  return true;
}
