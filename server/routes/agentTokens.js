import pool from '../db/mockDB.js';
import { MAX_ACTIVE_AGENT_TOKENS, newAgentToken } from '../utils/agentTokens.js';

// Making, listing and revoking agent keys (signed-in players only, never an agent itself:
// these paths aren't in AGENT_ROUTES), and the one route that tells an agent who it is.

const toKey = row => ({
    id: Number(row.id),
    name: row.name,
    hint: row.hint,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
});

export default async function routes(fastify) {
    fastify.get('/agent-tokens', async (request, reply) => {
        if (request.user?.agent) return reply.code(403).send({ error: 'Agents only' });
        try {
            const result = await pool.query(`
                SELECT id, name, hint, created_at, last_used_at FROM agent_tokens
                WHERE user_id = $1 AND revoked_at IS NULL
                ORDER BY created_at DESC
            `, [request.user.sub]);
            return { data: result.rows.map(toKey) };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not load your agent keys' });
        }
    });

    // { name } -> the key, shown this once
    fastify.post('/agent-tokens', async (request, reply) => {
        if (request.user?.agent) return reply.code(403).send({ error: 'Agents only' });
        const name = typeof request.body?.name === 'string' ? request.body.name.trim().slice(0, 40) : '';
        if (!name) return reply.code(400).send({ error: 'Give the key a name, like "Claude" or "laptop"' });
        try {
            const active = await pool.query(
                'SELECT count(*)::int AS count FROM agent_tokens WHERE user_id = $1 AND revoked_at IS NULL',
                [request.user.sub]
            );
            if (Number(active.rows[0]?.count) >= MAX_ACTIVE_AGENT_TOKENS) {
                return reply.code(409).send({ error: `You can have ${MAX_ACTIVE_AGENT_TOKENS} agent keys. Revoke one first.` });
            }
            const { token, tokenHash, hint } = newAgentToken();
            const result = await pool.query(`
                INSERT INTO agent_tokens (user_id, name, token_hash, hint)
                VALUES ($1, $2, $3, $4)
                RETURNING id, name, hint, created_at, last_used_at
            `, [request.user.sub, name, tokenHash, hint]);
            return reply.code(201).send({ data: { ...toKey(result.rows[0]), token } });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not make an agent key' });
        }
    });

    fastify.delete('/agent-tokens/:id', async (request, reply) => {
        if (request.user?.agent) return reply.code(403).send({ error: 'Agents only' });
        const id = Number(request.params.id);
        if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'Unknown key' });
        try {
            const result = await pool.query(`
                UPDATE agent_tokens SET revoked_at = now()
                WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
                RETURNING id
            `, [id, request.user.sub]);
            if (!result.rows[0]) return reply.code(404).send({ error: 'That key is already gone' });
            return { data: { id } };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not revoke that key' });
        }
    });

    // Who an agent key belongs to
    fastify.get('/agent/whoami', async (request, reply) => {
        if (!request.user?.agent) return reply.code(400).send({ error: 'Send an agent key' });
        try {
            const result = await pool.query("SELECT CASE WHEN deleted_at IS NOT NULL THEN 'Deleted rider' ELSE username END AS username FROM users WHERE id = $1", [request.user.sub]);
            return { data: { username: result.rows[0]?.username ?? null, key: request.user.agentName } };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'Could not look you up' });
        }
    });
}
