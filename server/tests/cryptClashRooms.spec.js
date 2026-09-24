import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cryptClashRoutes from '../routes/cryptClash.js';
import { COUNTDOWN_MS, HASH_EVERY, RoomError, cleanName, createRoomManager } from '../cryptClash/rooms.js';
import { CARDS, TICK_RATE, createMatch, hashState, stepMatch } from '../shared/royale/index.js';

const deckA = CARDS.slice(0, 8).map((c) => c.id);
const deckB = CARDS.slice(7, 15).map((c) => c.id);
const TICK_MS = 1000 / TICK_RATE;

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
    };
}

function setup() {
    let time = 1_000_000;
    const rooms = createRoomManager({ now: () => time });
    const host = fakeSocket();
    const guest = fakeSocket();
    return {
        rooms,
        host,
        guest,
        advance(ms) {
            time += ms;
            rooms.tick();
        },
        startMatch() {
            const room = rooms.create(host, { name: 'Host', deck: deckA });
            rooms.join(guest, { code: room.code, name: 'Guest', deck: deckB });
            return room;
        },
    };
}

describe('crypt clash rooms', () => {
    test('names are trimmed and cleaned', () => {
        expect(cleanName('  Terry <script>  ')).toBe('Terry script');
        expect(cleanName('')).toBe('Guest');
        expect(cleanName('x'.repeat(40))).toHaveLength(20);
    });

    test('creating a room returns a code and token, and peek shows the host', () => {
        const { rooms, host } = setup();
        const room = rooms.create(host, { name: 'Host', deck: deckA });
        const [info] = host.of('room');
        expect(info).toMatchObject({ code: room.code, team: 0, status: 'waiting' });
        expect(info.token).toMatch(/^[0-9a-f]{32}$/);
        expect(rooms.peek(room.code)).toMatchObject({ status: 'waiting', host: 'Host' });
        expect(rooms.peek('nope')).toMatchObject({ status: 'missing' });
    });

    test('joining starts the match for both players with the same seed', () => {
        const { rooms, host, guest, startMatch } = setup();
        const room = startMatch();
        const [a] = host.of('start');
        const [b] = guest.of('start');
        expect(a.team).toBe(0);
        expect(b.team).toBe(1);
        expect(a.seed).toBe(b.seed);
        expect(a.decks).toEqual([deckA, deckB]);
        expect(a.names).toEqual(['Host', 'Guest']);
        expect(a.startsInMs).toBe(COUNTDOWN_MS);
        expect(() => rooms.join(fakeSocket(), { code: room.code, name: 'Late', deck: deckA })).toThrow(RoomError);
    });

    test('bad decks and unknown rooms are refused', () => {
        const { rooms } = setup();
        expect(() => rooms.create(fakeSocket(), { name: 'x', deck: ['rat'] })).toThrow('bad_deck');
        expect(() => rooms.join(fakeSocket(), { code: 'zzzzzz', name: 'x', deck: deckA })).toThrow('missing');
    });

    test('ticks arrive in order and replaying them matches the server hash', () => {
        const { rooms, host, guest, advance, startMatch } = setup();
        startMatch();
        advance(COUNTDOWN_MS - 1);
        expect(host.of('tick')).toHaveLength(0);
        advance(1 + TICK_MS * 5);
        // The guest claims to be team 0; the server plays it as team 1.
        const card = rooms.room(host.of('room')[0].code).state.players[1].hand[0];
        rooms.play(guest, { type: 'play', team: 0, card, x: 0, z: -6 });
        advance(TICK_MS * (HASH_EVERY * 2));

        const ticks = host.of('tick');
        expect(ticks.map((t) => t.n)).toEqual(ticks.map((_, i) => i));
        expect(guest.of('tick')).toEqual(ticks);
        const withPlay = ticks.find((t) => t.plays.length);
        expect(withPlay.plays[0]).toMatchObject({ team: 1, card });

        const [start] = host.of('start');
        const replay = createMatch({ seed: start.seed, decks: start.decks });
        const hashed = ticks.filter((t) => t.hash !== undefined);
        expect(hashed.length).toBeGreaterThan(0);
        for (const bundle of ticks) {
            stepMatch(replay, bundle.plays);
            if (bundle.hash !== undefined) expect(hashState(replay)).toBe(bundle.hash);
        }
    });

    test('plays are rate limited', () => {
        const { rooms, guest, advance, startMatch } = setup();
        const room = startMatch();
        advance(COUNTDOWN_MS);
        for (let i = 0; i < 20; i++) rooms.play(guest, { type: 'play', card: 'rat', x: 0, z: -6 });
        expect(room.pending).toHaveLength(6);
        rooms.play(guest, { type: 'play', card: 'rat', x: 'left', z: -6 });
        expect(room.pending).toHaveLength(6);
    });

    test('a reconnecting player gets the full state with their token', () => {
        const { rooms, host, advance, startMatch } = setup();
        const room = startMatch();
        advance(COUNTDOWN_MS + TICK_MS * 10);
        rooms.disconnect(host);
        const again = fakeSocket();
        expect(() => rooms.rejoin(again, { code: room.code, token: 'wrong' })).toThrow('missing');
        rooms.rejoin(again, { code: room.code, token: host.of('room')[0].token });
        expect(again.of('start')[0].team).toBe(0);
        const [sync] = again.of('sync');
        expect(sync.state.tick).toBe(room.state.tick);
        expect(again.of('presence').at(-1).connected).toEqual([true, true]);
    });

    test('the match ends for both players and a rematch needs both', () => {
        const { rooms, host, guest, advance, startMatch } = setup();
        const room = startMatch();
        advance(COUNTDOWN_MS + TICK_MS);
        room.state.towers.find((t) => t.team === 1 && t.tower === 'king').hp = 0;
        advance(TICK_MS);
        expect(host.of('end')[0].result).toMatchObject({ winner: 0, reason: 'king' });
        expect(guest.of('end')).toHaveLength(1);
        rooms.rematch(host);
        expect(host.of('start')).toHaveLength(1);
        expect(guest.of('rematch').at(-1).ready).toEqual([true, false]);
        rooms.rematch(guest);
        expect(host.of('start')).toHaveLength(2);
        expect(room.status).toBe('playing');
    });

    test('an unanswered challenge expires', () => {
        const { rooms, host, advance } = setup();
        const room = rooms.create(host, { name: 'Host', deck: deckA });
        advance(16 * 60_000);
        expect(rooms.room(room.code)).toBeNull();
    });
});

