import { jest } from '@jest/globals';
import Fastify from 'fastify';
import { ARENA_COOP_GAME, ARENA_SOLO_GAME, arenaKillsThroughWave, arenaScore } from '../shared/waysideFury/u1Arena.js';

const awardEligibleWeeklyChallengeRewards = jest.fn(async () => []);
jest.unstable_mockModule('../routes/weeklyChallenges.js', () => ({ awardEligibleWeeklyChallengeRewards }));
const { default: gamesRoutes } = await import('../routes/games.js');

function scoreBody(mode = 'solo', waves = 5) {
    return {
        game: mode === 'solo' ? ARENA_SOLO_GAME : ARENA_COOP_GAME,
        metricName: 'score', metricValue: arenaScore(waves, arenaKillsThroughWave(waves)),
        arenaRun: { version: 1, mode, wavesCleared: waves, kills: arenaKillsThroughWave(waves), elapsedMs: 3000 + waves * 2000, players: mode === 'solo' ? 1 : 2 },
    };
}

function fakeDb({ recent = 0, paid = 0 } = {}) {
    const client = {
        query: jest.fn(async (sql, params) => {
            if (/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE SAVEPOINT)/.test(sql)) return { rows: [] };
            if (sql.includes('SELECT id FROM games')) return { rows: [{ id: 77 }] };
            if (sql.includes('COUNT(*)::int AS count')) return { rows: [{ count: recent }] };
            if (sql.includes('INSERT INTO leaderboards')) return { rows: [{ id: 100, game_id: 77, metric_value: params[3] }] };
            if (sql.includes('FROM arcade_reward_rules')) return {
                rows: [{ id: 1, reward_type: 'fixed', fixed_amount: 17, min_metric_value: 0, max_reward: null }],
            };
            if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
            if (sql.includes('SUM(amount)')) return { rows: [{ paid }] };
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
    test.each(['solo', 'coop'])('%s scores use the capped Arcade ticket payout', async (mode) => {
        const db = fakeDb();
        const app = await service(db);
        try {
            const response = await app.inject({ method: 'POST', url: '/games/submitScore', payload: scoreBody(mode) });
            expect(response.statusCode).toBe(200);
            expect(response.json().data).toMatchObject({ metric_value: 9500, coinsAwarded: 5, coinBalance: 117, weeklyChallengeRewards: [] });
            const sql = db.client.query.mock.calls.map(([query]) => query).join('\n');
            expect(sql).toContain('INSERT INTO leaderboards');
            expect(sql).toContain('COMMIT');
            expect(sql).not.toContain('arcade_reward_rules');
            expect(sql).toContain('currency_transactions');
            expect(sql).toContain('grant_currency');
            expect(db.client.query.mock.calls.find(([query]) => query.includes('grant_currency'))[1][1]).toBe(5);
            expect(awardEligibleWeeklyChallengeRewards).toHaveBeenCalledTimes(1);
            expect(db.client.release).toHaveBeenCalledTimes(1);
        } finally { await app.close(); }
    });

    test.each([[0,50], [300,25], [1000,0]])('long runs at %i paid today award %i tickets', async (paid, expected) => {
        const db = fakeDb({ paid }), app = await service(db);
        try {
            const response = await app.inject({ method: 'POST', url: '/games/submitScore', payload: scoreBody('solo', 100) });
            expect(response.statusCode).toBe(200);
            expect(response.json().data.coinsAwarded).toBe(expected);
            const grants = db.client.query.mock.calls.filter(([sql]) => sql.includes('grant_currency'));
            expect(grants.length).toBe(expected ? 1 : 0);
            if (expected) expect(grants[0][1][1]).toBe(expected);
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
            const response = await app.inject({ method: 'POST', url: '/games/submitScore', payload: { game: '8 Bit Evil', metricName: 'score', metricValue: 1000 } });
            expect(response.statusCode).toBe(200);
            expect(response.json().data).toMatchObject({ coinsAwarded: 17, coinBalance: 117 });
            expect(db.client.query.mock.calls.some(([query]) => query.includes('grant_currency'))).toBe(true);
            expect(awardEligibleWeeklyChallengeRewards).toHaveBeenCalledTimes(1);
        } finally { await app.close(); }
    });
});
