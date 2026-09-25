import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import frogBallRoutes from '../routes/frogBall.js';
import { CLEAR_MS, FAIL_MS, RECONNECT_MS, RoomError, START_DELAY_MS, START_LIVES, cleanCode, cleanName, cleanState, createRoomManager, stageScore } from '../frogBall/rooms.js';

function fakeSocket() {
    return {
        readyState: 1,
        sent: [],
        send(data) {
            this.sent.push(JSON.parse(data));
        },
        close() {
            this.readyState = 3;
        },
        of(type) {
            return this.sent.filter((m) => m.type === type);
        },
        last(type) {
            return this.of(type).at(-1);
        },
    };
}

function setup() {
    let time = 1_000_000;
    const rooms = createRoomManager({ now: () => time });
    const host = fakeSocket();
    const guest = fakeSocket();
    const t = {
        rooms,
        host,
        guest,
        advance(ms) {
            time += ms;
            rooms.tick();
        },
        // Both players in, run started, first stage's clock running.
        startRun(count = 3) {
            const room = rooms.create(host, { name: 'Hoppy' });
            rooms.join(guest, { code: room.code, name: 'Lily' });
            rooms.go(host, { count });
            t.advance(START_DELAY_MS);
            return room;
        },
    };
    return t;
}

describe('frog ball co-op rooms', () => {
    test('cleans names, codes and ball updates', () => {
        expect(cleanName('  Terry <script>  ')).toBe('Terry script');
        expect(cleanName('')).toBe('FROG');
        expect(cleanName('', 'P2')).toBe('P2');
        expect(cleanCode(' ab-c9x ')).toBe('ABC9');
        expect(cleanState({ a: 1, t: 2, p: [1, 2, 3], v: [0, 0, 0] })).toMatchObject({ a: 1, p: [1, 2, 3] });
        expect(cleanState({ a: 1, t: 2, p: [1, 2], v: [0, 0, 0] })).toBeNull();
        expect(cleanState({ a: 1, t: 2, p: [1, 2, NaN], v: [0, 0, 0] })).toBeNull();
    });

    test('scores like single player', () => {
        expect(stageScore(40, 60, 3)).toEqual({ timeBonus: 4000, flyBonus: 300, fast: true, total: 8600 });
        expect(stageScore(10, 60, 0)).toEqual({ timeBonus: 1000, flyBonus: 0, fast: false, total: 1000 });
    });

    test('a guest joins by code and the host starts the run', () => {
        const { rooms, host, guest } = setup();
        const room = rooms.create(host, { name: 'Hoppy' });
        expect(room.code).toMatch(/^[A-Z2-9]{4}$/);
        expect(rooms.peek(room.code.toLowerCase())).toMatchObject({ status: 'waiting', host: 'Hoppy' });
        rooms.join(guest, { code: room.code.toLowerCase(), name: 'Lily' });
        expect(guest.last('room')).toMatchObject({ seat: 1, status: 'lobby', names: ['Hoppy', 'Lily'] });
        expect(host.last('room')).toMatchObject({ seat: 0, names: ['Hoppy', 'Lily'] });
        expect(() => rooms.join(fakeSocket(), { code: room.code, name: 'Third' })).toThrow(RoomError);

        // Players who don't give a name go by their seat.
        const other = setup();
        const unnamed = other.rooms.create(other.host, { name: '' });
        other.rooms.join(other.guest, { code: unnamed.code });
        expect(other.guest.last('room').names).toEqual(['P1', 'P2']);

        rooms.go(guest, { count: 6 }); // only the host can start
        expect(host.of('start')).toHaveLength(0);
        rooms.go(host, { count: 6 });
        const start = host.last('start');
        expect(start).toMatchObject({ stage: 0, attempt: 1, lives: START_LIVES, score: 0 });
        expect(guest.last('start')).toEqual(start);
    });

    test('ball updates go to the partner, not back to the sender', () => {
        const { rooms, host, guest, startRun } = setup();
        startRun();
        rooms.state(host, { type: 'state', a: 1, t: 0.5, p: [1, 0.5, -2], v: [0, 0, -3], s: 'play' });
        expect(guest.last('peer')).toMatchObject({ seat: 0, p: [1, 0.5, -2], v: [0, 0, -3] });
        expect(host.of('peer')).toHaveLength(0);
        // An update from an old attempt is dropped.
        rooms.state(host, { a: 0, t: 0.5, p: [9, 9, 9], v: [0, 0, 0] });
        expect(guest.last('peer').p).toEqual([1, 0.5, -2]);
    });

    test('a flood of ball updates is capped', () => {
        const s = setup();
        s.startRun();
        for (let i = 0; i < 200; i++) s.rooms.state(s.host, { a: 1, t: i, p: [0, 0, 0], v: [0, 0, 0] });
        expect(s.guest.of('peer').length).toBeLessThanOrEqual(45);
    });

    test('both balls through the goal clears the stage and moves on', () => {
        const s = setup();
        s.startRun(3);
        s.rooms.fly(s.host, { attempt: 1, id: 2, big: false });
        s.rooms.fly(s.guest, { attempt: 1, id: 2, big: false }); // same fly, counted once
        s.rooms.fly(s.guest, { attempt: 1, id: 7, big: true });
        expect(s.host.of('fly')).toHaveLength(2);

        s.rooms.goal(s.host, { attempt: 1, left: 50, limit: 60 });
        expect(s.guest.last('goal')).toEqual({ type: 'goal', seat: 0 });
        expect(s.host.of('outcome')).toHaveLength(0);
        s.rooms.goal(s.guest, { attempt: 1, left: 40, limit: 60 });
        // The later ball's time counts: 40s left, 11 flies, more than half the time left.
        const outcome = s.host.last('outcome');
        expect(outcome).toMatchObject({ kind: 'clear', score: (4000 + 1100) * 2, lives: START_LIVES });
        expect(s.guest.last('outcome')).toEqual(outcome);

        s.advance(CLEAR_MS - 1);
        expect(s.host.last('start').stage).toBe(0);
        s.advance(1);
        expect(s.host.last('start')).toMatchObject({ stage: 1, attempt: 2, score: 10200 });
    });

    test('a fall costs a shared life and retries the stage; out of lives ends the run', () => {
        const s = setup();
        const room = s.startRun(3);
        for (let life = START_LIVES; life >= 0; life--) {
            const attempt = s.host.last('start').attempt;
            s.advance(START_DELAY_MS);
            s.rooms.fail(s.guest, { attempt, why: 'fall' });
            s.rooms.fail(s.host, { attempt, why: 'time' }); // too late, already failed
            expect(s.host.last('outcome')).toMatchObject({ kind: 'fall', seat: 1, lives: life - 1 });
            s.advance(FAIL_MS);
        }
        expect(s.host.last('over')).toMatchObject({ cleared: false, reason: 'lives', stage: 0 });
        expect(room.status).toBe('lobby');
        expect(s.host.last('room').status).toBe('lobby');
    });

    test('clearing the last stage ends the run as cleared', () => {
        const s = setup();
        s.startRun(1);
        s.rooms.goal(s.host, { attempt: 1, left: 10, limit: 60 });
        s.rooms.goal(s.guest, { attempt: 1, left: 10, limit: 60 });
        s.advance(CLEAR_MS);
        expect(s.guest.last('over')).toMatchObject({ cleared: true, reason: 'cleared', score: 1000 });
    });

    test('reports before the stage clock starts are ignored', () => {
        const s = setup();
        const room = s.rooms.create(s.host, { name: 'A' });
        s.rooms.join(s.guest, { code: room.code, name: 'B' });
        s.rooms.go(s.host, { count: 2 });
        s.rooms.fail(s.host, { attempt: 1, why: 'fall' });
        expect(s.host.of('outcome')).toHaveLength(0);
    });

    test('a dropped player can rejoin mid-run; one who never returns ends it', () => {
        const s = setup();
        const room = s.startRun();
        const token = s.guest.last('room').token;
        s.rooms.disconnect(s.guest);
        expect(s.host.last('presence').connected).toEqual([true, false]);
        const back = fakeSocket();
        s.rooms.rejoin(back, { code: room.code, token });
        expect(back.last('room')).toMatchObject({ seat: 1, status: 'playing' });
        expect(back.last('start')).toMatchObject({ stage: 0, attempt: 1 });

        s.rooms.disconnect(back);
        s.advance(RECONNECT_MS + 1);
        expect(s.host.last('over')).toMatchObject({ cleared: false, reason: 'disconnected' });
    });

    test('leaving closes the room for both', () => {
        const s = setup();
        const room = s.startRun();
        s.rooms.leave(s.guest);
        expect(s.host.last('left')).toEqual({ type: 'left', seat: 1 });
        expect(s.rooms.room(room.code)).toBeNull();
    });
});

