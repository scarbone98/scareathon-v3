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
                availableYears: [2025],
            },
        });
    });
});
