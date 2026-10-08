// Run against Vite DEV so the existing game inspection API can arrange fixtures.
// FURY_BASE_URL=http://127.0.0.1:5178 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//   node scripts/check-wayside-fury-combat.mjs
// On macOS Chromium, FURY_WEBGL_BACKEND=metal enables the existing 3D backend;
// PLAYWRIGHT_ARGS='["--disable-features=LocalNetworkAccessChecks"]' allows localhost.
// Inputs and challenge completion use the real controls, never direct rewards.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { HERO_IDS, SAVE_VERSION, heroStats, sanitizeSave } from '../server/shared/waysideFury/save.js';

const base = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5178';
const output = process.env.FURY_COMBAT_SHOTS ?? '/tmp/fury-update1-shots';
const startupTimeout = Number(process.env.FURY_READY_TIMEOUT ?? 180000);
const moduleName = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const browserName = process.env.PLAYWRIGHT_BROWSER ?? 'chromium';
const playwright = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
assert.ok(playwright[browserName], `Unknown Playwright browser: ${browserName}`);
const backend = process.env.FURY_WEBGL_BACKEND ?? 'default';
const backendArgs = { default: [], metal: ['--use-angle=metal', '--enable-gpu'], swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
assert.ok(Object.hasOwn(backendArgs, backend), `Unknown FURY_WEBGL_BACKEND: ${backend}`);
if (backend !== 'default') assert.equal(browserName, 'chromium', 'FURY_WEBGL_BACKEND applies to Chromium');
const browser = await playwright[browserName].launch({ headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? process.env.PLAYWRIGHT_EXECUTABLE } : {}),
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  args: [...(browserName === 'chromium' ? ['--mute-audio'] : []), ...backendArgs[backend], ...JSON.parse(process.env.PLAYWRIGHT_ARGS ?? '[]')],
});
await mkdir(output, { recursive: true });
const results = [];
let currentPage;
let currentPending;

const heroes = Object.fromEntries(HERO_IDS.map(id => {
  const stats = heroStats(id, { level: 1, xp: 0 }, { power: 0, ward: 0 });
  return [id, { id, ...stats, level: 1, xp: 0, hp: stats.maxHp, ki: stats.maxKi,
    stamina: stats.maxStamina, invulnerable: 0 }];
}));
const { save: seed } = sanitizeSave({ version: SAVE_VERSION, chapter: 1, heroes, active: 'you',
  party: ['you', 'joe'], candy: 0, unlockedHeroes: [...HERO_IDS], areas: [], bosses: [], clearedRooms: [],
  kills: 0, deaths: 0, character: { level: 1, xp: 0 }, gear: { power: 0, ward: 0 },
  lastReported: { areas: [], bosses: [], rooms: [], level: 1 }, home: null, savedAt: 1,
  settings: { musicVolume: 0, sfxVolume: 0, controls: { tutorialDismissed: true, stickSensitivity: 1 } },
  u1: { combat: { training: Object.fromEntries(HERO_IDS.map(id => [id, 0])) } },
});
assert.ok(seed, 'full-Ki browser fixture is a valid save');

