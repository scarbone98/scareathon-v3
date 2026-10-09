import { sanitizeSave, progressScore, ticketDelta } from '../shared/waysideFury/save.js';
import { legacySave, currentSave } from './helpers/waysideFurySaveFixtures.js';
import { cleanWorld } from '../wayside-fury/protocol.js';

describe('Wayside Fury additive day/night state', () => {
    test('old versions start in daylight while an explicit pause clock preference survives', () => {
        for (const raw of [legacySave(), legacySave({ version: 2 }), currentSave({ version: 3 }), currentSave()]) {
            const save = sanitizeSave(raw).save;
            expect(save.worldCycleSeconds).toBe(0);
            expect(save.settings.showWorldClock).not.toBe(false);
            expect(sanitizeSave({ ...save, worldCycleSeconds: 780, settings: { ...save.settings, showWorldClock: false } }).save)
                .toMatchObject({ worldCycleSeconds: 300, settings: { showWorldClock: false } });
            expect(sanitizeSave(save).save).toEqual(save);
        }
    });
    test('malformed clocks default to daylight and time does not increase progress or tickets', () => {
        const day = sanitizeSave(currentSave()).save;
        for (const value of [undefined, null, '300', -1, NaN, Infinity]) {
            expect(sanitizeSave({ ...day, worldCycleSeconds: value }).save.worldCycleSeconds).toBe(0);
        }
        const night = sanitizeSave({ ...day, worldCycleSeconds: 300 }).save;
        expect(progressScore(night)).toBe(progressScore(day));
        expect(ticketDelta(night.lastReported, day.lastReported)).toBe(0);
    });
    test('host snapshots allow bounded clocks and encounter windows without requiring new fields from old clients', () => {
        const world = { scene: 'overworld', room: 0, time: 1, x: 100, y: 110, enemies: [], projectiles: [],
            palette: 'real', transitionTarget: null, transitionPalette: 'real', cutscene: 0, sceneTimer: 0,
            clearedRooms: [], areas: [], bosses: [], chapter: 1, rngSeed: 1, nextId: 1 };
        expect(cleanWorld(world)).toEqual(world);
        expect(cleanWorld({ ...world, worldCycleSeconds: 300, nightEncounterWindow: 'night:1' })).not.toBeNull();
        for (const value of [-1, 480, Infinity, '300']) expect(cleanWorld({ ...world, worldCycleSeconds: value })).toBeNull();
        for (const value of ['night:99', ['night:1'], 1]) expect(cleanWorld({ ...world, nightEncounterWindow: value })).toBeNull();
        expect(cleanWorld({ ...world, enemies: [null] })).toBeNull();
    });
});
