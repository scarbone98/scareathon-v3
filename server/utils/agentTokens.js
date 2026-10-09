import { createHash, randomBytes } from 'node:crypto';

// Agent keys (see db/migrations/20261008_agent_tokens.sql). A key acts as the player who
// made it, but only on the routes listed in AGENT_ROUTES: everything else answers 403,
// whatever the route would let the player do. Agents never count as admins.

export const AGENT_TOKEN_PREFIX = 'wsa_';
export const MAX_ACTIVE_AGENT_TOKENS = 5;
export const AGENT_REQUESTS_PER_MINUTE = 60;

// [method, path pattern] an agent key may call. Paths match without the query string.
export const AGENT_ROUTES = [
    ['GET', /^\/agent\/whoami$/],
    ['GET', /^\/calendar$/],
    ['GET', /^\/calendar\/\d{1,2}$/],
    ['GET', /^\/scareathon\/me$/],
    ['PUT', /^\/scareathon\/watches\/\d{1,2}$/],
    ['DELETE', /^\/scareathon\/watches\/\d{1,2}$/],
    ['GET', /^\/leaderboard$/],
    ['GET', /^\/past-winners$/],
    ['GET', /^\/weekly-challenges\/current$/],
];

export function isAgentToken(token) {
    return typeof token === 'string' && token.startsWith(AGENT_TOKEN_PREFIX);
}

export function hashAgentToken(token) {
    return createHash('sha256').update(token).digest('hex');
}

// A fresh key, its hash (what's stored) and a hint (its last four, to tell keys apart)
export function newAgentToken() {
    const token = AGENT_TOKEN_PREFIX + randomBytes(32).toString('base64url');
    return { token, tokenHash: hashAgentToken(token), hint: token.slice(-4) };
}

export function isAgentRouteAllowed(method, url) {
    const path = String(url || '').split('?')[0].replace(/\/+$/, '') || '/';
    return AGENT_ROUTES.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(path));
}

// The last October night an agent may mark watched, US Eastern time (as the calendar runs):
// none before October, tonight during it, all 31 after it. Players marking by hand keep the
// honor system; an agent can't mark a night that hasn't come yet.
export function latestUnlockedDay(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', month: 'numeric', day: 'numeric'
    }).formatToParts(date);
    const month = Number(parts.find(part => part.type === 'month')?.value);
    const day = Number(parts.find(part => part.type === 'day')?.value);
    if (month < 10) return 0;
    if (month > 10) return 31;
    return day;
}

// A small per-key limit, in memory (one server)
const recentRequests = new Map();
export function isRateLimited(tokenId, now = Date.now(), limit = AGENT_REQUESTS_PER_MINUTE) {
    const windowStart = now - 60_000;
    const times = (recentRequests.get(tokenId) || []).filter(time => time > windowStart);
    const limited = times.length >= limit;
    if (!limited) times.push(now);
    recentRequests.set(tokenId, times);
    return limited;
}
export function resetRateLimits() {
    recentRequests.clear();
}

// The auth hook's agent branch. Returns true when it has answered the request (refused it),
// false when request.user is set and the route may run.
export async function authenticateAgent(db, request, reply, token) {
    if (!isAgentRouteAllowed(request.method, request.url)) {
        reply.code(403).send({ error: "Agent keys can't do that. Only the player can, on the site." });
        return true;
    }

    let row;
    try {
        const result = await db.query(`
            UPDATE agent_tokens SET last_used_at = now()
            WHERE token_hash = $1 AND revoked_at IS NULL
              AND EXISTS (SELECT 1 FROM users WHERE users.id = agent_tokens.user_id AND users.deleted_at IS NULL)
            RETURNING id, user_id, name
        `, [hashAgentToken(token)]);
        row = result.rows[0];
    } catch (err) {
        request.log?.error?.({ err }, 'Database unavailable during agent key check');
        reply.code(503).send({ error: 'Database unavailable' });
        return true;
    }

    if (!row) {
        reply.code(401).send({ error: 'Unauthorized: unknown or revoked agent key' });
        return true;
    }
    if (isRateLimited(String(row.id))) {
        reply.code(429).send({ error: 'Slow down: too many requests from this agent key' });
        return true;
    }

    request.user = { sub: row.user_id, agent: true, agentTokenId: Number(row.id), agentName: row.name };
    return false;
}
