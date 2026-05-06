import calendarSheet from '../db/google-sheets.js';
import { getCache, getStaleCache, setCache } from '../utils/cacheManager.js';
import { enrichMovieData } from '../utils/tmdb.js';

const CALENDAR_TTL = 60 * 60 * 1000;
const CALENDAR_DAY_TTL = 30 * 60 * 1000;

function setReadCacheHeaders(reply, seconds) {
    reply.header('Cache-Control', `private, max-age=${seconds}, stale-while-revalidate=60`);
}

export default async function (fastify, options) {
    fastify.get('/calendar', async (request, reply) => {
        const cacheKey = 'calendar';
        const cachedData = getCache(cacheKey);
        if (cachedData) {
            setReadCacheHeaders(reply, CALENDAR_TTL / 1000);
            return { data: cachedData };
        }

        try {
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

            setCache(cacheKey, data, CALENDAR_TTL);
            setReadCacheHeaders(reply, CALENDAR_TTL / 1000);

            return { data: data };
        } catch (err) {
            const staleData = getStaleCache(cacheKey);
            if (staleData) {
                setReadCacheHeaders(reply, CALENDAR_TTL / 1000);
                return { data: staleData };
            }

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
            const cachedDayData = getCache(dayCacheKey);

            if (cachedDayData) {
                setReadCacheHeaders(reply, CALENDAR_DAY_TTL / 1000);
                return { data: cachedDayData };
            }

            // Get calendar data (basic, no enrichment)
            let calendarData;
            const calendarCacheKey = 'calendar';
            const cachedCalendar = getCache(calendarCacheKey);

            if (cachedCalendar) {
                calendarData = cachedCalendar;
            } else {
                // Load fresh data if not cached
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

                calendarData = data;
                setCache(calendarCacheKey, data, CALENDAR_TTL);
            }

            // Find the movie for the specific day
            // Assuming day 1 is at index 1 (index 0 is header)
            const dayMovie = calendarData[day];

            if (!dayMovie || !dayMovie.title) {
                return reply.code(404).send({ error: `No movie found for day ${day}` });
            }

            // Enrich this single movie with TMDB data
            let enrichedMovie;
            try {
                const tmdbData = await enrichMovieData(dayMovie.title);
                enrichedMovie = {
                    ...dayMovie,
                    ...tmdbData
                };
            } catch (error) {
                console.error(`Failed to enrich "${dayMovie.title}":`, error);
                enrichedMovie = dayMovie; // Return original data if enrichment fails
            }

            setCache(dayCacheKey, enrichedMovie, CALENDAR_DAY_TTL);
            setReadCacheHeaders(reply, CALENDAR_DAY_TTL / 1000);

            return { data: enrichedMovie };
        } catch (err) {
            const staleDayData = getStaleCache(`calendar_day_enriched_${request.params.day}`);
            if (staleDayData) {
                setReadCacheHeaders(reply, CALENDAR_DAY_TTL / 1000);
                return { data: staleDayData };
            }

            console.log(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });
}
