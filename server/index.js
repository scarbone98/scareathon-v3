import dotenv from 'dotenv';
dotenv.config();
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import calendarRoutes from './routes/calendar.js';
import postsRoutes from './routes/posts.js';
import leaderboardRoutes from './routes/leaderboard.js';
import eightbitevilreturnsRoutes from './routes/8bitevilreturns.js';

const fastify = Fastify({
    logger: true
});

async function main() {
    try {
        await fastify.register(cors, {
            // put your options here
        });

        fastify.register(fastifyJwt, {
            secret: process.env.SUPABASE_JWT_SECRET
        });

        fastify.addHook('preValidation', async (request, reply) => {
            try {
                await request.jwtVerify();
            } catch (err) {
                console.log(err);
                return reply.code(401).send({ error: 'Unauthorized' });
            }
        });

        // Register route handlers
        fastify.register(calendarRoutes);
        fastify.register(postsRoutes);
        fastify.register(leaderboardRoutes);
        fastify.register(eightbitevilreturnsRoutes, { prefix: '/8bitevilreturns' });

        // Run the server!
        const start = async () => {
            try {
                await fastify.listen({ port: 3000, host: '0.0.0.0' })
            } catch (err) {
                fastify.log.error(err)
                process.exit(1)
            }
        }

        start();
    } catch (err) {
        console.error(err);
    }
}

main().catch(console.error);