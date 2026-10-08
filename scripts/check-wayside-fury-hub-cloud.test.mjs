import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeHubSaves } from '../server/shared/waysideFury/u1HubMerge.js';
import { CloudSaveStore, mergeSaves } from '../src/pages/WaysideFury/game/cloud.ts';
import { SAVE_KEY, makeSave, parseSave } from '../src/pages/WaysideFury/game/save.ts';
import { newGame } from '../src/pages/WaysideFury/game/sim.ts';
import { progressQuests } from '../src/pages/WaysideFury/u1/hub/quests.ts';

const A = 'hub-player-a', B = 'hub-player-b';
const copy = value => value == null ? value : structuredClone(value);
const emptyReceipt = () => ({ areas: [], bosses: [], rooms: [], level: 1 });
const questEntry = (id, overrides = {}) => ({ id, status: 'claimed', progress: 0, eventProgress: 0,
  baseline: { kills: 0, bosses: [], rooms: [], hidden: [] }, ...overrides });
const hub = (entries = [], extra = {}) => ({ arena: { soloBest: 0, coopBest: 0, runs: 0 },
  quests: { entries, cosmetics: [], pendingChips: [], seenEvents: [] }, cosmetic: null, eventSerial: 0, ...extra });
function snapshot({ chapter = 1, candy = 0, savedAt = 1000, hub: hubData = hub(), siblings = {}, receipt = emptyReceipt() } = {}) {
  const state = newGame();
  Object.assign(state, { chapter, candy });
  const base = makeSave(state, null, false, receipt);
  const save = parseSave({ ...base, savedAt, u1: { ...siblings, hub: hubData } });
  assert.ok(save, 'fixture passes the real save sanitizer');
  return save;
}
class MemoryStorage {
  values = new Map();
  constructor(legacy = null) { if (legacy) this.values.set(SAVE_KEY, JSON.stringify(legacy)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
class Server {
  rows = new Map(); calls = []; gates = []; failGets = 0;
  seed(id, save, revision = 1) { this.rows.set(id, { save: copy(save), revision }); }
  deferPut(userId = A) {
    const started = deferred(), released = deferred();
    this.gates.push({ userId, started, released });
    return { started: started.promise, release: () => released.resolve() };
  }
  request = async (userId, method, body) => {
    this.calls.push({ userId, method, body: copy(body) });
    const gateIndex = method === 'PUT' ? this.gates.findIndex(gate => gate.userId === userId) : -1;
    if (gateIndex >= 0) {
      const [gate] = this.gates.splice(gateIndex, 1);
      gate.started.resolve(); await gate.released.promise;
    }
    if (method === 'GET' && this.failGets-- > 0) return { status: 503, body: {} };
    const row = this.rows.get(userId);
    if (method === 'GET') return { status: 200, body: copy(row ?? { save: null, revision: null }) };
    if (body.revision !== (row?.revision ?? null)) return { status: 409, body: copy(row ?? { save: null, revision: null }) };
    const save = parseSave(body.save);
    assert.ok(save, 'merged snapshot remains bounded and accepted by the server');
    const revision = (row?.revision ?? 0) + 1;
    this.rows.set(userId, { save, revision });
    return { status: 200, body: { revision } };
  };
}
function device(t, server, initial = null) {
  const storage = new MemoryStorage(initial), replacements = [], statuses = [], credit = [];
  const store = new CloudSaveStore(storage, server.request, {
    onChange: value => statuses.push(value.status),
    onReplaced: (save, reason) => replacements.push({ save: copy(save), reason }),
    onCredit: score => credit.push(score),
  });
  t.after(() => store.dispose());
  return { store, storage, replacements, statuses, credit };
}
async function settle() { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); }
const claimedIds = save => save.u1.hub.quests.entries.filter(entry => entry.status === 'claimed').map(entry => entry.id).sort();

test('hub union keeps claims, owned rewards, bests and serials without adding devices’ progress', () => {
  const primary = hub([questEntry('marnie-display'), questEntry('tessa-patrol', { status: 'active', progress: 2, baseline: { kills: 40, bosses: [], rooms: [], hidden: [] } })], {
    arena: { soloBest: 100, coopBest: 90, runs: 3 }, cosmetic: 'station-scarf', eventSerial: 9,
  });
  primary.quests.cosmetics = ['station-scarf']; primary.quests.seenEvents = ['primary:recent'];
  const other = hub([questEntry('joe-bbq'), questEntry('alex-patrol'), questEntry('tessa-patrol', { status: 'active', progress: 5, eventProgress: 3, baseline: { kills: 20, bosses: [], rooms: [], hidden: [] } })], {
    arena: { soloBest: 70, coopBest: 200, runs: 5 }, cosmetic: 'bbq-apron', eventSerial: 24,
  });
  other.quests.cosmetics = ['bbq-apron']; other.quests.pendingChips = [{ id: 'scanner', source: 'u8:alex-patrol' }];
  other.quests.seenEvents = Array.from({ length: 256 }, (_, i) => `other:${i}`);
  const merged = mergeHubSaves(primary, other, other);
  assert.deepEqual(merged.arena, { soloBest: 100, coopBest: 200, runs: 5 });
  assert.equal(merged.eventSerial, 24); assert.equal(merged.cosmetic, 'station-scarf');
  assert.deepEqual(merged.quests.cosmetics.sort(), ['bbq-apron', 'station-scarf']);
  assert.deepEqual(merged.quests.pendingChips, [{ id: 'scanner', source: 'u8:alex-patrol' }]);
  const active = merged.quests.entries.find(entry => entry.id === 'tessa-patrol');
  assert.equal(active.progress, 5); assert.equal(active.eventProgress, 5); assert.equal(active.baseline.kills, 20);
  assert.equal(merged.quests.seenEvents.length, 256); assert.ok(merged.quests.seenEvents.includes('primary:recent'));
  const progressed = progressQuests(merged.quests, { id: 'solo:25', type: 'kill' });
  assert.equal(progressed.entries.find(entry => entry.id === 'tessa-patrol').progress, 6, 'a new kill advances preserved snapshot progress');
  assert.equal(primary.quests.entries[1].progress, 2, 'merge owns its data');
  assert.deepEqual(mergeHubSaves(merged, merged), merged, 'monotonic merge is idempotent');
});

test('campaign ranking and sibling namespaces stay with their existing winner', () => {
  const local = snapshot({ chapter: 1, candy: 11, savedAt: 1000,
    hub: hub([questEntry('joe-bbq')], { arena: { soloBest: 500, coopBest: 0, runs: 2 } }), siblings: { world: { cycleSeconds: 20 } } });
  local.u1.hub.quests.cosmetics = ['bbq-apron'];
  const remote = snapshot({ chapter: 2, candy: 77, savedAt: 800,
    siblings: { world: { cycleSeconds: 99 }, items: { radar: { owned: true } } } });
  const merged = mergeSaves(local, remote);
  assert.equal(merged.chapter, 2); assert.equal(merged.candy, 77); assert.equal(merged.savedAt, 800);
  assert.deepEqual(merged.u1.world, remote.u1.world); assert.deepEqual(merged.u1.items, remote.u1.items);
  assert.deepEqual(claimedIds(merged), ['joe-bbq']); assert.ok(merged.u1.hub.quests.cosmetics.includes('bbq-apron'));
  assert.equal(merged.u1.hub.arena.soloBest, 500); assert.equal(merged.kills, remote.kills);
});

test('newer cloud keeps old local claims and uploads the union with no ticket credit', async t => {
  const local = snapshot({ savedAt: 1000, hub: hub([questEntry('alex-patrol')], { arena: { soloBest: 550, coopBest: 0, runs: 1 }, eventSerial: 8 }) });
  local.u1.hub.quests.pendingChips = [{ id: 'scanner', source: 'u8:alex-patrol' }];
  const server = new Server(); server.seed(A, snapshot({ savedAt: 2000, candy: 71 }));
  const first = device(t, server, local);
  await first.store.load(A); await settle();
  assert.deepEqual(claimedIds(first.store.save), ['alex-patrol']); assert.equal(first.store.save.candy, 71);
  assert.deepEqual(server.rows.get(A).save.u1.hub, first.store.save.u1.hub);
  assert.equal(server.calls.filter(call => call.method === 'PUT').length, 1); assert.deepEqual(first.credit, []);
  const second = device(t, server); await second.store.load(A); await settle();
  assert.deepEqual(claimedIds(second.store.save), ['alex-patrol']); assert.deepEqual(second.credit, []);
});

test('reconnect notifies a running local campaign winner when only remote hub progress changes', async t => {
  const local = snapshot({ chapter: 3, candy: 29 });
  const remote = snapshot({ chapter: 1, hub: hub([questEntry('alex-patrol')]) });
  const server = new Server(); server.seed(A, remote); server.failGets = 1;
  const d = device(t, server, local); await d.store.load(A); await settle();
  assert.equal(d.statuses.at(-1), 'offline'); assert.deepEqual(claimedIds(d.store.save), []);
  const before = d.replacements.length; d.store.retryNow(); await settle();
  assert.equal(d.store.save.chapter, 3); assert.equal(d.store.save.candy, 29);
  assert.deepEqual(claimedIds(d.store.save), ['alex-patrol']); assert.ok(d.replacements.length > before);
  assert.deepEqual(claimedIds(d.replacements.at(-1).save), ['alex-patrol']); assert.deepEqual(d.credit, []);
});

test('409 keeps queued and in-flight hub claims while retrying the winning campaign once', async t => {
  const server = new Server(); server.seed(A, snapshot());
  const d = device(t, server); await d.store.load(A); await settle();
  const remote = snapshot({ chapter: 2, candy: 77, savedAt: 2000 }); server.seed(A, remote, 2);
  const gate = server.deferPut();
  const first = snapshot({ candy: 999, hub: hub([questEntry('joe-bbq')], { arena: { soloBest: 100, coopBest: 0, runs: 1 } }) });
  first.u1.hub.quests.cosmetics = ['bbq-apron'];
  d.store.persist(first, true); await gate.started;
  const queued = snapshot({ chapter: 9, candy: 999, savedAt: 9000,
    hub: hub([questEntry('alex-patrol')], { arena: { soloBest: 200, coopBest: 0, runs: 2 } }) });
  queued.u1.hub.quests.pendingChips = [{ id: 'scanner', source: 'u8:alex-patrol' }];
  d.store.persist(queued, true); gate.release(); await settle();
  assert.equal(d.store.save.chapter, 2); assert.equal(d.store.save.candy, 77);
  assert.deepEqual(claimedIds(d.store.save), ['alex-patrol', 'joe-bbq']);
  assert.equal(d.store.save.u1.hub.arena.soloBest, 200); assert.equal(d.store.save.u1.hub.arena.runs, 2);
  const writes = server.calls.filter(call => call.method === 'PUT');
  assert.equal(writes.length, 2); assert.equal(writes[0].body.revision, 1); assert.equal(writes[1].body.revision, 2);
  assert.equal(writes[1].body.save.chapter, 2); assert.equal(writes[1].body.save.candy, 77);
  assert.deepEqual(server.rows.get(A).save, d.store.save); assert.deepEqual(d.credit, []);
  assert.equal(d.statuses.at(-1), 'saved'); assert.equal(d.replacements.at(-1).reason, 'conflict');
});

test('two simultaneous devices for one player preserve both completed requests', async t => {
  const server = new Server(); server.seed(A, snapshot());
  const first = device(t, server), second = device(t, server);
  await Promise.all([first.store.load(A), second.store.load(A)]); await settle();
  const joe = snapshot({ hub: hub([questEntry('joe-bbq')]) }); joe.u1.hub.quests.cosmetics = ['bbq-apron'];
  const alex = snapshot({ hub: hub([questEntry('alex-patrol')]) }); alex.u1.hub.quests.pendingChips = [{ id: 'scanner', source: 'u8:alex-patrol' }];
  first.store.persist(joe); second.store.persist(alex); await settle();
  assert.deepEqual(claimedIds(server.rows.get(A).save), ['alex-patrol', 'joe-bbq']);
  await first.store.load(A); await second.store.load(A); await settle();
  assert.deepEqual(claimedIds(first.store.save), ['alex-patrol', 'joe-bbq']);
  assert.deepEqual(claimedIds(second.store.save), ['alex-patrol', 'joe-bbq']);
  assert.deepEqual(first.credit, []); assert.deepEqual(second.credit, []);
});

test('a second concurrent conflict stops the immediate retry loop and retains the union locally', async t => {
  const server = new Server(); server.seed(A, snapshot());
  const d = device(t, server); await d.store.load(A); await settle();
  server.seed(A, snapshot({ hub: hub([questEntry('joe-bbq')]) }), 2);
  let putCount = 0; const original = server.request;
  server.request = async (...args) => {
    if (args[1] === 'PUT' && ++putCount === 2) server.seed(A, snapshot({ hub: hub([questEntry('marnie-display')]) }), 3);
    return original(...args);
  };
  // The transport was captured at construction, so use a fresh store with the
  // same revision before exercising the two conflicting writes.
  const e = device(t, server); server.seed(A, snapshot(), 1); await e.store.load(A); await settle();
  server.seed(A, snapshot({ hub: hub([questEntry('joe-bbq')]) }), 2);
  e.store.persist(snapshot({ hub: hub([questEntry('alex-patrol')]) })); await settle();
  assert.equal(putCount, 2); assert.equal(e.statuses.at(-1), 'offline');
  assert.deepEqual(claimedIds(e.store.save), ['alex-patrol', 'joe-bbq', 'marnie-display']);
  e.store.retryNow(); await settle(); assert.equal(putCount, 3); assert.equal(e.statuses.at(-1), 'saved');
  assert.deepEqual(claimedIds(server.rows.get(A).save), ['alex-patrol', 'joe-bbq', 'marnie-display']);
  assert.deepEqual(e.credit, []);
});

test('switching account during a conflict never carries account A quest receipts into B', async t => {
  const server = new Server(); server.seed(A, snapshot()); server.seed(B, snapshot({ hub: hub([questEntry('marnie-display')]) }));
  const d = device(t, server); await d.store.load(A); await settle();
  server.seed(A, snapshot({ hub: hub([questEntry('joe-bbq')]) }), 2);
  const gate = server.deferPut(); d.store.persist(snapshot({ hub: hub([questEntry('alex-patrol')]) })); await gate.started;
  await d.store.load(B); await settle(); gate.release(); await settle();
  assert.equal(d.store.userId, B); assert.deepEqual(claimedIds(d.store.save), ['marnie-display']);
  assert.deepEqual(claimedIds(server.rows.get(B).save), ['marnie-display']);
  const storedB = JSON.parse(d.storage.getItem(`${SAVE_KEY}:account:${B}`));
  assert.deepEqual(claimedIds(storedB.save), ['marnie-display']); assert.deepEqual(d.credit, []);
});
