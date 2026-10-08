// Fixture-only live U3/U9 check. No production endpoint or account is contacted.
// FURY_BASE_URL=http://127.0.0.1:5193 node scripts/check-wayside-fury-world-coop.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startFuryTestServer } from './fury-coop-test-server.mjs';

const base = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5193';
const timeout = Number(process.env.FURY_READY_TIMEOUT ?? 900000);
const moduleName = process.env.PLAYWRIGHT_MODULE ?? '/Users/szaneer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? '/Users/szaneer/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const output = process.env.FURY_WORLD_SHOTS ?? '/tmp/fury-update1-shots';
const fixturePort = Number(process.env.FURY_TEST_PORT ?? 3004);
const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
const { chromium } = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
console.log(`World co-op: starting local fixture ${fixtureOrigin}`);
const fixture = await startFuryTestServer(fixturePort);
const browsers = [];
const errors = [];
const opened = [];
await mkdir(output, { recursive: true });

function session(id) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: id, exp: 4_000_000_000, role: 'authenticated', aud: 'authenticated' })).toString('base64url');
  return { access_token: `${header}.${payload}.fixture`, refresh_token: 'fixture', expires_at: 4_000_000_000,
    expires_in: 3600, token_type: 'bearer', user: { id, aud: 'authenticated', role: 'authenticated',
      email: `${id}@example.invalid`, app_metadata: {}, user_metadata: {}, created_at: '2026-10-07T00:00:00Z' } };
}

async function player(id) {
  console.log(`${id}: launching independent Chromium`);
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--use-angle=metal', '--enable-gpu', '--mute-audio'] });
  browsers.push(browser);
  const context = await browser.newContext({ viewport: { width: 640, height: 900 }, deviceScaleFactor: 2, hasTouch: true });
  await context.addInitScript(({ value, apiOrigin }) => {
    localStorage.setItem('sb-wayside-fury-local-auth-token', JSON.stringify(value));
    localStorage.setItem('wayside-fury-controls-dismissed', '1');
    window.__furyWorldFixture = { sentObstacles: [], receivedObstacles: [], lastWorld: null, lastSentWorld: null };
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class FixtureWebSocket extends NativeWebSocket {
      constructor(url, protocols) {
        const target = new URL(url, location.href);
        const isFixture = target.pathname === '/wayside-fury/coop/ws';
        if (isFixture) {
          const fixtureUrl = new URL(`${target.pathname}${target.search}`, apiOrigin);
          fixtureUrl.protocol = 'ws:'; url = fixtureUrl.href;
        }
        super(url, protocols);
        this.__furyFixtureSocket = isFixture;
        if (isFixture) this.addEventListener('message', event => {
          const message = JSON.parse(event.data);
          if (message.type === 'state') window.__furyWorldFixture.lastWorld = message.state;
          if (message.type === 'obstacle') window.__furyWorldFixture.receivedObstacles.push(message);
        });
      }
      send(raw) {
        if (this.__furyFixtureSocket) {
          const message = JSON.parse(raw);
          if (message.type === 'obstacle') window.__furyWorldFixture.sentObstacles.push(message);
          if (message.type === 'state') window.__furyWorldFixture.lastSentWorld = message.state;
        }
        return super.send(raw);
      }
    };
  }, { value: session(id), apiOrigin: fixtureOrigin });
  await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (target.pathname === '/wayside-fury/save' || target.pathname.startsWith('/wayside-fury/coop/') || target.pathname === '/user/avatar') {
      await route.fulfill({ response: await route.fetch({ url: `${fixtureOrigin}${target.pathname}${target.search}` }) });
    } else if (target.protocol === 'https:') {
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    } else await route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(timeout);
  opened.push({ id, page });
  const pending = new Set();
  page.on('request', request => pending.add(request.url()));
  page.on('requestfinished', request => pending.delete(request.url()));
  page.on('pageerror', error => { errors.push(`${id}: ${error.message}`); console.error(id, 'PAGE ERROR', error.message); });
  page.on('console', message => { if (message.type() === 'error') console.error(id, 'CONSOLE', message.text()); });
  page.on('requestfailed', request => { pending.delete(request.url()); if (request.url().startsWith(base)) console.error(id, 'REQUEST FAILED', request.url(), request.failure()?.errorText); });
  page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) console.error(id, 'HTTP', response.status(), response.url()); });
  console.log(`${id}: loading preview`);
  await page.goto(`${base}/wayside-fury`, { waitUntil: 'commit', timeout });
  let sampling = false;
  const heartbeat = setInterval(async () => {
    if (sampling) return;
    sampling = true;
    try {
      console.log(id, 'BOOT HEARTBEAT', await page.evaluate(() => ({ readyState: document.readyState,
        controller: !!window.__waysideFury, primaryDisabled: document.querySelector('.wf-primary')?.disabled,
        text: document.body.innerText.slice(0, 1000) })), 'PENDING', [...pending].slice(-12));
    } catch (error) { console.log(id, 'BOOT HEARTBEAT', error.message); }
    finally { sampling = false; }
  }, 60000);
  heartbeat.unref();
  try {
    // Cold direct TS imports may trigger a Vite optimizer reload. Warm these
    // before connecting any room or arranging a scenario, then await readiness.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.evaluate(async () => {
          await Promise.all([
            import('/src/pages/WaysideFury/game/sim.ts'),
            import('/src/pages/WaysideFury/game/u1/world/obstacles.ts'),
            import('/src/pages/WaysideFury/game/u1/world/dayNightRuntime.ts'),
            import('/src/pages/WaysideFury/game/u1/world/dayNight.ts'),
          ]);
        });
        break;
      } catch (error) {
        if (attempt === 2 || !/Execution context was destroyed|navigation|Target page.*closed/.test(error.message)) throw error;
        await page.waitForLoadState('domcontentloaded', { timeout });
      }
    }
    await page.waitForFunction(() => window.__waysideFury && !document.querySelector('.wf-primary')?.disabled, null, { timeout, polling: 100 });
  } catch (error) {
    console.error(id, 'BOOT', await page.evaluate(() => ({ text: document.body.innerText, controller: !!window.__waysideFury })));
    throw error;
  } finally { clearInterval(heartbeat); }
  page.setDefaultTimeout(60000);
  console.log(`${id}: ready`);
  return { context, page };
}

