import pool from '../db/mockDB.js';

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

    const leaderboard = await pool.query(`
        SELECT u.username, u.id, l.metric_value, l.achieved_at
        FROM leaderboards l
        JOIN games g ON l.game_id = g.id
        JOIN users u ON l.user_id = u.id
        WHERE g.name = $1 AND l.metric_name = $2
        ORDER BY l.metric_value DESC
        LIMIT $3
    `, [game, metric, boundedLimit]);

    return {
        data: leaderboard.rows.map(row => ({
            username: row.username,
            metricValue: row.metric_value,
            achieved_at: row.achieved_at,
            isUserScore: currentUserId ? row.id === currentUserId : false
        }))
    };
}

async function routes(fastify, options) {
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
                currentUserId: request.user.sub
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

            if (!game || !metricName || !Number.isFinite(numericMetricValue)) {
                return reply.code(400).send({ error: 'Game, metricName, and numeric metricValue are required' });
            }

            await client.query('BEGIN');

            // First, get the game_id
            const gameResult = await client.query('SELECT id FROM games WHERE name = $1', [game]);
            if (gameResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return reply.code(400).send({ error: 'Game not found' });
            }
            const gameId = gameResult.rows[0].id;

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

            const coinsAwarded = rewardRulesResult.rows.reduce((total, rule) => {
                return total + calculateRuleAward(rule, numericMetricValue);
            }, 0);

            let coinBalance = null;
            if (coinsAwarded > 0) {
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

            await client.query('COMMIT');

            return {
                data: {
                    ...scoreRow,
                    coinsAwarded,
                    coinBalance,
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
            const gameResult = await pool.query('SELECT id FROM games WHERE name = $1', [game]);
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
            const gameResult = await pool.query('SELECT id FROM games WHERE name = $1', [game]);
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
