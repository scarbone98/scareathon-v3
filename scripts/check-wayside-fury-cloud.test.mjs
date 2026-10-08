// Native Node 26 runner: node --test scripts/check-wayside-fury-cloud.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSaveStore, mergeSaves, receiptScore } from '../src/pages/WaysideFury/game/cloud.ts';
import { SAVE_KEY, makeSave, parseSave, mergeReceipts, progressReport, restoreSave } from '../src/pages/WaysideFury/game/save.ts';
import { newGame, restAtHome, createHero, HERO_IDS } from '../src/pages/WaysideFury/game/sim.ts';

const A = 'account-a', B = 'account-b';
const clone = value => value == null ? value : structuredClone(value);
const emptyReceipt = () => ({ areas: [], bosses: [], rooms: [], level: 1 });
function snapshot({ chapter = 1, level = 1, xp = 0, candy = 0, areas = [], bosses = [], rooms = [], foundItems = [], ambientTaxiWrecked = false, receipt = emptyReceipt(), savedAt = 1_000, home = false } = {}) {
  const state = newGame();
  Object.assign(state, { chapter, candy, areas, bosses, clearedRooms: rooms, foundItems, ambientTaxiWrecked });
  state.character = { level, xp };
  state.heroes = Object.fromEntries(HERO_IDS.map(id => [id, createHero(id, state.character, state.gear)]));
  const save = makeSave(state, null, home, receipt);
  assert.ok(save, 'fixture must be accepted by the real shared sanitizer');
  save.savedAt = savedAt;
  return save;
}
class MemoryStorage {
  values = new Map();
  blocked = false;
  constructor(legacy = null) { if (legacy) this.values.set(SAVE_KEY, JSON.stringify(legacy)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.blocked) throw new Error('Device storage is full'); this.values.set(key, value); }
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
  failGets = 0;
  failPuts = 0;
  seed(id, save, revision = 1) { this.rows.set(id, { save: clone(save), revision }); }
  deferNext(method, userId = A) {
    const started = deferred(), released = deferred();
    const gate = { method, userId, started, released, claimed: false };
    this.gates.push(gate);
    return { started: started.promise, release: () => released.resolve() };
  }
  request = async (userId, method, body, signal, keepalive) => {
    const call = { userId, method, body: clone(body), signal, keepalive };
    this.calls.push(call);
    const gate = this.gates.find(candidate => !candidate.claimed && candidate.method === method && candidate.userId === userId);
    if (gate) {
      gate.claimed = true; gate.started.resolve(call);
      // Intentionally ignore aborts: late server responses must still be fenced
      // by account epoch, even when a transport cannot cancel an in-flight write.
      await gate.released.promise;
    }
    if (method === 'GET' && this.failGets-- > 0 || method === 'PUT' && this.failPuts-- > 0) {
      return { status: 503, body: { error: 'Offline' } };
    }
    const row = this.rows.get(userId);
    if (method === 'GET') return { status: 200, body: row ? clone(row) : { save: null, revision: null } };
    assert.ok(body?.save, 'PUT must have a snapshot');
    if (body.revision !== (row?.revision ?? null)) return { status: 409, body: row ? clone(row) : { save: null, revision: null } };
    const next = { save: parseSave(body.save), revision: (row?.revision ?? 0) + 1 };
    assert.ok(next.save, 'atomic server rejects malformed client snapshots');
    this.rows.set(userId, next);
    return { status: 200, body: { revision: next.revision } };
  };
}
function device(t, storage = new MemoryStorage(), server = new AtomicServer()) {
  const changes = [], replacements = [], credits = [];
  const store = new CloudSaveStore(storage, server.request, {
    onChange: value => changes.push(clone(value)),
    onReplaced: (save, reason) => replacements.push({ save: clone(save), reason }),
    onCredit: score => credits.push(score),
  });
  t.after(() => store.dispose());
  return { store, storage, server, changes, replacements, credits,
    status: () => changes.at(-1)?.status, paid: () => credits.reduce((sum, score) => sum + score, 0) };
}
// Requests resolve through several async frames. Draining turns avoids relying
// on wall-clock delays, and after() disposes every automatic retry timer.
async function settle() { for (let turn = 0; turn < 12; turn++) await new Promise(resolve => setImmediate(resolve)); }
const checkpointReceipt = () => ({ areas: ['blast'], bosses: ['blast-watcher'], rooms: ['blast-0', 'blast-1'], level: 4 });
const checkpoint = (extra = {}) => snapshot({ level: 4, candy: 43, areas: ['blast'], bosses: ['blast-watcher'], rooms: ['blast-0', 'blast-1'], receipt: checkpointReceipt(), ...extra });

