import { jest } from '@jest/globals';

jest.unstable_mockModule('../db/mockDB.js', () => ({ default: { query: jest.fn() } }));
const { RUNE_LETTERS, RUNE_REWARD, easternDay, redeemRune, runeCodeFor } = await import('../routes/wayside.js');

const ALICE = '22222222-2222-4222-8222-222222222222';
const at = new Date('2026-10-02T15:00:00Z');

describe('the rune tablet', () => {
    test('a code a day, six letters that all have runes', () => {
        const code = runeCodeFor('2026-10-02');
        expect(code).toMatch(new RegExp(`^[${RUNE_LETTERS}]{6}$`));
        expect(runeCodeFor('2026-10-02')).toBe(code);
        expect(runeCodeFor('2026-10-03')).not.toBe(code);
    });

    test('the day turns over at midnight Eastern', () => {
        expect(easternDay(new Date('2026-10-03T03:30:00Z'))).toBe('2026-10-02');
        expect(easternDay(new Date('2026-10-03T04:30:00Z'))).toBe('2026-10-03');
    });

    test("today's code pays out, in any case and with spaces", async () => {
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ coin_balance: 1300 }] }) };
        const code = runeCodeFor(easternDay(at)).toLowerCase().split('').join(' ');
        await expect(redeemRune(db, ALICE, code, at)).resolves.toEqual({ status: 'granted', reward: RUNE_REWARD, coinBalance: 1300 });
        expect(db.query.mock.calls[1][1]).toEqual([ALICE, RUNE_REWARD, 'daily_rune', '2026-10-02', JSON.stringify({ day: '2026-10-02' })]);
    });

    test('only once a day', async () => {
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ balance_after: 1300 }] }) };
        await expect(redeemRune(db, ALICE, runeCodeFor(easternDay(at)), at)).resolves.toEqual({ status: 'claimed', coinBalance: 1300 });
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test("yesterday's code, or a wrong one, pays nothing", async () => {
        const db = { query: jest.fn() };
        await expect(redeemRune(db, ALICE, runeCodeFor('2026-10-01'), at)).resolves.toEqual({ status: 'invalid' });
        await expect(redeemRune(db, ALICE, 'NOPE', at)).resolves.toEqual({ status: 'invalid' });
        expect(db.query).not.toHaveBeenCalled();
    });
});
