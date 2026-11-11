import pool from '../db/mockDB.js';
import { getOrRefreshCache } from '../utils/cacheManager.js';
import { EVENTS, FIRST_ACCOUNT_SEASON, eventFromQuery } from '../utils/scareathon.js';

// The Scareboard. Seasons from FIRST_ACCOUNT_SEASON on are worked out from player accounts
// (movies marked watched + the points ledger); earlier seasons are the sheet-era standings
// copied into scareathon_history. ?event=christmathon gives the Christmathon's (accounts only).

const HISTORY_TTL = 24 * 60 * 60 * 1000;
// Live standings change whenever someone marks a movie; writes clear this cache too
const ACCOUNT_SEASON_TTL = 60 * 1000;

function setReadCacheHeaders(reply) {
    reply.header('Cache-Control', 'private, no-store');
}

// This year's standings are shown from the month before the event (its preseason)
function getLeaderboardCutoffYear(date = new Date(), event = EVENTS.scareathon) {
    const currentYear = date.getFullYear();
    return date.getMonth() >= event.monthIndex - 1 ? currentYear : currentYear - 1;
}

function isLiveEventOpen(date = new Date(), event = EVENTS.scareathon) {
    return date.getMonth() === event.monthIndex && date.getDate() <= event.lastDay;
}

function getWinnerCutoffYear(date = new Date(), event = EVENTS.scareathon) {
    return date.getMonth() >= event.monthIndex ? date.getFullYear() : date.getFullYear() - 1;
}

// An account season has a champion once its last night is over
function isSeasonFinished(season, date = new Date(), event = EVENTS.scareathon) {
    const month = date.getMonth();
    return season < date.getFullYear() || (season === date.getFullYear()
        && (month > event.monthIndex || (month === event.monthIndex && date.getDate() > event.lastDay)));
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
            SELECT CASE WHEN u.deleted_at IS NOT NULL THEN 'Deleted rider' ELSE h.name END AS name,
                h.movies, h.weekly, h.bonus, h.total
            FROM scareathon_history h LEFT JOIN users u ON u.id = h.user_id
            WHERE h.season = $1
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

export async function getAccountStandings(db, season, event = EVENTS.scareathon) {
    return getOrRefreshCache(`leaderboard_accounts_${event.id}_${season}`, async () => {
        const result = await db.query(`
            WITH tallies AS (
                SELECT user_id, count(*)::int AS movies, 0 AS weekly, 0 AS bonus
                FROM scareathon_watches
                WHERE season = $1 AND event = $2
                GROUP BY user_id
                UNION ALL
                SELECT user_id,
                    COALESCE(sum(points) FILTER (WHERE category = 'movies'), 0)::int,
                    COALESCE(sum(points) FILTER (WHERE category = 'weekly'), 0)::int,
                    COALESCE(sum(points) FILTER (WHERE category = 'bonus'), 0)::int
                FROM scareathon_points
                WHERE season = $1 AND event = $2
                GROUP BY user_id
            )
            SELECT u.id AS user_id, CASE WHEN u.deleted_at IS NOT NULL THEN 'Deleted rider' ELSE u.username END AS username,
                sum(t.movies)::int AS movies,
                sum(t.weekly)::int AS weekly,
                sum(t.bonus)::int AS bonus
            FROM tallies t
            JOIN users u ON u.id = t.user_id
            GROUP BY u.id, u.username
        `, [season, event.id]);

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

function getAvailableYears(historySeasons, date = new Date(), event = EVENTS.scareathon) {
    const cutoffYear = getLeaderboardCutoffYear(date, event);
    const years = new Set(historySeasons.filter(year => year < FIRST_ACCOUNT_SEASON && year <= cutoffYear));
    for (let year = Math.max(FIRST_ACCOUNT_SEASON, event.firstSeason); year <= cutoffYear; year++) {
        years.add(year);
    }
    return [...years].sort((a, b) => b - a);
}

export async function getLeaderboardPayload({ requestedYear, date = new Date(), db = pool, event = EVENTS.scareathon } = {}) {
    // (the sheet-era history is all Scareathon)
    const historySeasons = event.id === 'scareathon' ? await getHistorySeasons(db) : [];
    const availableYears = getAvailableYears(historySeasons, date, event);
    const year = availableYears.includes(requestedYear) ? requestedYear : availableYears[0];

    if (!year) {
        const error = new Error(`No ${event.name} season has standings yet`);
        error.statusCode = 404;
        throw error;
    }

    const fromAccounts = year >= FIRST_ACCOUNT_SEASON;
    const data = fromAccounts ? await getAccountStandings(db, year, event) : await getHistoryStandings(db, year);

    return {
        data,
        meta: {
            year,
            source: fromAccounts ? 'accounts' : 'history',
            isLive: year === date.getFullYear() && isLiveEventOpen(date, event),
            isPreseason: year === date.getFullYear() && date.getMonth() < event.monthIndex,
            availableYears
        }
    };
}

export async function getPastWinners({ date = new Date(), db = pool, event = EVENTS.scareathon } = {}) {
    const cutoffYear = getWinnerCutoffYear(date, event);
    return getOrRefreshCache(`pastWinners_${event.id}_${cutoffYear}_${date.getMonth()}_${isSeasonFinished(cutoffYear, date, event)}`, async () => {
        const winners = event.id === 'scareathon' ? await getSheetWinners(db, cutoffYear) : [];
        for (let season = Math.max(FIRST_ACCOUNT_SEASON, event.firstSeason); isSeasonFinished(season, date, event); season++) {
            const standings = await getAccountStandings(db, season, event);
            standings
                .filter(user => user.rank === 1 && user.total > 0)
                .forEach(user => winners.push({ year: String(season), name: user.name }));
        }

        return winners.sort((a, b) => Number(b.year) - Number(a.year));
    }, HISTORY_TTL);
}

// The sheet-era Scareathon champions
async function getSheetWinners(db, cutoffYear) {
    const result = await db.query(`
        SELECT w.season, CASE WHEN u.deleted_at IS NOT NULL THEN 'Deleted rider' ELSE w.name END AS name
        FROM scareathon_winners w LEFT JOIN users u ON u.id = w.user_id
        WHERE w.season <= $1
        ORDER BY w.season DESC
    `, [Math.min(cutoffYear, FIRST_ACCOUNT_SEASON - 1)]);
    return result.rows.map(row => ({ year: String(row.season), name: row.name }));
}

export default async function (fastify, options) {
    fastify.get('/leaderboard', async (request, reply) => {
        const requestedYear = normalizeYear(request.query?.year);
        const event = eventFromQuery(request.query);
        if (!event) return reply.code(400).send({ error: 'Unknown event' });
        try {
            const response = await getLeaderboardPayload({ requestedYear, event });
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
        const event = eventFromQuery(request.query);
        if (!event) return reply.code(400).send({ error: 'Unknown event' });
        try {
            const pastWinners = await getPastWinners({ event });
            setReadCacheHeaders(reply);
            return { data: pastWinners };
        } catch (err) {
            console.log(err);
            reply.code(500).send({ error: 'An error has occurred with our database' });
        }
    });
}
