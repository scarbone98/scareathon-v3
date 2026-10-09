import { CAMPAIGN_CONTENT_VERSION, COOP_PROTOCOL_VERSION, compatibleMap } from '../shared/waysideFury/campaign.js';
import { randomBytes, randomInt } from 'node:crypto';
import { MAX_MESSAGE_BYTES, MAX_MESSAGES_PER_SECOND, MAX_SEATS, cleanRelay } from './protocol.js';
import { updateHosting } from './presence.js';

export { MAX_MESSAGE_BYTES, MAX_MESSAGES_PER_SECOND, MAX_SEATS };
export const CODE_LENGTH = 4;
export const RECONNECT_MS = 20_000;
export const TICKET_MS = 60_000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_ROOMS = 500;
const MAX_TICKETS = 5000;
const OPEN = 1;

export const cleanCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
export function cleanName(name, fallback = 'Player') {
    const cleaned = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 32) : '';
    return cleaned || fallback;
}

export class RoomError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

// The server owns membership and authority; all simulation stays on the host.
export function createRoomManager({ now = () => Date.now(), log } = {}) {
    const rooms = new Map();
    const tickets = new Map();
    const rates = new WeakMap();
    const connected = (player) => !!player?.socket && player.socket.readyState === OPEN;
    const players = (room) => room.players.filter(Boolean);

    function send(socket, message) {
        if (socket?.readyState === OPEN) socket.send(JSON.stringify(message));
    }
    function broadcast(room, message, except = null) {
        for (const player of players(room)) {
            if (player.socket !== except) send(player.socket, message);
        }
    }
    function hosting(room) {
        const host = room.players[room.hostSeat];
        updateHosting(room.code, connected(host) ? {
            userId: host.userId,
            name: host.name,
            hosting: { game: 'Wayside Fury', code: room.code, count: players(room).length, max: MAX_SEATS },
        } : null);
    }
    function publicPlayers(room) {
        return players(room).map((player) => ({ seat: player.seat, userId: player.userId, name: player.name, connected: connected(player), appearance: player.appearance ?? null }));
    }
    function roomInfo(room, player) {
        return {
            type: 'room', code: room.code, seat: player.seat, hostSeat: room.hostSeat,
            protocolVersion: Math.min(...players(room).map(peer => peer.protocolVersion)), contentVersion: player.protocolVersion >= 5 ? CAMPAIGN_CONTENT_VERSION : player.protocolVersion === 4 ? 3 : player.protocolVersion === 3 ? 2 : 1,
            token: player.token, status: 'playing', players: publicPlayers(room),
        };
    }
    function announce(room) {
        for (const player of players(room)) send(player.socket, roomInfo(room, player));
        hosting(room);
    }
    function playerFor(socket) {
        const link = socket.waysideFury;
        const room = link ? rooms.get(link.code) : null;
        const player = room?.players[link?.seat];
        return player?.socket === socket ? { room, player, seat: player.seat } : null;
    }
    function identity(socket) {
        const user = socket.waysideFuryUser;
        if (!user?.userId) throw new RoomError('auth');
        return user;
    }
    function snapshot(room, socket = null) {
        if (!room.latestState) return;
        const host = room.players[room.hostSeat];
        const message = { ...room.latestState, seat: room.hostSeat, userId: host?.userId, name: host?.name, snapshot: true };
        if (socket) send(socket, message);
        else broadcast(room, message);
    }
    function attach(room, player, socket) {
        const old = player.socket;
        if (old && old !== socket) {
            old.waysideFury = null;
            if (old.readyState === OPEN) old.close(4000, 'Joined from another tab');
        }
        player.socket = socket;
        player.goneAt = null;
        socket.waysideFury = { code: room.code, seat: player.seat };
        room.lastActive = now();
    }
    function remove(room, seat, reason) {
        const gone = room.players[seat];
        if (!gone) return;
        if (gone.socket) gone.socket.waysideFury = null;
        room.players[seat] = null;
        const remaining = players(room);
        if (remaining.length === 0) {
            rooms.delete(room.code);
            updateHosting(room.code, null);
            return;
        }
        broadcast(room, { type: 'left', seat, userId: gone.userId, name: gone.name, reason });
        if (room.hostSeat === seat) {
            const ordered = remaining.slice().sort((a, b) => ((a.seat - seat + MAX_SEATS) % MAX_SEATS) - ((b.seat - seat + MAX_SEATS) % MAX_SEATS));
            const next = ordered.find(connected) ?? ordered[0];
            room.hostSeat = next.seat;
            broadcast(room, { type: 'host', hostSeat: next.seat, previousHostSeat: seat, userId: next.userId, reason });
            log?.info({ code: room.code, hostSeat: next.seat }, 'Wayside Fury host migrated');
        }
        announce(room);
        if (room.latestState) snapshot(room);
    }
    function leave(socket) {
        const found = playerFor(socket);
        if (!found) return;
        remove(found.room, found.seat, 'left');
        send(socket, { type: 'left-room', code: found.room.code });
    }
    function newCode() {
        for (let attempt = 0; attempt < 50; attempt++) {
            let code = '';
            for (let index = 0; index < CODE_LENGTH; index++) code += ALPHABET[randomInt(ALPHABET.length)];
            if (!rooms.has(code)) return code;
        }
        throw new RoomError('busy');
    }
    function newPlayer(socket, seat) {
        const user = identity(socket);
        return { ...user, protocolVersion: user.protocolVersion ?? 1, seat, socket, token: randomBytes(24).toString('hex'), goneAt: null, appearance: null, hero: null };
    }

    const manager = {
        get size() { return rooms.size; },
        room(code) { return rooms.get(cleanCode(code)) ?? null; },
        issueTicket({ userId, name }) {
            if (typeof userId !== 'string' || !userId.trim() || userId.length > 128) throw new RoomError('auth');
            for (const [ticket, value] of tickets) if (value.expires <= now()) tickets.delete(ticket);
            if (tickets.size >= MAX_TICKETS) throw new RoomError('busy');
            const ticket = randomBytes(24).toString('hex');
            tickets.set(ticket, { userId, name: cleanName(name), expires: now() + TICKET_MS });
            return ticket;
        },
        auth(socket, { ticket, protocolVersion = 1, contentVersion = CAMPAIGN_CONTENT_VERSION }) {
            if (![1, 2, 3, 4, 5, COOP_PROTOCOL_VERSION].includes(protocolVersion) || ![1,2,3,CAMPAIGN_CONTENT_VERSION].includes(contentVersion) || (protocolVersion === COOP_PROTOCOL_VERSION && contentVersion !== CAMPAIGN_CONTENT_VERSION)) throw new RoomError('version');
            if (playerFor(socket)) throw new RoomError('already');
            const user = typeof ticket === 'string' ? tickets.get(ticket) : null;
            if (!user || user.expires <= now()) throw new RoomError('ticket');
            tickets.delete(ticket);
            socket.waysideFuryUser = { userId: user.userId, name: user.name, protocolVersion };
            send(socket, { type: 'ready', protocolVersion: protocolVersion >= 3 ? protocolVersion : 2, contentVersion: protocolVersion >= 5 ? CAMPAIGN_CONTENT_VERSION : protocolVersion === 4 ? 3 : protocolVersion === 3 ? 2 : 1, userId: user.userId, name: user.name });
        },
        // Limits include lobby traffic, bad JSON and packets from unauthenticated sockets.
        accept(socket) {
            const time = now();
            const rate = rates.get(socket) ?? { at: time, count: 0 };
            if (time - rate.at >= 1000) { rate.at = time; rate.count = 0; }
            rate.count++;
            rates.set(socket, rate);
            return rate.count <= MAX_MESSAGES_PER_SECOND;
        },
        create(socket) {
            identity(socket);
            if (rooms.size >= MAX_ROOMS) throw new RoomError('busy');
            const room = { code: newCode(), players: Array(MAX_SEATS).fill(null), hostSeat: 0, latestState: null, createdAt: now(), lastActive: now() };
            leave(socket);
            const player = newPlayer(socket, 0);
            room.players[0] = player;
            rooms.set(room.code, room);
            attach(room, player, socket);
            announce(room);
            return room;
        },
        join(socket, { code }) {
            const user = identity(socket);
            const room = rooms.get(cleanCode(code));
            if (!room) throw new RoomError('missing');
            if (room.latestState && !compatibleMap(room.latestState.state.scene, room.latestState.state.room, room.latestState.state.mapId, user.protocolVersion)) throw new RoomError('version');
            if (players(room).some((player) => player.userId === user.userId)) throw new RoomError('already');
            const seat = room.players.findIndex((player) => player === null);
            if (seat < 0) throw new RoomError('full');
            leave(socket);
            const player = newPlayer(socket, seat);
            room.players[seat] = player;
            attach(room, player, socket);
            broadcast(room, { type: 'joined', seat, userId: player.userId, name: player.name }, socket);
            announce(room);
            snapshot(room, socket);
            for (const peer of players(room)) if (peer !== player && peer.hero) send(socket, peer.hero);
            return room;
        },
        rejoin(socket, { code, token }) {
            const user = identity(socket);
            const room = rooms.get(cleanCode(code));
            const player = room && players(room).find((entry) => typeof token === 'string' && entry.token === token && entry.userId === user.userId);
            if (!player || (player.goneAt !== null && now() - player.goneAt >= RECONNECT_MS)) throw new RoomError('missing');
            if (room.latestState && !compatibleMap(room.latestState.state.scene, room.latestState.state.room, room.latestState.state.mapId, user.protocolVersion)) throw new RoomError('version');
            player.protocolVersion = user.protocolVersion;
            const previous = playerFor(socket);
            if (previous && previous.player !== player) leave(socket);
            attach(room, player, socket);
            announce(room);
            snapshot(room, socket);
            for (const peer of players(room)) if (peer !== player && peer.hero) send(socket, peer.hero);
            return room;
        },
        peek(socket, { code }) {
            identity(socket);
            const room = rooms.get(cleanCode(code));
            return room ? { type: 'room-info', code: room.code, status: players(room).length >= MAX_SEATS ? 'full' : 'open', host: room.players[room.hostSeat]?.name, count: players(room).length } : { type: 'room-info', code: cleanCode(code), status: 'missing' };
        },
        relay(socket, message) {
            const found = playerFor(socket);
            if (!found) throw new RoomError('auth');
            let size;
            try { size = Buffer.byteLength(JSON.stringify(message), 'utf8'); } catch { throw new RoomError('invalid'); }
            if (size > MAX_MESSAGE_BYTES) throw new RoomError('size');
            const cleaned = cleanRelay(message);
            if (!cleaned) throw new RoomError('invalid');
            const { room, player, seat } = found;
            const location = cleaned.type === 'state' ? cleaned.state : cleaned.type === 'hero' ? cleaned.hero : ['hit', 'pickup'].includes(cleaned.type) ? cleaned : null;
            if (location && !players(room).every(peer => compatibleMap(location.scene, location.room, location.mapId, peer.protocolVersion))) throw new RoomError('version');
            const hostOnly = ['state', 'reward', 'revive', 'damage'].includes(cleaned.type);
            if (hostOnly && seat !== room.hostSeat) throw new RoomError('host');
            const forwarded = { ...cleaned, seat, userId: player.userId, name: player.name, now: now() };
            if (cleaned.type === 'hero') {
                forwarded.hero = { ...cleaned.hero, seat, userId: player.userId, name: player.name };
                if (cleaned.appearance) player.appearance = cleaned.appearance;
                if (player.appearance) forwarded.appearance = player.appearance;
                player.hero = forwarded;
            }
            room.lastActive = now();
            if (cleaned.type === 'state') room.latestState = forwarded;
            if (cleaned.type === 'hit' || cleaned.type === 'input' || cleaned.type === 'pickup') {
                if (seat !== room.hostSeat) send(room.players[room.hostSeat]?.socket, forwarded);
            } else if (cleaned.targetSeat !== undefined && hostOnly) {
                send(room.players[cleaned.targetSeat]?.socket, forwarded);
            } else broadcast(room, forwarded, socket);
            return forwarded;
        },
        disconnect(socket) {
            const found = playerFor(socket);
            if (!found) return;
            found.player.socket = null;
            found.player.goneAt = now();
            socket.waysideFury = null;
            broadcast(found.room, { type: 'presence', hostSeat: found.room.hostSeat, players: publicPlayers(found.room) });
            announce(found.room);
        },
        leave,
        tick() {
            for (const [ticket, user] of tickets) if (user.expires <= now()) tickets.delete(ticket);
            for (const room of rooms.values()) {
                const expired = players(room).filter((player) => player.goneAt !== null && now() - player.goneAt >= RECONNECT_MS);
                // Remove guests first so migration selects a seat still in its grace period.
                expired.sort((a, b) => (a.seat === room.hostSeat ? 1 : 0) - (b.seat === room.hostSeat ? 1 : 0));
                for (const player of expired) remove(room, player.seat, 'dropped');
            }
        },
        forgetUser(userId) {
            for (const [key, pass] of tickets) if (pass.userId === userId) tickets.delete(key);
            for (const room of [...rooms.values()]) {
                for (const player of players(room)) {
                    if (player.userId !== userId) continue;
                    const socket = player.socket;
                    if (socket) { socket.waysideFuryUser = null; socket.close?.(4001, 'Account closed'); }
                    remove(room, player.seat, 'account-closed');
                    room.latestState = null;
                }
            }
        },
        close() {
            for (const room of rooms.values()) {
                updateHosting(room.code, null);
                for (const player of players(room)) {
                    if (player.socket) {
                        player.socket.waysideFury = null;
                        player.socket.close(1001, 'Server shutdown');
                    }
                }
            }
            rooms.clear();
            tickets.clear();
        },
    };
    return manager;
}
