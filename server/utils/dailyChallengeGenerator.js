import { CHALLENGE_ROTATION, RUNS_TARGET } from './weeklyChallengeGenerator.js';

// The daily arcade challenge: a game a day (the weekly rotation, offset so it isn't
// usually the week's game), a couple of runs of it, for a few tickets. Anyone can finish
// it. Like a generated weekly challenge it's worked out from its documentId alone, so
// rewards check out whenever they're claimed. It pays through the weekly challenges'
// machinery (same verification, payout and once-only index); it's `daily`, so it never
// counts as the Scareboard's weekly point.

const DAY_MS = 24 * 60 * 60 * 1000;
export const DAILY_RUNS_TARGET = Math.max(2, RUNS_TARGET - 1);
export const DAILY_REWARD = 25;

export function startOfUtcDay(date = new Date()) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function dailyChallengeDocumentId(start) {
    return `generated-daily-${start.toISOString().slice(0, 10)}`;
}

// The day a daily documentId stands for, or null if it isn't one
export function dayStartFromDocumentId(documentId) {
    const match = String(documentId).match(/^generated-daily-(\d{4}-\d{2}-\d{2})$/);
    if (!match) return null;
    const start = new Date(`${match[1]}T00:00:00.000Z`);
    return Number.isNaN(start.getTime()) || dailyChallengeDocumentId(start) !== documentId ? null : start;
}

export function dailyGameFor(start) {
    const dayIndex = Math.floor(start.getTime() / DAY_MS);
    return CHALLENGE_ROTATION[(dayIndex + 3) % CHALLENGE_ROTATION.length];
}

// The daily challenge for the day holding `date`, or for a daily documentId (null if
// documentId isn't one)
export function generateDailyChallenge({ date = new Date(), documentId = null } = {}) {
    const start = documentId ? dayStartFromDocumentId(documentId) : startOfUtcDay(date);
    if (!start) return null;
    const gameName = dailyGameFor(start);
    const name = gameName.replace(/[‘’]/g, "'");
    const id = dailyChallengeDocumentId(start);
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
