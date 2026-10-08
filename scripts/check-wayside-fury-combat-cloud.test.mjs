import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSaveStore } from '../src/pages/WaysideFury/game/cloud.ts';
import { SAVE_KEY, makeSave, parseSave } from '../src/pages/WaysideFury/game/save.ts';
import { newGame } from '../src/pages/WaysideFury/game/sim.ts';

const A = 'combat-account-a', B = 'combat-account-b';
const clone = value => value == null ? value : structuredClone(value);
const emptyReceipt = () => ({ areas: [], bosses: [], rooms: [], level: 1 });
function snapshot({ training = {}, chapter = 1, candy = 0, areas = [], bosses = [], rooms = [], receipt = emptyReceipt(), savedAt = 1000 } = {}) {
  const state = newGame();
  Object.assign(state, { chapter, candy, areas, bosses, clearedRooms: rooms });
  Object.assign(state.u1.combat.training, training);
  const save = makeSave(state, null, false, receipt);
  assert.ok(save, 'fixture uses the production save normalizer');
  save.savedAt = savedAt;
  return save;
}
class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
class AtomicServer {
  rows = new Map();
  calls = [];
  gates = [];
  failPuts = 0;
  seed(id, save, revision = 1) { this.rows.set(id, { save: clone(save), revision }); }
  deferNext(method, userId = A) {
    const started = deferred(), released = deferred();
    this.gates.push({ method, userId, started, released, claimed: false });
    return { started: started.promise, release: () => released.resolve() };
  }
  request = async (userId, method, body, signal, keepalive) => {
    const call = { userId, method, body: clone(body), signal, keepalive };
    this.calls.push(call);
    const gate = this.gates.find(g => !g.claimed && g.method === method && g.userId === userId);
    if (gate) {
      gate.claimed = true; gate.started.resolve(call);
      // Uncancellable transports still have to obey the store's account epoch.
      await gate.released.promise;
    }
    const row = this.rows.get(userId);
    if (method === 'GET') return { status: 200, body: row ? clone(row) : { save: null, revision: null } };
    assert.ok(body?.save);
    if (body.revision !== (row?.revision ?? null)) return { status: 409, body: row ? clone(row) : { save: null, revision: null } };
    if (this.failPuts-- > 0) return { status: 503, body: { error: 'Offline' } };
    const save = parseSave(body.save);
    assert.ok(save, 'server accepts only normalized production saves');
    const revision = (row?.revision ?? 0) + 1;
    this.rows.set(userId, { save, revision });
    return { status: 200, body: { revision } };
  };
}
function device(t) {
  const storage = new MemoryStorage(), server = new AtomicServer();
  const changes = [], replacements = [], credits = [];
  const store = new CloudSaveStore(storage, server.request, {
    onChange: value => changes.push(clone(value)),
    onReplaced: (save, reason) => replacements.push({ save: clone(save), reason }),
    onCredit: score => credits.push(score),
  });
  t.after(() => store.dispose());
  return { store, storage, server, changes, replacements, credits, status: () => changes.at(-1)?.status };
}
async function settle() { for (let turn = 0; turn < 12; turn++) await new Promise(resolve => setImmediate(resolve)); }
const localCheckpoint = (training = { you: 3 }) => snapshot({ training, chapter: 4, candy: 999, areas: ['wayside', 'blast'],
  bosses: ['blast-watcher'], rooms: ['blast-0', 'blast-1'],
  receipt: { areas: ['wayside', 'blast'], bosses: ['blast-watcher'], rooms: ['blast-0', 'blast-1'], level: 7 }, savedAt: 9000 });
const remoteWinner = (training = {}) => snapshot({ training, chapter: 2, candy: 109, areas: ['blast'], rooms: ['blast-0'],
  receipt: { areas: ['blast'], bosses: [], rooms: ['blast-0'], level: 2 }, savedAt: 2000 });
function withTraining(remote, training) {
  const next = clone(remote); Object.assign(next.u1.combat.training, training); return next;
}
function putsSince(server, start) { return server.calls.slice(start).filter(call => call.method === 'PUT'); }
async function ready(t) {
  const d = device(t); d.server.seed(A, snapshot());
  await d.store.load(A); await settle(); return d;
}

