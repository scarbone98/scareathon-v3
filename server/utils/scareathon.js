import { readFile } from 'node:fs/promises';
import { deleteCachePrefix } from './cacheManager.js';

// The Scareboard's tables, created at server start if they aren't there yet
// (the migration only uses IF NOT EXISTS, so running it every boot is harmless)
export async function ensureScareathonTables(db) {
    const sql = await readFile(new URL('../db/migrations/20260930_add_scareathon_scoring.sql', import.meta.url), 'utf8');
    await db.query(sql);
}

// The Scareathon runs through October, US Eastern time (as the calendar does).
// From this season on, standings come from accounts; earlier seasons are sheet history.
export const FIRST_ACCOUNT_SEASON = 2026;
export const EVENT_MONTH_INDEX = 9;
export const POINT_CATEGORIES = ['movies', 'weekly', 'bonus'];

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

export function isEventMonth(date = new Date()) {
    return easternParts(date).monthIndex === EVENT_MONTH_INDEX;
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
}) {
    if (!POINT_CATEGORIES.includes(category)) throw new Error(`Unknown Scareathon category: ${category}`);
    if (!Number.isInteger(points) || points === 0) throw new Error('Scareathon points must be a non-zero whole number');

    const result = await db.query(`
        INSERT INTO scareathon_points (user_id, season, category, points, reason, source_key, awarded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id, season, source_key) WHERE source_key IS NOT NULL DO NOTHING
        RETURNING id
    `, [userId, season, category, points, reason, sourceKey, awardedBy]);

    if (!result.rows[0]) return null;
    clearStandingsCache();
    return { id: Number(result.rows[0].id) };
}

// A weekly challenge finished during October is a weekly point on the Scareboard
export async function awardWeeklyChallengePoint(db, userId, challenge, date = new Date()) {
    if (!isEventMonth(date)) return null;
    return awardScareathonPoints(db, {
        userId,
        season: currentSeason(date),
        category: 'weekly',
        points: Number.isInteger(challenge.points) && challenge.points > 0 ? challenge.points : 1,
        reason: `Weekly challenge: ${challenge.title || challenge.documentId}`.slice(0, 200),
        sourceKey: `weekly_challenge:${challenge.documentId}`,
    });
}
