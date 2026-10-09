import { describe, expect, test } from '@jest/globals';
import { defaultCombatProgress, sanitizeCombatSave, mergeCombatProgress } from '../shared/waysideFury/u1Combat.js';
import { HERO_IDS, sanitizeSave } from '../shared/waysideFury/save.js';
import { legacySave, currentSave } from './helpers/waysideFurySaveFixtures.js';

describe('Wayside Fury personal training progress', () => {
    test('old saves migrate every hero to tier zero', () => {
        const expected = { training: { you: 0, joe: 0, matt: 0, alex: 0, jon: 0 } };
        expect(defaultCombatProgress()).toEqual(expected);
        for (const raw of [undefined, null, [], {}, { training: null }]) expect(sanitizeCombatSave(raw)).toEqual(expected);
        expect(sanitizeSave(legacySave()).save.u1.combat).toEqual(expected);
    });
    test('keeps only finite integer tiers and known heroes', () => {
        expect(sanitizeCombatSave({ training: { you: 3, joe: 2, matt: 1, alex: 0, jon: 3, alien: 3 }, cooldown: 0 })).toEqual({
            training: { you: 3, joe: 2, matt: 1, alex: 0, jon: 3 },
        });
        for (const invalid of [-1, 4, 1.5, '3', true, null, undefined, NaN, Infinity, -Infinity]) {
            const clean = sanitizeCombatSave({ training: Object.fromEntries(HERO_IDS.map(id => [id, invalid])) });
            expect(clean).toEqual(defaultCombatProgress());
        }
    });
    test('normalization copies training maps so each player owns their progression', () => {
        const raw = { training: { you: 2, joe: 1 } }, clean = sanitizeCombatSave(raw);
        raw.training.you = 3;
        expect(clean.training.you).toBe(2);
        clean.training.joe = 3;
        expect(raw.training.joe).toBe(1);
        const other = defaultCombatProgress();
        expect(other.training.joe).toBe(0);
    });
    test('cloud/retry reconciliation preserves the highest earned tier per hero', () => {
        const first = { training: { you: 3, joe: 1, alex: 2 } }, stale = { training: { you: 0, joe: 2, matt: 1 } };
        const expected = { training: { you: 3, joe: 2, matt: 1, alex: 2, jon: 0 } };
        expect(mergeCombatProgress(first, stale, null, { training: { jon: Infinity } })).toEqual(expected);
        expect(mergeCombatProgress(stale, first)).toEqual(expected);
        expect(mergeCombatProgress(expected, expected)).toEqual(expected);
        expect(first.training.joe).toBe(1);
    });
    test('the versioned save round trip retains tiers without adding reward receipts', () => {
        const raw = currentSave({ u1: { combat: { training: { you: 3, joe: 2, matt: 1, alex: 0, jon: 3 } } } });
        const before = structuredClone(raw.lastReported), save = sanitizeSave(raw).save;
        expect(save.u1.combat.training).toEqual(raw.u1.combat.training);
        expect(save.lastReported).toEqual(before);
        expect(sanitizeSave(JSON.parse(JSON.stringify(save))).save).toEqual(save);
    });
});
