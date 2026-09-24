// Friend-challenge rooms for Crypt Clash.
//
// The server owns the clock: it steps every live match TICK_RATE times a
// second and sends both players each tick's number and the plays applied on
// it. Clients only simulate ticks the server has confirmed, so everyone runs
// the exact same match. Every HASH_EVERY ticks the server adds a fingerprint;
// a client that disagrees asks for a full snapshot ('resync'), which is also
// how a reconnecting player catches up.
//
// Rooms live in memory only: nothing about a friendly match is stored.

import { randomBytes, randomInt } from 'node:crypto';
import { TICK_RATE, createMatch, hashState, stepMatch, validateDeck } from '../shared/royale/index.js';

export const HASH_EVERY = TICK_RATE;
export const COUNTDOWN_MS = 3000;
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 6;
const WAITING_TTL_MS = 15 * 60_000;
const ENDED_TTL_MS = 5 * 60_000;
const ABANDONED_TTL_MS = 2 * 60_000;
const MAX_ROOMS = 500;
const NAME_MAX = 20;
const MAX_PLAYS_PER_SECOND = 6;
const OPEN = 1;

export function cleanName(name) {
    const text = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, NAME_MAX) : '';
    return text || 'Guest';
}

export function cleanPlay(message) {
    const { card, x, z } = message ?? {};
    if (typeof card !== 'string' || card.length > 32) return null;
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    return { card, x, z };
}

export class RoomError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export function createRoomManager({ log, now = () => Date.now(), tickMs = 1000 / TICK_RATE } = {}) {
    const rooms = new Map();

    function send(player, message) {
        const socket = player?.socket;
        if (socket && socket.readyState === OPEN) socket.send(JSON.stringify(message));
    }

    function broadcast(room, message) {
        const data = JSON.stringify(message);
        for (const player of room.players) {
            if (player.socket && player.socket.readyState === OPEN) player.socket.send(data);
        }
    }

    function newCode() {
        for (let attempt = 0; attempt < 20; attempt++) {
            let code = '';
            for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
            if (!rooms.has(code)) return code;
        }
        throw new RoomError('busy');
    }

    function newPlayer(socket, { name, deck }) {
        const deckError = validateDeck(deck);
        if (deckError) throw new RoomError('bad_deck');
        return {
            name: cleanName(name),
            deck: [...deck],
            socket,
            token: randomBytes(16).toString('hex'),
            recentPlays: [],
            wantsRematch: false,
        };
    }

    function attach(room, team, socket) {
        const player = room.players[team];
        if (player.socket && player.socket !== socket && player.socket.readyState === OPEN) {
            player.socket.close(4000, 'Joined from another tab');
        }
        player.socket = socket;
        socket.cryptClash = { code: room.code, team };
        room.lastActive = now();
    }

    function presence(room) {
        broadcast(room, { type: 'presence', connected: room.players.map((p) => !!p.socket && p.socket.readyState === OPEN) });
    }

    function roomInfo(room, team) {
        return {
            type: 'room',
            code: room.code,
            team,
            token: room.players[team].token,
            status: room.status,
            names: room.players.map((p) => p.name),
        };
    }

    function startMessage(room, team) {
        return {
            type: 'start',
            code: room.code,
            team,
            seed: room.seed,
            decks: room.players.map((p) => p.deck),
            names: room.players.map((p) => p.name),
            startsInMs: Math.max(0, room.startedAt - now()),
        };
    }

    function startMatch(room) {
        room.seed = randomBytes(8).toString('hex');
        room.state = createMatch({ seed: room.seed, decks: room.players.map((p) => p.deck) });
        room.pending = [];
        room.status = 'playing';
        room.startedAt = now() + COUNTDOWN_MS;
        room.endedAt = null;
        for (const p of room.players) p.wantsRematch = false;
        room.players.forEach((p, team) => send(p, startMessage(room, team)));
        log?.info({ code: room.code }, 'Crypt Clash match started');
    }

    function playerFor(socket) {
        const link = socket.cryptClash;
        if (!link) return null;
        const room = rooms.get(link.code);
        if (!room || room.players[link.team]?.socket !== socket) return null;
        return { room, team: link.team, player: room.players[link.team] };
    }

