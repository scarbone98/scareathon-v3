import websocket from '@fastify/websocket';
import { RoomError, createRoomManager } from '../penguins/rooms.js';

// Penguin Slide, the downhill penguin racer, races online through these rooms: up
// to eight players, a four-letter code, a list of public rooms, and this server
// passing game packets between the players (see penguins/rooms.js). No game runs
// here: each player's copy runs its own penguin and the host's runs the rest.

const HEARTBEAT_MS = 30_000;
const SWEEP_MS = 1_000;
const ERROR_MESSAGES = {
    missing: "There's no room with that code.",
    full: 'That room is full.',
    busy: 'Too many races right now. Try again in a minute.',
    gone: "That room isn't holding your seat any more.",
};

export default async function penguinsRoutes(fastify, { rooms: injectedRooms } = {}) {
    const log = fastify.log.child({ feature: 'penguins' });
    const rooms = injectedRooms ?? createRoomManager({ log });
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
    const sweep = setInterval(() => rooms.sweep(), SWEEP_MS);
    sweep.unref();
    fastify.addHook('onClose', async () => {
        clearInterval(heartbeat);
        clearInterval(sweep);
        rooms.close();
    });

    // One socket per player for the whole session. Guests can play.
    fastify.get('/ws', { websocket: true }, (socket) => {
        sockets.add(socket);
        socket.isAlive = true;
        socket.on('pong', () => {
            socket.isAlive = true;
        });
        socket.on('error', (error) => log.warn({ err: error }, 'Penguin Slide socket error'));
        socket.on('close', () => {
            sockets.delete(socket);
            rooms.disconnect(socket);
        });
        socket.on('message', (raw, isBinary) => {
            if (isBinary) {
                rooms.relay(socket, raw);
                return;
            }
            let message;
            try {
                message = JSON.parse(raw.toString());
            } catch {
                return;
            }
            try {
                switch (message?.type) {
                    case 'list':
                        socket.send(JSON.stringify({ type: 'rooms', rooms: rooms.listPublic() }));
                        break;
                    case 'create':
                        rooms.create(socket, message);
                        break;
                    case 'join':
                        rooms.join(socket, message);
                        break;
                    case 'quick':
                        rooms.quick(socket, message);
                        break;
                    case 'rejoin':
                        rooms.rejoin(socket, message);
                        break;
                    case 'set':
                        rooms.set(socket, message);
                        break;
                    case 'leave':
                        rooms.leave(socket);
                        break;
                    default:
                        break;
                }
            } catch (error) {
                if (error instanceof RoomError) {
                    socket.send(JSON.stringify({ type: 'error', code: error.code, message: ERROR_MESSAGES[error.code] ?? 'Something went wrong.' }));
                } else {
                    log.error({ err: error }, 'Penguin Slide message failed');
                }
            }
        });
    });
}
