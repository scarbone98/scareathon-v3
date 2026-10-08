import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@jest/globals';

const root = fileURLToPath(new URL('../../', import.meta.url));
test('all Update 1 personal progress survives cloud recovery and the next active-game save without ticket credit', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { newGame } from './src/pages/WaysideFury/game/sim.ts';
    import { makeSave, restoreSave } from './src/pages/WaysideFury/game/save.ts';
    import { applyCoopReward } from './src/pages/WaysideFury/game/coopRewards.ts';
    import { grantChip, equipChip } from './src/pages/WaysideFury/game/u1/items/chips.ts';
    import './src/pages/WaysideFury/game/u1/items/integrations.ts';
    import { CloudSaveStore, mergeSaves } from './src/pages/WaysideFury/game/cloud.ts';
    const arenaPlayer = newGame();
    grantChip(arenaPlayer, 'lucky-star'); equipChip(arenaPlayer, 'lucky-star', 0);
    arenaPlayer.scene = 'arena';
    assert.equal(applyCoopReward(arenaPlayer, { id: 'arena:kill:1', kind: 'kill', xp: 0, candy: 0 }), true);
    assert.equal(arenaPlayer.candy, 0, 'Lucky Star cannot turn an arena reward into campaign candy');
    assert.equal(arenaPlayer.character.xp, 0);
    assert.equal(applyCoopReward(arenaPlayer, { id: 'arena:kill:1', kind: 'kill', xp: 0, candy: 0 }), false);
    const campaign = makeSave(newGame(), null);
    campaign.chapter = 2; campaign.candy = 71; campaign.savedAt = 1000;
    campaign.u1.world = { clearedObstacles: ['world-joe-road'], cycleSeconds: 60 };
    const personal = makeSave(newGame(), null); personal.savedAt = 6000;
    personal.u1.items.chips = { owned: ['scanner'], equipped: ['scanner', null, null], secondWindUsed: false };
    personal.u1.items.radar = { owned: true, enabled: true };
    personal.u1.world = { clearedObstacles: ['world-matt-station'], cycleSeconds: 300 };
    personal.u1.combat.training.joe = 2;
    personal.u1.hub.arena = { soloBest: 1500, coopBest: 0, runs: 1 };
    const check = save => {
      assert.equal(save.chapter, 2); assert.equal(save.candy, 71);
      assert.deepEqual(save.u1.items.chips.owned, ['scanner']);
      assert.equal(save.u1.items.radar.owned, true);
      assert.deepEqual(save.u1.world, { clearedObstacles: ['world-joe-road', 'world-matt-station'], cycleSeconds: 60 });
      assert.equal(save.u1.combat.training.joe, 2);
      assert.equal(save.u1.hub.arena.soloBest, 1500);
      assert.deepEqual(save.lastReported, campaign.lastReported);
    };
    check(mergeSaves(campaign, personal));
    check(makeSave(restoreSave(mergeSaves(campaign, personal)), null));
    const memory = new Map([['wayside-fury-save', JSON.stringify(campaign)]]);
    const replacements = []; let credits = 0, failGet = true, remote = personal, revision = 1;
    const transport = async (_id, method, body) => {
      if (method === 'GET') {
        if (failGet) { failGet = false; throw new Error('offline'); }
        return { status: 200, body: { save: remote, revision } };
      }
      remote = body.save; revision++;
      return { status: 200, body: { revision } };
    };
    const store = new CloudSaveStore({ getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) }, transport, {
      onChange: () => {}, onReplaced: save => replacements.push(save), onCredit: score => { credits += score; },
    });
    try {
      await store.load('integration-account');
      const before = replacements.length;
      store.retryNow(); await store.flush();
      assert.ok(replacements.length > before, 'all namespace changes notify the running game');
      const next = makeSave(restoreSave(replacements.at(-1)), store.save);
      check(next); store.persist(next, false); await store.flush(); check(remote);
      assert.equal(credits, 0);
    } finally { store.dispose(); }
    // Hidden finds also feed the radar and quest discovery adapter. Recover
    // them even when no Update 1 namespace changes and local campaign wins.
    remote = structuredClone(campaign); remote.chapter = 1; remote.savedAt = 1;
    remote.foundItems = ['pickup-c1-wreck']; remote.ambientTaxiWrecked = true;
    memory.clear(); memory.set('wayside-fury-save', JSON.stringify(campaign));
    replacements.length = 0; failGet = true;
    const finds = new CloudSaveStore({ getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) }, transport, {
      onChange: () => {}, onReplaced: save => replacements.push(save), onCredit: score => { credits += score; },
    });
    try {
      await finds.load('finds-account');
      const before = replacements.length;
      finds.retryNow(); await finds.flush();
      assert.ok(replacements.length > before, 'hidden discovery recovery notifies the running game');
      const next = makeSave(restoreSave(replacements.at(-1)), finds.save);
      assert.deepEqual(next.foundItems, ['pickup-c1-wreck']);
      assert.equal(next.ambientTaxiWrecked, true); assert.equal(next.chapter, 2);
      finds.persist(next, false); await finds.flush();
      assert.deepEqual(remote.foundItems, next.foundItems); assert.equal(credits, 0);
    } finally { finds.dispose(); }
    console.log('integrated personal progress survives');
  `], { cwd: root, encoding: 'utf8', timeout: 120000 });
  expect(output).toContain('integrated personal progress survives');
}, 125000);
