// Gulp's arena (github.com/Sclondon/Gulp): a drop-in sea shared by whoever is playing.
//
// Everyone who plays online lands in the same room (a second one opens when the first
// is full). Each player is a fish that eats and grows; a player can eat another player
// that is no longer than 0.8 of its own length, exactly as the game's own rule has it
// for everything else in the sea. There are no rounds: you drop in small, grow for as
// long as you last, and start again small when you are eaten.
//
// Each player's game moves its own fish and keeps its own sea life (the other animals
// are not shared: only the players are). This server passes each fish's state on to the
// rest and keeps what everyone has to agree on: who is in the room, what each fish is
// and how long, who ate whom, and the high scores (the longest fish, by name, since the
// server started: kept in memory only).
//
// Control messages are JSON text. Fish states are binary, relayed as sent: byte 0 is the
// packet kind, then 14 bytes: id, flags, x, y, z (centimetres, int16), yaw, pitch
// (1/10000 radian, int16), length (millimetres, uint16). A game may only send its own.

import { cleanName } from '../eightBitEvilV2/rooms.js';

export const MAX_PLAYERS = 12;
export const BITE = 0.8; // the longest thing a mouth can eat, as a share of its owner
export const START_LENGTH = 0.18;
export const MAX_LENGTH = 30;
export const SAFE_MS = 3_000; // a fish just (re)spawned or just grown can't eat or be eaten
export const DEAD_MS = 1_000; // the least an eaten fish stays gone
export const BOARD = 10; // how many high scores are kept
export const K_STATE = 1;
export const STATE_BYTES = 14;
const MAX_ROOMS = 40;
const KINDS = 64; // a kind is a short name the games agree on; no more than this many characters
const LIMITS = { packets: 40, bytes: 4_000, texts: 30 }; // per second, per socket
const OPEN = 1;

const round3 = (n) => Math.round(n * 1000) / 1000;

