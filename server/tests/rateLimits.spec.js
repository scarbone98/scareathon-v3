import Fastify from 'fastify';
import { getClientIp, hashClientIp, trustProxyHops } from '../utils/clientIp.js';
import { ipKey, rateLimitsEnabled, registerRateLimits, ROUTE_LIMITS, UNKNOWN_CLIENT, userOrIpKey } from '../utils/rateLimits.js';
import { signToken, verifyToken } from '../utils/signing.js';
import { isPublicRoute } from '../utils/authRoutes.js';

// A server set up like index.js: behind one proxy (Railway's edge)
async function buildApp(env = {}) {
    const app = Fastify({ trustProxy: trustProxyHops(env) });
    app.decorateRequest('user', null);
    await registerRateLimits(app, { RATE_LIMIT_PER_MINUTE: '5', ...env });
    app.addHook('preValidation', async (request) => {
        if (request.headers['x-test-user']) request.user = { sub: request.headers['x-test-user'] };
    });
    app.get('/anything', async (request) => ({ ip: getClientIp(request) }));
    app.post('/tight', { config: { rateLimit: { ...ROUTE_LIMITS.deviceStart, max: 2 } } }, async () => ({ ok: true }));
    app.post('/per-user', { config: { rateLimit: { ...ROUTE_LIMITS.gameCheck, max: 2 } } }, async () => ({ ok: true }));
    await app.ready();
    return app;
}

// What Railway's proxy does: connect from inside its network and add the
// visitor's address to whatever X-Forwarded-For the visitor sent
function viaProxy(visitorIp, { spoofed, method = 'GET', url = '/anything', headers = {} } = {}) {
    return {
        method,
        url,
        remoteAddress: '10.0.0.7',
        headers: { 'x-forwarded-for': spoofed ? `${spoofed}, ${visitorIp}` : visitorIp, ...headers },
    };
}

describe('client IP', () => {
    test('is what the proxy saw, not what the visitor claims', async () => {
        const app = await buildApp();
        expect((await app.inject(viaProxy('203.0.113.9'))).json().ip).toBeNull(); // documentation range: private
        expect((await app.inject(viaProxy('8.8.8.8'))).json().ip).toBe('8.8.8.8');
        expect((await app.inject(viaProxy('8.8.8.8', { spoofed: '1.1.1.1' }))).json().ip).toBe('8.8.8.8');
        await app.close();
    });

    test('is unknown for local and internal addresses', () => {
        expect(getClientIp({ ip: '127.0.0.1' })).toBeNull();
        expect(getClientIp({ ip: '10.0.0.7' })).toBeNull();
        expect(getClientIp({ ip: '::ffff:8.8.4.4' })).toBe('8.8.4.4');
        expect(ipKey({ ip: '10.0.0.7' })).toBe(UNKNOWN_CLIENT);
    });

    test('hashes to a monthly, secret-salted network id', () => {
        const may = new Date('2026-05-10T00:00:00Z');
        const a = hashClientIp('8.8.8.8', 'secret', may);
        expect(a).toMatch(/^[0-9a-f]{32}$/);
        expect(hashClientIp('8.8.8.8', 'secret', new Date('2026-05-30T00:00:00Z'))).toBe(a);
        expect(hashClientIp('8.8.8.8', 'secret', new Date('2026-06-01T00:00:00Z'))).not.toBe(a);
        expect(hashClientIp('8.8.8.8', 'other', may)).not.toBe(a);
        expect(hashClientIp(null, 'secret')).toBeNull();
    });

    test('proxy hops come from TRUST_PROXY_HOPS, default 1', () => {
        expect(trustProxyHops({})).toBe(1);
        expect(trustProxyHops({ TRUST_PROXY_HOPS: '2' })).toBe(2);
        expect(trustProxyHops({ TRUST_PROXY_HOPS: 'nope' })).toBe(1);
    });
});

