// Co-op rooms for Frog Ball: two players, two balls chained together.
//
// Each player's game simulates only their own ball, so the server doesn't run
// any physics. It relays each ball's position to the partner, owns the clock
// (every stage starts at a server time both players count from, so moving
// platforms line up), and decides how each attempt ends: cleared once both
// balls are through the goal, failed as soon as either falls or time runs out.
// Lives and score are shared and kept here.
//
// Rooms live in memory only.

import { randomBytes, randomInt } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;
export const START_LIVES = 3;
// Gap between a stage being announced and its clock starting, so both
// players have loaded it.
export const START_DELAY_MS = 800;
// How long the GOAL / FALL OUT moment plays before the next attempt.
export const CLEAR_MS = 4400;
export const FAIL_MS = 2600;
// A player who drops out mid-run has this long to come back.
export const RECONNECT_MS = 20_000;
const WAITING_TTL_MS = 30 * 60_000;
const ABANDONED_TTL_MS = 2 * 60_000;
const MAX_ROOMS = 500;
const NAME_MAX = 12;
const MAX_STATES_PER_SECOND = 45;
const MAX_STAGES = 50;
const MAX_FLY_ID = 500;
const OPEN = 1;

export function cleanName(name, fallback = 'FROG') {
    const text = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, NAME_MAX) : '';
    return text || fallback;
}

export function cleanCode(code) {
    return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

const isVec = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e5);
const round = (n) => Math.round(n * 1000) / 1000;

// A ball update, or null if it's malformed.
// A ball update, or null if it's malformed. k is how the player is tilting
// (x, z, each -1..1), which lets the partner guess how the ball will speed up.
export function cleanState(message) {
    const { a, t, p, v, k, s } = message ?? {};
    if (!Number.isInteger(a) || typeof t !== 'number' || !Number.isFinite(t) || !isVec(p) || !isVec(v)) return null;
    const tilt = Array.isArray(k) && k.length === 2 && k.every((n) => typeof n === 'number' && Number.isFinite(n)) ? k.map((n) => round(Math.max(-1, Math.min(1, n)))) : [0, 0];
    return { a, t: round(t), p: p.map(round), v: v.map(round), k: tilt, s: typeof s === 'string' ? s.slice(0, 10) : 'play' };
}

// Monkey Ball scoring, same as single player: 100 a second left, 100 a fly,
// doubled if you finish with more than half the time left.
export function stageScore(left, limit, flies) {
    const timeBonus = Math.round(Math.max(0, left) * 100);
    const flyBonus = flies * 100;
    const fast = left > limit / 2;
    return { timeBonus, flyBonus, fast, total: (timeBonus + flyBonus) * (fast ? 2 : 1) };
}

