// Run against a Vite development server. The isolated fixture chooses a free
// loopback port, and this browser redirects its API/co-op transport there.
// FURY_BASE_URL=http://127.0.0.1:5185 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//   node scripts/check-wayside-fury-hub.mjs
// Real save/co-op routes use isolated synthetic accounts; Arcade submissions are
// intercepted and checked with the production arena validator, without a database.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startFuryTestServer } from './fury-coop-test-server.mjs';
import { validateArenaScoreSubmission } from '../server/wayside-fury/arenaScore.js';
import { arenaScore, arenaWaveEnemyCount, isArenaGame } from '../server/shared/waysideFury/u1Arena.js';

const base = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5185';
const port = Number(process.env.FURY_TEST_PORT ?? 0);
const shots = process.env.FURY_HUB_SHOTS ?? '/tmp/fury-update1-shots';
const arenaOnly = process.env.FURY_HUB_SCOPE === 'arena';
const quick = process.env.FURY_HUB_QUICK === '1';
const skipCoop = process.env.FURY_HUB_COOP === '0';
const skipCapture = process.env.FURY_HUB_CAPTURE === '0';
const bootTimeout = Number(process.env.FURY_HUB_BOOT_TIMEOUT_MS ?? 600_000);
const moduleName = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
await mkdir(shots, { recursive: true });
const fixture = await startFuryTestServer(port);
const api = `http://127.0.0.1:${fixture.app.server.address().port}`;
const angle = process.env.FURY_BROWSER_ANGLE ?? (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const graphicsArgs = angle === 'off' ? ['--disable-gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit'] :
  [`--use-angle=${angle}`, angle === 'swiftshader' ? '--enable-unsafe-swiftshader' : '--enable-gpu'];
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  args: ['--mute-audio', ...graphicsArgs] });
const errors = [], submissions = [], measurements = [], captureIssues = [], qualityIssues = [];
let activePage;

function session(id) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: id, exp: 4_000_000_000, role: 'authenticated', aud: 'authenticated' })).toString('base64url');
  return { access_token: `${header}.${payload}.fixture`, refresh_token: 'fixture', expires_at: 4_000_000_000,
    expires_in: 3600, token_type: 'bearer', user: { id, aud: 'authenticated', role: 'authenticated',
      email: `${id}@example.invalid`, app_metadata: {}, user_metadata: {}, created_at: '2026-10-07T00:00:00Z' } };
}

async function player(id, size, graphics = '2d') {
  console.log(`Opening ${id} at ${size.width}x${size.height} (${graphics})`);
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.dpr, hasTouch: true, isMobile: size.width < 600 });
  context.setDefaultTimeout(120_000);
  await context.addInitScript(({ value, api }) => {
    performance.setResourceTimingBufferSize(5000);
    localStorage.setItem('sb-wayside-fury-local-auth-token', JSON.stringify(value));
    localStorage.setItem('wayside-fury-controls-dismissed', '1');
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url, protocols) {
        const target = new URL(url, window.location.href);
        if (target.pathname === '/wayside-fury/coop/ws') {
          target.host = new URL(api).host;
          target.protocol = 'ws:';
        }
        super(target.href, protocols);
      }
    };
  }, { value: session(id), api });
  const routeFixture = async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/games/getLeaderboard') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
    }
    if (url.pathname === '/games/submitScore') {
      const body = request.postDataJSON();
      if (isArenaGame(body.game)) {
        const checked = validateArenaScoreSubmission(body);
        assert.ok(checked.ok, checked.error);
        assert.equal(body.metricName, 'score');
        submissions.push({ user: id, ...body });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"coinsAwarded":0,"weeklyChallengeRewards":[]}}' });
    }
    if (url.pathname === '/wayside-fury/save' || url.pathname === '/user/avatar' || url.pathname === '/wayside-fury/coop/ticket') {
      const response = await route.fetch({ url: `${api}${url.pathname}${url.search}` });
      return route.fulfill({ response });
    }
    if (url.protocol === 'https:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    return route.continue();
  };
  for (const pattern of ['**/games/getLeaderboard*', '**/games/submitScore*', '**/wayside-fury/save*', '**/user/avatar*', '**/wayside-fury/coop/ticket*', 'http://wayside-fury-local.supabase.co/**', 'https://**']) {
    await context.route(pattern, routeFixture);
  }
  const page = await context.newPage();
  activePage = page;
  const pending = new Set();
  page.on('request', request => pending.add(request.url()));
  page.on('requestfinished', request => pending.delete(request.url()));
  page.on('requestfailed', request => {
    pending.delete(request.url());
    console.error(`REQUEST: ${request.url()} ${request.failure()?.errorText}`);
  });
  page.on('pageerror', error => { errors.push(error.message); console.error(`BROWSER: ${error.message}`); });
  page.on('console', message => { if (message.type() === 'error') console.error(`CONSOLE: ${message.text()}`); });
  console.log(`Navigating ${id} to ${base}`);
  await page.goto(`${base}/wayside-fury?gfx=${graphics}`, { waitUntil: 'commit', timeout: bootTimeout });
  console.log(`Waiting for ${id} character/save readiness`);
  const bootProgress = setInterval(() => {
    console.log(`Still loading ${id}: ${pending.size} requests pending; ${JSON.stringify([...pending].slice(0, 8))}`);
    void page.evaluate(() => ({ controller: !!window.__waysideFury, primary: document.querySelector('.wf-primary')?.textContent, body: document.body.innerText.slice(0, 1200) })).then(state => console.log(`Startup UI ${id}: ${JSON.stringify(state)}`)).catch(() => {});
  }, 60_000);
  try {
    await page.waitForFunction(() => window.__waysideFury && !document.querySelector('.wf-primary')?.disabled, null, { timeout: bootTimeout, polling: 100 });
  } catch (error) {
    console.error(`STARTUP pending: ${JSON.stringify([...pending])}`);
    console.error(`STARTUP state: ${JSON.stringify(await page.evaluate(() => ({ ready: document.readyState, body: document.body.innerHTML.slice(0, 2000), controller: !!window.__waysideFury })).catch(() => null))}`);
    throw error;
  } finally {
    clearInterval(bootProgress);
  }
  console.log(`${id} ready`);
  return { context, page };
}