test('legacy guest migrates, transfers on first sign-in, and remains separate from accounts A and B', async t => {
  const original = snapshot({ level: 3, candy: 17, areas: ['wayside'], rooms: ['blast-0'], home: true });
  const legacy = { ...original, version: 1, heroes: { joe: original.heroes.joe, matt: original.heroes.matt },
    active: 'joe', party: ['joe', 'matt'], unlockedHeroes: ['joe', 'matt'] };
  delete legacy.gear; delete legacy.settings; delete legacy.character;
  legacy.home = { ...original.home, heroes: legacy.heroes, active: 'joe', party: ['joe', 'matt'] };
  delete legacy.home.character;
  const d = device(t, new MemoryStorage(legacy));
  await d.store.load(null);
  assert.equal(d.store.save.version, 4);
  assert.equal(d.store.save.candy, 17);
  assert.equal(d.server.calls.length, 0, 'guests never make authenticated save requests');
  await d.store.load(A); await settle();
  assert.equal(d.server.rows.get(A).save.candy, 17);
  assert.equal(d.paid(), 0, 'migration and initial transfer cannot award tickets');
  const accountA = snapshot({ level: 5, candy: 27, areas: ['wayside', 'blast'], savedAt: 2_000 });
  d.store.persist(accountA); await settle();
  await d.store.load(B); await settle();
  assert.equal(d.store.save, null, 'B cannot inherit A through the legacy mirror');
  const accountB = snapshot({ candy: 99, savedAt: 3_000 });
  d.store.persist(accountB); await settle();
  await d.store.load(null);
  assert.equal(d.store.save.candy, 17, 'the guest copy survives the first account upload');
  await d.store.load(A); await settle(); assert.equal(d.store.save.candy, 27);
  await d.store.load(B); await settle(); assert.equal(d.store.save.candy, 99);
  assert.equal(d.paid(), 0);
});

test('an existing version2 account migrates You and shared XP while its earlier HOME and ticket history survive', async t => {
  const progressed = snapshot({ level: 4, xp: 9, candy: 72, areas: ['wayside', 'blast'],
    receipt: { areas: ['wayside', 'blast'], bosses: ['blast-watcher'], rooms: ['blast-0'], level: 4 } });
  const early = snapshot({ level: 1, candy: 7, home: true });
  const legacy = { ...progressed, version: 2, active: 'matt', party: ['joe', 'matt'],
    unlockedHeroes: ['joe', 'matt'], heroes: { joe: progressed.heroes.joe, matt: progressed.heroes.matt },
    gear: { power: 4, ward: 2 }, home: { ...early.home, active: 'joe', party: ['joe', 'matt'],
      heroes: { joe: early.heroes.joe, matt: early.heroes.matt }, gear: { power: 2, ward: 1 } } };
  delete legacy.character; delete legacy.home.character;
  for (const h of Object.values(legacy.heroes)) { h.power += 4; h.defense += 2; }
  for (const h of Object.values(legacy.home.heroes)) { h.power += 2; h.defense++; }
  const d = device(t); d.server.seed(A, legacy, 8); await d.store.load(A); await settle();
  assert.equal(d.store.save.version, 4); assert.deepEqual(d.store.save.character, { level: 4, xp: 9 });
  assert.deepEqual(d.store.save.party, ['you', 'matt']); assert.equal(d.store.save.active, 'you');
  assert.deepEqual(d.store.save.gear, { power: 4, ward: 2 });
  const retry = restoreSave(d.store.save, true);
  assert.deepEqual(retry.character, { level: 1, xp: 0 }); assert.deepEqual(retry.gear, { power: 2, ward: 1 });
  assert.equal(retry.candy, 7); assert.deepEqual(retry.areas, ['wayside', 'blast']);
  assert.equal(progressReport(retry, d.store.save.lastReported).score, 0);
  d.store.persist(makeSave(retry, d.store.save), true); await settle();
  assert.equal(d.server.rows.get(A).save.version, 4); assert.equal(d.paid(), 0, 'migration and HOME retry cannot pay old progress');
  assert.equal(d.server.rows.get(A).save.lastReported.level, 4);
});

