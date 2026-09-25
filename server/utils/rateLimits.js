// Request rate limits (@fastify/rate-limit, counted in memory: we run one
// server). Every route gets a generous per-IP limit that only a flood
// reaches; routes that are costly or easy to abuse set a tighter
// ROUTE_LIMITS entry in their route config, which replaces the general one.
//
// Safety valves:
// - RATE_LIMIT_ENABLED=false turns all of this off.
// - A request whose visitor IP we can't tell (see utils/clientIp.js) isn't
//   IP-limited at all, rather than sharing one bucket with everyone.
import rateLimit from '@fastify/rate-limit';
import { getClientIp } from './clientIp.js';

// The key for requests we can't attribute; they're let through
export const UNKNOWN_CLIENT = 'unknown';

export function rateLimitsEnabled(env = process.env) {
    return env.RATE_LIMIT_ENABLED !== 'false';
}

export function ipKey(request) {
    const ip = getClientIp(request);
    return ip ? `ip:${ip}` : UNKNOWN_CLIENT;
}

// Signed-in (session or arcade token) callers by account, others by IP
export function userOrIpKey(request) {
    return request.user?.sub ? `user:${request.user.sub}` : ipKey(request);
}

export function skipRateLimit(request, key) {
    return request.method === 'OPTIONS' || key === UNKNOWN_CLIENT;
}

// Put on a route as config: { rateLimit: ROUTE_LIMITS.x }. The ones keyed by
// user run after sign-in is checked (preHandler), so request.user is set.
export const ROUTE_LIMITS = {
    // An AI starting a sign-in: people retry, but not dozens of times
    deviceStart: { max: 10, timeWindow: '1 minute', keyGenerator: ipKey },
    // Every 3 s per waiting sign-in, with room for a few at once on one network
    devicePoll: { max: 120, timeWindow: '1 minute', keyGenerator: ipKey },
    // Each check fetches the game's URL
    gameCheck: { max: 20, timeWindow: '10 minutes', hook: 'preHandler', keyGenerator: userOrIpKey },
    // A browser asks once and keeps it
    guestPlayerId: { max: 20, timeWindow: '1 hour', keyGenerator: ipKey },
    // Play events, from everyone on one network
    plays: { max: 120, timeWindow: '1 minute', keyGenerator: ipKey },
};

export async function registerRateLimits(fastify, env = process.env) {
    if (!rateLimitsEnabled(env)) {
        fastify.log.warn('Rate limits are off (RATE_LIMIT_ENABLED=false)');
        return;
    }
    const perMinute = Number.parseInt(env.RATE_LIMIT_PER_MINUTE ?? '', 10);
    await fastify.register(rateLimit, {
        global: true,
        // A whole household or venue can share one IP, so this is set for
        // floods, not for normal use
        max: Number.isInteger(perMinute) && perMinute > 0 ? perMinute : 1200,
        timeWindow: '1 minute',
        keyGenerator: ipKey,
        allowList: skipRateLimit,
        // Don't let a problem counting requests take the site down
        skipOnError: true,
    });
}
