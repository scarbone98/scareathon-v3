import { jest } from '@jest/globals';

jest.unstable_mockModule('../db/mockDB.js', () => ({ default: { query: jest.fn() } }));
const { RUNE_LETTERS, RUNE_REWARD, easternDay, redeemRune, runeCodeFor, DISPENSER_DAILY_WINS, DISPENSER_GOLDEN, forgetKnocks, knockDispenser, rollDispenser } = await import('../routes/wayside.js');

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

describe('the ticket dispenser', () => {
    beforeEach(() => forgetKnocks());

    test('mostly nothing, sometimes a ticket, rarely a golden one', () => {
        expect(rollDispenser(() => 0.01)).toEqual({ kind: 'golden', tickets: DISPENSER_GOLDEN });
        expect(rollDispenser(() => 0.2)).toEqual({ kind: 'ticket', tickets: 1 });
        expect(rollDispenser(() => 0.9)).toEqual({ kind: 'nothing', tickets: 0 });
    });

    test('a win pays out', async () => {
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ count: 0 }] }).mockResolvedValueOnce({ rows: [{ coin_balance: 501 }] }) };
        await expect(knockDispenser(db, ALICE, { now: 1e6, random: () => 0.2 })).resolves.toEqual({ status: 'ticket', tickets: 1, coinBalance: 501 });
        expect(db.query.mock.calls[1][1].slice(0, 3)).toEqual([ALICE, 1, 'dispenser_knock']);
    });

    test('knocking again straight away rolls nothing', async () => {
        const db = { query: jest.fn().mockResolvedValue({ rows: [{ count: 0, coin_balance: 1 }] }) };
        await knockDispenser(db, ALICE, { now: 1e6, random: () => 0.2 });
        db.query.mockClear();
        await expect(knockDispenser(db, ALICE, { now: 1e6 + 1000, random: () => 0.01 })).resolves.toEqual({ status: 'nothing' });
        expect(db.query).not.toHaveBeenCalled();
    });

    test("no more once the day's wins are used up", async () => {
        const db = { query: jest.fn().mockResolvedValueOnce({ rows: [{ count: DISPENSER_DAILY_WINS }] }) };
        await expect(knockDispenser(db, ALICE, { now: 1e6, random: () => 0.01 })).resolves.toEqual({ status: 'nothing' });
        expect(db.query).toHaveBeenCalledTimes(1);
    });
});