test('an ownership-marker quota failure keeps the legacy mirror from exposing account A to B', async t => {
  const guest = snapshot({ candy: 17 });
  const storage = new MemoryStorage(guest);
  const write = storage.setItem.bind(storage);
  let failOwner = false;
  storage.setItem = (key, value) => {
    if (failOwner && key === `${SAVE_KEY}-owner`) throw new Error('Ownership marker exceeds device quota');
    write(key, value);
  };
  const d = device(t, storage);
  await d.store.load(null); d.store.persist(guest);
  const accountA = checkpoint({ candy: 77, savedAt: 2_000 });
  d.server.seed(A, accountA);
  failOwner = true;
  await d.store.load(A); await settle();
  const latestA = checkpoint({ candy: 98, savedAt: 3_000 });
  d.store.persist(latestA); await settle();
  assert.equal(d.status(), 'saved', 'the scoped account copy and cloud save still succeed');
  assert.deepEqual(JSON.parse(storage.getItem(`${SAVE_KEY}:account:${A}`)).save, latestA);
  assert.equal(storage.getItem(`${SAVE_KEY}-owner`), '', 'the selective failure leaves guest ownership intact');
  assert.deepEqual(JSON.parse(storage.getItem(SAVE_KEY)), guest, 'the mirror cannot change unless its ownership is durable');
  failOwner = false;
  await d.store.load(B); await settle();
  assert.deepEqual(d.store.save, guest, 'B can import the guest copy but cannot inherit A progress or receipts');
  assert.deepEqual(d.server.rows.get(B).save, guest);
  assert.deepEqual(d.server.rows.get(A).save, latestA);
  assert.equal(d.paid(), 0);
});

test('merge chooses progress, then timestamp, while retaining both devices\' ticket receipts', () => {
  const local = snapshot({ chapter: 2, candy: 71, home: true, savedAt: 1_000,
    receipt: { areas: ['wayside'], bosses: [], rooms: ['blast-0'], level: 4 } });
  const remote = snapshot({ level: 99, candy: 19, savedAt: 5_000,
    receipt: { areas: ['blast'], bosses: ['blast-watcher'], rooms: ['blast-1'], level: 99 } });
  const merged = mergeSaves(local, remote);
  assert.equal(merged.chapter, 2); assert.equal(merged.candy, 71); assert.deepEqual(merged.home, local.home);
  assert.deepEqual(merged.lastReported, mergeReceipts(local.lastReported, remote.lastReported));
  const later = { ...local, candy: 88, savedAt: 6_000 };
  assert.equal(mergeSaves(local, later).candy, 88);
  assert.equal(mergeSaves(null, remote), remote); assert.equal(mergeSaves(local, null), local);
  assert.equal(mergeSaves(null, null), null);
});

test('boot uploads the higher-progress snapshot and receipt union without paying again', async t => {
  for (const remoteWins of [false, true]) {
    const low = snapshot({ candy: 8, receipt: { areas: ['wayside'], bosses: [], rooms: [], level: 2 } });
    const high = snapshot({ chapter: 2, candy: 82, receipt: { areas: [], bosses: ['blast-watcher'], rooms: ['blast-0'], level: 4 } });
    const local = remoteWins ? low : high, remote = remoteWins ? high : low;
    const server = new AtomicServer(); server.seed(A, remote);
    const d = device(t, new MemoryStorage(local), server);
    await d.store.load(A); await settle();
    assert.equal(d.store.save.candy, 82);
    assert.deepEqual(server.rows.get(A).save.lastReported, mergeReceipts(local.lastReported, remote.lastReported));
    assert.equal(d.paid(), 0);
    assert.equal(d.status(), 'saved');
  }
});

test('receipt score counts only new milestones and level increases, and caps each payout', () => {
  const before = { areas: ['wayside'], bosses: [], rooms: ['blast-0'], level: 2 };
  const after = { areas: ['wayside', 'blast'], bosses: ['blast-watcher'], rooms: ['blast-0', 'blast-1'], level: 4 };
  assert.equal(receiptScore(after, before), 1_250);
  assert.equal(receiptScore(after, after), 0);
  assert.equal(receiptScore(before, after), 0);
  assert.equal(receiptScore({ ...after, level: 10_000 }, emptyReceipt()), 100_000);
});

