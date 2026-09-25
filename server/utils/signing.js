// Small signed tokens the server hands out and later checks it made: guest
// player ids and play sessions (routes/arcadeCommunity.js). Not secret, just
// unforgeable: base64url(JSON payload) + "." + HMAC-SHA256.
//
// The key is ARCADE_SIGNING_SECRET. Without one, a random key is made at
// startup: everything still works, but tokens from before a restart stop
// verifying (the site asks for new ones), and ip hashes change.
import crypto from 'node:crypto';

let fallbackSecret = null;

export function getSigningSecret(env = process.env, log = console) {
    if (env.ARCADE_SIGNING_SECRET) return env.ARCADE_SIGNING_SECRET;
    if (!fallbackSecret) {
        fallbackSecret = crypto.randomBytes(32).toString('hex');
        log.warn?.('ARCADE_SIGNING_SECRET is not set; using a random key until the next restart');
    }
    return fallbackSecret;
}

function mac(secret, body) {
    return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

export function signToken(payload, secret) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${mac(secret, body)}`;
}

// The payload, or null if the token is malformed or wasn't signed with secret
export function verifyToken(token, secret) {
    if (typeof token !== 'string' || token.length > 1000) return null;
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra !== undefined) return null;
    const expected = Buffer.from(mac(secret, body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    try {
        return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
}
