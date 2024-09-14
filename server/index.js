import Fastify from 'fastify'
import pool from './mockDB.js'

const fastify = Fastify({
    logger: true
})

// Declare a route
fastify.get('/', async (request, reply) => {
    return { hello: 'world' }
})

// Example route using the database
fastify.get('/users', async (request, reply) => {
    try {
        const result = await pool.query('SELECT * FROM users')
        return result.rows
    } catch (err) {
        fastify.log.error(err)
        reply.code(500).send({ error: 'Internal Server Error' })
    }
})

// Run the server!
const start = async () => {
    try {
        await fastify.listen({ port: 3000 })
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start()