import pool from '../db/mockDB.js';
import { deleteCachePrefix, getOrRefreshCache } from '../utils/cacheManager.js';
import { awardEligibleWeeklyChallengeRewards } from './weeklyChallenges.js';
import { GAME_SCORE_POLICIES } from '../utils/gameScorePolicies.js';

const SCORE_SUBMISSION_LIMIT_PER_MINUTE = 20;
const GAME_LEADERBOARD_TTL = 60 * 1000;

// A run pays out tickets from the cabinet's dispenser by how far it got: nothing for
// dying straight away, up to PLAY_TICKETS for a strong run (each game's `tickets` scale
// in GAME_SCORE_POLICIES). A game with its own arcade_reward_rules pays by those instead.
// There's no stopping for the day: until a player has had PLAY_TICKETS_FULL_UNTIL tickets today
// (US Eastern, like the rune) a run pays what it earned, and past that it pays a share of it,
// halving with every PLAY_TICKETS_TAPER_STEP more they've had (a full run pays 5, then 3, 2,
// and 1 from there on; a run that earned anything always pays at least 1), so playing on is
// always worth something but can't be farmed. Only a script could reach the backstop, where
// it does stop: at one ticket a run, that's hundreds of runs past the taper.
export const PLAY_TICKETS = 10;
export const PLAY_TICKETS_FULL_UNTIL = 150;
export const PLAY_TICKETS_TAPER_STEP = 50;
export const PLAY_TICKETS_DAILY_BACKSTOP = 1000;
const PLAY_TICKETS_SOURCE = 'arcade_play';

export function playTicketsFor(game, metricName, metricValue, paidToday) {
    const scale = GAME_SCORE_POLICIES.get(game)?.tickets;
    const value = Number(metricValue);
    if (metricName !== 'score' || !scale || !(value > scale.from)) return 0;
    const progress = Math.min(1, (value - scale.from) / (scale.full - scale.from));
    const earned = Math.floor(PLAY_TICKETS * progress);
    const paid = Number(paidToday || 0);
    if (earned <= 0 || paid >= PLAY_TICKETS_DAILY_BACKSTOP) return 0;
    if (paid < PLAY_TICKETS_FULL_UNTIL) return earned;
    const halvings = Math.floor((paid - PLAY_TICKETS_FULL_UNTIL) / PLAY_TICKETS_TAPER_STEP) + 1;
    return Math.max(1, Math.ceil(earned / 2 ** halvings));
}

export function calculateRuleAward(rule, metricValue) {
    if (rule.min_metric_value !== null && Number(metricValue) < Number(rule.min_metric_value)) {
        return 0;
    }

    let award = 0;
    if (rule.reward_type === 'fixed') {
        award = Number(rule.fixed_amount || 0);
    }

    if (rule.reward_type === 'multiplier') {
        award = Math.floor(Number(metricValue) * Number(rule.multiplier || 0));
    }

    if (rule.max_reward !== null) {
        award = Math.min(award, Number(rule.max_reward));
    }

    return Math.max(0, award);
}

export function validateScoreSubmission({ game, metricName, metricValue }) {
    if (!game || !metricName || !Number.isFinite(metricValue)) {
        return {
            ok: false,
            statusCode: 400,
            error: 'Game, metricName, and numeric metricValue are required'
        };
    }

    const gamePolicy = GAME_SCORE_POLICIES.get(game);
    const metricPolicy = gamePolicy?.[metricName];

    if (!metricPolicy) {
        return {
            ok: false,
            statusCode: 400,
            error: 'Unsupported game metric'
        };
    }

    if (metricPolicy.integer && !Number.isInteger(metricValue)) {
        return {
            ok: false,
            statusCode: 400,
            error: 'Metric value must be an integer'
        };
    }

    if (metricValue < metricPolicy.min || metricValue > metricPolicy.max) {
        return {
            ok: false,
            statusCode: 400,
            error: 'Metric value is outside the allowed range'
        };
    }

    return { ok: true };
}

function getGameLeaderboardCacheKey(game, metric, limit) {
    return `gameLeaderboard:${game}:${metric}:${limit}`;
}

function getGameLeaderboardCachePrefix(game, metric) {
    return `gameLeaderboard:${game}:${metric}:`;
}

function serializeGameLeaderboardRows(rows, currentUserId = null) {
    return rows.map(row => ({
        username: row.username,
        metricValue: row.metric_value,
        achieved_at: row.achieved_at,
        isUserScore: currentUserId ? row.id === currentUserId : false,
        // Whose score: the station's scoreboard draws their banner and avatar beside it
        userId: row.id
    }));
}

