import pool from '../db/mockDB.js';
import { createConversationWithMessage } from './inbox.js';

// The Best Kept Cryptlin show, judged every Friday. The cellar's game keeps a slow measure of
// how well each cryptlin has been looked after (0 to 100, about five days' memory, so an hour's
// fuss on the morning can't make up for a neglected week) and tells the page its best one; the
// page enters it here, each keeper's latest word standing. When a Friday's hour has passed, the
// first request afterwards judges it: the best three get tickets and a rosette to pin on, and
// first place a brass cup for the cellar (things only ever had this way: `prize` in the
// catalogue, server/shared/pets/cryptlins.js), with a letter in the pigeonhole to say so.

// When it's judged: Fridays at 18:00 UTC (noon in the Rockies)
const JUDGED = { day: 5, hour: 18 };
export const SHOW_PRIZES = [
    { place: 1, tickets: 1000, items: ['cryptlins:rosette1', 'cryptlins:trophy'] },
    { place: 2, tickets: 400, items: ['cryptlins:rosette2'] },
    { place: 3, tickets: 200, items: ['cryptlins:rosette3'] },
];
const PLACES = ['First', 'Second', 'Third'];
const PRIZE_SOURCE = 'pet_show_prize';

export const PET_SHOW_SQL = `
    CREATE TABLE IF NOT EXISTS public.pet_show_entries (
        week TEXT NOT NULL,
        user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
        pet_name TEXT NOT NULL,
        pet_kind TEXT NOT NULL,
        score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (week, user_id)
    );
    CREATE TABLE IF NOT EXISTS public.pet_show_results (
        week TEXT PRIMARY KEY,
        winners JSONB NOT NULL DEFAULT '[]'::jsonb,
        judged_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
`;

// The judging an entry made now counts towards: the next Friday's (a show is named for its day)
export function showJudgedAt(now = new Date()) {
    const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), JUDGED.hour));
    let days = (JUDGED.day - at.getUTCDay() + 7) % 7;
    if (days === 0 && now >= at) days = 7;
    at.setUTCDate(at.getUTCDate() + days);
    return at;
}
export const showWeek = (now = new Date()) => showJudgedAt(now).toISOString().slice(0, 10);

const clean = (value, most) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, most);

// A keeper's cryptlin, as its game has it just now: { status: 'entered' | 'bad' }
export async function enterShow(userId, entry, db = pool, now = new Date()) {
    const name = clean(entry?.name, 24);
    const kind = clean(entry?.kind, 40);
    const score = Math.round(Number(entry?.score));
    if (!name || !kind || !Number.isFinite(score) || score < 0 || score > 100) return { status: 'bad' };
    await db.query(`
        INSERT INTO public.pet_show_entries (week, user_id, pet_name, pet_kind, score) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (week, user_id) DO UPDATE SET pet_name = EXCLUDED.pet_name, pet_kind = EXCLUDED.pet_kind, score = EXCLUDED.score, updated_at = now()
    `, [showWeek(now), userId, name, kind, score]);
    return { status: 'entered' };
}

export function showPrizeMail(place, petName, tickets) {
    const cup = place === 1 ? ' and a brass cup for the cellar' : '';
    return {
        subject: `Best Kept Cryptlin: ${PLACES[place - 1].toLowerCase()} place`,
        body: `${petName} took ${PLACES[place - 1].toLowerCase()} place at Friday's show. ${Number(tickets).toLocaleString('en-US')} tickets have been added to your wallet, and there is a rosette to pin on${cup}: you will find ${place === 1 ? 'them' : 'it'} among your things down the trap door.`,
    };
}