async function press(locator) {
  await locator.waitFor({ state: 'visible' });
  assert.ok(await locator.isEnabled(), 'the UI control must be enabled before it is pressed');
  if ((await locator.innerText()).includes('tournament')) {
    const target = await locator.evaluate(button => {
      const rect = button.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { disabled: button.disabled, covered: !hit || !button.contains(hit), hit: hit ? `${hit.tagName}.${hit.className}` : null };
    });
    console.log(`Arena Start target: ${JSON.stringify(target)}`);
    assert.ok(!target.covered, `Arena Start is covered by ${target.hit}`);
  }
  await locator.click({ force: true });
}
async function waitForState(page, predicate, argument, timeout = 120_000) {
  return page.waitForFunction(predicate, argument, { polling: 100, timeout });
}

async function begin(page) {
  console.log('Beginning adventure through the title control');
  await press(page.getByRole('button', { name: /Begin adventure|Continue adventure/ }));
  const skip = page.getByRole('button', { name: 'Skip prologue', exact: true });
  if (await skip.isVisible()) await press(skip);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').filter(entry => new URL(entry.name, location.href).pathname === '/src/pages/WaysideFury/game/sim.ts').at(-1)?.name ?? '/src/pages/WaysideFury/game/sim.ts';
    const { enterScene } = await import(url);
    window.__waysideFury.mutate(s => { enterScene(s, 'hub'); });
    window.__waysideFury.setPaused(false);
  });
  const dismiss = page.getByRole('button', { name: 'Dismiss tutorial', exact: true });
  if (await dismiss.isVisible()) await press(dismiss);
}

async function interactAt(page, x, y) {
  console.log(`Interacting in the hub at ${x},${y}`);
  await page.evaluate(async point => {
    const url = performance.getEntriesByType('resource').filter(entry => new URL(entry.name, location.href).pathname === '/src/pages/WaysideFury/game/sim.ts').at(-1)?.name ?? '/src/pages/WaysideFury/game/sim.ts';
    const { interact } = await import(url);
    window.__waysideFury.mutate(s => {
      s.x = point.x; s.y = point.y; s.faceX = 0; s.faceY = -1;
      s.overlay = null; s.transitionCooldown = 0; interact(s);
    });
  }, { x, y });
}

