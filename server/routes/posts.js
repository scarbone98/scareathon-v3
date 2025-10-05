export default async function (fastify, options) {
    fastify.get('/posts', async (request, reply) => {
        try {
            const response = await fetch(`${process.env.STRAPI_URL}/api/posts?populate=*&sort=createdAt:desc`, {
                headers: {
                    'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
                }
            });
            const data = await response.json();
            return data;
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    fastify.get('/post/:documentId', async (request, reply) => {
        try {
            const { documentId } = request.params;

            // Validate documentId parameter
            if (!documentId || typeof documentId !== 'string' || documentId.trim() === '') {
                return reply.code(400).send({ error: 'Invalid post documentId' });
            }

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

            // Validate that we got post data
            if (!data.data) {
                return reply.code(404).send({ error: 'Post not found' });
            }

            return data;
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}