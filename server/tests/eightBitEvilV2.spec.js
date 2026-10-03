import fastify from 'fastify';
import { jest } from '@jest/globals';

const query = jest.fn();
jest.unstable_mockModule('../db/mockDB.js', () => ({ default: { query } }));

const { default: routes, sanitizeV2Save } = await import('../routes/8bitevilreturnsV2.js');
const { isPublicRoute } = await import('../utils/authRoutes.js');

const userId = '11111111-1111-4111-8111-111111111111';
const goodSave = {
    version: 1, silver: 120, best: 300, selected: 'joe', stage: 'graveyard',
    unlocked: ['pumpkin_bomb'], feats: ['survive_5'], evolved: [], seen: ['claw'],
    powerups: { might: 2 }, totals: { kills: 400, runs: 3 }, kinds: { zombie: 200 },
};

describe('8 Bit Evil Returns V2 save', () => {
    let app;

    beforeAll(async () => {
        app = fastify();
        app.decorateRequest('user', null);
        app.addHook('preHandler', async (request) => { request.user = { sub: userId }; });
        app.register(routes, { prefix: '/8bitevilreturns/v2' });
        await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => query.mockReset());

    test('needs a login, unlike the Unity game routes', () => {
        expect(isPublicRoute('GET', '/8bitevilreturns/v2/save')).toBe(false);
        expect(isPublicRoute('PUT', '/8bitevilreturns/v2/save')).toBe(false);
        expect(isPublicRoute('GET', '/8bitevilreturns/getUserData')).toBe(true);
    });

    test('sanitizer keeps known fields and refuses junk', () => {
        expect(sanitizeV2Save({ ...goodSave, extra: 'dropped' }).save).toEqual(goodSave);
        expect(sanitizeV2Save({ ...goodSave, silver: -5 }).error).toBeTruthy();
        expect(sanitizeV2Save({ ...goodSave, unlocked: ['<script>'] }).error).toBeTruthy();
        expect(sanitizeV2Save({ ...goodSave, kinds: { zombie: 1.5 } }).error).toBeTruthy();
        expect(sanitizeV2Save({ ...goodSave, seen: Array(600).fill('a') }).error).toBeTruthy();
    });

    test('GET returns an empty save for a new player', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 7 }] }).mockResolvedValueOnce({ rows: [] });
        const res = await app.inject({ method: 'GET', url: '/8bitevilreturns/v2/save' });
        expect(res.json()).toEqual({ save: null, revision: null });
        expect(query.mock.calls[1][1]).toEqual([userId, 7, 'v2Save']);
    });

    test('first PUT inserts revision 1', async () => {
        query.mockResolvedValueOnce({ rows: [{ id: 7 }] }).mockResolvedValueOnce({ rows: [{ revision: 1 }] });
        const res = await app.inject({ method: 'PUT', url: '/8bitevilreturns/v2/save', payload: { save: goodSave, revision: null } });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ revision: 1 });
        expect(query.mock.calls[1][0]).toContain('INSERT INTO game_specific_data');
    });

    test('a stale revision gets 409 with the newer save', async () => {
        query
            .mockResolvedValueOnce({ rows: [{ id: 7 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ data: { save: { ...goodSave, silver: 999 }, revision: 4 } }] });
        const res = await app.inject({ method: 'PUT', url: '/8bitevilreturns/v2/save', payload: { save: goodSave, revision: 2 } });
        expect(res.statusCode).toBe(409);
        expect(res.json().revision).toBe(4);
        expect(res.json().save.silver).toBe(999);
    });

    test('rejects a bad save without touching the database', async () => {
        const res = await app.inject({ method: 'PUT', url: '/8bitevilreturns/v2/save', payload: { save: { silver: 'lots' }, revision: null } });
        expect(res.statusCode).toBe(400);
        expect(query).not.toHaveBeenCalled();
    });
});