test('409 retains in-flight tier3 and persists only training over the remote campaign with zero credit', async t => {
  const d = await ready(t), remote = remoteWinner();
  d.server.seed(A, remote, 2);
  const gate = d.server.deferNext('PUT'), start = d.server.calls.length;
  d.store.persist(localCheckpoint(), true); await gate.started;
  gate.release(); await settle();
  const expected = withTraining(remote, { you: 3 }), writes = putsSince(d.server, start);
  assert.equal(writes.length, 2, 'conflict adds one training-only write');
  assert.equal(writes[0].body.revision, 1); assert.equal(writes[1].body.revision, 2);
  assert.deepEqual(writes[1].body.save, expected, 'local candy, chapter, exploration and paid receipt all roll back');
  assert.deepEqual(d.store.save, expected); assert.deepEqual(d.server.rows.get(A), { save: expected, revision: 3 });
  assert.deepEqual(d.replacements.at(-1), { save: expected, reason: 'conflict' });
  assert.deepEqual(JSON.parse(d.storage.getItem(SAVE_KEY)), expected);
  assert.equal(JSON.parse(d.storage.getItem(`${SAVE_KEY}:account:${A}`)).creditBase, null);
  assert.deepEqual(d.credits, []); assert.equal(d.status(), 'saved');
  d.store.retryNow(); await settle(); assert.equal(putsSince(d.server, start).length, 2, 'successful repair does not repeat');
});

test('409 joins remote, in-flight, current, and queued hero tiers before discarding queued campaign state', async t => {
  const d = await ready(t), remote = remoteWinner({ joe: 2, jon: 1 });
  d.server.seed(A, remote, 2);
  const gate = d.server.deferNext('PUT'), start = d.server.calls.length;
  d.store.persist(localCheckpoint({ you: 3 }), true); await gate.started;
  d.store.persist(localCheckpoint({ matt: 2 }), true);
  // The public current snapshot can advance separately from a queued transport snapshot.
  d.store.save = localCheckpoint({ alex: 3, jon: 2 });
  gate.release(); await settle();
  const expected = withTraining(remote, { you: 3, joe: 2, matt: 2, alex: 3, jon: 2 });
  assert.deepEqual(d.store.save, expected); assert.deepEqual(d.server.rows.get(A).save, expected);
  assert.deepEqual(putsSince(d.server, start).map(call => call.body.revision), [1, 2]);
  assert.deepEqual(d.credits, []);
});

test('409 with no earned-tier increase keeps baseline remote replacement and makes no repair loop', async t => {
  const d = await ready(t), remote = remoteWinner({ you: 3, matt: 2 });
  d.server.seed(A, remote, 2);
  const gate = d.server.deferNext('PUT'), start = d.server.calls.length;
  d.store.persist(localCheckpoint({ you: 2 }), true); await gate.started;
  d.store.persist(localCheckpoint({ matt: 1 }), true);
  gate.release(); await settle();
  assert.deepEqual(d.store.save, remote); assert.deepEqual(d.server.rows.get(A), { save: remote, revision: 2 });
  assert.deepEqual(d.replacements.at(-1), { save: remote, reason: 'conflict' });
  assert.equal(putsSince(d.server, start).length, 1); assert.equal(d.status(), 'saved'); assert.deepEqual(d.credits, []);
  d.store.retryNow(); await settle(); assert.equal(putsSince(d.server, start).length, 1);
});

test('409 with a deleted remote sheet retains baseline null replacement without resurrecting a campaign', async t => {
  const d = await ready(t); d.server.rows.delete(A);
  const start = d.server.calls.length;
  d.store.persist(localCheckpoint(), true); await settle();
  assert.equal(d.store.save, null); assert.equal(d.server.rows.has(A), false);
  assert.deepEqual(d.replacements.at(-1), { save: null, reason: 'conflict' });
  assert.equal(putsSince(d.server, start).length, 1); assert.deepEqual(d.credits, []);
});

