import calendarSheet from '../google-sheets.js';
import { getCache, setCache } from '../utils/cacheManager.js';

export default async function (fastify, options) {
    fastify.get('/calendar', async (request, reply) => {
        try {
            const cachedData = getCache('calendar');
            if (cachedData) return { data: cachedData };

            const doc = await calendarSheet();
            const sheet = doc.sheetsByIndex[0];
            await sheet.loadCells();
            await sheet.loadHeaderRow();

            const rowCount = sheet.rowCount;
            const columnCount = sheet.columnCount;
            const data = [];

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

            setCache('calendar', data);
            return { data: data };
        } catch (err) {
            console.log(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });
}