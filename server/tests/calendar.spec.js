import { jest } from '@jest/globals';

const calendarSheet = jest.fn();
jest.unstable_mockModule('../db/google-sheets.js', () => ({ default: calendarSheet }));

const { loadCalendarData } = await import('../routes/calendar.js');

function makeRows() {
    return Array.from({ length: 31 }, (_, index) => ({
        get: key => ({
            day: String(index + 1),
            title: `Movie ${index + 1}`,
            theme: 'Test theme',
            lowResUrl: ''
        })[key]
    }));
}

test('reads all 31 days from the selected year by day number', async () => {
    const rows = makeRows().reverse();
    calendarSheet.mockResolvedValueOnce({
        sheetsByTitle: {
            'Calendar-2027': { getRows: jest.fn(async () => rows) },
            'Calendar-2026': { getRows: jest.fn(() => { throw new Error('wrong tab'); }) }
        }
    });

    const data = await loadCalendarData(2027);
    expect(data).toHaveLength(32);
    expect(data[1]).toMatchObject({ day: 1, title: 'Movie 1', theme: 'Test theme' });
    expect(data[31]).toMatchObject({ day: 31, title: 'Movie 31' });
});

test('rejects an incomplete calendar', async () => {
    calendarSheet.mockResolvedValueOnce({
        sheetsByTitle: { 'Calendar-2026': { getRows: jest.fn(async () => makeRows().slice(0, 30)) } }
    });

    await expect(loadCalendarData(2026)).rejects.toThrow('one movie for every day');
});
