import calendarSheet from '../db/google-sheets.js';
import { getCache, getStaleCache, setCache } from '../utils/cacheManager.js';

const LEADERBOARD_TTL = 5 * 60 * 1000;
const CLIENT_CACHE_SECONDS = 5 * 60;

function setReadCacheHeaders(reply) {
    reply.header('Cache-Control', `private, max-age=${CLIENT_CACHE_SECONDS}, stale-while-revalidate=60`);
}

export default async function (fastify, options) {
    fastify.get('/leaderboard', async (request, reply) => {
        const cacheKey = 'leaderboard';
        const cachedData = getCache(cacheKey);
        if (cachedData) {
            setReadCacheHeaders(reply);
            return { data: cachedData };
        }

        try {
            const doc = await calendarSheet();
            const sheet = doc.sheetsByTitle['Users'];
            const rows = await sheet.getRows();
            const keys = ['name', 'movies', 'weekly', 'bonus', 'total'];

            const users = rows.map(row => {
                const userObject = {};
                keys.forEach(key => {
                    userObject[key] = row.get(key);
                });
                return userObject;
            });

            users.sort((a, b) => b.total - a.total);

            let rank = 1;
            users.forEach((user, index) => {
                if (index > 0 && users[index - 1].total !== user.total) {
                    rank++;
                }
                user.rank = rank;
            });

            setCache(cacheKey, users, LEADERBOARD_TTL);
            setReadCacheHeaders(reply);
            return { data: users };
        } catch (err) {
            const staleData = getStaleCache(cacheKey);
            if (staleData) {
                setReadCacheHeaders(reply);
                return { data: staleData };
            }

            console.log(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });

    fastify.get('/past-winners', async (request, reply) => {
        const cacheKey = 'pastWinners';
        const cachedData = getCache(cacheKey);
        if (cachedData) {
            setReadCacheHeaders(reply);
            return { data: cachedData };
        }

        try {
            const doc = await calendarSheet();
            const sheet = doc.sheetsByTitle['Winners'];
            const rows = await sheet.getRows();
            const keys = ['year', 'name'];

            const pastWinners = rows.map(row => {
                const pastWinnerObject = {};
                keys.forEach(key => {
                    pastWinnerObject[key] = row.get(key);
                });
                return pastWinnerObject;
            });

            setCache(cacheKey, pastWinners, LEADERBOARD_TTL);
            setReadCacheHeaders(reply);
            return { data: pastWinners };
        } catch (err) {
            const staleData = getStaleCache(cacheKey);
            if (staleData) {
                setReadCacheHeaders(reply);
                return { data: staleData };
            }

            console.log(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });
}
