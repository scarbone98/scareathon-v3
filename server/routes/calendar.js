import calendarSheet from '../db/google-sheets.js';
import { getCache, setCache } from '../utils/cacheManager.js';
import { enrichMovieData } from '../utils/tmdb.js';

export default async function (fastify, options) {
    fastify.get('/calendar', async (request, reply) => {
        try {
            // Check if calendar data is cached
            const cacheKey = 'calendar';
            const cachedData = getCache(cacheKey);

            if (cachedData) {
                return { data: cachedData };
            }

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

            // Cache for 1 hour
            setCache(cacheKey, data, 60 * 60 * 1000);

            return { data: data };
        } catch (err) {
            const cachedData = getCache('calendar');
            if (cachedData) return { data: cachedData };

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
                setCache(calendarCacheKey, data, 60 * 60 * 1000);
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

            // Cache the enriched day data for 30 minutes
            setCache(dayCacheKey, enrichedMovie, 30 * 60 * 1000);

            return { data: enrichedMovie };
        } catch (err) {
            console.log(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });
}