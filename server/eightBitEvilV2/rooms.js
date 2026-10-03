// Co-op rooms for 8 Bit Evil Returns V2: up to four players, one horde.
//
// One copy of the game runs the whole fight (enemies, weapons, pickups) and
// streams it to the others; each player's game sends back where its hero is
// and what it picks on level-up. That copy is the host. Normally it's a
// headless copy of the game the server starts for the room (see launcher.js),
// sitting in its own seat (SERVER_SLOT) so no player's phone runs the fight
// and no player can tamper with it. If the server can't start one (switched
// off, at capacity, failed), the player who made the room hosts instead.
// The room's maker (seat 0) is its leader either way: they pick the stage and
// press start.
//
// This server keeps the lobby and relays game packets between the host and
// everyone else; it doesn't simulate anything itself.
//
// Control messages are JSON text. Game packets are binary, relayed as-is apart
// from the first byte, which carries the seat: the host sets it to the seat it's
// sending to (BROADCAST for everyone), and the server rewrites it to the
// sender's seat before passing it on, so a player always knows who it came from
// and a guest can only ever talk to the host.
//
// Dropped connections don't end anything. A player whose socket closes keeps
// their seat as "away" for a while and can take it back with the token they
// were given (a network blip, a phone locking, a page reload). Everyone else
// is told they're away and back. If the host drops, the room waits for them;
// if they don't return in time, the room closes. Leaving on purpose frees the
// seat at once (and a host leaving closes the room).
// Rooms live in memory only.

import { randomBytes, randomInt } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;
export const MAX_PLAYERS = 4;
export const BROADCAST = 255;
export const SERVER_SLOT = 4;  // the server-run host's seat, after the four players
export const LAUNCH_TIMEOUT_MS = 25_000;
const MAX_ROOMS = 300;
const NAME_MAX = 12;
const ID_MAX = 40;
const WAITING_TTL_MS = 30 * 60_000;
// How long a dropped player's seat is held.
export const AWAY_MS = { lobby: 20_000, game: 90_000 };
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

