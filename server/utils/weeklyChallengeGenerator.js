import { GAME_SCORE_POLICIES } from './gameScorePolicies.js';

// The weekly arcade challenge used when no one has written one in Strapi.
//
// From NEW_RULES_START the game rotates each week. The target is the typical
// best score players had reached before the week began (the median of each
// player's best), so it moves with how good people actually are. Scores from
// before the week never change, so a week's challenge is the same whenever
// it's worked out, which matters: rewards are checked by regenerating the
// challenge from its documentId. Games too few people have played get a
// "play N runs" challenge instead, which anyone can finish.
//
// Weeks before NEW_RULES_START keep the old rules (8 Bit Evil Returns and a
// fixed list of targets) so past challenges still check out.

// A Sunday, like every generated week's start
export const NEW_RULES_START = '2026-09-27';

// Games that save a score at the end of every run and work on phones (see
// createArcadeGames in src/pages/Arcade/games.tsx). Busy games alternate with
// newer ones.
export const CHALLENGE_ROTATION = [
    'Ooidash',
    'Frog Ball',
    "Hemlock's Tower",
    'Horde Rush',
    'Tlaloc’s Curse',
    'Salmon Run 2',
    'WirtWare',
    '8 Bit Evil Returns',
];

export const MIN_PLAYERS_FOR_SCORE_TARGET = 3;
export const RUNS_TARGET = 3;
const METRIC_NAME = 'score';
const SCORE_REWARDS = [50, 75, 100];
const RUNS_REWARD = 50;

const LEGACY_GAME_NAME = '8 Bit Evil Returns';
const LEGACY_TARGETS = [1000, 1500, 2000, 2500, 3000, 4000, 5000];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function startOfUtcWeek(date = new Date()) {
    const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    normalized.setUTCDate(normalized.getUTCDate() - normalized.getUTCDay());
    return normalized;
}

export function generatedChallengeDocumentId(start) {
    return `generated-weekly-${start.toISOString().slice(0, 10)}`;
}

// The week a generated documentId stands for, or null if it isn't one
export function weekStartFromDocumentId(documentId) {
    const match = String(documentId).match(/^generated-weekly-(\d{4}-\d{2}-\d{2})$/);
    if (!match) return null;
    const start = startOfUtcWeek(new Date(`${match[1]}T00:00:00.000Z`));
    return generatedChallengeDocumentId(start) === documentId ? start : null;
}

export function challengeGameForWeek(start) {
    const weeksSinceStart = Math.round((start.getTime() - Date.parse(`${NEW_RULES_START}T00:00:00.000Z`)) / WEEK_MS);
    if (weeksSinceStart < 0) return null;
    return CHALLENGE_ROTATION[weeksSinceStart % CHALLENGE_ROTATION.length];
}

// Rounds down to two significant figures, so targets read like 2,600 not 2,644
export function niceTarget(value) {
    if (!(value >= 1)) return 1;
    const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1);
    return Math.floor(value / magnitude) * magnitude;
}

// The median of the players' best scores (the lower one for an even count)
export function scoreTargetFromPlayerBests(bests, policy) {
    const sorted = bests.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length < MIN_PLAYERS_FOR_SCORE_TARGET) return null;
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    let target = niceTarget(median);
    if (policy) target = Math.min(Math.max(target, Math.max(1, policy.min)), policy.max);
    return policy?.integer === false ? target : Math.floor(target);
}

// Every player's best score in the game from before the week began. Ignores
// scores the server would reject today (e.g. early negative Hemlock's Tower
// scores), and matches every games row with the name, like score checks do.
export async function getPlayerBestsBefore(db, gameName, before, policy) {
    const result = await db.query(`
        SELECT max(l.metric_value)::float8 AS best
        FROM leaderboards l
        JOIN games g ON g.id = l.game_id
        WHERE g.name = $1
          AND l.metric_name = $2
          AND l.achieved_at < $3::timestamptz
          AND l.metric_value >= $4
          AND l.metric_value <= $5
        GROUP BY l.user_id
    `, [gameName, METRIC_NAME, before.toISOString(), policy.min, policy.max]);
    return result.rows.map((row) => Number(row.best));
}

function weekWindow(start) {
    const endExclusive = new Date(start.getTime() + WEEK_MS);
    return {
        startsAt: start.toISOString(),
        endsAt: new Date(endExclusive.getTime() - 1).toISOString(),
    };
}

function baseChallenge(start) {
    const documentId = generatedChallengeDocumentId(start);
    return {
        id: documentId,
        documentId,
        slug: documentId,
        content: null,
        ...weekWindow(start),
        points: 1,
        metricName: METRIC_NAME,
        comparisonOperator: '>=',
        status: 'published',
        publishedAt: start.toISOString(),
        image: null,
        source: 'generated',
    };
}

function legacyChallenge(start) {
    const weekIndex = Math.floor(start.getTime() / WEEK_MS);
    const targetMetricValue = LEGACY_TARGETS[weekIndex % LEGACY_TARGETS.length];
    const target = targetMetricValue.toLocaleString('en-US');
    return {
        ...baseChallenge(start),
        title: `Weekly Arcade Challenge: Score ${target}`,
        summary: `Score at least ${target} in ${LEGACY_GAME_NAME} before the week resets.`,
        rewardCoins: SCORE_REWARDS[weekIndex % SCORE_REWARDS.length],
        verificationType: 'arcade_score',
        gameName: LEGACY_GAME_NAME,
        targetMetricValue,
    };
}

function displayName(gameName) {
    return gameName.replace(/[‘’]/g, "'");
}

async function rotatedChallenge(start, db) {
    const gameName = challengeGameForWeek(start);
    const policy = GAME_SCORE_POLICIES.get(gameName)?.[METRIC_NAME];
    if (!policy) throw new Error(`No score policy for weekly challenge game ${gameName}`);

    const bests = await getPlayerBestsBefore(db, gameName, start, policy);
    const targetMetricValue = scoreTargetFromPlayerBests(bests, policy);
    const name = displayName(gameName);
    const weekIndex = Math.floor(start.getTime() / WEEK_MS);

    if (targetMetricValue === null) {
        return {
            ...baseChallenge(start),
            title: `Weekly Arcade Challenge: Play ${RUNS_TARGET} runs of ${name}`,
            summary: `Finish ${RUNS_TARGET} runs of ${name} while signed in before the week resets.`,
            rewardCoins: RUNS_REWARD,
            verificationType: 'arcade_runs',
            gameName,
            targetMetricValue: RUNS_TARGET,
            generation: { rule: 'runs', players: bests.length },
        };
    }

    const target = targetMetricValue.toLocaleString('en-US');
    return {
        ...baseChallenge(start),
        title: `Weekly Arcade Challenge: Score ${target} in ${name}`,
        summary: `Score at least ${target} in ${name} before the week resets. That's about a typical player's best run.`,
        rewardCoins: SCORE_REWARDS[weekIndex % SCORE_REWARDS.length],
        verificationType: 'arcade_score',
        gameName,
        targetMetricValue,
        generation: { rule: 'median_player_best', players: bests.length },
    };
}

// The generated challenge for the week holding `date`, or for a generated
// documentId (null if documentId isn't one).
export async function generateWeeklyChallenge({ date = new Date(), documentId = null, db }) {
    const start = documentId ? weekStartFromDocumentId(documentId) : startOfUtcWeek(date);
    if (!start) return null;
    if (start.getTime() < Date.parse(`${NEW_RULES_START}T00:00:00.000Z`)) return legacyChallenge(start);
    return rotatedChallenge(start, db);
}
