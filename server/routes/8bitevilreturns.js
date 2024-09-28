import { v4 as uuidv4 } from 'uuid';
// import pool from '../db/mockDB.js';

async function routes(fastify, options) {

    // Get user data
    fastify.get('/getUserData', async (request, reply) => {
        try {
            const { userId } = request.query;
            const query = `
                SELECT data
                FROM game_specific_data 
                WHERE user_id = $1 AND game_id = (SELECT id FROM games WHERE name = '8bitevilreturns')
                AND data_type = 'user_data'
            `;
            const result = await pool.query(query, [userId]);

            if (result.rows.length > 0) {
                return { data: result.rows[0].data };
            } else {
                reply.code(404).send({ error: 'User data not found' });
            }
        } catch (err) {
            fastify.log.error(err);
            reply.code(500).send({ error: err.message });
        }
    });

    // Set user data
    fastify.post('/setUserData', async (request, reply) => {
        const { userId, gameId, silverAmount, userName, unlockedCharacters } = request.body;

        try {
            // Insert or update game_specific_data
            const query = `
                INSERT INTO game_specific_data (user_id, game_id, data_type, data)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, game_id, data_type) 
                DO UPDATE SET data = $4, updated_at = CURRENT_TIMESTAMP
            `;

            const gameData = {
                silverAmount,
                userName,
                unlockedCharacters
            };

            await pool.query(query, [userId, gameId, 'user_data', JSON.stringify(gameData)]);

            reply.send({ data: 'success' });
        } catch (error) {
            console.error('Error in setUserData:', error);
            reply.status(500).send({ error: error.message });
        }
    });

    // Unlock character
    fastify.post('/unlockCharacter', async (request, reply) => {
        const client = await pool.connect();
        try {
            const { userId } = request.query;
            const { characterName, cost } = request.body;

            await client.query('BEGIN');

            const getUserDataQuery = `
                    SELECT data 
                    FROM game_specific_data 
                    WHERE user_id = $1 AND game_id = (SELECT id FROM games WHERE name = '8bitevilreturns')
                    AND data_type = 'user_data'
                    FOR UPDATE
                `;
            const userData = await client.query(getUserDataQuery, [userId]);

            if (userData.rows.length === 0) {
                throw new Error('User data not found');
            }

            const { unlockedCharacters = [], silverAmount } = userData.rows[0].data;

            if (!unlockedCharacters.includes(characterName)) {
                unlockedCharacters.push(characterName);
                const newSilverAmount = silverAmount - cost;

                const updateQuery = `
                    UPDATE game_specific_data
                    SET data = jsonb_set(
                        jsonb_set(data, '{unlockedCharacters}', $2::jsonb),
                        '{silverAmount}',
                        $3::jsonb
                    ),
                    updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $1 AND game_id = (SELECT id FROM games WHERE name = '8bitevilreturns')
                    AND data_type = 'user_data'
                `;
                await client.query(updateQuery, [userId, JSON.stringify(unlockedCharacters), newSilverAmount]);
            }

            await client.query('COMMIT');
            return { data: 'success' };
        } catch (err) {
            await client.query('ROLLBACK');
            fastify.log.error(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        } finally {
            client.release();
        }
    });

    // Add run data
    fastify.post('/runs', async (request, reply) => {
        try {
            const { v = '' } = request.query;
            const { runTimeSeconds, kills, candyCollected, userName, userId, itemsUsed, selectedCharacter } = request.body;

            const query = `
                INSERT INTO game_specific_data (id, user_id, game_id, data_type, data)
                VALUES ($1, $2, (SELECT id FROM games WHERE name = '8bitevilreturns'), $3, $4)
            `;
            const data = { runTimeSeconds, kills, candyCollected, userName, itemsUsed, selectedCharacter };
            await pool.query(query, [uuidv4(), userId, `run-${v}`, data]);

            // Update leaderboards
            const leaderboardMetrics = [
                { name: 'runTimeSeconds', value: runTimeSeconds },
                { name: 'kills', value: kills },
                { name: 'candyCollected', value: candyCollected }
            ];

            for (const metric of leaderboardMetrics) {
                const leaderboardQuery = `
                INSERT INTO leaderboards (id, game_id, user_id, metric_name, metric_value)
                VALUES ($1, (SELECT id FROM games WHERE name = '8bitevilreturns'), $2, $3, $4)
                ON CONFLICT (game_id, user_id, metric_name)
                DO UPDATE SET metric_value = EXCLUDED.metric_value, achieved_at = CURRENT_TIMESTAMP
                WHERE leaderboards.metric_value < EXCLUDED.metric_value
                `;
                await pool.query(leaderboardQuery, [uuidv4(), userId, metric.name, metric.value]);
            }

            return { data: 'success' };
        } catch (err) {
            fastify.log.error(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });

    // Get leaderboard
    fastify.get('/getLeaderBoard', async (request, reply) => {
        try {
            const { field, v = '' } = request.query;

            const query = `
                SELECT l.metric_value, u.username, gsd.data->>'selectedCharacter' as selectedCharacter
                FROM leaderboards l
                JOIN users u ON l.user_id = u.id
                LEFT JOIN game_specific_data gsd ON l.user_id = gsd.user_id AND gsd.data_type = $1
                WHERE l.game_id = (SELECT id FROM games WHERE name = '8bitevilreturns')
                AND l.metric_name = $2
                ORDER BY l.metric_value DESC
                LIMIT 15
            `;
            const result = await pool.query(query, [`run-${v}`, field]);

            return { data: result.rows };
        } catch (err) {
            fastify.log.error(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });
}

export default routes;
