import pool from '../db/mockDB.js';
import { MAX_SAVE_BYTES, sanitizeSave } from '../shared/waysideFury/save.js';

export function parseSaveRequest(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Missing body' };
    const { revision } = body;
    if (revision !== null && !(Number.isInteger(revision) && revision >= 1 && revision < 2_147_483_647)) return { error: 'Bad revision' };
    try {
        if (Buffer.byteLength(JSON.stringify(body.save ?? null), 'utf8') > MAX_SAVE_BYTES) return { error: 'Save too large' };
    } catch {
        return { error: 'Save must be serializable' };
    }
    const checked = sanitizeSave(body.save);
    if (checked.error) return { error: checked.error };
    return { save: checked.save, revision };
}

// One sheet per authenticated account. The database revision is a compare-and-
// swap token, exactly as in Mystery Crypt; concurrent writers receive HTTP 409.
export default async function waysideFuryRoutes(fastify, options = {}) {
    const db = options.db ?? pool;
    fastify.addHook('preHandler', async (request, reply) => {
        if (typeof request.user?.sub !== 'string' || !request.user.sub.trim()) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }
    });
    fastify.get('/save', async (request, reply) => {
        try {
            const result = await db.query('SELECT save, revision FROM wayside_fury_saves WHERE user_id = $1', [request.user.sub]);
            const row = result.rows[0];
            return row ? { save: row.save, revision: row.revision } : { save: null, revision: null };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load your save' });
        }
    });
    fastify.put('/save', async (request, reply) => {
        const parsed = parseSaveRequest(request.body);
        if (parsed.error) return reply.code(400).send({ error: parsed.error });
        const userId = request.user.sub;
        try {
            const result = parsed.revision === null
                ? await db.query(`
                    INSERT INTO wayside_fury_saves (user_id, save)
                    VALUES ($1, $2::jsonb)
                    ON CONFLICT (user_id) DO NOTHING
                    RETURNING revision
                `, [userId, JSON.stringify(parsed.save)])
                : await db.query(`
                    UPDATE wayside_fury_saves
                    SET save = $2::jsonb, revision = revision + 1, updated_at = now()
                    WHERE user_id = $1 AND revision = $3
                    RETURNING revision
                `, [userId, JSON.stringify(parsed.save), parsed.revision]);
            if (result.rows[0]) return { revision: result.rows[0].revision };
            const current = await db.query('SELECT save, revision FROM wayside_fury_saves WHERE user_id = $1', [userId]);
            const row = current.rows[0];
            return reply.code(409).send({ error: 'Your save changed somewhere else', save: row?.save ?? null, revision: row?.revision ?? null });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not save your progress' });
        }
    });
}
