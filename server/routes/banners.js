import pool from '../db/mockDB.js';

// Scoreboard banners: the strip each player's place, avatar, name and points sit on, on
// the Scareboard. Bought with tickets at the ticket counter and chosen at your locker.
// The art is drawn in the browser (src/station/banners.ts); this keeps who owns which,
// and which each player has up. (A banner's `added` is the day it went on sale: the shop
// dots what's new since you last looked.)

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
    // Fall
    { key: 'autumn_leaves', name: 'Autumn Leaves', price: 140 },
    { key: 'candy_corn', name: 'Candy Corn', price: 160 },
    { key: 'cobwebs', name: 'Cobwebs', price: 160 },
    { key: 'harvest_moon', name: 'Harvest Moon', price: 240 },
    // Summer
    { key: 'wheat_field', name: 'Wheat Field', price: 150 },
    { key: 'orchard', name: 'Orchard', price: 170 },
    { key: 'swimming_pool', name: 'Swimming Pool', price: 180 },
    { key: 'national_park', name: 'National Park', price: 220 },
    { key: 'campsite', name: 'Campsite', price: 200 },
    // Cryptids
    { key: 'lake_monster', name: 'Lake Monster', price: 280 },
    // More: places, weather, and a few patterns
    { key: 'haunted_house', name: 'Haunted House', price: 240 },
    { key: 'northern_lights', name: 'Northern Lights', price: 260 },
    { key: 'deep_space', name: 'Deep Space', price: 240 },
    { key: 'thunderstorm', name: 'Thunderstorm', price: 200 },
    { key: 'night_line', name: 'Night Line', price: 220 },
    { key: 'arcade_carpet', name: 'Arcade Carpet', price: 180 },
    { key: 'bat_flight', name: 'Bat Flight', price: 200 },
    { key: 'slime_drip', name: 'Slime Drip', price: 160 },
    { key: 'hellmouth', name: 'Hellmouth', price: 280 },
    { key: 'first_snow', name: 'First Snow', price: 180 },
    { key: 'sunset_beach', name: 'Sunset Beach', price: 200 },
    { key: 'checkerboard', name: 'Checkerboard', price: 140 },
    { key: 'vhs_tracking', name: 'VHS Tracking', price: 180 },
    { key: 'abduction', name: 'Abduction', price: 300 },
    { key: 'fairy_ring', name: 'Fairy Ring', price: 220 },
    // Fifteen more: monsters, the pictures, and one for spring
    { key: 'eight_bit_evil', name: '8 Bit Evil', price: 300, added: '2026-10-08' },
    { key: 'howling_wolf', name: 'Howling Wolf', price: 260, added: '2026-10-08' },
    { key: 'witch_flight', name: 'Witch Flight', price: 260, added: '2026-10-08' },
    { key: 'jack_o_lanterns', name: "Jack O'Lanterns", price: 220, added: '2026-10-08' },
    { key: 'ghost_parade', name: 'Ghost Parade', price: 200, added: '2026-10-08' },
    { key: 'scarecrow', name: 'Scarecrow', price: 220, added: '2026-10-08' },
    { key: 'lighthouse', name: 'Lighthouse', price: 240, added: '2026-10-08' },
    { key: 'city_rain', name: 'City Rain', price: 200, added: '2026-10-08' },
    { key: 'drive_in', name: 'Drive-In', price: 280, added: '2026-10-08' },
    { key: 'big_top', name: 'Big Top', price: 160, added: '2026-10-08' },
    { key: 'catacombs', name: 'Catacombs', price: 180, added: '2026-10-08' },
    { key: 'eyes_in_the_dark', name: 'Eyes in the Dark', price: 160, added: '2026-10-08' },
    { key: 'ghost_ship', name: 'Ghost Ship', price: 280, added: '2026-10-08' },
    { key: 'mad_lab', name: 'Mad Lab', price: 220, added: '2026-10-08' },
    { key: 'cherry_blossoms', name: 'Cherry Blossoms', price: 180, added: '2026-10-08' },
    // The ones that move (the site draws their frames), at a premium
    { key: 'meteor_shower', name: 'Meteor Shower', price: 600, animated: true, added: '2026-10-09' },
    { key: 'bonfire_night', name: 'Bonfire Night', price: 550, animated: true, added: '2026-10-09' },
    { key: 'lightning_storm', name: 'Lightning Storm', price: 600, animated: true, added: '2026-10-09' },
    { key: 'ghost_train', name: 'Ghost Train', price: 750, animated: true, added: '2026-10-09' },
    { key: 'dance_floor', name: 'Dance Floor', price: 500, animated: true, added: '2026-10-09' },
    { key: 'aurora_borealis', name: 'Aurora Borealis', price: 650, animated: true, added: '2026-10-09' },
    { key: 'bubbling_brew', name: 'Bubbling Brew', price: 500, animated: true, added: '2026-10-09' },
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