async function boot(page, mode) {
  let rejectStartup;
  const failed = new Promise((_, reject) => { rejectStartup = reject; });
  const onError = error => rejectStartup(new Error(`Wayside Fury startup failed: ${error.message}`, { cause: error }));
  page.on('pageerror', onError);
  try {
    await Promise.race([failed, (async () => {
      await page.goto(`${base}/wayside-fury${mode === '3d' ? '?gfx=3d' : ''}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => !!window.__waysideFury && !document.querySelector('.wf-primary')?.disabled);
      await page.getByRole('button', { name: 'Continue adventure', exact: true }).click();
      await page.waitForFunction(() => window.__waysideFury.state.scene === 'hub');
    })()]);
  } finally { page.off('pageerror', onError); }
}

async function enter(page, scene, x, y) {
  await page.evaluate(async ({ scene, x, y }) => {
    const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
    const game = window.__waysideFury;
    game.setTouch({});
    game.mutate(s => {
      enterScene(s, scene); s.enemies = []; s.notice = '';
      if (x !== undefined) s.x = x;
      if (y !== undefined) s.y = y;
    });
  }, { scene, x, y });
}

async function canvasMode(page, mode) {
  await page.waitForFunction(mode => {
    const canvas = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
    if (mode === '3d' && canvas?.dataset.gfxStatus === 'fallback') {
      throw new Error(`3D failed: ${canvas.dataset.gfxError}. Refusing to capture a 2D fallback as 3D.`);
    }
    return canvas?.dataset.gfx === mode;
  }, mode);
  if (mode === '3d') await page.waitForFunction(() => {
    const canvas = document.querySelector('.wf-canvas-3d');
    return canvas?.dataset.renderer === '3d' && Number(canvas.dataset.triangles) > 0;
  });
}

async function layout(page, size, label) {
  const measurements = await page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const visible = el => { const style = getComputedStyle(el); return style.display !== 'none' && style.visibility !== 'hidden' && el.getBoundingClientRect().width > 0; };
    const flat = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
    const canvas = flat.dataset.gfx === '3d' ? document.querySelector('.wf-canvas-3d') : flat;
    const badge = document.querySelector('.wf-save-status');
    return { dpr: devicePixelRatio, gfx: flat.dataset.gfx, canvas: { ...box(canvas), widthPixels: canvas.width,
      heightPixels: canvas.height, dpr: Number(canvas.dataset.renderDpr || devicePixelRatio) },
    saveBadge: badge && visible(badge) ? box(badge) : null,
    featureHuds: [...document.querySelectorAll('.wf-combat-hud, .wf-training-hud')].filter(visible).map(box),
    controls: [...document.querySelectorAll('.wf-combat-hud button, .wf-fusion-active, .wf-training-hud, .wf-training-panel button, .wf-pause')]
      .filter(visible).map(el => ({ ...box(el), label: el.getAttribute('aria-label') || el.textContent })),
    literalInteract: document.body.innerText.includes('[Interact]') };
  });
  assert.equal(measurements.dpr, size.dpr, `${label}: requested native DPR`);
  assert.equal(measurements.literalInteract, false, `${label}: contextual controls use real labels`);
  assert.ok(measurements.canvas.dpr >= 1 && measurements.canvas.dpr <= Math.min(size.dpr, 3),
    `${label}: renderer DPR follows its established quality policy`);
  assert.ok(Math.abs(measurements.canvas.widthPixels - measurements.canvas.width * measurements.canvas.dpr) <= 2,
    `${label}: canvas backing matches its reported DPR`);
  for (const control of measurements.controls) assert.ok(control.x >= -1 && control.y >= -1 &&
    control.x + control.width <= size.width + 1 && control.y + control.height <= size.height + 1,
  `${label}: control stays onscreen: ${JSON.stringify(control)}`);
  if (measurements.saveBadge) for (const hud of measurements.featureHuds) {
    const badge = measurements.saveBadge;
    const overlap = Math.min(badge.x + badge.width, hud.x + hud.width) - Math.max(badge.x, hud.x) > 0.5 &&
      Math.min(badge.y + badge.height, hud.y + hud.height) - Math.max(badge.y, hud.y) > 0.5;
    assert.equal(overlap, false, `${label}: save status does not hide fusion or challenge information`);
  }
  return measurements;
}

async function kiRelease(page, touch) {
  if (touch) {
    const button = page.getByRole('button', { name: 'Ki blast (hold to charge)', exact: true });
    const box = await button.boundingBox();
    assert.ok(box, 'Ki touch button is visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForFunction(() => window.__waysideFury.state.charge > 0);
    await page.mouse.up();
  } else {
    await page.keyboard.down('k');
    await page.waitForFunction(() => window.__waysideFury.state.charge > 0);
    await page.keyboard.up('k');
  }
}

// Feedback steering sends normal DOM pointer events through the real stick,
// or WASD keys, and reads only inspection state to know when each ring passed.
async function completeFootwork(page, touch) {
  let origin;
  const held = new Set();
  if (touch) {
    const box = await page.getByRole('group', { name: 'Movement stick. Touch anywhere here and drag to move.', exact: true }).boundingBox();
    assert.ok(box, 'training movement stick is visible');
    origin = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(origin.x, origin.y); await page.mouse.down();
  }
  try {
    for (;;) {
      const state = await page.evaluate(() => {
        const s = window.__waysideFury.state, t = s.training;
        return { x: s.x, y: s.y, training: t && { ring: t.rings[t.ringIndex], index: t.ringIndex,
          elapsed: t.elapsed, limit: t.timeLimit }, tier: s.u1.combat.training.you, notice: s.notice };
      });
      if (!state.training) { assert.equal(state.tier, 1, `time trial completes through movement: ${state.notice}`); return; }
      assert.ok(state.training.elapsed < state.training.limit, 'time trial remains within its limit');
      const dx = state.training.ring.x - state.x, dy = state.training.ring.y - state.y;
      if (touch) {
        const length = Math.max(1, Math.hypot(dx, dy));
        await page.mouse.move(origin.x + dx / length * 42, origin.y + dy / length * 42);
      } else {
        const wanted = new Set();
        if (Math.abs(dx) > 5) wanted.add(dx > 0 ? 'd' : 'a');
        if (Math.abs(dy) > 5) wanted.add(dy > 0 ? 's' : 'w');
        for (const key of held) if (!wanted.has(key)) { await page.keyboard.up(key); held.delete(key); }
        for (const key of wanted) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
      }
      await page.waitForTimeout(35);
    }
  } finally {
    if (touch) await page.mouse.up();
    for (const key of held) await page.keyboard.up(key);
  }
}

try {
  for (const size of [{ width: 390, height: 844, dpr: 3, touch: true }, { width: 1440, height: 900, dpr: 2, touch: false }]) {
    for (const mode of ['2d', '3d']) {
      const label = `${size.width}x${size.height}-${mode}`;
      console.log(`Checking fusion and training at ${label}`);
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height },
        deviceScaleFactor: size.dpr, hasTouch: size.touch, isMobile: size.touch });
      context.setDefaultTimeout(startupTimeout);
      context.setDefaultNavigationTimeout(startupTimeout);
      await context.addInitScript(seed => {
        if (!localStorage.getItem('wayside-fury-save')) localStorage.setItem('wayside-fury-save', JSON.stringify(seed));
        localStorage.setItem('wayside-fury-controls-dismissed', '1');
      }, seed);
      await context.route('https://**/*', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
      const page = await context.newPage(); currentPage = page;
      const errors = [];
      const pending = new Set(); currentPending = pending;
      page.on('request', request => pending.add(request.url()));
      page.on('requestfinished', request => pending.delete(request.url()));
      page.on('response', response => { if (response.status() >= 400) console.error(`${label}: HTTP ${response.status()} ${response.url()}`); });
      page.on('pageerror', error => { errors.push(error.message); console.error(`${label}: page error: ${error.message}`); });
      page.on('console', message => { if (message.type() === 'error') console.error(`${label}: console error: ${message.text()}`); });
      page.on('requestfailed', request => { pending.delete(request.url()); console.error(`${label}: request failed: ${request.url()} ${request.failure()?.errorText}`); });
      await boot(page, mode);
      console.log(`${label}: saved adventure loaded`);
      await enter(page, 'overworld'); await canvasMode(page, mode);
      await page.screenshot({ path: `${output}/combat-overworld-${label}.png` });
      const overworld = await layout(page, size, `${label} overworld`);

      await enter(page, 'dungeon'); await canvasMode(page, '2d');
      const fuse = page.getByRole('button', { name: /^Fuse heroes\./ });
      await fuse.waitFor(); assert.equal(await fuse.isEnabled(), true, 'two full-Ki heroes can fuse');
      await fuse.click();
      await page.waitForFunction(() => window.__waysideFury.state.fusion.world.forms.length === 1);
      const fusion = await page.evaluate(() => {
        const s = window.__waysideFury.state;
        return { form: s.fusion.world.forms[0], ki: s.heroes.you.ki, partnerKi: s.heroes.joe.ki };
      });
      assert.deepEqual(fusion.form.heroes, ['you', 'joe']);
      assert.ok(fusion.form.remaining > 10 && fusion.form.remaining <= 12, 'fusion lasts approximately 12 seconds');
      assert.ok(fusion.ki < 5 && fusion.partnerKi < 5, 'fusion consumes both full Ki bars');
      await page.waitForFunction(() => window.__waysideFury.state.fusion.world.forms[0]?.remaining < 11.8);
      await page.screenshot({ path: `${output}/fusion-${label}.png` });
      const fusedLayout = await layout(page, size, `${label} fusion`);
      await kiRelease(page, size.touch);
      await page.waitForFunction(() => window.__waysideFury.state.fusion.world.forms[0]?.specialUsed);
      assert.ok(await page.evaluate(() => window.__waysideFury.state.fusion.spentSpecialIds.length === 1),
        'actual Ki release spends the fusion special once');
      console.log(`${label}: fusion and Supernova passed`);

      await enter(page, 'hub', 304, 360);
      await page.getByRole('button', { name: /Training grounds/ }).click();
      const start = page.getByRole('button', { name: 'Start time trial', exact: true });
      await start.waitFor();
      await page.screenshot({ path: `${output}/training-board-${label}.png` });
      const boardLayout = await layout(page, size, `${label} training board`);
      await start.click();
      await page.waitForFunction(() => window.__waysideFury.state.training?.kind === 'time-trial');
      await page.waitForFunction(() => window.__waysideFury.state.training?.elapsed > 0.1);
      await page.screenshot({ path: `${output}/training-active-${label}.png` });
      const trainingLayout = await layout(page, size, `${label} active training`);
      await completeFootwork(page, size.touch);
      console.log(`${label}: time trial completed through movement controls`);
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('wayside-fury-save'))?.u1?.combat?.training?.you === 1);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wayside-fury-save')));
      assert.equal(saved.candy, 0, 'practice grants no candy');
      assert.equal(saved.kills, 0, 'practice grants no kills');
      assert.deepEqual(saved.lastReported, seed.lastReported, 'signature upgrades do not become ticket deltas');
      await page.screenshot({ path: `${output}/training-complete-${label}.png` });
      await page.reload({ waitUntil: 'commit' });
      await page.waitForFunction(() => !!window.__waysideFury && !document.querySelector('.wf-primary')?.disabled);
      await page.getByRole('button', { name: 'Continue adventure', exact: true }).click();
      await page.waitForFunction(() => window.__waysideFury.state.u1.combat.training.you === 1);
      assert.equal(errors.length, 0, errors.join('\n'));
      results.push({ size, mode, overworld, fusedLayout, boardLayout, trainingLayout, fusion, tierAfterReload: 1 });
      await context.close();
    }
  }
  await writeFile(`${output}/combat.json`, JSON.stringify(results, null, 2));
  console.log(`Fusion, Supernova, real-input training and persistence pass. Screenshots: ${output}/`);
} catch (error) {
  console.error('Pending browser resources:', JSON.stringify([...(currentPending ?? [])]));
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: `${output}/combat-failure.png`, timeout: 10000 }).catch(() => {});
    await writeFile(`${output}/combat-failure.txt`, await currentPage.locator('body').innerText({ timeout: 5000 }).catch(() => ''));
  }
  throw error;
} finally {
  await browser.close();
}
