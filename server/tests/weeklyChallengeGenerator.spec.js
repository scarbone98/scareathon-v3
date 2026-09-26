import fs from 'fs';
import {
    CHALLENGE_ROTATION,
    MIN_PLAYERS_FOR_SCORE_TARGET,
    NEW_RULES_START,
    RUNS_TARGET,
    challengeGameForWeek,
    generateWeeklyChallenge,
    generatedChallengeDocumentId,
    niceTarget,
    scoreTargetFromPlayerBests,
    startOfUtcWeek,
} from '../utils/weeklyChallengeGenerator.js';
import { GAME_SCORE_POLICIES } from '../utils/gameScorePolicies.js';
import {
    getVerifiedWeeklyChallengeCompletion,
    isWeeklyChallengeActive,
    scoreSubmissionCompletesChallenge,
} from '../routes/weeklyChallenges.js';
import { validateScoreSubmission } from '../routes/games.js';

// Answers the player-bests query with the given bests, and records what it was asked
function fakeDb(bests = []) {
    const calls = [];
    return {
        calls,
        query: async (sql, params) => {
            calls.push({ sql, params });
            return { rows: bests.map((best) => ({ best })) };
        },
    };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const firstNewWeek = new Date(`${NEW_RULES_START}T00:00:00.000Z`);
const weekStarts = (count) => Array.from({ length: count }, (_, i) => new Date(firstNewWeek.getTime() + i * WEEK_MS));

// The arcade's game list, to check the rotation against what players can play
const arcadeGamesSource = fs.readFileSync(new URL('../../src/pages/Arcade/games.tsx', import.meta.url), 'utf8');
function arcadeEntry(gameName) {
    const start = arcadeGamesSource.indexOf(`name: "${gameName}"`);
    if (start === -1) return null;
    const next = arcadeGamesSource.indexOf('      name: ', start + 1);
    return arcadeGamesSource.slice(start, next === -1 ? undefined : next);
}

describe('weekly challenge rotation', () => {
    test('starts on a Sunday, with the first game first', () => {
        expect(startOfUtcWeek(firstNewWeek).toISOString()).toBe(firstNewWeek.toISOString());
        expect(challengeGameForWeek(firstNewWeek)).toBe(CHALLENGE_ROTATION[0]);
        expect(challengeGameForWeek(new Date(firstNewWeek.getTime() - WEEK_MS))).toBeNull();
    });

    test('gets through every game, no game twice in a row, for a year', () => {
        const games = weekStarts(52).map(challengeGameForWeek);
        expect(new Set(games)).toEqual(new Set(CHALLENGE_ROTATION));
        games.forEach((game, i) => {
            if (i > 0) expect(game).not.toBe(games[i - 1]);
        });
    });

    test.each(CHALLENGE_ROTATION)('%s saves scores the server accepts', (gameName) => {
        expect(GAME_SCORE_POLICIES.get(gameName)?.score).toBeDefined();
        expect(validateScoreSubmission({ game: gameName, metricName: 'score', metricValue: 1 })).toEqual({ ok: true });
    });

    test.each(CHALLENGE_ROTATION)('%s is in the arcade, saves a score every run, and works on phones', (gameName) => {
        const entry = arcadeEntry(gameName);
        expect(entry).not.toBeNull();
        const savesScores =
            entry.includes(`listenForPlayerDiedScores(iframe, "${gameName}"`) ||
            entry.includes(`submitArcadeScore("${gameName}"`);
        expect(savesScores).toBe(true);
        expect(entry).not.toContain('hasLeaderboard: false');
        expect(entry).not.toContain('availableOnMobile: false');
    });
});

describe('weekly challenge targets', () => {
    test('round down to two significant figures', () => {
        expect(niceTarget(2644)).toBe(2600);
        expect(niceTarget(112950)).toBe(110000);
        expect(niceTarget(89)).toBe(89);
        expect(niceTarget(16)).toBe(16);
        expect(niceTarget(7)).toBe(7);
        expect(niceTarget(0.4)).toBe(1);
    });

    test('are the median player best, and need enough players', () => {
        const policy = { min: 0, max: 10000000, integer: true };
        expect(scoreTargetFromPlayerBests([50, 120, 312, 480, 2644], policy)).toBe(310);
        expect(scoreTargetFromPlayerBests([50, 120, 312, 480], policy)).toBe(120);
        expect(scoreTargetFromPlayerBests([900, 2644], policy)).toBeNull();
        expect(MIN_PLAYERS_FOR_SCORE_TARGET).toBeGreaterThanOrEqual(3);
    });

    test('stay inside what the server accepts', () => {
        expect(scoreTargetFromPlayerBests([0, 0, 0], { min: 0, max: 100, integer: true })).toBe(1);
        expect(scoreTargetFromPlayerBests([500, 600, 700], { min: 0, max: 100, integer: true })).toBe(100);
    });
});

describe('generated weekly challenges', () => {
    test('keep the old rules before the rotation starts', async () => {
        const db = fakeDb([1, 2, 3]);
        const challenge = await generateWeeklyChallenge({ date: new Date('2026-09-23T12:00:00.000Z'), db });
        expect(challenge).toMatchObject({
            documentId: 'generated-weekly-2026-09-20',
            gameName: '8 Bit Evil Returns',
            verificationType: 'arcade_score',
            targetMetricValue: 4000,
            rewardCoins: 75,
        });
        expect(db.calls).toHaveLength(0);
    });

    test('only use scores from before the week began', async () => {
        const db = fakeDb([100, 200, 300]);
        await generateWeeklyChallenge({ date: new Date('2026-09-30T12:00:00.000Z'), db });
        expect(db.calls).toHaveLength(1);
        expect(db.calls[0].params).toEqual(['Ooidash', 'score', '2026-09-27T00:00:00.000Z', 0, 10000000]);
    });

    test('with enough players, ask for the typical best score', async () => {
        const challenge = await generateWeeklyChallenge({
            date: new Date('2026-09-30T12:00:00.000Z'),
            db: fakeDb([40, 89, 266, 900, 2644]),
        });
        expect(challenge).toMatchObject({
            documentId: 'generated-weekly-2026-09-27',
            gameName: 'Ooidash',
            verificationType: 'arcade_score',
            metricName: 'score',
            comparisonOperator: '>=',
            targetMetricValue: 260,
            title: 'Weekly Arcade Challenge: Score 260 in Ooidash',
            startsAt: '2026-09-27T00:00:00.000Z',
            endsAt: '2026-10-03T23:59:59.999Z',
        });
    });

    test('without enough players, ask for a few runs instead', async () => {
        const challenge = await generateWeeklyChallenge({
            date: new Date('2026-10-05T12:00:00.000Z'),
            db: fakeDb([1200]),
        });
        expect(challenge).toMatchObject({
            gameName: 'Frog Ball',
            verificationType: 'arcade_runs',
            targetMetricValue: RUNS_TARGET,
            title: `Weekly Arcade Challenge: Play ${RUNS_TARGET} runs of Frog Ball`,
        });
    });

    test('come out the same from their documentId, which is how rewards find them', async () => {
        for (const start of weekStarts(12)) {
            const fromDate = await generateWeeklyChallenge({ date: new Date(start.getTime() + 3 * 86400000), db: fakeDb([10, 20, 30, 40]) });
            const fromId = await generateWeeklyChallenge({ documentId: generatedChallengeDocumentId(start), db: fakeDb([10, 20, 30, 40]) });
            expect(fromId).toEqual(fromDate);
        }
        await expect(generateWeeklyChallenge({ documentId: 'generated-weekly-2026-09-29', db: fakeDb() })).resolves.toBeNull();
        await expect(generateWeeklyChallenge({ documentId: 'some-strapi-doc', db: fakeDb() })).resolves.toBeNull();
    });

    // The checks below run every week of the next year through the same code
    // that pays out rewards, with a spread of made-up player scores.
    test.each([
        ['no players', []],
        ['a few busy players', [3, 18, 250, 4000, 90000]],
        ['huge scores', [5e6, 8e6, 9.9e6, 2e9]],
    ])('every week for a year is completable and checks out (%s)', async (_label, bests) => {
        for (const start of weekStarts(52)) {
            const challenge = await generateWeeklyChallenge({ date: new Date(start.getTime() + 86400000), db: fakeDb(bests) });
            const policy = GAME_SCORE_POLICIES.get(challenge.gameName).score;
            const midWeek = new Date(start.getTime() + 3 * 86400000);
            expect(isWeeklyChallengeActive(challenge, midWeek)).toBe(true);
            expect(challenge.rewardCoins).toBeGreaterThan(0);
            expect(Number.isInteger(challenge.targetMetricValue)).toBe(true);

            if (challenge.verificationType === 'arcade_score') {
                const target = challenge.targetMetricValue;
                expect(target).toBeGreaterThanOrEqual(1);
                // The target itself is a score the server would save, and saving it completes the challenge
                expect(validateScoreSubmission({ game: challenge.gameName, metricName: 'score', metricValue: target })).toEqual({ ok: true });
                const submission = { game: challenge.gameName, metricName: 'score' };
                expect(scoreSubmissionCompletesChallenge(challenge, { ...submission, metricValue: target })).toBe(true);
                expect(scoreSubmissionCompletesChallenge(challenge, { ...submission, metricValue: target - 1 })).toBe(false);
                expect(scoreSubmissionCompletesChallenge(challenge, { ...submission, game: 'Some Other Game', metricValue: policy.max })).toBe(false);
            } else {
                expect(challenge.verificationType).toBe('arcade_runs');
                expect(challenge.targetMetricValue).toBe(RUNS_TARGET);
            }
        }
    });

    test('"play runs" challenges complete once enough runs are saved that week', async () => {
        const challenge = await generateWeeklyChallenge({ date: new Date('2026-10-05T12:00:00.000Z'), db: fakeDb() });
        const clientWithRuns = (runs) => {
            const calls = [];
            return { calls, query: async (sql, params) => { calls.push(params); return { rows: [{ runs }] }; } };
        };

        const notYet = clientWithRuns(RUNS_TARGET - 1);
        await expect(getVerifiedWeeklyChallengeCompletion(notYet, 'user-1', challenge)).resolves.toMatchObject({ completed: false });
        expect(notYet.calls[0]).toEqual(['user-1', 'Frog Ball', 'score', '2026-10-04T00:00:00.000Z', '2026-10-10T23:59:59.999Z']);

        await expect(getVerifiedWeeklyChallengeCompletion(clientWithRuns(RUNS_TARGET), 'user-1', challenge)).resolves.toMatchObject({
            completed: true,
            evidence: { type: 'arcade_runs', game: 'Frog Ball', runs: RUNS_TARGET },
        });
    });
});
