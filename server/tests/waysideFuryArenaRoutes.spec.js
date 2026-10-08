import { jest } from '@jest/globals';
import Fastify from 'fastify';
import { ARENA_COOP_GAME, ARENA_SOLO_GAME } from '../shared/waysideFury/u1Arena.js';

const awardEligibleWeeklyChallengeRewards = jest.fn(async () => []);
jest.unstable_mockModule('../routes/weeklyChallenges.js', () => ({ awardEligibleWeeklyChallengeRewards }));
const { default: gamesRoutes } = await import('../routes/games.js');

function scoreBody(mode = 'solo') {
    return {
        game: mode === 'solo' ? ARENA_SOLO_GAME : ARENA_COOP_GAME,
        metricName: 'score', metricValue: 1500,
        arenaRun: { version: 1, mode, wavesCleared: 1, kills: 5, elapsedMs: 5000, players: mode === 'solo' ? 1 : 2 },
    };
}

function fakeDb({ recent = 0 } = {}) {
    const client = {
        query: jest.fn(async (sql, params) => {
            if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE SAVEPOINT)/.test(sql)) return { rows: [] };
            if (sql.includes('SELECT id FROM games')) return { rows: [{ id: 77 }] };
            if (sql.includes('COUNT(*)::int AS count')) return { rows: [{ count: recent }] };
            if (sql.includes('INSERT INTO leaderboards')) return { rows: [{ id: 100, game_id: 77, metric_value: params[3] }] };
            if (sql.includes('FROM arcade_reward_rules')) return {
                rows: [{ id: 1, reward_type: 'fixed', fixed_amount: 17, min_metric_value: 0, max_reward: null }],
            };
            if (sql.includes('public.grant_currency')) return { rows: [{ coin_balance: 117 }] };
            throw new Error(`Unexpected query: ${sql}`);
        }),
        release: jest.fn(),
    };
    return { client, connect: jest.fn(async () => client) };
}

async function service(db) {
    const app = Fastify();
    app.addHook('preHandler', async (request) => { request.user = { sub: 'arena-player' }; });
    await app.register(gamesRoutes, { prefix: '/games', db });
    return app;
}

beforeEach(() => { awardEligibleWeeklyChallengeRewards.mockClear(); });

// Fastify loads its HTTP injection runtime lazily; warm it outside feature tests.
beforeAll(async () => {
    const app = Fastify();
    app.get('/ready', async () => ({ ready: true }));
    try { await app.inject({ method: 'GET', url: '/ready' }); }
    finally { await app.close(); }
}, 30_000);

describe('Arcade tournament submission route', () => {
    test.each(['solo', 'coop'])('%s scores use Arcade storage but never grant any tickets', async (mode) => {
        const db = fakeDb();
        const app = await service(db);
        try {
            const response = await app.inject({ method: 'POST', url: '/games/submitScore', payload: scoreBody(mode) });
            expect(response.statusCode).toBe(200);
            expect(response.json().data).toMatchObject({ metric_value: 1500, coinsAwarded: 0, coinBalance: null, weeklyChallengeRewards: [] });
            const sql = db.client.query.mock.calls.map(([query]) => query).join('\n');
            expect(sql).toContain('INSERT INTO leaderboards');
            expect(sql).toContain('COMMIT');
            expect(sql).not.toContain('arcade_reward_rules');
            expect(sql).not.toContain('currency_transactions');
            expect(sql).not.toContain('grant_currency');
            expect(awardEligibleWeeklyChallengeRewards).not.toHaveBeenCalled();
            expect(db.client.release).toHaveBeenCalledTimes(1);
        } finally { await app.close(); }
    });

    test('rejects a forged arena receipt before creating a leaderboard entry', async () => {
        const db = fakeDb();
        const app = await service(db);
        try {
            const body = scoreBody();
            body.metricValue = 99_999;
            const response = await app.inject({ method: 'POST', url: '/games/submitScore', payload: body });
            expect(response.statusCode).toBe(400);
            expect(db.client.query).not.toHaveBeenCalled();
            expect(db.client.release).toHaveBeenCalledTimes(1);
        } finally { await app.close(); }
    });

    test('keeps the existing Arcade per-player submission rate limit', async () => {
        const db = fakeDb({ recent: 20 });
        const app = await service(db);
        try {
            const response = await app.inject({ method: 'POST', url: '/games/submitScore', payload: scoreBody() });
            expect(response.statusCode).toBe(429);
            expect(db.client.query.mock.calls.some(([query]) => query.includes('INSERT INTO leaderboards'))).toBe(false);
            expect(db.client.query).toHaveBeenLastCalledWith('ROLLBACK');
        } finally { await app.close(); }
    });

    test('keeps rule and weekly rewards available to ordinary Arcade scores', async () => {
        const db = fakeDb();
        const app = await service(db);
        try {
            const response = await app.inject({ method: 'POST', url: '/games/submitScore', payload: { game: 'Wayside Fury', metricName: 'score', metricValue: 1000 } });
            expect(response.statusCode).toBe(200);
            expect(response.json().data).toMatchObject({ coinsAwarded: 17, coinBalance: 117 });
            expect(db.client.query.mock.calls.some(([query]) => query.includes('grant_currency'))).toBe(true);
            expect(awardEligibleWeeklyChallengeRewards).toHaveBeenCalledTimes(1);
        } finally { await app.close(); }
    });
});
