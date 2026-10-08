import type { GameState } from "../../sim.ts";

export interface GatedItemPoint { id: string; x: number; y: number; gateId?: string }
export const ITEM_GATES = [
  { id: "chip-find-ki-coil", gateId: "world-joe-road", x: 164, y: 96 },
  { id: "chip-find-combo-extender", gateId: "world-alex-yard", x: 292, y: 88 },
  { id: "station-crest", gateId: "world-matt-station", x: 324, y: 104, scatterIndex: 0, scatterPeriod: 3 },
] as const;

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

// The optional adapter is inert before U3 is merged. Once its namespace is
// present, an absent/empty clear list means closed gates. A co-op snapshot takes
// precedence over a personal clear, so guests cannot open host-world pockets.
function clearedWorldGates(s: GameState): string[] | null {
  const authoritative = record(s.coop)?.worldObstacles;
  if (authoritative !== undefined && authoritative !== null)
    return Array.isArray(authoritative) ? authoritative.filter((id): id is string => typeof id === "string") : [];
  const world = record(s.u1?.world);
  if (!world) return null;
  return Array.isArray(world.clearedObstacles)
    ? world.clearedObstacles.filter((id): id is string => typeof id === "string") : [];
}

export function gateAvailable(s: GameState, gateId?: string): boolean {
  const cleared = clearedWorldGates(s);
  return !gateId || cleared === null || cleared.includes(gateId);
}

export function gatedItemTarget<T extends GatedItemPoint>(s: GameState, target: T, cycle = 0): T {
  if (clearedWorldGates(s) === null) return target;
  const gate = ITEM_GATES.find(candidate => candidate.id === target.id);
  if (!gate || ("scatterIndex" in gate && cycle % gate.scatterPeriod !== gate.scatterIndex)) return target;
  return { ...target, x: gate.x, y: gate.y, gateId: gate.gateId };
}