export function createArenaManager({ log, now = () => Date.now() } = {}) {
    const rooms = new Set();
    const seats = new Map(); // socket -> { room, id, window, packets, bytes, texts }
    let board = []; // [{ name, len, kind }], longest first

    const send = (socket, message) => {
        if (socket?.readyState === OPEN) socket.send(JSON.stringify(message));
    };
    const broadcast = (room, message, except = null) => {
        const text = JSON.stringify(message);
        for (const socket of room.sockets) if (socket !== except && socket.readyState === OPEN) socket.send(text);
    };
    const describe = (e) => ({ id: e.id, name: e.name, kind: e.kind, len: e.len, alive: e.alive, eaten: e.eaten });
    const top = () => board.map((b) => [b.name, b.len, b.kind]);

    // A fish's length goes on the board if it is among the longest (one line a name)
    function score(ent) {
        const mine = board.find((b) => b.name === ent.name);
        if (mine && mine.len >= ent.len) return false;
        if (!mine && board.length >= BOARD && board[board.length - 1].len >= ent.len) return false;
        if (mine) {
            mine.len = ent.len;
            mine.kind = ent.kind;
        } else {
            board.push({ name: ent.name, len: ent.len, kind: ent.kind });
        }
        board.sort((a, b) => b.len - a.len);
        board = board.slice(0, BOARD);
        return true;
    }

    function join(socket, message = {}) {
        if (seats.has(socket)) leave(socket);
        let room = null;
        for (const r of rooms) if (r.sockets.size < MAX_PLAYERS && (!room || r.sockets.size > room.sockets.size)) room = r;
        if (!room) {
            if (rooms.size >= MAX_ROOMS) {
                send(socket, { t: 'full' });
                return null;
            }
            room = { ents: new Map(), sockets: new Set(), boardSent: '' };
            rooms.add(room);
        }
        let id = 1;
        while (room.ents.has(id)) id += 1;
        const ent = {
            id, name: cleanName(message.name, 'FISH'), owner: socket, kind: 'sardine', len: START_LENGTH,
            alive: true, eaten: 0, x: 0, y: 0, z: 0, placed: false, safeUntil: now() + SAFE_MS, diedAt: 0,
        };
        room.ents.set(id, ent);
        broadcast(room, { t: 'ent', ...describe(ent) });
        room.sockets.add(socket);
        seats.set(socket, { room, id, window: now(), packets: 0, bytes: 0, texts: 0 });
        send(socket, { t: 'welcome', you: id, ents: [...room.ents.values()].map(describe), top: top(), bite: BITE, safe: SAFE_MS });
        return room;
    }

    function leave(socket) {
        const at = seats.get(socket);
        if (!at) return;
        seats.delete(socket);
        const { room, id } = at;
        room.sockets.delete(socket);
        room.ents.delete(id);
        if (room.sockets.size === 0) {
            rooms.delete(room);
            return;
        }
        broadcast(room, { t: 'gone', id });
    }

    function message(socket, m = {}) {
        const seat = seats.get(socket);
        if (m.t === 'join') {
            join(socket, m);
            return;
        }
        if (!seat || !allow(seat, 0)) return;
        const { room } = seat;
        const me = room.ents.get(seat.id);
        if (!me) return;
        const t = now();
        switch (m.t) {
            case 'grow': {
                // What it is now and how long (it ate something in its own sea, or became something new)
                const len = Number(m.len);
                if (!me.alive || !Number.isFinite(len) || len < START_LENGTH * 0.5 || len > MAX_LENGTH) return;
                const kind = typeof m.kind === 'string' && /^[a-z_]{1,64}$/.test(m.kind) ? m.kind.slice(0, KINDS) : me.kind;
                if (kind !== me.kind) me.safeUntil = Math.max(me.safeUntil, t + SAFE_MS * 0.6);
                me.kind = kind;
                me.len = round3(len);
                broadcast(room, { t: 'grow', e: me.id, kind: me.kind, len: me.len }, socket);
                score(me);
                break;
            }
            case 'ate': {
                // My fish ate another player's: the first claim to arrive wins
                const v = room.ents.get(Number(m.v));
                if (!v || v === me || !me.alive || !v.alive) return;
                if (t < me.safeUntil || t < v.safeUntil) return;
                if (v.len > me.len * BITE) return;
                if (me.placed && v.placed && Math.hypot(me.x - v.x, me.y - v.y, me.z - v.z) > me.len * 1.5 + 6) return;
                v.alive = false;
                v.diedAt = t;
                me.eaten += 1;
                broadcast(room, { t: 'kill', a: me.id, v: v.id, len: v.len, kind: v.kind });
                break;
            }
            case 'died': {
                // Something in its own sea ate it (or stung it)
                if (!me.alive) return;
                me.alive = false;
                me.diedAt = t;
                broadcast(room, { t: 'kill', a: 0, v: me.id, len: me.len, kind: me.kind, by: typeof m.by === 'string' ? m.by.slice(0, 24) : '' });
                break;
            }
            case 'spawn': {
                if (me.alive || t - me.diedAt < DEAD_MS) return;
                me.alive = true;
                me.kind = 'sardine';
                me.len = START_LENGTH;
                me.placed = false;
                me.safeUntil = t + SAFE_MS;
                broadcast(room, { t: 'alive', e: me.id, kind: me.kind, len: me.len });
                break;
            }
            case 'leave':
                leave(socket);
                break;
            default:
                break;
        }
    }

    // The per-second allowance; bytes > 0 is a state packet, 0 a text message
    function allow(seat, bytes) {
        const t = now();
        if (t - seat.window >= 1000) {
            seat.window = t;
            seat.packets = 0;
            seat.bytes = 0;
            seat.texts = 0;
        }
        if (bytes === 0) {
            seat.texts += 1;
            return seat.texts <= LIMITS.texts;
        }
        seat.packets += 1;
        seat.bytes += bytes;
        return seat.packets <= LIMITS.packets && seat.bytes <= LIMITS.bytes;
    }

    // A fish's state. Returns false if it was dropped.
    function relay(socket, data) {
        const seat = seats.get(socket);
        if (!seat || data.length !== 1 + STATE_BYTES || data[0] !== K_STATE) return false;
        if (!allow(seat, data.length)) return false;
        const { room } = seat;
        const buffer = Buffer.from(data);
        const ent = room.ents.get(buffer[1]);
        if (!ent || ent.owner !== socket) return false;
        ent.x = buffer.readInt16LE(3) / 100;
        ent.y = buffer.readInt16LE(5) / 100;
        ent.z = buffer.readInt16LE(7) / 100;
        ent.placed = true;
        for (const other of room.sockets) {
            if (other !== socket && other.readyState === OPEN) other.send(buffer, { binary: true });
        }
        return true;
    }

    // The high scores go out to a room when they have changed
    function tick() {
        const now_top = JSON.stringify(top());
        for (const room of rooms) {
            if (room.boardSent !== now_top) {
                room.boardSent = now_top;
                broadcast(room, { t: 'top', top: top() });
            }
        }
    }

    function close() {
        rooms.clear();
        seats.clear();
    }

    log?.debug?.('Gulp arena ready');
    return { join, leave, disconnect: leave, message, relay, tick, close, size: () => rooms.size, rooms: () => [...rooms], board: () => top() };
}
