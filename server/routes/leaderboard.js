import calendarSheet from '../db/google-sheets.js';
import { getCache, getStaleCache, setCache } from '../utils/cacheManager.js';

const LEADERBOARD_TTL = 24 * 60 * 60 * 1000;
const CLIENT_CACHE_SECONDS = 24 * 60 * 60;
const EVENT_MONTH_INDEX = 9;
const LEADERBOARD_KEYS = ['name', 'movies', 'weekly', 'bonus', 'total'];
const WINNER_KEYS = ['year', 'name'];

function setReadCacheHeaders(reply) {
    reply.header('Cache-Control', `private, max-age=${CLIENT_CACHE_SECONDS}, stale-while-revalidate=60`);
}

function getLeaderboardCutoffYear(date = new Date()) {
    const currentYear = date.getFullYear();
    return date.getMonth() >= EVENT_MONTH_INDEX ? currentYear : currentYear - 1;
}

function isLiveEventOpen(date = new Date()) {
    return date.getMonth() >= EVENT_MONTH_INDEX;
}

function normalizeYear(value) {
    const year = Number.parseInt(value, 10);
    return Number.isFinite(year) ? year : null;
}

function readWinnerRows(rows, cutoffYear = getLeaderboardCutoffYear()) {
    return rows
        .map(row => {
            const pastWinnerObject = {};
            WINNER_KEYS.forEach(key => {
                pastWinnerObject[key] = row.get(key);
            });
            return pastWinnerObject;
        })
        .filter(winner => {
            const year = normalizeYear(winner.year);
            return year !== null && year <= cutoffYear;
        });
}

function getWinnerYears(pastWinners) {
    return [...new Set(
        pastWinners
            .map(winner => normalizeYear(winner.year))
            .filter(year => year !== null)
    )].sort((a, b) => b - a);
}

function getSheetYears(doc) {
    const years = doc.sheetsByIndex
        .map(sheet => {
            const match = sheet.title.match(/^Users-(\d{4})$/);
            return match ? normalizeYear(match[1]) : null;
        })
        .filter(year => year !== null);

    if (doc.sheetsByTitle['Users-old'] && !years.includes(2021)) {
        years.push(2021);
    }

    return [...new Set(years)].sort((a, b) => b - a);
}

function getSheetCandidates(year, { allowLiveUsersSheet = false } = {}) {
    const candidates = [`Users-${year}`];

    if (allowLiveUsersSheet) {
        candidates.unshift('Users');
    }

    if (year <= 2021) {
        candidates.push('Users-old');
    }

    return candidates;
}

function findLeaderboardSheet(doc, requestedYear, pastWinners, date = new Date()) {
    const liveYear = date.getFullYear();
    const allowLiveUsersSheet = isLiveEventOpen(date) && requestedYear === liveYear;
    const requestedCandidates = getSheetCandidates(requestedYear, { allowLiveUsersSheet });

    for (const title of requestedCandidates) {
        if (doc.sheetsByTitle[title]) {
            return { sheet: doc.sheetsByTitle[title], year: requestedYear, sheetTitle: title };
        }
    }

    const fallbackYears = [
        ...new Set([...getSheetYears(doc), ...getWinnerYears(pastWinners)])
    ].sort((a, b) => b - a);

    for (const year of fallbackYears) {
        for (const title of getSheetCandidates(year)) {
            if (doc.sheetsByTitle[title]) {
                return { sheet: doc.sheetsByTitle[title], year, sheetTitle: title };
            }
        }
    }

    return null;
}

function getAvailableLeaderboardYears(doc, pastWinners, date = new Date()) {
    const years = [];
    const liveYear = date.getFullYear();
    const cutoffYear = getLeaderboardCutoffYear(date);

    if (isLiveEventOpen(date) && doc.sheetsByTitle['Users']) {
        years.push(liveYear);
    }

    const candidateYears = [
        ...new Set([...getSheetYears(doc), ...getWinnerYears(pastWinners)])
    ].sort((a, b) => b - a);

    for (const year of candidateYears) {
        if (year > cutoffYear) continue;

        const hasSheet = getSheetCandidates(year).some(title => doc.sheetsByTitle[title]);
        if (hasSheet && !years.includes(year)) {
            years.push(year);
        }
    }

    return years;
}

function readLeaderboardRows(rows) {
    const users = rows.map(row => {
        const userObject = {};
        LEADERBOARD_KEYS.forEach(key => {
            userObject[key] = row.get(key);
        });
        return userObject;
    });

    users.sort((a, b) => Number(b.total || 0) - Number(a.total || 0));

    let rank = 1;
    users.forEach((user, index) => {
        if (index > 0 && Number(users[index - 1].total || 0) !== Number(user.total || 0)) {
            rank++;
        }
        user.rank = rank;
    });

    return users;
}

export async function getLeaderboardPayload({ requestedYear, date = new Date() } = {}) {
    const cutoffYear = getLeaderboardCutoffYear(date);
    const targetYear = requestedYear || cutoffYear;
    const cacheKey = `leaderboard_${targetYear}_${cutoffYear}`;
    const cachedData = getCache(cacheKey);
    if (cachedData) {
        return cachedData;
    }

    try {
        const doc = await calendarSheet();
        const winnerSheet = doc.sheetsByTitle['Winners'];
        const winnerRows = winnerSheet ? await winnerSheet.getRows() : [];
        const pastWinners = readWinnerRows(winnerRows, cutoffYear);
        const selection = findLeaderboardSheet(doc, targetYear, pastWinners, date);
        const availableYears = getAvailableLeaderboardYears(doc, pastWinners, date);

        if (!selection) {
            const error = new Error('No leaderboard sheet found for a completed Scareathon year');
            error.statusCode = 404;
            throw error;
        }

        const rows = await selection.sheet.getRows();
        const users = readLeaderboardRows(rows);
        const response = {
            data: users,
            meta: {
                year: selection.year,
                sheetTitle: selection.sheetTitle,
                isLive: selection.sheetTitle === 'Users' && isLiveEventOpen(date),
                availableYears
            }
        };

        setCache(cacheKey, response, LEADERBOARD_TTL);
        return response;
    } catch (err) {
        const staleData = getStaleCache(cacheKey);
        if (staleData) {
            return staleData;
        }

        throw err;
    }
}

export default async function (fastify, options) {
    fastify.get('/leaderboard', async (request, reply) => {
        const requestedYear = normalizeYear(request.query?.year);
        try {
            const response = await getLeaderboardPayload({ requestedYear });
            setReadCacheHeaders(reply);
            return response;
        } catch (err) {
            if (err.statusCode === 404) {
                return reply.code(404).send({ error: err.message });
            }

            console.log(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });

    fastify.get('/past-winners', async (request, reply) => {
        const cutoffYear = getLeaderboardCutoffYear();
        const cacheKey = `pastWinners_${cutoffYear}`;
        const cachedData = getCache(cacheKey);
        if (cachedData) {
            setReadCacheHeaders(reply);
            return { data: cachedData };
        }

        try {
            const doc = await calendarSheet();
            const sheet = doc.sheetsByTitle['Winners'];
            const rows = await sheet.getRows();
            const pastWinners = readWinnerRows(rows, cutoffYear);

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
