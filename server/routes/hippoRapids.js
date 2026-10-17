import websocket from '@fastify/websocket';
import { RoomError, createRoomManager } from '../hippoRapids/rooms.js';

const LOOP_MS = 50;
const HEARTBEAT_MS = 30_000;

const ERROR_MESSAGES = {
    missing: "There's no room with that code.",
    full: 'That raft is full.',
    busy: 'Too many rafts right now. Try again in a minute.',
};

export function isHippoRapidsEnabled(env = process.env) {
    return env.HIPPO_RAPIDS_ENABLED !== 'false';
}

// Hippo Rapids co-op: one WebSocket per player carries the whole session. The server runs the
// raft and streams it to everyone aboard. Guests can play; nothing here needs a login.
export default async function hippoRapidsRoutes(fastify, { rooms: injectedRooms } = {}) {
    const log = fastify.log.child({ feature: 'hippo-rapids' });
    const rooms = injectedRooms ?? createRoomManager({ log });

    if (!fastify.hasDecorator('websocketServer')) {
        await fastify.register(websocket, { options: { maxPayload: 4096 } });
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
        socket.on('error', (error) => log.warn({ err: error }, 'Hippo Rapids socket error'));
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
                    case 'in':
                        rooms.input(socket, message);
                        break;
                    case 'create':
                        rooms.create(socket, message);
                        break;
                    case 'peek':
                        socket.send(JSON.stringify(rooms.peek(message.code)));
                        break;
                    case 'join':
                        rooms.join(socket, message);
                        break;
                    case 'rejoin':
                        rooms.rejoin(socket, { code: message.code, token: String(message.token ?? '') });
                        break;
                    case 'start':
                        rooms.start(socket);
                        break;
                    case 'again':
                        rooms.again(socket);
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
                    log.error({ err: error }, 'Hippo Rapids message failed');
                }
            }
        });
    });
}
