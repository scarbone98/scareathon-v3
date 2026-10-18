// Co-op rooms for Hippo Rapids: two or four hippos on one raft.
//
// The server runs the raft. Players send what their hippo is doing (walking round the rim,
// farting or not) and the server steps the shared physics (server/shared/hippoRapids) and
// broadcasts the raft, so everyone sees the same river. Seats nobody is sitting in are
// worked by bots, which is also how a seat is covered while its player's connection drops:
// they have RECONNECT_MS to come back (rejoining with their token) before the seat is freed.
// A friend with the room code can sit in any free seat, even mid-run.
//
// Rooms live in memory only.

import { randomBytes, randomInt } from 'node:crypto';
import { STEP, createSim, getLevel, sanitizeLevel } from '../shared/hippoRapids/index.js';
import { RoomError, cleanCode, cleanName } from '../frogBall/rooms.js';

export { RoomError, cleanCode, cleanName };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
export const RECONNECT_MS = 20_000;
const DONE_STREAM_MS = 12_000;
const ABANDONED_TTL_MS = 2 * 60_000;
const MAX_ROOMS = 300;
const MAX_INPUTS_PER_SECOND = 60;
// Call-outs a crew can shout to each other: GO!, WAIT, NOW!, OOPS.
export const SAY_COUNT = 4;
const SAY_GAP_MS = 350;
const MAX_CATCH_UP_S = 0.2;
export const BOT_SKILL = 0.5;
const DEFAULT_LEVEL = 'lagoon';

// A built-in's id, or a level someone made in the editor (cleaned up, so it can't hurt the sim).
function pickLevel(input) {
    if (typeof input === 'string' && getLevel(input)) return { id: input, def: null };
    const def = input && typeof input === 'object' ? sanitizeLevel(input) : null;
    return def ? { id: 'custom', def } : { id: DEFAULT_LEVEL, def: null };
}
const OPEN = 1;