test('two simultaneous devices pay the identical checkpoint only on the winning revisioned PUT', async t => {
  const server = new AtomicServer(); server.seed(A, snapshot());
  const first = device(t, new MemoryStorage(), server), second = device(t, new MemoryStorage(), server);
  await Promise.all([first.store.load(A), second.store.load(A)]); await settle();
  const begin = server.calls.length, save = checkpoint();
  first.store.persist(save, true); second.store.persist(save, true); await settle();
  const writes = server.calls.slice(begin).filter(call => call.method === 'PUT');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].body.revision, writes[1].body.revision, 'both devices began from the same revision');
  assert.equal(first.paid() + second.paid(), receiptScore(save.lastReported, emptyReceipt()));
  assert.equal([first, second].filter(d => d.paid() > 0).length, 1);
  assert.equal([first, second].flatMap(d => d.replacements).filter(event => event.reason === 'conflict').length >= 1, true);
  assert.deepEqual(first.store.save.lastReported, save.lastReported);
  assert.deepEqual(second.store.save.lastReported, save.lastReported);
  first.store.retryNow(); second.store.retryNow(); await settle();
  assert.equal(first.paid() + second.paid(), receiptScore(save.lastReported, emptyReceipt()));
});

test('409 replaces an in-flight checkpoint and discards even a newer queued snapshot', async t => {
  const d = device(t); d.server.seed(A, snapshot());
  await d.store.load(A); await settle();
  const remote = snapshot({ chapter: 2, candy: 109, receipt: { areas: ['blast'], bosses: [], rooms: ['blast-0'], level: 7 } });
  const revision = d.server.rows.get(A).revision;
  d.server.seed(A, remote, revision + 1);
  const gate = d.server.deferNext('PUT');
  const before = d.server.calls.length;
  d.store.persist(checkpoint(), true); await gate.started;
  d.store.persist(checkpoint({ chapter: 3, candy: 999, savedAt: 9_000 }), true);
  gate.release(); await settle();
  assert.deepEqual(d.store.save, remote);
  assert.deepEqual(d.replacements.at(-1), { save: remote, reason: 'conflict' });
  assert.equal(d.server.calls.slice(before).filter(call => call.method === 'PUT').length, 1, 'queued pre-conflict state must not overwrite the winner');
  assert.equal(d.paid(), 0);
  assert.equal(d.status(), 'saved');
  assert.deepEqual(JSON.parse(d.storage.getItem(SAVE_KEY)), remote);
});

test('a failed PUT keeps a device snapshot, pays nothing offline, and pays once after retry', async t => {
  const d = device(t); d.server.seed(A, snapshot());
  await d.store.load(A); await settle();
  d.server.failPuts = 1;
  const save = checkpoint();
  assert.equal(d.store.persist(save, true), true); await settle();
  assert.equal(d.status(), 'offline'); assert.equal(d.paid(), 0);
  assert.deepEqual(JSON.parse(d.storage.getItem(SAVE_KEY)), save);
  assert.deepEqual(d.server.rows.get(A).save.lastReported, emptyReceipt());
  d.store.retryNow(); await settle();
  assert.equal(d.status(), 'saved');
  assert.equal(d.paid(), receiptScore(save.lastReported, emptyReceipt()));
  assert.deepEqual(d.server.rows.get(A).save, save);
  d.store.retryNow(); await settle();
  assert.equal(d.paid(), receiptScore(save.lastReported, emptyReceipt()));
});

test('a failed GET must be retried successfully before any PUT is allowed', async t => {
  const d = device(t, new MemoryStorage(snapshot()));
  d.server.failGets = 1;
  await d.store.load(A); await settle();
  assert.equal(d.status(), 'offline'); assert.equal(d.store.ready, true);
  assert.deepEqual(d.server.calls.map(call => call.method), ['GET']);
  d.server.failGets = 1;
  d.store.persist(checkpoint(), true); await settle();
  assert.deepEqual(d.server.calls.map(call => call.method), ['GET', 'GET']);
  assert.equal(d.paid(), 0);
  d.store.retryNow(); await settle();
  assert.deepEqual(d.server.calls.map(call => call.method), ['GET', 'GET', 'GET', 'PUT']);
  assert.equal(d.server.calls.at(-1).body.revision, null);
  assert.equal(d.paid(), receiptScore(checkpointReceipt(), emptyReceipt()));
  assert.equal(d.status(), 'saved');
});

