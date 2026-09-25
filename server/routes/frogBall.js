import websocket from '@fastify/websocket';
import { RoomError, createRoomManager } from '../frogBall/rooms.js';

const LOOP_MS = 50;
const HEARTBEAT_MS = 30_000;

const ERROR_MESSAGES = {
    missing: "There's no room with that code.",
    full: 'That room already has two players.',
    busy: 'Too many games right now. Try again in a minute.',
};

export function isFrogBallEnabled(env = process.env) {
    return env.FROG_BALL_ENABLED !== 'false';
}

// Frog Ball co-op: one WebSocket per player carries the whole session.
// Guests can play; nothing here needs a login.
export default async function frogBallRoutes(fastify, { rooms: injectedRooms } = {}) {
    const log = fastify.log.child({ feature: 'frog-ball' });
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
        socket.on('error', (error) => log.warn({ err: error }, 'Frog Ball socket error'));
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
                    case 'state':
                        rooms.state(socket, message);
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
                    case 'go':
                        rooms.go(socket, message);
                        break;
                    case 'fly':
                        rooms.fly(socket, message);
                        break;
                    case 'goal':
                        rooms.goal(socket, message);
                        break;
                    case 'fail':
                        rooms.fail(socket, message);
                        break;
                    case 'leave':
                        rooms.leave(socket);
                        break;
                    // The client's clock sync: the server's time comes back with the echo.
                    case 'ping':
                        socket.send(JSON.stringify({ type: 'pong', t: message.t, now: Date.now() }));
                        break;
                    default:
                        break;
                }
            } catch (error) {
                if (error instanceof RoomError) {
                    socket.send(JSON.stringify({ type: 'error', code: error.code, message: ERROR_MESSAGES[error.code] ?? 'Something went wrong.' }));
                } else {
                    log.error({ err: error }, 'Frog Ball message failed');
                }
            }
        });
    });
}
