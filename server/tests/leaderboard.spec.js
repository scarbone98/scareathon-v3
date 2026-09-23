import { jest } from '@jest/globals';
import { deleteCachePrefix } from '../utils/cacheManager.js';

const calendarSheet = jest.fn();

jest.unstable_mockModule('../db/google-sheets.js', () => ({
    default: calendarSheet,
}));

const { getLeaderboardPayload } = await import('../routes/leaderboard.js');

function row(values) {
    return {
        get: (key) => values[key],
    };
}

describe('leaderboard helpers', () => {
    beforeEach(() => {
        calendarSheet.mockReset();
        deleteCachePrefix('leaderboard_');
    });

    afterEach(() => {
        deleteCachePrefix('leaderboard_');
    });

    test('returns the built leaderboard payload from the cache loader', async () => {
        const usersSheet = {
            title: 'Users-2025',
            getRows: jest.fn(async () => [
                row({ name: 'Sam', movies: '10.0', weekly: '2.0', bonus: '1.0', total: '13' }),
                row({ name: 'Alex', movies: '8', weekly: '4', bonus: '0', total: '12.0' }),
            ]),
        };
        const winnersSheet = {
            title: 'Winners',
            getRows: jest.fn(async () => [
                row({ year: '2024', name: 'Jordan' }),
            ]),
        };
        calendarSheet.mockResolvedValue({
            sheetsByTitle: {
                'Users-2025': usersSheet,
                Winners: winnersSheet,
            },
            sheetsByIndex: [usersSheet, winnersSheet],
        });

        await expect(getLeaderboardPayload({
            requestedYear: 2025,
            date: new Date('2026-05-23T12:00:00.000Z'),
        })).resolves.toEqual({
            data: [
                { name: 'Sam', movies: '10', weekly: '2', bonus: '1', total: '13', rank: 1 },
                { name: 'Alex', movies: '8', weekly: '4', bonus: '0', total: '12', rank: 2 },
            ],
            meta: {
                year: 2025,
                sheetTitle: 'Users-2025',
                isLive: false,
                isPreseason: false,
                availableYears: [2025],
            },
        });
    });
});

function seasonDoc({ include2026 = true, includeLegacy = false } = {}) {
    const historical = { title: 'Users-2025', getRows: jest.fn(async () => [row({ name: 'Last winner', total: '100' })]) };
    const upcoming = { title: 'Users-2026', getRows: jest.fn(async () => []) };
    const legacy = { title: 'Users', getRows: jest.fn(async () => [row({ name: 'Stale score', total: '999' })]) };
    const sheets = [historical, ...(include2026 ? [upcoming] : []), ...(includeLegacy ? [legacy] : [])];
    return { sheetsByTitle: Object.fromEntries(sheets.map(sheet => [sheet.title, sheet])), sheetsByIndex: sheets };
}

describe('Scareathon season availability', () => {
    beforeEach(() => {
        calendarSheet.mockReset();
        deleteCachePrefix('leaderboard_');
    });
    afterEach(() => deleteCachePrefix('leaderboard_'));

    test('defaults to the empty 2026 preseason in September without carrying over old scores', async () => {
        calendarSheet.mockResolvedValue(seasonDoc());
        const result = await getLeaderboardPayload({ date: new Date(2026, 8, 19, 12) });
        expect(result.data).toEqual([]);
        expect(result.meta).toEqual({ year: 2026, sheetTitle: 'Users-2026', isLive: false, isPreseason: true, availableYears: [2026, 2025] });
    });

    test('keeps historical seasons selectable during preseason', async () => {
        calendarSheet.mockResolvedValue(seasonDoc());
        const result = await getLeaderboardPayload({ requestedYear: 2025, date: new Date(2026, 8, 19, 12) });
        expect(result.meta).toMatchObject({ year: 2025, isLive: false, isPreseason: false, availableYears: [2026, 2025] });
        expect(result.data[0].name).toBe('Last winner');
    });

    test('does not advertise the next season before September', async () => {
        calendarSheet.mockResolvedValue(seasonDoc());
        const result = await getLeaderboardPayload({ date: new Date(2026, 7, 31, 12) });
        expect(result.meta).toMatchObject({ year: 2025, availableYears: [2025] });
    });

    test('switches from preseason to live on October 1 without reusing preseason cache', async () => {
        calendarSheet.mockResolvedValue(seasonDoc({ includeLegacy: true }));
        await getLeaderboardPayload({ date: new Date(2026, 8, 30, 12) });
        const result = await getLeaderboardPayload({ date: new Date(2026, 9, 1, 12) });
        expect(result.meta).toMatchObject({ year: 2026, sheetTitle: 'Users-2026', isLive: true, isPreseason: false });
        expect(result.data).toEqual([]);
    });

    test('marks the current season historical after October', async () => {
        calendarSheet.mockResolvedValue(seasonDoc());
        await getLeaderboardPayload({ date: new Date(2026, 9, 31, 12) });
        const result = await getLeaderboardPayload({ date: new Date(2026, 10, 1, 12) });
        expect(result.meta).toMatchObject({ year: 2026, isLive: false, isPreseason: false });
    });

    test('supports the legacy Users sheet when no year-specific live sheet exists', async () => {
        calendarSheet.mockResolvedValue(seasonDoc({ include2026: false, includeLegacy: true }));
        const result = await getLeaderboardPayload({ date: new Date(2026, 9, 1, 12) });
        expect(result.meta).toMatchObject({ year: 2026, sheetTitle: 'Users', isLive: true });
    });
});
