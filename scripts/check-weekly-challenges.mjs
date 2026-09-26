// Shows the generated weekly arcade challenges for the coming weeks against
// the real scores, and flags any that couldn't be finished.
//   npm run check:weekly-challenges            (this week and the next 7)
//   npm run check:weekly-challenges -- 12      (this week and the next 11)
// Uses the database in server/.env (DB_CONNECTION_STRING). Weeks that haven't
// started use the scores saved so far, so their targets can still go up.
// Exits 1 if any week has a problem, so it can run in CI.
import pool from '../server/db/mockDB.js';
import { generateWeeklyChallenge, startOfUtcWeek } from '../server/utils/weeklyChallengeGenerator.js';

const weeks = Number.parseInt(process.argv[2], 10) || 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const thisWeek = startOfUtcWeek(new Date());

async function gameStats(gameName, target) {
    const result = await pool.query(`
        WITH bests AS (
            SELECT l.user_id, max(l.metric_value) AS best, max(l.achieved_at) AS last_played
            FROM leaderboards l JOIN games g ON g.id = l.game_id
            WHERE g.name = $1 AND l.metric_name = 'score' AND l.metric_value >= 0
            GROUP BY l.user_id
        )
        SELECT
            (SELECT count(*) FROM games WHERE name = $1)::int AS game_rows,
            count(*)::int AS players,
            count(*) FILTER (WHERE $2::numeric IS NOT NULL AND best >= $2::numeric)::int AS reached,
            count(*) FILTER (WHERE last_played >= now() - interval '30 days')::int AS recent
        FROM bests
    `, [gameName, target]);
    return result.rows[0];
}

const rows = [];
const problems = [];
try {
    for (let i = 0; i < weeks; i += 1) {
        const start = new Date(thisWeek.getTime() + i * WEEK_MS);
        const challenge = await generateWeeklyChallenge({ date: start, db: pool });
        const isScore = challenge.verificationType === 'arcade_score';
        const stats = await gameStats(challenge.gameName, isScore ? challenge.targetMetricValue : null);
        const week = start.toISOString().slice(0, 10);

        if (!stats.game_rows) problems.push(`${week}: ${challenge.gameName} isn't in the games table, so its scores would be rejected`);
        if (isScore && stats.reached === 0) problems.push(`${week}: nobody has ever scored ${challenge.targetMetricValue} in ${challenge.gameName}`);

        rows.push({
            week: `${week}${i === 0 ? ' (now)' : ''}`,
            challenge: challenge.title.replace('Weekly Arcade Challenge: ', ''),
            coins: challenge.rewardCoins,
            players: stats.players,
            'played in 30d': stats.recent,
            'ever reached': isScore ? `${stats.reached}/${stats.players}` : 'n/a',
        });
    }
} finally {
    await pool.end();
}

console.table(rows);
if (problems.length) {
    console.log('\nProblems:');
    problems.forEach((problem) => console.log(`  - ${problem}`));
    process.exitCode = 1;
} else {
    console.log('\nEvery week looks completable.');
}
