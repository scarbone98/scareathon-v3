import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    avatarRules,
    parseOutfitRequest,
    serializeProfile,
    validateOutfitItems,
} from '../utils/avatarV2.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const profile = { build: 'm', skin: 'skin_zombie', hair: 'bone', eyes: 'blood' };

function item(id, category, extra = {}) {
    return { id, name: `Item ${id}`, category, occupies: [], dyes: {}, ...extra };
}

describe('avatar v2 rules', () => {
    test('match the art pipeline', async () => {
        const lib = await import(path.join(repoRoot, 'scripts/avatar-art/lib.mjs'));
        expect(avatarRules.slots).toEqual(lib.SLOTS);
        expect(avatarRules.categories).toEqual(lib.CATEGORIES);
        expect(avatarRules.builds).toEqual(lib.BUILDS);
    });

    test('offer every skin tone in the palette', () => {
        const palette = JSON.parse(fs.readFileSync(path.join(repoRoot, 'avatar-art/palette.json'), 'utf8'));
        expect(avatarRules.skinTones).toEqual(palette.swappable.skin);
        expect(avatarRules.dyeColors).not.toContain('dye1');
        expect(avatarRules.dyeColors).not.toContain('skin');
    });
});

describe('parseOutfitRequest', () => {
    test('accepts a valid outfit', () => {
        const parsed = parseOutfitRequest({
            profile,
            outfit: [{ itemInstanceId: 5 }, { itemInstanceId: '6', dyes: { dye1: 'blood' } }],
        });
        expect(parsed.error).toBeUndefined();
        expect(parsed.profile).toEqual(profile);
        expect(parsed.entries).toEqual([
            { itemInstanceId: 5, dyes: {} },
            { itemInstanceId: 6, dyes: { dye1: 'blood' } },
        ]);
    });

    test('rejects unknown builds and colours', () => {
        expect(parseOutfitRequest({ profile: { ...profile, build: 'x' }, outfit: [] }).error).toMatch(/build/);
        expect(parseOutfitRequest({ profile: { ...profile, skin: 'blood' }, outfit: [] }).error).toMatch(/skin/);
        expect(parseOutfitRequest({ profile: { ...profile, hair: 'dye1' }, outfit: [] }).error).toMatch(/hair/);
        expect(parseOutfitRequest({ profile: { ...profile, eyes: 'skin' }, outfit: [] }).error).toMatch(/eye/);
    });

    test('rejects duplicate items and bad dyes', () => {
        expect(parseOutfitRequest({ profile, outfit: [{ itemInstanceId: 1 }, { itemInstanceId: 1 }] }).error).toMatch(/unique/);
        expect(parseOutfitRequest({ profile, outfit: [{ itemInstanceId: 1, dyes: { dye3: 'blood' } }] }).error).toMatch(/channel/);
        expect(parseOutfitRequest({ profile, outfit: [{ itemInstanceId: 1, dyes: { dye1: 'skin_pale' } }] }).error).toMatch(/colour/);
        expect(parseOutfitRequest({ profile }).error).toMatch(/required/);
    });
});

describe('validateOutfitItems', () => {
    const owned = new Map([
        [1, item(1, 'body')],
        [2, item(2, 'neck', { dyes: { dye1: 'night', dye2: 'blood' } })],
        [3, item(3, 'neck')],
        [4, item(4, 'neck')],
        [5, item(5, 'held_near')],
        [6, item(6, 'held_near', { occupies: ['held_far'] })],
        [7, item(7, 'held_far')],
        [8, item(8, 'body')],
    ]);
    const outfit = (...ids) => ids.map((id) => ({ itemInstanceId: id, dyes: {} }));

    test('allows up to the category limit', () => {
        expect(validateOutfitItems(outfit(1, 2, 3), owned)).toBeNull();
        expect(validateOutfitItems(outfit(1, 2, 3, 4), owned)).toMatch(/Only 2 neck items/);
    });

    test('counts extra categories an item occupies', () => {
        expect(validateOutfitItems(outfit(1, 5, 7), owned)).toBeNull();
        expect(validateOutfitItems(outfit(1, 6, 7), owned)).toMatch(/held far/);
    });

    test('needs exactly one body', () => {
        expect(validateOutfitItems(outfit(2), owned)).toMatch(/body/);
        expect(validateOutfitItems(outfit(1, 8), owned)).toMatch(/body/);
    });

    test('rejects items the user does not own', () => {
        expect(validateOutfitItems(outfit(1, 99), owned)).toMatch(/inventory/);
    });

    test('only allows the dye channels an item has', () => {
        expect(validateOutfitItems([{ itemInstanceId: 1, dyes: {} }, { itemInstanceId: 2, dyes: { dye2: 'gold' } }], owned)).toBeNull();
        expect(validateOutfitItems([{ itemInstanceId: 1, dyes: { dye1: 'gold' } }], owned)).toMatch(/dyed/);
    });
});

describe('serializeProfile', () => {
    test('fills defaults for a missing row', () => {
        expect(serializeProfile(undefined)).toEqual({ build: 'f', buildChosen: false, skin: 'skin', hair: 'hair', eyes: 'eyes' });
    });
});
