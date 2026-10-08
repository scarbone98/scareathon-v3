import { cleanFusionWorld, createFusionWorld, elapsedFusionWorld, FUSION_DURATION, FUSION_COOLDOWN } from '../shared/waysideFury/u1Fusion.js';
import { cleanInput, cleanHero, cleanWorld } from '../wayside-fury/protocol.js';

const form = (extra = {}) => ({ id: 1, mode: 'coop', seats: [0, 1], heroes: ['you', 'joe'], scene: 'test', room: 0, remaining: FUSION_DURATION, specialUsed: false, ...extra });
const world = (extra = {}) => ({ nextId: 2, forms: [form()], cooldowns: {}, ...extra });
const hero = (extra = {}) => ({
    hero: { id: 'you', hp: 100, maxHp: 100, ki: 20, maxKi: 30, stamina: 20, maxStamina: 30, level: 1, xp: 0, power: 12, defense: 3, invulnerable: 0 },
    x: 100, y: 110, faceX: 1, faceY: 0, moving: false, guard: false, attackTimer: 0, combo: 0, charge: 0, dashTimer: 0, scene: 'test', room: 0, ...extra,
});
const snapshot = (extra = {}) => ({
    scene: 'test', room: 0, time: 1, x: 100, y: 110, enemies: [], projectiles: [], palette: 'real', transitionTarget: null,
    transitionPalette: 'real', cutscene: 0, sceneTimer: 0, clearedRooms: [], areas: [], bosses: [], chapter: 1, rngSeed: 1, nextId: 1, ...extra,
});
describe('Wayside Fury bounded fusion state', () => {
    test('cached snapshots expire forms and cooldowns without mutating host data', () => {
        const raw = world();
        expect(elapsedFusionWorld(raw, 5).forms[0].remaining).toBe(7);
        expect(elapsedFusionWorld(raw, 12)).toMatchObject({ forms: [], cooldowns: { 0: 30, 1: 30 } });
        expect(elapsedFusionWorld(raw, 20)).toMatchObject({ forms: [], cooldowns: { 0: 22, 1: 22 } });
        expect(elapsedFusionWorld(raw, 100_000)).toMatchObject({ forms: [], cooldowns: { 0: 0, 1: 0 } });
        expect(raw).toEqual(world());
        for (const elapsed of [-1, Infinity, NaN]) expect(elapsedFusionWorld(raw, elapsed)).toBeNull();
    });
    test('defaults contain no active form and support two disjoint pairs', () => {
        expect(cleanFusionWorld(createFusionWorld())).toEqual({ nextId: 1, forms: [], cooldowns: {} });
        const two = world({ nextId: 3, forms: [form(), form({ id: 2, seats: [2, 3], heroes: ['alex', 'jon'] })] });
        expect(cleanFusionWorld(two)).toEqual(two);
        expect(cleanFusionWorld(world({ forms: [form({ mode: 'solo', seats: [0, 0] })] }))).not.toBeNull();
        expect(cleanFusionWorld(world({ forms: [form({ scene: 'arena' })] }))).not.toBeNull();
    });
    test.each([
        { nextId: 1 }, { nextId: Infinity }, { nextId: 100_000_001 },
        { cooldowns: { 4: 2 } }, { cooldowns: { 0: FUSION_COOLDOWN + 0.1 } }, { cooldowns: { 0: 1 } },
        { forms: [form({ id: 0 })] }, { forms: [form({ id: 2 })] }, { forms: [form({ seats: [1, 1] })] },
        { forms: [form({ seats: [1, 0] })] }, { forms: [form({ seats: [0, 4] })] },
        { forms: [form({ heroes: ['you', 'hacker'] })] }, { forms: [form({ mode: 'solo', seats: [0, 0], heroes: ['you', 'you'] })] },
        { forms: [form({ scene: 'hub' })] }, { forms: [form({ remaining: 0 })] }, { forms: [form({ remaining: 12.01 })] },
        { forms: [form({ remaining: NaN })] }, { forms: [form({ specialUsed: 1 })] },
        { nextId: 3, forms: [form(), form({ id: 2, seats: [1, 2] })] },
        { nextId: 3, forms: [form(), form({ seats: [2, 3] })] },
    ])('rejects malformed, overlapping or impossible forms: %j', extra => {
        expect(cleanFusionWorld(world(extra))).toBeNull();
    });
    test('allows bounded cooldowns for inactive seats and removes unrecognized local ledgers', () => {
        const raw = world({ cooldowns: { 2: 30 }, appliedIds: [1], forms: [form({ secret: 'local' })] });
        const clean = cleanFusionWorld(raw);
        expect(clean.cooldowns).toEqual({ 2: 30 }); expect(clean.appliedIds).toBeUndefined(); expect(clean.forms[0].secret).toBeUndefined();
    });
    test('old input and hero packets remain compatible, optional fusion fields are bounded', () => {
        const input = { x: 0, y: 0, attack: false, ki: false, dash: false, guard: false, swap: false, interact: false };
        expect(cleanInput(input)).toEqual(input); expect(cleanInput({ ...input, fusion: true }).fusion).toBe(true);
        expect(cleanInput({ ...input, fusion: 1 })).toBeNull();
        expect(cleanHero(hero())).not.toBeNull(); expect(cleanHero(hero({ fusionIntent: 1.25, fusionSpecial: 7 }))).toMatchObject({ fusionIntent: 1.25, fusionSpecial: 7 });
        for (const fusionIntent of [-0.1, 1.51, Infinity, '1']) expect(cleanHero(hero({ fusionIntent }))).toBeNull();
        for (const fusionSpecial of [-1, 1.2, 100_000_001]) expect(cleanHero(hero({ fusionSpecial }))).toBeNull();
    });
    test('optional host snapshots validate fusion state while preserving legacy worlds', () => {
        expect(cleanWorld(snapshot())).not.toBeNull();
        expect(cleanWorld(snapshot({ fusions: world() })).fusions).toEqual(world());
        expect(cleanWorld(snapshot({ fusions: world({ forms: [form({ remaining: 100 })] }) }))).toBeNull();
        expect(cleanWorld(snapshot({ fusions: world({ forms: [form({ room: 1 })] }) }))).toBeNull();
        expect(cleanWorld(snapshot({ fusions: world({ forms: [form({ scene: 'realm' })] }) }))).toBeNull();
    });
});
