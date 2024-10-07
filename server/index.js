import dotenv from 'dotenv';
dotenv.config();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import calendarRoutes from './routes/calendar.js';
import postsRoutes from './routes/posts.js';
import leaderboardRoutes from './routes/leaderboard.js';
import eightbitevilreturnsRoutes from './routes/8bitevilreturns.js';
import gamesRoutes from './routes/games.js';
import userRoutes from './routes/user.js';

const fastify = Fastify({
    logger: true
});

async function main() {
    try {
        await fastify.register(cors, {
            origin: [
                'http://localhost:5173',
                'https://www.scareathon.rip',
                'https://scareathon-v3.vercel.app',
                'https://scarbone98.github.io',
                'https://sclondon.github.io'
            ],
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            credentials: true
        });

        fastify.register(fastifyJwt, {
            secret: process.env.SUPABASE_JWT_SECRET
        });

        fastify.addHook('preValidation', async (request, reply) => {
            // Skip authentication for 8bitevilreturns routes
            if (request.url.startsWith('/8bitevilreturns')) {
                return;
            }

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
        fastify.register(gamesRoutes, { prefix: '/games' });
        fastify.register(eightbitevilreturnsRoutes, { prefix: '/8bitevilreturns' });
        fastify.register(userRoutes, { prefix: '/user' });

        // Run the server!
        const start = async () => {
            try {
                await fastify.listen({ port: 3000, host: '0.0.0.0' });
            } catch (err) {
                fastify.log.error(err);
                process.exit(1);
            }
        }

        start();
    } catch (err) {
        console.error(err);
    }
}

main().catch(console.error);