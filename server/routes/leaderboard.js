import pool from '../db/mockDB.js';
import { getOrRefreshCache } from '../utils/cacheManager.js';
import { FIRST_ACCOUNT_SEASON } from '../utils/scareathon.js';

// The Scareboard. Seasons from FIRST_ACCOUNT_SEASON on are worked out from player accounts
// (movies marked watched + the points ledger); earlier seasons are the sheet-era standings
// copied into scareathon_history.

const HISTORY_TTL = 24 * 60 * 60 * 1000;
// Live standings change whenever someone marks a movie; writes clear this cache too
const ACCOUNT_SEASON_TTL = 60 * 1000;
const EVENT_MONTH_INDEX = 9;
const PRESEASON_MONTH_INDEX = 8;

function setReadCacheHeaders(reply) {
    reply.header('Cache-Control', 'private, no-store');
}

function getLeaderboardCutoffYear(date = new Date()) {
    const currentYear = date.getFullYear();
    return date.getMonth() >= PRESEASON_MONTH_INDEX ? currentYear : currentYear - 1;
}

function isLiveEventOpen(date = new Date()) {
    return date.getMonth() === EVENT_MONTH_INDEX;
}

function getWinnerCutoffYear(date = new Date()) {
    return date.getMonth() >= EVENT_MONTH_INDEX ? date.getFullYear() : date.getFullYear() - 1;
}

// An account season has a champion once its October is over
function isSeasonFinished(season, date = new Date()) {
    return season < date.getFullYear() || (season === date.getFullYear() && date.getMonth() > EVENT_MONTH_INDEX);
}

function normalizeYear(value) {
    const year = Number.parseInt(value, 10);
    return Number.isFinite(year) ? year : null;
}

function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function rankStandings(users) {
    users.sort((a, b) => Number(b.total || 0) - Number(a.total || 0) || String(a.name).localeCompare(String(b.name)));

    let rank = 1;
    users.forEach((user, index) => {
        if (index > 0 && Number(users[index - 1].total || 0) !== Number(user.total || 0)) {
            rank++;
        }
        user.rank = rank;
    });

    return users;
}

async function getHistorySeasons(db) {
    return getOrRefreshCache('leaderboard_history_seasons', async () => {
        const result = await db.query('SELECT DISTINCT season FROM scareathon_history ORDER BY season DESC');
        return result.rows.map(row => Number(row.season));
    }, HISTORY_TTL);
}

async function getHistoryStandings(db, season) {
    return getOrRefreshCache(`leaderboard_history_${season}`, async () => {
        const result = await db.query(`
            SELECT name, movies, weekly, bonus, total
            FROM scareathon_history
            WHERE season = $1
        `, [season]);
        return rankStandings(result.rows.map(row => ({
            name: row.name,
            movies: toNumber(row.movies),
            weekly: toNumber(row.weekly),
            bonus: toNumber(row.bonus),
            total: toNumber(row.total),
        })));
    }, HISTORY_TTL);
}

export async function getAccountStandings(db, season) {
    return getOrRefreshCache(`leaderboard_accounts_${season}`, async () => {
        const result = await db.query(`
            WITH tallies AS (
                SELECT user_id, count(*)::int AS movies, 0 AS weekly, 0 AS bonus
                FROM scareathon_watches
                WHERE season = $1
                GROUP BY user_id
                UNION ALL
                SELECT user_id,
                    COALESCE(sum(points) FILTER (WHERE category = 'movies'), 0)::int,
                    COALESCE(sum(points) FILTER (WHERE category = 'weekly'), 0)::int,
                    COALESCE(sum(points) FILTER (WHERE category = 'bonus'), 0)::int
                FROM scareathon_points
                WHERE season = $1
                GROUP BY user_id
            )
            SELECT u.id AS user_id, u.username,
                sum(t.movies)::int AS movies,
                sum(t.weekly)::int AS weekly,
                sum(t.bonus)::int AS bonus
            FROM tallies t
            JOIN users u ON u.id = t.user_id
            GROUP BY u.id, u.username
        `, [season]);

        return rankStandings(result.rows
            .map(row => {
                const movies = Number(row.movies) || 0;
                const weekly = Number(row.weekly) || 0;
                const bonus = Number(row.bonus) || 0;
                // (the id, so the board can show each player's avatar)
                return { name: row.username || 'Someone', userId: row.user_id, movies, weekly, bonus, total: movies + weekly + bonus };
            })
            .filter(user => user.movies || user.weekly || user.bonus));
    }, ACCOUNT_SEASON_TTL);
}

function getAvailableYears(historySeasons, date = new Date()) {
    const cutoffYear = getLeaderboardCutoffYear(date);
    const years = new Set(historySeasons.filter(year => year < FIRST_ACCOUNT_SEASON && year <= cutoffYear));
    for (let year = FIRST_ACCOUNT_SEASON; year <= cutoffYear; year++) {
        years.add(year);
    }
    return [...years].sort((a, b) => b - a);
}

export async function getLeaderboardPayload({ requestedYear, date = new Date(), db = pool } = {}) {
    const availableYears = getAvailableYears(await getHistorySeasons(db), date);
    const year = availableYears.includes(requestedYear) ? requestedYear : availableYears[0];

    if (!year) {
        const error = new Error('No Scareathon season has standings yet');
        error.statusCode = 404;
        throw error;
    }

    const fromAccounts = year >= FIRST_ACCOUNT_SEASON;
    const data = fromAccounts ? await getAccountStandings(db, year) : await getHistoryStandings(db, year);

    return {
        data,
        meta: {
            year,
            source: fromAccounts ? 'accounts' : 'history',
            isLive: year === date.getFullYear() && isLiveEventOpen(date),
            isPreseason: year === date.getFullYear() && date.getMonth() < EVENT_MONTH_INDEX,
            availableYears
        }
    };
}

export async function getPastWinners({ date = new Date(), db = pool } = {}) {
    const cutoffYear = getWinnerCutoffYear(date);
    return getOrRefreshCache(`pastWinners_${cutoffYear}_${date.getMonth()}`, async () => {
        const result = await db.query(`
            SELECT season, name
            FROM scareathon_winners
            WHERE season <= $1
            ORDER BY season DESC
        `, [Math.min(cutoffYear, FIRST_ACCOUNT_SEASON - 1)]);
        const winners = result.rows.map(row => ({ year: String(row.season), name: row.name }));

        for (let season = FIRST_ACCOUNT_SEASON; isSeasonFinished(season, date); season++) {
            const standings = await getAccountStandings(db, season);
            standings
                .filter(user => user.rank === 1 && user.total > 0)
                .forEach(user => winners.push({ year: String(season), name: user.name }));
        }

        return winners.sort((a, b) => Number(b.year) - Number(a.year));
    }, HISTORY_TTL);
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
        try {
            const pastWinners = await getPastWinners();
            setReadCacheHeaders(reply);
            return { data: pastWinners };
        } catch (err) {
            console.log(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });
}
