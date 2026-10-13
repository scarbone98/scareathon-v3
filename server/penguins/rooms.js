// Race rooms for Penguin Slide: up to eight players and a four-letter code.
//
// Every player's game runs its own penguin and tells the others where it is. One
// player is the host: their game also runs the computer penguins, calls the start
// and keeps the results. This server keeps the room and passes packets along; it
// doesn't simulate anything.
//
// Control messages are JSON text. Game packets are binary and go to everyone else
// in the room (or to one seat), unchanged apart from the first byte: the sender
// writes who it's for there (BROADCAST for everyone), and the server rewrites it
// to the sender's seat, so a player always knows who a packet came from.
//
// A room outlives its races: when one ends the players are back in the lobby, and
// friends can join at any time (the game seats a latecomer in the next race).
//
// Dropped connections don't end anything. A player whose socket closes keeps
// their seat as "away" for a while and can take it back with the token they were
// given. If the host is away for more than a moment, or leaves, the next player
// becomes the host and the race carries on. A room closes when its last player
// has gone. Rooms live in memory only.

import { randomBytes, randomInt } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;
export const MAX_PLAYERS = 8;
export const BROADCAST = 255;
const MAX_ROOMS = 300;
const NAME_MAX = 12;
const ID_MAX = 24;
const IDLE_TTL_MS = 30 * 60_000;
// How long a dropped player's seat is held.
export const AWAY_MS = { lobby: 20_000, race: 45_000 };
// How long the room waits for a dropped host before someone else takes over.
export const HOST_GRACE_MS = 3_000;
// Per second, per socket: a penguin's state 15 times a second (the host sends the
// computer penguins too), and now and then a snowball.
const LIMITS = { packets: 240, bytes: 120_000 };
const OPEN = 1;

export class RoomError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export function cleanName(name, fallback = 'PENGUIN') {
    const text = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, NAME_MAX) : '';
    return text || fallback;
}

