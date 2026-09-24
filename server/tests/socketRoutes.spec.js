import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cryptClashRoutes from '../routes/cryptClash.js';
import monsterBashRoutes from '../routes/monsterBash.js';

// index.js registers @fastify/websocket once at the root. Each registration
// adds its own raw 'upgrade' listener, so if a feature registered it again
// every connection would be handled twice. Both socket features must work
// side by side on the shared registration.
describe('socket routes share one websocket server', () => {
    test('Monster Bash and Crypt Clash sockets both answer', async () => {
        // The database is offline: Monster Bash keeps serving spectators.
        const offlineRepo = new Proxy({}, { get: () => async () => { throw new Error('offline'); } });
        const app = Fastify();
        await app.register(websocket);
        await app.register(monsterBashRoutes, { prefix: '/monster-bash', repo: offlineRepo });
        await app.register(cryptClashRoutes, { prefix: '/crypt-clash' });
        await app.ready();
        const sockets = [];
        try {
            const firstMessage = async (path, send) => {
                const socket = await app.injectWS(path);
                sockets.push(socket);
                const message = new Promise((resolve) => socket.once('message', (data) => resolve(JSON.parse(data.toString()))));
                if (send) socket.send(JSON.stringify(send));
                return message;
            };
            // Its hello goes out before a listener can attach; the viewer
            // count that follows still proves the socket is live.
            expect(['hello', 'chatHistory', 'viewers']).toContain((await firstMessage('/monster-bash/ws')).type);
            expect((await firstMessage('/crypt-clash/ws', { type: 'peek', code: 'nope' })).status).toBe('missing');
        } finally {
            sockets.forEach((socket) => socket.terminate());
            await app.close();
        }
    });
});
