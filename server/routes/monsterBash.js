import websocket from '@fastify/websocket';
import { TICK_RATE } from '../shared/monster-bash/index.js';
import { ChatRefusedError, createChatRoom } from '../monsterBash/chatRoom.js';
import { MonsterBashLoop } from '../monsterBash/matchLoop.js';
import { createOddsService } from '../monsterBash/oddsService.js';
import { BetRefusedError, createMatchRepository } from '../monsterBash/repository.js';
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

export const MIN_BET = 1;

// Returns the bet to place, or null if the request is malformed.
export function parseBetRequest(body, maxBet) {
    const matchId = typeof body?.matchId === 'string' || typeof body?.matchId === 'number' ? String(body.matchId) : '';
    const { side, amount } = body ?? {};
    if (!/^\d+$/.test(matchId)) return null;
    if (side !== 0 && side !== 1) return null;
    if (!Number.isSafeInteger(amount) || amount < MIN_BET || amount > maxBet) return null;
    return { matchId, side, amount };
}

const BET_REFUSAL_MESSAGES = {
    betting_closed: 'Betting is closed for this bout.',
    already_bet: 'You already have a bet on this bout.',
    insufficient_funds: "You don't have enough coins for that bet.",
    invalid_side: 'Pick a monster to bet on.',
    invalid_amount: 'That bet amount is not allowed.',
};

const CHAT_REFUSAL_MESSAGES = {
    empty: 'Type a message first.',
    too_long: 'That message is too long.',
    slow_down: "You're sending messages too fast.",
};

export default async function monsterBashRoutes(fastify, { repo = createMatchRepository() } = {}) {
    const log = fastify.log.child({ feature: 'monster-bash' });
    const hub = createViewerHub({ log });
    const chat = createChatRoom({ lookupUsername: (userId) => repo.getUsername(userId) });
    const maxBet = readPositiveInt(process.env.MONSTER_BASH_MAX_BET, 500);
    const odds = createOddsService({ rollouts: ODDS_ROLLOUTS, checkpointEvery: TICK_RATE, log });
    const loop = new MonsterBashLoop({
        repo,
        odds,
        hub,
        chat,
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

    // The signed-in player's coins and their bet on the current bout.
    fastify.get('/me', async (request, reply) => {
        try {
            const account = await repo.getAccount(request.user.sub, loop.current?.id ?? null);
            return { ...account, matchId: loop.current?.id ?? null, limits: { minBet: MIN_BET, maxBet } };
        } catch (error) {
            request.log.error({ err: error }, 'Failed to load Monster Bash account');
            return reply.code(503).send({ error: 'Account unavailable' });
        }
    });

    fastify.post('/bets', async (request, reply) => {
        const bet = parseBetRequest(request.body, maxBet);
        if (!bet) {
            return reply.code(400).send({ error: 'invalid_bet', message: `Pick a monster and bet ${MIN_BET} to ${maxBet} coins.` });
        }
        try {
            const result = await loop.placeBet({ userId: request.user.sub, ...bet });
            return { bet: { matchId: bet.matchId, side: bet.side, amount: bet.amount, status: 'open' }, balance: Number(result.balance) };
        } catch (error) {
            if (error instanceof BetRefusedError) {
                return reply.code(409).send({ error: error.code, message: BET_REFUSAL_MESSAGES[error.code] });
            }
            request.log.error({ err: error }, 'Failed to place Monster Bash bet');
            return reply.code(503).send({ error: 'bet_failed', message: 'Could not place your bet. Try again.' });
        }
    });

    fastify.post('/chat', async (request, reply) => {
        try {
            const message = await chat.post(request.user.sub, request.body?.text);
            hub.broadcast({ type: 'chat', message });
            return reply.code(201).send({ message });
        } catch (error) {
            if (error instanceof ChatRefusedError) {
                const status = error.code === 'slow_down' ? 429 : 400;
                return reply.code(status).send({ error: error.code, message: CHAT_REFUSAL_MESSAGES[error.code] });
            }
            request.log.error({ err: error }, 'Failed to post Monster Bash chat');
            return reply.code(503).send({ error: 'chat_failed', message: 'Could not send your message.' });
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
