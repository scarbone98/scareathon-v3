import pool from '../db/mockDB.js';

// Cartridges sold at the ticket counter: off the arcade's shelf until bought. Which carts
// those are, and what they play, is the arcade's (src/pages/Arcade/games.tsx: `name` here is
// the cart's name there); this keeps what each costs and who owns which.

export const CARTS = [
    { key: 'mystery', name: '???', price: 250 },
    { key: 'snow_globe', name: 'Snow Globe', price: 200 },
];
const BY_KEY = new Map(CARTS.map((cart) => [cart.key, cart]));

// The table, made if missing (run at start-up, see index.js)
export const CARTS_SQL = `
    CREATE TABLE IF NOT EXISTS public.user_carts (
        user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
        cart_key TEXT NOT NULL,
        bought_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, cart_key)
    );
`;

export async function cartState(userId, db = pool) {
    const bought = await db.query('SELECT cart_key FROM public.user_carts WHERE user_id = $1', [userId]);
    return {
        catalog: CARTS,
        owned: bought.rows.map((row) => row.cart_key).filter((key) => BY_KEY.has(key)),
    };
}

// Buys a cart: { status: 'bought' | 'missing' | 'owned' | 'short' } (in one transaction on `client`)
export async function buyCart(client, userId, key) {
    const cart = BY_KEY.get(String(key));
    if (!cart) return { status: 'missing' };
    await client.query('BEGIN');
    try {
        await client.query('SELECT public.ensure_user_wallet($1)', [userId]);
        const owned = await client.query('SELECT 1 FROM public.user_carts WHERE user_id = $1 AND cart_key = $2', [userId, cart.key]);
        if (owned.rows[0]) {
            await client.query('ROLLBACK');
            return { status: 'owned' };
        }
        const wallet = await client.query('SELECT coin_balance FROM user_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        if (Number(wallet.rows[0]?.coin_balance || 0) < cart.price) {
            await client.query('ROLLBACK');
            return { status: 'short' };
        }
        await client.query('INSERT INTO public.user_carts (user_id, cart_key) VALUES ($1, $2)', [userId, cart.key]);
        const updated = await client.query(`
            UPDATE user_wallets SET coin_balance = coin_balance - $2, updated_at = now()
            WHERE user_id = $1 RETURNING coin_balance
        `, [userId, cart.price]);
        await client.query(`
            INSERT INTO currency_transactions (user_id, amount, balance_after, transaction_type, source_type, source_id, metadata)
            VALUES ($1, $2, $3, 'spend', 'cart_purchase', $4, $5::jsonb)
        `, [userId, -cart.price, Number(updated.rows[0].coin_balance), cart.key, JSON.stringify({ cartKey: cart.key, priceAmount: cart.price })]);
        await client.query('COMMIT');
        return { status: 'bought' };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
}

export default async function cartsRoutes(fastify) {
    // The carts for sale, and the ones you own
    fastify.get('/', async (request, reply) => {
        try {
            return { data: await cartState(request.user.sub) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load the cartridges' });
        }
    });

    fastify.post('/:key/buy', async (request, reply) => {
        const userId = request.user.sub;
        const client = await pool.connect();
        try {
            const { status } = await buyCart(client, userId, request.params.key);
            if (status === 'missing') return reply.code(404).send({ error: 'No such cartridge' });
            if (status === 'owned') return reply.code(409).send({ error: 'You already have that cartridge' });
            if (status === 'short') return reply.code(402).send({ error: 'Not enough tickets' });
            return { data: await cartState(userId) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not buy the cartridge' });
        } finally {
            client.release();
        }
    });
}
