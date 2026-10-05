import { AWAY_MS, BROADCAST, createRoomManager } from '../eightBitEvilV2/rooms.js';
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
        last() {
            return this.texts[this.texts.length - 1];
        },
    };
}

describe('8 Bit Evil V2 co-op rooms', () => {
    let clock;
    let rooms;
    beforeEach(() => {
        clock = 0;
        rooms = createRoomManager({ now: () => clock });
    });

    test('guests may open the socket', () => {
        expect(isPublicRoute('GET', '/8bitevilreturns/v2/ws')).toBe(true);
    });

    test('create gives a code; joiners take the next seats up to four', () => {
        const host = fakeSocket();
        const code = rooms.create(host, { name: 'Sam', hero: 'matt' });
        expect(code).toMatch(/^[A-Z0-9]{4}$/);
        expect(host.last()).toMatchObject({ type: 'room', code, slot: 0, host: true });
        const guests = [fakeSocket(), fakeSocket(), fakeSocket()];
        guests.forEach((g, i) => rooms.join(g, { code: code.toLowerCase(), name: `P${i}`, hero: 'jon' }));
        expect(guests.map((g) => g.last().slot)).toEqual([1, 2, 3]);
        expect(host.last().players).toHaveLength(4);
        expect(() => rooms.join(fakeSocket(), { code })).toThrow('full');
        expect(() => rooms.join(fakeSocket(), { code: 'ZZZZ' })).toThrow('missing');
    });

    test('rooms are code-only unless the leader makes them public', () => {
        expect(isPublicRoute('GET', '/8bitevilreturns/v2/rooms')).toBe(true);
        const host = fakeSocket();
        const code = rooms.create(host, { name: 'Sam' });
        expect(host.last().public).toBe(false);
        expect(rooms.listPublic()).toEqual([]);
        const guest = fakeSocket();
        rooms.join(guest, { code });
        rooms.pick(guest, { public: true });  // only the leader can
        expect(rooms.listPublic()).toEqual([]);
        rooms.pick(host, { public: true });
        expect(guest.last().public).toBe(true);
        expect(rooms.listPublic()).toEqual([{ code, leader: 'Sam', players: 2, max: 4, stage: 'graveyard' }]);
        rooms.pick(host, { public: false });
        expect(rooms.listPublic()).toEqual([]);
    });

    test('the public list leaves out full, started and leaderless rooms', () => {
        const a = fakeSocket();
        const open = rooms.create(a, { name: 'Open', public: true });
        const b = fakeSocket();
        const full = rooms.create(b, { name: 'Full', public: true });
        for (let i = 0; i < 3; i += 1) rooms.join(fakeSocket(), { code: full });
        const c = fakeSocket();
        const going = rooms.create(c, { name: 'Going', public: true });
        rooms.join(fakeSocket(), { code: going });
        rooms.start(c);
        const d = fakeSocket();
        rooms.create(d, { name: 'Gone', public: true });
        rooms.disconnect(d);
        expect(rooms.listPublic().map((r) => r.code)).toEqual([open]);
    });

    test('the leader picks Nightmare; everyone is told, and the start says so', () => {
        const host = fakeSocket();
        const guest = fakeSocket();
        const code = rooms.create(host, {});
        rooms.join(guest, { code });
        expect(guest.last().nightmare).toBe(false);
        rooms.pick(guest, { nightmare: true });  // only the leader can
        expect(host.last().nightmare).toBe(false);
        rooms.pick(host, { nightmare: true });
        expect(guest.last().nightmare).toBe(true);
        rooms.start(host);
        expect(guest.texts.find((m) => m.type === 'start')).toMatchObject({ nightmare: true });
    });

    test('names and ids are cleaned', () => {
        const host = fakeSocket();
        rooms.create(host, { name: '<b>Sam</b>!!', hero: 'Robert"); DROP' });
        expect(host.last().players[0]).toEqual({ slot: 0, name: 'bSamb', hero: 'joe', away: false });
    });

    test('lobby picks: anyone changes hero, only the host changes stage', () => {
        const host = fakeSocket();
        const guest = fakeSocket();
        const code = rooms.create(host, {});
        rooms.join(guest, { code });
        rooms.pick(guest, { hero: 'alex', stage: 'crimson_crypt' });
        expect(host.last().players[1].hero).toBe('alex');
        expect(host.last().stage).toBe('graveyard');
        rooms.pick(host, { stage: 'crimson_crypt' });
        expect(guest.last().stage).toBe('crimson_crypt');
    });

    test('only the host starts, and nobody joins after', () => {
        const host = fakeSocket();
        const guest = fakeSocket();
        const code = rooms.create(host, {});
        rooms.join(guest, { code });
        expect(() => rooms.start(guest)).toThrow('notHost');
        rooms.start(host);
        expect(guest.texts.find((m) => m.type === 'start')).toMatchObject({ stage: 'graveyard', host: 0 });
        expect(() => rooms.join(fakeSocket(), { code })).toThrow('started');
    });

    test('relay: host to one seat or everyone; guests only reach the host', () => {
        const host = fakeSocket();
        const a = fakeSocket();
        const b = fakeSocket();
        const code = rooms.create(host, {});
        rooms.join(a, { code });
        rooms.join(b, { code });
        expect(rooms.relay(host, Buffer.from([BROADCAST, 9]))).toBe(false); // not started yet
        rooms.start(host);
        rooms.relay(host, Buffer.from([2, 7]));
        expect(a.packets).toHaveLength(0);
        expect(b.packets[0]).toEqual(Buffer.from([0, 7]));
        rooms.relay(host, Buffer.from([BROADCAST, 8]));
        expect(a.packets[0]).toEqual(Buffer.from([0, 8]));
        // A guest can't spoof the host or reach another guest.
        rooms.relay(a, Buffer.from([2, 5]));
        expect(host.packets[0]).toEqual(Buffer.from([1, 5]));
        expect(b.packets).toHaveLength(2);
    });

    test('guests are rate limited per second', () => {
        const host = fakeSocket();
        const guest = fakeSocket();
        const code = rooms.create(host, {});
        rooms.join(guest, { code });
        rooms.start(host);
        let sent = 0;
        for (let i = 0; i < 200; i += 1) sent += rooms.relay(guest, Buffer.from([0, 1])) ? 1 : 0;
        expect(sent).toBe(120);
        clock += 1000;
        expect(rooms.relay(guest, Buffer.from([0, 1]))).toBe(true);
    });

    test('a guest leaving frees the seat; the host leaving closes the room', () => {
        const host = fakeSocket();
        const a = fakeSocket();
        const b = fakeSocket();
        const code = rooms.create(host, {});
        rooms.join(a, { code });
        rooms.leave(a);
        expect(host.texts.some((m) => m.type === 'left' && m.slot === 1)).toBe(true);
        rooms.join(b, { code });
        expect(b.last().slot).toBe(1);
        rooms.leave(host);
        expect(b.last()).toEqual({ type: 'closed', reason: 'host' });
        expect(rooms.size()).toBe(0);
    });

    test('a dropped guest keeps their seat and takes it back with their token', () => {
        const host = fakeSocket();
        const guest = fakeSocket();
        const code = rooms.create(host, {});
        rooms.join(guest, { code, hero: 'alex' });
        const token = guest.last().token;
        expect(token).toMatch(/^[0-9a-f]{24}$/);
        // Tokens are only ever sent to their owner.
        expect(JSON.stringify(host.texts)).not.toContain(token);
        rooms.start(host);
        rooms.disconnect(guest);
        expect(host.texts.some((m) => m.type === 'away' && m.slot === 1)).toBe(true);
        expect(host.last().players[1]).toMatchObject({ slot: 1, hero: 'alex', away: true });
        // While they're away the seat stays theirs and packets to them are dropped.
        expect(() => rooms.join(fakeSocket(), { code })).toThrow('started');
        expect(rooms.relay(host, Buffer.from([1, 3]))).toBe(true);
        const back = fakeSocket();
        expect(() => rooms.rejoin(back, { code, token: 'nope' })).toThrow('gone');
        rooms.rejoin(back, { code, token });
        expect(back.last()).toMatchObject({ type: 'room', slot: 1, started: true, token });
        expect(host.texts.some((m) => m.type === 'back' && m.slot === 1)).toBe(true);
        rooms.relay(host, Buffer.from([1, 4]));
        expect(back.packets[0]).toEqual(Buffer.from([0, 4]));
    });

    test('a seat held too long is freed', () => {
        const host = fakeSocket();
        const guest = fakeSocket();
        const code = rooms.create(host, {});
        rooms.join(guest, { code });
        const token = guest.last().token;
        rooms.start(host);
        rooms.disconnect(guest);
        clock += AWAY_MS.game - 1;
        rooms.sweep();
        expect(rooms.room(code).players[1]).toBeTruthy();
        clock += 2;
        rooms.sweep();
        expect(host.texts.some((m) => m.type === 'left' && m.slot === 1)).toBe(true);
        expect(() => rooms.rejoin(fakeSocket(), { code, token })).toThrow('gone');
    });

    test('the room waits for a dropped host, then closes if they never return', () => {
        const host = fakeSocket();
        const guest = fakeSocket();
        const code = rooms.create(host, {});
        const hostToken = host.last().token;
        rooms.join(guest, { code });
        rooms.start(host);
        rooms.disconnect(host);
        expect(guest.texts.some((m) => m.type === 'away' && m.slot === 0)).toBe(true);
        const host2 = fakeSocket();
        rooms.rejoin(host2, { code, token: hostToken });
        expect(host2.last()).toMatchObject({ slot: 0, host: true });
        rooms.disconnect(host2);
        clock += AWAY_MS.game + 1;
        rooms.sweep();
        expect(guest.last()).toEqual({ type: 'closed', reason: 'host' });
        expect(rooms.size()).toBe(0);
    });

    test('a newer connection replaces a stale one for the same seat', () => {
        const host = fakeSocket();
        const guest = fakeSocket();
        const code = rooms.create(host, {});
        rooms.join(guest, { code });
        const token = guest.last().token;
        const second = fakeSocket();
        rooms.rejoin(second, { code, token });
        expect(guest.last()).toEqual({ type: 'closed', reason: 'replaced' });
        expect(second.last().slot).toBe(1);
    });

    test('idle rooms are swept', () => {
        rooms.create(fakeSocket(), {});
        clock += 31 * 60_000;
        rooms.sweep();
        expect(rooms.size()).toBe(0);
    });
});
