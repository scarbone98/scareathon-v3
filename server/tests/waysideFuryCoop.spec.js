import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import waysideFuryCoopRoutes from '../routes/waysideFuryCoop.js';
import { createRoomManager, RoomError, CODE_LENGTH, RECONNECT_MS, TICKET_MS, MAX_MESSAGE_BYTES, MAX_MESSAGES_PER_SECOND } from '../wayside-fury/rooms.js';
import { cleanRelay, cleanAppearance } from '../wayside-fury/protocol.js';
import { isWaysideFuryDevAuth } from '../wayside-fury/devAuth.js';
import { listHosting, subscribeHosting } from '../wayside-fury/presence.js';
import { isOptionalAuthRoute, isPublicRoute } from '../utils/authRoutes.js';

const managers = [];
afterEach(() => { managers.splice(0).forEach((manager) => manager.close()); });
function fakeSocket() {
    return {
        readyState: 1, sent: [],
        send(data) { this.sent.push(JSON.parse(data)); },
        close() { this.readyState = 3; },
        of(type) { return this.sent.filter((message) => message.type === type); },
        last(type) { return this.of(type).at(-1); },
    };
}
function setup() {
    let time = 1_000_000;
    const rooms = createRoomManager({ now: () => time });
    managers.push(rooms);
    const player = (userId, name = userId) => {
        const socket = fakeSocket();
        rooms.auth(socket, { ticket: rooms.issueTicket({ userId, name }) });
        return socket;
    };
    const host = player('host', 'Terry');
    const guest = player('guest', 'Francine');
    return { rooms, player, host, guest, advance(ms) { time += ms; rooms.tick(); } };
}
function errorCode(fn) {
    try { fn(); } catch (error) {
        if (error instanceof RoomError) return error.code;
        throw error;
    }
    return null;
}
const input = () => ({ x: 0, y: 0, attack: false, ki: false, dash: false, guard: false, swap: false, interact: false });
const hero = () => ({
    seat: 3, userId: 'forged', name: 'Forged',
    hero: { id: 'you', hp: 100, maxHp: 100, ki: 20, maxKi: 30, stamina: 20, maxStamina: 30, level: 1, xp: 0, power: 12, defense: 3, invulnerable: 0 },
    x: 100, y: 110, faceX: 1, faceY: 0, moving: false, guard: false,
    attackTimer: 0, combo: 0, charge: 0, dashTimer: 0, scene: 'test', room: 0,
});
const world = () => ({
    scene: 'test', room: 0, time: 1, x: 100, y: 110, enemies: [], projectiles: [],
    palette: 'real', transitionTarget: null, transitionPalette: 'real', cutscene: 0, sceneTimer: 0,
    clearedRooms: [], areas: [], bosses: [], chapter: 1, rngSeed: 1, nextId: 1,
});
const enemy = () => ({
    id: 1, kind: 'grunt', sprite: 'zombie', x: 30, y: 40, hp: 32, maxHp: 32,
    radius: 7, speed: 23, cooldown: 0.5, hitTimer: 0, kx: 0, ky: 0, miniBoss: false,
    phase: 1, pattern: 0, windup: 0, actionTimer: 0, aimX: -1, aimY: 0,
});
const appearance = () => ({ profile: { skin: 'peach', hair: 'sandy', eyes: 'ink_eye' }, outfit: [{ key: 'body_kid', dyes: { dye1: 'orange' } }] });

