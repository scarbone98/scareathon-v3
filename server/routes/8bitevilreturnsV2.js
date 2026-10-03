import websocket from '@fastify/websocket';
import pool from '../db/mockDB.js';
import { getGameId } from './8bitevilreturns.js';
import { RoomError, createRoomManager } from '../eightBitEvilV2/rooms.js';
import { createLauncher } from '../eightBitEvilV2/launcher.js';

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

// 8 Bit Evil Returns V2 (the Godot remake, github.com/scarbone98/8BitEvilReturns-godot)
// keeps its own save: unlocks, feats, power-ups and lifetime totals. It sits
// in game_specific_data next to the Unity game's playerData row but never
// touches it. The game plays in the browser, so the server only checks the
// save is well-formed and in bounds; its content ids live in the game repo.

const DATA_TYPE = 'v2Save';
export const MAX_SAVE_BYTES = 40_000;
const MAX_LIST = 500;
const MAX_ID = 40;
const MAX_NUMBER = 1_000_000_000;

const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_ID && /^[a-z0-9_]+$/.test(value);
const isCount = (value) => Number.isInteger(value) && value >= 0 && value <= MAX_NUMBER;

function idList(value) {
    if (!Array.isArray(value) || value.length > MAX_LIST || !value.every(isId)) return null;
    return [...new Set(value)];
}

function countMap(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const entries = Object.entries(value);
    if (entries.length > MAX_LIST || !entries.every(([key, count]) => isId(key) && isCount(count))) return null;
    return Object.fromEntries(entries);
}

// Returns { save } or { error }.
export function sanitizeV2Save(save) {
    if (save === null || typeof save !== 'object' || Array.isArray(save)) return { error: 'Save must be an object' };
    if (JSON.stringify(save).length > MAX_SAVE_BYTES) return { error: 'Save too large' };
    const clean = {
        version: save.version,
        silver: save.silver,
        best: save.best,
        selected: save.selected,
        stage: save.stage,
        unlocked: idList(save.unlocked),
        feats: idList(save.feats),
        evolved: idList(save.evolved),
        seen: idList(save.seen),
        powerups: countMap(save.powerups),
        totals: countMap(save.totals),
        kinds: countMap(save.kinds),
    };
    if (!isCount(clean.version) || !isCount(clean.silver) || !isCount(clean.best)) return { error: 'Bad numbers' };
    if (!isId(clean.selected) || !isId(clean.stage)) return { error: 'Bad hero or stage' };
    for (const key of ['unlocked', 'feats', 'evolved', 'seen', 'powerups', 'totals', 'kinds']) {
        if (clean[key] === null) return { error: `Bad ${key}` };
    }
    return { save: clean };
}

async function readSave(userId, gameId) {
    const result = await pool.query(
        'SELECT data FROM game_specific_data WHERE user_id = $1 AND game_id = $2 AND data_type = $3',
        [userId, gameId, DATA_TYPE]
    );
    const data = result.rows[0]?.data;
    return data ? { save: data.save ?? null, revision: data.revision ?? null } : { save: null, revision: null };
}

export default async function eightBitEvilV2Routes(fastify, { rooms: injectedRooms, launcher: injectedLauncher } = {}) {
    const log = fastify.log.child({ feature: '8bit-evil-v2' });
    // Headless game copies host co-op rooms (players host if they can't start).
    const launcher = injectedRooms ? null : (injectedLauncher ?? createLauncher({ log }));
    const rooms = injectedRooms ?? createRoomManager({ log, launcher });
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
        launcher?.stopAll();
    });

    // Co-op rooms: one socket per player for the whole session. Guests can play.
    fastify.get('/ws', { websocket: true }, (socket) => {
        sockets.add(socket);
        socket.isAlive = true;
        socket.on('pong', () => {
            socket.isAlive = true;
        });
        socket.on('error', (error) => log.warn({ err: error }, '8 Bit Evil V2 socket error'));
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
                    case 'host':
                        rooms.hostJoin(socket, message);
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
                    log.error({ err: error }, '8 Bit Evil V2 message failed');
                }
            }
        });
    });

    fastify.get('/save', async (request, reply) => {
        try {
            return await readSave(request.user.sub, await getGameId());
        } catch (err) {
            request.log.error(err);
            return reply.code(500).send({ error: 'Could not load your save' });
        }
    });

    // Writes the save if `revision` is still the latest (null for the first
    // save). Otherwise answers 409 with the newer save, which the game merges.
    fastify.put('/save', async (request, reply) => {
        const { revision } = request.body ?? {};
        if (revision !== null && !(Number.isInteger(revision) && revision >= 1)) {
            return reply.code(400).send({ error: 'Bad revision' });
        }
        const checked = sanitizeV2Save(request.body?.save);
        if (checked.error) return reply.code(400).send({ error: checked.error });
        const userId = request.user.sub;
        try {
            const gameId = await getGameId();
            const save = JSON.stringify(checked.save);
            const result = revision === null
                ? await pool.query(`
                    INSERT INTO game_specific_data (user_id, game_id, data_type, data)
                    VALUES ($1, $2, $3, jsonb_build_object('save', $4::jsonb, 'revision', 1))
                    ON CONFLICT (user_id, game_id, data_type) DO NOTHING
                    RETURNING (data->>'revision')::int AS revision
                `, [userId, gameId, DATA_TYPE, save])
                : await pool.query(`
                    UPDATE game_specific_data
                    SET data = jsonb_build_object('save', $4::jsonb, 'revision', (data->>'revision')::int + 1),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = $1 AND game_id = $2 AND data_type = $3
                      AND (data->>'revision')::int = $5
                    RETURNING (data->>'revision')::int AS revision
                `, [userId, gameId, DATA_TYPE, save, revision]);
            if (result.rows[0]) return { revision: result.rows[0].revision };
            const current = await readSave(userId, gameId);
            return reply.code(409).send({ error: 'Your save changed somewhere else', ...current });
        } catch (err) {
            request.log.error(err);
            return reply.code(500).send({ error: 'Could not save your progress' });
        }
    });
}