export function cleanCode(code) {
    return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

// Colours and courses are the game's; only their shape is checked here.
export function cleanId(id, fallback) {
    return typeof id === 'string' && id.length <= ID_MAX && /^[a-z0-9_]+$/.test(id) ? id : fallback;
}

export function createRoomManager({ log, now = () => Date.now() } = {}) {
    const rooms = new Map(); // code -> room
    const seats = new Map(); // socket -> { room, slot }

    const send = (socket, message) => {
        if (socket?.readyState === OPEN) socket.send(JSON.stringify(message));
    };
    const seated = (room) => room.players.filter(Boolean);
    const roster = (room) => seated(room).map(({ slot, name, skin, socket }) => ({ slot, name, skin, away: !socket }));
    const broadcast = (room, message, except = null) => {
        for (const p of seated(room)) if (p.socket && p.socket !== except) send(p.socket, message);
    };
    const announce = (room) => {
        for (const p of seated(room)) {
            send(p.socket, {
                type: 'room', code: room.code, slot: p.slot, token: p.token,
                host: p.slot === room.hostSlot, host_slot: room.hostSlot,
                public: room.public, course: room.course, racing: room.racing,
                players: roster(room), max: MAX_PLAYERS,
            });
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
            socket, slot, token: randomBytes(12).toString('hex'), awaySince: 0,
            name: cleanName(message.name),
            skin: cleanId(message.skin, 'classic'),
            window: now(), packets: 0, bytes: 0,
        };
        room.players[slot] = player;
        seats.set(socket, { room, slot });
        room.touched = now();
        return player;
    }

    function create(socket, message = {}) {
        if (rooms.size >= MAX_ROOMS) throw new RoomError('busy');
        if (seats.has(socket)) leave(socket);
        const room = {
            code: newCode(), players: [], hostSlot: 0, racing: false, touched: now(),
            public: message.public === true, course: cleanId(message.course, 'bunny'),
        };
        rooms.set(room.code, room);
        seat(socket, room, 0, message);
        announce(room);
        return room.code;
    }

    function freeSlot(room) {
        for (let i = 0; i < MAX_PLAYERS; i += 1) if (!room.players[i]) return i;
        return -1;
    }

    function join(socket, message = {}) {
        const room = rooms.get(cleanCode(message.code));
        if (!room) throw new RoomError('missing');
        const slot = freeSlot(room);
        if (slot === -1) throw new RoomError('full');
        if (seats.has(socket)) leave(socket);
        seat(socket, room, slot, message);
        announce(room);
        return room.code;
    }

    // Public rooms with a seat free and a host who is there. Rooms waiting in the
    // lobby come first, then the fullest, so groups fill up.
    function listPublic(limit = 20) {
        const open = [];
        for (const room of rooms.values()) {
            if (!room.public || !room.players[room.hostSlot]?.socket) continue;
            const players = seated(room).length;
            if (players >= MAX_PLAYERS) continue;
            open.push({ code: room.code, host: room.players[room.hostSlot].name, players, max: MAX_PLAYERS, course: room.course, racing: room.racing });
        }
        open.sort((a, b) => Number(a.racing) - Number(b.racing) || b.players - a.players);
        return open.slice(0, limit);
    }

    // Any race will do: the best public room, or a new public one to wait in.
    function quick(socket, message = {}) {
        const [best] = listPublic(1);
        if (best) return join(socket, { ...message, code: best.code });
        return create(socket, { ...message, public: true });
    }

    // A player changes their name or colour; the host changes the course, opens
    // or shuts the room to the public, and says when a race is on.
    function set(socket, message = {}) {
        const at = seats.get(socket);
        if (!at) return;
        const { room, slot } = at;
        const player = room.players[slot];
        if (message.name !== undefined) player.name = cleanName(message.name, player.name);
        if (message.skin !== undefined) player.skin = cleanId(message.skin, player.skin);
        if (slot === room.hostSlot) {
            if (message.course !== undefined) room.course = cleanId(message.course, room.course);
            if (message.public !== undefined) room.public = message.public === true;
            if (message.racing !== undefined) room.racing = message.racing === true;
        }
        room.touched = now();
        announce(room);
    }

    function close(room, reason) {
        for (const p of seated(room)) {
            if (p.socket) seats.delete(p.socket);
            send(p.socket, { type: 'closed', reason });
        }
        rooms.delete(room.code);
    }

    // The host's seat passes to the lowest seat with a live connection.
    // Returns false if nobody is there to take it.
    function passHost(room) {
        const next = seated(room).find((p) => p.socket && p.slot !== room.hostSlot);
        if (!next) return false;
        room.hostSlot = next.slot;
        log?.debug?.({ code: room.code, slot: next.slot }, 'Penguin Slide: new host');
        return true;
    }

    function free(room, slot) {
        const player = room.players[slot];
        if (player?.socket) seats.delete(player.socket);
        room.players[slot] = undefined;
        if (seated(room).length === 0) {
            rooms.delete(room.code);
            return;
        }
        if (slot === room.hostSlot && !passHost(room)) {
            // Only away players are left: the first of them is host if they return.
            room.hostSlot = seated(room)[0].slot;
        }
        broadcast(room, { type: 'left', slot });
        announce(room);
    }

    // Leaving on purpose: the seat is freed now.
    function leave(socket) {
        const at = seats.get(socket);
        if (!at) return;
        free(at.room, at.slot);
    }

    // The socket closed without a goodbye: hold the seat for a while.
    function disconnect(socket) {
        const at = seats.get(socket);
        if (!at) return;
        seats.delete(socket);
        const player = at.room.players[at.slot];
        if (!player || player.socket !== socket) return;
        player.socket = null;
        player.awaySince = now();
        broadcast(at.room, { type: 'away', slot: at.slot });
        announce(at.room);
    }

    // Back in the seat a token was given for.
    function rejoin(socket, message = {}) {
        const room = rooms.get(cleanCode(message.code));
        const token = String(message.token ?? '');
        const player = room && seated(room).find((p) => token.length > 0 && p.token === token);
        if (!player) throw new RoomError('gone');
        if (seats.has(socket) && seats.get(socket).room !== room) leave(socket);
        if (player.socket && player.socket !== socket) {
            // An older connection still thinks it's in: this one wins.
            seats.delete(player.socket);
            send(player.socket, { type: 'closed', reason: 'replaced' });
        }
        player.socket = socket;
        player.awaySince = 0;
        player.window = now();
        player.packets = 0;
        player.bytes = 0;
        seats.set(socket, { room, slot: player.slot });
        room.touched = now();
        // A room whose host is away belongs to whoever is there.
        if (!room.players[room.hostSlot]?.socket) room.hostSlot = player.slot;
        broadcast(room, { type: 'back', slot: player.slot }, socket);
        announce(room);
    }

    // A game packet. Returns false if it was dropped.
    function relay(socket, data) {
        const at = seats.get(socket);
        if (!at || data.length < 2) return false;
        const { room, slot } = at;
        const player = room.players[slot];
        const t = now();
        if (t - player.window >= 1000) {
            player.window = t;
            player.packets = 0;
            player.bytes = 0;
        }
        player.packets += 1;
        player.bytes += data.length;
        if (player.packets > LIMITS.packets || player.bytes > LIMITS.bytes) return false;
        room.touched = t;
        const target = data[0];
        const out = Buffer.from(data);
        out[0] = slot;
        for (const p of seated(room)) {
            if (p.slot !== slot && (target === BROADCAST || target === p.slot) && p.socket?.readyState === OPEN) {
                p.socket.send(out, { binary: true });
            }
        }
        return true;
    }

    // Hands on a dropped host's job, frees seats whose player has been away too
    // long, and drops rooms nobody has touched in a long while.
    function sweep() {
        const t = now();
        for (const room of [...rooms.values()]) {
            const host = room.players[room.hostSlot];
            if (host && !host.socket && t - host.awaySince > HOST_GRACE_MS && passHost(room)) announce(room);
            const limit = room.racing ? AWAY_MS.race : AWAY_MS.lobby;
            for (const p of seated(room)) {
                if (!p.socket && t - p.awaySince > limit && rooms.has(room.code)) free(room, p.slot);
            }
            if (rooms.has(room.code) && t - room.touched > IDLE_TTL_MS) close(room, 'idle');
        }
    }

    function closeAll() {
        rooms.clear();
        seats.clear();
    }

    return { create, join, quick, rejoin, set, leave, disconnect, relay, sweep, listPublic, close: closeAll, size: () => rooms.size, room: (code) => rooms.get(code) };
}
