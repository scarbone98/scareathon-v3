import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSaveStore, mergeSaves } from '../../src/pages/WaysideFury/game/cloud.ts';
import { makeNewGameSave, makeSave, progressReport, restoreSave, SAVE_KEY } from '../../src/pages/WaysideFury/game/save.ts';
import { newGame } from '../../src/pages/WaysideFury/game/sim.ts';
import { currentSave, makeServer, PLAYER, OTHER_PLAYER } from './helpers/waysideFurySaveFixtures.js';

function device(app, initial = null) {
  const values = new Map(initial ? [[SAVE_KEY, JSON.stringify(initial)]] : []), credits = [];
  let offline = false;
  const store = new CloudSaveStore({ getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    async (_user, method, body) => {
      if (offline) throw new Error('Offline');
      const response = await app.inject({ method, url: '/wayside-fury/save', ...(body ? { payload: body } : {}) });
      return { status: response.statusCode, body: response.json() };
    }, { onChange() {}, onReplaced() {}, onCredit: score => credits.push(score) });
  return { store, values, credits, offline: value => { offline = value; } };
}

test('account restart replaces cloud and local story, retains lore, and never credits replay', async () => {
  const { app, db } = await makeServer();
  const receipt = { areas: ['wayside', 'blast'], bosses: [], rooms: ['blast-1'], level: 6 };
  const prior = currentSave({ chapter: 2, candy: 90, ambientTaxiWrecked: true, foundItems: ['pickup-c1-road-crew'], lastReported: receipt });
  db.rows.set(PLAYER, { save: prior, revision: 1 });
  db.rows.set(OTHER_PLAYER, { save: prior, revision: 1 });
  const d = device(app);
  try {
    await d.store.load(PLAYER);
    const fresh = await d.store.newGame();
    assert.equal(fresh.candy, 0); assert.equal(fresh.character.level, 1); assert.equal(fresh.home, null);
    assert.deepEqual(fresh.areas, []); assert.deepEqual(fresh.foundItems, prior.foundItems);
    assert.equal(restoreSave(fresh).scene, 'prologue');
    assert.equal(JSON.parse(d.values.get(SAVE_KEY)).resetAt, fresh.resetAt);
    assert.equal(db.rows.get(PLAYER).save.resetAt, fresh.resetAt);
    assert.deepEqual(db.rows.get(OTHER_PLAYER).save, prior);
    assert.equal(mergeSaves(prior, fresh).resetAt, fresh.resetAt);
    assert.equal(mergeSaves(fresh, prior).resetAt, fresh.resetAt);
    assert.equal(mergeSaves(prior, fresh).ambientTaxiWrecked, false);
    assert.equal(mergeSaves(fresh, prior).ambientTaxiWrecked, false);
    const state = restoreSave(fresh);
    Object.assign(state, { areas: receipt.areas, clearedRooms: receipt.rooms, character: { level: 6, xp: 0 } });
    const replay = progressReport(state, d.store.save.lastReported);
    assert.equal(replay.score, 0);
    d.store.persist(makeSave(state, d.store.save, false, replay.receipt), true);
    await d.store.closeOnExit();
    assert.deepEqual(d.credits, []);
  } finally { d.store.dispose(); await app.close(); }
});

test('offline account reset leaves local and cloud progress intact; retry succeeds', async () => {
  const { app, db } = await makeServer();
  const prior = currentSave({ candy: 90 });
  db.rows.set(PLAYER, { save: prior, revision: 1 });
  const d = device(app);
  try {
    await d.store.load(PLAYER);
    const local = d.values.get(SAVE_KEY);
    d.offline(true);
    await assert.rejects(d.store.newGame());
    assert.equal(d.values.get(SAVE_KEY), local); assert.equal(d.store.save.candy, 90);
    assert.deepEqual(db.rows.get(PLAYER).save, prior);
    d.offline(false);
    assert.equal((await d.store.newGame()).candy, 0);
  } finally { d.store.dispose(); await app.close(); }
});

test('device-only restart retains receipt and Collection without account transport', async () => {
  const d = device(null, currentSave({ candy: 90, foundItems: ['pickup-c1-road-crew'] }));
  try {
    await d.store.load(null);
    const fresh = await d.store.newGame();
    assert.equal(fresh.candy, 0); assert.equal(restoreSave(fresh).scene, 'prologue');
    assert.deepEqual(fresh.foundItems, ['pickup-c1-road-crew']); assert.deepEqual(d.credits, []);
    assert.equal(makeNewGameSave(fresh).character.level, newGame().character.level);
  } finally { d.store.dispose(); }
});
