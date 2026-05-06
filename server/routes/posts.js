import { getCache, getStaleCache, setCache } from '../utils/cacheManager.js';

const POSTS_TTL = 5 * 60 * 1000;
const CLIENT_CACHE_SECONDS = 5 * 60;

function setReadCacheHeaders(reply) {
    reply.header('Cache-Control', `private, max-age=${CLIENT_CACHE_SECONDS}, stale-while-revalidate=60`);
}

export default async function (fastify, options) {
    fastify.get('/posts', async (request, reply) => {
        const cacheKey = 'posts:list';
        const cachedData = getCache(cacheKey);
        if (cachedData) {
            setReadCacheHeaders(reply);
            return cachedData;
        }

        try {
            const response = await fetch(`${process.env.STRAPI_URL}/api/posts?populate=*&sort=createdAt:desc`, {
                headers: {
                    'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
                }
            });

            if (!response.ok) {
                throw new Error(`Strapi API error: ${response.status}`);
            }

            const data = await response.json();
            setCache(cacheKey, data, POSTS_TTL);
            setReadCacheHeaders(reply);
            return data;
        } catch (error) {
            const staleData = getStaleCache(cacheKey);
            if (staleData) {
                setReadCacheHeaders(reply);
                return staleData;
            }

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
        const cachedData = getCache(cacheKey);
        if (cachedData) {
            setReadCacheHeaders(reply);
            return cachedData;
        }

        try {
            const response = await fetch(`${process.env.STRAPI_URL}/api/posts/${documentId}?populate=*`, {
                headers: {
                    'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return reply.code(404).send({ error: 'Post not found' });
                }
                throw new Error(`Strapi API error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.data) {
                return reply.code(404).send({ error: 'Post not found' });
            }

            setCache(cacheKey, data, POSTS_TTL);
            setReadCacheHeaders(reply);
            return data;
        } catch (error) {
            const staleData = getStaleCache(cacheKey);
            if (staleData) {
                setReadCacheHeaders(reply);
                return staleData;
            }

            fastify.log.error(error);
            reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