describe('Wayside Fury four-seat rooms', () => {
    test('requires a signed-in ticket and it is short-lived and single-use', () => {
        const { rooms, advance } = setup();
        expect(errorCode(() => rooms.create(fakeSocket()))).toBe('auth');
        expect(errorCode(() => rooms.auth(fakeSocket(), { ticket: 'forged' }))).toBe('ticket');
        const ticket = rooms.issueTicket({ userId: 'ann', name: 'Ann' });
        const socket = fakeSocket();
        rooms.auth(socket, { ticket });
        expect(socket.last('ready')).toEqual({ type: 'ready', userId: 'ann', name: 'Ann' });
        expect(errorCode(() => rooms.auth(fakeSocket(), { ticket }))).toBe('ticket');
        const expired = rooms.issueTicket({ userId: 'ann', name: 'Ann' });
        advance(TICKET_MS);
        expect(errorCode(() => rooms.auth(fakeSocket(), { ticket: expired }))).toBe('ticket');
    });

    test('creates four-character codes, authenticates names, joins four seats and rejects a fifth', () => {
        const { rooms, host, guest, player } = setup();
        const room = rooms.create(host, { name: 'Spoofed' });
        expect(room.code).toHaveLength(CODE_LENGTH);
        expect(room.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
        expect(host.last('room')).toMatchObject({ seat: 0, hostSeat: 0, players: [{ seat: 0, userId: 'host', name: 'Terry', connected: true }] });
        rooms.join(guest, { code: room.code.toLowerCase(), name: 'Spoofed' });
        rooms.join(player('third'), { code: room.code });
        rooms.join(player('fourth'), { code: room.code });
        expect(host.last('room').players.map((entry) => entry.seat)).toEqual([0, 1, 2, 3]);
        expect(guest.last('room')).toMatchObject({ seat: 1, hostSeat: 0 });
        expect(errorCode(() => rooms.join(player('fifth'), { code: room.code }))).toBe('full');
        expect(errorCode(() => rooms.join(player('sixth'), { code: 'ZZZZ' }))).toBe('missing');
        expect(rooms.peek(host, { code: room.code })).toMatchObject({ status: 'full', count: 4, host: 'Terry' });
        expect(host.last('joined')).toMatchObject({ seat: 3, userId: 'fourth' });
    });

    test('reconnects a reserved seat and binds its token to the signed-in identity', () => {
        const { rooms, host, guest, player, advance } = setup();
        const room = rooms.create(host);
        rooms.join(guest, { code: room.code });
        const token = guest.last('room').token;
        rooms.disconnect(guest);
        expect(host.last('presence').players.find((entry) => entry.seat === 1).connected).toBe(false);
        expect(errorCode(() => rooms.rejoin(player('intruder'), { code: room.code, token }))).toBe('missing');
        advance(RECONNECT_MS - 1);
        const back = player('guest');
        rooms.rejoin(back, { code: room.code, token });
        expect(back.last('room')).toMatchObject({ seat: 1, token, hostSeat: 0 });
        expect(back.last('room').players.every((entry) => entry.connected)).toBe(true);
        rooms.disconnect(back);
        advance(RECONNECT_MS);
        expect(errorCode(() => rooms.rejoin(player('guest'), { code: room.code, token }))).toBe('missing');
        expect(host.last('left')).toMatchObject({ seat: 1, reason: 'dropped' });
    });

    test('a full room reserves disconnected seats for the entire grace period', () => {
        const { rooms, host, guest, player, advance } = setup();
        const room = rooms.create(host);
        rooms.join(guest, { code: room.code });
        rooms.join(player('third'), { code: room.code });
        rooms.join(player('fourth'), { code: room.code });
        rooms.disconnect(guest);
        expect(errorCode(() => rooms.join(player('fifth'), { code: room.code }))).toBe('full');
        advance(RECONNECT_MS);
        const fifth = player('fifth');
        rooms.join(fifth, { code: room.code });
        expect(fifth.last('room').seat).toBe(1);
    });

    test('migrates the host after grace, retaining stable seats and the latest world', () => {
        const { rooms, host, guest, player, advance } = setup();
        const room = rooms.create(host);
        rooms.join(guest, { code: room.code });
        const third = player('third');
        rooms.join(third, { code: room.code });
        rooms.relay(host, { type: 'state', state: { ...world(), time: 42 } });
        rooms.disconnect(host);
        advance(RECONNECT_MS - 1);
        expect(room.hostSeat).toBe(0);
        expect(guest.of('host')).toHaveLength(0);
        advance(1);
        expect(room.hostSeat).toBe(1);
        expect(guest.last('host')).toMatchObject({ hostSeat: 1, previousHostSeat: 0, reason: 'dropped' });
        expect(guest.last('room')).toMatchObject({ seat: 1, hostSeat: 1 });
        expect(third.last('room').seat).toBe(2);
        expect(guest.last('state')).toMatchObject({ seat: 1, userId: 'guest', snapshot: true, state: { time: 42 } });
        expect(errorCode(() => rooms.relay(third, { type: 'state', state: world() }))).toBe('host');
        expect(errorCode(() => rooms.relay(guest, { type: 'state', state: world() }))).toBeNull();
    });

    test('host reconnecting before grace retains authority and a new tab replaces the old socket', () => {
        const { rooms, host, guest, player, advance } = setup();
        const room = rooms.create(host);
        rooms.join(guest, { code: room.code });
        const token = host.last('room').token;
        const back = player('host');
        rooms.rejoin(back, { code: room.code, token });
        expect(host.readyState).toBe(3);
        rooms.disconnect(host); // old tab close must not remove the new connection
        expect(room.players[0].socket).toBe(back);
        rooms.disconnect(back);
        advance(1000);
        const again = player('host');
        rooms.rejoin(again, { code: room.code, token });
        expect(again.last('room')).toMatchObject({ hostSeat: 0, seat: 0 });
    });

    test('leaving frees a seat immediately, migrates host, and final leave deletes the room', () => {
        const { rooms, host, guest, player } = setup();
        const room = rooms.create(host);
        rooms.join(guest, { code: room.code });
        const third = player('third');
        rooms.join(third, { code: room.code });
        rooms.leave(guest);
        expect(host.last('left')).toMatchObject({ seat: 1, reason: 'left' });
        expect(guest.last('left-room').code).toBe(room.code);
        rooms.leave(host);
        expect(third.last('room')).toMatchObject({ hostSeat: 2, seat: 2 });
        rooms.leave(third);
        expect(rooms.room(room.code)).toBeNull();
    });

    test('new members receive the latest world and peers, including their cached appearance', () => {
        const { rooms, host, guest } = setup();
        const room = rooms.create(host);
        rooms.relay(host, { type: 'state', state: { ...world(), time: 100 } });
        rooms.relay(host, { type: 'hero', hero: hero(), input: input(), appearance: appearance() });
        rooms.relay(host, { type: 'hero', hero: hero(), input: input() });
        rooms.join(guest, { code: room.code });
        expect(guest.last('state')).toMatchObject({ snapshot: true, state: { time: 100 } });
        expect(guest.last('hero')).toMatchObject({ appearance: appearance(), hero: { userId: 'host', name: 'Terry', seat: 0 } });
    });

    test('hosting presence tracks membership, disconnection and migration', () => {
        const { rooms, host, guest, advance } = setup();
        const changes = [];
        const unsubscribe = subscribeHosting((hosts) => changes.push(hosts));
        try {
            const room = rooms.create(host);
            rooms.join(guest, { code: room.code });
            expect(listHosting()).toEqual([{ userId: 'host', name: 'Terry', hosting: { game: 'Wayside Fury', code: room.code, count: 2, max: 4 } }]);
            rooms.disconnect(guest);
            expect(listHosting()[0].hosting.count).toBe(2); // Reserved seats still occupy capacity.
            rooms.rejoin(guest, { code: room.code, token: guest.last('room').token });
            rooms.disconnect(host);
            expect(listHosting()).toEqual([]);
            advance(RECONNECT_MS);
            expect(listHosting()[0].userId).toBe('guest');
            rooms.leave(guest);
            expect(listHosting()).toEqual([]);
            expect(changes.length).toBeGreaterThan(3);
        } finally { unsubscribe(); }
    });
});

describe('Wayside Fury relay validation', () => {
    test('reward progress uses rooms, whitelists fields, and rejects invalid receipts, arrays and numbers', () => {
        const reward = { id: 'ABCD:uuid-123:checkpoint:blast-0', kind: 'checkpoint', xp: 50, candy: 0,
            rooms: ['blast-0', 'blast-0'], areas: ['blast'], bosses: ['blast-watcher'], chapter: 2 };
        expect(cleanRelay({ type: 'reward', reward: { ...reward, clearedRooms: ['ignored'], unknown: 99 } }).reward).toEqual({ ...reward, rooms: ['blast-0'] });
        for (const invalid of [
            { id: 'https://attacker.invalid/reward' }, { kind: 'unknown' }, { xp: NaN }, { xp: Infinity },
            { xp: -1 }, { candy: 10_001 }, { xp: undefined }, { chapter: 0 },
            { rooms: 'blast-0' }, { rooms: [null] }, { rooms: [123] }, { rooms: [{}] },
            { rooms: ['<script>'] }, { rooms: Array(129).fill('blast-0') },
            { areas: [Infinity] }, { bosses: [{ id: 'boss' }] },
        ]) expect(cleanRelay({ type: 'reward', reward: { ...reward, ...invalid } })).toBeNull();
    });
    test('instanced chest rewards preserve bounded tonic and gear deltas', () => {
        const reward = { id: 'ABCD:chest:blast-2', kind: 'checkpoint', xp: 0, candy: 0,
            healHp: 1_000_000, healKi: 1_000_000, power: 10_000, ward: 10_000 };
        expect(cleanRelay({ type: 'reward', reward }).reward).toEqual(reward);
        expect(cleanRelay({ type: 'reward', reward: { ...reward, healHp: 0, healKi: 0, power: 0, ward: 0 } }).reward).toEqual({ ...reward, healHp: 0, healKi: 0, power: 0, ward: 0 });
        for (const [key, max] of [['healHp', 1_000_000], ['healKi', 1_000_000], ['power', 10_000], ['ward', 10_000]]) {
            for (const value of [-1, max + 1, 1.5, '1', null, NaN, Infinity]) {
                expect(cleanRelay({ type: 'reward', reward: { ...reward, [key]: value } })).toBeNull();
            }
        }
    });
    test('peers get heroes while only host gets hits and inputs, with authenticated sender identity', () => {
        const { rooms, host, guest, player } = setup();
        const room = rooms.create(host);
        rooms.join(guest, { code: room.code });
        const third = player('third');
        rooms.join(third, { code: room.code });
        rooms.relay(guest, { type: 'hero', hero: hero(), input: input(), seat: 0, userId: 'forged' });
        expect(host.last('hero')).toMatchObject({ seat: 1, userId: 'guest', name: 'Francine', hero: { seat: 1, userId: 'guest', name: 'Francine' } });
        expect(third.last('hero').seat).toBe(1);
        expect(guest.of('hero')).toHaveLength(0);
        const hit = { type: 'hit', enemyId: 1, damage: 12, dx: 1, dy: 0, force: 40, attackId: 'attack-1', scene: 'test', room: 0 };
        rooms.relay(guest, hit);
        rooms.relay(guest, { type: 'input', input: input() });
        expect(host.last('hit')).toMatchObject({ seat: 1, attackId: 'attack-1' });
        expect(host.last('input').seat).toBe(1);
        expect(third.of('hit')).toHaveLength(0);
        expect(third.of('input')).toHaveLength(0);
    });

    test('worlds, rewards, revives and damage require host and targeted messages stay private', () => {
        const { rooms, host, guest, player } = setup();
        const room = rooms.create(host);
        rooms.join(guest, { code: room.code });
        const third = player('third');
        rooms.join(third, { code: room.code });
        for (const message of [
            { type: 'state', state: world() },
            { type: 'reward', reward: { id: 'kill-1', kind: 'kill', xp: 12, candy: 1 } },
            { type: 'revive', targetSeat: 2 },
            { type: 'damage', targetSeat: 2, damage: 4, sourceX: 0, sourceY: 0 },
        ]) expect(errorCode(() => rooms.relay(guest, message))).toBe('host');
        rooms.relay(host, { type: 'reward', targetSeat: 1, reward: { id: 'kill-1', kind: 'kill', xp: 12, candy: 1 } });
        expect(guest.last('reward').reward.xp).toBe(12);
        expect(third.of('reward')).toHaveLength(0);
        rooms.relay(host, { type: 'revive', targetSeat: 1, hp: 40 });
        rooms.relay(host, { type: 'damage', targetSeat: 1, damage: 4, sourceX: 0, sourceY: 0 });
        expect(guest.last('revive')).toMatchObject({ targetSeat: 1, hp: 40 });
        expect(guest.last('damage').damage).toBe(4);
    });

    test('rejects malformed, nonfinite, incomplete and oversized snapshots and strips appearance URLs', () => {
        const { rooms, host } = setup();
        rooms.create(host);
        const valid = { type: 'state', state: { ...world(), enemies: [enemy()] } };
        expect(cleanRelay(valid)).toEqual(valid);
        for (const message of [
            { type: 'state', state: { ...world(), scene: 'not-a-scene' } },
            { type: 'state', state: { ...world(), palette: null } },
            { type: 'state', state: { ...world(), enemies: [{ ...enemy(), cooldown: undefined }] } },
            { type: 'state', state: { ...world(), enemies: [{ ...enemy(), hp: NaN }] } },
            { type: 'hero', hero: { ...hero(), x: Infinity }, input: input() },
            { type: 'hero', hero: hero(), input: { ...input(), attack: 'yes' } },
            { type: 'hit', enemyId: 1, damage: -1, dx: 0, dy: 0, force: 1, attackId: 'a', scene: 'test', room: 0 },
            { type: 'reward', reward: { id: 'r', kind: 'kill', xp: '12', candy: 1 } },
            { type: 'state', state: { ...world(), unsafe: JSON.parse('{"__proto__":{}}') } },
        ]) expect(errorCode(() => rooms.relay(host, message))).toBe('invalid');
        expect(errorCode(() => rooms.relay(host, { type: 'state', state: { ...world(), excessive: 'x'.repeat(MAX_MESSAGE_BYTES) } }))).toBe('size');
        const look = cleanAppearance({ ...appearance(), url: 'https://attacker.invalid/avatar', outfit: [{ ...appearance().outfit[0], src: 'https://attacker.invalid/sprite' }] });
        expect(look).toEqual(appearance());
        expect(cleanAppearance({ ...appearance(), profile: { ...appearance().profile, skin: 'url(evil)' } })).toBeNull();
        expect(cleanAppearance({ ...appearance(), profile: { ...appearance().profile, skin: 'https://attacker.invalid/skin' } })).toBeNull();
        expect(cleanAppearance({ ...appearance(), profile: { ...appearance().profile, skin: '#aabbcc' } })).toBeNull();
    });

    test('per-socket limits count every message independently and reset each second', () => {
        const { rooms, host, guest, advance } = setup();
        for (let index = 0; index < MAX_MESSAGES_PER_SECOND; index++) expect(rooms.accept(host)).toBe(true);
        expect(rooms.accept(host)).toBe(false);
        expect(rooms.accept(guest)).toBe(true);
        advance(1000);
        expect(rooms.accept(host)).toBe(true);
    });
});

async function makeServer({ dev = false, production = false, now } = {}) {
    const app = Fastify();
    app.decorateRequest('user', null);
    app.addHook('preValidation', async (request) => {
        if (request.headers.authorization === 'Bearer test-player') request.user = { sub: 'signed-in' };
    });
    await app.register(websocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });
    const rooms = createRoomManager({ now });
    managers.push(rooms);
    await app.register(waysideFuryCoopRoutes, {
        prefix: '/wayside-fury/coop', rooms,
        env: { WAYSIDE_FURY_DEV_AUTH: dev ? 'true' : 'false', NODE_ENV: production ? 'production' : 'development' },
        db: { query: async (_sql, [id]) => ({ rows: id === 'signed-in' ? [{ username: 'Signed In' }] : [] }) },
    });
    await app.ready();
    return { app, rooms };
}

