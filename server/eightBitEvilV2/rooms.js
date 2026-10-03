// Co-op rooms for 8 Bit Evil Returns V2: up to four players, one horde.
//
// The host's game runs the whole fight (enemies, weapons, pickups) and streams
// it to the others; each player's game sends back where its hero is and what it
// picks on level-up. The server doesn't simulate anything. It hands out room
// codes, keeps the lobby (who's in, which hero they're playing), and relays
// game packets between the host and everyone else.
//
// Control messages are JSON text. Game packets are binary, relayed as-is apart
// from the first byte, which carries the seat: the host sets it to the seat it's
// sending to (BROADCAST for everyone), and the server rewrites it to the
// sender's seat before passing it on, so a player always knows who it came from
// and a guest can only ever talk to the host.
//
// If the host leaves, the room closes. Anyone else leaving frees their seat.
// Rooms live in memory only.

import { randomInt } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;
export const MAX_PLAYERS = 4;
export const BROADCAST = 255;
const MAX_ROOMS = 300;
const NAME_MAX = 12;
const ID_MAX = 40;
const WAITING_TTL_MS = 30 * 60_000;
// Per second, per socket. The host streams the fight, so it gets far more room.
const HOST_LIMITS = { packets: 240, bytes: 600_000 };
const GUEST_LIMITS = { packets: 90, bytes: 40_000 };
const OPEN = 1;

export class RoomError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export function cleanName(name, fallback = 'PLAYER') {
    const text = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, NAME_MAX) : '';
    return text || fallback;
}

export function cleanCode(code) {
    return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

// Hero and stage ids come from the game; only their shape is checked here.
export function cleanId(id, fallback) {
    return typeof id === 'string' && id.length <= ID_MAX && /^[a-z0-9_]+$/.test(id) ? id : fallback;
}

export function createRoomManager({ log, now = () => Date.now() } = {}) {
    const rooms = new Map(); // code -> room
    const seats = new Map(); // socket -> { room, slot }

    const send = (socket, message) => {
        if (socket?.readyState === OPEN) socket.send(JSON.stringify(message));
    };
    const roster = (room) => room.players.filter(Boolean).map(({ slot, name, hero }) => ({ slot, name, hero }));
    const broadcast = (room, message, except = null) => {
        for (const p of room.players) if (p && p.socket !== except) send(p.socket, message);
    };
    const announce = (room) => {
        for (const p of room.players) {
            if (p) send(p.socket, { type: 'room', code: room.code, slot: p.slot, host: p.slot === 0, started: room.started, stage: room.stage, players: roster(room) });
        }
    };

    function newCode() {
        for (let attempt = 0; attempt < 50; attempt += 1) {
            let code = '';
            for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
            if (!rooms.has(code)) return code;
        }
        throw new RoomError('busy');
    }

    function seat(socket, room, slot, message) {
        const player = {
            socket, slot,
            name: cleanName(message.name),
            hero: cleanId(message.hero, 'joe'),
            window: now(), packets: 0, bytes: 0,
        };
        room.players[slot] = player;
        seats.set(socket, { room, slot });
        room.touched = now();
        return player;
    }

    function create(socket, message = {}) {
        if (seats.has(socket)) leave(socket);
        if (rooms.size >= MAX_ROOMS) throw new RoomError('busy');
        const room = { code: newCode(), players: [], started: false, stage: 'graveyard', touched: now() };
        rooms.set(room.code, room);
        seat(socket, room, 0, message);
        announce(room);
        return room.code;
    }

    function join(socket, message = {}) {
        const room = rooms.get(cleanCode(message.code));
        if (!room) throw new RoomError('missing');
        if (room.started) throw new RoomError('started');
        let slot = -1;
        for (let i = 1; i < MAX_PLAYERS; i += 1) {
            if (!room.players[i]) {
                slot = i;
                break;
            }
        }
        if (slot === -1) throw new RoomError('full');
        if (seats.has(socket)) leave(socket);
        seat(socket, room, slot, message);
        announce(room);
    }

    // Lobby: a player changes hero, or the host changes stage.
    function pick(socket, message = {}) {
        const at = seats.get(socket);
        if (!at || at.room.started) return;
        const player = at.room.players[at.slot];
        if (message.hero !== undefined) player.hero = cleanId(message.hero, player.hero);
        if (message.stage !== undefined && at.slot === 0) at.room.stage = cleanId(message.stage, at.room.stage);
        at.room.touched = now();
        announce(at.room);
    }

    function start(socket) {
        const at = seats.get(socket);
        if (!at || at.slot !== 0) throw new RoomError('notHost');
        if (at.room.started) return;
        at.room.started = true;
        broadcast(at.room, { type: 'start', stage: at.room.stage, players: roster(at.room) });
    }

    function leave(socket) {
        const at = seats.get(socket);
        if (!at) return;
        seats.delete(socket);
        const { room, slot } = at;
        room.players[slot] = undefined;
        if (slot === 0) {
            // No host, no fight.
            for (const p of room.players) {
                if (p) {
                    seats.delete(p.socket);
                    send(p.socket, { type: 'closed', reason: 'host' });
                }
            }
            rooms.delete(room.code);
            return;
        }
        broadcast(room, { type: 'left', slot });
        announce(room);
    }

    // A game packet. Returns false if it was dropped.
    function relay(socket, data) {
        const at = seats.get(socket);
        if (!at || !at.room.started || data.length < 2) return false;
        const { room, slot } = at;
        const player = room.players[slot];
        const limits = slot === 0 ? HOST_LIMITS : GUEST_LIMITS;
        const t = now();
        if (t - player.window >= 1000) {
            player.window = t;
            player.packets = 0;
            player.bytes = 0;
        }
        player.packets += 1;
        player.bytes += data.length;
        if (player.packets > limits.packets || player.bytes > limits.bytes) return false;
        room.touched = t;
        const target = data[0];
        const out = Buffer.from(data);
        out[0] = slot;
        if (slot !== 0) {
            const host = room.players[0];
            if (host?.socket.readyState === OPEN) host.socket.send(out, { binary: true });
            return true;
        }
        for (const p of room.players) {
            if (p && p.slot !== 0 && (target === BROADCAST || target === p.slot) && p.socket.readyState === OPEN) {
                p.socket.send(out, { binary: true });
            }
        }
        return true;
    }

    // Drops rooms nobody has touched in a long while (tabs left open in a lobby).
    function sweep() {
        const t = now();
        for (const room of rooms.values()) {
            if (t - room.touched > WAITING_TTL_MS) {
                for (const p of room.players) {
                    if (p) {
                        seats.delete(p.socket);
                        send(p.socket, { type: 'closed', reason: 'idle' });
                    }
                }
                rooms.delete(room.code);
            }
        }
    }

    function close() {
        rooms.clear();
        seats.clear();
    }

    log?.debug?.('8 Bit Evil V2 rooms ready');
    return { create, join, pick, start, leave, disconnect: leave, relay, sweep, close, size: () => rooms.size, room: (code) => rooms.get(code) };
}
