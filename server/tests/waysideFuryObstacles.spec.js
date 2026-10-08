import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from '@jest/globals';
import { SAVE_VERSION, HERO_IDS, heroStats, sanitizeSave } from '../shared/waysideFury/save.js';
import { mergeWorldSaves, sanitizeWorldSave } from '../shared/waysideFury/u1World.js';
import { cleanRelay } from '../wayside-fury/protocol.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = fileURLToPath(new URL('../../scripts/check-wayside-fury-obstacles.mjs', import.meta.url));
const gateId = 'world-joe-county';
const legacySave = () => {
    const character = { level: 1, xp: 0 }, gear = { power: 0, ward: 0 };
    const heroes = Object.fromEntries(HERO_IDS.map(id => {
        const stats = heroStats(id, character, gear);
        return [id, { id, ...character, ...stats, hp: stats.maxHp, ki: stats.maxKi, stamina: stats.maxStamina, invulnerable: 0 }];
    }));
    return { version: SAVE_VERSION, chapter: 1, character, gear, heroes, active: 'you', party: ['you', 'joe'], unlockedHeroes: [...HERO_IDS],
        candy: 0, areas: [], bosses: [], clearedRooms: [], kills: 0, deaths: 0, home: null, savedAt: 1,
        lastReported: { areas: [], bosses: [], rooms: [], level: 1 }, coopRewards: [] };
};

describe('Update 1 hero obstacles', () => {
    test('simulation covers all gates, combat priority, honest collision, co-op and persistence', () => {
        const output = execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8', timeout: 120000 });
        expect(output).toContain('Wayside Fury obstacles:');
    }, 125000);

    test('old saves migrate to an empty obstacle namespace', () => {
        const saved = sanitizeSave(legacySave()).save;
        expect(saved).toBeTruthy();
        expect(saved.u1.world.clearedObstacles).toEqual([]);
    });

    test('world sanitizer keeps stable discoveries once and rejects invalid values', () => {
        const clean = sanitizeWorldSave({ clearedObstacles: [gateId, gateId, null, 3, '', '../bad', 'x'.repeat(600)] });
        expect(clean.clearedObstacles).toEqual([gateId]);
        expect(sanitizeWorldSave(null).clearedObstacles).toEqual([]);
        expect(sanitizeWorldSave({ clearedObstacles: 'all' }).clearedObstacles).toEqual([]);
    });

    test('save sanitizer retains obstacle discovery without changing ticket receipts', () => {
        const before = legacySave();
        const saved = sanitizeSave({ ...before, u1: { world: { clearedObstacles: [gateId] } } }).save;
        expect(saved).toBeTruthy();
        expect(saved.u1.world.clearedObstacles).toEqual([gateId]);
        expect(saved.lastReported).toEqual(before.lastReported);
        expect(saved.clearedRooms).toEqual([]);
    });

    test('world cloud merge unions sanitized discoveries while retaining the selected clock', () => {
        const local = { clearedObstacles: [gateId, 'bad', gateId], cycleSeconds: 450 };
        const remote = { clearedObstacles: ['world-joe-road', null], cycleSeconds: 20 };
        expect(mergeWorldSaves(local, remote, remote)).toEqual({ clearedObstacles: [gateId, 'world-joe-road'], cycleSeconds: 20 });
        expect(mergeWorldSaves(local, remote, local).cycleSeconds).toBe(450);
        expect(mergeWorldSaves(local, remote, { cycleSeconds: 480.25 }).cycleSeconds).toBe(.25);
        expect(mergeWorldSaves(local, remote, { cycleSeconds: NaN }).cycleSeconds).toBe(0);
        expect(mergeWorldSaves({ clearedObstacles: 'all', cycleSeconds: Infinity }, undefined)).toEqual({ clearedObstacles: [], cycleSeconds: 0 });
        expect(mergeWorldSaves(undefined, null)).toEqual({ clearedObstacles: [], cycleSeconds: 0 });
    });

    test('cloud save reconciliation keeps discoveries, winner siblings and existing ticket policy', () => {
        execFileSync(process.execPath, ['--input-type=module', '-e', `
            import assert from 'node:assert/strict';
            import { mergeSaves, receiptScore } from './src/pages/WaysideFury/game/cloud.ts';
            import { mergeReceipts, progressScore } from './server/shared/waysideFury/save.js';
            const base = ${JSON.stringify(legacySave())};
            const local = { ...base, savedAt: 2, u1: { sibling: { source: 'local' }, world: { clearedObstacles: ['${gateId}'], cycleSeconds: 20 } } };
            const remote = { ...base, savedAt: 1, u1: { sibling: { source: 'remote' }, world: { clearedObstacles: ['world-joe-road', 'bad'], cycleSeconds: 450 } } };
            const merged = mergeSaves(local, remote);
            assert.deepEqual(merged.u1.world, { clearedObstacles: ['${gateId}', 'world-joe-road'], cycleSeconds: 20 });
            assert.equal(merged.u1.sibling, undefined, "unrecognized namespaces are rejected");
            assert.deepEqual(merged.lastReported, mergeReceipts(local.lastReported, remote.lastReported));
            assert.deepEqual(merged.clearedRooms, []);
            assert.equal(progressScore(merged), progressScore(local));
            assert.equal(receiptScore(merged.lastReported, base.lastReported), 0);
            const advanced = mergeSaves(local, { ...remote, chapter: 2, u1: { world: { clearedObstacles: ['world-joe-road'], cycleSeconds: 5 } } });
            assert.equal(advanced.chapter, 2);
            assert.equal(advanced.u1.world.cycleSeconds, 5);
            assert.deepEqual(advanced.u1.world.clearedObstacles, ['${gateId}', 'world-joe-road']);
            const legacyWinner = mergeSaves({ ...base, savedAt: 3 }, remote);
            assert.equal(legacyWinner.u1.world.cycleSeconds, 0);
            assert.deepEqual(legacyWinner.u1.world.clearedObstacles, ['world-joe-road']);
            assert.deepEqual(mergeSaves(base, null).u1.world, { clearedObstacles: [], cycleSeconds: 0 });
            assert.deepEqual(mergeSaves(null, base).u1.world, { clearedObstacles: [], cycleSeconds: 0 });
            assert.deepEqual(mergeSaves({ ...base, u1: { world: { clearedObstacles: 'all', cycleSeconds: -1 } } }, null).u1.world,
                { clearedObstacles: [], cycleSeconds: 0 });
            assert.equal(mergeSaves(null, null), null);
        `], { cwd: root, encoding: 'utf8', timeout: 120000 });
    }, 125000);

    test('obstacle requests retain only bounded action and location fields', () => {
        const request = { type: 'obstacle', id: gateId, scene: 'overworld', room: 0 };
        expect(cleanRelay({ ...request, seat: 3, userId: 'spoof', name: 'Spoof', hero: 'joe' })).toEqual(request);
        for (const invalid of [
            { id: '' }, { id: 7 }, { id: '../world-joe-county' }, { id: 'x'.repeat(600) },
            { scene: 'not-a-scene' }, { room: -1 }, { room: .5 }, { room: 1000 }, { room: NaN },
        ]) expect(cleanRelay({ ...request, ...invalid })).toBeNull();
    });
});
