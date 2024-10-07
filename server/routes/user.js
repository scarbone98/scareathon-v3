import pool from '../db/mockDB.js';

export default async function (fastify, options) {

    fastify.get('/', async (request, reply) => {
        const userId = request.user.sub;
        try {
            const result = await pool.query(
                'SELECT * FROM users WHERE id = $1',
                [userId]
            );
            return { data: result.rows[0] };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching the username' });
        }
    });

    fastify.put('/updateUsername', async (request, reply) => {
        const userId = request.user.sub;
        const { newUsername } = request.body;
        console.log(newUsername, userId);
        if (!userId || !newUsername) {
            return reply.code(400).send({ error: 'User ID and new username are required' });
        }

        // Add username validation
        if (!/^[a-zA-Z0-9_]{1,20}$/.test(newUsername)) {
            return reply.code(400).send({ error: 'Username must be 1-20 characters long and contain only letters, numbers, and underscores' });
        }

        try {
            const result = await pool.query(
                'UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username',
                [newUsername, userId]
            );

            if (result.rowCount === 0) {
                return reply.code(404).send({ error: 'User not found' });
            }

            return { data: result.rows[0] };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while updating the username' });
        }
    });
}
