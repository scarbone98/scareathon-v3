import pool from '../db/mockDB.js';

const GAME_NAME = '8 Bit Evil Returns';
const LEGACY_GAME_NAME = '8bitevilreturns';
const PLAYER_DATA_TYPE = 'playerData';
const DEFAULT_PLAYER_DATA = {
    userName: 'Guest',
    silverAmount: 0,
    unlockedCharacters: [],
};
const RUN_LIMITS = {
    runTimeSeconds: { min: 0, max: 86400 },
    kills: { min: 0, max: 100000 },
    candyCollected: { min: 0, max: 100000 },
};

function isUuid(value) {
    return typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseInteger(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSubmittedInteger(value) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) ? value : NaN;
    }

    if (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) {
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) ? parsed : NaN;
    }

    return NaN;
}

function validateRunMetric(name, value) {
    const limits = RUN_LIMITS[name];
    return Number.isInteger(value) && value >= limits.min && value <= limits.max;
}

function normalizePlayerData(data = {}, fallbackUserName = DEFAULT_PLAYER_DATA.userName) {
    return {
        ...DEFAULT_PLAYER_DATA,
        ...data,
        userName: data.userName || fallbackUserName || DEFAULT_PLAYER_DATA.userName,
        silverAmount: parseInteger(data.silverAmount, DEFAULT_PLAYER_DATA.silverAmount),
        unlockedCharacters: Array.isArray(data.unlockedCharacters) ? data.unlockedCharacters : [],
    };
}

function filterPlayerData(data = {}) {
    const filteredData = {};

    if (Object.prototype.hasOwnProperty.call(data, 'silverAmount')) {
        filteredData.silverAmount = parseInteger(data.silverAmount);
    }

    if (typeof data.userName === 'string' && data.userName.trim()) {
        filteredData.userName = data.userName.trim();
    }

    if (Array.isArray(data.unlockedCharacters)) {
        filteredData.unlockedCharacters = data.unlockedCharacters.filter((character) => (
            typeof character === 'string' && character.trim()
        ));
    }

    return filteredData;
}

async function getGameId(client = pool) {
    const existingGame = await client.query(
        'SELECT id FROM games WHERE name = $1 OR name = $2 ORDER BY id ASC LIMIT 1',
        [GAME_NAME, LEGACY_GAME_NAME]
    );

    if (existingGame.rows.length > 0) {
        return existingGame.rows[0].id;
    }

    const createdGame = await client.query(`
        INSERT INTO games (name, description, is_active)
        VALUES ($1, $2, TRUE)
        RETURNING id
    `, [GAME_NAME, 'Arcade survival game']);

    return createdGame.rows[0].id;
}

async function getUserName(userId, client = pool) {
    const result = await client.query('SELECT username FROM users WHERE id = $1 LIMIT 1', [userId]);
    return result.rows[0]?.username || DEFAULT_PLAYER_DATA.userName;
}

async function getStoredPlayerData(userId, gameId, client = pool) {
    const result = await client.query(`
        SELECT data
        FROM game_specific_data
        WHERE user_id = $1 AND game_id = $2 AND data_type = $3
    `, [userId, gameId, PLAYER_DATA_TYPE]);

    return result.rows[0]?.data || {};
}

async function upsertPlayerData(userId, gameId, playerData, client = pool) {
    const result = await client.query(`
        INSERT INTO game_specific_data (user_id, game_id, data_type, data)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (user_id, game_id, data_type)
        DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP
        RETURNING data
    `, [userId, gameId, PLAYER_DATA_TYPE, JSON.stringify(playerData)]);

    return result.rows[0].data;
}

async function insertLeaderboardMetric(client, gameId, userId, metricName, metricValue) {
    if (!Number.isFinite(metricValue)) return;

    await client.query(`
        INSERT INTO leaderboards (game_id, user_id, metric_name, metric_value)
        VALUES ($1, $2, $3, $4)
    `, [gameId, userId, metricName, metricValue]);
}

