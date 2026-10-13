import { AWAY_MS, BROADCAST, HOST_GRACE_MS, MAX_PLAYERS, createRoomManager } from '../penguins/rooms.js';
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
        last(type = 'room') {
            return this.texts.filter((m) => m.type === type).pop();
        },
    };
}

describe('Penguin Slide race rooms', () => {
    let clock;
    let rooms;
    beforeEach(() => {
        clock = 0;
        rooms = createRoomManager({ now: () => clock });
    });

    test('guests may open the socket', () => {
        expect(isPublicRoute('GET', '/penguins/ws')).toBe(true);
        expect(isPublicRoute('POST', '/penguins/ws')).toBe(false);
    });

    test('create gives a code; joiners take the next seats up to eight', () => {
        const host = fakeSocket();
        const code = rooms.create(host, { name: 'Sam', skin: 'teal' });
        expect(code).toMatch(/^[A-Z0-9]{4}$/);
        expect(host.last()).toMatchObject({ type: 'room', code, slot: 0, host: true, racing: false, course: 'bunny' });
        const guests = Array.from({ length: MAX_PLAYERS - 1 }, fakeSocket);
        guests.forEach((g, i) => rooms.join(g, { code: code.toLowerCase(), name: `P${i}` }));
        expect(guests.map((g) => g.last().slot)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(guests[0].last().host).toBe(false);
        expect(host.last().players).toHaveLength(MAX_PLAYERS);
        expect(host.last().players[0]).toEqual({ slot: 0, name: 'Sam', skin: 'teal', away: false });
        expect(() => rooms.join(fakeSocket(), { code })).toThrow('full');
        expect(() => rooms.join(fakeSocket(), { code: 'ZZZZ' })).toThrow('missing');
    });

    test('names and ids are cleaned', () => {
        const host = fakeSocket();
        rooms.create(host, { name: '<b>Wad</b>dles the Magnificent', skin: 'DROP TABLE', course: '../etc' });
        expect(host.last().players[0]).toMatchObject({ name: 'bWadbdles th', skin: 'classic' });
        expect(host.last().course).toBe('bunny');
    });

    test('a room can be joined while a race is on, and again after it', () => {
        const host = fakeSocket();
        const code = rooms.create(host, {});
        rooms.set(host, { racing: true });
        const late = fakeSocket();
        rooms.join(late, { code });
        expect(late.last()).toMatchObject({ slot: 1, racing: true });
        rooms.set(late, { racing: false });  // only the host says
        expect(host.last().racing).toBe(true);
        rooms.set(host, { racing: false });
        expect(late.last().racing).toBe(false);
    });

    test('players set their own name and colour; the host sets the course and who can find the room', () => {
        const host = fakeSocket();
        const code = rooms.create(host, { name: 'Sam' });
        const guest = fakeSocket();
        rooms.join(guest, { code, name: 'Pip' });
        rooms.set(guest, { skin: 'pink', course: 'summit', public: true });
        expect(host.last().players[1]).toMatchObject({ name: 'Pip', skin: 'pink' });
        expect(host.last()).toMatchObject({ course: 'bunny', public: false });
        rooms.set(host, { course: 'summit', public: true });
        expect(guest.last()).toMatchObject({ course: 'summit', public: true });
    });

    test('the public list leaves out private, full and hostless rooms, lobbies first', () => {
        const a = fakeSocket();
        const racing = rooms.create(a, { name: 'Racing', public: true });
        rooms.join(fakeSocket(), { code: racing });
        rooms.join(fakeSocket(), { code: racing });
        rooms.set(a, { racing: true });
        const b = fakeSocket();
        const waiting = rooms.create(b, { name: 'Waiting', public: true, course: 'glacier' });
        rooms.create(fakeSocket(), { name: 'Private' });
        const c = fakeSocket();
        const full = rooms.create(c, { name: 'Full', public: true });
        for (let i = 1; i < MAX_PLAYERS; i += 1) rooms.join(fakeSocket(), { code: full });
        const d = fakeSocket();
        rooms.create(d, { name: 'Dropped', public: true });
        rooms.disconnect(d);
        expect(rooms.listPublic()).toEqual([
            { code: waiting, host: 'Waiting', players: 1, max: MAX_PLAYERS, course: 'glacier', racing: false },
            { code: racing, host: 'Racing', players: 3, max: MAX_PLAYERS, course: 'bunny', racing: true },
        ]);
    });

    test('quick play joins a public room, or opens one', () => {
        const first = fakeSocket();
        const code = rooms.quick(first, { name: 'One' });
        expect(first.last()).toMatchObject({ code, slot: 0, host: true, public: true });
        const second = fakeSocket();
        expect(rooms.quick(second, { name: 'Two' })).toBe(code);
        expect(second.last()).toMatchObject({ code, slot: 1, host: false });
        expect(rooms.size()).toBe(1);
    });

    test('packets go to everyone else, stamped with the sender, in the lobby too', () => {
        const [a, b, c] = [fakeSocket(), fakeSocket(), fakeSocket()];
        const code = rooms.create(a, {});
        rooms.join(b, { code });
        rooms.join(c, { code });
        expect(rooms.relay(b, Buffer.from([BROADCAST, 83, 1, 2]))).toBe(true);
        expect(a.packets).toEqual([Buffer.from([1, 83, 1, 2])]);
        expect(c.packets).toEqual([Buffer.from([1, 83, 1, 2])]);
        expect(b.packets).toEqual([]);
        rooms.relay(a, Buffer.from([2, 74, 9]));  // to seat 2 only
        expect(c.packets).toHaveLength(2);
        expect(c.packets[1]).toEqual(Buffer.from([0, 74, 9]));
        expect(b.packets).toEqual([]);
        expect(rooms.relay(fakeSocket(), Buffer.from([BROADCAST, 83]))).toBe(false);  // not in a room
        expect(rooms.relay(a, Buffer.from([BROADCAST]))).toBe(false);  // too short
    });

    test('a flood of packets is dropped until the next second', () => {
        const [a, b] = [fakeSocket(), fakeSocket()];
        const code = rooms.create(a, {});
        rooms.join(b, { code });
        let passed = 0;
        for (let i = 0; i < 400; i += 1) if (rooms.relay(a, Buffer.from([BROADCAST, 83]))) passed += 1;
        expect(passed).toBe(240);
        clock += 1000;
        expect(rooms.relay(a, Buffer.from([BROADCAST, 83]))).toBe(true);
    });

    test('a dropped player keeps their seat and can take it back', () => {
        const [a, b] = [fakeSocket(), fakeSocket()];
        const code = rooms.create(a, {});
        rooms.join(b, { code, name: 'Pip' });
        const { token } = b.last();
        rooms.disconnect(b);
        expect(a.last('away')).toEqual({ type: 'away', slot: 1 });
        expect(a.last().players[1]).toMatchObject({ slot: 1, away: true });
        const again = fakeSocket();
        expect(() => rooms.rejoin(again, { code, token: 'nope' })).toThrow('gone');
        rooms.rejoin(again, { code, token });
        expect(again.last()).toMatchObject({ slot: 1, host: false });
        expect(a.last('back')).toEqual({ type: 'back', slot: 1 });
        expect(a.last().players[1].away).toBe(false);
    });

    test('a seat left empty too long is freed: sooner in the lobby than in a race', () => {
        const [a, b] = [fakeSocket(), fakeSocket()];
        const code = rooms.create(a, {});
        rooms.join(b, { code });
        rooms.set(a, { racing: true });
        rooms.disconnect(b);
        clock += AWAY_MS.lobby + 1;
        rooms.sweep();
        expect(a.last().players).toHaveLength(2);
        clock += AWAY_MS.race;
        rooms.sweep();
        expect(a.last().players).toHaveLength(1);
        expect(a.last('left')).toEqual({ type: 'left', slot: 1 });
    });

    test('when the host leaves, the next player hosts and the room goes on', () => {
        const [a, b, c] = [fakeSocket(), fakeSocket(), fakeSocket()];
        const code = rooms.create(a, {});
        rooms.join(b, { code });
        rooms.join(c, { code });
        rooms.set(a, { racing: true });
        rooms.leave(a);
        expect(b.last()).toMatchObject({ host: true, host_slot: 1, racing: true });
        expect(c.last()).toMatchObject({ host: false, host_slot: 1 });
        expect(b.last().players.map((p) => p.slot)).toEqual([1, 2]);
        rooms.set(b, { racing: false });
        expect(c.last().racing).toBe(false);
        const late = fakeSocket();
        rooms.join(late, { code });
        expect(late.last().slot).toBe(0);  // the old host's seat is free again
    });

    test('a host who drops is waited for a moment, then replaced; they come back as a guest', () => {
        const [a, b] = [fakeSocket(), fakeSocket()];
        const code = rooms.create(a, {});
        rooms.join(b, { code });
        const { token } = a.last();
        rooms.disconnect(a);
        clock += HOST_GRACE_MS - 1;
        rooms.sweep();
        expect(b.last().host).toBe(false);
        clock += 2;
        rooms.sweep();
        expect(b.last()).toMatchObject({ host: true, host_slot: 1 });
        const again = fakeSocket();
        rooms.rejoin(again, { code, token });
        expect(again.last()).toMatchObject({ slot: 0, host: false, host_slot: 1 });
    });

    test('a room closes when its last player has gone', () => {
        const [a, b] = [fakeSocket(), fakeSocket()];
        const code = rooms.create(a, {});
        rooms.join(b, { code });
        rooms.leave(a);
        expect(rooms.size()).toBe(1);
        rooms.disconnect(b);
        expect(rooms.size()).toBe(1);  // held for b
        clock += AWAY_MS.lobby + 1;
        rooms.sweep();
        expect(rooms.size()).toBe(0);
        expect(() => rooms.join(fakeSocket(), { code })).toThrow('missing');
    });

    test('a player alone in a room who drops and returns is still its host', () => {
        const a = fakeSocket();
        const code = rooms.create(a, {});
        const { token } = a.last();
        rooms.disconnect(a);
        clock += HOST_GRACE_MS + 1;
        rooms.sweep();
        const again = fakeSocket();
        rooms.rejoin(again, { code, token });
        expect(again.last()).toMatchObject({ slot: 0, host: true });
    });

    test('making or joining another room leaves the first', () => {
        const [a, b] = [fakeSocket(), fakeSocket()];
        const first = rooms.create(a, {});
        rooms.join(b, { code: first });
        const second = rooms.create(a, {});
        expect(second).not.toBe(first);
        expect(b.last()).toMatchObject({ code: first, host: true });
        expect(rooms.size()).toBe(2);
    });
});