export async function getGameLeaderboardPayload({
    game,
    metric = 'score',
    limit = 10,
    currentUserId = null
}) {
    const numericLimit = Number.parseInt(limit, 10);
    const boundedLimit = Number.isFinite(numericLimit)
        ? Math.min(Math.max(numericLimit, 1), 100)
        : 10;
    const cacheKey = getGameLeaderboardCacheKey(game, metric, boundedLimit);
    const rows = await getOrRefreshCache(cacheKey, async () => {
        const leaderboard = await pool.query(`
            SELECT u.username, u.id, l.metric_value, l.achieved_at
            FROM leaderboards l
            JOIN games g ON l.game_id = g.id
            JOIN users u ON l.user_id = u.id
            WHERE g.name = $1 AND l.metric_name = $2
            ORDER BY l.metric_value DESC
            LIMIT $3
        `, [game, metric, boundedLimit]);

        return leaderboard.rows;
    }, GAME_LEADERBOARD_TTL);

    return {
        data: serializeGameLeaderboardRows(rows, currentUserId)
    };
}

// A player's best score in each game they're on the table for, and where that puts them
// among everyone's bests (1 = nobody's beaten it); their highest places first
export async function getPlayerBests(db, userId) {
    const result = await db.query(`
        WITH mine AS (
            SELECT l.game_id, MAX(l.metric_value) AS best
            FROM leaderboards l
            WHERE l.user_id = $1 AND l.metric_name = 'score'
            GROUP BY l.game_id
        )
        SELECT g.name AS game, mine.best, (
            SELECT COUNT(DISTINCT other.user_id)
            FROM leaderboards other
            WHERE other.game_id = mine.game_id AND other.metric_name = 'score' AND other.metric_value > mine.best
        ) + 1 AS place
        FROM mine
        JOIN games g ON g.id = mine.game_id
        ORDER BY place ASC, g.name ASC
        LIMIT 40
    `, [userId]);
    return result.rows.map((row) => ({ game: row.game, metricValue: Number(row.best), place: Number(row.place) }));
}

