import { parseSaveRequest } from '../routes/scareCapitalist.js';
import { sanitizeSave } from '../shared/scareCapitalist/save.js';

const NOW = 1_800_000_000_000;

function validSave(extra = {}) {
    return {
        v: 1,
        cash: 8.3e12,
        runEarned: 4e14,
        lifetime: 9e14,
        investors: 40,
        investorsClaimed: 300,
        ventures: Array.from({ length: 10 }, (_, i) => ({ owned: 100 - i * 10, progress: 0.4, running: true, managed: i < 5 })),
        upgrades: ['corn-0', 'gum-0', 'all-0'],
        seances: ['s0'],
        savedAt: NOW - 1000,
        runStartedAt: NOW - 3_600_000,
        resets: 2,
        ...extra,
    };
}

describe('Scary Capitalist saves', () => {
    test('accept a valid save and drop unknown fields', () => {
        const { save, error } = sanitizeSave({ ...validSave(), cheat: true }, NOW);
        expect(error).toBeUndefined();
        expect(save).toEqual(validSave());
    });

    test('keep numbers far past a quadrillion', () => {
        expect(sanitizeSave(validSave({ cash: 1.7e308, lifetime: 1.7e308, runEarned: 1e300 }), NOW).error).toBeUndefined();
    });

    test('refuse broken or impossible saves', () => {
        expect(sanitizeSave(validSave({ v: 2 }), NOW).error).toMatch(/version/);
        expect(sanitizeSave(validSave({ cash: -1 }), NOW).error).toMatch(/cash/);
        expect(sanitizeSave(validSave({ cash: null }), NOW).error).toMatch(/cash/);
        expect(sanitizeSave(validSave({ runEarned: 1e15 }), NOW).error).toMatch(/runEarned/);
        // 9e14 lifetime earns floor(150 x cbrt(90)) = 672 investors, no more
        expect(sanitizeSave(validSave({ investorsClaimed: 5000 }), NOW).error).toMatch(/investorsClaimed/);
        expect(sanitizeSave(validSave({ investors: 400 }), NOW).error).toMatch(/investors/);
        expect(sanitizeSave(validSave({ ventures: [] }), NOW).error).toMatch(/ventures/);
        expect(sanitizeSave(validSave({ upgrades: ['DROP TABLE'] }), NOW).error).toMatch(/upgrades/);
        expect(sanitizeSave(validSave({ seances: 's1' }), NOW).error).toMatch(/seances/);
    });

    test('a clock set forward cannot bank offline time', () => {
        expect(sanitizeSave(validSave({ savedAt: NOW + 86_400_000 }), NOW).save.savedAt).toBe(NOW);
    });

    test('check the request around the save', () => {
        expect(parseSaveRequest({ save: validSave(), revision: null }, NOW).error).toBeUndefined();
        expect(parseSaveRequest({ save: validSave(), revision: 4 }, NOW).revision).toBe(4);
        expect(parseSaveRequest({ save: validSave(), revision: 0 }, NOW).error).toMatch(/revision/);
        expect(parseSaveRequest({ save: { junk: 'x'.repeat(30_000) }, revision: null }, NOW).error).toMatch(/large/);
    });
});