test('a failed training repair stays durable and retries without reviving the discarded ticket credit', async t => {
  const d = await ready(t), remote = remoteWinner();
  d.server.seed(A, remote, 2); d.server.failPuts = 1;
  d.store.persist(localCheckpoint(), true); await settle();
  const expected = withTraining(remote, { you: 3 });
  assert.equal(d.status(), 'offline'); assert.deepEqual(d.store.save, expected);
  assert.deepEqual(JSON.parse(d.storage.getItem(SAVE_KEY)), expected); assert.deepEqual(d.credits, []);
  d.store.retryNow(); await settle();
  assert.equal(d.status(), 'saved'); assert.deepEqual(d.server.rows.get(A).save, expected);
  assert.deepEqual(d.credits, []); assert.deepEqual(d.store.save.lastReported, remote.lastReported);
});

test('an account switch fences an uncancellable training repair response from the new account', async t => {
  const d = await ready(t), remote = remoteWinner(), saveB = snapshot({ training: { joe: 1 }, candy: 29 });
  d.server.seed(A, remote, 2); d.server.seed(B, saveB, 4);
  const first = d.server.deferNext('PUT');
  d.store.persist(localCheckpoint(), true); await first.started;
  const repair = d.server.deferNext('PUT'); first.release();
  const repairingA = await repair.started;
  await d.store.load(B); await settle();
  const changeCount = d.changes.length, replacementCount = d.replacements.length;
  assert.equal(repairingA.signal.aborted, true);
  repair.release(); await settle();
  assert.equal(d.store.userId, B); assert.deepEqual(d.store.save, saveB);
  assert.equal(d.changes.length, changeCount); assert.equal(d.replacements.length, replacementCount);
  assert.deepEqual(JSON.parse(d.storage.getItem(SAVE_KEY)), saveB); assert.deepEqual(d.credits, []);
  assert.equal(d.server.calls.filter(call => call.method === 'PUT' && call.userId === B).length, 0);
});

test('dispose fences a delayed conflict and cannot launch a training repair or issue credit', async t => {
  const d = await ready(t); d.server.seed(A, remoteWinner(), 2);
  const gate = d.server.deferNext('PUT'), start = d.server.calls.length;
  d.store.persist(localCheckpoint(), true); const request = await gate.started;
  d.store.dispose();
  const changes = d.changes.length, replacements = d.replacements.length, local = clone(d.store.save);
  assert.equal(request.signal.aborted, true);
  gate.release(); await settle(); d.store.retryNow(); await settle();
  assert.deepEqual(d.store.save, local); assert.equal(d.changes.length, changes); assert.equal(d.replacements.length, replacements);
  assert.equal(putsSince(d.server, start).length, 1); assert.deepEqual(d.credits, []); assert.equal(d.store.ready, false);
});

test('repeated 409s bound training repair attempts and retain tiers for a later retry', async t => {
  const d = await ready(t), remote = remoteWinner();
  let conflicts = 0;
  // The store captures the transport at construction; drive concurrent revisions
  // through its server rows before each deferred repair can win.
  let gate = d.server.deferNext('PUT');
  d.store.persist(localCheckpoint(), true);
  const start = d.server.calls.length - 1;
  for (let attempt = 0; attempt < 3; attempt++) {
    await gate.started;
    d.server.seed(A, remote, 2 + attempt);
    const next = attempt < 2 ? d.server.deferNext('PUT') : null;
    gate.release(); conflicts++;
    if (next) gate = next;
  }
  await settle();
  assert.equal(conflicts, 3);
  assert.equal(putsSince(d.server, start).length, 3, 'flush stops after three conflicting writes');
  assert.equal(d.status(), 'offline');
  assert.deepEqual(d.store.save, withTraining(remote, { you: 3 }));
  assert.deepEqual(d.credits, []);
  d.store.retryNow(); await settle();
  assert.equal(d.status(), 'saved');
  assert.equal(d.server.rows.get(A).save.u1.combat.training.you, 3);
  assert.deepEqual(d.credits, []);
});
