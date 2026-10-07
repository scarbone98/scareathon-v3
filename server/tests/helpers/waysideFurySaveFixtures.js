import Fastify from 'fastify';
import waysideFuryRoutes from '../../routes/waysideFury.js';

export const PLAYER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const OTHER_PLAYER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export function hero(id, level = 1) {
    return { id, hp: 100, maxHp: 100, ki: 30, maxKi: 60, stamina: 80, maxStamina: 80,
        level, xp: 0, power: (id === 'joe' ? 12 : 13) + (level - 1) * 3,
        defense: (id === 'joe' ? 3 : 2) + level - 1, invulnerable: 0 };
}
export function legacySave(extra = {}) {
    return { version: 1, chapter: 1, heroes: { joe: hero('joe'), matt: hero('matt') },
        active: 'joe', party: ['joe', 'matt'], candy: 19, unlockedHeroes: ['joe', 'matt'],
        areas: ['wayside'], bosses: [], clearedRooms: ['blast-0'], kills: 3, deaths: 0,
        lastReported: { areas: ['wayside'], bosses: [], rooms: ['blast-0'], level: 1 }, home: null, ...extra };
}
// Model the same conditional INSERT / UPDATE semantics as PostgreSQL. No route
// mutates this fake directly, so the tests exercise its actual SQL parameters.
export function memoryDatabase() {
    const rows = new Map(), queries = [];
    return { rows, queries, async query(sql, values) {
        queries.push({ sql, values });
        const user = values[0], row = rows.get(user);
        if (/^\s*SELECT/.test(sql)) return { rows: row ? [structuredClone(row)] : [] };
        if (/^\s*INSERT/.test(sql)) {
            if (row) return { rows: [] };
            rows.set(user, { save: JSON.parse(values[1]), revision: 1 }); return { rows: [{ revision: 1 }] };
        }
        if (/^\s*UPDATE/.test(sql)) {
            if (!row || row.revision !== values[2]) return { rows: [] };
            row.save = JSON.parse(values[1]); row.revision++; return { rows: [{ revision: row.revision }] };
        }
        throw new Error('Unexpected SQL in Wayside Fury route');
    } };
}
export async function makeServer({ user = PLAYER, db = memoryDatabase() } = {}) {
    const app = Fastify({ logger: false });
    if (user) app.addHook('preHandler', async request => { request.user = { sub: user }; });
    await app.register(waysideFuryRoutes, { prefix: '/wayside-fury', db });
    await app.ready(); return { app, db };
}