// Judges every show whose Friday has passed and hasn't been: the best three kept (a tie goes to
// whoever's word came first), their prizes paid in the one transaction. Whoever writes the
// show's result row first does the judging; anyone else finds it written and leaves it.
export async function judgePastShows(client, now = new Date()) {
    const due = await client.query(`
        SELECT DISTINCT e.week FROM public.pet_show_entries e
        LEFT JOIN public.pet_show_results r ON r.week = e.week
        WHERE e.week < $1 AND r.week IS NULL ORDER BY e.week
    `, [showWeek(now)]);
    const judged = [];
    for (const { week } of due.rows) {
        await client.query('BEGIN');
        try {
            const mine = await client.query('INSERT INTO public.pet_show_results (week) VALUES ($1) ON CONFLICT (week) DO NOTHING RETURNING week', [week]);
            if (!mine.rows[0]) {
                await client.query('ROLLBACK');
                continue;
            }
            const best = await client.query(`
                SELECT e.user_id, e.pet_name, e.pet_kind, e.score, u.username FROM public.pet_show_entries e
                JOIN public.users u ON u.id = e.user_id AND u.deleted_at IS NULL
                WHERE e.week = $1 AND e.score > 0 ORDER BY e.score DESC, e.updated_at ASC LIMIT 3
            `, [week]);
            const winners = [];
            for (const [i, row] of best.rows.entries()) {
                const prize = SHOW_PRIZES[i];
                await client.query('SELECT public.ensure_user_wallet($1)', [row.user_id]);
                const wallet = await client.query('UPDATE user_wallets SET coin_balance = coin_balance + $2, updated_at = now() WHERE user_id = $1 RETURNING coin_balance', [row.user_id, prize.tickets]);
                await client.query(`
                    INSERT INTO currency_transactions (user_id, amount, balance_after, transaction_type, source_type, source_id, metadata)
                    VALUES ($1, $2, $3, 'earn', '${PRIZE_SOURCE}', $4, $5::jsonb)
                `, [row.user_id, prize.tickets, Number(wallet.rows[0].coin_balance), week, JSON.stringify({ week, place: prize.place, petName: row.pet_name })]);
                for (const key of prize.items) {
                    // (a cup is kept: winning again doesn't make two)
                    await client.query(`
                        INSERT INTO public.user_pet_items (user_id, item_key, quantity) VALUES ($1, $2, 1)
                        ON CONFLICT (user_id, item_key) DO UPDATE SET quantity = CASE WHEN $3 THEN GREATEST(public.user_pet_items.quantity, 1) ELSE public.user_pet_items.quantity + 1 END, updated_at = now()
                    `, [row.user_id, key, key.endsWith(':trophy')]);
                }
                const { subject, body } = showPrizeMail(prize.place, row.pet_name, prize.tickets);
                await createConversationWithMessage(client, {
                    conversationType: 'admin_dm',
                    createdByUserId: null,
                    subject,
                    repliesEnabled: false,
                    participants: [{ userId: row.user_id, role: 'member', readAt: null }],
                    senderUserId: null,
                    senderType: 'system',
                    body,
                    metadata: { source: PRIZE_SOURCE, week, reward: { source: PRIZE_SOURCE, week, place: prize.place } },
                    reward: { coinAmount: prize.tickets, itemId: null, itemQuantity: null },
                    rewardRecipientUserId: row.user_id,
                    rewardStatus: 'claimed',
                });
                winners.push({ place: prize.place, petName: row.pet_name, petKind: row.pet_kind, keeper: row.username || 'Someone', score: Number(row.score) });
            }
            await client.query('UPDATE public.pet_show_results SET winners = $2::jsonb WHERE week = $1', [week, JSON.stringify(winners)]);
            await client.query('COMMIT');
            judged.push({ week, winners });
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        }
    }
    return judged;
}

// The show as the notice has it: when it's judged, who's ahead, your own, and last time's winners
export async function showState(userId, db = pool, now = new Date()) {
    const week = showWeek(now);
    const ahead = await db.query(`
        SELECT e.user_id, e.pet_name, e.pet_kind, e.score, u.username FROM public.pet_show_entries e
        JOIN public.users u ON u.id = e.user_id AND u.deleted_at IS NULL
        WHERE e.week = $1 AND e.score > 0 ORDER BY e.score DESC, e.updated_at ASC LIMIT 5
    `, [week]);
    const own = userId ? await db.query('SELECT pet_name, pet_kind, score FROM public.pet_show_entries WHERE week = $1 AND user_id = $2', [week, userId]) : { rows: [] };
    const last = await db.query('SELECT week, winners FROM public.pet_show_results WHERE week < $1 ORDER BY week DESC LIMIT 1', [week]);
    return {
        week,
        judgedAt: showJudgedAt(now).toISOString(),
        prizes: SHOW_PRIZES.map(({ place, tickets }) => ({ place, tickets })),
        // (no scores go out: the notice says who's ahead, not by how much)
        ahead: ahead.rows.map((row) => ({ petName: row.pet_name, petKind: row.pet_kind, keeper: row.username || 'Someone', yours: row.user_id === userId })),
        mine: own.rows[0] ? { petName: own.rows[0].pet_name, petKind: own.rows[0].pet_kind } : null,
        last: last.rows[0] ? { week: last.rows[0].week, winners: (last.rows[0].winners || []).map(({ place, petName, petKind, keeper }) => ({ place, petName, petKind, keeper })) } : null,
    };
}

async function settle(fastify) {
    const client = await pool.connect();
    try {
        await judgePastShows(client);
    } catch (error) {
        fastify.log.warn({ err: error }, 'Unable to judge the cryptlin show');
    } finally {
        client.release();
    }
}

export default async function petShowRoutes(fastify) {
    fastify.get('/', async (request, reply) => {
        try {
            await settle(fastify);
            return { data: await showState(request.user.sub) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not read the show notice' });
        }
    });

    fastify.post('/entry', async (request, reply) => {
        try {
            await settle(fastify);
            const { status } = await enterShow(request.user.sub, request.body);
            if (status === 'bad') return reply.code(400).send({ error: 'Not an entry' });
            return { data: await showState(request.user.sub) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not enter the show' });
        }
    });
}
