import pool from '../db/mockDB.js';

// A creature's game keeps its save on its keeper's account, not in a browser: the game hands
// the page its save every time it writes one (PetFrame: <PREFIX>_SAVE) and the page sends it
// here; when the game starts it's handed back, so the same room is there on any device and
// isn't lost with a browser's storage. The save is the game's own business: it's kept whole
// and never read here, beyond when it was written and how many live in it.

const GAMES = new Set(['cryptlins']);
export const MAX_SAVE_BYTES = 256 * 1024;

export const PET_SAVE_SQL = `
    CREATE TABLE IF NOT EXISTS public.pet_saves (
        user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
        game TEXT NOT NULL,
        save JSONB NOT NULL,
        saved_at DOUBLE PRECISION NOT NULL DEFAULT 0,
        before JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, game)
    );
`;

// The keeper's save for a game, or null
export async function readPetSave(userId, game, db = pool) {
    if (!GAMES.has(game)) return null;
    const kept = await db.query('SELECT save FROM public.pet_saves WHERE user_id = $1 AND game = $2', [userId, game]);
    return kept.rows[0]?.save ?? null;
}

// Keeps a save: { status: 'kept' | 'stale' | 'bad' }. One written before the one already held
// is turned away (another device has been played since), and a room that comes in empty over
// one that had somebody in it leaves that one set by (`before`), to be put back by hand.
export async function writePetSave(userId, game, save, db = pool) {
    if (!GAMES.has(game) || !save || typeof save !== 'object' || Array.isArray(save)) return { status: 'bad' };
    const time = Number(save.time);
    if (!Number.isFinite(time) || time <= 0) return { status: 'bad' };
    const text = JSON.stringify(save);
    if (Buffer.byteLength(text) > MAX_SAVE_BYTES) return { status: 'bad' };
    const kept = await db.query(`
        INSERT INTO public.pet_saves (user_id, game, save, saved_at) VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (user_id, game) DO UPDATE SET
            before = CASE
                WHEN jsonb_array_length(CASE WHEN jsonb_typeof(public.pet_saves.save->'residents') = 'array' THEN public.pet_saves.save->'residents' ELSE '[]'::jsonb END) > 0
                    AND jsonb_array_length(CASE WHEN jsonb_typeof(EXCLUDED.save->'residents') = 'array' THEN EXCLUDED.save->'residents' ELSE '[]'::jsonb END) = 0
                THEN public.pet_saves.save ELSE public.pet_saves.before END,
            save = EXCLUDED.save, saved_at = EXCLUDED.saved_at, updated_at = now()
        WHERE public.pet_saves.saved_at <= EXCLUDED.saved_at
        RETURNING saved_at
    `, [userId, game, text, time]);
    return { status: kept.rows[0] ? 'kept' : 'stale' };
}

export default async function petSaveRoutes(fastify) {
    fastify.get('/:game', async (request, reply) => {
        try {
            return { data: { save: await readPetSave(request.user.sub, request.params.game) } };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not read the save' });
        }
    });

    fastify.put('/:game', { bodyLimit: MAX_SAVE_BYTES * 2 }, async (request, reply) => {
        try {
            const { status } = await writePetSave(request.user.sub, request.params.game, request.body?.save);
            if (status === 'bad') return reply.code(400).send({ error: 'Not a save' });
            return { data: { status } };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not keep the save' });
        }
    });
}
