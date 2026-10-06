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

// The ticket dispenser under the arcade's marquee: give it a few knocks and now and then it
// coughs up a ticket, very now and then a golden one worth more. One roll every few seconds
// for each player (the client asks every third knock), and only so many wins a day.
export const DISPENSER_TICKET = 1;
export const DISPENSER_GOLDEN = 25;
export const DISPENSER_CHANCE = 0.3; // a plain ticket
export const DISPENSER_GOLDEN_CHANCE = 0.04;
export const DISPENSER_DAILY_WINS = 10;
export const DISPENSER_COOLDOWN_MS = 6000;
const DISPENSER_SOURCE = 'dispenser_knock';
const lastKnock = new Map();

export function rollDispenser(random = Math.random) {
    const roll = random();
    if (roll < DISPENSER_GOLDEN_CHANCE) return { kind: 'golden', tickets: DISPENSER_GOLDEN };
    if (roll < DISPENSER_GOLDEN_CHANCE + DISPENSER_CHANCE) return { kind: 'ticket', tickets: DISPENSER_TICKET };
    return { kind: 'nothing', tickets: 0 };
}

export async function knockDispenser(db, userId, { now = Date.now(), random = Math.random } = {}) {
    if (now - (lastKnock.get(userId) ?? 0) < DISPENSER_COOLDOWN_MS) return { status: 'nothing' };
    lastKnock.set(userId, now);
    // (Forget players who've wandered off, so the map can't grow without end)
    if (lastKnock.size > 5000) {
        for (const [id, at] of lastKnock) if (now - at > DISPENSER_COOLDOWN_MS) lastKnock.delete(id);
    }
    const roll = rollDispenser(random);
    if (!roll.tickets) return { status: 'nothing' };
    const wins = await db.query(`
        SELECT COUNT(*)::int AS count FROM currency_transactions
        WHERE user_id = $1 AND source_type = $2
          AND created_at >= (date_trunc('day', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York')
    `, [userId, DISPENSER_SOURCE]);
    if (Number(wins.rows[0]?.count || 0) >= DISPENSER_DAILY_WINS) return { status: 'nothing' };
    const result = await db.query(`
        SELECT public.grant_currency($1, $2, $3, $4, $5::jsonb) AS coin_balance
    `, [userId, roll.tickets, DISPENSER_SOURCE, null, JSON.stringify({ kind: roll.kind })]);
    return { status: roll.kind, tickets: roll.tickets, coinBalance: Number(result.rows[0].coin_balance) };
}

export function forgetKnocks() {
    lastKnock.clear();
    lastPickUp.clear();
}

// A ticket stub dropped on the station's floor: picked up, it's worth a ticket, a few times
// a day for each player (there are a couple on the floor every visit, so without the limit
// they'd be free tickets for coming and going)
export const FLOOR_TICKET = 1;
export const FLOOR_DAILY_TICKETS = 3;
export const FLOOR_COOLDOWN_MS = 1200;
const FLOOR_SOURCE = 'floor_ticket';
const lastPickUp = new Map();

export async function pickUpFloorTicket(db, userId, { now = Date.now() } = {}) {
    if (now - (lastPickUp.get(userId) ?? 0) < FLOOR_COOLDOWN_MS) return { status: 'nothing' };
    lastPickUp.set(userId, now);
    if (lastPickUp.size > 5000) {
        for (const [id, at] of lastPickUp) if (now - at > FLOOR_COOLDOWN_MS) lastPickUp.delete(id);
    }
    const found = await db.query(`
        SELECT COUNT(*)::int AS count FROM currency_transactions
        WHERE user_id = $1 AND source_type = $2
          AND created_at >= (date_trunc('day', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York')
    `, [userId, FLOOR_SOURCE]);
    if (Number(found.rows[0]?.count || 0) >= FLOOR_DAILY_TICKETS) return { status: 'nothing' };
    const result = await db.query(`
        SELECT public.grant_currency($1, $2, $3, $4, $5::jsonb) AS coin_balance
    `, [userId, FLOOR_TICKET, FLOOR_SOURCE, null, JSON.stringify({})]);
    return { status: 'ticket', tickets: FLOOR_TICKET, coinBalance: Number(result.rows[0].coin_balance) };
}

export default async function routes(fastify) {
    fastify.post('/dispenser/knock', async (request, reply) => {
        try {
            return { data: await knockDispenser(pool, request.user.sub) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'The dispenser jammed' });
        }
    });

    fastify.post('/floor-ticket', async (request, reply) => {
        try {
            return { data: await pickUpFloorTicket(pool, request.user.sub) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'It slipped through your fingers' });
        }
    });

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
