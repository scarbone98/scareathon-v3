import websocket from '@fastify/websocket';
import { TICK_RATE } from '../../shared/monster-bash/index.js';
import { MonsterBashLoop } from '../monsterBash/matchLoop.js';
import { createOddsService } from '../monsterBash/oddsService.js';
import { createMatchRepository } from '../monsterBash/repository.js';
import { createViewerHub } from '../monsterBash/viewerHub.js';

const ODDS_ROLLOUTS = 96;
const START_RETRY_MS = 30_000;
const RECENT_LIMIT = 20;

function readPositiveInt(value, fallback) {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isMonsterBashEnabled(env = process.env) {
    return env.MONSTER_BASH_ENABLED !== 'false';
}

export default async function monsterBashRoutes(fastify, { repo = createMatchRepository() } = {}) {
    const log = fastify.log.child({ feature: 'monster-bash' });
    const hub = createViewerHub({ log });
    const odds = createOddsService({ rollouts: ODDS_ROLLOUTS, checkpointEvery: TICK_RATE, log });
    const loop = new MonsterBashLoop({
        repo,
        odds,
        hub,
        log,
        config: {
            bettingMs: readPositiveInt(process.env.MONSTER_BASH_BETTING_SECONDS, 30) * 1000,
            retentionDays: readPositiveInt(process.env.MONSTER_BASH_RETENTION_DAYS, 14),
        },
    });

    await fastify.register(websocket, { options: { maxPayload: 4096 } });

    // Spectator feed. Guests can watch; nothing a client sends is acted on yet.
    fastify.get('/ws', { websocket: true }, (socket) => {
        hub.add(socket, loop.welcomeMessages());
    });

    // Finished bouts with their seeds revealed, so anyone can replay one and
    // check it against the hash published before the fight.
    fastify.get('/recent', async (request, reply) => {
        try {
            const matches = await repo.listRecent(RECENT_LIMIT);
            return matches.map(({ id, fighters, engineVersion, seed, seedHash, winner, finishedAt }) => ({
                id,
                fighters,
                engineVersion,
                seed,
                seedHash,
                winner,
                finishedAt,
            }));
        } catch (error) {
            request.log.error({ err: error }, 'Failed to load recent Monster Bash bouts');
            return reply.code(503).send({ error: 'Monster Bash history unavailable' });
        }
    });

    // Start after the server is listening, and never let a slow or down
    // database hold up the rest of the API.
    let startTimer = null;
    const start = () => {
        loop.start().catch((error) => {
            log.error({ err: error }, `Monster Bash failed to start; retrying in ${START_RETRY_MS / 1000}s`);
            startTimer = setTimeout(start, START_RETRY_MS);
        });
    };
    fastify.addHook('onReady', async () => {
        start();
    });
    fastify.addHook('onClose', async () => {
        clearTimeout(startTimer);
        loop.stop();
        hub.close();
        await odds.close();
    });
}