async function routes(fastify, options) {
    // (anyone can look, as with the leaderboards themselves)
    fastify.get('/playerBests', async (request, reply) => {
        const userId = String(request.query?.userId || '');
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
            return reply.code(400).send({ error: 'Valid userId is required' });
        }
        try {
            return { data: await getPlayerBests(pool, userId) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching scores' });
        }
    });

    fastify.get('/', async (request, reply) => {
        try {
            const games = await pool.query('SELECT * FROM games WHERE published_at IS NOT NULL');
            return games.rows;
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: error.message });
        }
    });

    fastify.get('/getLeaderboard', async (request, reply) => {
        try {
            const { game, metric, limit = 10 } = request.query;
            return getGameLeaderboardPayload({
                game,
                metric,
                limit,
                // Guests (no token) can view leaderboards too
                currentUserId: request.user?.sub ?? null
            });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: error.message });
        }
    });

    fastify.post('/submitScore', async (request, reply) => {
        const client = await pool.connect();
        try {
            const userId = request.user.sub;
            const { game, metricName, metricValue } = request.body;
            const numericMetricValue = Number(metricValue);
            const validation = validateScoreSubmission({
                game,
                metricName,
                metricValue: numericMetricValue,
            });

            if (!validation.ok) {
                return reply.code(validation.statusCode).send({ error: validation.error });
            }

            await client.query('BEGIN');

            // First, get the game_id
            const gameResult = await client.query('SELECT id FROM games WHERE name = $1 ORDER BY id ASC LIMIT 1', [game]);
            if (gameResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return reply.code(400).send({ error: 'Game not found' });
            }
            const gameId = gameResult.rows[0].id;

            const recentSubmissions = await client.query(`
                SELECT COUNT(*)::int AS count
                FROM leaderboards
                WHERE game_id = $1
                  AND user_id = $2
                  AND metric_name = $3
                  AND achieved_at >= now() - interval '1 minute'
            `, [gameId, userId, metricName]);

            if (Number(recentSubmissions.rows[0]?.count || 0) >= SCORE_SUBMISSION_LIMIT_PER_MINUTE) {
                await client.query('ROLLBACK');
                return reply.code(429).send({ error: 'Too many score submissions' });
            }

            // Insert a new leaderboard entry
            const result = await client.query(`
                INSERT INTO leaderboards (game_id, user_id, metric_name, metric_value)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [gameId, userId, metricName, numericMetricValue]);

            const scoreRow = result.rows[0];
            const rewardRulesResult = await client.query(`
                SELECT id, reward_type, fixed_amount, multiplier, min_metric_value, max_reward
                FROM arcade_reward_rules
                WHERE game_id = $1
                  AND metric_name = $2
                  AND is_active = TRUE
                  AND (starts_at IS NULL OR starts_at <= now())
                  AND (ends_at IS NULL OR ends_at > now())
            `, [gameId, metricName]);

            let coinsAwarded = rewardRulesResult.rows.reduce((total, rule) => {
                return total + calculateRuleAward(rule, numericMetricValue);
            }, 0);

            let coinBalance = null;
            // No rules of its own: the standard tickets for a run (fewer once they've had a day's worth)
            if (rewardRulesResult.rows.length === 0 && numericMetricValue > 0) {
                // One run at a time per player, so two at once are paid on the same day's count in turn
                await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${PLAY_TICKETS_SOURCE}:${userId}`]);
                const paidTodayResult = await client.query(`
                    SELECT COALESCE(SUM(amount), 0)::bigint AS paid
                    FROM currency_transactions
                    WHERE user_id = $1
                      AND source_type = $2
                      AND created_at >= (date_trunc('day', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York')
                `, [userId, PLAY_TICKETS_SOURCE]);
                const playTickets = playTicketsFor(game, metricName, numericMetricValue, paidTodayResult.rows[0]?.paid);
                if (playTickets > 0) {
                    const playResult = await client.query(`
                        SELECT public.grant_currency($1, $2, $3, $4, $5::jsonb) AS coin_balance
                    `, [
                        userId,
                        playTickets,
                        PLAY_TICKETS_SOURCE,
                        String(scoreRow.id),
                        JSON.stringify({ gameId, game, metricName, metricValue: numericMetricValue }),
                    ]);
                    coinBalance = Number(playResult.rows[0].coin_balance);
                    coinsAwarded = playTickets;
                }
            } else if (coinsAwarded > 0) {
                const walletResult = await client.query(`
                    SELECT public.grant_currency($1, $2, $3, $4, $5::jsonb) AS coin_balance
                `, [
                    userId,
                    coinsAwarded,
                    'arcade_score',
                    String(scoreRow.id),
                    JSON.stringify({
                        gameId,
                        game,
                        metricName,
                        metricValue: numericMetricValue,
                        ruleIds: rewardRulesResult.rows.map((rule) => rule.id),
                    }),
                ]);
                coinBalance = Number(walletResult.rows[0].coin_balance);
            }

            let weeklyChallengeRewards = [];
            // Savepoint so a failed challenge payout can't abort the transaction and drop the score
            await client.query('SAVEPOINT weekly_challenge_reward');
            try {
                weeklyChallengeRewards = await awardEligibleWeeklyChallengeRewards(client, userId, {
                    game,
                    metricName,
                    metricValue: numericMetricValue,
                    leaderboardId: scoreRow.id,
                });
                await client.query('RELEASE SAVEPOINT weekly_challenge_reward');
                const latestWeeklyChallengeBalance = weeklyChallengeRewards
                    .filter((reward) => reward.coinBalance !== null && reward.coinBalance !== undefined)
                    .at(-1)?.coinBalance;
                if (latestWeeklyChallengeBalance !== undefined) {
                    coinBalance = latestWeeklyChallengeBalance;
                }
            } catch (error) {
                await client.query('ROLLBACK TO SAVEPOINT weekly_challenge_reward').catch(() => {});
                weeklyChallengeRewards = [];
                fastify.log.warn({ err: error }, 'Unable to evaluate weekly challenge rewards');
            }

            await client.query('COMMIT');
            deleteCachePrefix(getGameLeaderboardCachePrefix(game, metricName));

            return {
                data: {
                    ...scoreRow,
                    coinsAwarded,
                    coinBalance,
                    weeklyChallengeRewards,
                },
            };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            fastify.log.error(error);
            return reply.code(500).send({ error: error.message });
        } finally {
            client.release();
        }
    });

    fastify.get('/getGameSpecificData', async (request, reply) => {
        try {
            const userId = request.user.sub;
            const { game, dataType } = request.query;

            // First, get the game_id
            const gameResult = await pool.query('SELECT id FROM games WHERE name = $1 ORDER BY id ASC LIMIT 1', [game]);
            if (gameResult.rows.length === 0) {
                return reply.code(404).send({ error: 'Game not found' });
            }
            const gameId = gameResult.rows[0].id;

            const result = await pool.query(`
                SELECT data
                FROM game_specific_data
                WHERE user_id = $1 AND game_id = $2 AND data_type = $3
            `, [userId, gameId, dataType]);

            if (result.rows.length === 0) {
                return reply.code(404).send({ error: 'Game-specific data not found' });
            }

            return { data: result.rows[0].data };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: error.message });
        }
    });

    fastify.post('/setGameSpecificData', async (request, reply) => {
        try {
            const userId = request.user.sub;
            const { game, dataType, data } = request.body;

            // First, get the game_id
            const gameResult = await pool.query('SELECT id FROM games WHERE name = $1 ORDER BY id ASC LIMIT 1', [game]);
            if (gameResult.rows.length === 0) {
                return reply.code(404).send({ error: 'Game not found' });
            }
            const gameId = gameResult.rows[0].id;

            // Get existing data or create new object if it doesn't exist
            const existingDataResult = await pool.query(`
                SELECT data FROM game_specific_data
                WHERE user_id = $1 AND game_id = $2 AND data_type = $3
            `, [userId, gameId, dataType]);

            const oldData = existingDataResult.rows[0]?.data || {};

            // Merge new data with existing data
            const updatedData = { ...oldData, ...data };

            // Upsert the game-specific data
            const result = await pool.query(`
                INSERT INTO game_specific_data (user_id, game_id, data_type, data)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, game_id, data_type)
                DO UPDATE SET data = $4, updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [userId, gameId, dataType, updatedData]);

            return { data: result.rows[0] };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: error.message });
        }
    });

}

export default routes;
