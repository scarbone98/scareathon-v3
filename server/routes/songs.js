import pool from '../db/mockDB.js';

// Songs for the radio on the station's bench: bought with tickets at the ticket counter,
// played on the radio. The music itself is in the browser (src/station/radio.ts); this
// keeps what each costs and who owns which. A song with no price is everyone's.

export const SONGS = [
    { key: 'scareathon_theme', name: 'Scareathon Theme', price: 0 },
    { key: 'platform_waltz', name: 'Platform Waltz', price: 0 },
    { key: 'graveyard_shift', name: 'Graveyard Shift', price: 80 },
    { key: 'bone_rattle', name: 'Bone Rattle', price: 100 },
    { key: 'midnight_express', name: 'Midnight Express', price: 100 },
    { key: 'moth_lullaby', name: 'Moth Lullaby', price: 120 },
    { key: 'ticketmasters_tango', name: "Ticketmaster's Tango", price: 150 },
    { key: 'last_train_home', name: 'Last Train Home', price: 150 },
];
const BY_KEY = new Map(SONGS.map((song) => [song.key, song]));

// The table, made if missing (run at start-up, see index.js)
export const SONGS_SQL = `
    CREATE TABLE IF NOT EXISTS public.user_songs (
        user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
        song_key TEXT NOT NULL,
        bought_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, song_key)
    );
`;

export async function songState(userId, db = pool) {
    const bought = await db.query('SELECT song_key FROM public.user_songs WHERE user_id = $1', [userId]);
    const mine = new Set(bought.rows.map((row) => row.song_key));
    return {
        catalog: SONGS,
        owned: SONGS.filter((song) => song.price === 0 || mine.has(song.key)).map((song) => song.key),
    };
}

// Buys a song: { status: 'bought' | 'missing' | 'owned' | 'short' } (in one transaction on `client`)
export async function buySong(client, userId, key) {
    const song = BY_KEY.get(String(key));
    if (!song) return { status: 'missing' };
    if (song.price === 0) return { status: 'owned' };
    await client.query('BEGIN');
    try {
        await client.query('SELECT public.ensure_user_wallet($1)', [userId]);
        const owned = await client.query('SELECT 1 FROM public.user_songs WHERE user_id = $1 AND song_key = $2', [userId, song.key]);
        if (owned.rows[0]) {
            await client.query('ROLLBACK');
            return { status: 'owned' };
        }
        const wallet = await client.query('SELECT coin_balance FROM user_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        if (Number(wallet.rows[0]?.coin_balance || 0) < song.price) {
            await client.query('ROLLBACK');
            return { status: 'short' };
        }
        await client.query('INSERT INTO public.user_songs (user_id, song_key) VALUES ($1, $2)', [userId, song.key]);
        const updated = await client.query(`
            UPDATE user_wallets SET coin_balance = coin_balance - $2, updated_at = now()
            WHERE user_id = $1 RETURNING coin_balance
        `, [userId, song.price]);
        await client.query(`
            INSERT INTO currency_transactions (user_id, amount, balance_after, transaction_type, source_type, source_id, metadata)
            VALUES ($1, $2, $3, 'spend', 'song_purchase', $4, $5::jsonb)
        `, [userId, -song.price, Number(updated.rows[0].coin_balance), song.key, JSON.stringify({ songKey: song.key, priceAmount: song.price })]);
        await client.query('COMMIT');
        return { status: 'bought' };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    }
}

export default async function songsRoutes(fastify) {
    // The songs for sale, and the ones you own
    fastify.get('/', async (request, reply) => {
        try {
            return { data: await songState(request.user.sub) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load the songs' });
        }
    });

    fastify.post('/:key/buy', async (request, reply) => {
        const userId = request.user.sub;
        const client = await pool.connect();
        try {
            const { status } = await buySong(client, userId, request.params.key);
            if (status === 'missing') return reply.code(404).send({ error: 'No such song' });
            if (status === 'owned') return reply.code(409).send({ error: 'You already have that song' });
            if (status === 'short') return reply.code(402).send({ error: 'Not enough tickets' });
            return { data: await songState(userId) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not buy the song' });
        } finally {
            client.release();
        }
    });
}
