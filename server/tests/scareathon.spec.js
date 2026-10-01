import { jest } from '@jest/globals';
import Fastify from 'fastify';

// The routes against a fake database: each test queues up the rows its queries return
const query = jest.fn();
const calendarSheet = jest.fn();
jest.unstable_mockModule('../db/mockDB.js', () => ({ default: { query } }));
jest.unstable_mockModule('../db/google-sheets.js', () => ({ default: calendarSheet }));
const { default: scareathonRoutes, importSheetHistory } = await import('../routes/scareathon.js');
const { awardWeeklyChallengePoint, currentSeason } = await import('../utils/scareathon.js');

const ADMIN = '11111111-1111-4111-8111-111111111111';
const ALICE = '22222222-2222-4222-8222-222222222222';

async function app() {
    const fastify = Fastify();
    fastify.decorateRequest('user', null);
    // Stands in for the JWT check: x-test-user is the signed-in player
    fastify.addHook('preValidation', async (request) => {
        const id = request.headers['x-test-user'];
        request.user = id ? { sub: id, email: `${id}@example.com` } : null;
    });
    fastify.register(scareathonRoutes, { prefix: '/scareathon' });
    await fastify.ready();
    return fastify;
}

const rows = (...list) => ({ rows: list });

beforeEach(() => {
    query.mockReset();
    calendarSheet.mockReset();
    process.env.ADMIN_USER_IDS = ADMIN;
});

describe('a player', () => {
    test('sees their watched days and points', async () => {
        query
            .mockResolvedValueOnce(rows({ day: 1 }, { day: 3 }))
            .mockResolvedValueOnce(rows({ category: 'weekly', points: 2 }, { category: 'bonus', points: 1 }, { category: 'movies', points: -1 }));
        const response = await (await app()).inject({ method: 'GET', url: '/scareathon/me', headers: { 'x-test-user': ALICE } });
        expect(response.json().data).toEqual({
            season: currentSeason(),
            watchedDays: [1, 3],
            points: { movies: 1, weekly: 2, bonus: 1, total: 4 },
            isAdmin: false,
        });
    });

    test('marks a day watched, for this season', async () => {
        query.mockResolvedValueOnce(rows()).mockResolvedValueOnce(rows({ day: 7 })).mockResolvedValueOnce(rows());
        const response = await (await app()).inject({ method: 'PUT', url: '/scareathon/watches/7', headers: { 'x-test-user': ALICE } });
        expect(response.statusCode).toBe(200);
        expect(query.mock.calls[0][0]).toMatch(/INSERT INTO scareathon_watches/);
        expect(query.mock.calls[0][1]).toEqual([ALICE, currentSeason(), 7]);
        expect(response.json().data.watchedDays).toEqual([7]);
    });

    test('unmarks a day', async () => {
        query.mockResolvedValueOnce(rows()).mockResolvedValueOnce(rows()).mockResolvedValueOnce(rows());
        const response = await (await app()).inject({ method: 'DELETE', url: '/scareathon/watches/7', headers: { 'x-test-user': ALICE } });
        expect(response.statusCode).toBe(200);
        expect(query.mock.calls[0][0]).toMatch(/DELETE FROM scareathon_watches/);
    });

    test('cannot mark a day that is not in October', async () => {
        const response = await (await app()).inject({ method: 'PUT', url: '/scareathon/watches/32', headers: { 'x-test-user': ALICE } });
        expect(response.statusCode).toBe(400);
        expect(query).not.toHaveBeenCalled();
    });

    test('cannot use the admin routes', async () => {
        const response = await (await app()).inject({
            method: 'POST', url: '/scareathon/admin/points', headers: { 'x-test-user': ALICE },
            payload: { username: 'alice', category: 'bonus', points: 5 },
        });
        expect(response.statusCode).toBe(403);
        expect(query).not.toHaveBeenCalled();
    });
});