async function openSocket(app) {
    const socket = await app.injectWS('/wayside-fury/coop/ws');
    const inbox = [];
    const listeners = new Set();
    socket.on('message', (raw) => { inbox.push(JSON.parse(raw.toString())); for (const listener of listeners) listener(); });
    return {
        socket,
        send(message) { socket.send(JSON.stringify(message)); },
        next(type) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => { listeners.delete(look); reject(new Error(`No ${type} message received`)); }, 2000);
                function look() {
                    const index = inbox.findIndex((message) => message.type === type);
                    if (index < 0) return;
                    clearTimeout(timer); listeners.delete(look); resolve(inbox.splice(index, 1)[0]);
                }
                listeners.add(look); look();
            });
        },
    };
}

describe('Wayside Fury websocket registration and auth', () => {
    test('HTTP tickets and hosting need auth; WS uses a ticket, production disables dev auth', async () => {
        const { app } = await makeServer({ dev: true, production: true });
        try {
            expect((await app.inject({ method: 'POST', url: '/wayside-fury/coop/ticket' })).statusCode).toBe(401);
            expect((await app.inject({ method: 'GET', url: '/wayside-fury/coop/hosting' })).statusCode).toBe(401);
            const ticket = await app.inject({ method: 'POST', url: '/wayside-fury/coop/ticket', headers: { authorization: 'Bearer test-player' } });
            expect(ticket.statusCode).toBe(200);
            expect(ticket.json().ticket).toMatch(/^[a-f0-9]{48}$/);
            expect((await app.inject({ method: 'POST', url: '/wayside-fury/coop/dev-ticket', payload: { userId: 'dev-host', name: 'Host' } })).statusCode).toBe(404);
            expect(isPublicRoute('GET', '/wayside-fury/coop/ws')).toBe(true);
            expect(isPublicRoute('POST', '/wayside-fury/coop/ticket')).toBe(false);
            expect(isOptionalAuthRoute('POST', '/wayside-fury/coop/ticket')).toBe(false);
            expect(isWaysideFuryDevAuth({ NODE_ENV: 'production', WAYSIDE_FURY_DEV_AUTH: 'true' })).toBe(false);
            expect(isWaysideFuryDevAuth({ NODE_ENV: 'development', WAYSIDE_FURY_DEV_AUTH: 'true' })).toBe(true);
            expect(isWaysideFuryDevAuth({ NODE_ENV: 'development' })).toBe(false);
        } finally { await app.close(); }
    });

    test('two ticket-authenticated sockets join, relay heroes and reject invalid and guest-authoritative state', async () => {
        const { app } = await makeServer({ dev: true });
        const connections = [];
        try {
            const auth = async (name) => {
                const ticket = await app.inject({ method: 'POST', url: '/wayside-fury/coop/dev-ticket', payload: { userId: `dev-${name}`, name } });
                const connection = await openSocket(app); connections.push(connection);
                connection.send({ type: 'auth', ticket: ticket.json().ticket });
                await connection.next('ready');
                return connection;
            };
            const unauthenticated = await openSocket(app); connections.push(unauthenticated);
            unauthenticated.send({ type: 'create' });
            expect((await unauthenticated.next('error')).code).toBe('auth');
            const host = await auth('host');
            host.send({ type: 'create' });
            const { code } = await host.next('room');
            const guest = await auth('guest');
            guest.send({ type: 'join', code });
            expect((await guest.next('room')).players.map((player) => player.userId)).toEqual(['dev-host', 'dev-guest']);
            guest.send({ type: 'hero', hero: hero(), input: input() });
            expect((await host.next('hero')).hero).toMatchObject({ userId: 'dev-guest', seat: 1 });
            guest.send({ type: 'obstacle', id: 'world-joe-road', scene: 'dungeon', room: 0, seat: 0, userId: 'forged' });
            expect(await host.next('obstacle')).toMatchObject({ id: 'world-joe-road', scene: 'dungeon', room: 0, seat: 1, userId: 'dev-guest' });
            guest.send({ type: 'state', state: world() });
            expect((await guest.next('error')).code).toBe('host');
            host.send({ type: 'state', state: { ...world(), enemies: [{ id: 1 }] } });
            expect((await host.next('error')).code).toBe('invalid');
            host.send({ type: 'state', state: world() });
            expect((await guest.next('state')).state).toEqual(world());
            host.send({ type: 'ping', t: 1 });
            expect(typeof (await host.next('pong')).now).toBe('number');
            guest.send({ type: 'leave' });
            expect((await host.next('left')).userId).toBe('dev-guest');
        } finally { connections.forEach(({ socket }) => socket.terminate()); await app.close(); }
    });

    test('malformed packets count toward the socket rate limit and flooding closes the connection', async () => {
        const { app, rooms } = await makeServer({ now: () => 1_000_000 });
        const ticket = rooms.issueTicket({ userId: 'rate-test', name: 'Rate Test' });
        const connection = await openSocket(app);
        const { socket } = connection;
        try {
            connection.send({ type: 'auth', ticket });
            await connection.next('ready');
            const closed = new Promise((resolve) => socket.once('close', (code) => resolve(code)));
            for (let index = 0; index <= MAX_MESSAGES_PER_SECOND; index++) socket.send('not-json');
            expect(await closed).toBe(4008);
        } finally { socket.terminate(); await app.close(); }
    });
});
