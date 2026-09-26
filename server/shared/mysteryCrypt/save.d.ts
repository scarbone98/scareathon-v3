import type { HeroId, ItemId, MonsterId, MoveId } from "../../../src/pages/MysteryCrypt/game/data";

export interface SavedUnit {
  level: number;
  xp: number;
  // Equipped moves, up to four.
  moves: MoveId[];
}

export interface SavedMonster extends SavedUnit {
  uid: number;
  kind: MonsterId;
}

export interface Save {
  version: 1;
  hero: HeroId;
  heroes: Record<HeroId, SavedUnit>;
  monsters: SavedMonster[];
  // Monster uids brought into the next stage.
  team: number[];
  nextUid: number;
  candy: number;
  // Items bought to bring along.
  bag: ItemId[];
  // Stages cleared, which is also the index of the next one.
  cleared: number;
  // Deepest floor reached in each stage.
  best: number[];
  // Best progress score sent to the leaderboard.
  submitted: number;
}

export const SAVE_VERSION: 1;
export const HERO_IDS: HeroId[];
export const MONSTER_IDS: MonsterId[];
export const MOVE_IDS: MoveId[];
export const ITEM_IDS: ItemId[];
export const MAX_MONSTERS: number;
export const MAX_TEAM: number;
export const MAX_BAG: number;
export const MAX_LEVEL: number;
export const MAX_MOVES: number;
export const MAX_SAVE_BYTES: number;
export function sanitizeSave(raw: unknown): { save: Save; error?: undefined } | { error: string; save?: undefined };
export function progressScore(save: Save): number;
