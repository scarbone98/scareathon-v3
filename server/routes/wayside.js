import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pool from '../db/mockDB.js';
import { runStartupSql } from '../utils/scareathon.js';

// The rune tablet over the arch on the track side: each day (US Eastern) it's carved with a
// new code, in runes; typed into WaysideOS on the arcade's terminal it pays out tickets,
// once a day for each player. The code is worked out here (from the date and a secret), so
// it's only ever on the tablet, never in the site's own code.

// The letters that have a rune each (Elder Futhark, as usually transliterated); C, Q, V, X
// and Y have none, so codes never use them
export const RUNE_LETTERS = 'ABDEFGHIJKLMNOPRSTUWZ';
export const RUNE_CODE_LENGTH = 6;
export const RUNE_REWARD = 100;
const SOURCE_TYPE = 'daily_rune';

export function easternDay(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function runeCodeFor(day, secret = process.env.RUNE_SECRET || 'wayside-runes') {
    const digest = createHmac('sha256', secret).update(`rune:${day}`).digest();
    let code = '';
    for (let i = 0; i < RUNE_CODE_LENGTH; i += 1) code += RUNE_LETTERS[digest[i] % RUNE_LETTERS.length];
    return code;
}

const cleanCode = (raw) => (typeof raw === 'string' ? raw.toUpperCase().replace(/\s+/g, '') : '');

// The unique index that makes a day's payout happen once (created at server start)
export async function ensureDailyRuneIndex(db) {
    const sql = await readFile(new URL('../db/migrations/20261002_daily_rune_once.sql', import.meta.url), 'utf8');
    await runStartupSql(db, sql);
}

export async function redeemRune(db, userId, rawCode, date = new Date()) {
    const day = easternDay(date);
    if (cleanCode(rawCode) !== runeCodeFor(day)) return { status: 'invalid' };

    const existing = await db.query(`
        SELECT balance_after FROM currency_transactions
        WHERE user_id = $1 AND source_type = $2 AND source_id = $3
        LIMIT 1
    `, [userId, SOURCE_TYPE, day]);
    if (existing.rows[0]) return { status: 'claimed', coinBalance: Number(existing.rows[0].balance_after) };

    try {
        const result = await db.query(`
            SELECT public.grant_currency($1, $2, $3, $4, $5::jsonb) AS coin_balance
        `, [userId, RUNE_REWARD, SOURCE_TYPE, day, JSON.stringify({ day })]);
        return { status: 'granted', reward: RUNE_REWARD, coinBalance: Number(result.rows[0].coin_balance) };
    } catch (error) {
        // Two taps at once: the unique index lets only one through
        if (error?.code === '23505') return { status: 'claimed' };
        throw error;
    }
}

export default async function routes(fastify) {
    // Today's runes, for the tablet (anyone can look)
    fastify.get('/rune', async (request, reply) => {
        const day = easternDay();
        reply.header('Cache-Control', 'public, max-age=300');
        return { data: { day, code: runeCodeFor(day) } };
    });

    fastify.post('/codes/redeem', async (request, reply) => {
        try {
            const result = await redeemRune(pool, request.user.sub, request.body?.code);
            if (result.status === 'invalid') return reply.code(404).send({ error: 'Invalid code' });
            return { data: result };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not redeem that code' });
        }
    });
}