export class RoomError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export function createRoomManager({ log, now = () => Date.now() } = {}) {
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
        for (let attempt = 0; attempt < 30; attempt++) {
            let code = '';
            for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
            if (!rooms.has(code)) return code;
        }
        throw new RoomError('busy');
    }

    // Players without a name are P1 and P2.
    function newPlayer(socket, name, seat) {
        return { name: cleanName(name, `P${seat + 1}`), socket, token: randomBytes(16).toString('hex'), states: [], goneAt: null };
    }

    function attach(room, seat, socket) {
        const player = room.players[seat];
        if (player.socket && player.socket !== socket && player.socket.readyState === OPEN) {
            player.socket.close(4000, 'Joined from another tab');
        }
        player.socket = socket;
        player.goneAt = null;
        socket.frogBall = { code: room.code, seat };
        room.lastActive = now();
    }

    const connected = (room) => room.players.map((p) => !!p.socket && p.socket.readyState === OPEN);

    function roomInfo(room, seat) {
        return {
            type: 'room',
            code: room.code,
            seat,
            token: room.players[seat].token,
            status: room.status,
            names: room.players.map((p) => p.name),
            connected: connected(room),
        };
    }

    function sendRoomInfo(room) {
        room.players.forEach((p, seat) => send(p, roomInfo(room, seat)));
    }

    function startMessage(room) {
        const run = room.run;
        return { type: 'start', stage: run.stage, attempt: run.attempt, at: run.at, lives: run.lives, score: run.score, names: room.players.map((p) => p.name) };
    }

    function startStage(room, stage) {
        const run = room.run;
        run.stage = stage;
        run.attempt += 1;
        run.at = now() + START_DELAY_MS;
        run.goals = [null, null];
        run.flies = new Map();
        run.resolved = false;
        room.next = null;
        broadcast(room, startMessage(room));
    }

    function endRun(room, cleared, reason) {
        const run = room.run;
        broadcast(room, { type: 'over', cleared, reason, score: run.score, stage: run.stage });
        log?.info({ code: room.code, cleared, reason, score: run.score, stage: run.stage }, 'Frog Ball co-op run ended');
        room.run = null;
        room.next = null;
        room.status = 'lobby';
        sendRoomInfo(room);
    }

    // How an attempt ends. Only the first report counts.
    function resolve(room, kind, seat) {
        const run = room.run;
        run.resolved = true;
        if (kind === 'clear') {
            const left = Math.min(run.goals[0].left, run.goals[1].left);
            const limit = run.goals[0].limit;
            let flies = 0;
            for (const big of run.flies.values()) flies += big ? 10 : 1;
            const info = stageScore(left, limit, flies);
            run.score += info.total;
            broadcast(room, { type: 'outcome', attempt: run.attempt, kind, info, lives: run.lives, score: run.score });
            const last = run.stage + 1 >= run.stageCount;
            room.next = { at: now() + CLEAR_MS, run: () => (last ? endRun(room, true, 'cleared') : startStage(room, run.stage + 1)) };
        } else {
            run.lives -= 1;
            broadcast(room, { type: 'outcome', attempt: run.attempt, kind, seat, lives: run.lives, score: run.score });
            room.next = { at: now() + FAIL_MS, run: () => (run.lives < 0 ? endRun(room, false, 'lives') : startStage(room, run.stage)) };
        }
    }

    function playerFor(socket) {
        const link = socket.frogBall;
        if (!link) return null;
        const room = rooms.get(link.code);
        if (!room || room.players[link.seat]?.socket !== socket) return null;
        return { room, seat: link.seat, player: room.players[link.seat] };
    }

    // The live attempt a message is about, if it's still being played.
    function liveRun(socket, attempt) {
        const found = playerFor(socket);
        const run = found?.room.run;
        if (!run || run.attempt !== attempt || run.resolved || now() < run.at) return null;
        return { ...found, run };
    }

    return {
        get size() {
            return rooms.size;
        },

        room(code) {
            return rooms.get(code) ?? null;
        },

        create(socket, { name }) {
            if (rooms.size >= MAX_ROOMS) throw new RoomError('busy');
            const room = { code: newCode(), players: [newPlayer(socket, name, 0)], status: 'waiting', run: null, next: null, createdAt: now(), lastActive: now() };
            rooms.set(room.code, room);
            attach(room, 0, socket);
            sendRoomInfo(room);
            return room;
        },

        peek(code) {
            const room = rooms.get(cleanCode(code));
            if (!room) return { type: 'room-info', code, status: 'missing' };
            return { type: 'room-info', code: room.code, status: room.players.length < 2 ? 'waiting' : 'full', host: room.players[0].name };
        },

        join(socket, { code, name }) {
            const room = rooms.get(cleanCode(code));
            if (!room) throw new RoomError('missing');
            if (room.players.length >= 2) throw new RoomError('full');
            room.players.push(newPlayer(socket, name, 1));
            room.status = 'lobby';
            attach(room, 1, socket);
            sendRoomInfo(room);
            return room;
        },

        // A player coming back after a dropped connection.
        rejoin(socket, { code, token }) {
            const room = rooms.get(cleanCode(code));
            const seat = room ? room.players.findIndex((p) => p.token === token) : -1;
            if (!room || seat < 0) throw new RoomError('missing');
            attach(room, seat, socket);
            sendRoomInfo(room);
            if (room.run) send(room.players[seat], startMessage(room));
        },

        // The host starts a run of `count` stages from the lobby.
        go(socket, { count }) {
            const found = playerFor(socket);
            if (!found || found.seat !== 0 || found.room.status !== 'lobby' || found.room.players.length < 2) return;
            if (!connected(found.room).every(Boolean)) return;
            const stageCount = Number.isInteger(count) ? Math.max(1, Math.min(MAX_STAGES, count)) : 1;
            found.room.status = 'playing';
            found.room.run = { stage: 0, attempt: 0, at: 0, lives: START_LIVES, score: 0, stageCount, goals: [null, null], flies: new Map(), resolved: false };
            log?.info({ code: found.room.code }, 'Frog Ball co-op run started');
            startStage(found.room, 0);
        },

        // Where my ball is, passed on to my partner.
        state(socket, message) {
            const s = cleanState(message);
            if (!s) return;
            const found = playerFor(socket);
            const run = found?.room.run;
            if (!run || run.attempt !== s.a) return;
            const t = now();
            found.player.states = found.player.states.filter((at) => t - at < 1000);
            if (found.player.states.length >= MAX_STATES_PER_SECOND) return;
            found.player.states.push(t);
            send(found.room.players[1 - found.seat], { type: 'peer', seat: found.seat, ...s });
        },

        fly(socket, { attempt, id, big }) {
            const live = liveRun(socket, attempt);
            if (!live || !Number.isInteger(id) || id < 0 || id > MAX_FLY_ID || live.run.flies.has(id)) return;
            live.run.flies.set(id, !!big);
            broadcast(live.room, { type: 'fly', id, seat: live.seat });
        },

        goal(socket, { attempt, left, limit }) {
            const live = liveRun(socket, attempt);
            if (!live || typeof left !== 'number' || typeof limit !== 'number' || !Number.isFinite(left) || !Number.isFinite(limit)) return;
            live.run.goals[live.seat] = { left: Math.max(0, Math.min(limit, left)), limit: Math.max(1, Math.min(600, limit)) };
            broadcast(live.room, { type: 'goal', seat: live.seat });
            if (live.run.goals.every(Boolean)) resolve(live.room, 'clear');
        },

        fail(socket, { attempt, why }) {
            const live = liveRun(socket, attempt);
            if (!live) return;
            resolve(live.room, why === 'time' ? 'time' : 'fall', live.seat);
        },

        leave(socket) {
            const found = playerFor(socket);
            if (!found) return;
            const { room, seat } = found;
            socket.frogBall = null;
            broadcast(room, { type: 'left', seat });
            for (const p of room.players) {
                if (p.socket) p.socket.frogBall = null;
            }
            rooms.delete(room.code);
            log?.info({ code: room.code, seat }, 'Frog Ball co-op room closed');
        },

        disconnect(socket) {
            const found = playerFor(socket);
            if (!found) return;
            found.player.socket = null;
            found.player.goneAt = now();
            found.room.lastActive = now();
            broadcast(found.room, { type: 'presence', connected: connected(found.room) });
        },

        // Runs scheduled stage starts, ends runs whose partner never came
        // back, and cleans up old rooms.
        tick() {
            const t = now();
            for (const room of rooms.values()) {
                if (room.next && t >= room.next.at) {
                    const next = room.next;
                    room.next = null;
                    next.run();
                }
                if (room.run && room.players.some((p) => p.goneAt !== null && t - p.goneAt > RECONNECT_MS)) {
                    endRun(room, false, 'disconnected');
                }
                const anyone = connected(room).some(Boolean);
                if (anyone) room.lastActive = t;
                const expired = (room.status === 'waiting' && t - room.createdAt > WAITING_TTL_MS) || (!anyone && t - room.lastActive > ABANDONED_TTL_MS);
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