export default async function (fastify, options) {
    fastify.get('/getUserData', async (request, reply) => {
        try {
            const { userId } = request.query;

            if (!isUuid(userId)) {
                return reply.code(400).send({ error: 'Valid userId is required' });
            }

            const gameId = await getGameId();
            const userName = await getUserName(userId);
            const storedData = await getStoredPlayerData(userId, gameId);

            return normalizePlayerData(storedData, userName);
        } catch (err) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });

    fastify.post('/setUserData', async (request, reply) => {
        try {
            const userId = request.body?.userId || request.query?.userId;

            if (!isUuid(userId)) {
                return reply.code(400).send({ error: 'Valid userId is required' });
            }

            const gameId = await getGameId();
            const userName = await getUserName(userId);
            const currentData = normalizePlayerData(await getStoredPlayerData(userId, gameId), userName);
            const updatedData = normalizePlayerData({
                ...currentData,
                ...filterPlayerData(request.body),
            }, userName);

            await upsertPlayerData(userId, gameId, updatedData);

            return { data: 'success' };
        } catch (err) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });

    fastify.post('/unlockCharacter', async (request, reply) => {
        const client = await pool.connect();

        try {
            const userId = request.query?.userId || request.body?.userId;
            const { characterName } = request.body || {};
            const cost = parseInteger(request.body?.cost);

            if (!isUuid(userId)) {
                return reply.code(400).send({ error: 'Valid userId is required' });
            }

            if (typeof characterName !== 'string' || !characterName.trim()) {
                return reply.code(400).send({ error: 'characterName is required' });
            }

            await client.query('BEGIN');

            const gameId = await getGameId(client);
            const userName = await getUserName(userId, client);
            const currentData = normalizePlayerData(await getStoredPlayerData(userId, gameId, client), userName);
            const unlockedCharacters = new Set(currentData.unlockedCharacters);

            if (!unlockedCharacters.has(characterName)) {
                if (currentData.silverAmount < cost) {
                    await client.query('ROLLBACK');
                    return reply.code(400).send({ error: 'Not enough silver' });
                }

                unlockedCharacters.add(characterName);
                currentData.unlockedCharacters = [...unlockedCharacters];
                currentData.silverAmount -= cost;
            }

            const updatedData = await upsertPlayerData(userId, gameId, currentData, client);

            await client.query('COMMIT');

            return { data: 'success', playerData: updatedData };
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            fastify.log.error(err);
            return reply.code(500).send({ error: 'An error has occurred with our database' });
        } finally {
            client.release();
        }
    });

    fastify.post('/runs', async (request, reply) => {
        const client = await pool.connect();

        try {
            const data = request.body || {};
            const userId = request.user?.sub;

            if (!isUuid(userId)) {
                return reply.code(401).send({ error: 'Authenticated user is required' });
            }

            const runTimeSeconds = parseSubmittedInteger(data.runTimeSeconds);
            const kills = parseSubmittedInteger(data.kills);
            const candyCollected = parseSubmittedInteger(data.candyCollected);

            if (
                !validateRunMetric('runTimeSeconds', runTimeSeconds) ||
                !validateRunMetric('kills', kills) ||
                !validateRunMetric('candyCollected', candyCollected)
            ) {
                return reply.code(400).send({ error: 'Run metrics are outside the allowed range' });
            }

            await client.query('BEGIN');
            const gameId = await getGameId(client);

            await insertLeaderboardMetric(client, gameId, userId, 'score', runTimeSeconds);
            await insertLeaderboardMetric(client, gameId, userId, 'runTimeSeconds', runTimeSeconds);
            await insertLeaderboardMetric(client, gameId, userId, 'kills', kills);
            await insertLeaderboardMetric(client, gameId, userId, 'candyCollected', candyCollected);

            await client.query('COMMIT');

            return { data: 'success' };
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            fastify.log.error(err);
            return reply.code(500).send({ error: 'An error has occurred with our database' });
        } finally {
            client.release();
        }
    });

    fastify.get('/getLeaderBoard', async (request, reply) => {
        try {
            const { field = 'runTimeSeconds' } = request.query;
            const validFields = ['runTimeSeconds', 'kills', 'candyCollected'];

            if (!validFields.includes(field)) {
                return reply.code(400).send({ error: 'Invalid field parameter' });
            }

            const gameId = await getGameId();
            const metricNames = field === 'runTimeSeconds' ? ['runTimeSeconds', 'score'] : [field];
            const leaderBoardResult = await pool.query(`
                SELECT u.username, l.metric_value
                FROM leaderboards l
                JOIN users u ON u.id = l.user_id
                WHERE l.game_id = $1 AND l.metric_name = ANY($2)
                ORDER BY l.metric_value DESC, l.achieved_at ASC
                LIMIT 15
            `, [gameId, metricNames]);

            return {
                data: leaderBoardResult.rows.map((row) => ({
                    userName: row.username || DEFAULT_PLAYER_DATA.userName,
                    runTimeSeconds: field === 'runTimeSeconds' ? Number(row.metric_value) : 0,
                    kills: field === 'kills' ? Number(row.metric_value) : 0,
                    candyCollected: field === 'candyCollected' ? Number(row.metric_value) : 0,
                })),
            };
        } catch (err) {
            fastify.log.error(err);
            return reply.code(500).send({ error: 'An error occurred with our database' });
        }
    });
}
