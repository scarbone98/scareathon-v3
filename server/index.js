import dotenv from 'dotenv';
dotenv.config();
import Fastify from 'fastify'
// import pool from './mockDB.js'
import cors from '@fastify/cors'
import fastifyJwt from '@fastify/jwt';
import calendarSheet from './google-sheets.js';

const fastify = Fastify({
    logger: true
})

await fastify.register(cors, {
    // put your options here
})

fastify.register(fastifyJwt, {
    secret: process.env.SUPABASE_JWT_SECRET
})


fastify.addHook('preValidation', async (request, reply) => {
    try {
        await request.jwtVerify();
    } catch (err) {
        console.log(err);
        return reply.code(401).send({ error: 'Unauthorized' });
    }
});

let calendarCache = null;
// Declare a route
fastify.get('/calendar', async (request, reply) => {
    try {
        const doc = await calendarSheet();
        const sheet = doc.sheetsByIndex[0];
        await sheet.loadCells(); // Load all cells in the sheet
        await sheet.loadHeaderRow();

        const rowCount = sheet.rowCount;
        const columnCount = sheet.columnCount;
        const data = [];

        // Iterate through all cells with data
        for (let row = 0; row < rowCount; row++) {
            const rowData = {};
            let hasData = false;
            for (let col = 0; col < columnCount; col++) {
                const cell = sheet.getCell(row, col);
                if (cell.value !== null) {
                    rowData[sheet.headerValues[col]] = cell.value;
                    hasData = true;
                }
            }
            if (!hasData) break;
            data.push(rowData);
        }

        calendarCache = data;
        return { data: data }
    } catch (err) {
        if (calendarCache) {
            return { data: calendarCache };
        }
        console.log(err);
        reply.code(500).send({ error: 'An error has occurred with our database' });
    }
})

fastify.get('/posts', async (request, reply) => {
    try {
        const response = await fetch(`${process.env.STRAPI_URL}/api/posts?populate=*`, {
            headers: {
                'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
            }
        });
        const data = await response.json();
        return data;
    } catch (error) {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Internal Server Error' });
    }
});


let leaderboardCache = null;
fastify.get('/leaderboard', async (request, reply) => {
    try {
        const users = [];

        const doc = await calendarSheet();
        const sheet = doc.sheetsByTitle['Users']; // or use doc.sheetsById[id] or doc.sheetsByTitle[title]

        const rows = await sheet.getRows();
        const keys = ['name', 'movies', 'primetime', 'combo', 'bonus', 'total'];

        rows.forEach(row => {
            const userObject = {};
            keys.forEach(key => {
                userObject[key] = row.get(key);
            });
            users.push(userObject);
        });

        leaderboardCache = users;
        return { data: users };

    } catch (err) {
        if (leaderboardCache) {
            return { data: leaderboardCache };
        }
        console.log(err);
        reply.code(500).send({ error: 'An error has occurred with our database' });
    }
});

let pastWinnersCache = null;
fastify.get('/past-winners', async (request, reply) => {
    try {
        const doc = await calendarSheet();
        const sheet = doc.sheetsByTitle['Winners'];
        const rows = await sheet.getRows();
        const keys = ['year', 'name'];

        const pastWinners = [];

        rows.forEach(row => {
            const pastWinnerObject = {};
            keys.forEach(key => {
                pastWinnerObject[key] = row.get(key);
            });
            pastWinners.push(pastWinnerObject);
        });

        pastWinnersCache = pastWinners;
        return { data: pastWinners };
    } catch (err) {
        if (pastWinnersCache) {
            return { data: pastWinnersCache };
        }
        console.log(err);
        reply.code(500).send({ error: 'An error has occurred with our database' });
    }
});


// Run the server!
const start = async () => {
    try {
        await fastify.listen({ port: 3000, host: '0.0.0.0' })
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start()