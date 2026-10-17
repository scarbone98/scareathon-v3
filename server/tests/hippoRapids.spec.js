import { COUNTDOWN, FINISH_Z, STEP, createSim, getCourse, seatRadius } from '../shared/hippoRapids/index.js';
import { RECONNECT_MS, RoomError, createRoomManager } from '../hippoRapids/rooms.js';

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

function runFor(sim, seconds) {
    for (let i = 0; i < seconds / STEP; i++) sim.step(STEP);
}

describe('hippo rapids sim', () => {
    it('waits out the countdown, then lets the hippos fart', () => {
        const sim = createSim({ seats: 4 });
        sim.hippos.forEach((h) => (h.bot = false));
        sim.setInput(0, 0, true);
        runFor(sim, COUNTDOWN - 0.5);
        expect(sim.phase).toBe('countdown');
        expect(Math.hypot(sim.vx, sim.vz - 1)).toBeLessThan(0.5);
        runFor(sim, 1.5);
        expect(sim.phase).toBe('run');
        expect(sim.hippos[0].live).toBe(true);
    });

    it('shoves the raft the opposite way to the tail', () => {
        const sim = createSim({ seats: 4 });
        sim.hippos.forEach((h) => (h.bot = false));
        runFor(sim, COUNTDOWN + 0.1);
        // Seat 0 starts at the back of the raft (tail toward -z): a fart pushes forward.
        const before = sim.vz;
        sim.setInput(0, 0, true);
        runFor(sim, 0.6);
        expect(sim.vz).toBeGreaterThan(before + 0.5);
        // A hippo on the left (tail toward -x) pushes right.
        sim.setInput(0, 0, false);
        const h = sim.hippos[0];
        h.ang = -Math.PI / 2 - sim.yaw;
        const vx = sim.vx;
        sim.setInput(0, 0, true);
        runFor(sim, 0.6);
        expect(sim.vx).toBeGreaterThan(vx + 0.5);
    });

    it('runs out of gas and has to wait', () => {
        const sim = createSim({ seats: 2 });
        sim.hippos.forEach((h) => (h.bot = false));
        runFor(sim, COUNTDOWN + 0.1);
        sim.setInput(0, 0, true);
        runFor(sim, 2.6);
        expect(sim.hippos[0].live).toBe(false);
        expect(sim.hippos[0].spent).toBe(true);
    });

    it('keeps hippos from sharing a spot on the rim', () => {
        const sim = createSim({ seats: 4 });
        sim.hippos.forEach((h) => (h.bot = false));
        sim.setInput(0, 1, false);
        runFor(sim, 4);
        const angs = sim.hippos.map((h) => h.ang).sort((a, b) => a - b);
        for (let i = 0; i < angs.length; i++) {
            const gap = Math.abs(angs[(i + 1) % angs.length] - angs[i]);
            expect(Math.min(gap, Math.PI * 2 - gap)).toBeGreaterThan(0.5);
        }
        expect(seatRadius(4)).toBeGreaterThan(seatRadius(2));
    });

    it('hurts on a buoy and sinks the raft back to its checkpoint', () => {
        const sim = createSim({ seats: 4 });
        sim.hippos.forEach((h) => (h.bot = false));
        runFor(sim, COUNTDOWN + 0.1);
        const mine = getCourse().mines[0];
        for (let hit = 0; hit < 6 && sim.sunk <= 0; hit++) {
            sim.x = mine.x;
            sim.z = mine.z - sim.R - 0.1;
            sim.vz = 4;
            sim.inv = 0;
            sim.step(STEP);
        }
        expect(sim.sunk).toBeGreaterThan(0);
        expect(sim.sinks).toBe(1);
        runFor(sim, 3);
        expect(sim.sunk).toBeLessThanOrEqual(0);
        // The buoys are past the 200 flag, which the raft crossed on the way to them.
        expect(sim.z).toBeCloseTo(200, 0);
        expect(sim.hull).toBe(5);
    });

    it('lets a crew of bots reach the finish', () => {
        const sim = createSim({ seats: 2, skill: 1, seed: 2 });
        let steps = 0;
        while (sim.phase !== 'done' && steps++ < 60 * 400) sim.step(STEP);
        expect(sim.phase).toBe('done');
        expect(sim.z).toBeGreaterThanOrEqual(FINISH_Z);
    });
});

