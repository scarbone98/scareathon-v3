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
        method === 'OPTIONS'
    );
}

// Guests may read these; a token, when sent, is still verified so the
// signed-in player's own entry can be highlighted.
export function isOptionalAuthRoute(method, url) {
    return method === 'GET' && url.startsWith('/games/getLeaderboard');
}