describe('frog ball co-op socket', () => {
    test('two players meet in a room and see each other move', async () => {
        const app = Fastify();
        await app.register(websocket);
        await app.register(frogBallRoutes, { prefix: '/frog-ball' });
        await app.ready();
        const sockets = [];
        try {
            const open = async () => {
                const socket = await app.injectWS('/frog-ball/ws');
                sockets.push(socket);
                const inbox = [];
                socket.on('message', (data) => inbox.push(JSON.parse(data.toString())));
                const next = (type) =>
                    new Promise((resolve) => {
                        const look = () => {
                            const i = inbox.findIndex((m) => m.type === type);
                            if (i >= 0) resolve(inbox.splice(i, 1)[0]);
                            else setTimeout(look, 5);
                        };
                        look();
                    });
                return { send: (m) => socket.send(JSON.stringify(m)), next };
            };
            const host = await open();
            host.send({ type: 'create', name: 'Hoppy' });
            const { code } = await host.next('room');
            const guest = await open();
            guest.send({ type: 'join', code, name: 'Lily' });
            expect((await guest.next('room')).names).toEqual(['Hoppy', 'Lily']);
            host.send({ type: 'ping', t: 1 });
            expect(typeof (await host.next('pong')).now).toBe('number');
            host.send({ type: 'go', count: 6 });
            const start = await guest.next('start');
            expect(start).toMatchObject({ stage: 0, attempt: 1 });
            host.send({ type: 'state', a: 1, t: 0.1, p: [1, 2, 3], v: [0, 0, 0] });
            expect((await guest.next('peer')).p).toEqual([1, 2, 3]);
        } finally {
            sockets.forEach((socket) => socket.terminate());
            await app.close();
        }
    });
});