async function capture(page, name) {
  console.log(`Capturing ${name}`);
  assert.ok(!(await page.locator('body').innerText()).includes('[Interact]'), 'UI must use action labels');
  if (skipCapture) {
    captureIssues.push({ name, error: 'Visual capture was separated from this UI/save run' });
    console.warn(`CAPTURE SKIPPED ${name}: separate visual run required`);
    return;
  }
  let cdp;
  try {
    cdp = await bounded(page.context().newCDPSession(page), 15_000, 'Screenshot session timeout');
    const { data } = await bounded(cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true }), 15_000, 'Screenshot capture timeout');
    await writeFile(`${shots}/${name}.png`, Buffer.from(data, 'base64'));
  } catch (error) {
    captureIssues.push({ name, error: error.message });
    console.warn(`CAPTURE UNAVAILABLE ${name}: ${error.message}`);
  } finally { if (cdp) await bounded(cdp.detach(), 2000, 'Screenshot detach timeout').catch(() => {}); }
}
function bounded(promise, timeout, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeout); })]).finally(() => clearTimeout(timer));
}

async function arenaWave(page) {
  await waitForState(page, () => window.__waysideFury.state.scene === 'arena' && window.__waysideFury.state.enemies.length > 0);
  const before = await page.evaluate(() => {
    const s = window.__waysideFury.state;
    return { wave: s.arena.wave, modifier: s.arena.modifier, enemies: s.enemies.length, elapsedMs: s.arena.elapsedMs };
  });
  assert.equal(before.enemies, arenaWaveEnemyCount(before.wave));
  assert.ok(before.elapsedMs >= 2950, 'the opening countdown runs before spawning');
  // Preserve production wave timing/ledger; only enemy HP is changed for a
  // deterministic clear, so no combat skill or synthetic fast-forward is needed.
  await page.evaluate(() => window.__waysideFury.mutate(s => {
    s.heroes[s.active].invulnerable = 3600;
    s.enemies.forEach(enemy => { enemy.hp = 0; });
  }));
  const cleared = await waitForState(page, wave => window.__waysideFury.state.arena.wavesCleared === wave && { ...window.__waysideFury.state.arena }, before.wave);
  const after = await cleared.jsonValue();
  await cleared.dispose();
  assert.equal(after.kills, before.enemies);
  assert.equal(after.wave, before.wave + 1);
  assert.notEqual(after.modifier, before.modifier, 'the next wave escalates its modifier');
  assert.ok(after.intermission > 0, 'wave clears create a real intermission');
  return after;
}

async function saved(page, id) {
  await waitForState(page, () => document.querySelector('.wf-save-status')?.textContent === 'Saved');
  assert.ok(fixture.sheets.get(id)?.save, 'progress reaches the authenticated save route');
  return fixture.sheets.get(id).save;
}

