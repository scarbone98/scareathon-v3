import websocket from '@fastify/websocket';
import { RoomError, createRoomManager } from '../cryptClash/rooms.js';

const LOOP_MS = 20;
const HEARTBEAT_MS = 30_000;

const ERROR_MESSAGES = {
    missing: "That challenge link has expired or doesn't exist.",
    full: 'Someone already accepted that challenge.',
    bad_deck: 'That deck is not valid.',
    busy: 'Too many games right now. Try again in a minute.',
};

export function isCryptClashEnabled(env = process.env) {
    return env.CRYPT_CLASH_ENABLED !== 'false';
}

// Crypt Clash friend matches: one WebSocket carries the whole session.
// Guests can play; nothing here needs a login.
export default async function cryptClashRoutes(fastify, { rooms: injectedRooms } = {}) {
    const log = fastify.log.child({ feature: 'crypt-clash' });
    const rooms = injectedRooms ?? createRoomManager({ log });

    if (!fastify.hasDecorator('websocketServer')) {
        await fastify.register(websocket, { options: { maxPayload: 8192 } });
    }

    const loop = injectedRooms ? null : setInterval(() => rooms.tick(), LOOP_MS);
    loop?.unref();
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

    fastify.addHook('onClose', async () => {
        clearInterval(loop);
        clearInterval(heartbeat);
        rooms.close();
    });

    fastify.get('/ws', { websocket: true }, (socket) => {
        sockets.add(socket);
        socket.isAlive = true;
        socket.on('pong', () => {
            socket.isAlive = true;
        });
        socket.on('error', (error) => log.warn({ err: error }, 'Crypt Clash socket error'));
        socket.on('close', () => {
            sockets.delete(socket);
            rooms.disconnect(socket);
        });
        socket.on('message', (raw) => {
            let message;
            try {
                message = JSON.parse(raw.toString());
            } catch {
                return;
            }
            try {
                switch (message?.type) {
                    case 'create':
                        rooms.create(socket, message);
                        break;
                    case 'peek':
                        socket.send(JSON.stringify(rooms.peek(String(message.code ?? ''))));
                        break;
                    case 'join':
                        rooms.join(socket, { ...message, code: String(message.code ?? '') });
                        break;
                    case 'rejoin':
                        rooms.rejoin(socket, { code: String(message.code ?? ''), token: String(message.token ?? '') });
                        break;
                    case 'play':
                        rooms.play(socket, message);
                        break;
                    case 'resync':
                        rooms.resync(socket);
                        break;
                    case 'rematch':
                        rooms.rematch(socket);
                        break;
                    case 'leave':
                        rooms.leave(socket);
                        break;
                    case 'ping':
                        socket.send(JSON.stringify({ type: 'pong', t: message.t }));
                        break;
                    default:
                        break;
                }
            } catch (error) {
                if (error instanceof RoomError) {
                    socket.send(JSON.stringify({ type: 'error', code: error.code, message: ERROR_MESSAGES[error.code] ?? 'Something went wrong.' }));
                } else {
                    log.error({ err: error }, 'Crypt Clash message failed');
                }
            }
        });
    });
}
