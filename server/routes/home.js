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

function normalizeLatestPost(post) {
    if (!post) return null;

    return {
        id: post.id,
        documentId: post.documentId,
        Title: post.Title,
        title: post.title,
        publishedAt: post.publishedAt,
        createdAt: post.createdAt,
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
        getLeaderboardPayload(),
        getGameLeaderboardPayload({
            game: FEATURED_GAME_NAME,
            metric: 'score',
            limit: 1,
            currentUserId
        }),
        getPostsPayload(),
    ]);

    for (const result of [leaderboardResult, featuredGameResult, postsResult]) {
        if (result.status === 'rejected') {
            fastify.log.warn({ err: result.reason }, 'Home summary source failed');
        }
    }

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
            getWalletPayload(userId, { includeTransactions: false }),
            getUnreadInboxCount(userId),
        ]);

        for (const result of [overviewResult, walletResult, inboxResult]) {
            if (result.status === 'rejected') {
                fastify.log.warn({ err: result.reason }, 'Home summary source failed');
            }
        }

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
