// Close Encounters' arena (github.com/Sclondon/CloseEncounters): drop-in battle rooms on a
// carnival the aliens set up on the moon. Anyone who opens the arena lands in the fullest arena
// that has a seat (a new one opens when they're all full), flies their saucer about a round
// crater, beams up what's lying about and fights the others for the top spot. Nobody hosts.
//
// Each game flies its own saucer and streams it to the rest; this server passes that on. The
// things to take up are not kept here: every game lays them out alike from the arena's `seed`
// and the time since it was `born` (the server's clock, sent with the welcome and with pongs),
// and numbers them the same way. What everyone has to agree on is who got each one first, so a
// game asks to "claim" a thing's number and the first claim to arrive wins; the server tells
// everybody who got it. A thing that comes back later comes back under a new number (the games
// fold a spawn generation into it), so a number is only ever claimed once.
//
// Hits between saucers, and the score each saucer has, are the games' own: a game says what it
// hit in its packets, and the one that was hit takes the damage. Games report their score now
// and then, and the server sends the arena's standings ("top") about once a second.
//
// Dropped connections don't end anything: a player whose socket closes keeps their seat (shown
// as away) for HOLD_MS and can take it back with the token they were given.
//
// Control messages are JSON text with a `type`. Game packets are binary: byte 0 is who it's for
// (255 everyone, or a seat), rewritten to the sender's seat on the way out; the rest is the
// game's. Arenas live in memory only.

import { randomBytes, randomInt } from 'node:crypto';
import { cleanName, cleanId } from '../eightBitEvilV2/rooms.js';

export const MAX_PLAYERS = 12;
export const BROADCAST = 255;
export const HOLD_MS = 30_000;       // how long a dropped player's seat is kept
export const TOP_MS = 1_000;         // between standings
export const TOP_COUNT = 10;
export const MAX_CLAIMS = 20_000;    // claims an arena remembers (the oldest are forgotten first)
const MAX_ARENAS = 60;
const IDLE_MS = 10 * 60_000;         // an arena nobody has sent anything to in this long is shut
const MAX_SCORE = 1e12;
// Per second, per socket: a saucer streams about 20 states a second, plus its shots and hits.
export const LIMITS = { packets: 60, bytes: 16_000, texts: 60 };
const OPEN = 1;

export class ArenaError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export function createArenaManager({ log, now = () => Date.now(), seedOf = () => randomInt(1, 2 ** 31 - 1) } = {}) {
    const arenas = new Map(); // id -> arena
    const seats = new Map();  // socket -> { arena, slot }

    const send = (socket, message) => {
        if (socket?.readyState === OPEN) socket.send(JSON.stringify(message));
    };
    const roster = (arena) => arena.players.filter(Boolean).map(({ slot, name, hero, socket, score }) => ({ slot, name, hero, score, away: !socket }));
    const broadcast = (arena, message, except = null) => {
        for (const p of arena.players) if (p?.socket && p.socket !== except) send(p.socket, message);
    };
    const filled = (arena) => arena.players.filter(Boolean).length;

    function newArena() {
        let id = '';
        do id = randomBytes(4).toString('hex'); while (arenas.has(id));
        const arena = { id, seed: seedOf(), born: now(), players: [], claims: new Map(), touched: now(), topSent: '' };
        arenas.set(id, arena);
        return arena;
    }

    function welcome(arena, player) {
        send(player.socket, {
            type: 'arena', arena: arena.id, slot: player.slot, token: player.token, seed: arena.seed, born: arena.born, now: now(),
            max: MAX_PLAYERS, players: roster(arena), claimed: [...arena.claims],
        });
    }

    // Into the fullest arena with a seat, or a new one
    function join(socket, message = {}) {
        if (seats.has(socket)) leave(socket);
        let arena = null;
        for (const a of arenas.values()) {
            if (filled(a) < MAX_PLAYERS && (!arena || filled(a) > filled(arena))) arena = a;
        }
        if (!arena) {
            if (arenas.size >= MAX_ARENAS) throw new ArenaError('busy');
            arena = newArena();
        }
        let slot = 0;
        while (arena.players[slot]) slot += 1;
        const player = {
            socket, slot, token: randomBytes(12).toString('hex'), awaySince: 0, score: 0,
            name: cleanName(message.name), hero: cleanId(message.hero, 'saucer'),
            window: now(), packets: 0, bytes: 0, texts: 0,
        };
        arena.players[slot] = player;
        seats.set(socket, { arena, slot });
        arena.touched = now();
        welcome(arena, player);
        broadcast(arena, { type: 'joined', slot, name: player.name, hero: player.hero }, socket);
        return arena;
    }

    // Back in the seat a token was given for
    function rejoin(socket, message = {}) {
        const arena = arenas.get(String(message.arena ?? ''));
        const token = String(message.token ?? '');
        const player = arena?.players.find((p) => p && token.length > 0 && p.token === token);
        if (!player) throw new ArenaError('gone');
        if (seats.has(socket) && seats.get(socket).arena !== arena) leave(socket);
        if (player.socket && player.socket !== socket) {
            seats.delete(player.socket);
            send(player.socket, { type: 'closed', reason: 'replaced' });
        }
        player.socket = socket;
        player.awaySince = 0;
        player.window = now();
        player.packets = 0;
        player.bytes = 0;
        player.texts = 0;
        seats.set(socket, { arena, slot: player.slot });
        arena.touched = now();
        welcome(arena, player);
        broadcast(arena, { type: 'back', slot: player.slot }, socket);
    }

