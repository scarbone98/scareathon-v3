// Community arcade games: submit a version (a draft until the game's first
// approval, live straight away after that), review, publish, and
// the published list the arcade shelf reads. Also signing a player's AI (the
// scareathon-arcade-mcp server) in, and the arcade tokens that gives it. The spec itself lives in arcadeCommunity/gameSpec.js.
import crypto from 'node:crypto';
import pool from '../db/mockDB.js';
import { deleteCachePrefix, getOrRefreshCache } from '../utils/cacheManager.js';
import { isAdminUser } from './inbox.js';
import {
    getSpecPayload,
    normalizeGameName,
    scorePolicyFromManifest,
    slugifyGameName,
    validateManifest,
} from '../arcadeCommunity/gameSpec.js';
import { checkGameUrl, checksPassed } from '../arcadeCommunity/urlCheck.js';
import { mintArcadeToken, mintDeviceCode, mintUserCode, hashArcadeToken, normalizeUserCode } from '../arcadeCommunity/tokens.js';
import { getClientIp, hashClientIp } from '../utils/clientIp.js';
import { ROUTE_LIMITS } from '../utils/rateLimits.js';
import { getSigningSecret, signToken, verifyToken } from '../utils/signing.js';

const COMMUNITY_CACHE_KEY = 'arcadeCommunity:live';
const COMMUNITY_CACHE_TTL = 60 * 1000;
const MAX_GAMES_PER_USER = 5;
const MAX_SUBMITS_PER_DAY = 20;
const MAX_ACTIVE_TOKENS = 10;
const CLIENT_NAME_MAX = 60;
const DEVICE_LOGIN_TTL_MINUTES = 10;
// After approval, how long the MCP server has to collect its token
const DEVICE_LOGIN_COLLECT_MINUTES = 5;
const DEVICE_POLL_INTERVAL_SECONDS = 3;
// Play events one player can send a minute before the rest are dropped
const MAX_PLAY_EVENTS_PER_MINUTE = 20;
// Opening the same version again within this long isn't another play
const PLAY_DEDUPE_MINUTES = 30;
// A run has to last this long to count as finished
const MIN_RUN_SECONDS = 10;
// How long a play session (from opening the game) can report finished runs
const PLAY_SESSION_HOURS = 12;
const SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://www.scareathon.rip').replace(/\/$/, '');
const REVIEW_NOTE_MAX = 1000;

// Same normalising as normalizeGameName, in SQL, for comparing against games.name
const SQL_NORMALIZED_NAME = (column) =>
    `regexp_replace(replace(lower(${column}), '&', 'and'), '[^a-z0-9]+', '', 'g')`;

class SubmissionError extends Error {
    constructor(statusCode, message, extra = {}) {
        super(message);
        this.statusCode = statusCode;
        this.extra = extra;
    }
}

function sendError(reply, error, log) {
    if (error instanceof SubmissionError) {
        return reply.code(error.statusCode).send({ error: error.message, ...error.extra });
    }
    log.error(error);
    return reply.code(500).send({ error: 'Something went wrong' });
}

const EMPTY_STATS = { plays: 0, players: 0, signedInPlayers: 0, networks: 0, finishedRuns: 0, bestScore: null, playsLast7Days: 0 };

function serializeVersion(row, stats = EMPTY_STATS) {
    return {
        id: Number(row.id),
        version: row.version,
        status: row.status,
        url: row.url,
        manifest: row.manifest,
        checks: row.checks,
        reviewNote: row.review_note,
        autoApproved: row.auto_approved,
        reviewedAt: row.reviewed_at,
        submittedAt: row.created_at,
        stats,
    };
}

