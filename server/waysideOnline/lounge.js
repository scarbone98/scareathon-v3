// The Wayside Online lounge: a club room where signed-in players walk about and talk.
//
// Anyone can watch (the socket is open to guests); to come in, a player swaps their
// login for a one-use ticket over HTTP and hands it over the socket. Each player has
// one avatar in the room: joining again from another tab moves it there and leaves
// the old tab watching. Positions are in room space, 0..1 across and down the room,
// kept to the floor. Words are short, single-line, have any swearing masked, and
// aren't kept anywhere. Admins can show someone the door for a while.
//
// The room lives in memory only.

import { randomBytes } from 'node:crypto';

// The floor, in room space (the wall's above it)
export const FLOOR = { left: 0.06, right: 0.94, top: 0.56, bottom: 0.95 };
export const DOOR = { x: 0.88, y: 0.62 };
export const MAX_PLAYERS = 60;
export const MAX_SAY = 80;
export const SAY_COOLDOWN_MS = 1500;
export const MOVES_PER_SECOND = 8;
export const TICKET_MS = 60_000;
export const KICK_MS = 10 * 60_000;
const NAME_MAX = 20;
const OPEN = 1;

export class LoungeError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const round = (n) => Math.round(n * 1000) / 1000;

// A spot on the floor, or null if it isn't a pair of numbers
export function cleanSpot(message) {
    const { x, y } = message ?? {};
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: round(clamp(x, FLOOR.left, FLOOR.right)), y: round(clamp(y, FLOOR.top, FLOOR.bottom)) };
}

// What someone said, on one line and trimmed, or null if there's nothing to say
export function cleanSay(text, mask = (line) => line) {
    if (typeof text !== 'string') return null;
    const line = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SAY);
    return line ? mask(line) : null;
}

function send(socket, message) {
    if (socket.readyState === OPEN) socket.send(JSON.stringify(message));
}

export function createLounge({ now = Date.now, mask } = {}) {
    const watchers = new Set();
    const players = new Map(); // userId -> { userId, name, x, y, say, saidAt, socket, admin, moves }
    const bySocket = new Map(); // socket -> userId
    const tickets = new Map(); // ticket -> { userId, name, admin, expires }
    const kicked = new Map(); // userId -> until

    const view = ({ userId, name, x, y, say, saidAt }) => ({ userId, name, x, y, say: say ?? null, saidAt: saidAt ?? null });
    const broadcast = (message) => watchers.forEach((socket) => send(socket, message));
    const isKicked = (userId) => {
        const until = kicked.get(userId);
        if (until && until > now()) return true;
        kicked.delete(userId);
        return false;
    };

    function remove(userId, reason) {
        const player = players.get(userId);
        if (!player) return;
        players.delete(userId);
        bySocket.delete(player.socket);
        if (reason) send(player.socket, { type: 'out', reason });
        broadcast({ type: 'leave', userId });
    }

    return {
        get size() {
            return players.size;
        },

        // A ticket in for this player, good once and for a minute
        ticket({ userId, name, admin = false }) {
            if (isKicked(userId)) throw new LoungeError('kicked');
            const time = now();
            tickets.forEach((each, key) => each.expires <= time && tickets.delete(key));
            const ticket = randomBytes(18).toString('base64url');
            tickets.set(ticket, { userId, name: String(name || 'Someone').slice(0, NAME_MAX), admin, expires: time + TICKET_MS });
            return ticket;
        },

        // A socket opens: it watches, and sees who's in
        watch(socket) {
            watchers.add(socket);
            send(socket, { type: 'room', players: [...players.values()].map(view), max: MAX_PLAYERS });
        },

        join(socket, { ticket } = {}) {
            const pass = tickets.get(String(ticket ?? ''));
            tickets.delete(String(ticket ?? ''));
            if (!pass || pass.expires <= now()) throw new LoungeError('ticket');
            if (isKicked(pass.userId)) throw new LoungeError('kicked');
            const already = players.get(pass.userId);
            if (!already && players.size >= MAX_PLAYERS) throw new LoungeError('full');
            // (this socket's own player, if it had another one, steps out first)
            const previous = bySocket.get(socket);
            if (previous && previous !== pass.userId) remove(previous);
            if (already) {
                // In again from another tab: the avatar stays put and answers to this one
                if (already.socket !== socket) {
                    bySocket.delete(already.socket);
                    send(already.socket, { type: 'out', reason: 'elsewhere' });
                }
                Object.assign(already, { socket, name: pass.name, admin: pass.admin });
                bySocket.set(socket, pass.userId);
                send(socket, { type: 'in', userId: pass.userId, admin: pass.admin });
                return already;
            }
            const player = {
                userId: pass.userId,
                name: pass.name,
                x: round(DOOR.x - Math.random() * 0.22),
                y: round(DOOR.y + Math.random() * 0.18),
                say: null,
                saidAt: 0,
                socket,
                admin: pass.admin,
                moves: [],
            };
            players.set(player.userId, player);
            bySocket.set(socket, player.userId);
            send(socket, { type: 'in', userId: player.userId, admin: player.admin });
            broadcast({ type: 'enter', player: view(player) });
            return player;
        },

        move(socket, message) {
            const player = players.get(bySocket.get(socket));
            const spot = cleanSpot(message);
            if (!player || !spot) return;
            const time = now();
            player.moves = player.moves.filter((at) => at > time - 1000);
            if (player.moves.length >= MOVES_PER_SECOND) return;
            player.moves.push(time);
            Object.assign(player, spot);
            broadcast({ type: 'move', userId: player.userId, ...spot });
        },

        say(socket, message) {
            const player = players.get(bySocket.get(socket));
            if (!player) return;
            const time = now();
            if (time - player.saidAt < SAY_COOLDOWN_MS) throw new LoungeError('slow');
            const say = cleanSay(message?.text, mask);
            if (!say) return;
            Object.assign(player, { say, saidAt: time });
            broadcast({ type: 'say', userId: player.userId, say, saidAt: time });
        },

        // An admin shows someone out, and they can't come back for a while
        kick(socket, { userId } = {}) {
            const admin = players.get(bySocket.get(socket));
            if (!admin?.admin) throw new LoungeError('forbidden');
            const target = String(userId ?? '');
            if (!target || target === admin.userId) return;
            kicked.set(target, now() + KICK_MS);
            tickets.forEach((each, key) => each.userId === target && tickets.delete(key));
            remove(target, 'kicked');
        },

        leave(socket) {
            const userId = bySocket.get(socket);
            if (userId) remove(userId);
        },

        disconnect(socket) {
            watchers.delete(socket);
            const userId = bySocket.get(socket);
            if (userId) remove(userId);
        },

        close() {
            watchers.clear();
            players.clear();
            bySocket.clear();
            tickets.clear();
        },
    };
}
