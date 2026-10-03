import { FLOOR, KICK_MS, LoungeError, MAX_SAY, MOVES_PER_SECOND, SAY_COOLDOWN_MS, TICKET_MS, cleanSay, cleanSpot, createLounge } from '../waysideOnline/lounge.js';
import { isOptionalAuthRoute, isPublicRoute } from '../utils/authRoutes.js';

function fakeSocket() {
    return {
        readyState: 1,
        sent: [],
        send(data) {
            this.sent.push(JSON.parse(data));
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
    const lounge = createLounge({ now: () => time, mask: (line) => line.replace(/darn/g, '****') });
    const enter = (userId, { admin = false, socket = fakeSocket() } = {}) => {
        lounge.watch(socket);
        lounge.join(socket, { ticket: lounge.ticket({ userId, name: userId.toUpperCase(), admin }) });
        return socket;
    };
    return { lounge, enter, tick: (ms) => (time += ms) };
}

const code = (fn) => {
    try {
        fn();
    } catch (error) {
        if (error instanceof LoungeError) return error.code;
        throw error;
    }
    return null;
};

describe('Wayside Online lounge', () => {
    test('a watcher sees who is in, and everyone sees people come and go', () => {
        const { lounge, enter } = setup();
        const ann = enter('ann');
        const watcher = fakeSocket();
        lounge.watch(watcher);
        expect(watcher.last('room').players.map((p) => p.userId)).toEqual(['ann']);
        const bob = enter('bob');
        expect(ann.last('enter').player).toMatchObject({ userId: 'bob', name: 'BOB' });
        expect(watcher.last('enter').player.userId).toBe('bob');
        lounge.disconnect(bob);
        expect(watcher.last('leave')).toEqual({ type: 'leave', userId: 'bob' });
        expect(lounge.size).toBe(1);
    });

    test('a ticket works once, and not after a minute', () => {
        const { lounge, tick } = setup();
        const socket = fakeSocket();
        lounge.watch(socket);
        const ticket = lounge.ticket({ userId: 'ann', name: 'Ann' });
        lounge.join(socket, { ticket });
        lounge.leave(socket);
        expect(code(() => lounge.join(socket, { ticket }))).toBe('ticket');
        const stale = lounge.ticket({ userId: 'ann', name: 'Ann' });
        tick(TICKET_MS + 1);
        expect(code(() => lounge.join(socket, { ticket: stale }))).toBe('ticket');
        expect(code(() => lounge.join(socket, { ticket: 'made-up' }))).toBe('ticket');
    });

    test('coming in from a second tab moves the avatar there instead of making another', () => {
        const { lounge, enter } = setup();
        const first = enter('ann');
        const second = enter('ann');
        expect(lounge.size).toBe(1);
        expect(first.last('out')).toEqual({ type: 'out', reason: 'elsewhere' });
        lounge.disconnect(first);
        expect(lounge.size).toBe(1);
        lounge.move(second, { x: 0.5, y: 0.7 });
        expect(second.last('move')).toMatchObject({ userId: 'ann', x: 0.5, y: 0.7 });
    });

    test('moves stay on the floor and are rate limited', () => {
        const { lounge, enter, tick } = setup();
        const ann = enter('ann');
        lounge.move(ann, { x: -4, y: 9 });
        expect(ann.last('move')).toMatchObject({ x: FLOOR.left, y: FLOOR.bottom });
        lounge.move(ann, { x: 'left', y: 0.7 });
        for (let i = 0; i < MOVES_PER_SECOND + 3; i++) lounge.move(ann, { x: 0.5, y: 0.7 });
        expect(ann.of('move')).toHaveLength(MOVES_PER_SECOND);
        tick(1001);
        lounge.move(ann, { x: 0.4, y: 0.7 });
        expect(ann.last('move').x).toBe(0.4);
    });

    test('words are one short line, masked, and not too quick', () => {
        const { lounge, enter, tick } = setup();
        const ann = enter('ann');
        lounge.say(ann, { text: '  oh\n\ndarn  it ' });
        expect(ann.last('say')).toMatchObject({ userId: 'ann', say: 'oh **** it' });
        expect(code(() => lounge.say(ann, { text: 'again' }))).toBe('slow');
        tick(SAY_COOLDOWN_MS);
        lounge.say(ann, { text: 'x'.repeat(500) });
        expect(ann.last('say').say).toHaveLength(MAX_SAY);
        expect(cleanSay('   ')).toBeNull();
        expect(cleanSay(42)).toBeNull();
    });

    test('watchers who are not in cannot move or talk', () => {
        const { lounge, enter } = setup();
        const ann = enter('ann');
        const guest = fakeSocket();
        lounge.watch(guest);
        lounge.move(guest, { x: 0.5, y: 0.7 });
        lounge.say(guest, { text: 'hi' });
        expect(ann.of('move')).toHaveLength(0);
        expect(ann.of('say')).toHaveLength(0);
    });

    test('an admin can show someone out for a while; nobody else can', () => {
        const { lounge, enter, tick } = setup();
        const boss = enter('boss', { admin: true });
        const ann = enter('ann');
        expect(code(() => lounge.kick(ann, { userId: 'boss' }))).toBe('forbidden');
        lounge.kick(boss, { userId: 'ann' });
        expect(ann.last('out')).toEqual({ type: 'out', reason: 'kicked' });
        expect(boss.last('leave').userId).toBe('ann');
        expect(code(() => lounge.ticket({ userId: 'ann', name: 'Ann' }))).toBe('kicked');
        tick(KICK_MS + 1);
        expect(code(() => enter('ann', { socket: ann }))).toBeNull();
    });

    test('spots must be numbers', () => {
        expect(cleanSpot({ x: 0.5, y: 0.7 })).toEqual({ x: 0.5, y: 0.7 });
        expect(cleanSpot({ x: NaN, y: 0.7 })).toBeNull();
        expect(cleanSpot(null)).toBeNull();
    });

    test('guests can watch and read looks; a ticket needs a login', () => {
        expect(isPublicRoute('GET', '/wayside-online/lounge/ws')).toBe(true);
        expect(isPublicRoute('GET', '/wayside-online/lounge/crowd')).toBe(true);
        expect(isPublicRoute('POST', '/wayside-online/lounge/ticket')).toBe(false);
        expect(isOptionalAuthRoute('POST', '/wayside-online/lounge/ticket')).toBe(false);
        expect(isOptionalAuthRoute('GET', '/user/looks?ids=a,b')).toBe(true);
    });
});