// Play stats for some versions, keyed by version id
async function loadVersionStats(db, versionIds) {
    if (versionIds.length === 0) return new Map();
    const result = await db.query(`
        SELECT version_id,
               COUNT(*) FILTER (WHERE event = 'start')::int AS plays,
               COUNT(DISTINCT player_key) FILTER (WHERE event = 'start')::int AS players,
               COUNT(DISTINCT player_key) FILTER (WHERE event = 'start' AND player_key LIKE 'u:%')::int AS signed_in_players,
               COUNT(DISTINCT ip_hash) FILTER (WHERE event = 'start')::int AS networks,
               COUNT(*) FILTER (WHERE event = 'finish')::int AS finished_runs,
               MAX(score) FILTER (WHERE event = 'finish') AS best_score,
               COUNT(*) FILTER (WHERE event = 'start' AND created_at >= now() - interval '7 days')::int AS plays_last_7_days
        FROM arcade_game_plays
        WHERE version_id = ANY($1::bigint[])
        GROUP BY version_id
    `, [versionIds]);
    return new Map(result.rows.map((row) => [Number(row.version_id), {
        plays: row.plays,
        players: row.players,
        signedInPlayers: row.signed_in_players,
        networks: row.networks,
        finishedRuns: row.finished_runs,
        bestScore: row.best_score === null ? null : Number(row.best_score),
        playsLast7Days: row.plays_last_7_days,
    }]));
}

async function loadGameDetail(db, where, params) {
    const gameResult = await db.query(`
        SELECT cg.*, u.username AS owner_username
        FROM arcade_community_games cg
        JOIN users u ON u.id = cg.owner_user_id
        WHERE ${where}
    `, params);
    const game = gameResult.rows[0];
    if (!game) return null;

    const versions = await db.query(`
        SELECT * FROM arcade_game_versions
        WHERE community_game_id = $1
        ORDER BY version DESC
    `, [game.id]);

    const stats = await loadVersionStats(db, versions.rows.map((row) => row.id));
    return {
        slug: game.slug,
        name: game.name,
        owner: game.owner_username,
        ownerUserId: game.owner_user_id,
        liveVersionId: game.live_version_id ? Number(game.live_version_id) : null,
        versions: versions.rows.map((row) => serializeVersion(row, stats.get(Number(row.id)))),
    };
}

function publicGameDetail(detail) {
    const { ownerUserId: _ownerUserId, ...rest } = detail;
    return rest;
}

// Looks up who already has this name. Returns the caller's own community game
// (so the submit becomes a new version), or throws if anyone else has it.
async function findGameForName(db, name, userId) {
    const normalized = normalizeGameName(name);
    const community = await db.query(`
        SELECT * FROM arcade_community_games
        WHERE ${SQL_NORMALIZED_NAME('name')} = $1
    `, [normalized]);
    const existing = community.rows[0];
    if (existing) {
        if (existing.owner_user_id !== userId) {
            throw new SubmissionError(409, `"${existing.name}" belongs to another player. Pick a different name.`);
        }
        if (existing.name !== name) {
            throw new SubmissionError(409, `You already have this game as "${existing.name}". Use that exact name to update it.`);
        }
        return existing;
    }

    const house = await db.query(`
        SELECT name FROM games WHERE ${SQL_NORMALIZED_NAME('name')} = $1 LIMIT 1
    `, [normalized]);
    if (house.rows[0]) {
        throw new SubmissionError(409, `"${house.rows[0].name}" is already an arcade game. Pick a different name.`);
    }
    return null;
}

// Manifest + URL checks shared by the dry run and the real submit. Throws on
// anything that would block the submit.
async function runSubmissionChecks(db, userId, rawManifest) {
    const validation = validateManifest(rawManifest);
    if (!validation.ok) {
        throw new SubmissionError(400, 'The manifest has problems', { errors: validation.errors });
    }
    const { manifest } = validation;
    const existing = await findGameForName(db, manifest.name, userId);

    const { checks, pageSha256 } = await checkGameUrl(manifest.url);
    if (!checksPassed(checks)) {
        throw new SubmissionError(422, "The game URL didn't pass the automated checks", { checks });
    }
    return { manifest, existing, checks, pageSha256 };
}

async function enforceSubmitLimits(db, userId, existing) {
    if (!existing) {
        const owned = await db.query(
            'SELECT COUNT(*)::int AS count FROM arcade_community_games WHERE owner_user_id = $1',
            [userId]
        );
        if (owned.rows[0].count >= MAX_GAMES_PER_USER) {
            throw new SubmissionError(403, `You can have at most ${MAX_GAMES_PER_USER} arcade games`);
        }
    }
    const recent = await db.query(`
        SELECT COUNT(*)::int AS count
        FROM arcade_game_versions v
        JOIN arcade_community_games cg ON cg.id = v.community_game_id
        WHERE cg.owner_user_id = $1 AND v.created_at >= now() - interval '1 day'
    `, [userId]);
    if (recent.rows[0].count >= MAX_SUBMITS_PER_DAY) {
        throw new SubmissionError(429, `At most ${MAX_SUBMITS_PER_DAY} submits a day. Try again tomorrow.`);
    }
}

