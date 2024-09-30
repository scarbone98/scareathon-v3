import pool from '../db/mockDB.js';

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

            const leaderboard = await pool.query(`
                SELECT u.email, l.metric_value, l.achieved_at
                FROM leaderboards l
                JOIN games g ON l.game_id = g.id
                JOIN users u ON l.user_id = u.id
                WHERE g.name = $1 AND l.metric_name = $2
                ORDER BY l.metric_value DESC
                LIMIT $3
            `, [game, metric, limit]);

            return { data: leaderboard.rows };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: error.message });
        }
    });

    fastify.post('/submitScore', async (request, reply) => {
        try {
            const userId = request.user.id;
            const { game, metricName, metricValue } = request.body;

            // First, get the game_id
            const gameResult = await pool.query('SELECT id FROM games WHERE name = $1', [game]);
            if (gameResult.rows.length === 0) {
                return reply.code(404).send({ error: 'Game not found' });
            }
            const gameId = gameResult.rows[0].id;

            // Insert a new leaderboard entry
            const result = await pool.query(`
                INSERT INTO leaderboards (game_id, user_id, metric_name, metric_value)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `, [gameId, userId, metricName, metricValue]);

            return { data: result.rows[0] };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: error.message });
        }
    });

    fastify.get('/getGameSpecificData', async (request, reply) => {
        try {
            const userId = request.user.id;
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
            const userId = request.user.id;
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
