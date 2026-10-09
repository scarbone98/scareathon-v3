import {
    ARENA_MAX_ELAPSED_MS, ARENA_MAX_KILLS, ARENA_MAX_WAVES,
    arenaGame, arenaKillsThroughWave, arenaMinimumElapsedMs, arenaScore, isArenaGame,
} from '../shared/waysideFury/u1Arena.js';

const integer = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
const rejected = (error) => ({ ok: false, statusCode: 400, error });

// As with the other Arcade games, server policy and submission rate limits bound
// client scores. The arena also reconstructs its score and checks its spawn/time
// budget; the host remains responsible for the co-op combat simulation.
export function validateArenaScoreSubmission({ game, metricValue, arenaRun }) {
    if (!isArenaGame(game)) return rejected('Unsupported arena leaderboard');
    if (!arenaRun || typeof arenaRun !== 'object' || Array.isArray(arenaRun) || arenaRun.version !== 1 ||
        !['solo', 'coop'].includes(arenaRun.mode) ||
        !integer(arenaRun.wavesCleared, ARENA_MAX_WAVES) ||
        !integer(arenaRun.kills, ARENA_MAX_KILLS) ||
        !integer(arenaRun.elapsedMs, ARENA_MAX_ELAPSED_MS) ||
        !integer(arenaRun.players, 4) || arenaRun.players < 1) {
        return rejected('Arena score requires a valid version 1 run receipt');
    }
    const { mode, wavesCleared, kills, elapsedMs, players } = arenaRun;
    if (game !== arenaGame(mode) || (mode === 'solo' && players !== 1)) {
        return rejected('Arena run does not match its solo or co-op leaderboard');
    }
    if (kills < arenaKillsThroughWave(wavesCleared) || kills > arenaKillsThroughWave(wavesCleared + 1)) {
        return rejected('Arena kills exceed the run wave roster');
    }
    if (elapsedMs < arenaMinimumElapsedMs(wavesCleared, kills)) {
        return rejected('Arena run is shorter than its wave intermissions');
    }
    if (metricValue !== arenaScore(wavesCleared, kills)) {
        return rejected('Arena score does not match its run receipt');
    }
    return { ok: true };
}
