import pool from '../db/mockDB.js';

// A creature's game keeps its save on its keeper's account, not in a browser: the game hands
// the page its save every time it writes one (PetFrame: <PREFIX>_SAVE) and the page sends it
// here; when the game starts it's handed back, so the same room is there on any device and
// isn't lost with a browser's storage. The save is the game's own business: it's kept whole
// and never read here, beyond when it was written and how many live in it.

const GAMES = new Set(['cryptlins']);
export const MAX_SAVE_BYTES = 256 * 1024;

// Keepers who lost a cryptlin of a particular kind when saves moved onto the account, and are
// owed one of that kind back: by username (any case, spaces or none) and the kind's title in
// the game (Cryptlins: scripts/cryptlin.gd). Each is given an egg of that kind, once (marked as
// a gift had, see petItems.js), laid in their cellar's save: it hatches like any other. One whose
// cellar is full (four), or holds a save from before there could be more than one, is skipped
// and given it at a later start, once there's room.
const KINDS_OWED = [{ name: 'twistedtina', kind: 'yeti' }];
const sqlText = (text) => `'${String(text).toLowerCase().replace(/[^a-z0-9_.-]/g, '')}'`;
const KINDS_OWED_SQL = KINDS_OWED.map(({ name, kind }) => `
    WITH owed AS (
        SELECT u.id, COALESCE(s.save, '{"v": 3, "residents": []}'::jsonb) AS save
        FROM public.users u
        LEFT JOIN public.pet_saves s ON s.user_id = u.id AND s.game = 'cryptlins'
        WHERE lower(replace(u.username, ' ', '')) = ${sqlText(name)}
            AND (s.save IS NULL OR (jsonb_typeof(s.save->'residents') = 'array' AND jsonb_array_length(s.save->'residents') < 4))
    ), given AS (
        INSERT INTO public.user_pet_gifts (user_id, gift_key)
        SELECT id, ${sqlText(`${kind}_owed_1`)} FROM owed
        ON CONFLICT (user_id, gift_key) DO NOTHING RETURNING user_id
    ), numbered AS (
        SELECT o.id, o.save, GREATEST(
            COALESCE((o.save->>'next_id')::int, 1),
            1 + COALESCE((SELECT max((r->>'id')::int) FROM jsonb_array_elements(o.save->'residents') r), 0),
            1 + COALESCE((SELECT max((r->>'id')::int) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.save->'gone') = 'array' THEN o.save->'gone' ELSE '[]'::jsonb END) r), 0)
        ) AS egg_id
        FROM owed o JOIN given g ON g.user_id = o.id
    )
    INSERT INTO public.pet_saves (user_id, game, save, saved_at)
    SELECT id, 'cryptlins', save || jsonb_build_object(
        'residents', (save->'residents') || jsonb_build_array(jsonb_build_object(
            'id', egg_id, 'name', '', 'kind', ${sqlText(kind)}, 'seed', 1000001 + floor(random() * 1000000)::int,
            'hatched', false, 'born', 0, 'warmth', 0, 'tastes', 2, 'at', '[]'::jsonb)),
        'next_id', egg_id + 1,
        -- (the save keeps its own time, so the others in the room have lived the time since; a
        -- new one starts now)
        'time', COALESCE((save->>'time')::double precision, extract(epoch FROM now()))
    ), COALESCE((save->>'time')::double precision, extract(epoch FROM now()))
    FROM numbered
    ON CONFLICT (user_id, game) DO UPDATE SET save = EXCLUDED.save, updated_at = now();
`).join('');

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
${KINDS_OWED_SQL}`;

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
