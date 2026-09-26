import { parseSaveRequest } from '../routes/mysteryCrypt.js';
import { MAX_MONSTERS, progressScore, sanitizeSave } from '../shared/mysteryCrypt/save.js';

const hero = (level = 1) => ({ level, xp: 0, moves: ['claw'] });

function validSave(extra = {}) {
    return {
        version: 1,
        hero: 'jon',
        heroes: { joe: hero(), matt: hero(), alex: hero(), jon: hero(7) },
        monsters: [
            { uid: 1, kind: 'rat', level: 3, xp: 20, moves: ['claw'] },
            { uid: 2, kind: 'ghost', level: 9, xp: 0, moves: ['wisp', 'lightning'] },
        ],
        team: [2],
        nextUid: 3,
        candy: 450,
        bag: ['heart', 'elixir'],
        cleared: 2,
        best: [3, 4, 2],
        submitted: 0,
        ...extra,
    };
}

describe('Mystery Crypt saves', () => {
    test('accept a valid save and drop unknown fields', () => {
        const { save, error } = sanitizeSave({ ...validSave(), cheat: true });
        expect(error).toBeUndefined();
        expect(save).toEqual(validSave());
    });

    test.each([
        ['an unknown hero', { hero: 'bob' }],
        ['an unknown monster', { monsters: [{ uid: 1, kind: 'dragon', level: 1, xp: 0, moves: [] }], team: [] }],
        ['an unknown move', { monsters: [{ uid: 1, kind: 'rat', level: 1, xp: 0, moves: ['hyperbeam'] }], team: [] }],
        ['five moves', { monsters: [{ uid: 1, kind: 'rat', level: 1, xp: 0, moves: ['claw', 'acid', 'wisp', 'fireball', 'lightning'] }], team: [] }],
        ['a team member you don\'t have', { team: [9] }],
        ['a team of four', { team: [1, 2, 3, 4] }],
        ['a repeated uid', { monsters: [{ uid: 1, kind: 'rat', level: 1, xp: 0, moves: [] }, { uid: 1, kind: 'imp', level: 1, xp: 0, moves: [] }], team: [] }],
        ['a uid past nextUid', { nextUid: 2 }],
        ['negative candy', { candy: -5 }],
        ['a level of 0', { heroes: { ...validSave().heroes, joe: hero(0) } }],
        ['an unknown item', { bag: ['nuke'] }],
        ['too many monsters', { monsters: Array.from({ length: MAX_MONSTERS + 1 }, (_, i) => ({ uid: i + 1, kind: 'rat', level: 1, xp: 0, moves: [] })), team: [], nextUid: MAX_MONSTERS + 5 }],
    ])('reject %s', (_, change) => {
        expect(sanitizeSave(validSave(change)).error).toBeDefined();
    });

    test('rank stages cleared first, then depth, then collection size', () => {
        const base = validSave();
        expect(progressScore(base)).toBe(2 * 100_000 + 2 * 1_000 + 2);
        expect(progressScore(validSave({ cleared: 3, best: [3, 4, 5, 0] }))).toBeGreaterThan(progressScore(validSave({ best: [3, 4, 9] })));
    });

    test('a save request needs a revision (or null) and a valid save', () => {
        expect(parseSaveRequest({ save: validSave(), revision: null }).error).toBeUndefined();
        expect(parseSaveRequest({ save: validSave(), revision: 4 }).revision).toBe(4);
        expect(parseSaveRequest({ save: validSave(), revision: 0 }).error).toMatch(/revision/);
        expect(parseSaveRequest({ save: { version: 2 }, revision: null }).error).toMatch(/version/);
        expect(parseSaveRequest({ save: { junk: 'x'.repeat(50_000) }, revision: null }).error).toMatch(/large/);
    });
});
