import { HIDDEN_PICKUPS } from '../shared/waysideFury/collectibles.js';
import { sanitizeSave, mergeReceipts } from '../shared/waysideFury/save.js';
import { currentSave, makeServer } from './helpers/waysideFurySaveFixtures.js';
import { cleanRelay, cleanWorld } from '../wayside-fury/protocol.js';
import { createRoomManager } from '../wayside-fury/rooms.js';
const first = HIDDEN_PICKUPS[0].id, second = HIDDEN_PICKUPS[1].id;
describe('Wayside Fury personal finds', () => {
    test('old sheets migrate to no finds and an intact ambient taxi', () => {
        const save = sanitizeSave(currentSave()).save;
        expect(save.foundItems).toEqual([]); expect(save.ambientTaxiWrecked).toBe(false);
    });
    test('only authored IDs survive, deduplicated in the save and receipt', () => {
        const save = sanitizeSave(currentSave({ foundItems: [first, first, 'pickup-c1-forged', null, '<script>'], ambientTaxiWrecked: true,
            lastReported: { areas: [], bosses: [], rooms: [], level: 1, foundItems: [first, first, 'pickup-c1-forged'] } })).save;
        expect(save.foundItems).toEqual([first]); expect(save.ambientTaxiWrecked).toBe(true);
        expect(save.lastReported.foundItems).toEqual([first]); expect(sanitizeSave(save).save).toEqual(save);
        expect(mergeReceipts(save.lastReported, { areas: [], bosses: [], rooms: [], level: 1, foundItems: [second] }).foundItems).toEqual([first, second]);
    });
    test('pickup requests and host rewards carry known IDs and bounded world gates', () => {
        expect(cleanRelay({ type: 'pickup', id: first, scene: 'overworld', room: 0 })).toEqual({ type: 'pickup', id: first, scene: 'overworld', room: 0 });
        expect(cleanRelay({ type: 'pickup', id: 'pickup-c1-forged', scene: 'overworld', room: 0 })).toBeNull();
        const reward = { id: `pickup:${first}:player`, kind: 'pickup', pickupId: first, xp: 0, candy: 0 };
        expect(cleanRelay({ type: 'reward', reward, targetSeat: 1 }).reward).toEqual(reward);
        expect(cleanRelay({ type: 'reward', reward: { ...reward, candy: 100 }, targetSeat: 1 })).toBeNull();
        const world = { scene: 'overworld', room: 0, time: 1, x: 100, y: 110, enemies: [], projectiles: [],
            palette: 'real', transitionTarget: null, transitionPalette: 'real', cutscene: 0, sceneTimer: 0,
            clearedRooms: [], areas: [], bosses: [], chapter: 1, rngSeed: 1, nextId: 1, ambientTaxiWrecked: true, ambientTaxiGag: 1.3 };
        expect(cleanWorld(world)).toEqual(world);
        expect(cleanWorld({ ...world, ambientTaxiWrecked: 'true' })).toBeNull();
        expect(cleanWorld({ ...world, ambientTaxiGag: 999 })).toBeNull();
    });
    test('revisioned cloud writes retain the personal collection and wreck once', async () => {
        const { app } = await makeServer();
        try {
            const save = currentSave({ foundItems: [first], ambientTaxiWrecked: true,
                lastReported: { areas: [], bosses: [], rooms: [], level: 1, foundItems: [first] } });
            const written = await app.inject({ method: 'PUT', url: '/wayside-fury/save', payload: { save, revision: null } });
            expect(written.statusCode).toBe(200);
            const loaded = (await app.inject({ method: 'GET', url: '/wayside-fury/save' })).json();
            expect(loaded.save.foundItems).toEqual([first]); expect(loaded.save.ambientTaxiWrecked).toBe(true);
            const retry = await app.inject({ method: 'PUT', url: '/wayside-fury/save', payload: { save, revision: null } });
            expect(retry.statusCode).toBe(409); expect(retry.json().save.lastReported.foundItems).toEqual([first]);
        } finally { await app.close(); }
    });
    test('the server forwards a guest pickup request only to the host and rejects guest rewards', () => {
        const rooms = createRoomManager();
        const socket = () => ({ readyState: 1, sent: [], send(message) { this.sent.push(JSON.parse(message)); }, close() { this.readyState = 3; } });
        const host = socket(), guest = socket(), observer = socket();
        try {
            for (const [connection, userId] of [[host, 'host'], [guest, 'guest'], [observer, 'observer']]) rooms.auth(connection, { ticket: rooms.issueTicket({ userId, name: userId }) });
            const room = rooms.create(host); rooms.join(guest, { code: room.code }); rooms.join(observer, { code: room.code });
            rooms.relay(guest, { type: 'pickup', id: first, scene: 'overworld', room: 0 });
            expect(host.sent.filter(message => message.type === 'pickup')).toHaveLength(1);
            expect(observer.sent.filter(message => message.type === 'pickup')).toHaveLength(0);
            const reward = { id: `pickup:${first}:guest`, kind: 'pickup', pickupId: first, xp: 0, candy: 0 };
            expect(() => rooms.relay(guest, { type: 'reward', reward, targetSeat: 1 })).toThrow();
            rooms.relay(host, { type: 'reward', reward, targetSeat: 1 });
            expect(guest.sent.filter(message => message.type === 'reward')).toHaveLength(1);
            expect(observer.sent.filter(message => message.type === 'reward')).toHaveLength(0);
        } finally { rooms.close(); }
    });
});