async function solo(size, graphics) {
  fixture.sheets.delete('dev-host');
  const label = `${size.width}x${size.height}-${graphics}`;
  console.log(`Checking ${arenaOnly ? 'arena' : 'arena and quests'}: ${label}`);
  const { context, page } = await player('dev-host', size, graphics);
  try {
    await begin(page);
    // Arena entrance and menu are reached through the same interaction source
    // used by keyboard, gamepad and the context Attack button.
    await interactAt(page, 624, 240);
    await page.locator('.wf-arena-panel').waitFor();
    await capture(page, `u5-arena-entrance-${label}`);
    await press(page.getByRole('button', { name: 'Start solo tournament', exact: true }));
    await waitForState(page, () => window.__waysideFury.state.scene === 'arena');
    await page.evaluate(() => window.__waysideFury.mutate(s => { s.heroes[s.active].invulnerable = 3600; }));
    await waitForState(page, () => window.__waysideFury.state.enemies.length > 0);
    await capture(page, `u5-arena-wave-${label}`);
    const run = await arenaWave(page), score = arenaScore(run.wavesCleared, run.kills);
    await press(page.getByRole('button', { name: 'Retire', exact: true }));
    await page.locator('.wf-arena-result').waitFor();
    assert.equal(await page.locator('.wf-arena-result > strong').innerText(), score.toLocaleString());
    const best = await page.evaluate(() => window.__waysideFury.state.hubArena.soloBest);
    assert.equal(best, score);
    assert.equal(await page.locator('.wf-stage canvas').first().getAttribute('data-gfx'), '2d', 'hub/arena share the 2D scene in both graphics modes');
    const renderDpr = Number(await page.locator('.wf-stage canvas').first().getAttribute('data-render-dpr'));
    if (renderDpr !== size.dpr) {
      qualityIssues.push({ label, requestedDpr: size.dpr, renderDpr });
      console.warn(`NATIVE DPR UNAVAILABLE ${label}: requested ${size.dpr}, renderer ${renderDpr}; continuing independent UI/save assertions`);
    }
    await capture(page, `u5-arena-result-${label}`);
    const arenaSave = await saved(page, 'dev-host');
    assert.equal(arenaSave.u1.hub.arena.soloBest, score);
    await press(page.getByRole('button', { name: 'Continue to Wayside', exact: true }));
    if (arenaOnly) {
      await page.reload({ waitUntil: 'commit', timeout: bootTimeout });
      await waitForState(page, () => window.__waysideFury && !document.querySelector('.wf-primary')?.disabled, null, bootTimeout);
      await begin(page);
      assert.equal(await page.evaluate(() => window.__waysideFury.state.hubArena.soloBest), score, 'reload preserves solo best');
      measurements.push({ label, score, best, renderDpr });
      console.log(`Passed solo arena: ${label}`);
      return;
    }

    await page.evaluate(() => window.__waysideFury.mutate(s => { s.candy = 50; }));
    await interactAt(page, 624, 432);
    const dialogue = page.locator('.wf-quest-dialogue');
    await dialogue.waitFor();
    assert.ok((await dialogue.innerText()).includes('Bea'));
    await press(dialogue.getByRole('button', { name: /^Next/ }));
    await press(dialogue.getByRole('button', { name: 'Accept quest', exact: true }));
    await press(dialogue.getByRole('button', { name: 'Deliver 18 candy', exact: true }));
    const candy = await page.evaluate(() => window.__waysideFury.state.candy);
    assert.equal(candy, 32, 'delivery consumes the requested candy once');
    await capture(page, `u8-quest-completed-${label}`);
    await press(dialogue.getByRole('button', { name: /^Continue/ }));
    await press(page.getByRole('button', { name: 'Pause', exact: true }));
    await press(page.getByRole('button', { name: 'Quest log', exact: true }));
    const log = page.locator('.wf-quest-log');
    await log.waitFor();
    assert.equal(await log.locator('.wf-quest-card').count(), 7, 'all seven hub requests appear');
    await press(log.getByRole('button', { name: 'BBQ apron', exact: true }));
    assert.equal(await page.evaluate(() => window.__waysideFury.state.hubCosmetic), 'bbq-apron', 'earned quest cosmetics can be worn');
    await capture(page, `u8-quest-log-${label}`);
    await press(log.getByRole('button', { name: 'Completed', exact: true }));
    assert.equal(await log.locator('.wf-quest-card').count(), 1);
    await press(log.locator('.wf-quest-card'));
    assert.equal(await log.getByRole('button', { name: 'Deliver 18 candy', exact: true }).count(), 0, 'completed quests cannot be delivered twice');
    const save = await saved(page, 'dev-host');
    assert.equal(save.u1.hub.arena.soloBest, score);
    assert.ok(save.u1.hub.quests.cosmetics.includes('bbq-apron'));
    assert.equal(save.u1.hub.cosmetic, 'bbq-apron');
    await page.reload({ waitUntil: 'commit', timeout: bootTimeout });
    await waitForState(page, () => window.__waysideFury && !document.querySelector('.wf-primary')?.disabled, null, bootTimeout);
    await begin(page);
    await interactAt(page, 624, 432);
    await page.locator('.wf-quest-dialogue').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Deliver 18 candy', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.__waysideFury.state.candy), candy, 'reload preserves claimed quest and inventory');
    assert.equal(await page.evaluate(() => window.__waysideFury.state.hubCosmetic), 'bbq-apron', 'reload preserves the worn cosmetic');
    measurements.push({ label, score, best, candy, savedCosmetic: 'bbq-apron', renderDpr });
    console.log(`Passed solo arena and quest UI: ${label}`);
  } catch (error) {
    const state = await page.evaluate(() => {
      const game = window.__waysideFury, s = game?.state;
      return { started: game?.started, paused: game?.paused, scene: s?.scene, overlay: s?.overlay, time: s?.time, arena: s?.arena, hp: s?.heroes[s.active]?.hp, coop: s?.coop && { role: s.coop.role, playerCount: s.coop.playerCount }, hidden: document.hidden,
        canvas: { ...document.querySelector('.wf-stage canvas')?.dataset }, lastFrame: game?.last, frameAccumulator: game?.acc };
    }).catch(error => ({ error: error.message }));
    console.error(`FAILURE state ${label}: ${JSON.stringify(state)}`);
    await writeFile(`${shots}/hub-failure-${label}.json`, JSON.stringify(state, null, 2));
    await writeFile(`${shots}/hub-failure-${label}.txt`, await page.locator('body').innerText().catch(() => ''));
    await capture(page, `hub-failure-${label}`).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

async function coop() {
  fixture.sheets.clear();
  const size = { width: 1280, height: 900, dpr: 2 };
  const host = await player('dev-host', size), guest = await player('dev-guest', size, '3d');
  try {
    await press(host.page.getByRole('button', { name: 'Co-op', exact: true }));
    await press(host.page.getByRole('button', { name: 'Host', exact: true }));
    const code = await host.page.getByTestId('coop-code').textContent();
    await press(host.page.getByRole('button', { name: 'Return to adventure', exact: true }));
    await press(guest.page.getByRole('button', { name: 'Co-op', exact: true }));
    await guest.page.getByLabel('Room code', { exact: true }).fill(code);
    await press(guest.page.getByRole('button', { name: 'Join', exact: true }));
    await press(guest.page.getByRole('button', { name: 'Return to adventure', exact: true }));
    await host.page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').filter(entry => new URL(entry.name, location.href).pathname === '/src/pages/WaysideFury/game/sim.ts').at(-1)?.name ?? '/src/pages/WaysideFury/game/sim.ts';
      const { enterScene } = await import(url);
      window.__waysideFury.mutate(s => { enterScene(s, 'hub'); });
      window.__waysideFury.setPaused(false);
    });
    await waitForState(host.page, () => window.__waysideFury.state.coop.remoteHeroes.length === 1);
    await waitForState(guest.page, () => window.__waysideFury.state.scene === 'hub');
    await interactAt(host.page, 624, 240);
    await press(host.page.getByRole('button', { name: 'Start co-op tournament', exact: true }));
    await waitForState(guest.page, () => window.__waysideFury.state.scene === 'arena' && window.__waysideFury.state.enemies.length === 5);
    await guest.page.evaluate(() => window.__waysideFury.mutate(s => { s.heroes[s.active].invulnerable = 3600; }));
    await guest.page.evaluate(() => window.__waysideFury.setPaused(false));
    assert.ok(await guest.page.getByRole('button', { name: 'Retire', exact: true }).isDisabled(), 'only the host can end the shared run');
    const run = await arenaWave(host.page);
    await waitForState(guest.page, () => window.__waysideFury.state.arena.wavesCleared === 1);
    await capture(guest.page, 'u5-arena-coop-guest');
    await press(host.page.getByRole('button', { name: 'Retire', exact: true }));
    await waitForState(guest.page, () => window.__waysideFury.state.arena.status === 'finished' && window.__waysideFury.state.hubArena.coopBest > 0);
    const score = arenaScore(run.wavesCleared, run.kills);
    for (const [id, player] of [['dev-host', host], ['dev-guest', guest]]) {
      const save = await saved(player.page, id);
      assert.equal(save.u1.hub.arena.coopBest, score, `${id} saves their own co-op best`);
      assert.equal(save.u1.hub.arena.soloBest, 0, 'co-op runs stay off the solo best');
    }
    await capture(host.page, 'u5-arena-coop-result');
    console.log('Passed host-authoritative arena and per-player co-op best saves.');
  } finally { await host.context.close(); await guest.context.close(); }
}

