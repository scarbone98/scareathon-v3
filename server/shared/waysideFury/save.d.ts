import type { HeroId, HeroState } from "../../../src/pages/WaysideFury/game/sim";
export interface ProgressReceipt { areas: string[]; bosses: string[]; rooms: string[]; level: number }
export interface Gear { power: number; ward: number }
export interface SaveSettings {
  musicVolume: number; sfxVolume: number;
  controls: { tutorialDismissed: boolean; stickSensitivity: number };
}
export interface HomeSnapshot {
  heroes: Record<HeroId, HeroState>; active: HeroId; party: HeroId[];
  candy: number; chapter: number; gear: Gear;
}
export interface SaveData {
  version: 2; chapter: number; heroes: Record<HeroId, HeroState>; active: HeroId; party: HeroId[];
  candy: number; unlockedHeroes: HeroId[]; areas: string[]; bosses: string[]; clearedRooms: string[];
  kills: number; deaths: number; lastReported: ProgressReceipt; home: HomeSnapshot | null;
  gear: Gear; settings: SaveSettings; savedAt: number;
}
export const SAVE_VERSION: 2;
export const MAX_SAVE_BYTES: number;
export const MAX_MILESTONES: number;
export const MAX_LEVEL: number;
export const HERO_IDS: HeroId[];
export function sanitizeSave(raw: unknown): { save: SaveData; error?: undefined } | { error: string; save?: undefined };
export function migrateSave(raw: unknown): SaveData | null;
export function mergeReceipts(...receipts: (ProgressReceipt | null | undefined)[]): ProgressReceipt;
export function inferGear(heroes: Record<HeroId, HeroState>): Gear;
export function progressScore(save: SaveData): number;
