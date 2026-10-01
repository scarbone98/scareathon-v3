// Which requests skip or soften the Supabase JWT check in index.js.

// A Picto Box photo's picture, /picto-box/photos/<uuid>.jpg (loaded by <img>, so no token)
const PICTO_BOX_IMAGE = /^\/picto-box\/photos\/[0-9a-f-]{36}\.jpg(\?.*)?$/i;

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
        // The rune tablet's code is on show to everyone (redeeming it needs a login)
        (method === 'GET' && url.startsWith('/wayside/rune')) ||
        // Monster Bash spectating (the live socket and past results) is open to
        // guests; betting, chat and /me need a login.
        (method === 'GET' && (url.startsWith('/monster-bash/ws') || url.startsWith('/monster-bash/recent'))) ||
        // Crypt Clash friend matches are open to guests.
        (method === 'GET' && url.startsWith('/crypt-clash/ws')) ||
        // So are Frog Ball co-op rooms.
        (method === 'GET' && url.startsWith('/frog-ball/ws')) ||
        (method === 'GET' && PICTO_BOX_IMAGE.test(url)) ||
        method === 'OPTIONS'
    );
}

// Guests may read these; a token, when sent, is still verified so the
// signed-in player's own entry can be highlighted.
export function isOptionalAuthRoute(method, url) {
    return method === 'GET' && (
        url.startsWith('/games/getLeaderboard') ||
        // The Picto Box wall: anyone can look; signed in, you can take your own down
        url === '/picto-box/photos' || url.startsWith('/picto-box/photos?')
    );
}
