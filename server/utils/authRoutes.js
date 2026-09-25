// Which requests skip or soften the Supabase JWT check in index.js.

// No token needed and none checked.
export function isPublicRoute(method, url) {
    const isLegacyEightBitEvilRoute =
        url.startsWith('/8bitevilreturns') &&
        !url.startsWith('/8bitevilreturns/runs');

    // Keep legacy game data routes public, but require auth for score writes.
    return (
        isLegacyEightBitEvilRoute ||
        url.startsWith('/admin/strapi') ||
        (method === 'GET' && url.startsWith('/weekly-challenges/current')) ||
        (method === 'GET' && url.startsWith('/content-loop')) ||
        // Monster Bash spectating (the live socket and past results) is open to
        // guests; betting, chat and /me need a login.
        (method === 'GET' && (url.startsWith('/monster-bash/ws') || url.startsWith('/monster-bash/recent'))) ||
        // Crypt Clash friend matches are open to guests.
        (method === 'GET' && url.startsWith('/crypt-clash/ws')) ||
        // So are Frog Ball co-op rooms.
        (method === 'GET' && url.startsWith('/frog-ball/ws')) ||
        // The community game spec and the published community games list.
        (method === 'GET' && (url.startsWith('/arcade/spec') || url.startsWith('/arcade/community'))) ||
        // An AI's MCP server signing in has no credentials yet (see routes/arcadeCommunity.js)
        (method === 'POST' && (url === '/arcade/device/start' || url === '/arcade/device/poll')) ||
        method === 'OPTIONS'
    );
}

// Guests may read these; a token, when sent, is still verified so the
// signed-in player's own entry can be highlighted.
export function isOptionalAuthRoute(method, url) {
    return (
        (method === 'GET' && url.startsWith('/games/getLeaderboard')) ||
        // Community game plays count guests too (see routes/arcadeCommunity.js)
        (method === 'POST' && /^\/arcade\/community\/[a-z0-9-]+\/plays$/.test(url))
    );
}

// Routes an arcade token (sca_..., held by a player's AI's MCP server) can use
// in place of a Supabase session: submitting games, reading your own, and
// revoking itself. Nothing else, so a leaked token can't spend coins, approve
// more AIs, or do admin work.
export function isArcadeTokenRoute(method, url) {
    const path = url.split('?')[0];
    if (path.endsWith('/unpublish')) return false;
    if (method === 'DELETE' && path === '/arcade/tokens/current') return true;
    return path === '/arcade/me' || path === '/arcade/games' || path.startsWith('/arcade/games/');
}
