import calendarSheet from '../db/google-sheets.js';
import { getCache, setCache } from '../utils/cacheManager.js';

export default async function (fastify, options) {
    fastify.get('/leaderboard', async (request, reply) => {
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

            setCache('leaderboard', users);
            return { data: users };
        } catch (err) {
            const cachedData = getCache('leaderboard');
            if (cachedData) return { data: cachedData };

            console.log(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });

    fastify.get('/past-winners', async (request, reply) => {
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

            setCache('pastWinners', pastWinners);
            return { data: pastWinners };
        } catch (err) {
            const cachedData = getCache('pastWinners');
            if (cachedData) return { data: cachedData };

            console.log(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });
}