describe('rate limits', () => {
    test('limit each visitor separately', async () => {
        const app = await buildApp();
        for (let i = 0; i < 5; i += 1) expect((await app.inject(viaProxy('8.8.8.8'))).statusCode).toBe(200);
        const limited = await app.inject(viaProxy('8.8.8.8'));
        expect(limited.statusCode).toBe(429);
        expect(limited.headers['retry-after']).toBeDefined();
        // Someone else is unaffected, and faking a header doesn't get round it
        expect((await app.inject(viaProxy('8.8.4.4'))).statusCode).toBe(200);
        expect((await app.inject(viaProxy('8.8.8.8', { spoofed: '9.9.9.9' }))).statusCode).toBe(429);
        await app.close();
    });

    test('never lump unknown visitors together', async () => {
        const app = await buildApp();
        for (let i = 0; i < 20; i += 1) {
            expect((await app.inject({ method: 'GET', url: '/anything', remoteAddress: '10.0.0.7' })).statusCode).toBe(200);
        }
        await app.close();
    });

    test('never limit CORS preflights', async () => {
        const app = await buildApp();
        for (let i = 0; i < 10; i += 1) {
            const response = await app.inject(viaProxy('8.8.8.8', { method: 'OPTIONS' }));
            expect(response.statusCode).not.toBe(429);
        }
        await app.close();
    });

    test('route limits replace the general one', async () => {
        const app = await buildApp();
        expect((await app.inject(viaProxy('8.8.8.8', { method: 'POST', url: '/tight' }))).statusCode).toBe(200);
        expect((await app.inject(viaProxy('8.8.8.8', { method: 'POST', url: '/tight' }))).statusCode).toBe(200);
        expect((await app.inject(viaProxy('8.8.8.8', { method: 'POST', url: '/tight' }))).statusCode).toBe(429);
        // ...and don't use up the general allowance
        expect((await app.inject(viaProxy('8.8.8.8'))).statusCode).toBe(200);
        await app.close();
    });

    test('signed-in limits follow the account, not the network', async () => {
        const app = await buildApp();
        const asUser = (user) => viaProxy('8.8.8.8', { method: 'POST', url: '/per-user', headers: { 'x-test-user': user } });
        expect((await app.inject(asUser('alice'))).statusCode).toBe(200);
        expect((await app.inject(asUser('alice'))).statusCode).toBe(200);
        expect((await app.inject(asUser('alice'))).statusCode).toBe(429);
        expect((await app.inject(asUser('bob'))).statusCode).toBe(200);
        expect(userOrIpKey({ user: { sub: 'x' }, ip: '8.8.8.8' })).toBe('user:x');
        await app.close();
    });

    test('RATE_LIMIT_ENABLED=false turns them off', async () => {
        expect(rateLimitsEnabled({ RATE_LIMIT_ENABLED: 'false' })).toBe(false);
        expect(rateLimitsEnabled({})).toBe(true);
        const app = await buildApp({ RATE_LIMIT_ENABLED: 'false' });
        for (let i = 0; i < 20; i += 1) expect((await app.inject(viaProxy('8.8.8.8'))).statusCode).toBe(200);
        await app.close();
    });
});

describe('signed tokens', () => {
    test('round-trip and reject tampering', () => {
        const token = signToken({ kind: 'guest', id: 'abc' }, 'secret');
        expect(verifyToken(token, 'secret')).toEqual({ kind: 'guest', id: 'abc' });
        expect(verifyToken(token, 'other')).toBeNull();
        const [, signature] = token.split('.');
        const forged = `${Buffer.from(JSON.stringify({ kind: 'guest', id: 'xyz' })).toString('base64url')}.${signature}`;
        expect(verifyToken(forged, 'secret')).toBeNull();
        expect(verifyToken('garbage', 'secret')).toBeNull();
        expect(verifyToken(undefined, 'secret')).toBeNull();
    });

    test('guests can ask for a player id without signing in', () => {
        expect(isPublicRoute('POST', '/arcade/player-id')).toBe(true);
    });
});
