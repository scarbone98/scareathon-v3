import websocket from '@fastify/websocket';
import { RoomError, createRoomManager } from '../eightBitEvilV2/rooms.js';

// October Valley (github.com/Sclondon/OctoberValley), the 3D 8 Bit Evil, plays co-op
// through the same kind of rooms as 8 Bit Evil Returns V2: up to four players, a
// four-letter code, and this server relaying game packets between the host and the
// rest (see eightBitEvilV2/rooms.js). Its rooms are its own, and there's no
// server-run copy of the game: the player who made the room runs the fight.

const HEARTBEAT_MS = 30_000;
const SWEEP_MS = 2_000;
const ERROR_MESSAGES = {
    missing: "There's no room with that code.",
    full: 'That room already has four players.',
    started: 'That game has already started.',
    busy: 'Too many games right now. Try again in a minute.',
    notHost: 'Only the host can start.',
    gone: "That game isn't holding your seat any more.",
};

export default async function octoberValleyRoutes(fastify, { rooms: injectedRooms } = {}) {
    const log = fastify.log.child({ feature: 'october-valley' });
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
        socket.on('error', (error) => log.warn({ err: error }, 'October Valley socket error'));
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
                    case 'create':
                        rooms.create(socket, message);
                        break;
                    case 'join':
                        rooms.join(socket, message);
                        break;
                    case 'rejoin':
                        rooms.rejoin(socket, message);
                        break;
                    case 'pick':
                        rooms.pick(socket, message);
                        break;
                    case 'start':
                        rooms.start(socket);
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
                    log.error({ err: error }, 'October Valley message failed');
                }
            }
        });
    });
}