export function createRoomManager({ log, now = () => Date.now(), launcher = null, setTimer = setTimeout } = {}) {
    const rooms = new Map(); // code -> room
    const seats = new Map(); // socket -> { room, slot }

    const send = (socket, message) => {
        if (socket?.readyState === OPEN) socket.send(JSON.stringify(message));
    };
    const roster = (room) => room.players.filter((p) => p && p.slot !== SERVER_SLOT).map(({ slot, name, hero, socket }) => ({ slot, name, hero, away: !socket }));
    const broadcast = (room, message, except = null) => {
        for (const p of room.players) if (p && p.socket && p.socket !== except) send(p.socket, message);
    };
    const announce = (room) => {
        for (const p of room.players) {
            if (p?.socket) {
                send(p.socket, {
                    type: 'room', code: room.code, slot: p.slot, token: p.token,
                    host: p.slot === room.hostSlot, host_slot: room.hostSlot, leader: p.slot === 0,
                    started: room.started, starting: room.starting, stage: room.stage, players: roster(room),
                });
            }
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
        const room = { code: newCode(), players: [], started: false, starting: false, hostSlot: 0, stage: 'graveyard', touched: now() };
        rooms.set(room.code, room);
        seat(socket, room, 0, message);
        announce(room);
        return room.code;
    }

    function join(socket, message = {}) {
        const room = rooms.get(cleanCode(message.code));
        if (!room) throw new RoomError('missing');
        if (room.started || room.starting) throw new RoomError('started');
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

    // The leader starts the game: with a server-run host if one can be had,
    // otherwise hosted by the leader.
    function start(socket) {
        const at = seats.get(socket);
        if (!at || at.slot !== 0) throw new RoomError('notHost');
        const { room } = at;
        if (room.started || room.starting) return;
        if (!launcher?.available()) {
            begin(room, 0);
            return;
        }
        room.starting = true;
        room.hostToken = randomBytes(16).toString('hex');
        announce(room); // lobbies show "Starting the game server..."
        const fallBack = (why) => {
            if (!room.starting || !rooms.has(room.code)) return;
            log?.warn?.({ code: room.code, why }, '8 Bit Evil V2: no server host, the leader hosts');
            launcher.stop(room.code);
            begin(room, 0);
        };
        setTimer(() => fallBack('timeout'), LAUNCH_TIMEOUT_MS);
        Promise.resolve()
            .then(() => launcher.launch(room.code, room.hostToken))
            .catch((err) => fallBack(err?.message ?? 'launch failed'));
    }

    function begin(room, hostSlot) {
        room.starting = false;
        room.started = true;
        room.hostSlot = hostSlot;
        room.hostToken = null;
        broadcast(room, { type: 'start', stage: room.stage, players: roster(room), host: hostSlot });
        announce(room);
    }

    // The server's game copy taking the host seat it was launched for.
    function hostJoin(socket, message = {}) {
        const room = rooms.get(cleanCode(message.code));
        if (!room || !room.starting || !room.hostToken || String(message.token ?? '') !== room.hostToken) {
            throw new RoomError('gone');
        }
        seat(socket, room, SERVER_SLOT, { name: 'server', hero: 'joe' });
        begin(room, SERVER_SLOT);
    }

    function close(room, reason) {
        for (const p of room.players) {
            if (p) {
                if (p.socket) seats.delete(p.socket);
                send(p.socket, { type: 'closed', reason });
            }
        }
        rooms.delete(room.code);
        launcher?.stop(room.code);
    }

    function free(room, slot) {
        const player = room.players[slot];
        if (player?.socket) seats.delete(player.socket);
        room.players[slot] = undefined;
        if (slot === room.hostSlot || (slot === SERVER_SLOT && room.started)) {
            // No host, no fight.
            close(room, 'host');
            return;
        }
        if (!room.players.some((p) => p && p.slot !== SERVER_SLOT)) {
            close(room, 'empty');  // every player has gone
            return;
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
        if (at.slot === SERVER_SLOT) {
            // The server's own copy doesn't blip; if it's gone, it's gone.
            free(at.room, at.slot);
            return;
        }
        player.socket = null;
        player.awaySince = now();
        broadcast(at.room, { type: 'away', slot: at.slot });
        announce(at.room);
    }

    // Back in the seat a token was given for.
    function rejoin(socket, message = {}) {
        const room = rooms.get(cleanCode(message.code));
        const token = String(message.token ?? '');
        const player = room?.players.find((p) => p && token.length > 0 && p.token === token);
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
        broadcast(room, { type: 'back', slot: player.slot }, socket);
        announce(room);
    }

    // A game packet. Returns false if it was dropped.
    function relay(socket, data) {
        const at = seats.get(socket);
        if (!at || !at.room.started || data.length < 2) return false;
        const { room, slot } = at;
        const player = room.players[slot];
        const limits = slot === room.hostSlot ? HOST_LIMITS : GUEST_LIMITS;
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
        if (slot !== room.hostSlot) {
            const host = room.players[room.hostSlot];
            if (host?.socket?.readyState === OPEN) host.socket.send(out, { binary: true });
            return true;
        }
        for (const p of room.players) {
            if (p && p.slot !== room.hostSlot && (target === BROADCAST || target === p.slot) && p.socket?.readyState === OPEN) {
                p.socket.send(out, { binary: true });
            }
        }
        return true;
    }

    // Frees seats whose player has been away too long, and drops rooms nobody
    // has touched in a long while (tabs left open in a lobby).
    function sweep() {
        const t = now();
        for (const room of [...rooms.values()]) {
            const limit = room.started ? AWAY_MS.game : AWAY_MS.lobby;
            for (const p of [...room.players]) {
                if (p && !p.socket && t - p.awaySince > limit && rooms.has(room.code)) free(room, p.slot);
            }
            if (rooms.has(room.code) && t - room.touched > WAITING_TTL_MS) close(room, 'idle');
        }
    }

    log?.debug?.('8 Bit Evil V2 rooms ready');
    function closeAll() {
        for (const room of [...rooms.values()]) launcher?.stop(room.code);
        rooms.clear();
        seats.clear();
    }

    return { create, join, rejoin, hostJoin, pick, start, leave, disconnect, relay, sweep, close: closeAll, size: () => rooms.size, room: (code) => rooms.get(code) };
}
