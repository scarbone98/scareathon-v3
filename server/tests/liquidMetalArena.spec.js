import { DROPS, FILL_TO, K_STATE, MAX_HUMANS, MODES, OVER_MS, PIT_RADIUS, RADIUS, ROUND_MS, SAFE_MS, START_MASS, STATE_BYTES, createArenaManager } from '../liquidMetal/arena.js';
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
            return this.texts.filter((m) => m.t === type);
        },
        last(type) {
            return this.of(type).pop();
        },
    };
}

// One runner's state: where it is, on the floor
function state(id, x, z) {
    const out = Buffer.alloc(1 + STATE_BYTES);
    out[0] = K_STATE;
    out[1] = id;
    out.writeInt16LE(Math.round(x * 100), 3);
    out.writeInt16LE(Math.round(z * 100), 7);
    return out;
}

describe('Liquid Metal arena', () => {
    let clock;
    let arena;
    const enter = (name) => {
        const socket = fakeSocket();
        arena.message(socket, { t: 'join', name });
        return socket;
    };
    beforeEach(() => {
        clock = 1000;
        arena = createArenaManager({ now: () => clock, firstMode: 'blocks' });
    });

    test('guests may open the socket', () => {
        expect(isPublicRoute('GET', '/liquid-metal/ws')).toBe(true);
        expect(isPublicRoute('POST', '/liquid-metal/ws')).toBe(false);
    });

    test('the first player gets a laid-out room and bots to run', () => {
        const sam = enter('Sam');
        const welcome = sam.last('welcome');
        expect(welcome.you).toBe(1);
        expect(welcome.drops).toHaveLength(DROPS);
        expect(welcome.blocks.length).toBeGreaterThan(10);
        expect(welcome).toMatchObject({ mode: 'blocks', radius: RADIUS, pit: 0, movers: [], at: 0 });
        // (everything's inside the round wall)
        expect(welcome.drops.every((d) => Math.hypot(d[1], d[2]) <= RADIUS - 3 + 0.01)).toBe(true);
        expect(welcome.ends).toBe(ROUND_MS);
        expect(sam.of('ent')).toHaveLength(FILL_TO - 1);
        expect(sam.last('bots').ids).toHaveLength(FILL_TO - 1);
    });

    test('players drop into the same room; a bot makes way for each', () => {
        const sam = enter('Sam');
        const ann = enter('Ann');
        expect(arena.size()).toBe(1);
        expect(sam.last('ent')).toMatchObject({ name: 'Ann', bot: false, mass: START_MASS });
        expect(ann.last('welcome').ents.filter((e) => !e.bot).map((e) => e.name)).toEqual(['Sam', 'Ann']);
        expect(sam.last('bots').ids).toHaveLength(FILL_TO - 2);
        expect(ann.of('bots')).toHaveLength(0);
        const [room] = arena.rooms();
        expect(room.ents.size).toBe(FILL_TO);
    });

    test('a full room opens a second one', () => {
        for (let i = 0; i < MAX_HUMANS; i += 1) enter(`P${i}`);
        expect(arena.size()).toBe(1);
        enter('Late');
        expect(arena.size()).toBe(2);
    });

    test('the first claim on a drop wins it', () => {
        const sam = enter('Sam');
        const ann = enter('Ann');
        const [drop] = sam.last('welcome').drops;
        arena.message(sam, { t: 'take', e: 1, d: drop[0] });
        arena.message(ann, { t: 'take', e: ann.last('welcome').you, d: drop[0] });
        expect(ann.of('took')).toEqual([{ t: 'took', e: 1, d: drop[0], m: START_MASS + 1 }]);
        // (nor can a player take one for somebody else's runner)
        const [, other] = sam.last('welcome').drops;
        arena.message(ann, { t: 'take', e: 1, d: other[0] });
        expect(ann.of('took')).toHaveLength(1);
    });

    test('a hit bursts the other runner: mass to the hitter, drops on the floor, then back in', () => {
        const sam = enter('Sam');
        const ann = enter('Ann');
        const annId = ann.last('welcome').you;
        arena.message(sam, { t: 'hit', a: 1, v: annId });
        expect(sam.of('kill')).toHaveLength(0); // just spawned: safe
        clock += SAFE_MS + 1;
        arena.relay(sam, state(1, 5, 5));
        arena.relay(ann, state(annId, 50, 50));
        arena.message(sam, { t: 'hit', a: 1, v: annId });
        expect(sam.of('kill')).toHaveLength(0); // nowhere near each other
        arena.relay(ann, state(annId, 6, 5));
        expect(sam.packets).toHaveLength(2);
        arena.message(sam, { t: 'hit', a: 1, v: annId });
        const kill = ann.last('kill');
        expect(kill).toMatchObject({ a: 1, v: annId, how: 'dash', lost: START_MASS, am: START_MASS + 5 + 2 });
        expect(kill.drops.reduce((sum, d) => sum + d[3], 0)).toBe(6);
        arena.message(ann, { t: 'hit', a: annId, v: 1 });
        expect(sam.of('kill')).toHaveLength(1); // the dead don't hit
        arena.message(ann, { t: 'spawn', e: annId });
        expect(sam.of('alive')).toHaveLength(0); // not yet
        clock += 2000;
        arena.message(ann, { t: 'spawn', e: annId });
        expect(sam.last('alive')).toEqual({ t: 'alive', e: annId, m: START_MASS });
    });

    test('running into a wall spills your mass', () => {
        const sam = enter('Sam');
        arena.message(sam, { t: 'died', e: 1 });
        expect(sam.last('kill')).toMatchObject({ a: 0, v: 1, how: 'wall' });
    });

    test('only the host speaks for the bots, and states for runners you do not own are dropped', () => {
        const sam = enter('Sam');
        const ann = enter('Ann');
        const [bot] = sam.last('bots').ids;
        expect(arena.relay(ann, state(bot, 1, 1))).toBe(false);
        expect(arena.relay(sam, state(bot, 1, 1))).toBe(true);
        expect(ann.packets).toHaveLength(1);
        arena.message(ann, { t: 'died', e: bot });
        expect(sam.of('kill')).toHaveLength(0);
    });

    test('the host leaving hands the bots on; the last player leaving closes the room', () => {
        const sam = enter('Sam');
        const ann = enter('Ann');
        arena.disconnect(sam);
        expect(ann.last('gone')).toEqual({ t: 'gone', id: 1 });
        expect(ann.last('bots').ids).toHaveLength(FILL_TO - 1);
        const [bot] = ann.last('bots').ids;
        expect(arena.relay(ann, state(bot, 1, 1))).toBe(true);
        arena.disconnect(ann);
        expect(arena.size()).toBe(0);
    });

    test('the round ends on the clock with the standings, then a fresh one starts', () => {
        const sam = enter('Sam');
        const [drop] = sam.last('welcome').drops;
        arena.message(sam, { t: 'take', e: 1, d: drop[0] });
        arena.tick();
        expect(sam.last('drops').list).toHaveLength(1); // topped back up
        clock += ROUND_MS;
        arena.tick();
        expect(sam.last('over').top[0]).toMatchObject({ name: 'Sam', mass: START_MASS + 1 });
        arena.message(sam, { t: 'take', e: 1, d: sam.last('drops').list[0][0] });
        expect(sam.of('took')).toHaveLength(1); // nothing counts between rounds
        clock += OVER_MS;
        arena.tick();
        const round = sam.last('round');
        expect(round.drops.length).toBeGreaterThanOrEqual(DROPS);
        expect(round.ents.every((e) => e.mass === START_MASS && e.alive)).toBe(true);
        expect(MODES).toContain(round.mode);
        expect(round.mode).not.toBe('blocks'); // laid out another way each round
    });

    test('each mode lays the arena out its own way', () => {
        const laid = {};
        for (const mode of MODES) {
            const room = createArenaManager({ now: () => clock, firstMode: mode });
            const socket = fakeSocket();
            room.message(socket, { t: 'join', name: 'Sam' });
            laid[mode] = socket.last('welcome');
        }
        expect(laid.open.blocks).toHaveLength(0);
        expect(laid.blocks.blocks).toHaveLength(26);
        expect(laid.movers.movers).toHaveLength(9);
        expect(laid.movers.movers.every((m) => m.length === 10 && m[8] >= 5)).toBe(true);
        expect(laid.pit.pit).toBe(PIT_RADIUS);
        // Nothing lies in the pit, and fat drops ring its lip
        expect(laid.pit.drops.every((d) => Math.hypot(d[1], d[2]) > PIT_RADIUS + 2)).toBe(true);
        expect(laid.pit.drops.filter((d) => d[3] === 3)).toHaveLength(12);
        expect(laid.pit.blocks.every((b) => Math.hypot(b[0], b[1]) > PIT_RADIUS + 3)).toBe(true);
    });

    test('falling in the pit spills your mass on its lip', () => {
        const pit = createArenaManager({ now: () => clock, firstMode: 'pit' });
        const sam = fakeSocket();
        pit.message(sam, { t: 'join', name: 'Sam' });
        pit.relay(sam, state(1, 2, 1));
        pit.message(sam, { t: 'died', e: 1, how: 'pit' });
        const kill = sam.last('kill');
        expect(kill.how).toBe('pit');
        expect(kill.drops.every((d) => Math.hypot(d[1], d[2]) > PIT_RADIUS + 2)).toBe(true);
    });
});
