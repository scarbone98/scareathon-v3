import { readFile } from 'node:fs/promises';
import { deleteCachePrefix } from './cacheManager.js';

// The Scareboard's tables, created at server start if they aren't there yet
// (the migrations only use IF NOT EXISTS, so running them every boot is harmless)
export async function ensureScareathonTables(db) {
    for (const name of ['20260930_add_scareathon_scoring.sql', '20261110_add_christmathon.sql']) {
        const sql = await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8');
        await runStartupSql(db, sql);
    }
}

// A start-up migration, on a connection of its own, in a transaction that gives up after
// a few seconds waiting on a lock (and rolls back, leaving the connection clean)
export async function runStartupSql(db, sql) {
    const client = typeof db.connect === 'function' ? await db.connect() : db;
    try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query(sql);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        if (client !== db) client.release();
    }
}

// The film events, US Eastern time (as the calendar runs): the Scareathon through October,
// the Christmathon from December 1 to Christmas Day. Each keeps its own watches, points and
// standings (the `event` column); a request picks one with ?event=, the Scareathon by default.
// (The front end's copy of this list is src/seasonEvents.ts.)
// From this season on, standings come from accounts; earlier Scareathons are sheet history.
export const FIRST_ACCOUNT_SEASON = 2026;
export const EVENTS = {
    scareathon: { id: 'scareathon', name: 'Scareathon', monthIndex: 9, lastDay: 31, sheetPrefix: 'Calendar', firstSeason: 2021 },
    christmathon: { id: 'christmathon', name: 'Christmathon', monthIndex: 11, lastDay: 25, sheetPrefix: 'Christmathon', firstSeason: 2026 },
};
export const EVENT_MONTH_INDEX = EVENTS.scareathon.monthIndex;
export const POINT_CATEGORIES = ['movies', 'weekly', 'bonus'];

// The event a request asks for (?event=christmathon), or null for one there isn't
export function eventFromQuery(query) {
    const id = query?.event;
    if (id === undefined || id === null || id === '') return EVENTS.scareathon;
    return Object.hasOwn(EVENTS, id) ? EVENTS[id] : null;
}

// The event running on a date, if any
export function eventOn(date = new Date()) {
    const { monthIndex, day } = easternParts(date);
    return Object.values(EVENTS).find(event => event.monthIndex === monthIndex && day <= event.lastDay) || null;
}

function easternParts(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric'
    }).formatToParts(date);
    const get = type => Number(parts.find(part => part.type === type)?.value);
    return { year: get('year'), monthIndex: get('month') - 1, day: get('day') };
}

// The season the calendar shows (and the one watches and points are added to)
export function currentSeason(date = new Date()) {
    return easternParts(date).year;
}

export function isEventMonth(date = new Date(), event = EVENTS.scareathon) {
    return easternParts(date).monthIndex === event.monthIndex;
}

// The Scareboard is read through these caches; any change to points drops them
export function clearStandingsCache() {
    deleteCachePrefix('leaderboard_');
    deleteCachePrefix('pastWinners_');
}

// Add points to a player's season. With a sourceKey, the same award only ever lands once
// (returns null the second time). Use it from code for automatic awards, e.g.
// awardScareathonPoints(db, { userId, category: 'bonus', points: 1, reason: 'Found the secret door', sourceKey: 'secret:door' })
export async function awardScareathonPoints(db, {
    userId,
    season = currentSeason(),
    category,
    points,
    reason = '',
    sourceKey = null,
    awardedBy = null,
    event = EVENTS.scareathon,
}) {
    if (!POINT_CATEGORIES.includes(category)) throw new Error(`Unknown Scareathon category: ${category}`);
    if (!Number.isInteger(points) || points === 0) throw new Error('Scareathon points must be a non-zero whole number');

    const result = await db.query(`
        INSERT INTO scareathon_points (user_id, season, category, points, reason, source_key, awarded_by, event)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id, event, season, source_key) WHERE source_key IS NOT NULL DO NOTHING
        RETURNING id
    `, [userId, season, category, points, reason, sourceKey, awardedBy, event.id]);

    if (!result.rows[0]) return null;
    clearStandingsCache();
    return { id: Number(result.rows[0].id) };
}

// A weekly challenge finished while an event runs is a weekly point on that event's standings
export async function awardWeeklyChallengePoint(db, userId, challenge, date = new Date()) {
    const event = eventOn(date);
    if (!event) return null;
    return awardScareathonPoints(db, {
        userId,
        event,
        season: currentSeason(date),
        category: 'weekly',
        points: Number.isInteger(challenge.points) && challenge.points > 0 ? challenge.points : 1,
        reason: `Weekly challenge: ${challenge.title || challenge.documentId}`.slice(0, 200),
        sourceKey: `weekly_challenge:${challenge.documentId}`,
    });
}