test('an uncancellable delayed A GET is ignored after B has loaded', async t => {
  const d = device(t);
  const saveA = checkpoint({ candy: 17 }), saveB = snapshot({ candy: 29 });
  d.server.seed(A, saveA); d.server.seed(B, saveB);
  const gate = d.server.deferNext('GET');
  const loadingA = d.store.load(A), pendingA = await gate.started;
  await d.store.load(B); await settle();
  const changes = d.changes.length, replacements = d.replacements.length;
  assert.equal(pendingA.signal.aborted, true);
  gate.release(); await loadingA; await settle();
  assert.equal(d.store.userId, B); assert.deepEqual(d.store.save, saveB);
  assert.equal(d.changes.length, changes); assert.equal(d.replacements.length, replacements);
  assert.equal(d.paid(), 0);
  assert.deepEqual(JSON.parse(d.storage.getItem(SAVE_KEY)), saveB);
});

test('an uncancellable delayed A PUT cannot pay or replace B after an account switch', async t => {
  const d = device(t); const saveB = snapshot({ candy: 29 });
  d.server.seed(A, snapshot()); d.server.seed(B, saveB);
  await d.store.load(A); await settle();
  const gate = d.server.deferNext('PUT');
  d.store.persist(checkpoint(), true); const pendingA = await gate.started;
  await d.store.load(B); await settle();
  const changes = d.changes.length, replacements = d.replacements.length;
  assert.equal(pendingA.signal.aborted, true);
  gate.release(); await settle();
  assert.equal(d.store.userId, B); assert.deepEqual(d.store.save, saveB);
  assert.equal(d.changes.length, changes); assert.equal(d.replacements.length, replacements);
  assert.equal(d.paid(), 0);
  assert.deepEqual(JSON.parse(d.storage.getItem(SAVE_KEY)), saveB);
});

test('exit flush retries an offline snapshot with keepalive', async t => {
  const d = device(t); await d.store.load(A); await settle();
  d.server.failPuts = 1; d.store.persist(checkpoint(), true); await settle();
  assert.equal(d.status(), 'offline');
  d.store.flushOnExit(); await settle();
  assert.equal(d.server.calls.at(-1).keepalive, true);
  assert.equal(d.status(), 'saved');
  assert.equal(d.paid(), receiptScore(checkpointReceipt(), emptyReceipt()));
});

test('guest storage failure never pays tickets or pretends to be saved', async t => {
  const d = device(t, new MemoryStorage(snapshot())); await d.store.load(null);
  d.storage.blocked = true;
  assert.equal(d.store.persist(checkpoint(), true), false);
  assert.equal(d.status(), 'unavailable'); assert.equal(d.paid(), 0);
  assert.equal(d.server.calls.length, 0);
  assert.deepEqual(JSON.parse(d.storage.getItem(SAVE_KEY)), snapshot());
});


test('a fresh B HOME checkpoint earns its own 1000 after account A has already reported Wayside', async t => {
  const d = device(t);
  const reportedA = checkpoint({ areas: ['wayside', 'blast'], receipt: { ...checkpointReceipt(), areas: ['wayside', 'blast'] } });
  d.server.seed(A, reportedA);
  await d.store.load(A); await settle();
  assert.ok(JSON.parse(d.storage.getItem(SAVE_KEY)).lastReported.areas.includes('wayside'));
  await d.store.load(B); await settle();
  assert.equal(d.store.save, null);
  const stateB = newGame(); stateB.areas = ['wayside']; restAtHome(stateB);
  const report = progressReport(stateB, d.store.save?.lastReported);
  assert.equal(report.score, 1_000, 'B must use its scoped receipt, despite A remaining in the legacy mirror');
  const saveB = makeSave(stateB, d.store.save, true, report.receipt);
  assert.ok(saveB.home); d.store.persist(saveB, true); await settle();
  assert.equal(d.paid(), 1_000);
  assert.deepEqual(d.server.rows.get(B).save.lastReported, { areas: ['wayside'], bosses: [], rooms: [], level: 1 });
  assert.deepEqual(d.server.rows.get(A).save.lastReported, reportedA.lastReported);
  await d.store.load(B); await settle(); assert.equal(d.paid(), 1_000);
});