async function uniqueSlug(db, name) {
    const base = slugifyGameName(name) || 'game';
    for (let n = 1; n < 50; n += 1) {
        const slug = n === 1 ? base : `${base}-${n}`;
        const taken = await db.query('SELECT 1 FROM arcade_community_games WHERE slug = $1', [slug]);
        if (taken.rowCount === 0) return slug;
    }
    throw new SubmissionError(409, 'Could not find a free link name for this game');
}

export async function submitGameVersion(userId, rawManifest, db = pool) {
    const { manifest, existing, checks, pageSha256 } = await runSubmissionChecks(db, userId, rawManifest);
    await enforceSubmitLimits(db, userId, existing);

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        let communityGameId = existing?.id;
        // One approval per game: while it's on the shelf, updates go live
        // without review. (A game an admin unpublished waits for them again.)
        let goesLive = false;

        if (!existing) {
            // Hidden until the first approval
            const gameRow = await client.query(`
                INSERT INTO games (name, description, is_active, created_at, updated_at, published_at)
                VALUES ($1, $2, FALSE, now(), now(), NULL)
                RETURNING id
            `, [manifest.name, manifest.description ?? manifest.tagline]);
            const slug = await uniqueSlug(client, manifest.name);
            const inserted = await client.query(`
                INSERT INTO arcade_community_games (slug, game_id, owner_user_id, name)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, [slug, gameRow.rows[0].id, userId, manifest.name]);
            communityGameId = inserted.rows[0].id;
        } else {
            // Serialise submits for the same game, then retire the waiting draft
            const locked = await client.query(
                'SELECT live_version_id FROM arcade_community_games WHERE id = $1 FOR UPDATE',
                [communityGameId]
            );
            goesLive = locked.rows[0].live_version_id !== null;
            await client.query(`
                UPDATE arcade_game_versions SET status = 'superseded'
                WHERE community_game_id = $1 AND status = 'draft'
            `, [communityGameId]);
        }

        // TODO(version-drift): an approved version is trusted not to change,
        // but nothing enforces it: GitHub Pages and most hosts serve whatever
        // was pushed last, and the CDNs that pin a commit (jsDelivr, raw
        // GitHub) serve HTML as text/plain, so it won't run. Options when
        // this matters: re-fetch approved versions on a schedule and compare
        // page_sha256 (plus the scripts they load; Unity/Godot fetch their
        // big files at runtime, so parse their loader configs too), falling
        // back to the newest approved version that still matches; or host
        // uploaded builds ourselves on a separate origin.
        const inserted = await client.query(`
            INSERT INTO arcade_game_versions
                (community_game_id, version, url, manifest, status, auto_approved, reviewed_at, checks, page_sha256)
            SELECT $1, COALESCE(MAX(version), 0) + 1, $2, $3::jsonb,
                   CASE WHEN $6 THEN 'approved' ELSE 'draft' END, $6,
                   CASE WHEN $6 THEN now() END, $4::jsonb, $5
            FROM arcade_game_versions WHERE community_game_id = $1
            RETURNING id
        `, [communityGameId, manifest.url, JSON.stringify(manifest), JSON.stringify(checks), pageSha256, goesLive]);
        if (goesLive) {
            await client.query(`
                UPDATE arcade_community_games SET live_version_id = $2, updated_at = now() WHERE id = $1
            `, [communityGameId, inserted.rows[0].id]);
            await client.query(`
                UPDATE games SET description = $2, updated_at = now()
                WHERE id = (SELECT game_id FROM arcade_community_games WHERE id = $1)
            `, [communityGameId, manifest.description ?? manifest.tagline]);
        } else {
            await client.query('UPDATE arcade_community_games SET updated_at = now() WHERE id = $1', [communityGameId]);
        }

        await client.query('COMMIT');
        if (goesLive) deleteCachePrefix(COMMUNITY_CACHE_KEY);
        return await loadGameDetail(client, 'cg.id = $1', [communityGameId]);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') {
            throw new SubmissionError(409, 'That game was just submitted by someone else. Try again.');
        }
        throw error;
    } finally {
        client.release();
    }
}

// The published community games, for the arcade shelf
export async function getLiveCommunityGames(db = pool) {
    return getOrRefreshCache(COMMUNITY_CACHE_KEY, async () => {
        const result = await db.query(`
            SELECT cg.slug, cg.name, u.username AS owner, v.id::int AS "versionId", v.version, v.url, v.manifest
            FROM arcade_community_games cg
            JOIN arcade_game_versions v ON v.id = cg.live_version_id
            JOIN users u ON u.id = cg.owner_user_id
            ORDER BY v.reviewed_at ASC
        `);
        return result.rows;
    }, COMMUNITY_CACHE_TTL);
}

// The score rule for a live community game, for /games/submitScore. Null if
// it isn't a live community game or has no leaderboard.
export async function getCommunityScorePolicy(db, gameName) {
    const result = await db.query(`
        SELECT v.manifest
        FROM arcade_community_games cg
        JOIN arcade_game_versions v ON v.id = cg.live_version_id
        WHERE cg.name = $1
    `, [gameName]);
    return scorePolicyFromManifest(result.rows[0]?.manifest);
}

function ensureAdmin(request, reply) {
    if (!isAdminUser(request.user)) {
        reply.code(403).send({ error: 'Admin access required' });
        return false;
    }
    return true;
}

function parseId(value) {
    const id = Number.parseInt(value, 10);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function routes(fastify) {
    // --- Public ---------------------------------------------------------------------------

    fastify.get('/spec', async () => getSpecPayload());

    fastify.get('/community', async (request, reply) => {
        try {
            return { data: await getLiveCommunityGames() };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    // A guest's player id: made and signed here, so a script can't invent
    // new "players" by sending random ids. The browser keeps it.
    fastify.post('/player-id', { config: { rateLimit: ROUTE_LIMITS.guestPlayerId } }, async () => ({
        data: { playerId: signToken({ kind: 'guest', id: crypto.randomUUID(), at: Date.now() }, getSigningSecret()) },
    }));

    // Optional sign-in: a play of an approved version, for the author's stats.
    // Best effort by design (nothing rides on these counts), but hard to
    // inflate: guests need a player id from /player-id; opening a version
    // again within PLAY_DEDUPE_MINUTES isn't another play; a finished run
    // needs the play session /plays handed out at the start, and at least
    // MIN_RUN_SECONDS since; the author's own plays don't count; and each
    // play records a hashed network, so a few networks faking many players
    // shows in the stats.
    fastify.post('/community/:slug/plays', { config: { rateLimit: ROUTE_LIMITS.plays } }, async (request, reply) => {
        const { versionId, event, score, playerId, playToken } = request.body ?? {};
        const id = parseId(versionId);
        if (!id || (event !== 'start' && event !== 'finish')) {
            return reply.code(400).send({ error: 'versionId and event ("start" or "finish") are required' });
        }
        const numericScore = event === 'finish' && score !== undefined && score !== null ? Number(score) : null;
        if (numericScore !== null && !(Number.isFinite(numericScore) && numericScore >= 0)) {
            return reply.code(400).send({ error: 'score must be a number >= 0' });
        }
        const secret = getSigningSecret();
        let key;
        if (request.user?.sub) {
            key = `u:${request.user.sub}`;
        } else {
            const guest = verifyToken(playerId, secret);
            if (guest?.kind !== 'guest' || typeof guest.id !== 'string') {
                return reply.code(400).send({ error: 'Invalid player id', code: 'invalid_player_id' });
            }
            key = `g:${guest.id}`;
        }

        try {
            const version = await pool.query(`
                SELECT v.id, v.manifest, cg.owner_user_id
                FROM arcade_game_versions v
                JOIN arcade_community_games cg ON cg.id = v.community_game_id
                WHERE v.id = $1 AND cg.slug = $2 AND v.status = 'approved'
            `, [id, request.params.slug]);
            const row = version.rows[0];
            if (!row) return reply.code(404).send({ error: 'No approved version with that id' });
            // An author playing their own game doesn't count
            if (request.user?.sub === row.owner_user_id) return { data: { counted: false } };

            if (event === 'finish') {
                const session = verifyToken(playToken, secret);
                const startedAt = Number(session?.at);
                const ageSeconds = (Date.now() - startedAt) / 1000;
                if (session?.kind !== 'play' || session.v !== id || session.p !== key ||
                    !(ageSeconds >= MIN_RUN_SECONDS && ageSeconds <= PLAY_SESSION_HOURS * 3600)) {
                    return { data: { counted: false } };
                }
            }

            const recent = await pool.query(`
                SELECT COUNT(*)::int AS count,
                       COUNT(*) FILTER (
                           WHERE version_id = $2 AND event = 'start'
                             AND created_at >= now() - make_interval(mins => $3)
                       )::int AS recent_starts,
                       COUNT(*) FILTER (
                           WHERE version_id = $2 AND event = 'finish'
                             AND created_at >= now() - make_interval(secs => $4)
                       )::int AS recent_finishes
                FROM arcade_game_plays
                WHERE player_key = $1 AND created_at >= now() - make_interval(mins => $3)
            `, [key, id, PLAY_DEDUPE_MINUTES, MIN_RUN_SECONDS]);
            const counts = recent.rows[0];
            const perMinute = await pool.query(`
                SELECT COUNT(*)::int AS count FROM arcade_game_plays
                WHERE player_key = $1 AND created_at >= now() - interval '1 minute'
            `, [key]);
            if (perMinute.rows[0].count >= MAX_PLAY_EVENTS_PER_MINUTE) {
                return reply.code(429).send({ error: 'Too many plays' });
            }

            // Every start hands out a play session, counted or not, so the
            // runs that follow can count
            const response = event === 'start'
                ? { playToken: signToken({ kind: 'play', v: id, p: key, at: Date.now() }, secret) }
                : {};
            const duplicate = event === 'start' ? counts.recent_starts > 0 : counts.recent_finishes > 0;
            if (duplicate) return { data: { ...response, counted: false } };

            // Out-of-range scores aren't saved to the leaderboard, so don't count them as a best either
            const maxScore = row.manifest.score?.max;
            const keptScore = numericScore !== null && maxScore !== undefined && numericScore <= maxScore ? numericScore : null;
            await pool.query(`
                INSERT INTO arcade_game_plays (version_id, event, player_key, score, ip_hash)
                VALUES ($1, $2, $3, $4, $5)
            `, [id, event, key, keptScore, hashClientIp(getClientIp(request), secret)]);
            return reply.code(201).send({ data: { ...response, counted: true } });
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    // --- Players (session or arcade token) --------------------------------------------------

    fastify.get('/me', async (request, reply) => {
        try {
            const user = await pool.query('SELECT username FROM users WHERE id = $1', [request.user.sub]);
            return { data: { username: user.rows[0]?.username ?? null, isAdmin: isAdminUser(request.user) } };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    // Dry run: everything a submit checks, nothing saved
    fastify.post('/games/validate', { config: { rateLimit: ROUTE_LIMITS.gameCheck } }, async (request, reply) => {
        try {
            const { manifest, existing, checks } = await runSubmissionChecks(
                pool, request.user.sub, request.body?.manifest
            );
            return {
                data: {
                    ok: true,
                    manifest,
                    checks,
                    wouldCreate: existing ? 'new version' : 'new game',
                    ...(existing ? { slug: existing.slug } : {}),
                },
            };
        } catch (error) {
            if (error instanceof SubmissionError && error.statusCode !== 500) {
                return { data: { ok: false, error: error.message, ...error.extra } };
            }
            return sendError(reply, error, fastify.log);
        }
    });

    fastify.post('/games', { config: { rateLimit: ROUTE_LIMITS.gameCheck } }, async (request, reply) => {
        try {
            const game = await submitGameVersion(request.user.sub, request.body?.manifest);
            return reply.code(201).send({ data: publicGameDetail(game) });
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    fastify.get('/games/mine', async (request, reply) => {
        try {
            const owned = await pool.query(
                'SELECT id FROM arcade_community_games WHERE owner_user_id = $1 ORDER BY created_at DESC',
                [request.user.sub]
            );
            const games = [];
            for (const row of owned.rows) {
                games.push(publicGameDetail(await loadGameDetail(pool, 'cg.id = $1', [row.id])));
            }
            return { data: games };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    // Owner or admin: every version, including drafts, for previewing
    fastify.get('/games/:slug', async (request, reply) => {
        try {
            const game = await loadGameDetail(pool, 'cg.slug = $1', [request.params.slug]);
            if (!game || (game.ownerUserId !== request.user.sub && !isAdminUser(request.user))) {
                return reply.code(404).send({ error: 'Game not found' });
            }
            return { data: publicGameDetail(game) };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    // --- Admin review (session only) ---------------------------------------------------------

    fastify.get('/review', async (request, reply) => {
        if (!ensureAdmin(request, reply)) return;
        try {
            const drafts = await pool.query(`
                SELECT cg.slug, cg.name, cg.live_version_id, u.username AS owner, v.*
                FROM arcade_game_versions v
                JOIN arcade_community_games cg ON cg.id = v.community_game_id
                JOIN users u ON u.id = cg.owner_user_id
                WHERE v.status = 'draft'
                ORDER BY v.created_at ASC
            `);
            const live = await pool.query(`
                SELECT cg.slug, cg.name, u.username AS owner, v.*
                FROM arcade_community_games cg
                JOIN arcade_game_versions v ON v.id = cg.live_version_id
                JOIN users u ON u.id = cg.owner_user_id
                ORDER BY cg.name
            `);
            const withGame = (row) => ({
                slug: row.slug,
                name: row.name,
                owner: row.owner,
                isUpdate: Boolean(row.live_version_id),
                version: serializeVersion(row),
            });
            return { data: { drafts: drafts.rows.map(withGame), live: live.rows.map(withGame) } };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    fastify.post('/versions/:id/approve', async (request, reply) => {
        if (!ensureAdmin(request, reply)) return;
        const versionId = parseId(request.params.id);
        if (!versionId) return reply.code(400).send({ error: 'Bad version id' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const versionResult = await client.query(`
                SELECT v.*, cg.game_id
                FROM arcade_game_versions v
                JOIN arcade_community_games cg ON cg.id = v.community_game_id
                WHERE v.id = $1
                FOR UPDATE OF v, cg
            `, [versionId]);
            const version = versionResult.rows[0];
            // An approved version can be approved again: that's how an admin
            // rolls back to it or re-lists an unpublished game
            if (!version || !['draft', 'approved'].includes(version.status)) {
                await client.query('ROLLBACK');
                return reply.code(409).send({ error: 'Only a draft or approved version can go live' });
            }

            await client.query(`
                UPDATE arcade_game_versions
                SET status = 'approved',
                    reviewed_by = COALESCE(reviewed_by, $2),
                    reviewed_at = COALESCE(reviewed_at, now()),
                    review_note = COALESCE($3, review_note)
                WHERE id = $1
            `, [versionId, request.user.sub, request.body?.note?.slice?.(0, REVIEW_NOTE_MAX) || null]);
            await client.query(`
                UPDATE arcade_community_games SET live_version_id = $1, updated_at = now()
                WHERE id = $2
            `, [versionId, version.community_game_id]);
            await client.query(`
                UPDATE games
                SET is_active = TRUE,
                    description = $2,
                    published_at = COALESCE(published_at, now()),
                    updated_at = now()
                WHERE id = $1
            `, [version.game_id, version.manifest.description ?? version.manifest.tagline]);
            await client.query('COMMIT');
            deleteCachePrefix(COMMUNITY_CACHE_KEY);
            return { data: { ok: true } };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            return sendError(reply, error, fastify.log);
        } finally {
            client.release();
        }
    });

    fastify.post('/versions/:id/reject', async (request, reply) => {
        if (!ensureAdmin(request, reply)) return;
        const versionId = parseId(request.params.id);
        const note = typeof request.body?.note === 'string' ? request.body.note.trim().slice(0, REVIEW_NOTE_MAX) : '';
        if (!versionId) return reply.code(400).send({ error: 'Bad version id' });
        if (!note) return reply.code(400).send({ error: 'Say why, so the author can fix it' });
        try {
            const result = await pool.query(`
                UPDATE arcade_game_versions
                SET status = 'rejected', review_note = $2, reviewed_by = $3, reviewed_at = now()
                WHERE id = $1 AND status = 'draft'
            `, [versionId, note, request.user.sub]);
            if (result.rowCount === 0) {
                return reply.code(409).send({ error: 'Only a draft can be rejected' });
            }
            return { data: { ok: true } };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    // Takes a game off the shelf. Its versions and scores are kept.
    fastify.post('/games/:slug/unpublish', async (request, reply) => {
        if (!ensureAdmin(request, reply)) return;
        try {
            const result = await pool.query(`
                WITH hidden AS (
                    UPDATE arcade_community_games SET live_version_id = NULL, updated_at = now()
                    WHERE slug = $1
                    RETURNING game_id
                )
                UPDATE games SET is_active = FALSE, published_at = NULL, updated_at = now()
                WHERE id IN (SELECT game_id FROM hidden)
            `, [request.params.slug]);
            if (result.rowCount === 0) return reply.code(404).send({ error: 'Game not found' });
            deleteCachePrefix(COMMUNITY_CACHE_KEY);
            return { data: { ok: true } };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    // --- Connected AIs (their arcade tokens) ------------------------------------------------------

    fastify.get('/tokens', async (request, reply) => {
        try {
            const result = await pool.query(`
                SELECT id, name, token_prefix, last_used_at, created_at
                FROM arcade_api_tokens
                WHERE user_id = $1 AND revoked_at IS NULL
                ORDER BY created_at DESC
            `, [request.user.sub]);
            return {
                data: result.rows.map((row) => ({
                    id: Number(row.id),
                    name: row.name,
                    prefix: row.token_prefix,
                    lastUsedAt: row.last_used_at,
                    createdAt: row.created_at,
                })),
            };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    // An MCP server signing out revokes its own token
    fastify.delete('/tokens/current', async (request, reply) => {
        if (!request.user.arcadeTokenId) {
            return reply.code(400).send({ error: 'Only an arcade token can revoke itself' });
        }
        try {
            await pool.query('UPDATE arcade_api_tokens SET revoked_at = now() WHERE id = $1', [request.user.arcadeTokenId]);
            return { data: { ok: true } };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    fastify.delete('/tokens/:id', async (request, reply) => {
        const tokenId = parseId(request.params.id);
        if (!tokenId) return reply.code(400).send({ error: 'Bad token id' });
        try {
            const result = await pool.query(`
                UPDATE arcade_api_tokens SET revoked_at = now()
                WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
            `, [tokenId, request.user.sub]);
            if (result.rowCount === 0) return reply.code(404).send({ error: 'Token not found' });
            return { data: { ok: true } };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });
}

// --- Signing an AI in (device login) ---------------------------------------------------------------
// The MCP server calls /device/start and shows the player the link; the
// player approves on /arcade/connect (session only); the MCP server polls
// /device/poll with its secret device code and gets a new arcade token.

async function deviceRoutes(fastify) {
    // Public: the MCP server has no credentials yet
    fastify.post('/start', { config: { rateLimit: ROUTE_LIMITS.deviceStart } }, async (request, reply) => {
        const clientName = typeof request.body?.clientName === 'string' && request.body.clientName.trim()
            ? request.body.clientName.trim().slice(0, CLIENT_NAME_MAX)
            : 'An AI assistant';
        try {
            await pool.query(`DELETE FROM arcade_device_logins WHERE expires_at < now() - interval '1 day'`);

            const { deviceCode, deviceCodeHash } = mintDeviceCode();
            for (let attempt = 0; attempt < 5; attempt += 1) {
                const userCode = mintUserCode();
                try {
                    await pool.query(`
                        INSERT INTO arcade_device_logins (device_code_hash, user_code, client_name, expires_at)
                        VALUES ($1, $2, $3, now() + make_interval(mins => $4))
                    `, [deviceCodeHash, userCode, clientName, DEVICE_LOGIN_TTL_MINUTES]);
                    return {
                        data: {
                            deviceCode,
                            userCode,
                            verificationUrl: `${SITE_URL}/arcade/connect`,
                            verificationUrlComplete: `${SITE_URL}/arcade/connect?code=${userCode}`,
                            expiresIn: DEVICE_LOGIN_TTL_MINUTES * 60,
                            interval: DEVICE_POLL_INTERVAL_SECONDS,
                        },
                    };
                } catch (error) {
                    // A user code clash: pick another
                    if (error.code !== '23505') throw error;
                }
            }
            throw new Error('Could not pick a free sign-in code');
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    // Public: the device code is the credential
    fastify.post('/poll', { config: { rateLimit: ROUTE_LIMITS.devicePoll } }, async (request, reply) => {
        const deviceCode = request.body?.deviceCode;
        if (typeof deviceCode !== 'string' || !deviceCode) {
            return reply.code(400).send({ error: 'deviceCode is required' });
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const found = await client.query(`
                SELECT l.*, l.expires_at < now() AS expired, u.username
                FROM arcade_device_logins l
                LEFT JOIN users u ON u.id = l.user_id
                WHERE l.device_code_hash = $1
                FOR UPDATE OF l
            `, [hashArcadeToken(deviceCode)]);
            const login = found.rows[0];
            if (!login) {
                await client.query('ROLLBACK');
                return reply.code(404).send({ data: { status: 'invalid' } });
            }
            if (login.status === 'denied' || login.status === 'completed' || login.expired) {
                await client.query('ROLLBACK');
                return { data: { status: login.status === 'denied' ? 'denied' : 'expired' } };
            }
            if (login.status === 'pending') {
                await client.query('ROLLBACK');
                return { data: { status: 'pending' } };
            }

            // Approved: mint the token now, so it's never stored anywhere
            const { token, tokenHash, tokenPrefix } = mintArcadeToken();
            const inserted = await client.query(`
                INSERT INTO arcade_api_tokens (user_id, name, token_hash, token_prefix)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, [login.user_id, login.client_name, tokenHash, tokenPrefix]);
            await client.query(`
                UPDATE arcade_device_logins SET status = 'completed', token_id = $2 WHERE id = $1
            `, [login.id, inserted.rows[0].id]);
            await client.query('COMMIT');
            return { data: { status: 'approved', token, username: login.username } };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            return sendError(reply, error, fastify.log);
        } finally {
            client.release();
        }
    });

    // Session only (not an arcade token): what the approve page shows
    fastify.get('/:code', async (request, reply) => {
        const userCode = normalizeUserCode(request.params.code);
        if (!userCode) return reply.code(404).send({ error: "That code doesn't look right" });
        try {
            const found = await pool.query(`
                SELECT user_code, client_name, status, created_at, expires_at < now() AS expired
                FROM arcade_device_logins WHERE user_code = $1
            `, [userCode]);
            const login = found.rows[0];
            if (!login) return reply.code(404).send({ error: 'No sign-in with that code' });
            return {
                data: {
                    userCode: login.user_code,
                    clientName: login.client_name,
                    status: login.status === 'pending' && login.expired ? 'expired' : login.status,
                    createdAt: login.created_at,
                },
            };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    fastify.post('/:code/approve', async (request, reply) => {
        const userCode = normalizeUserCode(request.params.code);
        if (!userCode) return reply.code(404).send({ error: "That code doesn't look right" });
        try {
            const active = await pool.query(
                'SELECT COUNT(*)::int AS count FROM arcade_api_tokens WHERE user_id = $1 AND revoked_at IS NULL',
                [request.user.sub]
            );
            if (active.rows[0].count >= MAX_ACTIVE_TOKENS) {
                return reply.code(403).send({ error: `You have ${MAX_ACTIVE_TOKENS} connected AIs already. Disconnect one first.` });
            }
            const result = await pool.query(`
                UPDATE arcade_device_logins
                SET status = 'approved', user_id = $2,
                    expires_at = now() + make_interval(mins => $3)
                WHERE user_code = $1 AND status = 'pending' AND expires_at >= now()
            `, [userCode, request.user.sub, DEVICE_LOGIN_COLLECT_MINUTES]);
            if (result.rowCount === 0) {
                return reply.code(409).send({ error: 'This sign-in has expired or was already answered. Ask your AI to sign in again.' });
            }
            return { data: { ok: true } };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });

    fastify.post('/:code/deny', async (request, reply) => {
        const userCode = normalizeUserCode(request.params.code);
        if (!userCode) return reply.code(404).send({ error: "That code doesn't look right" });
        try {
            await pool.query(`
                UPDATE arcade_device_logins SET status = 'denied'
                WHERE user_code = $1 AND status = 'pending'
            `, [userCode]);
            return { data: { ok: true } };
        } catch (error) {
            return sendError(reply, error, fastify.log);
        }
    });
}

async function allRoutes(fastify) {
    fastify.register(routes);
    fastify.register(deviceRoutes, { prefix: '/device' });
}

export default allRoutes;