async function clickVisible(page, name) {
  await page.bringToFront();
  const button = page.getByRole('button', { name, exact: true });
  await button.waitFor({ state: 'visible' }); assert.ok(await button.isEnabled());
  // Party frames can rerender during the menu transition; still dispatch a
  // physical UI click, without waiting for two identical animation frames.
  await button.click({ force: true });
}

async function attack(page, label, clearedId) {
  await page.bringToFront();
  const button = page.getByRole('button', { name: label }).last();
  await button.waitFor(); const box = await button.boundingBox(); assert.ok(box, 'context Attack has a visible control');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    if (clearedId) await waitState(page, id => window.__waysideFury.state.coop?.worldObstacles?.includes(id), clearedId);
    else await waitState(page, () => window.__waysideFury.state.previousInput.attack);
  } finally {
    await page.mouse.up();
    await waitState(page, () => !window.__waysideFury.state.previousInput.attack);
  }
}

const waitState = (page, predicate, argument) => page.waitForFunction(predicate, argument, { polling: 100 });

async function facts(page) {
  return page.evaluate(async () => {
    const { HERO_OBSTACLES, obstacleBlocks } = await import('/src/pages/WaysideFury/game/u1/world/obstacles.ts');
    const { worldCycleSeconds } = await import('/src/pages/WaysideFury/game/u1/world/dayNightRuntime.ts');
    const { sampleDayNight } = await import('/src/pages/WaysideFury/game/u1/world/dayNight.ts');
    const c = window.__waysideFury, s = c.state;
    const geometry = Object.fromEntries(['world-matt-station', 'world-joe-county'].map(id => {
      const gate = HERO_OBSTACLES.find(gate => gate.id === id);
      return [id, obstacleBlocks({ ...s, scene: gate.worldId, room: 0 }, gate.x + gate.w / 2, gate.y + gate.h / 2, 7)];
    }));
    return { role: s.coop?.role, personal: [...(s.u1?.world?.clearedObstacles ?? [])], shared: [...(s.coop?.worldObstacles ?? [])],
      geometry, seconds: worldCycleSeconds(s), ownSeconds: s.u1?.world?.cycleSeconds ?? 0, phase: sampleDayNight(worldCycleSeconds(s)).phase,
      window: s.nightWorld?.window, ids: s.enemies.filter(enemy => enemy.nightAmbient).map(enemy => enemy.id).sort((a, b) => a - b),
      sprites: s.enemies.filter(enemy => enemy.nightAmbient).map(enemy => enemy.sprite), candy: s.candy, kills: s.kills,
      nextId: s.nextId, latest: window.__furyWorldFixture.lastWorld, sent: window.__furyWorldFixture.sentObstacles,
      received: window.__furyWorldFixture.receivedObstacles, canvasPhase: document.querySelector('.wf-stage canvas')?.dataset.worldPhase };
  });
}