test('an offline checkpoint survives dispose and reload, then pays once after its successful account PUT', async t => {
  const server = new AtomicServer(); server.seed(A, snapshot());
  const first = device(t, new MemoryStorage(), server);
  await first.store.load(A); await settle();
  server.failPuts = 1;
  const save = checkpoint(); first.store.persist(save, true); await settle();
  assert.equal(first.status(), 'offline'); assert.equal(first.paid(), 0);
  first.store.dispose();
  const second = device(t, first.storage, server);
  await second.store.load(A); await settle();
  assert.equal(second.status(), 'saved');
  assert.equal(second.paid(), receiptScore(save.lastReported, emptyReceipt()), 'credit intent and its prior receipt must survive a browser restart');
  assert.deepEqual(server.rows.get(A).save.lastReported, save.lastReported);
  second.store.dispose();
  const third = device(t, first.storage, server);
  await third.store.load(A); await settle();
  assert.equal(third.paid(), 0, 'a second reload cannot pay the confirmed checkpoint again');
  assert.deepEqual(third.store.save.lastReported, save.lastReported);
});

test('reconnecting to equal progress with a newer remote timestamp replaces the running device save', async t => {
  const local = snapshot({ level: 3, candy: 17, savedAt: 1_000, areas: ['wayside'], home: true });
  const remote = { ...local, candy: 88, savedAt: 2_000 };
  const d = device(t, new MemoryStorage(local)); d.server.seed(A, remote); d.server.failGets = 1;
  await d.store.load(A); await settle();
  assert.equal(d.status(), 'offline'); assert.equal(d.store.save.candy, 17);
  const previous = d.replacements.length;
  d.store.retryNow(); await settle();
  assert.deepEqual(d.store.save, remote);
  assert.ok(d.replacements.length > previous, 'remote adoption must notify the running game, including timestamp ties');
  assert.deepEqual(d.replacements.at(-1), { save: remote, reason: 'load' });
  assert.equal(d.paid(), 0);
});

test('a guest can retry the same unreported checkpoint when device storage recovers', async t => {
  const d = device(t, new MemoryStorage(snapshot())); await d.store.load(null);
  const save = checkpoint(); d.storage.blocked = true;
  assert.equal(d.store.persist(save, true), false); assert.equal(d.paid(), 0);
  d.storage.blocked = false;
  assert.equal(d.store.persist(save, true), true);
  assert.equal(d.paid(), receiptScore(save.lastReported, emptyReceipt()), 'failed durability cannot advance the guest paid-receipt high-water mark');
  d.store.persist(save, true);
  assert.equal(d.paid(), receiptScore(save.lastReported, emptyReceipt()));
  assert.equal(d.server.calls.length, 0);
});

test('personal finds and the taxi wreck survive cloud reload without ticket bonuses', async t => {
  const first = 'pickup-c1-road-rock', second = 'pickup-c1-tree-candy';
  const server = new AtomicServer(); server.seed(A, snapshot());
  const devices = [device(t, new MemoryStorage(), server), device(t, new MemoryStorage(), server)];
  await Promise.all(devices.map(d => d.store.load(A))); await settle();
  const receipt = { ...emptyReceipt(), foundItems: [first] };
  const save = snapshot({ foundItems: [first], ambientTaxiWrecked: true, receipt });
  for (const d of devices) d.store.persist(save, true);
  await settle();
  assert.equal(devices.reduce((total, d) => total + d.paid(), 0), 0);
  assert.deepEqual(server.rows.get(A).save.foundItems, [first]);
  const reloaded = device(t, new MemoryStorage(), server); await reloaded.store.load(A); await settle();
  assert.deepEqual(reloaded.store.save.foundItems, [first]); assert.equal(reloaded.store.save.ambientTaxiWrecked, true);
  reloaded.store.persist(save, true); await settle(); assert.equal(reloaded.paid(), 0);
  const merged = mergeSaves(save, snapshot({ foundItems: [second], receipt: { ...emptyReceipt(), foundItems: [second] } }));
  assert.deepEqual(merged.foundItems, [first, second]);
  assert.deepEqual(merged.lastReported.foundItems, [first, second]);
  assert.equal(merged.ambientTaxiWrecked, true);
});