describe('hippo rapids rooms', () => {
    function setup() {
        let time = 1_000_000;
        const rooms = createRoomManager({ now: () => time });
        return {
            rooms,
            advance(ms) {
                time += ms;
                rooms.tick();
            },
        };
    }

    it('hosts a room, and a friend joins the next seat', () => {
        const { rooms } = setup();
        const host = fakeSocket();
        const guest = fakeSocket();
        const room = rooms.create(host, { name: 'Hyuk', seats: 4 });
        expect(room.code).toHaveLength(4);
        expect(host.last('room')).toMatchObject({ seat: 0, seats: 4, status: 'lobby', names: ['Hyuk', null, null, null] });
        rooms.join(guest, { code: room.code.toLowerCase(), name: 'Gus' });
        expect(guest.last('room')).toMatchObject({ seat: 1, names: ['Hyuk', 'Gus', null, null] });
        expect(host.last('room').connected).toEqual([true, true, false, false]);
        expect(rooms.peek(room.code)).toMatchObject({ status: 'open', free: 2 });
    });

    it('only makes 2 or 4 seat rooms', () => {
        const { rooms } = setup();
        expect(rooms.create(fakeSocket(), { name: 'A', seats: 3 }).seats).toBe(4);
        expect(rooms.create(fakeSocket(), { name: 'B', seats: 2 }).seats).toBe(2);
    });

    it('rejects a full room and a missing one', () => {
        const { rooms } = setup();
        const room = rooms.create(fakeSocket(), { name: 'A', seats: 2 });
        rooms.join(fakeSocket(), { code: room.code, name: 'B' });
        expect(() => rooms.join(fakeSocket(), { code: room.code, name: 'C' })).toThrow(RoomError);
        expect(() => rooms.join(fakeSocket(), { code: 'ZZZZ', name: 'C' })).toThrow(RoomError);
        expect(rooms.peek(room.code).status).toBe('full');
    });

    it('lets only the host launch, then streams the raft with bots in the empty seats', () => {
        const { rooms, advance } = setup();
        const host = fakeSocket();
        const guest = fakeSocket();
        const room = rooms.create(host, { name: 'A', seats: 4 });
        rooms.join(guest, { code: room.code, name: 'B' });
        rooms.start(guest);
        expect(room.status).toBe('lobby');
        rooms.start(host);
        expect(room.status).toBe('playing');
        expect(guest.of('start')).toHaveLength(1);
        expect(room.sim.hippos.map((h) => h.bot)).toEqual([false, false, true, true]);
        advance(100);
        const snap = host.last('snap');
        expect(snap.ph).toBe('countdown');
        expect(snap.h).toHaveLength(4);
        expect(snap.h[2][5]).toBe(1);
    });

    it('takes a player\'s input for their own hippo', () => {
        const { rooms, advance } = setup();
        const host = fakeSocket();
        const room = rooms.create(host, { name: 'A', seats: 2 });
        rooms.start(host);
        advance(4000);
        rooms.input(host, { mv: 1, f: true });
        expect(room.sim.hippos[0].mv).toBe(1);
        expect(room.sim.hippos[0].fart).toBe(true);
        rooms.input(host, { mv: 'sideways', f: 0 });
        expect(room.sim.hippos[0].mv).toBe(0);
        expect(room.sim.hippos[0].fart).toBe(false);
    });

    it('hands a dropped player\'s seat to a bot, and back when they return', () => {
        const { rooms, advance } = setup();
        const host = fakeSocket();
        const guest = fakeSocket();
        const room = rooms.create(host, { name: 'A', seats: 2 });
        rooms.join(guest, { code: room.code, name: 'B' });
        const token = guest.last('room').token;
        rooms.start(host);
        rooms.disconnect(guest);
        guest.readyState = 3;
        expect(room.sim.hippos[1].bot).toBe(true);
        advance(RECONNECT_MS - 1000);
        expect(room.players[1]).not.toBeNull();
        const back = fakeSocket();
        rooms.rejoin(back, { code: room.code, token });
        expect(room.sim.hippos[1].bot).toBe(false);
        expect(back.last('room').seat).toBe(1);
    });

    it('frees a seat that stays gone and passes the host along', () => {
        const { rooms, advance } = setup();
        const host = fakeSocket();
        const guest = fakeSocket();
        const room = rooms.create(host, { name: 'A', seats: 2 });
        rooms.join(guest, { code: room.code, name: 'B' });
        rooms.leave(host);
        expect(room.host).toBe(1);
        expect(guest.last('left')).toMatchObject({ seat: 0, reason: 'left' });
        rooms.disconnect(guest);
        guest.readyState = 3;
        advance(RECONNECT_MS + 1000);
        expect(rooms.size).toBe(0);
    });

    it('goes back to the dock after a finish', () => {
        const { rooms, advance } = setup();
        const host = fakeSocket();
        const room = rooms.create(host, { name: 'A', seats: 2 });
        rooms.start(host);
        room.sim.phase = 'run';
        room.sim.z = FINISH_Z + 1;
        advance(100);
        expect(room.status).toBe('done');
        rooms.again(host);
        expect(room.status).toBe('lobby');
        expect(room.sim.phase).toBe('countdown');
    });
});
