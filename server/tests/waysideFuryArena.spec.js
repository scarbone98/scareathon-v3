import {
    ARENA_COOP_GAME,
    ARENA_MAX_SCORE,
    ARENA_SOLO_GAME,
    arenaGame,
    arenaKillsThroughWave,
    arenaScore,
    arenaWaveEnemyCount,
} from '../shared/waysideFury/u1Arena.js';
import { validateArenaScoreSubmission } from '../wayside-fury/arenaScore.js';
import { playTicketsFor, validateScoreSubmission } from '../routes/games.js';

function submission(overrides = {}) {
    const arenaRun = {
        version: 1, mode: 'solo', wavesCleared: 3, kills: arenaKillsThroughWave(3) + 2,
        elapsedMs: 30_000, players: 1, ...overrides,
    };
    return {
        game: arenaGame(arenaRun.mode), metricName: 'score',
        metricValue: arenaScore(arenaRun.wavesCleared, arenaRun.kills), arenaRun,
    };
}

describe('Wayside Fury tournament score rules', () => {
    test('shares the escalating wave roster and score formula with the client', () => {
        expect([1, 2, 3, 4, 5, 6, 7, 8, 10001].map(arenaWaveEnemyCount)).toEqual([5, 7, 9, 11, 13, 15, 17, 18, 18]);
        expect(arenaKillsThroughWave(0)).toBe(0);
        expect(arenaKillsThroughWave(7)).toBe(77);
        expect(arenaKillsThroughWave(8)).toBe(95);
        expect(arenaScore(3, 23)).toBe(5300);
        expect(ARENA_MAX_SCORE).toBe(arenaScore(10000, arenaKillsThroughWave(10001)));
    });

    test('accepts a finished solo run through the existing Arcade validation path', () => {
        expect(submission().game).toBe(ARENA_SOLO_GAME);
        expect(validateScoreSubmission(submission())).toEqual({ ok: true });
        expect(validateArenaScoreSubmission(submission())).toEqual({ ok: true });
    });

    test('uses a separate co-op board even when only the host remains', () => {
        for (const players of [1, 2, 3, 4]) {
            const score = submission({ mode: 'coop', players });
            expect(score.game).toBe(ARENA_COOP_GAME);
            expect(validateScoreSubmission(score)).toEqual({ ok: true });
        }
        expect(validateScoreSubmission({ ...submission({ mode: 'coop', players: 2 }), game: ARENA_SOLO_GAME }).ok).toBe(false);
        expect(validateScoreSubmission({ ...submission(), game: ARENA_COOP_GAME }).ok).toBe(false);
        expect(validateScoreSubmission(submission({ players: 2 })).ok).toBe(false);
        expect(validateScoreSubmission(submission({ mode: 'coop', players: 5 })).ok).toBe(false);
    });

    test('requires a versioned receipt and an exact reproducible score', () => {
        expect(validateScoreSubmission({ game: ARENA_SOLO_GAME, metricName: 'score', metricValue: 5300 }).ok).toBe(false);
        expect(validateScoreSubmission(submission({ version: 2 })).ok).toBe(false);
        expect(validateScoreSubmission({ ...submission(), metricValue: submission().metricValue + 1 }).ok).toBe(false);
        expect(validateScoreSubmission({ ...submission(), metricName: 'waves' }).ok).toBe(false);
    });

    test('rejects kills outside the cleared waves and current wave spawn budget', () => {
        const minimum = arenaKillsThroughWave(3);
        const maximum = arenaKillsThroughWave(4);
        expect(validateScoreSubmission(submission({ kills: minimum })).ok).toBe(true);
        expect(validateScoreSubmission(submission({ kills: maximum })).ok).toBe(true);
        expect(validateScoreSubmission(submission({ kills: minimum - 1 })).ok).toBe(false);
        expect(validateScoreSubmission(submission({ kills: maximum + 1 })).ok).toBe(false);
    });

    test('rejects runs that skip the guaranteed opening and wave intermissions', () => {
        expect(validateScoreSubmission(submission({ elapsedMs: 6999 })).ok).toBe(false);
        expect(validateScoreSubmission(submission({ elapsedMs: 7000 })).ok).toBe(true);
        expect(validateScoreSubmission(submission({ wavesCleared: 0, kills: 1, elapsedMs: 2999 })).ok).toBe(false);
        expect(validateScoreSubmission(submission({ wavesCleared: 0, kills: 1, elapsedMs: 3000 })).ok).toBe(true);
        expect(validateScoreSubmission(submission({ wavesCleared: 0, kills: 0, elapsedMs: 0 })).ok).toBe(true);
    });

    test('rejects malformed, fractional, negative and oversized run values', () => {
        for (const override of [
            { wavesCleared: -1 }, { wavesCleared: 1.5 }, { wavesCleared: 10001 },
            { kills: -1 }, { kills: 1.5 }, { kills: '23' },
            { elapsedMs: -1 }, { elapsedMs: 7000.5 }, { elapsedMs: 604800001 },
            { players: 0 }, { players: 1.5 }, { mode: 'versus' },
        ]) expect(validateScoreSubmission(submission(override)).ok).toBe(false);
        for (const arenaRun of [null, [], false, 'solo']) {
            expect(validateScoreSubmission({ ...submission(), arenaRun }).ok).toBe(false);
        }
    });

    test('caps long-run tickets and applies the daily taper', () => {
        const score = submission({ wavesCleared: 10000, kills: arenaKillsThroughWave(10001), elapsedMs: 86400000 });
        expect(validateScoreSubmission(score)).toEqual({ ok: true });
        for (const game of [ARENA_SOLO_GAME, ARENA_COOP_GAME]) {
            expect(playTicketsFor(game, 'score', ARENA_MAX_SCORE, 0)).toBe(50);
            expect(playTicketsFor(game, 'score', 1500, 0)).toBe(0);
            expect(playTicketsFor(game, 'score', 15000, 300)).toBe(5);
            expect(playTicketsFor(game, 'score', ARENA_MAX_SCORE, 1000)).toBe(0);
        }
        expect(playTicketsFor('Wayside Fury', 'score', 1000, 0)).toBe(10);
    });

});