export function createRoomManager({ log, now = () => Date.now() } = {}) {
    const rooms = new Map();

    const send = (player, message) => {
        const socket = player?.socket;
        if (socket && socket.readyState === OPEN) socket.send(JSON.stringify(message));
    };

    const broadcast = (room, message) => {
        const data = JSON.stringify(message);
        for (const player of room.players) {
            if (player?.socket && player.socket.readyState === OPEN) player.socket.send(data);
        }
    };

    function newCode() {
        for (let attempt = 0; attempt < 30; attempt++) {
            let code = '';
            for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
            if (!rooms.has(code)) return code;
        }
        throw new RoomError('busy');
    }

    const isConnected = (p) => !!p && !!p.socket && p.socket.readyState === OPEN;
    const connected = (room) => room.players.map(isConnected);

    function newPlayer(socket, name, seat) {
        return { name: cleanName(name, `HIPPO${seat + 1}`), socket, token: randomBytes(16).toString('hex'), goneAt: null, inputs: [] };
    }

    // Seats a bot works are the ones with nobody connected in them.
    function syncBots(room) {
        room.players.forEach((p, seat) => {
            const h = room.sim.hippos[seat];
            const human = isConnected(p);
            if (h.bot === human) {
                h.bot = !human;
                if (human) h.mv = 0;
                h.fart = false;
            }
        });
    }

    function roomInfo(room, seat) {
        return {
            type: 'room',
            code: room.code,
            seat,
            token: room.players[seat].token,
            status: room.status,
            seats: room.seats,
            level: room.level.id,
            def: room.level.def,
            public: room.public,
            host: room.host,
            names: room.players.map((p) => p?.name ?? null),
            connected: connected(room),
        };
    }

    function sendRoomInfo(room) {
        room.players.forEach((p, seat) => {
            if (p) send(p, roomInfo(room, seat));
        });
    }

    function attach(room, seat, socket) {
        const player = room.players[seat];
        if (player.socket && player.socket !== socket && player.socket.readyState === OPEN) {
            player.socket.close(4000, 'Joined from another tab');
        }
        player.socket = socket;
        player.goneAt = null;
        socket.hippoRapids = { code: room.code, seat };
        room.lastActive = now();
        syncBots(room);
    }

    function freshSim(room) {
        room.sim = createSim({ seats: room.seats, skill: BOT_SKILL, seed: randomInt(1, 1e6), level: room.level.def ?? room.level.id });
        syncBots(room);
    }

    // Someone left, or never came back. The host seat passes to whoever's still here.
    function removePlayer(room, seat, reason) {
        const gone = room.players[seat];
        if (gone?.socket) gone.socket.hippoRapids = null;
        room.players[seat] = null;
        if (!room.players.some(Boolean)) {
            rooms.delete(room.code);
            return;
        }
        if (room.host === seat) room.host = room.players.findIndex(Boolean);
        syncBots(room);
        broadcast(room, { type: 'left', seat, name: gone.name, reason });
        sendRoomInfo(room);
    }

    function playerFor(socket) {
        const link = socket.hippoRapids;
        if (!link) return null;
        const room = rooms.get(link.code);
        if (!room || room.players[link.seat]?.socket !== socket) return null;
        return { room, seat: link.seat, player: room.players[link.seat] };
    }

    function advance(room, t) {
        const dt = Math.min(MAX_CATCH_UP_S, (t - room.last) / 1000);
        room.last = t;
        room.acc += dt;
        let steps = 0;
        while (room.acc >= STEP) {
            room.acc -= STEP;
            room.sim.step(STEP);
            steps++;
        }
        if (!steps) return;
        const snap = room.sim.snapshot();
        broadcast(room, { type: 'snap', ...snap });
        if (snap.ph === 'done' && room.status === 'playing') {
            room.status = 'done';
            room.doneAt = t;
            log?.info({ code: room.code, seats: room.seats, run: snap.run, sinks: snap.sinks }, 'Hippo Rapids raft finished');
            sendRoomInfo(room);
        }
    }

    return {
        get size() {
            return rooms.size;
        },

        room(code) {
            return rooms.get(code) ?? null;
        },

        create(socket, { name, seats, level, public: isPublic }) {
            if (rooms.size >= MAX_ROOMS) throw new RoomError('busy');
            const count = seats === 2 ? 2 : 4;
            const room = {
                code: newCode(),
                seats: count,
                level: pickLevel(level),
                // Public rooms show up in the room finder and take quick-play players.
                public: isPublic !== false,
                players: Array(count).fill(null),
                host: 0,
                status: 'lobby',
                sim: null,
                last: now(),
                acc: 0,
                doneAt: 0,
                lastActive: now(),
            };
            room.players[0] = newPlayer(socket, name, 0);
            freshSim(room);
            rooms.set(room.code, room);
            attach(room, 0, socket);
            sendRoomInfo(room);
            return room;
        },

        // Rooms anyone can walk into: open seats, public, not ended. Fullest lobbies first.
        list() {
            const out = [];
            for (const room of rooms.values()) {
                if (!room.public) continue;
                const humans = connected(room).filter(Boolean).length;
                if (humans >= room.seats || humans === 0) continue;
                const level = room.level.def ?? getLevel(room.level.id)?.def;
                out.push({
                    code: room.code,
                    host: room.players[room.host]?.name ?? '',
                    level: level?.name ?? 'A river',
                    seats: room.seats,
                    humans,
                    status: room.status,
                });
            }
            out.sort((a, b) => (a.status === 'lobby' ? 0 : 1) - (b.status === 'lobby' ? 0 : 1) || b.humans - a.humans);
            return { type: 'rooms', rooms: out.slice(0, 24) };
        },

        // Straight into the best open public room, or start one.
        quick(socket, { name, seats }) {
            const open = this.list().rooms;
            if (open.length) return this.join(socket, { code: open[0].code, name });
            return this.create(socket, { name, seats, level: DEFAULT_LEVEL, public: true });
        },

        setPublic(socket, { public: isPublic }) {
            const found = playerFor(socket);
            if (!found || found.seat !== found.room.host) return;
            found.room.public = !!isPublic;
            sendRoomInfo(found.room);
        },

        peek(code) {
            const room = rooms.get(cleanCode(code));
            if (!room) return { type: 'room-info', code, status: 'missing' };
            const free = room.players.filter((p) => !isConnected(p)).length;
            return { type: 'room-info', code: room.code, status: free ? 'open' : 'full', seats: room.seats, free, host: room.players[room.host]?.name ?? '' };
        },

        join(socket, { code, name }) {
            const room = rooms.get(cleanCode(code));
            if (!room) throw new RoomError('missing');
            // A seat whose player isn't connected can be taken, so a closed tab never locks a
            // room: the same player from a new tab, or a new friend, gets back in.
            const seat = room.players.findIndex((p) => !isConnected(p));
            if (seat < 0) throw new RoomError('full');
            room.players[seat] = newPlayer(socket, name, seat);
            attach(room, seat, socket);
            sendRoomInfo(room);
            return room;
        },

        // A player coming back after a dropped connection.
        rejoin(socket, { code, token }) {
            const room = rooms.get(cleanCode(code));
            const seat = room ? room.players.findIndex((p) => p?.token === token) : -1;
            if (!room || seat < 0) throw new RoomError('missing');
            attach(room, seat, socket);
            sendRoomInfo(room);
        },

        // The host sets the raft off down the river (any empty seats get bots).
        start(socket) {
            const found = playerFor(socket);
            if (!found || found.seat !== found.room.host) return;
            const { room } = found;
            if (room.status === 'playing') return;
            freshSim(room);
            room.status = 'playing';
            room.last = now();
            room.acc = 0;
            log?.info({ code: room.code, seats: room.seats, humans: connected(room).filter(Boolean).length }, 'Hippo Rapids raft launched');
            broadcast(room, { type: 'start' });
            sendRoomInfo(room);
        },

        // The host picks which river to raft, from the dock.
        setLevel(socket, { level }) {
            const found = playerFor(socket);
            if (!found || found.seat !== found.room.host || found.room.status === 'playing') return;
            found.room.level = pickLevel(level);
            freshSim(found.room);
            found.room.status = 'lobby';
            sendRoomInfo(found.room);
        },

        // Back to the dock, same room, same crew.
        again(socket) {
            const found = playerFor(socket);
            if (!found || found.seat !== found.room.host || found.room.status === 'lobby') return;
            freshSim(found.room);
            found.room.status = 'lobby';
            sendRoomInfo(found.room);
        },

        // What a player's hippo is doing: -1/0/1 round the rim, and whether it's farting.
        input(socket, { mv, f }) {
            const found = playerFor(socket);
            if (!found) return;
            const t = now();
            found.player.inputs = found.player.inputs.filter((at) => t - at < 1000);
            if (found.player.inputs.length >= MAX_INPUTS_PER_SECOND) return;
            found.player.inputs.push(t);
            found.room.sim.setInput(found.seat, Number(mv) || 0, !!f);
        },

        // A quick call-out, shown over the sender's hippo on everyone's screen.
        say(socket, { k }) {
            const found = playerFor(socket);
            if (!found || !Number.isInteger(k) || k < 0 || k >= SAY_COUNT) return;
            const t = now();
            if (t - (found.player.saidAt ?? 0) < SAY_GAP_MS) return;
            found.player.saidAt = t;
            broadcast(found.room, { type: 'say', seat: found.seat, k });
        },

        leave(socket) {
            const found = playerFor(socket);
            if (!found) return;
            removePlayer(found.room, found.seat, 'left');
            log?.info({ code: found.room.code, seat: found.seat }, 'Hippo Rapids player left');
        },

        disconnect(socket) {
            const found = playerFor(socket);
            if (!found) return;
            found.player.socket = null;
            found.player.goneAt = now();
            found.room.lastActive = now();
            syncBots(found.room);
            broadcast(found.room, { type: 'presence', connected: connected(found.room) });
        },

        // Runs every room's raft, frees the seats of players who never came back, and cleans
        // up old rooms.
        tick() {
            const t = now();
            for (const room of rooms.values()) {
                for (let seat = room.players.length - 1; seat >= 0; seat--) {
                    const p = room.players[seat];
                    if (p && p.goneAt !== null && t - p.goneAt > RECONNECT_MS) removePlayer(room, seat, 'dropped');
                }
                if (!rooms.has(room.code)) continue;
                const anyone = connected(room).some(Boolean);
                if (anyone) room.lastActive = t;
                if (!anyone && t - room.lastActive > ABANDONED_TTL_MS) {
                    for (const p of room.players) p?.socket?.close(4001, 'Room closed');
                    rooms.delete(room.code);
                    continue;
                }
                // The raft keeps drifting for a few seconds after the finish, then rests.
                if (room.status === 'playing' || (room.status === 'done' && t - room.doneAt < DONE_STREAM_MS)) advance(room, t);
                else room.last = t;
            }
        },

        close() {
            for (const room of rooms.values()) for (const p of room.players) p?.socket?.close(1001, 'Server shutting down');
            rooms.clear();
        },
    };
}
