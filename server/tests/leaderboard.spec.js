import { jest } from '@jest/globals';
import { deleteCachePrefix } from '../utils/cacheManager.js';

jest.unstable_mockModule('../db/mockDB.js', () => ({ default: { query: jest.fn() } }));
const { getLeaderboardPayload, getPastWinners } = await import('../routes/leaderboard.js');

// A fake database: sheet-era history and winners, and account tallies per season
function fakeDb({ history = {}, winners = [], accounts = {} } = {}) {
    return {
        query: jest.fn(async (sql, params = []) => {
            if (sql.includes('SELECT DISTINCT season FROM scareathon_history')) {
                return { rows: Object.keys(history).map(season => ({ season: Number(season) })).sort((a, b) => b.season - a.season) };
            }
            if (sql.includes('FROM scareathon_history')) {
                return { rows: history[params[0]] || [] };
            }
            if (sql.includes('FROM scareathon_winners')) {
                return { rows: winners.filter(winner => winner.season <= params[0]) };
            }
            if (sql.includes('WITH tallies')) {
                return { rows: accounts[params[0]] || [] };
            }
            throw new Error(`Unexpected query: ${sql}`);
        }),
    };
}

const history2025 = [
    { name: 'Sam', movies: '10', weekly: '2', bonus: '1', total: '13' },
    { name: 'Alex', movies: '8', weekly: '4', bonus: '0', total: '12' },
];

beforeEach(() => {
    deleteCachePrefix('leaderboard_');
    deleteCachePrefix('pastWinners_');
});

describe('sheet-era seasons', () => {
    test('read from the imported history, ranked by total', async () => {
        const result = await getLeaderboardPayload({
            requestedYear: 2025,
            date: new Date(2026, 4, 23, 12),
            db: fakeDb({ history: { 2025: history2025 } }),
        });
        expect(result).toEqual({
            data: [
                { name: 'Sam', movies: 10, weekly: 2, bonus: 1, total: 13, rank: 1 },
                { name: 'Alex', movies: 8, weekly: 4, bonus: 0, total: 12, rank: 2 },
            ],
            meta: { year: 2025, source: 'history', isLive: false, isPreseason: false, availableYears: [2025] },
        });
    });

    test('ties share a rank', async () => {
        const result = await getLeaderboardPayload({
            requestedYear: 2024,
            date: new Date(2026, 4, 23, 12),
            db: fakeDb({ history: { 2024: [{ name: 'A', total: '5' }, { name: 'B', total: '5' }, { name: 'C', total: '3' }] } }),
        });
        expect(result.data.map(user => [user.name, user.rank])).toEqual([['A', 1], ['B', 1], ['C', 2]]);
    });
});

describe('account seasons', () => {
    const db = () => fakeDb({
        history: { 2025: history2025 },
        accounts: { 2026: [
            { username: 'ghoul', movies: 3, weekly: 1, bonus: 0 },
            { username: 'wraith', movies: 5, weekly: 0, bonus: 1 },
            { username: 'undone', movies: 0, weekly: 0, bonus: 0 },
        ] },
    });

    test('the empty 2026 preseason is the default in September, with history selectable', async () => {
        const result = await getLeaderboardPayload({ date: new Date(2026, 8, 19, 12), db: fakeDb({ history: { 2025: history2025 } }) });
        expect(result.data).toEqual([]);
        expect(result.meta).toEqual({ year: 2026, source: 'accounts', isLive: false, isPreseason: true, availableYears: [2026, 2025] });
    });

    test('does not advertise the next season before September', async () => {
        const result = await getLeaderboardPayload({ date: new Date(2026, 7, 31, 12), db: db() });
        expect(result.meta).toMatchObject({ year: 2025, availableYears: [2025] });
    });

    test('live in October: movies + weekly + bonus, players with nothing left off', async () => {
        const result = await getLeaderboardPayload({ date: new Date(2026, 9, 2, 12), db: db() });
        expect(result.meta).toMatchObject({ year: 2026, source: 'accounts', isLive: true, isPreseason: false });
        expect(result.data).toEqual([
            { name: 'wraith', movies: 5, weekly: 0, bonus: 1, total: 6, rank: 1 },
            { name: 'ghoul', movies: 3, weekly: 1, bonus: 0, total: 4, rank: 2 },
        ]);
    });

    test('an unknown year falls back to the newest season', async () => {
        const result = await getLeaderboardPayload({ requestedYear: 1999, date: new Date(2026, 9, 2, 12), db: db() });
        expect(result.meta.year).toBe(2026);
    });

    test('historical after October', async () => {
        const result = await getLeaderboardPayload({ date: new Date(2026, 10, 1, 12), db: db() });
        expect(result.meta).toMatchObject({ year: 2026, isLive: false, isPreseason: false });
    });
});

describe('past winners', () => {
    const winners = [{ season: 2024, name: 'Jordan' }, { season: 2025, name: 'Sam' }];
    const accounts = { 2026: [{ username: 'wraith', movies: 9, weekly: 0, bonus: 0 }, { username: 'ghoul', movies: 2, weekly: 0, bonus: 0 }] };

    test('sheet winners, without this season while it is running', async () => {
        const result = await getPastWinners({ date: new Date(2026, 9, 15, 12), db: fakeDb({ winners, accounts }) });
        expect(result).toEqual([{ year: '2025', name: 'Sam' }, { year: '2024', name: 'Jordan' }]);
    });

    test('an account season crowns its leader once October is over', async () => {
        const result = await getPastWinners({ date: new Date(2026, 10, 2, 12), db: fakeDb({ winners, accounts }) });
        expect(result[0]).toEqual({ year: '2026', name: 'wraith' });
        expect(result).toHaveLength(3);
    });
});
