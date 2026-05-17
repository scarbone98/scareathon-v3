import pool from '../db/mockDB.js';
import { getCache, getStaleCache, setCache } from '../utils/cacheManager.js';

const WEEKLY_CHALLENGE_TTL = 5 * 60 * 1000;
const CONTENT_LOOP_TTL = 5 * 60 * 1000;
const CLIENT_CACHE_SECONDS = 5 * 60;
const WEEKLY_CHALLENGE_SOURCE_TYPE = 'weekly_challenge';
const ARCADE_SCORE_VERIFICATION_TYPES = new Set(['arcade_score', 'game_score']);
const COMPARISON_OPERATORS = new Set(['>=', '>', '<=', '<', '=']);

function setReadCacheHeaders(reply) {
    reply.header('Cache-Control', `private, max-age=${CLIENT_CACHE_SECONDS}, stale-while-revalidate=60`);
}

function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing ${name}`);
    }
    return value;
}

function buildStrapiUrl(path, params = null) {
    const baseUrl = getRequiredEnv('STRAPI_URL').replace(/\/$/, '');
    const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, value);
            }
        }
    }
    return url;
}

async function fetchStrapiJson(path, params = null) {
    const response = await fetch(buildStrapiUrl(path, params), {
        headers: {
            Authorization: `Bearer ${getRequiredEnv('STRAPI_TOKEN')}`,
        },
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
        const message = body?.error?.message || body?.error || `Strapi returned ${response.status}`;
        throw new Error(message);
    }

    return body;
}

function getFields(entry) {
    return entry?.attributes ? { ...entry.attributes, id: entry.id, documentId: entry.documentId } : entry;
}

function normalizeDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parsePositiveInteger(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseFiniteNumber(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeComparisonOperator(value) {
    const operator = typeof value === 'string' ? value.trim() : '';
    return COMPARISON_OPERATORS.has(operator) ? operator : '>=';
}

function compareMetricValue(metricValue, targetMetricValue, comparisonOperator = '>=') {
    const metric = Number(metricValue);
    const target = Number(targetMetricValue);
    if (!Number.isFinite(metric) || !Number.isFinite(target)) return false;

    switch (comparisonOperator) {
        case '>':
            return metric > target;
        case '<=':
            return metric <= target;
        case '<':
            return metric < target;
        case '=':
            return metric === target;
        case '>=':
        default:
            return metric >= target;
    }
}

function collectBlockText(value) {
    if (!value) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(collectBlockText);
    if (typeof value === 'object') {
        const text = typeof value.text === 'string' ? [value.text] : [];
        const children = Array.isArray(value.children)
            ? value.children.flatMap(collectBlockText)
            : [];
        return [...text, ...children];
    }
    return [];
}

function truncateText(value, maxLength = 240) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    const truncated = normalized.slice(0, maxLength).replace(/\s+\S*$/, '');
    return `${truncated || normalized.slice(0, maxLength)}...`;
}

function firstMediaUrl(media) {
    const data = media?.data || media;
    const first = Array.isArray(data) ? data[0] : data;
    const asset = first?.attributes || first;
    return asset?.url ? {
        url: asset.url,
        alternativeText: asset.alternativeText || '',
    } : null;
}

export function normalizeWeeklyChallenge(entry) {
    const fields = getFields(entry);
    if (!fields) return null;

    const title = fields.title || fields.Title || fields.name || fields.Name || '';
    const content = fields.content || fields.Content || fields.body || fields.Body || null;
    const summary = fields.summary || fields.Summary || fields.description || fields.Description || '';
    const contentSummary = collectBlockText(content).join(' ');
    const documentId = fields.documentId || fields.slug || fields.id;

    if (!title || !documentId) return null;

    return {
        id: fields.id,
        documentId: String(documentId),
        slug: fields.slug || fields.Slug || String(documentId),
        title,
        summary: truncateText(summary || contentSummary),
        content,
        startsAt: normalizeDate(fields.startsAt || fields.StartsAt || fields.startDate),
        endsAt: normalizeDate(fields.endsAt || fields.EndsAt || fields.endDate),
        points: parsePositiveInteger(fields.points || fields.Points, 1),
        rewardCoins: parsePositiveInteger(fields.rewardCoins || fields.RewardCoins || fields.coinReward || fields.CoinReward, 0),
        verificationType: fields.verificationType || fields.VerificationType || fields.completionType || fields.CompletionType || null,
        gameName: fields.gameName || fields.GameName || fields.game || fields.Game || null,
        metricName: fields.metricName || fields.MetricName || 'score',
        targetMetricValue: parseFiniteNumber(fields.targetMetricValue || fields.TargetMetricValue || fields.targetScore || fields.TargetScore, null),
        comparisonOperator: normalizeComparisonOperator(fields.comparisonOperator || fields.ComparisonOperator),
        status: fields.status || fields.Status || (fields.publishedAt ? 'published' : 'draft'),
        publishedAt: normalizeDate(fields.publishedAt),
        image: firstMediaUrl(fields.image || fields.Image || fields.heroImage || fields.HeroImage),
    };
}

export function isWeeklyChallengeActive(challenge, date = new Date()) {
    if (!challenge) return false;
    const now = date.getTime();
    const startsAt = challenge.startsAt ? new Date(challenge.startsAt).getTime() : null;
    const endsAt = challenge.endsAt ? new Date(challenge.endsAt).getTime() : null;
    const isPublished = challenge.status === 'published';

    return isPublished &&
        (startsAt === null || startsAt <= now) &&
        (endsAt === null || endsAt >= now);
}

export function normalizePostLoopItem(post) {
    const fields = getFields(post);
    if (!fields) return null;

    const title = fields.Title || fields.title || '';
    const documentId = fields.documentId || fields.id;
    if (!title || !documentId) return null;

    const content = fields.Content || fields.content || null;
    const summary =
        fields.description ||
        fields.Description ||
        fields.excerpt ||
        fields.Excerpt ||
        fields.summary ||
        fields.Summary ||
        collectBlockText(content).join(' ');

    return {
        type: 'announcement',
        id: `announcement:${documentId}`,
        documentId: String(documentId),
        title,
        summary: truncateText(summary),
        publishedAt: normalizeDate(fields.publishedAt || fields.createdAt),
        image: firstMediaUrl(fields.Image || fields.image),
        href: `/post/${documentId}`,
        ctaLabel: 'Read Post',
    };
}

export function normalizeChallengeLoopItem(challenge) {
    if (!challenge) return null;
    const isActive = isWeeklyChallengeActive(challenge);

    return {
        type: 'weekly_challenge',
        id: `weekly_challenge:${challenge.documentId}`,
        documentId: challenge.documentId,
        title: challenge.title,
        summary: challenge.summary,
        publishedAt: challenge.startsAt,
        startsAt: challenge.startsAt,
        endsAt: challenge.endsAt,
        isActive,
        points: challenge.points,
        rewardCoins: challenge.rewardCoins,
        verificationType: challenge.verificationType,
        gameName: challenge.gameName,
        metricName: challenge.metricName,
        targetMetricValue: challenge.targetMetricValue,
        comparisonOperator: challenge.comparisonOperator,
        image: challenge.image,
        href: '/scareathon',
        ctaLabel: challenge.rewardCoins > 0 ? 'Claim Coins' : 'View Challenge',
    };
}

export async function getCurrentWeeklyChallengePayload({ date = new Date() } = {}) {
    const cacheKey = `weekly_challenge_current_${date.toISOString().slice(0, 10)}`;
    const cachedData = getCache(cacheKey);
    if (cachedData) {
        return cachedData;
    }

    try {
        const body = await fetchStrapiJson('/api/weekly-challenges', {
            populate: '*',
            'sort[0]': 'startsAt:desc',
            'pagination[limit]': '25',
            'filters[startsAt][$lte]': date.toISOString(),
            'filters[endsAt][$gte]': date.toISOString(),
        });
        const challenges = (body?.data || [])
            .map(normalizeWeeklyChallenge)
            .filter((challenge) => isWeeklyChallengeActive(challenge, date));
        const payload = { data: challenges[0] || null };

        setCache(cacheKey, payload, WEEKLY_CHALLENGE_TTL);
        return payload;
    } catch (error) {
        const staleData = getStaleCache(cacheKey);
        if (staleData) return staleData;
        throw error;
    }
}

export async function getRecentWeeklyChallengesPayload({ date = new Date(), limit = 2 } = {}) {
    const boundedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 2, 1), 5);
    const cacheKey = `weekly_challenge_recent_${date.toISOString().slice(0, 10)}_${boundedLimit}`;
    const cachedData = getCache(cacheKey);
    if (cachedData) {
        return cachedData;
    }

    try {
        const body = await fetchStrapiJson('/api/weekly-challenges', {
            populate: '*',
            'sort[0]': 'startsAt:desc',
            'pagination[limit]': String(boundedLimit),
            'filters[startsAt][$lte]': date.toISOString(),
        });
        const challenges = (body?.data || [])
            .map(normalizeWeeklyChallenge)
            .filter((challenge) => challenge?.status === 'published')
            .slice(0, boundedLimit);
        const payload = { data: challenges };

        setCache(cacheKey, payload, WEEKLY_CHALLENGE_TTL);
        return payload;
    } catch (error) {
        const staleData = getStaleCache(cacheKey);
        if (staleData) return staleData;
        throw error;
    }
}

export async function getWeeklyChallengeByDocumentId(documentId) {
    const body = await fetchStrapiJson(`/api/weekly-challenges/${encodeURIComponent(documentId)}`, {
        populate: '*',
    });
    return normalizeWeeklyChallenge(body?.data);
}

export async function getContentLoopPayload({ getPostsPayload, date = new Date() }) {
    const cacheKey = `content_loop_${date.toISOString().slice(0, 10)}`;
    const cachedData = getCache(cacheKey);
    if (cachedData) {
        return cachedData;
    }

    try {
        const [postsResult, challengeResult] = await Promise.allSettled([
            getPostsPayload(),
            getRecentWeeklyChallengesPayload({ date, limit: 2 }),
        ]);
        const posts = postsResult.status === 'fulfilled' ? postsResult.value?.data || [] : [];
        const challenges = challengeResult.status === 'fulfilled' ? challengeResult.value?.data || [] : [];
        const items = [
            ...challenges.map(normalizeChallengeLoopItem),
            ...posts.slice(0, 5).map(normalizePostLoopItem),
        ].filter(Boolean);
        const payload = { data: items };

        setCache(cacheKey, payload, CONTENT_LOOP_TTL);
        return payload;
    } catch (error) {
        const staleData = getStaleCache(cacheKey);
        if (staleData) return staleData;
        throw error;
    }
}

async function getExistingWeeklyChallengeGrant(client, userId, documentId) {
    const result = await client.query(`
        SELECT balance_after
        FROM currency_transactions
        WHERE user_id = $1
          AND source_type = $2
          AND source_id = $3
        ORDER BY id DESC
        LIMIT 1
    `, [userId, WEEKLY_CHALLENGE_SOURCE_TYPE, documentId]);

    return result.rows[0] || null;
}

function isArcadeScoreChallenge(challenge) {
    return ARCADE_SCORE_VERIFICATION_TYPES.has(challenge?.verificationType) &&
        Boolean(challenge.gameName) &&
        Boolean(challenge.metricName) &&
        Number.isFinite(challenge.targetMetricValue);
}

export function scoreSubmissionCompletesChallenge(challenge, submission) {
    if (!isArcadeScoreChallenge(challenge)) return false;
    if (submission.game !== challenge.gameName) return false;
    if (submission.metricName !== challenge.metricName) return false;
    return compareMetricValue(
        submission.metricValue,
        challenge.targetMetricValue,
        challenge.comparisonOperator
    );
}

export async function getVerifiedWeeklyChallengeCompletion(client, userId, challenge, submission = null) {
    if (!isArcadeScoreChallenge(challenge)) {
        return { completed: false, reason: 'unsupported_verification_type' };
    }

    if (submission && scoreSubmissionCompletesChallenge(challenge, submission)) {
        return {
            completed: true,
            evidence: {
                type: 'arcade_score',
                source: 'current_submission',
                game: submission.game,
                metricName: submission.metricName,
                metricValue: Number(submission.metricValue),
                leaderboardId: submission.leaderboardId || null,
            },
        };
    }

    const startsAt = challenge.startsAt ? new Date(challenge.startsAt) : null;
    const endsAt = challenge.endsAt ? new Date(challenge.endsAt) : null;
    const result = await client.query(`
        SELECT l.id, l.metric_value, l.achieved_at, g.name AS game_name
        FROM leaderboards l
        JOIN games g ON l.game_id = g.id
        WHERE l.user_id = $1
          AND g.name = $2
          AND l.metric_name = $3
          AND ($4::timestamptz IS NULL OR l.achieved_at >= $4::timestamptz)
          AND ($5::timestamptz IS NULL OR l.achieved_at <= $5::timestamptz)
        ORDER BY l.achieved_at DESC
        LIMIT 100
    `, [
        userId,
        challenge.gameName,
        challenge.metricName,
        startsAt ? startsAt.toISOString() : null,
        endsAt ? endsAt.toISOString() : null,
    ]);

    const matchingScore = result.rows.find((row) => compareMetricValue(
        row.metric_value,
        challenge.targetMetricValue,
        challenge.comparisonOperator
    ));

    if (!matchingScore) {
        return { completed: false, reason: 'missing_required_score' };
    }

    return {
        completed: true,
        evidence: {
            type: 'arcade_score',
            source: 'leaderboard',
            game: matchingScore.game_name,
            metricName: challenge.metricName,
            metricValue: Number(matchingScore.metric_value),
            leaderboardId: Number(matchingScore.id),
            achievedAt: matchingScore.achieved_at,
        },
    };
}

export async function grantWeeklyChallengeReward(client, userId, challenge, evidence = null) {
    const existingGrant = await getExistingWeeklyChallengeGrant(client, userId, challenge.documentId);
    if (existingGrant) {
        return {
            claimed: false,
            alreadyClaimed: true,
            coinBalance: Number(existingGrant.balance_after),
            rewardCoins: challenge.rewardCoins,
        };
    }

    if (!challenge.rewardCoins) {
        return {
            claimed: false,
            alreadyClaimed: false,
            coinBalance: null,
            rewardCoins: 0,
        };
    }

    const walletResult = await client.query(`
        SELECT public.grant_currency($1, $2, $3, $4, $5::jsonb) AS coin_balance
    `, [
        userId,
        challenge.rewardCoins,
        WEEKLY_CHALLENGE_SOURCE_TYPE,
        challenge.documentId,
        JSON.stringify({
            challengeDocumentId: challenge.documentId,
            title: challenge.title,
            startsAt: challenge.startsAt,
            endsAt: challenge.endsAt,
            points: challenge.points,
            verificationType: challenge.verificationType,
            evidence,
        }),
    ]);

    return {
        claimed: true,
        alreadyClaimed: false,
        coinBalance: Number(walletResult.rows[0].coin_balance),
        rewardCoins: challenge.rewardCoins,
    };
}

export async function awardEligibleWeeklyChallengeRewards(client, userId, submission) {
    const payload = await getCurrentWeeklyChallengePayload();
    const challenge = payload.data;

    if (!challenge || !challenge.rewardCoins || !isWeeklyChallengeActive(challenge)) {
        return [];
    }

    const completion = await getVerifiedWeeklyChallengeCompletion(client, userId, challenge, submission);
    if (!completion.completed) {
        return [];
    }

    return [{
        challengeDocumentId: challenge.documentId,
        title: challenge.title,
        ...await grantWeeklyChallengeReward(client, userId, challenge, completion.evidence),
    }];
}

export default async function routes(fastify, options = {}) {
    fastify.get('/weekly-challenges/current', async (request, reply) => {
        try {
            const payload = await getCurrentWeeklyChallengePayload();
            setReadCacheHeaders(reply);
            return payload;
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching the weekly challenge' });
        }
    });

    fastify.get('/content-loop', async (request, reply) => {
        try {
            const payload = await getContentLoopPayload({ getPostsPayload: options.getPostsPayload });
            setReadCacheHeaders(reply);
            return payload;
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching the content loop' });
        }
    });

    fastify.get('/weekly-challenges/:documentId/reward-status', async (request, reply) => {
        const userId = request.user.sub;
        const { documentId } = request.params;

        if (!documentId || typeof documentId !== 'string') {
            return reply.code(400).send({ error: 'documentId is required' });
        }

        try {
            const existingGrant = await getExistingWeeklyChallengeGrant(pool, userId, documentId);
            return {
                data: {
                    alreadyClaimed: Boolean(existingGrant),
                    coinBalance: existingGrant ? Number(existingGrant.balance_after) : null,
                },
            };
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while fetching the weekly challenge reward status' });
        }
    });

    fastify.post('/weekly-challenges/:documentId/claim-reward', async (request, reply) => {
        const userId = request.user.sub;
        const { documentId } = request.params;

        if (!documentId || typeof documentId !== 'string') {
            return reply.code(400).send({ error: 'documentId is required' });
        }

        let challenge;
        try {
            challenge = await getWeeklyChallengeByDocumentId(documentId);
        } catch (error) {
            fastify.log.error(error);
            return reply.code(502).send({ error: 'Unable to verify the weekly challenge' });
        }

        if (!challenge) {
            return reply.code(404).send({ error: 'Weekly challenge not found' });
        }

        if (!isWeeklyChallengeActive(challenge)) {
            return reply.code(409).send({ error: 'Weekly challenge is not active' });
        }

        if (!challenge.rewardCoins) {
            return reply.code(400).send({ error: 'Weekly challenge has no coin reward' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const existingGrant = await getExistingWeeklyChallengeGrant(client, userId, challenge.documentId);
            if (existingGrant) {
                await client.query('COMMIT');
                return {
                    data: {
                        claimed: false,
                        alreadyClaimed: true,
                        coinBalance: Number(existingGrant.balance_after),
                        rewardCoins: challenge.rewardCoins,
                    },
                };
            }

            const completion = await getVerifiedWeeklyChallengeCompletion(client, userId, challenge);
            if (!completion.completed) {
                await client.query('ROLLBACK');
                return reply.code(409).send({
                    error: 'Weekly challenge completion has not been verified',
                    reason: completion.reason,
                });
            }

            const grant = await grantWeeklyChallengeReward(client, userId, challenge, completion.evidence);

            await client.query('COMMIT');

            return {
                data: {
                    ...grant,
                },
            };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            if (error?.code === '23505') {
                return reply.code(409).send({ error: 'Weekly challenge reward has already been claimed' });
            }
            fastify.log.error(error);
            return reply.code(500).send({ error: 'An error occurred while claiming the weekly challenge reward' });
        } finally {
            client.release();
        }
    });
}
