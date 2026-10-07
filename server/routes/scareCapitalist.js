import pool from '../db/mockDB.js';
import { MAX_SAVE_BYTES, sanitizeSave } from '../shared/scareCapitalist/save.js';

// Checks a PUT /save body. Returns { save, revision } or { error }.
export function parseSaveRequest(body, now = Date.now()) {
    if (!body || typeof body !== 'object') return { error: 'Missing body' };
    const { revision } = body;
    if (revision !== null && !(Number.isInteger(revision) && revision >= 1)) return { error: 'Bad revision' };
    if (JSON.stringify(body.save ?? null).length > MAX_SAVE_BYTES) return { error: 'Save too large' };
    const checked = sanitizeSave(body.save, now);
    if (checked.error) return { error: checked.error };
    return { save: checked.save, revision };
}

// Scary Capitalist saves: the game runs in the browser and keeps your progress
// here, one save per player, like Mystery Crypt's.
export default async function scareCapitalistRoutes(fastify) {
    fastify.get('/save', async (request, reply) => {
        try {
            const result = await pool.query(
                'SELECT save, revision FROM scare_capitalist_saves WHERE user_id = $1',
                [request.user.sub]
            );
            const row = result.rows[0];
            return row ? { save: row.save, revision: row.revision } : { save: null, revision: null };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load your save' });
        }
    });

    // Writes the save if `revision` is still the latest (null for the first
    // save). Otherwise answers 409 with the newer save, for the game to settle.
    fastify.put('/save', async (request, reply) => {
        const parsed = parseSaveRequest(request.body);
        if (parsed.error) return reply.code(400).send({ error: parsed.error });
        const userId = request.user.sub;
        try {
            const result = parsed.revision === null
                ? await pool.query(`
                    INSERT INTO scare_capitalist_saves (user_id, save)
                    VALUES ($1, $2::jsonb)
                    ON CONFLICT (user_id) DO NOTHING
                    RETURNING revision
                `, [userId, JSON.stringify(parsed.save)])
                : await pool.query(`
                    UPDATE scare_capitalist_saves
                    SET save = $2::jsonb, revision = revision + 1, updated_at = now()
                    WHERE user_id = $1 AND revision = $3
                    RETURNING revision
                `, [userId, JSON.stringify(parsed.save), parsed.revision]);
            if (result.rows[0]) return { revision: result.rows[0].revision };

            const current = await pool.query(
                'SELECT save, revision FROM scare_capitalist_saves WHERE user_id = $1',
                [userId]
            );
            const row = current.rows[0];
            return reply.code(409).send({ error: 'Your save changed somewhere else', save: row?.save ?? null, revision: row?.revision ?? null });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not save your progress' });
        }
    });
}
