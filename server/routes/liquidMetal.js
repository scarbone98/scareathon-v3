import websocket from '@fastify/websocket';
import { createArenaManager } from '../liquidMetal/arena.js';

// Liquid Metal's arena (github.com/Sclondon/LiquidMetal): one socket per player for
// as long as they're in the battle room. See liquidMetal/arena.js for what the room
// keeps and what the games tell each other. Guests can play.

const HEARTBEAT_MS = 30_000;
const TICK_MS = 250;

export default async function liquidMetalRoutes(fastify, { arena: injectedArena } = {}) {
    const log = fastify.log.child({ feature: 'liquid-metal' });
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
        socket.on('error', (error) => log.warn({ err: error }, 'Liquid Metal socket error'));
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
                if (!(error instanceof SyntaxError)) log.error({ err: error }, 'Liquid Metal message failed');
            }
        });
    });
}
