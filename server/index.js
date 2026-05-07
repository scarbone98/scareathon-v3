import dotenv from 'dotenv';
dotenv.config();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import calendarRoutes from './routes/calendar.js';
import postsRoutes from './routes/posts.js';
import leaderboardRoutes from './routes/leaderboard.js';
import eightbitevilreturnsRoutes from './routes/8bitevilreturns.js';
import gamesRoutes from './routes/games.js';
import userRoutes from './routes/user.js';
import marketplaceRoutes from './routes/marketplace.js';
import inboxRoutes from './routes/inbox.js';
import pool from './db/mockDB.js';

const fastify = Fastify({
    logger: true
});

function getAuthConfig() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const projectRef = process.env.SUPABASE_PROJECT_REF;
    const explicitJwks = process.env.SUPABASE_JWKS_URL;

    if (explicitJwks) {
        return {
            issuer: process.env.SUPABASE_JWT_ISSUER || null,
            jwksUrl: explicitJwks
        };
    }

    if (supabaseUrl) {
        const base = supabaseUrl.replace(/\/$/, '');
        return {
            issuer: `${base}/auth/v1`,
            jwksUrl: `${base}/auth/v1/.well-known/jwks.json`
        };
    }

    if (projectRef) {
        const base = `https://${projectRef}.supabase.co`;
        return {
            issuer: `${base}/auth/v1`,
            jwksUrl: `${base}/auth/v1/.well-known/jwks.json`
        };
    }

    throw new Error('Missing SUPABASE_URL or SUPABASE_PROJECT_REF (or SUPABASE_JWKS_URL) for JWT verification.');
}

function getBearerToken(authHeader) {
    if (!authHeader || typeof authHeader !== 'string') return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
    return parts[1];
}

async function main() {
    try {
        const authConfig = getAuthConfig();
        const jwks = createRemoteJWKSet(new URL(authConfig.jwksUrl));

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
        fastify.decorateRequest('user', null);

        fastify.addHook('preValidation', async (request, reply) => {
            // Skip authentication for 8bitevilreturns routes
            if (request.url.startsWith('/8bitevilreturns') || request.method === 'OPTIONS') {
                return;
            }

            const token = getBearerToken(request.headers.authorization);
            if (!token) {
                return reply.code(401).send({ error: 'Unauthorized: missing bearer token' });
            }

            const verifyOptions = {
                audience: 'authenticated'
            };
            if (authConfig.issuer) {
                verifyOptions.issuer = authConfig.issuer;
            }

            let payload;
            try {
                ({ payload } = await jwtVerify(token, jwks, verifyOptions));
            } catch (err) {
                request.log.warn({ err }, 'Supabase JWT verification failed');
                return reply.code(401).send({ error: 'Unauthorized' });
            }

            request.user = payload;

            try {
                const userResult = await pool.query(
                    'SELECT 1 FROM users WHERE id = $1',
                    [payload.sub]
                );
                if (userResult.rowCount === 0) {
                    return reply.code(401).send({ error: 'Unauthorized: user no longer exists' });
                }
            } catch (err) {
                request.log.error({ err }, 'Database unavailable during auth user check');
                return reply.code(503).send({ error: 'Database unavailable' });
            }
        });

        // Register route handlers
        fastify.register(calendarRoutes);
        fastify.register(postsRoutes);
        fastify.register(leaderboardRoutes);
        fastify.register(gamesRoutes, { prefix: '/games' });
        fastify.register(eightbitevilreturnsRoutes, { prefix: '/8bitevilreturns' });
        fastify.register(userRoutes, { prefix: '/user' });
        fastify.register(marketplaceRoutes, { prefix: '/marketplace' });
        fastify.register(inboxRoutes, { prefix: '/inbox' });

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
