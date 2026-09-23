import { getOrRefreshCache } from '../utils/cacheManager.js';

const POSTS_TTL = 5 * 60 * 1000;
const CLIENT_CACHE_SECONDS = 5 * 60;

function setReadCacheHeaders(reply) {
    reply.header('Cache-Control', `private, max-age=${CLIENT_CACHE_SECONDS}, stale-while-revalidate=60`);
}

function buildPostsUrl({ limit = null } = {}) {
    const baseUrl = process.env.STRAPI_URL.replace(/\/$/, '');
    const url = new URL(`${baseUrl}/api/posts`);

    url.searchParams.set('populate', '*');
    url.searchParams.set('sort', 'createdAt:desc');

    if (limit) {
        url.searchParams.set('pagination[limit]', String(limit));
    }

    return url;
}

function normalizeLimit(limit, fallback) {
    const parsed = Number.parseInt(limit, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchPostsJson(url) {
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
        }
    });

    if (!response.ok) {
        throw new Error(`Strapi API error: ${response.status}`);
    }

    return response.json();
}

export async function getPostsPayload() {
    const cacheKey = 'posts:list';

    return getOrRefreshCache(cacheKey, async () => {
        return fetchPostsJson(buildPostsUrl());
    }, POSTS_TTL);
}

export async function getRecentPostsPayload({ limit = 5 } = {}) {
    const boundedLimit = Math.min(normalizeLimit(limit, 5), 10);
    const cacheKey = `posts:recent:${boundedLimit}`;

    return getOrRefreshCache(cacheKey, async () => {
        return fetchPostsJson(buildPostsUrl({ limit: boundedLimit }));
    }, POSTS_TTL);
}

export default async function (fastify, options) {
    fastify.get('/posts', async (request, reply) => {
        try {
            const data = await getPostsPayload();
            setReadCacheHeaders(reply);
            return data;
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    fastify.get('/post/:documentId', async (request, reply) => {
        const { documentId } = request.params;

        if (!documentId || typeof documentId !== 'string' || documentId.trim() === '') {
            return reply.code(400).send({ error: 'Invalid post documentId' });
        }

        const cacheKey = `posts:detail:${documentId}`;

        try {
            const data = await getOrRefreshCache(cacheKey, async () => {
                const response = await fetch(`${process.env.STRAPI_URL}/api/posts/${documentId}?populate=*`, {
                    headers: {
                        'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
                    }
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        const error = new Error('Post not found');
                        error.statusCode = 404;
                        throw error;
                    }
                    throw new Error(`Strapi API error: ${response.status}`);
                }

                const postData = await response.json();

                if (!postData.data) {
                    const error = new Error('Post not found');
                    error.statusCode = 404;
                    throw error;
                }

                return postData;
            }, POSTS_TTL);
            setReadCacheHeaders(reply);
            return data;
        } catch (error) {
            if (error.statusCode === 404) {
                return reply.code(404).send({ error: 'Post not found' });
            }

            fastify.log.error(error);
            reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
