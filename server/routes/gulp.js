import websocket from '@fastify/websocket';
import { createArenaManager } from '../gulp/arena.js';

// Gulp's arena (github.com/Sclondon/Gulp): one socket per player for
// as long as they're in the shared sea. See gulp/arena.js for what the room
// keeps and what the games tell each other. Guests can play.

const HEARTBEAT_MS = 30_000;
const TICK_MS = 1000;

export default async function gulpRoutes(fastify, { arena: injectedArena } = {}) {
    const log = fastify.log.child({ feature: 'gulp' });
    const arena = injectedArena ?? createArenaManager({ log });
    if (!fastify.hasDecorator('websocketServer')) {
        await fastify.register(websocket, { options: { maxPayload: 8192 } });
    }
    const sockets = new Set();
    const heartbeat = setInterval(() => {
        for (const socket of sockets) {
            if (socket.isAlive === false) {
                socket.terminate();
                continue;
            }
            socket.isAlive = false;
            socket.ping();
        }
    }, HEARTBEAT_MS);
    heartbeat.unref();
    const tick = setInterval(() => arena.tick(), TICK_MS);
    tick.unref();
    fastify.addHook('onClose', async () => {
        clearInterval(heartbeat);
        clearInterval(tick);
        arena.close();
    });

    fastify.get('/ws', { websocket: true }, (socket) => {
        sockets.add(socket);
        socket.isAlive = true;
        socket.on('pong', () => {
            socket.isAlive = true;
        });
        socket.on('error', (error) => log.warn({ err: error }, 'Gulp socket error'));
        socket.on('close', () => {
            sockets.delete(socket);
            arena.disconnect(socket);
        });
        socket.on('message', (raw, isBinary) => {
            try {
                if (isBinary) {
                    arena.relay(socket, raw);
                    return;
                }
                if (raw.length > 400) return;
                arena.message(socket, JSON.parse(raw.toString()));
            } catch (error) {
                if (!(error instanceof SyntaxError)) log.error({ err: error }, 'Gulp message failed');
            }
        });
    });
}
