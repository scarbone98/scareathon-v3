// The client and Arcade score validator share this deterministic tournament ledger.
// These board names are the games table lookup keys, not the campaign score board.
export const ARENA_SOLO_GAME = 'wayside-fury-arena';
export const ARENA_COOP_GAME = 'wayside-fury-arena-coop';
export const ARENA_MAX_WAVES = 10_000;
export const ARENA_MAX_ELAPSED_MS = 7 * 24 * 60 * 60 * 1000;

export function isArenaGame(game) {
    return game === ARENA_SOLO_GAME || game === ARENA_COOP_GAME;
}

export function arenaGame(mode) {
    return mode === 'coop' ? ARENA_COOP_GAME : ARENA_SOLO_GAME;
}

export function arenaWaveEnemyCount(wave) {
    return Math.min(18, 3 + wave * 2);
}

export function arenaKillsThroughWave(wavesCleared) {
    if (wavesCleared <= 0) return 0;
    const growingWaves = Math.min(7, wavesCleared);
    return growingWaves * (growingWaves + 4) + Math.max(0, wavesCleared - 7) * 18;
}

export function arenaScore(wavesCleared, kills) {
    return wavesCleared * 1000 + kills * 100;
}

export function arenaMinimumElapsedMs(wavesCleared, kills) {
    return (kills > 0 ? 3000 : 0) + Math.max(0, wavesCleared - 1) * 2000;
}

export const ARENA_MAX_KILLS = arenaKillsThroughWave(ARENA_MAX_WAVES + 1);
export const ARENA_MAX_SCORE = arenaScore(ARENA_MAX_WAVES, ARENA_MAX_KILLS);
