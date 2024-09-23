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

// Declare a route
fastify.get('/calendar', async (request, reply) => {
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

    return { data: data }
})

// Run the server!
const start = async () => {
    try {
        await fastify.listen({ port: 3000 })
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start()