import pool from '../db/mockDB.js';
import calendarSheet from '../db/google-sheets.js';
import { clearCalendarCache } from './calendar.js';
import { isAdminUser } from './inbox.js';
import { latestUnlockedDay } from '../utils/agentTokens.js';
import {
    FIRST_ACCOUNT_SEASON,
    POINT_CATEGORIES,
    awardScareathonPoints,
    clearStandingsCache,
    currentSeason,
} from '../utils/scareathon.js';

// The player's side of the Scareboard (marking calendar movies watched, their own tally)
// and the admin's (awarding and taking away points, importing the sheet-era history).

const MAX_REASON_LENGTH = 200;
const MAX_POINTS_PER_AWARD = 1000;

function parseDay(value) {
    const day = Number(value);
    return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function parseSeason(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    const season = Number(value);
    return Number.isInteger(season) && season >= FIRST_ACCOUNT_SEASON && season <= 2100 ? season : null;
}

export async function getPlayerSeason(db, userId, season) {
    const [watches, points] = await Promise.all([
        db.query(`
            SELECT day FROM scareathon_watches
            WHERE user_id = $1 AND season = $2
            ORDER BY day
        `, [userId, season]),
        db.query(`
            SELECT category, COALESCE(sum(points), 0)::int AS points
            FROM scareathon_points
            WHERE user_id = $1 AND season = $2
            GROUP BY category
        `, [userId, season]),
    ]);

    const watchedDays = watches.rows.map(row => Number(row.day));
    const tally = { movies: watchedDays.length, weekly: 0, bonus: 0 };
    for (const row of points.rows) {
        if (row.category in tally) tally[row.category] += Number(row.points);
    }
    return {
        season,
        watchedDays,
        points: { ...tally, total: tally.movies + tally.weekly + tally.bonus },
    };
}

// The Users-YYYY tabs (and Users-old, the 2021 season) and the Winners tab of the old sheet
export function readSheetHistory(doc) {
    const seasons = new Map();
    for (const sheet of doc.sheetsByIndex) {
        const match = sheet.title.match(/^Users-(\d{4})$/);
        const season = match ? Number(match[1]) : null;
        if (season && season < FIRST_ACCOUNT_SEASON) seasons.set(season, sheet);
    }
    if (doc.sheetsByTitle['Users-old'] && !seasons.has(2021)) {
        seasons.set(2021, doc.sheetsByTitle['Users-old']);
    }
    return seasons;
}

function sheetNumber(value) {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    if (trimmed === '' || trimmed === null || trimmed === undefined) return null;
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : null;
}

export async function importSheetHistory(db, doc) {
    const seasons = readSheetHistory(doc);
    const winnersSheet = doc.sheetsByTitle.Winners;
    const imported = { seasons: {}, winners: 0, skipped: [] };

    const seasonRows = [];
    for (const [season, sheet] of seasons) {
        const rows = await sheet.getRows();
        seasonRows.push([season, sheet.title, rows]);
    }
    const winnerRows = winnersSheet ? await winnersSheet.getRows() : [];

    const client = typeof db.connect === 'function' ? await db.connect() : db;
    try {
        await client.query('BEGIN');
        for (const [season, title, rows] of seasonRows) {
            await client.query('DELETE FROM scareathon_history WHERE season = $1', [season]);
            const seen = new Set();
            let count = 0;
            for (const row of rows) {
                const name = String(row.get('name') ?? '').trim();
                if (!name) continue;
                if (seen.has(name)) {
                    imported.skipped.push(`${title}: duplicate name "${name}"`);
                    continue;
                }
                seen.add(name);
                await client.query(`
                    INSERT INTO scareathon_history (season, name, movies, weekly, bonus, total)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [season, name, sheetNumber(row.get('movies')), sheetNumber(row.get('weekly')),
                    sheetNumber(row.get('bonus')), sheetNumber(row.get('total'))]);
                count++;
            }
            imported.seasons[season] = count;
        }

        if (winnersSheet) {
            await client.query('DELETE FROM scareathon_winners WHERE season < $1', [FIRST_ACCOUNT_SEASON]);
            const seen = new Set();
            for (const row of winnerRows) {
                const season = Number.parseInt(row.get('year'), 10);
                const name = String(row.get('name') ?? '').trim();
                if (!Number.isInteger(season) || season >= FIRST_ACCOUNT_SEASON || !name || seen.has(`${season}:${name}`)) continue;
                seen.add(`${season}:${name}`);
                await client.query('INSERT INTO scareathon_winners (season, name) VALUES ($1, $2)', [season, name]);
                imported.winners++;
            }
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        if (client !== db) client.release();
    }

    clearStandingsCache();
    return imported;
}

export default async function routes(fastify) {
    // The signed-in player's season: the days they've marked, their points, and whether they're an admin
    fastify.get('/me', async (request, reply) => {
        try {
            const season = currentSeason();
            const data = await getPlayerSeason(pool, request.user.sub, season);
            return { data: { ...data, isAdmin: isAdminUser(request.user) } };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load your Scareathon season' });
        }
    });

    // Honor system: any day of this season's calendar, any time. An agent key, though,
    // can only mark nights that have come (tonight and before, Eastern time)
    fastify.put('/watches/:day', async (request, reply) => {
        const day = parseDay(request.params.day);
        if (!day) return reply.code(400).send({ error: 'Day must be a number between 1 and 31' });
        if (request.user?.agent && day > latestUnlockedDay()) {
            return reply.code(403).send({ error: `Night ${day} hasn't come yet. Agents can only mark nights up to tonight.` });
        }
        try {
            const season = currentSeason();
            await pool.query(`
                INSERT INTO scareathon_watches (user_id, season, day)
                VALUES ($1, $2, $3)
                ON CONFLICT DO NOTHING
            `, [request.user.sub, season, day]);
            clearStandingsCache();
            return { data: await getPlayerSeason(pool, request.user.sub, season) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not mark that movie watched' });
        }
    });

    fastify.delete('/watches/:day', async (request, reply) => {
        const day = parseDay(request.params.day);
        if (!day) return reply.code(400).send({ error: 'Day must be a number between 1 and 31' });
        try {
            const season = currentSeason();
            await pool.query(`
                DELETE FROM scareathon_watches
                WHERE user_id = $1 AND season = $2 AND day = $3
            `, [request.user.sub, season, day]);
            clearStandingsCache();
            return { data: await getPlayerSeason(pool, request.user.sub, season) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not unmark that movie' });
        }
    });

    // Admins only from here on
    fastify.register(async (admin) => {
        admin.addHook('preHandler', async (request, reply) => {
            if (!isAdminUser(request.user)) {
                return reply.code(403).send({ error: 'Admins only' });
            }
        });

        // Every point given or taken this season, newest first
        admin.get('/points', async (request, reply) => {
            const season = parseSeason(request.query?.season, currentSeason());
            if (!season) return reply.code(400).send({ error: 'Unknown season' });
            try {
                const result = await pool.query(`
                    SELECT p.id, u.username, p.category, p.points, p.reason, p.source_key,
                        giver.username AS awarded_by, p.created_at
                    FROM scareathon_points p
                    JOIN users u ON u.id = p.user_id
                    LEFT JOIN users giver ON giver.id = p.awarded_by
                    WHERE p.season = $1
                    ORDER BY p.created_at DESC, p.id DESC
                    LIMIT 500
                `, [season]);
                return {
                    data: result.rows.map(row => ({
                        id: Number(row.id),
                        username: row.username,
                        category: row.category,
                        points: Number(row.points),
                        reason: row.reason,
                        automatic: Boolean(row.source_key),
                        awardedBy: row.awarded_by,
                        createdAt: row.created_at,
                    })),
                    meta: { season },
                };
            } catch (error) {
                admin.log.error(error);
                return reply.code(500).send({ error: 'Could not load the points ledger' });
            }
        });

        // Give (or, with negative points, take away) points: { username, category, points, reason }
        admin.post('/points', async (request, reply) => {
            const body = request.body || {};
            const username = typeof body.username === 'string' ? body.username.trim() : '';
            const category = body.category;
            const points = Number(body.points);
            const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, MAX_REASON_LENGTH) : '';
            const season = parseSeason(body.season, currentSeason());

            if (!username) return reply.code(400).send({ error: 'Which player?' });
            if (!POINT_CATEGORIES.includes(category)) return reply.code(400).send({ error: 'Category must be movies, weekly or bonus' });
            if (!Number.isInteger(points) || points === 0 || Math.abs(points) > MAX_POINTS_PER_AWARD) {
                return reply.code(400).send({ error: 'Points must be a whole number other than 0' });
            }
            if (!season) return reply.code(400).send({ error: 'Unknown season' });

            try {
                const player = await pool.query('SELECT id, username FROM users WHERE lower(username) = lower($1) LIMIT 1', [username]);
                if (!player.rows[0]) return reply.code(404).send({ error: `No player named ${username}` });

                const award = await awardScareathonPoints(pool, {
                    userId: player.rows[0].id,
                    season,
                    category,
                    points,
                    reason,
                    awardedBy: request.user.sub,
                });
                return reply.code(201).send({ data: { id: award.id, username: player.rows[0].username, category, points, reason, season } });
            } catch (error) {
                admin.log.error(error);
                return reply.code(500).send({ error: 'Could not award those points' });
            }
        });

        // Undo an entry in the ledger
        admin.delete('/points/:id', async (request, reply) => {
            const id = Number(request.params.id);
            if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'Unknown entry' });
            try {
                const result = await pool.query('DELETE FROM scareathon_points WHERE id = $1 RETURNING id', [id]);
                if (!result.rows[0]) return reply.code(404).send({ error: 'That entry is already gone' });
                clearStandingsCache();
                return { data: { id } };
            } catch (error) {
                admin.log.error(error);
                return reply.code(500).send({ error: 'Could not remove that entry' });
            }
        });

        // Read the October calendar from the Google sheet again now (after editing it there),
        // rather than waiting out the hour it's kept for
        admin.post('/refresh-calendar', async () => {
            clearCalendarCache();
            return { data: { refreshed: true } };
        });

        // Copy the sheet-era seasons and winners into the database (safe to run again: it
        // replaces what it copied before, and never touches account seasons)
        admin.post('/import-history', async (request, reply) => {
            try {
                const doc = await calendarSheet();
                if (!doc) return reply.code(502).send({ error: 'Could not open the Google sheet' });
                return { data: await importSheetHistory(pool, doc) };
            } catch (error) {
                admin.log.error(error);
                return reply.code(500).send({ error: 'Could not import the sheet history' });
            }
        });
    }, { prefix: '/admin' });
}
