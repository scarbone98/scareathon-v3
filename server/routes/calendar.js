import calendarSheet from '../db/google-sheets.js';
import { getOrRefreshCache } from '../utils/cacheManager.js';
import { enrichMovieData } from '../utils/tmdb.js';

const CALENDAR_TTL = 60 * 60 * 1000;
const CALENDAR_DAY_TTL = 30 * 60 * 1000;
const getCalendarYear = () => Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric'
}).format(new Date()));

function setReadCacheHeaders(reply, seconds) {
    reply.header('Cache-Control', `private, max-age=${seconds}, stale-while-revalidate=60`);
}

export async function loadCalendarData(year = getCalendarYear()) {
    const sheetTitle = `Calendar-${year}`;
    const doc = await calendarSheet();
    const sheet = doc?.sheetsByTitle[sheetTitle];
    if (!sheet) {
        throw new Error(`Google spreadsheet is missing the ${sheetTitle} tab`);
    }

    const rows = await sheet.getRows();
    const data = Array(32).fill(null);
    for (const row of rows) {
        const day = Number(row.get('day'));
        const title = row.get('title')?.trim();
        if (!Number.isInteger(day) || day < 1 || day > 31 || !title || data[day]) {
            throw new Error(`Invalid or duplicate day in ${sheetTitle}: ${row.get('day')}`);
        }
        data[day] = {
            day,
            title,
            lowResUrl: row.get('lowResUrl') || '',
            theme: row.get('theme') || '',
            releaseYear: row.get('releaseYear') || '',
            notes: row.get('notes') || ''
        };
    }
    if (data.slice(1).some(day => !day)) {
        throw new Error(`${sheetTitle} must contain one movie for every day in October`);
    }
    return data;
}

export default async function (fastify, options) {
    fastify.get('/calendar', async (request, reply) => {
        const year = getCalendarYear();
        const cacheKey = `calendar_${year}`;

        try {
            const data = await getOrRefreshCache(cacheKey, () => loadCalendarData(year), CALENDAR_TTL);
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
            const year = getCalendarYear();

            if (isNaN(day) || day < 1 || day > 31) {
                return reply.code(400).send({ error: 'Day must be a number between 1 and 31' });
            }

            // Check if specific day data is cached (with enrichment)
            const dayCacheKey = `calendar_${year}_day_enriched_${day}`;
            const enrichedMovie = await getOrRefreshCache(dayCacheKey, async () => {
                const calendarData = await getOrRefreshCache(`calendar_${year}`, () => loadCalendarData(year), CALENDAR_TTL);
                const dayMovie = calendarData[day];

                if (!dayMovie || !dayMovie.title) {
                    const error = new Error(`No movie found for day ${day}`);
                    error.statusCode = 404;
                    throw error;
                }

                try {
                    const tmdbData = await enrichMovieData(dayMovie.title, dayMovie.releaseYear);
                    return {
                        ...dayMovie,
                        ...tmdbData,
                        lowResUrl: dayMovie.lowResUrl || (tmdbData.posterPath
                            ? `https://image.tmdb.org/t/p/w342${tmdbData.posterPath}`
                            : '')
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