    return {
        get size() {
            return rooms.size;
        },

        room(code) {
            return rooms.get(code) ?? null;
        },

        create(socket, { name, deck }) {
            if (rooms.size >= MAX_ROOMS) throw new RoomError('busy');
            const player = newPlayer(socket, { name, deck });
            const room = { code: newCode(), players: [player], status: 'waiting', createdAt: now(), lastActive: now(), state: null };
            rooms.set(room.code, room);
            attach(room, 0, socket);
            send(player, roomInfo(room, 0));
            return room;
        },

        peek(code) {
            const room = rooms.get(code);
            if (!room) return { type: 'room-info', code, status: 'missing' };
            return { type: 'room-info', code, status: room.players.length < 2 ? 'waiting' : 'full', host: room.players[0].name };
        },

        join(socket, { code, name, deck }) {
            const room = rooms.get(code);
            if (!room) throw new RoomError('missing');
            if (room.players.length >= 2) throw new RoomError('full');
            const player = newPlayer(socket, { name, deck });
            room.players.push(player);
            attach(room, 1, socket);
            room.players.forEach((p, team) => send(p, roomInfo(room, team)));
            startMatch(room);
            return room;
        },

        // A player coming back after a dropped connection.
        rejoin(socket, { code, token }) {
            const room = rooms.get(code);
            const team = room ? room.players.findIndex((p) => p.token === token) : -1;
            if (!room || team < 0) throw new RoomError('missing');
            attach(room, team, socket);
            send(room.players[team], roomInfo(room, team));
            if (room.state) {
                send(room.players[team], startMessage(room, team));
                send(room.players[team], { type: 'sync', state: room.state });
            }
            presence(room);
        },

        play(socket, message) {
            const found = playerFor(socket);
            if (!found || found.room.status !== 'playing' || now() < found.room.startedAt) return;
            const play = cleanPlay(message);
            if (!play) return;
            const t = now();
            found.player.recentPlays = found.player.recentPlays.filter((at) => t - at < 1000);
            if (found.player.recentPlays.length >= MAX_PLAYS_PER_SECOND) return;
            found.player.recentPlays.push(t);
            found.room.pending.push({ team: found.team, ...play });
        },

        resync(socket) {
            const found = playerFor(socket);
            if (found?.room.state) send(found.player, { type: 'sync', state: found.room.state });
        },

        rematch(socket) {
            const found = playerFor(socket);
            if (!found || found.room.status !== 'ended') return;
            found.player.wantsRematch = true;
            broadcast(found.room, { type: 'rematch', ready: found.room.players.map((p) => p.wantsRematch) });
            if (found.room.players.every((p) => p.wantsRematch)) startMatch(found.room);
        },

        leave(socket) {
            const found = playerFor(socket);
            if (!found) return;
            const { room, team } = found;
            if (room.status === 'waiting') {
                rooms.delete(room.code);
                return;
            }
            room.players[team].left = true;
            room.players[team].socket = null;
            broadcast(room, { type: 'left', team });
            presence(room);
        },

        disconnect(socket) {
            const found = playerFor(socket);
            if (!found) return;
            found.player.socket = null;
            found.room.lastActive = now();
            presence(found.room);
        },

        // Advances every live match to the current time and cleans up.
        tick() {
            const t = now();
            for (const room of rooms.values()) {
                if (room.status === 'playing') {
                    const due = Math.floor((t - room.startedAt) / tickMs);
                    const state = room.state;
                    while (state.tick < due && !state.result) {
                        const plays = room.pending;
                        room.pending = [];
                        const n = state.tick;
                        stepMatch(state, plays);
                        const bundle = { type: 'tick', n, plays };
                        if (state.tick % HASH_EVERY === 0) bundle.hash = hashState(state);
                        broadcast(room, bundle);
                    }
                    if (state.result) {
                        room.status = 'ended';
                        room.endedAt = t;
                        broadcast(room, { type: 'end', result: state.result });
                        log?.info({ code: room.code, result: state.result }, 'Crypt Clash match ended');
                    }
                }
                const anyone = room.players.some((p) => p.socket && p.socket.readyState === OPEN);
                if (anyone) room.lastActive = t;
                const expired =
                    (room.status === 'waiting' && t - room.createdAt > WAITING_TTL_MS) ||
                    (room.status === 'ended' && t - room.endedAt > ENDED_TTL_MS) ||
                    (!anyone && t - room.lastActive > ABANDONED_TTL_MS);
                if (expired) {
                    for (const p of room.players) p.socket?.close(4001, 'Room closed');
                    rooms.delete(room.code);
                }
            }
        },

        close() {
            for (const room of rooms.values()) for (const p of room.players) p.socket?.close(1001, 'Server shutting down');
            rooms.clear();
        },
    };
}
