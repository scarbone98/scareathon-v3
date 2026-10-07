import { jest } from '@jest/globals';
import Fastify from 'fastify';

// Agent keys against a fake database: each test queues up the rows its queries return
const query = jest.fn();
const calendarSheet = jest.fn();
jest.unstable_mockModule('../db/mockDB.js', () => ({ default: { query } }));
jest.unstable_mockModule('../db/google-sheets.js', () => ({ default: calendarSheet }));
const {
    AGENT_TOKEN_PREFIX,
    authenticateAgent,
    hashAgentToken,
    isAgentRouteAllowed,
    isAgentToken,
    isRateLimited,
    latestUnlockedDay,
    newAgentToken,
    resetRateLimits,
} = await import('../utils/agentTokens.js');
const { default: agentTokenRoutes } = await import('../routes/agentTokens.js');
const { default: scareathonRoutes } = await import('../routes/scareathon.js');
const { isAdminUser } = await import('../routes/inbox.js');

const ALICE = '22222222-2222-4222-8222-222222222222';
const rows = (...list) => ({ rows: list });

// The real agent branch of the auth hook; x-test-user stands in for a Supabase session
async function app() {
    const fastify = Fastify();
    fastify.decorateRequest('user', null);
    fastify.addHook('preValidation', async (request, reply) => {
        const auth = request.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
        if (isAgentToken(token)) {
            await authenticateAgent({ query }, request, reply, token);
            return;
        }
        const id = request.headers['x-test-user'];
        request.user = id ? { sub: id, email: `${id}@example.com` } : null;
    });
    fastify.register(agentTokenRoutes);
    fastify.register(scareathonRoutes, { prefix: '/scareathon' });
    await fastify.ready();
    return fastify;
}

const agentKey = `${AGENT_TOKEN_PREFIX}test-key`;
const asAgent = { authorization: `Bearer ${agentKey}` };
const keyRow = rows({ id: 9, user_id: ALICE, name: 'Claude' });

beforeEach(() => {
    query.mockReset();
    calendarSheet.mockReset();
    resetRateLimits();
    process.env.ADMIN_USER_IDS = ALICE;
});

describe('agent keys', () => {
    test('are long, random, and only stored as a hash', () => {
        const a = newAgentToken();
        const b = newAgentToken();
        expect(a.token.startsWith(AGENT_TOKEN_PREFIX)).toBe(true);
        expect(a.token.length).toBeGreaterThan(40);
        expect(a.token).not.toBe(b.token);
        expect(a.tokenHash).toBe(hashAgentToken(a.token));
        expect(a.tokenHash).not.toContain(a.token);
        expect(a.hint).toBe(a.token.slice(-4));
    });

    test('reach only the allowlisted routes', () => {
        expect(isAgentRouteAllowed('GET', '/calendar')).toBe(true);
        expect(isAgentRouteAllowed('GET', '/calendar/6')).toBe(true);
        expect(isAgentRouteAllowed('GET', '/scareathon/me')).toBe(true);
        expect(isAgentRouteAllowed('PUT', '/scareathon/watches/6')).toBe(true);
        expect(isAgentRouteAllowed('DELETE', '/scareathon/watches/6')).toBe(true);
        expect(isAgentRouteAllowed('GET', '/leaderboard?year=2025')).toBe(true);

        expect(isAgentRouteAllowed('POST', '/scareathon/admin/points')).toBe(false);
        expect(isAgentRouteAllowed('GET', '/scareathon/admin/points')).toBe(false);
        expect(isAgentRouteAllowed('POST', '/games/submitScore')).toBe(false);
        expect(isAgentRouteAllowed('POST', '/marketplace/buy')).toBe(false);
        expect(isAgentRouteAllowed('POST', '/agent-tokens')).toBe(false);
        expect(isAgentRouteAllowed('POST', '/wayside/codes/redeem')).toBe(false);
        expect(isAgentRouteAllowed('GET', '/admin/strapi/anything')).toBe(false);
    });

    test('unlock nights as they come, Eastern time', () => {
        expect(latestUnlockedDay(new Date('2026-09-30T12:00:00Z'))).toBe(0);
        expect(latestUnlockedDay(new Date('2026-10-01T03:59:00Z'))).toBe(0); // still Sep 30 in New York
        expect(latestUnlockedDay(new Date('2026-10-06T16:00:00Z'))).toBe(6);
        expect(latestUnlockedDay(new Date('2026-10-07T02:00:00Z'))).toBe(6); // 10 pm on the 6th in New York
        expect(latestUnlockedDay(new Date('2026-11-02T12:00:00Z'))).toBe(31);
    });

    test('are rate limited per key', () => {
        const now = 1_000_000;
        for (let i = 0; i < 3; i++) expect(isRateLimited('k', now + i, 3)).toBe(false);
        expect(isRateLimited('k', now + 4, 3)).toBe(true);
        expect(isRateLimited('k', now + 61_000, 3)).toBe(false);
    });

    test('never make an agent an admin, even an admin\'s', () => {
        expect(isAdminUser({ sub: ALICE })).toBe(true);
        expect(isAdminUser({ sub: ALICE, agent: true })).toBe(false);
    });
});

