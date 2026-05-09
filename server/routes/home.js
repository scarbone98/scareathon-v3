import { getLeaderboardPayload } from './leaderboard.js';
import { getPostsPayload } from './posts.js';
import { getUnreadInboxCount } from './inbox.js';
import { getWalletPayload } from './user.js';

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

export default async function (fastify, options) {
    fastify.get('/summary', async (request, reply) => {
        const userId = request.user.sub;

        const [leaderboardResult, postsResult, walletResult, inboxResult] = await Promise.allSettled([
            getLeaderboardPayload(),
            getPostsPayload(),
            getWalletPayload(userId, { includeTransactions: false }),
            getUnreadInboxCount(userId),
        ]);

        for (const result of [leaderboardResult, postsResult, walletResult, inboxResult]) {
            if (result.status === 'rejected') {
                fastify.log.warn({ err: result.reason }, 'Home summary source failed');
            }
        }

        const leaderboard = toSettledData(leaderboardResult);
        const posts = toSettledData(postsResult);
        const wallet = toSettledData(walletResult);
        const unreadCount = toSettledData(inboxResult, 0);

        reply.header('Cache-Control', 'private, max-age=30, stale-while-revalidate=30');

        return {
            data: {
                leaderboard: leaderboard ? {
                    leader: leaderboard.data?.[0] || null,
                    meta: leaderboard.meta || null,
                } : null,
                latestPost: normalizeLatestPost(posts?.data?.[0]),
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
