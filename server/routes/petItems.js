import pool from '../db/mockDB.js';
import { CRYPTLINS_ITEMS } from '../shared/pets/cryptlins.js';
import { AQUARIUM_ITEMS } from '../shared/pets/aquarium.js';

// Things for the two creatures you keep at the station: the cryptlin in the cellar under the
// trap door, and the aquarium on top of the lockers. They're bought at the ticket counter and
// turn up in the games as stock (the page hands each game its own: src/station/PetFrame.tsx).
// Some are kept for good once bought (a toy, a rock, a different floor); the rest are used up
// (food, a fish put in a tank), come several to a purchase, and can be bought again. A thing
// put into the aquarium can be taken out again and comes back into stock; so that nothing
// comes back that was never put in, the account keeps count of what is in use (`placed`).
//
// An item's key is its game and the game's own id for it: "cryptlins:fish", "aquarium:fish:guppy".

// The aquarium isn't open yet (its tank isn't on the lockers: AQUARIUM_OPEN in
// src/station/stops.ts), so its things aren't for sale. Both switches go on together.
const AQUARIUM_OPEN = false;

export const PET_ITEMS = [
    ...CRYPTLINS_ITEMS.map((item) => ({ ...item, game: 'cryptlins', key: `cryptlins:${item.id}` })),
    ...(AQUARIUM_OPEN ? AQUARIUM_ITEMS : []).map((item) => ({ ...item, game: 'aquarium', key: `aquarium:${item.id}` })),
];
const BY_KEY = new Map(PET_ITEMS.map((item) => [item.key, item]));

// The table, made if missing (run at start-up, see index.js)
export const PET_ITEMS_SQL = `
    CREATE TABLE IF NOT EXISTS public.user_pet_items (
        user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
        item_key TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        placed INTEGER NOT NULL DEFAULT 0 CHECK (placed >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, item_key)
    );
    ALTER TABLE public.user_pet_items ADD COLUMN IF NOT EXISTS placed INTEGER NOT NULL DEFAULT 0 CHECK (placed >= 0);
`;

// What's for sale, and what you have: how many of each, or -1 for a thing that's kept
export async function petItemState(userId, db = pool) {
    const held = await db.query('SELECT item_key, quantity FROM public.user_pet_items WHERE user_id = $1 AND quantity > 0', [userId]);
    const owned = {};
    for (const row of held.rows) {
        const item = BY_KEY.get(row.item_key);
        if (item) owned[item.key] = item.keeps ? -1 : Number(row.quantity);
    }
    return { catalog: PET_ITEMS, owned };
}

// Buys an item: { status: 'bought' | 'missing' | 'owned' | 'short' } (in one transaction on `client`)
export async function buyPetItem(client, userId, key) {
    const item = BY_KEY.get(String(key));
    if (!item) return { status: 'missing' };
    await client.query('BEGIN');
    try {
        await client.query('SELECT public.ensure_user_wallet($1)', [userId]);
        const wallet = await client.query('SELECT coin_balance FROM user_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        const held = await client.query('SELECT quantity FROM public.user_pet_items WHERE user_id = $1 AND item_key = $2', [userId, item.key]);
        if (item.keeps && Number(held.rows[0]?.quantity || 0) > 0) {
            await client.query('ROLLBACK');
            return { status: 'owned' };
        }
        if (Number(wallet.rows[0]?.coin_balance || 0) < item.price) {
            await client.query('ROLLBACK');
            return { status: 'short' };
        }
        const pack = item.keeps ? 1 : item.pack || 1;
        await client.query(`
            INSERT INTO public.user_pet_items (user_id, item_key, quantity) VALUES ($1, $2, $3)
            ON CONFLICT (user_id, item_key) DO UPDATE SET quantity = public.user_pet_items.quantity + EXCLUDED.quantity, updated_at = now()
        `, [userId, item.key, pack]);
        const updated = await client.query(`
            UPDATE user_wallets SET coin_balance = coin_balance - $2, updated_at = now()
            WHERE user_id = $1 RETURNING coin_balance
        `, [userId, item.price]);
        await client.query(`
            INSERT INTO currency_transactions (user_id, amount, balance_after, transaction_type, source_type, source_id, metadata)
            VALUES ($1, $2, $3, 'spend', 'pet_item_purchase', $4, $5::jsonb)
        `, [userId, -item.price, Number(updated.rows[0].coin_balance), item.key, JSON.stringify({ itemKey: item.key, priceAmount: item.price, quantity: pack })]);
        await client.query('COMMIT');
        return { status: 'bought' };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
}

// One of a thing has been used in its game: one fewer here too. A kept thing isn't used up,
// and using what you have none of changes nothing (the game is only told what it has).
export async function usePetItem(userId, key, db = pool) {
    const item = BY_KEY.get(String(key));
    if (!item) return { status: 'missing' };
    if (item.keeps) return { status: 'kept' };
    const used = await db.query(`
        UPDATE public.user_pet_items SET quantity = quantity - 1, placed = placed + 1, updated_at = now()
        WHERE user_id = $1 AND item_key = $2 AND quantity > 0 RETURNING quantity
    `, [userId, item.key]);
    return { status: used.rows[0] ? 'used' : 'none' };
}

// One of a thing has been taken back out of its game (an ornament lifted out of the tank):
// it's in stock again. Only what was put in can come back.
export async function returnPetItem(userId, key, db = pool) {
    const item = BY_KEY.get(String(key));
    if (!item) return { status: 'missing' };
    if (item.keeps) return { status: 'kept' };
    const back = await db.query(`
        UPDATE public.user_pet_items SET quantity = quantity + 1, placed = placed - 1, updated_at = now()
        WHERE user_id = $1 AND item_key = $2 AND placed > 0 RETURNING quantity
    `, [userId, item.key]);
    return { status: back.rows[0] ? 'returned' : 'none' };
}

export default async function petItemsRoutes(fastify) {
    fastify.get('/', async (request, reply) => {
        try {
            return { data: await petItemState(request.user.sub) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load the pet supplies' });
        }
    });

    fastify.post('/buy', async (request, reply) => {
        const userId = request.user.sub;
        const client = await pool.connect();
        try {
            const { status } = await buyPetItem(client, userId, request.body?.key);
            if (status === 'missing') return reply.code(404).send({ error: 'No such thing on the shelf' });
            if (status === 'owned') return reply.code(409).send({ error: 'You already have that' });
            if (status === 'short') return reply.code(402).send({ error: 'Not enough tickets' });
            return { data: await petItemState(userId) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not buy that' });
        } finally {
            client.release();
        }
    });

    fastify.post('/return', async (request, reply) => {
        const userId = request.user.sub;
        try {
            const { status } = await returnPetItem(userId, request.body?.key);
            if (status === 'missing') return reply.code(404).send({ error: 'No such thing' });
            return { data: await petItemState(userId) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not take that back' });
        }
    });

    fastify.post('/use', async (request, reply) => {
        const userId = request.user.sub;
        try {
            const { status } = await usePetItem(userId, request.body?.key);
            if (status === 'missing') return reply.code(404).send({ error: 'No such thing' });
            return { data: await petItemState(userId) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not use that' });
        }
    });
}