    function free(arena, slot) {
        const player = arena.players[slot];
        if (player?.socket) seats.delete(player.socket);
        arena.players[slot] = undefined;
        if (filled(arena) === 0) {
            arenas.delete(arena.id);
            return;
        }
        broadcast(arena, { type: 'left', slot });
    }

    // Leaving on purpose: the seat is freed now
    function leave(socket) {
        const at = seats.get(socket);
        if (at) free(at.arena, at.slot);
    }

    // The socket closed without a goodbye: the seat is held for a while
    function disconnect(socket) {
        const at = seats.get(socket);
        if (!at) return;
        seats.delete(socket);
        const player = at.arena.players[at.slot];
        if (!player || player.socket !== socket) return;
        player.socket = null;
        player.awaySince = now();
        broadcast(at.arena, { type: 'away', slot: at.slot });
    }

    // The per-second allowance; bytes > 0 a game packet, 0 a text message
    function allow(player, bytes) {
        const t = now();
        if (t - player.window >= 1000) {
            player.window = t;
            player.packets = 0;
            player.bytes = 0;
            player.texts = 0;
        }
        if (bytes === 0) {
            player.texts += 1;
            return player.texts <= LIMITS.texts;
        }
        player.packets += 1;
        player.bytes += bytes;
        return player.packets <= LIMITS.packets && player.bytes <= LIMITS.bytes;
    }

    // A control message from a seated player (join and rejoin are handled before this)
    function message(socket, m = {}) {
        switch (m?.type) {
            case 'join_arena':
                join(socket, m);
                return;
            case 'rejoin_arena':
                rejoin(socket, m);
                return;
            case 'ping':
                // (for the games to set their clocks by the server's)
                send(socket, { type: 'pong', t: m.t, now: now() });
                return;
            default:
                break;
        }
        const at = seats.get(socket);
        if (!at) return;
        const { arena, slot } = at;
        const player = arena.players[slot];
        if (!player || !allow(player, 0)) return;
        arena.touched = now();
        switch (m.type) {
            case 'claim': {
                const id = Number(m.id);
                if (!Number.isSafeInteger(id) || id < 0) return;
                const had = arena.claims.get(id);
                if (had !== undefined) {
                    // (too late: only the one who asked is told who did get it)
                    send(socket, { type: 'claimed', id, slot: had });
                    return;
                }
                arena.claims.set(id, slot);
                if (arena.claims.size > MAX_CLAIMS) arena.claims.delete(arena.claims.keys().next().value);
                broadcast(arena, { type: 'claimed', id, slot });
                break;
            }
            case 'score': {
                const score = Number(m.score);
                if (Number.isFinite(score)) player.score = Math.max(0, Math.min(Math.floor(score), MAX_SCORE));
                break;
            }
            case 'pick':
                player.hero = cleanId(m.hero, player.hero);
                broadcast(arena, { type: 'picked', slot, hero: player.hero });
                break;
            case 'leave':
                leave(socket);
                break;
            default:
                break;
        }
    }

    // A game packet. Returns false if it was dropped.
    function relay(socket, data) {
        const at = seats.get(socket);
        if (!at || data.length < 2) return false;
        const { arena, slot } = at;
        const player = arena.players[slot];
        if (!player || !allow(player, data.length)) return false;
        arena.touched = now();
        const target = data[0];
        const out = Buffer.from(data);
        out[0] = slot;
        for (const p of arena.players) {
            if (p && p.slot !== slot && (target === BROADCAST || target === p.slot) && p.socket?.readyState === OPEN) {
                p.socket.send(out, { binary: true });
            }
        }
        return true;
    }

    const standings = (arena) => arena.players.filter(Boolean)
        .sort((a, b) => b.score - a.score || a.slot - b.slot)
        .slice(0, TOP_COUNT)
        .map(({ slot, name, score }) => ({ slot, name, score }));

    // About once a second: the standings (when they've changed), seats held too long freed, and
    // arenas left idle shut
    function tick() {
        const t = now();
        for (const arena of [...arenas.values()]) {
            for (const p of [...arena.players]) {
                if (p && !p.socket && t - p.awaySince > HOLD_MS && arenas.has(arena.id)) free(arena, p.slot);
            }
            if (!arenas.has(arena.id)) continue;
            if (t - arena.touched > IDLE_MS) {
                for (const p of arena.players) {
                    if (p?.socket) {
                        seats.delete(p.socket);
                        send(p.socket, { type: 'closed', reason: 'idle' });
                    }
                }
                arenas.delete(arena.id);
                continue;
            }
            const top = standings(arena);
            const text = JSON.stringify(top);
            if (text !== arena.topSent) {
                arena.topSent = text;
                broadcast(arena, { type: 'top', top });
            }
        }
    }

    function close() {
        arenas.clear();
        seats.clear();
    }

    log?.debug?.('Close Encounters arenas ready');
    return { join, rejoin, leave, disconnect, message, relay, tick, close, size: () => arenas.size, arena: (id) => arenas.get(id), seated: (socket) => seats.has(socket) };
}