describe('an agent', () => {
    test('is refused off the allowlist before the key is even looked up', async () => {
        const response = await (await app()).inject({
            method: 'POST', url: '/scareathon/admin/points', headers: asAgent,
            payload: { username: 'alice', category: 'bonus', points: 5 },
        });
        expect(response.statusCode).toBe(403);
        expect(query).not.toHaveBeenCalled();
    });

    test('with a revoked or unknown key is turned away', async () => {
        query.mockResolvedValueOnce(rows());
        const response = await (await app()).inject({ method: 'GET', url: '/scareathon/me', headers: asAgent });
        expect(response.statusCode).toBe(401);
        expect(query.mock.calls[0][1]).toEqual([hashAgentToken(agentKey)]);
    });

    test('reads its player\'s season, never as an admin', async () => {
        query
            .mockResolvedValueOnce(keyRow)
            .mockResolvedValueOnce(rows({ day: 1 }))
            .mockResolvedValueOnce(rows());
        const response = await (await app()).inject({ method: 'GET', url: '/scareathon/me', headers: asAgent });
        expect(response.statusCode).toBe(200);
        expect(response.json().data.watchedDays).toEqual([1]);
        expect(response.json().data.isAdmin).toBe(false);
    });

    // These follow the real clock (faking Date stalls fastify's inject), so they hold year-round
    const latest = latestUnlockedDay();

    (latest >= 1 ? test : test.skip)('marks a night that has come', async () => {
        query
            .mockResolvedValueOnce(keyRow)
            .mockResolvedValueOnce(rows())
            .mockResolvedValueOnce(rows({ day: latest }))
            .mockResolvedValueOnce(rows());
        const response = await (await app()).inject({ method: 'PUT', url: `/scareathon/watches/${latest}`, headers: asAgent });
        expect(response.statusCode).toBe(200);
        expect(query.mock.calls[1][0]).toMatch(/INSERT INTO scareathon_watches/);
        expect(query.mock.calls[1][1][2]).toBe(latest);
    });

    (latest < 31 ? test : test.skip)('cannot mark a night that hasn\'t come yet', async () => {
        query.mockResolvedValueOnce(keyRow);
        const response = await (await app()).inject({ method: 'PUT', url: `/scareathon/watches/${latest + 1}`, headers: asAgent });
        expect(response.statusCode).toBe(403);
        expect(query).toHaveBeenCalledTimes(1);
    });

    test('cannot make more agent keys', async () => {
        const response = await (await app()).inject({ method: 'POST', url: '/agent-tokens', headers: asAgent, payload: { name: 'sneaky' } });
        expect(response.statusCode).toBe(403);
        expect(query).not.toHaveBeenCalled();
    });

    test('learns whose key it is', async () => {
        query.mockResolvedValueOnce(keyRow).mockResolvedValueOnce(rows({ username: 'alice' }));
        const response = await (await app()).inject({ method: 'GET', url: '/agent/whoami', headers: asAgent });
        expect(response.json().data).toEqual({ username: 'alice', key: 'Claude' });
    });
});

describe('a player', () => {
    test('makes a key and sees it once', async () => {
        query
            .mockResolvedValueOnce(rows({ count: 0 }))
            .mockResolvedValueOnce(rows({ id: 3, name: 'Claude', hint: 'abcd', created_at: 'now', last_used_at: null }));
        const response = await (await app()).inject({ method: 'POST', url: '/agent-tokens', headers: { 'x-test-user': ALICE }, payload: { name: ' Claude ' } });
        expect(response.statusCode).toBe(201);
        const { data } = response.json();
        expect(data.token.startsWith(AGENT_TOKEN_PREFIX)).toBe(true);
        const [, params] = query.mock.calls[1];
        expect(params[0]).toBe(ALICE);
        expect(params[1]).toBe('Claude');
        expect(params[2]).toBe(hashAgentToken(data.token));
    });

    test('can hold only so many keys', async () => {
        query.mockResolvedValueOnce(rows({ count: 5 }));
        const response = await (await app()).inject({ method: 'POST', url: '/agent-tokens', headers: { 'x-test-user': ALICE }, payload: { name: 'one more' } });
        expect(response.statusCode).toBe(409);
    });

    test('revokes only their own key', async () => {
        query.mockResolvedValueOnce(rows());
        const response = await (await app()).inject({ method: 'DELETE', url: '/agent-tokens/3', headers: { 'x-test-user': ALICE } });
        expect(response.statusCode).toBe(404);
        expect(query.mock.calls[0][1]).toEqual([3, ALICE]);
    });

    test('marking by hand keeps the honor system', async () => {
        query.mockResolvedValueOnce(rows()).mockResolvedValueOnce(rows({ day: 31 })).mockResolvedValueOnce(rows());
        const response = await (await app()).inject({ method: 'PUT', url: '/scareathon/watches/31', headers: { 'x-test-user': ALICE } });
        expect(response.statusCode).toBe(200);
    });
});