describe('crypt clash socket route', () => {
    test('two sockets can create and join a match', async () => {
        const app = Fastify();
        // Registered at the root like index.js, so the route reuses it.
        await app.register(websocket);
        await app.register(cryptClashRoutes, { prefix: '/crypt-clash' });
        await app.ready();
        try {
            const received = (socket) => {
                const messages = [];
                socket.on('message', (data) => messages.push(JSON.parse(data.toString())));
                return messages;
            };
            const waitFor = async (messages, type) => {
                for (let i = 0; i < 100 && !messages.some((m) => m.type === type); i++) await new Promise((r) => setTimeout(r, 10));
                return messages.find((m) => m.type === type);
            };
            const host = await app.injectWS('/crypt-clash/ws');
            const hostMessages = received(host);
            host.send(JSON.stringify({ type: 'create', name: 'Host', deck: deckA }));
            const room = await waitFor(hostMessages, 'room');
            expect(room.code).toHaveLength(6);

            const guest = await app.injectWS('/crypt-clash/ws');
            const guestMessages = received(guest);
            guest.send(JSON.stringify({ type: 'join', code: room.code, name: 'Guest', deck: deckB }));
            expect((await waitFor(guestMessages, 'start')).team).toBe(1);
            expect((await waitFor(hostMessages, 'start')).team).toBe(0);

            const stranger = await app.injectWS('/crypt-clash/ws');
            const strangerMessages = received(stranger);
            stranger.send(JSON.stringify({ type: 'join', code: room.code, name: 'Late', deck: deckA }));
            expect((await waitFor(strangerMessages, 'error')).code).toBe('full');

            host.terminate();
            guest.terminate();
            stranger.terminate();
        } finally {
            await app.close();
        }
    });
});
