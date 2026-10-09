import { isBlocked, OVERWORLD, TILE, type WorldMap, type WorldSpawn } from "../../world.ts";

/** The clock belongs to the host world. Player saves only keep their last clock. */
export const DAY_NIGHT_CYCLE_SECONDS = 8 * 60;
export const NIGHT_START_SECONDS = 240;
export const NIGHT_END_SECONDS = 420;
export const NIGHT_ENCOUNTER_INTERVAL_SECONDS = 36;
export const MAX_NIGHT_MONSTERS = 6;

export type DayNightPhase = "day" | "dusk" | "night" | "dawn";
export interface DayNightSample {
  seconds: number;
  phase: DayNightPhase;
  nightFactor: number;
  twilightFactor: number;
  /** Shared ambient intensity, suitable for Three.js or a music mix. */
  ambient: number;
  warmTint: number;
  isNight: boolean;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => { const t = clamp01(value); return t * t * (3 - 2 * t); };

/** Old saves and malformed clocks start in daylight. Valid clocks wrap at 8 min. */
export function sanitizeDayNightSeconds(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return 0;
  return raw % DAY_NIGHT_CYCLE_SECONDS;
}

/** Uses elapsed real seconds; resuming a tab advances once, never replays ticks. */
export function advanceDayNightSeconds(seconds: number, elapsedSeconds: number): number {
  const current = sanitizeDayNightSeconds(seconds);
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return current;
  return (current + elapsedSeconds % DAY_NIGHT_CYCLE_SECONDS) % DAY_NIGHT_CYCLE_SECONDS;
}

export function sampleDayNight(rawSeconds: number): DayNightSample {
  const seconds = sanitizeDayNightSeconds(rawSeconds);
  const phase: DayNightPhase = seconds < 180 ? "day" : seconds < NIGHT_START_SECONDS ? "dusk"
    : seconds < NIGHT_END_SECONDS ? "night" : "dawn";
  const nightFactor = phase === "day" ? 0 : phase === "dusk" ? smoothstep((seconds - 180) / 60)
    : phase === "night" ? 1 : 1 - smoothstep((seconds - NIGHT_END_SECONDS) / 60);
  const twilightFactor = 4 * nightFactor * (1 - nightFactor);
  return { seconds, phase, nightFactor, twilightFactor, ambient: 1 - nightFactor * .5,
    warmTint: twilightFactor * (phase === "dawn" ? .65 : 1), isNight: phase === "night" };
}

/** Stable, bounded window ID; callers clear their previous ID in daylight. */
export function nightEncounterWindow(seconds: number): string | null {
  const sample = sampleDayNight(seconds);
  return sample.isNight ? `night:${Math.floor((sample.seconds - NIGHT_START_SECONDS) / NIGHT_ENCOUNTER_INTERVAL_SECONDS)}` : null;
}

export interface NightEncounterOptions {
  authority?: "solo" | "host" | "guest";
  focus?: { x: number; y: number };
  /** Keep new ambient creatures away from cars, existing creatures and peers. */
  occupied?: ReadonlyArray<{ x: number; y: number; radius?: number }>;
}

// Grass shoulders, separated from road traffic and all location entrances.
const NIGHT_ANCHORS = [
  { x: 512, y: 410 }, { x: 768, y: 560 }, { x: 912, y: 408 },
  { x: 720, y: 300 }, { x: 1168, y: 448 },
] as const;

/** Find a safe shoulder point without consuming combat RNG or changing collision. */
function safeNightPoint(world: WorldMap, anchor: { x: number; y: number }, occupied: NightEncounterOptions["occupied"]) {
  const offsets = [0, 16, -16, 32, -32, 48, -48];
  for (const dy of offsets) for (const dx of offsets) {
    const x = anchor.x + dx, y = anchor.y + dy;
    if (x < 48 || x > world.width - 48 || y < 48 || y > world.height - 48) continue;
    const tile = world.tiles[Math.floor(y / TILE) * world.cols + Math.floor(x / TILE)];
    if (tile !== "grass" || isBlocked(world, x, y, 12)) continue;
    if (world.radarAnchors?.some(door => Math.hypot(door.x - x, door.y - y) < 56)) continue;
    if (occupied?.some(body => Math.hypot(x - body.x, y - body.y) < 24 + (body.radius ?? 7))) continue;
    return { x, y };
  }
  return null;
}

/**
 * Only the current night's batch is planned. The host may emit it once per
 * window up to MAX_NIGHT_MONSTERS; it must not loop over missed windows.
 * These definitions are ambient, not a reward-bearing combat spawn source.
 */
export function getNightEncounterSpawns(seconds: number, world: WorldMap = OVERWORLD,
  options: NightEncounterOptions = {}): WorldSpawn[] {
  if (options.authority === "guest" || world.id !== "overworld") return [];
  const window = nightEncounterWindow(seconds);
  if (window === null) return [];
  const index = Math.floor((sanitizeDayNightSeconds(seconds) - NIGHT_START_SECONDS) / NIGHT_ENCOUNTER_INTERVAL_SECONDS);
  const result: WorldSpawn[] = [];
  const occupied = [...(options.occupied ?? [])];
  for (let n = 0; n < 2; n++) {
    const focus = options.focus;
    const local = focus && !NIGHT_ANCHORS.some(anchor => Math.hypot(anchor.x - focus.x, anchor.y - focus.y) < 320);
    const angle = (index + n * 3) * 2.399963;
    const anchor = local ? { x: focus.x + Math.cos(angle) * 144, y: focus.y + Math.sin(angle) * 144 }
      : NIGHT_ANCHORS[(index + n * 2) % NIGHT_ANCHORS.length];
    const point = safeNightPoint(world, anchor, occupied);
    if (!point) continue;
    const sprite = (index + n) % 2 === 0 ? "ghost" : "pumpkin";
    result.push({ kind: "grunt", sprite, ...point });
    occupied.push({ ...point, radius: 12 });
  }
  return result;
}

/** Convenience adapter ensures duplicates and long frame gaps cannot spawn bursts. */
export function planNightEncounter(seconds: number, previousWindow: string | null,
  world: WorldMap = OVERWORLD, options: NightEncounterOptions = {}) {
  const window = nightEncounterWindow(seconds);
  return { window, spawns: window !== null && window !== previousWindow
    ? getNightEncounterSpawns(seconds, world, options) : [] };
}
