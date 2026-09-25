// Arcade tokens: what a player's AI (the scareathon-arcade-mcp server) uses to
// submit games as them. Players never see or paste them: the MCP server gets
// one by signing in with a device code the player approves on the site.
// They only work on the game-submission routes (see isArcadeTokenRoute).
import crypto from 'node:crypto';

export const TOKEN_PREFIX = 'sca_';

export function isArcadeToken(token) {
    return typeof token === 'string' && token.startsWith(TOKEN_PREFIX);
}

export function hashArcadeToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export function mintArcadeToken() {
    const token = `${TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
    return {
        token,
        tokenHash: hashArcadeToken(token),
        tokenPrefix: token.slice(0, TOKEN_PREFIX.length + 6),
    };
}

// The user a token belongs to, or null if it's unknown, revoked, or its user
// is gone. Also stamps last_used_at so the player can spot unused tokens.
export async function findArcadeTokenUser(db, token) {
    const result = await db.query(`
        UPDATE arcade_api_tokens t
        SET last_used_at = now()
        FROM users u
        WHERE t.token_hash = $1
          AND t.revoked_at IS NULL
          AND u.id = t.user_id
        RETURNING t.user_id, t.id AS token_id
    `, [hashArcadeToken(token)]);
    return result.rows[0] ?? null;
}

// Device login codes. The device code is the MCP server's secret; the user
// code is what the player compares on the approve page, so it's short and
// avoids look-alike characters.
const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';

export function mintDeviceCode() {
    const deviceCode = crypto.randomBytes(32).toString('base64url');
    return { deviceCode, deviceCodeHash: hashArcadeToken(deviceCode) };
}

export function mintUserCode() {
    const bytes = crypto.randomBytes(8);
    const chars = Array.from(bytes, (byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]);
    return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function normalizeUserCode(value) {
    if (typeof value !== 'string') return null;
    const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : null;
}