describe('an admin', () => {
    test('awards bonus points by username', async () => {
        query.mockResolvedValueOnce(rows({ id: ALICE, username: 'Alice' })).mockResolvedValueOnce(rows({ id: '9' }));
        const response = await (await app()).inject({
            method: 'POST', url: '/scareathon/admin/points', headers: { 'x-test-user': ADMIN },
            payload: { username: 'alice', category: 'bonus', points: 1, reason: 'Halloween costume' },
        });
        expect(response.statusCode).toBe(201);
        expect(response.json().data).toMatchObject({ id: 9, username: 'Alice', category: 'bonus', points: 1 });
        expect(query.mock.calls[1][1]).toEqual([ALICE, currentSeason(), 'bonus', 1, 'Halloween costume', null, ADMIN]);
    });

    test('can take points away, but not zero or an unknown category', async () => {
        const server = await app();
        const post = payload => server.inject({ method: 'POST', url: '/scareathon/admin/points', headers: { 'x-test-user': ADMIN }, payload });
        expect((await post({ username: 'alice', category: 'bonus', points: 0 })).statusCode).toBe(400);
        expect((await post({ username: 'alice', category: 'costume', points: 1 })).statusCode).toBe(400);
        expect((await post({ username: 'alice', category: 'movies', points: 1.5 })).statusCode).toBe(400);
        expect(query).not.toHaveBeenCalled();

        query.mockResolvedValueOnce(rows({ id: ALICE, username: 'alice' })).mockResolvedValueOnce(rows({ id: '10' }));
        expect((await post({ username: 'alice', category: 'movies', points: -2 })).statusCode).toBe(201);
    });

    test('hears about a player who does not exist', async () => {
        query.mockResolvedValueOnce(rows());
        const response = await (await app()).inject({
            method: 'POST', url: '/scareathon/admin/points', headers: { 'x-test-user': ADMIN },
            payload: { username: 'nobody', category: 'bonus', points: 1 },
        });
        expect(response.statusCode).toBe(404);
    });

    test('removes a ledger entry', async () => {
        query.mockResolvedValueOnce(rows({ id: '4' }));
        const response = await (await app()).inject({ method: 'DELETE', url: '/scareathon/admin/points/4', headers: { 'x-test-user': ADMIN } });
        expect(response.statusCode).toBe(200);
        expect(query.mock.calls[0][1]).toEqual([4]);
    });
});

describe('weekly challenges', () => {
    const challenge = { documentId: 'week-40', title: 'Crypt crawl', points: 1 };

    test('count on the Scareboard in October, once', async () => {
        const db = { query: jest.fn(async () => rows({ id: '1' })) };
        await awardWeeklyChallengePoint(db, ALICE, challenge, new Date('2026-10-05T15:00:00Z'));
        expect(db.query.mock.calls[0][1]).toEqual([ALICE, 2026, 'weekly', 1, 'Weekly challenge: Crypt crawl', 'weekly_challenge:week-40', null]);
        expect(db.query.mock.calls[0][0]).toMatch(/ON CONFLICT .* DO NOTHING/s);
    });

    test('do not count outside October (Eastern time)', async () => {
        const db = { query: jest.fn(async () => rows()) };
        // 11pm October 31 in New York is already November in UTC
        await awardWeeklyChallengePoint(db, ALICE, challenge, new Date('2026-11-01T03:00:00Z'));
        expect(db.query).toHaveBeenCalledTimes(1);
        db.query.mockClear();
        await awardWeeklyChallengePoint(db, ALICE, challenge, new Date('2026-11-01T05:00:00Z'));
        expect(db.query).not.toHaveBeenCalled();
    });
});

describe('importing the sheet history', () => {
    const sheetRow = values => ({ get: key => values[key] });
    const sheet = (title, list) => ({ title, getRows: jest.fn(async () => list.map(sheetRow)) });

    test('copies Users-YYYY, Users-old (2021) and Winners, never account seasons', async () => {
        const tabs = [
            sheet('Calendar-2026', []),
            sheet('Users-2025', [{ name: 'Sam', movies: '10.0', weekly: '2', bonus: '', total: '12' }, { name: 'Sam', total: '1' }, { name: ' ' }]),
            sheet('Users-2026', [{ name: 'Nope', total: '3' }]),
            sheet('Users-old', [{ name: 'Old timer', total: '30' }]),
            sheet('Winners', [{ year: '2025', name: 'Sam' }, { year: '2026', name: 'Nope' }, { year: '2021', name: 'Old timer' }]),
        ];
        const doc = { sheetsByIndex: tabs, sheetsByTitle: Object.fromEntries(tabs.map(tab => [tab.title, tab])) };
        const db = { query: jest.fn(async () => rows()) };

        const result = await importSheetHistory(db, doc);

        expect(result).toEqual({ seasons: { 2025: 1, 2021: 1 }, winners: 2, skipped: ['Users-2025: duplicate name "Sam"'] });
        const inserts = db.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO scareathon_history')).map(([, params]) => params);
        expect(inserts).toEqual([[2025, 'Sam', 10, 2, null, 12], [2021, 'Old timer', null, null, null, 30]]);
        expect(db.query.mock.calls.at(-1)[0]).toBe('COMMIT');
    });

    test('is an admin button that reads the sheet with the server key', async () => {
        calendarSheet.mockResolvedValueOnce({ sheetsByIndex: [], sheetsByTitle: {} });
        query.mockResolvedValue(rows());
        const response = await (await app()).inject({ method: 'POST', url: '/scareathon/admin/import-history', headers: { 'x-test-user': ADMIN } });
        expect(response.statusCode).toBe(200);
        expect(response.json().data).toEqual({ seasons: {}, winners: 0, skipped: [] });
    });
});

test('the server creates the Scareboard tables from the migration at start', async () => {
    const { ensureScareathonTables } = await import('../utils/scareathon.js');
    const db = { query: jest.fn(async () => rows()) };
    await ensureScareathonTables(db);
    const sql = db.query.mock.calls.map(([q]) => q).find((q) => q.includes('CREATE TABLE'));
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.scareathon_watches/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.scareathon_points/);
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
});
