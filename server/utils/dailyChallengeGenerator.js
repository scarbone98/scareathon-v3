import { CHALLENGE_ROTATION, RUNS_TARGET } from './weeklyChallengeGenerator.js';

// The daily arcade challenges, two a day: a game each (the weekly rotation, offset so
// they aren't usually the week's game, and never each other), a couple of runs of it, for a
// few tickets. Anyone can finish them. The second's documentId ends "-2". Like a generated weekly challenge it's worked out from its documentId alone, so
// rewards check out whenever they're claimed. It pays through the weekly challenges'
// machinery (same verification, payout and once-only index); it's `daily`, so it never
// counts as the Scareboard's weekly point.

const DAY_MS = 24 * 60 * 60 * 1000;
export const DAILY_RUNS_TARGET = Math.max(2, RUNS_TARGET - 1);
export const DAILY_REWARD = 25;

export function startOfUtcDay(date = new Date()) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export const DAILY_CHALLENGES = 2;

// (slot: 0 for the day's first challenge, 1 for its second)
export function dailyChallengeDocumentId(start, slot = 0) {
    return `generated-daily-${start.toISOString().slice(0, 10)}${slot ? `-${slot + 1}` : ''}`;
}

// The day and slot a daily documentId stands for ({ start, slot }), or null if it isn't one
export function dailyFromDocumentId(documentId) {
    const match = String(documentId).match(/^generated-daily-(\d{4}-\d{2}-\d{2})(?:-(\d))?$/);
    if (!match) return null;
    const start = new Date(`${match[1]}T00:00:00.000Z`);
    const slot = match[2] ? Number(match[2]) - 1 : 0;
    if (Number.isNaN(start.getTime()) || slot < 0 || slot >= DAILY_CHALLENGES || dailyChallengeDocumentId(start, slot) !== documentId) return null;
    return { start, slot };
}

// The day a daily documentId stands for, or null if it isn't one
export function dayStartFromDocumentId(documentId) {
    return dailyFromDocumentId(documentId)?.start ?? null;
}

// (the second is half the rotation on from the first, so the two are different games)
export function dailyGameFor(start, slot = 0) {
    const dayIndex = Math.floor(start.getTime() / DAY_MS);
    const games = CHALLENGE_ROTATION.length;
    const step = slot ? Math.max(1, Math.floor(games / 2)) : 0;
    return CHALLENGE_ROTATION[(dayIndex + 3 + step) % games];
}

// Both of the day's challenges, the first first
export function generateDailyChallenges({ date = new Date() } = {}) {
    return Array.from({ length: DAILY_CHALLENGES }, (_, slot) => generateDailyChallenge({ date, slot }));
}

// A daily challenge for the day holding `date` (its first, or the one in `slot`), or for a
// daily documentId (null if documentId isn't one)
export function generateDailyChallenge({ date = new Date(), documentId = null, slot = 0 } = {}) {
    const named = documentId ? dailyFromDocumentId(documentId) : { start: startOfUtcDay(date), slot };
    if (!named) return null;
    const { start } = named;
    slot = named.slot;
    const gameName = dailyGameFor(start, slot);
    const name = gameName.replace(/[‘’]/g, "'");
    const id = dailyChallengeDocumentId(start, slot);
    return {
        id,
        documentId: id,
        slug: id,
        title: `Daily Challenge: Play ${DAILY_RUNS_TARGET} runs of ${name}`,
        summary: `Finish ${DAILY_RUNS_TARGET} runs of ${name} while signed in before the day is out.`,
        content: null,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + DAY_MS - 1).toISOString(),
        points: 0,
        rewardCoins: DAILY_REWARD,
        verificationType: 'arcade_runs',
        gameName,
        metricName: 'score',
        targetMetricValue: DAILY_RUNS_TARGET,
        comparisonOperator: '>=',
        status: 'published',
        publishedAt: start.toISOString(),
        image: null,
        source: 'generated',
        daily: true,
    };
}
