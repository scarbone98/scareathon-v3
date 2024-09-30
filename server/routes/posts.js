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
}