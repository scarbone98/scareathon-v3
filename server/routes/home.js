import { getLeaderboardPayload } from './leaderboard.js';
import { getGameLeaderboardPayload } from './games.js';
import { getPostsPayload } from './posts.js';
import { getUnreadInboxCount } from './inbox.js';
import { getWalletPayload } from './user.js';

const FEATURED_GAME_NAME = '8 Bit Evil Returns';
const FEATURED_GAME_SUMMARY = {
    name: FEATURED_GAME_NAME,
    leader: null,
    highScore: null,
};
const LATEST_POST_DESCRIPTION_LENGTH = 340;
const DEFAULT_SOURCE_TIMEOUT_MS = 4000;

function getSourceTimeoutMs() {
    const parsed = Number.parseInt(process.env.HOME_SUMMARY_SOURCE_TIMEOUT_MS || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SOURCE_TIMEOUT_MS;
}

function createTimeoutError(source, timeoutMs) {
    const error = new Error(`Home summary source "${source}" timed out after ${timeoutMs}ms`);
    error.code = 'HOME_SUMMARY_SOURCE_TIMEOUT';
    error.source = source;
    return error;
}

async function withSourceTiming(fastify, source, task, { timeoutMs = getSourceTimeoutMs() } = {}) {
    const startedAt = Date.now();
    let timeoutId;

    try {
        const result = await Promise.race([
            Promise.resolve().then(task),
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(createTimeoutError(source, timeoutMs));
                }, timeoutMs);
            }),
        ]);
        const elapsedMs = Date.now() - startedAt;

        if (elapsedMs >= 1000) {
            fastify.log.info({ source, elapsedMs }, 'Home summary source completed slowly');
        }

        return result;
    } catch (err) {
        fastify.log.warn({
            err,
            source,
            elapsedMs: Date.now() - startedAt,
            timeoutMs,
        }, 'Home summary source failed');
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}

function normalizeWhitespace(value) {
    return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value, maxLength) {
    const normalized = normalizeWhitespace(value);
    if (normalized.length <= maxLength) {
        return normalized;
    }

    const truncated = normalized.slice(0, maxLength).replace(/\s+\S*$/, '');
    return `${truncated || normalized.slice(0, maxLength)}...`;
}

function collectBlockText(value) {
    if (!value) return [];

    if (typeof value === 'string') {
        return [value];
    }

    if (Array.isArray(value)) {
        return value.flatMap(collectBlockText);
    }

    if (typeof value === 'object') {
        const text = typeof value.text === 'string' ? [value.text] : [];
        const children = Array.isArray(value.children)
            ? value.children.flatMap(collectBlockText)
            : [];
        return [...text, ...children];
    }

    return [];
}

function getPostDescription(post) {
    const explicitDescription =
        post.description ||
        post.Description ||
        post.excerpt ||
        post.Excerpt ||
        post.summary ||
        post.Summary;
    const blockDescription = collectBlockText(post.Content).join(' ');
    const description = explicitDescription || blockDescription;

    return description ? truncateText(description, LATEST_POST_DESCRIPTION_LENGTH) : null;
}

function normalizeLatestPost(post) {
    if (!post) return null;

    const firstImage = Array.isArray(post.Image) ? post.Image[0] : null;
    const description = getPostDescription(post);

    return {
        id: post.id,
        documentId: post.documentId,
        Title: post.Title,
        title: post.title,
        publishedAt: post.publishedAt,
        createdAt: post.createdAt,
        description,
        excerpt: description,
        image: firstImage ? {
            url: firstImage.url,
            alternativeText: firstImage.alternativeText || post.Title || post.title || '',
        } : null,
    };
}

function toSettledData(result, fallback = null) {
    return result.status === 'fulfilled' ? result.value : fallback;
}

function normalizeFeaturedGameSummary(leader) {
    if (!leader) {
        return FEATURED_GAME_SUMMARY;
    }

    return {
        name: FEATURED_GAME_NAME,
        leader,
        highScore: {
            username: leader.username,
            value: leader.metricValue,
            achievedAt: leader.achieved_at,
        },
    };
}

async function getHomeSummaryPublicData(fastify, currentUserId = null) {
    const [leaderboardResult, featuredGameResult, postsResult] = await Promise.allSettled([
        withSourceTiming(fastify, 'leaderboard', () => getLeaderboardPayload()),
        withSourceTiming(fastify, 'featuredGameLeaderboard', () => getGameLeaderboardPayload({
            game: FEATURED_GAME_NAME,
            metric: 'score',
            limit: 1,
            currentUserId
        })),
        withSourceTiming(fastify, 'posts', () => getPostsPayload()),
    ]);

    const leaderboard = toSettledData(leaderboardResult);
    const featuredGameLeaderboard = toSettledData(featuredGameResult);
    const featuredGameLeader = featuredGameLeaderboard?.data?.[0] || null;
    const posts = toSettledData(postsResult);

    return {
        leaderboard: leaderboard ? {
            leader: leaderboard.data?.[0] || null,
            meta: leaderboard.meta || null,
        } : null,
        featuredGame: normalizeFeaturedGameSummary(featuredGameLeader),
        latestPost: normalizeLatestPost(posts?.data?.[0]),
    };
}

export default async function (fastify, options) {
    fastify.get('/summary', async (request, reply) => {
        const userId = request.user.sub;

        const [overviewResult, walletResult, inboxResult] = await Promise.allSettled([
            getHomeSummaryPublicData(fastify, userId),
            withSourceTiming(fastify, 'wallet', () => getWalletPayload(userId, { includeTransactions: false })),
            withSourceTiming(fastify, 'inboxUnreadCount', () => getUnreadInboxCount(userId)),
        ]);

        const summaryPublicData = toSettledData(overviewResult, {});
        const wallet = toSettledData(walletResult);
        const unreadCount = toSettledData(inboxResult, 0);

        reply.header('Cache-Control', 'private, max-age=30, stale-while-revalidate=30');

        return {
            data: {
                leaderboard: summaryPublicData.leaderboard || null,
                featuredGame: summaryPublicData.featuredGame || FEATURED_GAME_SUMMARY,
                latestPost: summaryPublicData.latestPost || null,
                wallet: wallet ? {
                    coinBalance: wallet.coinBalance,
                } : null,
                inbox: {
                    unreadCount,
                },
            },
        };
    });
}
