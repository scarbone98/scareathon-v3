import type { HeroState } from "../../../src/pages/WaysideFury/game/sim";
import type { ItemsSaveState } from "./u1Items.js";
export type HeroId = "you" | "joe" | "matt" | "alex" | "jon";
export interface CharacterProgress { level: number; xp: number }
export interface ProgressReceipt { areas: string[]; bosses: string[]; rooms: string[]; level: number; foundItems?: string[] }
export interface Gear { power: number; ward: number }
export interface SaveSettings {
  musicVolume: number; sfxVolume: number;
  controls: { tutorialDismissed: boolean; stickSensitivity: number };
}
export interface HomeSnapshot {
  heroes: Record<HeroId, HeroState>; active: HeroId; party: HeroId[];
  candy: number; chapter: number; gear: Gear; character: CharacterProgress;
}
export interface SaveData {
  version: 3; chapter: number; heroes: Record<HeroId, HeroState>; active: HeroId; party: HeroId[];
  candy: number; unlockedHeroes: HeroId[]; areas: string[]; bosses: string[]; clearedRooms: string[];
  kills: number; deaths: number; lastReported: ProgressReceipt; home: HomeSnapshot | null;
  coopRewards?: string[];
  foundItems: string[]; ambientTaxiWrecked: boolean;
  u1?: { items: ItemsSaveState; [key: string]: unknown };
  gear: Gear; character: CharacterProgress; settings: SaveSettings; savedAt: number;
}
export const SAVE_VERSION: 3;
export const MAX_SAVE_BYTES: number;
export const MAX_MILESTONES: number;
export const MAX_COOP_REWARDS: number;
export const MAX_LEVEL: number;
export const HERO_IDS: readonly ["you", "joe", "matt", "alex", "jon"];
export const HERO_STATS: Record<HeroId, { power: number; defense: number }>;
export function heroStats(id: HeroId, character: CharacterProgress, gear?: Gear): Pick<HeroState, "maxHp" | "maxKi" | "maxStamina" | "power" | "defense">;
export function sanitizeSave(raw: unknown): { save: SaveData; error?: undefined } | { error: string; save?: undefined };
export function migrateSave(raw: unknown): SaveData | null;
export function mergeReceipts(...receipts: (ProgressReceipt | null | undefined)[]): ProgressReceipt;
export function inferGear(heroes: Partial<Record<HeroId, HeroState>>): Gear;
export function progressScore(save: SaveData): number;
