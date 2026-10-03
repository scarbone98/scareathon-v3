import { jest } from '@jest/globals';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { BROADCAST, SERVER_SLOT, createRoomManager } from '../eightBitEvilV2/rooms.js';
import { createLauncher } from '../eightBitEvilV2/launcher.js';

function fakeSocket() {
    return {
        readyState: 1, texts: [], packets: [],
        send(data, options) {
            if (options?.binary) this.packets.push(Buffer.from(data));
            else this.texts.push(JSON.parse(data));
        },
        last() { return this.texts[this.texts.length - 1]; },
        of(type) { return this.texts.filter((m) => m.type === type); },
    };
}

const flush = () => new Promise((r) => setImmediate(r));

function setup({ available = true, launch = jest.fn(async () => {}) } = {}) {
    const timers = [];
    const launcher = { available: jest.fn(() => available), launch, stop: jest.fn() };
    const rooms = createRoomManager({ launcher, setTimer: (fn) => timers.push(fn) });
    const leader = fakeSocket();
    const guest = fakeSocket();
    const code = rooms.create(leader, { name: 'Sam', hero: 'joe' });
    rooms.join(guest, { code, name: 'Pal', hero: 'alex' });
    return { rooms, launcher, timers, leader, guest, code };
}

describe('8 Bit Evil V2: server-hosted rooms', () => {
    test('the leader starts; the server copy joins with its token and hosts', async () => {
        const { rooms, launcher, leader, guest, code } = setup();
        rooms.start(leader);
        await flush();
        expect(launcher.launch).toHaveBeenCalledWith(code, expect.stringMatching(/^[0-9a-f]{32}$/));
        expect(leader.of('start')).toHaveLength(0);
        expect(() => rooms.join(fakeSocket(), { code })).toThrow('started');
        const token = launcher.launch.mock.calls[0][1];
        expect(() => rooms.hostJoin(fakeSocket(), { code, token: 'wrong' })).toThrow('gone');
        const server = fakeSocket();
        rooms.hostJoin(server, { code, token });
        for (const s of [leader, guest, server]) {
            expect(s.of('start')[0]).toMatchObject({ host: SERVER_SLOT, stage: 'graveyard' });
            expect(s.of('start')[0].players.map((p) => p.slot)).toEqual([0, 1]);  // the server isn't a hero
        }
        expect(leader.last()).toMatchObject({ leader: true, host: false, host_slot: SERVER_SLOT });
        expect(server.last()).toMatchObject({ slot: SERVER_SLOT, host: true, leader: false });
        // Players reach the server; the server reaches players.
        rooms.relay(leader, Buffer.from([0, 7]));
        expect(server.packets[0]).toEqual(Buffer.from([0, 7]));
        rooms.relay(server, Buffer.from([BROADCAST, 9]));
        expect(leader.packets[0]).toEqual(Buffer.from([SERVER_SLOT, 9]));
        expect(guest.packets[0]).toEqual(Buffer.from([SERVER_SLOT, 9]));
    });

    test('the leader leaving mid-game no longer ends it; the server copy leaving does', async () => {
        const { rooms, launcher, leader, guest, code } = setup();
        rooms.start(leader);
        await flush();
        const server = fakeSocket();
        rooms.hostJoin(server, { code, token: launcher.launch.mock.calls[0][1] });
        rooms.leave(leader);
        expect(rooms.size()).toBe(1);
        expect(guest.of('left')[0]).toMatchObject({ slot: 0 });
        rooms.disconnect(server);
        expect(guest.last()).toEqual({ type: 'closed', reason: 'host' });
        expect(launcher.stop).toHaveBeenCalledWith(code);
    });

    test('when every player has gone the room closes and its game copy is stopped', async () => {
        const { rooms, launcher, leader, guest, code } = setup();
        rooms.start(leader);
        await flush();
        const server = fakeSocket();
        rooms.hostJoin(server, { code, token: launcher.launch.mock.calls[0][1] });
        rooms.leave(guest);
        rooms.leave(leader);
        expect(server.last()).toEqual({ type: 'closed', reason: 'empty' });
        expect(launcher.stop).toHaveBeenCalledWith(code);
        expect(rooms.size()).toBe(0);
    });

    test('falls back to the leader hosting if the launch fails', async () => {
        const { rooms, leader, guest } = setup({ launch: jest.fn(async () => { throw new Error('no program'); }) });
        rooms.start(leader);
        await flush();
        expect(guest.of('start')[0]).toMatchObject({ host: 0 });
        expect(leader.last()).toMatchObject({ host: true, leader: true });
    });

    test('falls back to the leader hosting if the copy never connects', async () => {
        const { rooms, launcher, timers, leader, guest, code } = setup();
        rooms.start(leader);
        await flush();
        timers.forEach((fn) => fn());
        expect(guest.of('start')[0]).toMatchObject({ host: 0 });
        expect(launcher.stop).toHaveBeenCalledWith(code);
        // A late copy can't take over a started room.
        expect(() => rooms.hostJoin(fakeSocket(), { code, token: launcher.launch.mock.calls[0][1] })).toThrow('gone');
    });

    test('with no capacity the leader hosts straight away', () => {
        const { rooms, launcher, leader, guest } = setup({ available: false });
        rooms.start(leader);
        expect(launcher.launch).not.toHaveBeenCalled();
        expect(guest.of('start')[0]).toMatchObject({ host: 0 });
    });
});

describe('8 Bit Evil V2: launcher', () => {
    test('downloads the program once, starts one copy per room, stops it', async () => {
        const cacheDir = await mkdtemp(join(tmpdir(), 'v2test-'));
        const fetchImpl = jest.fn(async () => ({
            ok: true, status: 200,
            headers: { get: () => '"abc"' },
            arrayBuffer: async () => Buffer.from('#!/bin/sh\n'),
        }));
        const children = [];
        const spawn = jest.fn(() => {
            const child = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            child.kill = jest.fn();
            children.push(child);
            setImmediate(() => child.emit('spawn'));
            return child;
        });
        const launcher = createLauncher({ env: { V2_MAX_SERVER_GAMES: '1' }, fetchImpl, spawn, cacheDir });
        expect(launcher.available()).toBe(true);
        await launcher.launch('ABCD', 'tok');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(await readFile(join(cacheDir, '8ber-server.x86_64.etag'), 'utf8')).toBe('"abc"');
        const [bin, args] = spawn.mock.calls[0];
        expect(bin).toBe(join(cacheDir, '8ber-server.x86_64'));
        expect(args).toEqual(['--headless', '--', '--coop=server', '--room=ABCD', '--token=tok', '--server=http://127.0.0.1:3000']);
        expect(launcher.available()).toBe(false);  // at capacity
        launcher.stop('ABCD');
        expect(children[0].kill).toHaveBeenCalled();
        expect(launcher.available()).toBe(true);
    });

    test('can be switched off', () => {
        expect(createLauncher({ env: { V2_SERVER_GAMES: 'off' } }).available()).toBe(false);
    });
});
