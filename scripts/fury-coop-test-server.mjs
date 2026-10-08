// Isolated loopback fixture: real room/save routes, memory sheets, no real accounts.
import Fastify from '../server/node_modules/fastify/fastify.js';
import cors from '../server/node_modules/@fastify/cors/index.js';
import coopRoutes from '../server/routes/waysideFuryCoop.js';
import saveRoutes from '../server/routes/waysideFury.js';
import { readFile } from 'node:fs/promises';

export async function startFuryTestServer(port = 3000) {
  if (process.env.NODE_ENV === 'production') throw new Error('The co-op browser fixture cannot run in production.');
  const app = Fastify();
  const sheets = new Map();
  const users = new Map([['dev-host', 'Host Kid'], ['dev-guest', 'Guest Kid']]);
  const db = { async query(sql, values) {
    const [id, raw, revision] = values;
    if (sql.includes('SELECT username')) return { rows: users.has(id) ? [{ username: users.get(id) }] : [] };
    if (sql.includes('SELECT save')) return { rows: sheets.has(id) ? [structuredClone(sheets.get(id))] : [] };
    const row = sheets.get(id);
    if (sql.includes('INSERT INTO') && !row || sql.includes('UPDATE wayside_fury_saves') && row?.revision === revision) {
      const next = { save: JSON.parse(raw), revision: (row?.revision ?? 0) + 1 }; sheets.set(id, next);
      return { rows: [{ revision: next.revision }] };
    }
    return { rows: [] };
  } };
  await app.register(cors, { origin: true });
  app.addHook('preValidation', async request => {
    // Only synthetic fixture subjects are recognized. This hook is never registered
    // by server/index.js or the Vite app and the listener is loopback only.
    try {
      const payload = JSON.parse(Buffer.from(request.headers.authorization?.split('.')[1] ?? '', 'base64url').toString());
      if (users.has(payload.sub)) request.user = { sub: payload.sub };
    } catch { /* Unknown credentials stay unauthenticated. */ }
  });
  await app.register(coopRoutes, { prefix: '/wayside-fury/coop', db, env: { NODE_ENV: 'development', WAYSIDE_FURY_DEV_AUTH: 'true' } });
  await app.register(saveRoutes, { prefix: '/wayside-fury', db });
  const manifest = JSON.parse(await readFile(new URL('../public/avatar-px/manifest.json', import.meta.url), 'utf8'));
  app.get('/user/avatar', async request => {
    const keys = request.user?.sub === 'dev-host' ? ['body_kid', 'hair_bob'] : ['body_kid', 'hair_spikes'];
    const outfit = manifest.items.filter(item => keys.includes(item.key)).map((item, i) => ({ itemInstanceId: i + 1, dyes: {}, item: { ...item, id: i + 1, itemKey: item.key, basePrice: 0 } }));
    return { data: { profile: { lookChosen: true, skin: 'peach', hair: request.user?.sub === 'dev-host' ? 'sandy' : 'ink', eyes: 'ink_eye' }, outfit, inventory: [] } };
  });
  await app.listen({ host: '127.0.0.1', port });
  return { app, sheets };
}