try {
  const sizes = [{ width: 1440, height: 900, dpr: 2 }, { width: 390, height: 844, dpr: 3 }];
  const selectedSizes = process.env.FURY_HUB_VIEWPORT === 'portrait' ? sizes.slice(1) : process.env.FURY_HUB_VIEWPORT === 'desktop' || quick ? sizes.slice(0, 1) : sizes;
  const modes = process.env.FURY_HUB_GFX ? [process.env.FURY_HUB_GFX] : quick ? ['2d'] : ['2d', '3d'];
  for (const graphics of modes) for (const size of selectedSizes) await solo(size, graphics);
  if (!skipCoop) await coop();
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.ok(submissions.some(s => s.arenaRun.mode === 'solo') && (skipCoop || submissions.some(s => s.arenaRun.mode === 'coop')));
  await writeFile(`${shots}/hub-check.json`, JSON.stringify({ measurements, submissions, captureIssues, qualityIssues }, null, 2));
  if (captureIssues.length) console.warn(`${captureIssues.length} visual captures unavailable; UI/save assertions are independent of those captures.`);
  assert.equal(qualityIssues.length, 0, `Native DPR visual QA failed: ${JSON.stringify(qualityIssues)}`);
  console.log(`Wayside Fury ${arenaOnly ? 'U5' : 'U5/U8'} checks passed. Screenshots: ${shots}/`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await writeFile(`${shots}/hub-failure.txt`, await activePage.locator('body').innerText().catch(() => ''));
    await capture(activePage, 'hub-failure').catch(() => {});
  }
  throw error;
} finally { await browser.close(); await fixture.app.close(); }
