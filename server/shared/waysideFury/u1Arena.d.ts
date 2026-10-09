export type ArenaMode = 'solo' | 'coop';
export interface ArenaRunReceipt {
    version: 1;
    mode: ArenaMode;
    wavesCleared: number;
    kills: number;
    elapsedMs: number;
    players: number;
}
export const ARENA_SOLO_GAME: 'wayside-fury-arena';
export const ARENA_COOP_GAME: 'wayside-fury-arena-coop';
export const ARENA_MAX_WAVES: number;
export const ARENA_MAX_ELAPSED_MS: number;
export const ARENA_MAX_KILLS: number;
export const ARENA_MAX_SCORE: number;
export function isArenaGame(game: unknown): game is typeof ARENA_SOLO_GAME | typeof ARENA_COOP_GAME;
export function arenaGame(mode: ArenaMode): typeof ARENA_SOLO_GAME | typeof ARENA_COOP_GAME;
export function arenaWaveEnemyCount(wave: number): number;
export function arenaKillsThroughWave(wavesCleared: number): number;
export function arenaScore(wavesCleared: number, kills: number): number;
export function arenaMinimumElapsedMs(wavesCleared: number, kills: number): number;
