import pool from '../db/mockDB.js';

// Scoreboard banners: the strip each player's place, avatar, name and points sit on, on
// the Scareboard. Bought with tickets at the ticket counter and chosen at your locker.
// The art is drawn in the browser (src/station/banners.ts); this keeps who owns which,
// and which each player has up.

export const BANNERS = [
    { key: 'starry_night', name: 'Starry Night', price: 120 },
    { key: 'pumpkin_patch', name: 'Pumpkin Patch', price: 150 },
    { key: 'tv_static', name: 'Dead Channel', price: 150 },
    { key: 'candlelight', name: 'Candlelight', price: 180 },
    { key: 'haunted_forest', name: 'Haunted Forest', price: 200 },
    { key: 'moonlit_graveyard', name: 'Moonlit Graveyard', price: 220 },
    { key: 'blood_moon', name: 'Blood Moon', price: 260 },
    { key: 'ectoplasm', name: 'Ectoplasm', price: 300 },
    { key: 'golden_ticket', name: 'Golden Ticket', price: 500 },
];
const BY_KEY = new Map(BANNERS.map((banner) => [banner.key, banner]));

// The tables, made if missing (run at start-up, see index.js)
export const BANNERS_SQL = `
    CREATE TABLE IF NOT EXISTS public.user_banners (
        user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
        banner_key TEXT NOT NULL,
        bought_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, banner_key)
    );
    CREATE TABLE IF NOT EXISTS public.user_banner_choice (
        user_id UUID PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
        banner_key TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
`;

// Banners and avatar backgrounds are one thing now: your banner is your background (a
// section of it, or one painted for it). Anyone who bought a background item gets the
// banner of the same name. Run at start-up; does nothing once they have it.
export const BACKGROUND_BANNERS_SQL = `
    INSERT INTO public.user_banners (user_id, banner_key)
    SELECT DISTINCT uii.user_id, ai.item_key
    FROM public.user_item_instances uii
    JOIN public.avatar_items ai ON ai.id = uii.item_id
    WHERE ai.category = 'background'
      AND uii.status IN ('owned', 'listed', 'locked')
      AND ai.item_key IN (${BANNERS.map((banner) => `'${banner.key}'`).join(', ')})
    ON CONFLICT DO NOTHING;
`;

// Which banner each of these players has up ({ userId: key }); empty if the tables
// aren't there yet
export async function bannersFor(userIds, db = pool) {
    if (userIds.length === 0) return {};
    try {
        const result = await db.query(
            'SELECT user_id, banner_key FROM public.user_banner_choice WHERE user_id = ANY($1::uuid[])',
            [userIds]
        );
        return Object.fromEntries(result.rows.filter((row) => BY_KEY.has(row.banner_key)).map((row) => [row.user_id, row.banner_key]));
    } catch {
        return {};
    }
}

async function bannerState(userId, db = pool) {
    const [owned, choice] = await Promise.all([
        db.query('SELECT banner_key FROM public.user_banners WHERE user_id = $1', [userId]),
        db.query('SELECT banner_key FROM public.user_banner_choice WHERE user_id = $1', [userId]),
    ]);
    return {
        catalog: BANNERS,
        owned: owned.rows.map((row) => row.banner_key).filter((key) => BY_KEY.has(key)),
        equipped: choice.rows[0]?.banner_key ?? null,
    };
}

export default async function bannersRoutes(fastify) {
    // The banners for sale, the ones you own, and the one you have up
    fastify.get('/', async (request, reply) => {
        try {
            return { data: await bannerState(request.user.sub) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load the banners' });
        }
    });

    // Buy a banner with tickets (and put it up)
    fastify.post('/:key/buy', async (request, reply) => {
        const banner = BY_KEY.get(String(request.params.key));
        if (!banner) return reply.code(404).send({ error: 'No such banner' });
        const userId = request.user.sub;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT public.ensure_user_wallet($1)', [userId]);
            const owned = await client.query(
                'SELECT 1 FROM public.user_banners WHERE user_id = $1 AND banner_key = $2',
                [userId, banner.key]
            );
            if (owned.rows[0]) {
                await client.query('ROLLBACK');
                return reply.code(409).send({ error: 'You already have that banner' });
            }
            const wallet = await client.query('SELECT coin_balance FROM user_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
            if (Number(wallet.rows[0]?.coin_balance || 0) < banner.price) {
                await client.query('ROLLBACK');
                return reply.code(402).send({ error: 'Not enough tickets' });
            }
            await client.query('INSERT INTO public.user_banners (user_id, banner_key) VALUES ($1, $2)', [userId, banner.key]);
            const updated = await client.query(`
                UPDATE user_wallets SET coin_balance = coin_balance - $2, updated_at = now()
                WHERE user_id = $1 RETURNING coin_balance
            `, [userId, banner.price]);
            await client.query(`
                INSERT INTO currency_transactions (user_id, amount, balance_after, transaction_type, source_type, source_id, metadata)
                VALUES ($1, $2, $3, 'spend', 'banner_purchase', $4, $5::jsonb)
            `, [userId, -banner.price, Number(updated.rows[0].coin_balance), banner.key, JSON.stringify({ bannerKey: banner.key, priceAmount: banner.price })]);
            await client.query(`
                INSERT INTO public.user_banner_choice (user_id, banner_key) VALUES ($1, $2)
                ON CONFLICT (user_id) DO UPDATE SET banner_key = EXCLUDED.banner_key, updated_at = now()
            `, [userId, banner.key]);
            await client.query('COMMIT');
            return { data: await bannerState(userId) };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not buy the banner' });
        } finally {
            client.release();
        }
    });

    // Put up one of your banners ({ key }), or none ({ key: null })
    fastify.put('/equipped', async (request, reply) => {
        const userId = request.user.sub;
        const key = request.body?.key ?? null;
        try {
            if (key === null) {
                await pool.query('DELETE FROM public.user_banner_choice WHERE user_id = $1', [userId]);
            } else {
                if (!BY_KEY.has(String(key))) return reply.code(404).send({ error: 'No such banner' });
                const owned = await pool.query('SELECT 1 FROM public.user_banners WHERE user_id = $1 AND banner_key = $2', [userId, String(key)]);
                if (!owned.rows[0]) return reply.code(403).send({ error: "That banner isn't yours yet" });
                await pool.query(`
                    INSERT INTO public.user_banner_choice (user_id, banner_key) VALUES ($1, $2)
                    ON CONFLICT (user_id) DO UPDATE SET banner_key = EXCLUDED.banner_key, updated_at = now()
                `, [userId, String(key)]);
            }
            return { data: await bannerState(userId) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not change your banner' });
        }
    });
}
