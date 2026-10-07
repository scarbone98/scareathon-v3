import websocket from '@fastify/websocket';
import pool from '../db/mockDB.js';
import { createRoomManager, RoomError, MAX_MESSAGE_BYTES } from '../wayside-fury/rooms.js';
import { isWaysideFuryDevAuth } from '../wayside-fury/devAuth.js';
import { listHosting } from '../wayside-fury/presence.js';

const LOOP_MS = 250;
const HEARTBEAT_MS = 30_000;
const ERRORS = {
    auth: 'Sign in to play co-op.',
    ticket: 'Your connection ticket expired. Reconnect to try again.',
    missing: "There's no room with that code or your seat expired.",
    full: 'That room already has four players.',
    already: 'You already have a seat in that room. Reconnect using your token.',
    busy: 'Too many games right now. Try again in a minute.',
    host: 'Only the host can send that update.',
    invalid: 'That co-op message is invalid.',
    size: 'That co-op message is too large.',
};

export default async function waysideFuryCoopRoutes(fastify, { rooms: injectedRooms, db = pool, env = process.env } = {}) {
    const log = fastify.log.child({ feature: 'wayside-fury-coop' });
    const rooms = injectedRooms ?? createRoomManager({ log });
    if (!fastify.hasDecorator('websocketServer')) {
        await fastify.register(websocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });
    }
    const sockets = new Set();
    const loop = injectedRooms ? null : setInterval(() => rooms.tick(), LOOP_MS);
    loop?.unref();
    const heartbeat = setInterval(() => {
        for (const socket of sockets) {
            if (socket.isAlive === false) { socket.terminate(); continue; }
            socket.isAlive = false;
            socket.ping();
        }
    }, HEARTBEAT_MS);
    heartbeat.unref();
    fastify.addHook('onClose', async () => {
        clearInterval(loop);
        clearInterval(heartbeat);
        for (const socket of sockets) socket.close(1001, 'Server shutdown');
        rooms.close();
    });

    fastify.post('/ticket', async (request, reply) => {
        if (typeof request.user?.sub !== 'string' || !request.user.sub.trim()) return reply.code(401).send({ error: ERRORS.auth });
        try {
            const result = await db.query('SELECT username FROM users WHERE id = $1', [request.user.sub]);
            if (!result.rows[0]) return reply.code(401).send({ error: ERRORS.auth });
            return { ticket: rooms.issueTicket({ userId: request.user.sub, name: result.rows[0].username }) };
        } catch (error) {
            log.error({ err: error }, 'Could not issue Wayside Fury connection ticket');
            return reply.code(error instanceof RoomError ? 503 : 500).send({ error: 'Could not connect to co-op.' });
        }
    });
    // Kept absent unless explicitly enabled locally; neither a production flag
    // nor a user-supplied URL parameter can enable this route.
    if (isWaysideFuryDevAuth(env)) {
        fastify.post('/dev-ticket', async (request, reply) => {
            const { userId, name } = request.body ?? {};
            if (typeof userId !== 'string' || !/^dev-[a-zA-Z0-9_-]{1,64}$/.test(userId)) return reply.code(400).send({ error: 'Use a dev- player identity.' });
            return { ticket: rooms.issueTicket({ userId, name }) };
        });
    }
    fastify.get('/hosting', async (request, reply) => {
        if (typeof request.user?.sub !== 'string' || !request.user.sub.trim()) return reply.code(401).send({ error: ERRORS.auth });
        return { hosts: listHosting() };
    });

    fastify.get('/ws', { websocket: true }, (socket) => {
        sockets.add(socket);
        socket.isAlive = true;
        const authDeadline = setTimeout(() => {
            if (!socket.waysideFuryUser) socket.close(4001, 'Authentication required');
        }, 10_000);
        authDeadline.unref();
        socket.on('pong', () => { socket.isAlive = true; });
        socket.on('error', (error) => log.warn({ err: error }, 'Wayside Fury socket error'));
        socket.on('close', () => {
            clearTimeout(authDeadline);
            sockets.delete(socket);
            rooms.disconnect(socket);
        });
        const fail = (code) => socket.send(JSON.stringify({ type: 'error', code, message: ERRORS[code] ?? 'Could not update co-op.' }));
        socket.on('message', (raw, binary) => {
            if (!rooms.accept(socket)) {
                socket.close(4008, 'Too many messages');
                return;
            }
            if (binary || raw.length > MAX_MESSAGE_BYTES) { fail(raw.length > MAX_MESSAGE_BYTES ? 'size' : 'invalid'); return; }
            let message;
            try { message = JSON.parse(raw.toString()); } catch { fail('invalid'); return; }
            if (!message || typeof message !== 'object' || Array.isArray(message)) { fail('invalid'); return; }
            try {
                if (message.type !== 'auth' && !socket.waysideFuryUser) throw new RoomError('auth');
                switch (message.type) {
                    case 'auth':
                        rooms.auth(socket, message);
                        clearTimeout(authDeadline);
                        break;
                    case 'create': rooms.create(socket); break;
                    case 'join': rooms.join(socket, message); break;
                    case 'rejoin': rooms.rejoin(socket, message); break;
                    case 'peek': socket.send(JSON.stringify(rooms.peek(socket, message))); break;
                    case 'leave': rooms.leave(socket); break;
                    case 'ping':
                        if (typeof message.t !== 'number' || !Number.isFinite(message.t)) throw new RoomError('invalid');
                        socket.send(JSON.stringify({ type: 'pong', t: message.t, now: Date.now() }));
                        break;
                    case 'hero': case 'input': case 'state': case 'hit': case 'reward': case 'revive': case 'damage':
                        rooms.relay(socket, message);
                        break;
                    default: throw new RoomError('invalid');
                }
            } catch (error) {
                if (error instanceof RoomError) fail(error.code);
                else log.error({ err: error }, 'Wayside Fury message failed');
            }
        });
    });
}