try {
  const host = await player('dev-host'), guest = await player('dev-guest');
  await clickVisible(host.page, 'Co-op');
  await clickVisible(host.page, 'Host');
  const code = await host.page.getByTestId('coop-code').textContent(); assert.match(code, /^[A-Z0-9]{4}$/);
  await clickVisible(host.page, 'Return to adventure');
  await host.page.evaluate(async () => {
    const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
    const c = window.__waysideFury;
    c.mutate(s => {
      enterScene(s, 'hub'); s.x = 480; s.y = 416; s.enemies = [];
      s.u1.world.clearedObstacles = ['world-joe-county']; s.coop.worldObstacles = ['world-joe-county'];
      s.u1.world.cycleSeconds = 60;
    }); c.setPaused(false);
  });
  await waitState(host.page, () => {
    const world = window.__furyWorldFixture.lastSentWorld;
    return world?.scene === 'hub' && world.worldObstacles?.includes('world-joe-county');
  });
  await clickVisible(guest.page, 'Co-op');
  await guest.page.getByLabel('Room code', { exact: true }).fill(code);
  await clickVisible(guest.page, 'Join');
  await clickVisible(guest.page, 'Return to adventure');
  await waitState(guest.page, () => window.__waysideFury.state.scene === 'hub' && window.__waysideFury.state.coop?.worldObstacles?.includes('world-joe-county'));
  const borrowed = await facts(guest.page);
  assert.ok(borrowed.shared.includes('world-joe-county')); assert.ok(!borrowed.personal.includes('world-joe-county'));
  assert.equal(borrowed.geometry['world-joe-county'], false, 'first host snapshot lends open collision');
  assert.equal(borrowed.geometry['world-matt-station'], true, 'uncleared vent remains solid');
  const guestClockBefore = borrowed.ownSeconds;
  console.log('First snapshot borrows geometry without granting personal discovery.');
  await guest.page.evaluate(async () => {
    const { HERO_OBSTACLES } = await import('/src/pages/WaysideFury/game/u1/world/obstacles.ts');
    const gate = HERO_OBSTACLES.find(gate => gate.id === 'world-matt-station'), c = window.__waysideFury;
    c.mutate(s => { s.party = ['you', 'matt']; s.active = 'you'; s.x = gate.x + gate.w / 2; s.y = gate.y + gate.h + 12;
      s.swapCooldown = s.attackTimer = s.hitStop = 0; s.previousInput.attack = false; }); c.setPaused(false);
  });
  await attack(guest.page, /Tag Matt.*Squeeze through vent/);
  assert.equal((await facts(host.page)).geometry['world-matt-station'], true, 'wrong hero cannot clear shared geometry');
  await clickVisible(guest.page, 'Swap to Matt');
  await attack(guest.page, /Matt.*Squeeze through vent/, 'world-matt-station');
  await waitState(host.page, () => window.__waysideFury.state.coop?.worldObstacles?.includes('world-matt-station'));
  await waitState(guest.page, () => window.__waysideFury.state.u1?.world?.clearedObstacles.includes('world-matt-station'));
  for (const page of [host.page, guest.page]) {
    const current = await facts(page); assert.equal(current.geometry['world-matt-station'], false);
    assert.ok(current.personal.includes('world-matt-station'));
  }
  const guestClear = await facts(guest.page), hostClear = await facts(host.page);
  assert.ok(guestClear.sent.some(message => message.id === 'world-matt-station'), 'visible Attack sent a real obstacle WebSocket event');
  assert.ok(hostClear.received.some(message => message.id === 'world-matt-station'), 'host received server-relayed guest action');
  assert.ok(!guestClear.personal.includes('world-joe-county'), 'new discovery does not copy old borrowed clears');
  assert.equal(guestClear.ownSeconds, guestClockBefore, 'guest world clock remains personal until promotion');
  for (const page of [host.page, guest.page]) {
    await page.evaluate(() => { const c = window.__waysideFury; c.mutate(s => { s.x = 324; s.y = 154; s.knockX = s.knockY = 0; }); c.setTouch({ x: 0, y: -1 }); });
    await waitState(page, () => window.__waysideFury.state.y < 123);
    await page.evaluate(() => window.__waysideFury.setTouch({ y: 0 }));
  }
  await waitState(guest.page, () => document.querySelector('.wf-save-status')?.textContent === 'Saved');
  assert.ok(fixture.sheets.get('dev-guest')?.save.u1.world.clearedObstacles.includes('world-matt-station'));
  assert.ok(!fixture.sheets.get('dev-guest')?.save.u1.world.clearedObstacles.includes('world-joe-county'));
  await guest.page.screenshot({ path: `${output}/coop-u3-cleared.png` });
  console.log('Guest Attack, relay, shared open collision, actual passage and personal cloud save pass.');
  await host.page.evaluate(async () => {
    const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
    const c = window.__waysideFury;
    c.mutate(s => { enterScene(s, 'overworld'); s.x = 490; s.y = 480; s.notice = ''; s.u1.world.cycleSeconds = 300;
      s.nightWorld = { window: null }; s.enemies = []; }); c.setPaused(false);
  });
  await waitState(guest.page, () => window.__waysideFury.state.scene === 'overworld'
    && window.__waysideFury.state.coop?.worldCycleSeconds >= 300
    && window.__waysideFury.state.enemies.filter(enemy => enemy.nightAmbient).length > 0
    && document.querySelector('.wf-stage canvas')?.dataset.worldPhase === 'night');
  const nightHost = await facts(host.page), nightGuest = await facts(guest.page);
  assert.equal(nightHost.phase, 'night'); assert.equal(nightGuest.phase, 'night');
  assert.equal(nightHost.canvasPhase, 'night'); assert.equal(nightGuest.canvasPhase, 'night');
  assert.ok(nightGuest.ids.length > 0 && nightGuest.ids.length <= 6); assert.deepEqual(nightGuest.ids, nightHost.ids);
  assert.ok(nightGuest.sprites.every(sprite => sprite === 'ghost' || sprite === 'pumpkin'));
  assert.equal(nightGuest.ownSeconds, guestClockBefore);
  await guest.page.screenshot({ path: `${output}/coop-u9-night.png` });
  console.log('Host night clock, phase and ambient monsters synchronize to the guest.');
  // Real leave triggers server authority migration from its cached latest world.
  const before = await facts(guest.page);
  await host.page.evaluate(() => window.__waysideFury.coop.leave());
  await waitState(guest.page, () => window.__waysideFury.state.coop?.role === 'host');
  const promoted = await facts(guest.page);
  assert.ok(promoted.seconds >= before.latest.worldCycleSeconds, 'promoted host adopts the newest shared clock');
  assert.ok(promoted.ownSeconds >= 300, 'promoted host clock becomes its active persisted clock');
  assert.equal(promoted.phase, 'night'); assert.ok(promoted.ids.length <= 6);
  const received = promoted.latest;
  if (promoted.window === received.nightEncounterWindow) {
    assert.deepEqual(promoted.ids, received.enemies.filter(enemy => enemy.nightAmbient).map(enemy => enemy.id).sort((a, b) => a - b),
      'promotion retains encounter window and does not replay its batch');
    assert.equal(promoted.nextId, Math.max(before.nextId, received.nextId), 'same encounter window preserves the allocator without duplicate monsters');
  } else assert.ok(promoted.ids.length <= received.enemies.filter(enemy => enemy.nightAmbient).length + 2, 'a later window emits only its current batch');
  assert.ok(!promoted.personal.includes('world-joe-county'));
  assert.equal(promoted.geometry['world-joe-county'], false, 'promoted host retains borrowed shared geometry');
  await guest.page.screenshot({ path: `${output}/coop-u9-migrated.png` });
  await guest.page.evaluate(() => window.__waysideFury.coop.leave());
  const solo = await facts(guest.page);
  assert.equal(solo.geometry['world-joe-county'], true, 'leaving restores personal uncleared collision');
  assert.equal(solo.geometry['world-matt-station'], false, 'newly discovered gate stays open personally');
  assert.equal(solo.candy, 0); assert.equal(solo.kills, 0);
  assert.deepEqual(errors, []);
  console.log(`Wayside Fury U3/U9 live co-op passed; host migration has no spawn burst; screenshots: ${output}`);
} catch (error) {
  for (const { id, page } of opened) {
    try {
      console.error(id, 'FAILURE STATE', await page.evaluate(() => {
        const c = window.__waysideFury, s = c?.state;
        return { text: document.body.innerText.slice(0, 1800), controller: !!c, started: c?.started, paused: c?.paused, hidden: document.hidden,
          scene: s?.scene, x: s?.x, y: s?.y, active: s?.active, input: s?.previousInput, room: c?.coop?.room,
          personal: s?.u1?.world, shared: s?.coop?.worldObstacles,
          sent: window.__furyWorldFixture?.sentObstacles, received: window.__furyWorldFixture?.receivedObstacles };
      }));
      await page.screenshot({ path: `${output}/coop-failure-${id}.png`, timeout: 15000 });
    } catch (debugError) { console.error(id, 'FAILURE DIAGNOSTIC', debugError.message); }
  }
  throw error;
} finally { await Promise.all(browsers.map(browser => browser.close())); await fixture.app.close(); }
