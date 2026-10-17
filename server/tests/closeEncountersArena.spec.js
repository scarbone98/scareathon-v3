import { BROADCAST, HOLD_MS, LIMITS, MAX_CLAIMS, MAX_PLAYERS, createArenaManager } from '../closeEncounters/arena.js';
import { isPublicRoute } from '../utils/authRoutes.js';

function fakeSocket() {
    return {
        readyState: 1,
        texts: [],
        packets: [],
        send(data, options) {
            if (options?.binary) this.packets.push(Buffer.from(data));
            else this.texts.push(JSON.parse(data));
        },
        of(type) {
            return this.texts.filter((m) => m.type === type);
        },
        last(type) {
            return this.of(type).pop();
        },
    };
}

describe('Close Encounters arena', () => {
    let clock;
    let arena;
    let seeds;
    const enter = (name, hero = 'saucer') => {
        const socket = fakeSocket();
        arena.message(socket, { type: 'join_arena', name, hero });
        return socket;
    };
    beforeEach(() => {
        clock = 1000;
        seeds = 0;
        arena = createArenaManager({ now: () => clock, seedOf: () => { seeds += 1; return 4242 + seeds; } });
    });

    test('guests may open the socket', () => {
        expect(isPublicRoute('GET', '/close-encounters/arena/ws')).toBe(true);
        expect(isPublicRoute('POST', '/close-encounters/arena/ws')).toBe(false);
    });

    test('the first player opens an arena and is welcomed into it', () => {
        const sam = enter('Sam', 'orb');
        const hi = sam.last('arena');
        expect(hi).toMatchObject({ slot: 0, seed: 4243, born: 1000, now: 1000, max: MAX_PLAYERS, claimed: [] });
        expect(hi.token).toMatch(/^[0-9a-f]{24}$/);
        expect(hi.players).toEqual([{ slot: 0, name: 'Sam', hero: 'orb', score: 0, away: false }]);
        expect(arena.size()).toBe(1);
    });

    test('players drop into the fullest arena with a seat, and a new one opens when they are full', () => {
        const first = enter('A');
        const id = first.last('arena').arena;
        clock += 5000;
        const second = enter('B', 'cigar');
        expect(second.last('arena')).toMatchObject({ arena: id, slot: 1, born: 1000, now: 6000, seed: 4243 });
        expect(first.last('joined')).toEqual({ type: 'joined', slot: 1, name: 'B', hero: 'cigar' });
        for (let i = 2; i < MAX_PLAYERS; i += 1) enter(`P${i}`);
        expect(arena.size()).toBe(1);
        const late = enter('Late');
        expect(late.last('arena').arena).not.toBe(id);
        expect(late.last('arena').slot).toBe(0);
        expect(arena.size()).toBe(2);
        // (a seat freed in the first: the next player goes there, the fuller one)
        arena.leave(second);
        expect(first.last('left')).toEqual({ type: 'left', slot: 1 });
        const next = enter('Next');
        expect(next.last('arena')).toMatchObject({ arena: id, slot: 1 });
    });

    test('the first claim on a thing wins, and everyone is told', () => {
        const a = enter('A');
        const b = enter('B');
        arena.message(b, { type: 'claim', id: 70001 });
        expect(a.last('claimed')).toEqual({ type: 'claimed', id: 70001, slot: 1 });
        expect(b.last('claimed')).toEqual({ type: 'claimed', id: 70001, slot: 1 });
        const before = b.of('claimed').length;
        arena.message(a, { type: 'claim', id: 70001 });
        // (too late: only the late one hears who got it)
        expect(a.last('claimed')).toEqual({ type: 'claimed', id: 70001, slot: 1 });
        expect(b.of('claimed')).toHaveLength(before);
        // (and someone joining later knows it's gone)
        const c = enter('C');
        expect(c.last('arena').claimed).toEqual([[70001, 1]]);
        // (nonsense is ignored)
        arena.message(a, { type: 'claim', id: -3 });
        arena.message(a, { type: 'claim', id: 'x' });
        arena.message(a, { type: 'claim', id: 1.5 });
        expect(arena.arena(a.last('arena').arena).claims.size).toBe(1);
    });

    test('an arena forgets its oldest claims past the limit', () => {
        const a = enter('A');
        const id = a.last('arena').arena;
        for (let i = 0; i <= MAX_CLAIMS; i += 1) {
            if (i % (LIMITS.texts - 1) === 0) clock += 1000;
            arena.message(a, { type: 'claim', id: i });
        }
        const claims = arena.arena(id).claims;
        expect(claims.size).toBe(MAX_CLAIMS);
        expect(claims.has(0)).toBe(false);
        expect(claims.has(MAX_CLAIMS)).toBe(true);
    });

    test('game packets go to everyone else, or to one seat, marked with who sent them', () => {
        const a = enter('A');
        const b = enter('B');
        const c = enter('C');
        expect(arena.relay(b, Buffer.from([BROADCAST, 3, 9, 9]))).toBe(true);
        expect(a.packets.pop()).toEqual(Buffer.from([1, 3, 9, 9]));
        expect(c.packets.pop()).toEqual(Buffer.from([1, 3, 9, 9]));
        expect(b.packets).toHaveLength(0);
        arena.relay(c, Buffer.from([0, 7, 1]));
        expect(a.packets.pop()).toEqual(Buffer.from([2, 7, 1]));
        expect(b.packets).toHaveLength(0);
        // (too short, or from nobody seated)
        expect(arena.relay(a, Buffer.from([BROADCAST]))).toBe(false);
        expect(arena.relay(fakeSocket(), Buffer.from([BROADCAST, 1]))).toBe(false);
    });

    test('a player sending too much is held back for the rest of the second', () => {
        const a = enter('A');
        const b = enter('B');
        for (let i = 0; i < LIMITS.packets; i += 1) expect(arena.relay(a, Buffer.from([BROADCAST, 1]))).toBe(true);
        expect(arena.relay(a, Buffer.from([BROADCAST, 1]))).toBe(false);
        clock += 1000;
        expect(arena.relay(a, Buffer.from([BROADCAST, 1]))).toBe(true);
        expect(b.packets).toHaveLength(LIMITS.packets + 1);
    });

    test('standings come about once a second, when they have changed', () => {
        const a = enter('Ann');
        const b = enter('Bob');
        arena.message(a, { type: 'score', score: 1200.7 });
        arena.message(b, { type: 'score', score: 5000 });
        arena.tick();
        expect(a.last('top')).toEqual({ type: 'top', top: [{ slot: 1, name: 'Bob', score: 5000 }, { slot: 0, name: 'Ann', score: 1200 }] });
        const count = a.of('top').length;
        arena.tick();
        expect(a.of('top')).toHaveLength(count);
        arena.message(a, { type: 'score', score: 9000 });
        arena.tick();
        expect(a.last('top').top[0]).toEqual({ slot: 0, name: 'Ann', score: 9000 });
        // (nonsense scores are kept out)
        arena.message(b, { type: 'score', score: -40 });
        arena.message(a, { type: 'score', score: 'lots' });
        arena.tick();
        expect(a.last('top').top).toEqual([{ slot: 0, name: 'Ann', score: 9000 }, { slot: 1, name: 'Bob', score: 0 }]);
    });

    test('a dropped player keeps their seat for a while and can take it back', () => {
        const a = enter('A');
        const b = enter('B', 'jelly');
        const { arena: id, token } = b.last('arena');
        arena.disconnect(b);
        expect(a.last('away')).toEqual({ type: 'away', slot: 1 });
        // (the seat is still taken)
        const c = enter('C');
        expect(c.last('arena').slot).toBe(2);
        clock += HOLD_MS - 1000;
        arena.tick();
        const back = fakeSocket();
        arena.message(back, { type: 'rejoin_arena', arena: id, token });
        expect(back.last('arena')).toMatchObject({ arena: id, slot: 1, token });
        expect(a.last('back')).toEqual({ type: 'back', slot: 1 });
        // A bad token is turned away
        expect(() => arena.message(fakeSocket(), { type: 'rejoin_arena', arena: id, token: 'nope' })).toThrow('gone');
    });

    test('a seat held too long is freed, and an empty arena shuts', () => {
        const a = enter('A');
        const b = enter('B');
        const { arena: id, token } = b.last('arena');
        arena.disconnect(b);
        clock += HOLD_MS + 1;
        arena.tick();
        expect(a.last('left')).toEqual({ type: 'left', slot: 1 });
        expect(() => arena.message(fakeSocket(), { type: 'rejoin_arena', arena: id, token })).toThrow('gone');
        arena.leave(a);
        expect(arena.size()).toBe(0);
    });

    test('a player can change ship, and the clock can be asked', () => {
        const a = enter('A');
        const b = enter('B');
        arena.message(b, { type: 'pick', hero: 'trek' });
        expect(a.last('picked')).toEqual({ type: 'picked', slot: 1, hero: 'trek' });
        arena.message(b, { type: 'pick', hero: 'NOT OK!' });
        expect(a.last('picked').hero).toBe('trek');
        clock = 5555;
        const stranger = fakeSocket();
        arena.message(stranger, { type: 'ping', t: 12 });
        expect(stranger.last('pong')).toEqual({ type: 'pong', t: 12, now: 5555 });
    });

    test('names are cleaned', () => {
        const a = enter('<b>Zap!</b> the Destroyer of Worlds');
        expect(a.last('arena').players[0].name).toBe('bZapb the De');
    });
});
