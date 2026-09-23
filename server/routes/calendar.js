import calendarSheet from '../db/google-sheets.js';
import { getOrRefreshCache } from '../utils/cacheManager.js';
import { enrichMovieData } from '../utils/tmdb.js';

const CALENDAR_TTL = 60 * 60 * 1000;
const CALENDAR_DAY_TTL = 30 * 60 * 1000;

function setReadCacheHeaders(reply, seconds) {
    reply.header('Cache-Control', `private, max-age=${seconds}, stale-while-revalidate=60`);
}

async function loadCalendarData() {
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

    return data;
}

export default async function (fastify, options) {
    fastify.get('/calendar', async (request, reply) => {
        const cacheKey = 'calendar';

        try {
            const data = await getOrRefreshCache(cacheKey, loadCalendarData, CALENDAR_TTL);
            setReadCacheHeaders(reply, CALENDAR_TTL / 1000);

            return { data: data };
        } catch (err) {
            console.log(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });

    fastify.get('/calendar/:day', async (request, reply) => {
        try {
            const day = parseInt(request.params.day);

            if (isNaN(day) || day < 1 || day > 31) {
                return reply.code(400).send({ error: 'Day must be a number between 1 and 31' });
            }

            // Check if specific day data is cached (with enrichment)
            const dayCacheKey = `calendar_day_enriched_${day}`;
            const enrichedMovie = await getOrRefreshCache(dayCacheKey, async () => {
                const calendarData = await getOrRefreshCache('calendar', loadCalendarData, CALENDAR_TTL);
                const dayMovie = calendarData[day];

                if (!dayMovie || !dayMovie.title) {
                    const error = new Error(`No movie found for day ${day}`);
                    error.statusCode = 404;
                    throw error;
                }

                try {
                    const tmdbData = await enrichMovieData(dayMovie.title);
                    return {
                        ...dayMovie,
                        ...tmdbData
                    };
                } catch (error) {
                    console.error(`Failed to enrich "${dayMovie.title}":`, error);
                    return dayMovie;
                }
            }, CALENDAR_DAY_TTL);

            setReadCacheHeaders(reply, CALENDAR_DAY_TTL / 1000);

            return { data: enrichedMovie };
        } catch (err) {
            if (err.statusCode === 404) {
                return reply.code(404).send({ error: err.message });
            }

            console.log(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });
}
