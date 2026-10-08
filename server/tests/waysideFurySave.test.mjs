// Node's native runner exercises concurrent device writes in addition to the
// repository's Jest schema/route suite: node --test server/tests/waysideFurySave.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { legacySave, makeServer } from './helpers/waysideFurySaveFixtures.js';

test('two device writes compare-and-swap: one wins and the loser adopts its revision and receipt', async () => {
    const { app } = await makeServer();
    try {
        const absent = await app.inject({ method: 'GET', url: '/wayside-fury/save' });
        assert.deepEqual(absent.json(), { save: null, revision: null });
        const initial = await app.inject({ method: 'PUT', url: '/wayside-fury/save', payload: { save: legacySave(), revision: null } });
        assert.equal(initial.json().revision, 1);
        const next = legacySave({ candy: 73, lastReported: { areas: ['wayside', 'blast'], bosses: ['blast-watcher'], rooms: ['blast-0', 'blast-1'], level: 4 } });
        const candidates = [next, legacySave({ candy: 2 })];
        const results = await Promise.all(candidates.map(save => app.inject({
            method: 'PUT', url: '/wayside-fury/save', payload: { save, revision: 1 } })));
        assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
        const conflict = results.find(r => r.statusCode === 409).json();
        const stored = (await app.inject({ method: 'GET', url: '/wayside-fury/save' })).json();
        assert.equal(conflict.revision, 2); assert.deepEqual(conflict.save, stored.save);
        const winner = candidates[results.findIndex(r => r.statusCode === 200)];
        assert.equal(stored.save.candy, winner.candy); assert.deepEqual(stored.save.lastReported, winner.lastReported);
    } finally { await app.close(); }
});

test('direct guest routes reject reads and writes and malformed/oversized authenticated sheets return400', async () => {
    const guest = await makeServer({ user: null }), player = await makeServer();
    try {
        for (const method of ['GET', 'PUT']) {
            const result = await guest.app.inject({ method, url: '/wayside-fury/save', ...(method === 'PUT' ? { payload: { save: legacySave(), revision: null } } : {}) });
            assert.equal(result.statusCode, 401);
        }
        for (const save of [{}, legacySave({ junk: '🎃'.repeat(17_000) })]) {
            const result = await player.app.inject({ method: 'PUT', url: '/wayside-fury/save', payload: { save, revision: null } });
            assert.equal(result.statusCode, 400);
        }
        assert.equal(player.db.queries.length, 0); assert.equal(guest.db.queries.length, 0);
    } finally { await guest.app.close(); await player.app.close(); }
});
