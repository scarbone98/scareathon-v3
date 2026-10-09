// Adapted from Update 1 U9: native-DPR day/night parity and optional pause clock.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const moduleName = process.env.PLAYWRIGHT_MODULE ?? '/Users/szaneer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
const base = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5230';
const output = process.env.FURY_WORLD_SHOTS ?? '/tmp/fury-u1world-shots';
const timeout = Number(process.env.FURY_READY_TIMEOUT ?? 900000);
const actionTimeout = Number(process.env.FURY_ACTION_TIMEOUT ?? 120000);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', ...JSON.parse(process.env.PLAYWRIGHT_ARGS ?? '[]')],
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const errors = [];
try {
  for (const size of [{ name: 'phone', width: 390, height: 844, dpr: 3 }, { name: 'desktop', width: 1440, height: 900, dpr: 2 }].filter(size => !process.env.FURY_CASES || process.env.FURY_CASES.split(',').includes(size.name))) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr, hasTouch: true, isMobile: size.name === 'phone' });
    await context.addInitScript(() => localStorage.setItem('wayside-fury-controls-dismissed', '1'));
    const page = await context.newPage(); page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    page.on('requestfailed', request => console.error(`Request failed: ${request.url()} (${request.failure()?.errorText})`));
    console.log(`${size.name}: loading preview`);
    page.setDefaultTimeout(timeout);
    await page.goto(`${base}/wayside-fury`, { waitUntil: 'commit', timeout });
    await page.waitForFunction(() => window.__waysideFury && !document.querySelector('.wf-primary')?.disabled);
    await page.getByRole('button', { name: /Begin adventure|Continue adventure/ }).click({ timeout, force: true });
    await page.evaluate(async () => {
      const sim = await import('/src/pages/WaysideFury/game/sim.ts');
      const s = sim.newGame(); sim.enterScene(s, 'overworld');
      window.__waysideFury.start(s);
    });
    for (const requestedMode of ['2d', '3d'].filter(mode => !process.env.FURY_GFX_MODES || process.env.FURY_GFX_MODES.split(',').includes(mode))) {
      await page.evaluate(({ mode }) => window.__waysideFury.mutate(s => {
        s.scene = 'overworld'; s.room = 0; s.x = 490; s.y = 480; s.vx = s.vy = 0; s.enemies = [];
        s.notice = ''; s.worldCycleSeconds = 0; s.nightWorld = { window: null };
        window.__waysideFury.setGraphicsMode(mode);
      }), { mode: requestedMode });
      // Cold GPU initialization can outlast a night on a contended machine.
      // Warm the requested renderer before selecting the visual test phase.
      console.log(`${size.name}: warming ${requestedMode}`);
      const heartbeat = setInterval(async () => {
        try { console.log(size.name, requestedMode, await page.evaluate(() => ({ gfx: document.querySelector('canvas')?.dataset.gfx,
          status: document.querySelector('canvas')?.dataset.gfxStatus, error: document.querySelector('canvas')?.dataset.gfxError }))); }
        catch { /* Page teardown will end the wait. */ }
      }, 30000);
      try {
        await page.waitForFunction(mode => document.querySelector('canvas')?.dataset.gfx === mode
          || mode === '3d' && document.querySelector('canvas')?.dataset.gfxStatus === 'fallback', requestedMode, { timeout });
      } finally { clearInterval(heartbeat); }
      const mode = await page.evaluate(() => document.querySelector('canvas').dataset.gfx);
      if (mode !== requestedMode) console.log(`${size.name}: clean ${requestedMode} fallback to ${mode}`);
      await page.evaluate(() => window.__waysideFury.mutate(s => {
        s.worldCycleSeconds = 300; s.enemies = []; s.nightWorld = { window: null };
      }));
      await page.waitForFunction(mode => {
        const canvas = document.querySelector(mode === '3d' ? 'canvas.wf-canvas-3d' : 'canvas');
        return canvas?.dataset.worldPhase === 'night' &&
          window.__waysideFury.state.enemies.some(e => e.nightAmbient);
      }, mode, { timeout: actionTimeout });
      const facts = await page.evaluate(mode => ({ phase: document.querySelector(mode === '3d' ? 'canvas.wf-canvas-3d' : '.wf-stage canvas')?.dataset.worldPhase,
        population: window.__waysideFury.state.enemies.filter(e => e.nightAmbient).length,
        candy: window.__waysideFury.state.candy, renderer: document.querySelector('canvas')?.dataset.gfx }), mode);
      assert.equal(facts.phase, "night"); assert.ok(facts.population > 0 && facts.population <= 6); assert.equal(facts.candy, 0); assert.equal(facts.renderer, mode);
      const pixels = await page.evaluate(mode => {
        const canvas = document.querySelector(mode === '3d' ? 'canvas.wf-canvas-3d' : '.wf-stage canvas');
        return { width: canvas.width, css: canvas.getBoundingClientRect().width, dpr: devicePixelRatio };
      }, mode);
      assert.ok(pixels.width >= pixels.css * pixels.dpr * .95, 'native DPR stays intact');
      await page.screenshot({ path: `${output}/${size.name}-u9-night-${mode}.png` });
      await page.keyboard.press('Escape');
      await page.getByRole('heading', { name: 'Paused', exact: true }).waitFor();
      assert.match(await page.locator('.wf-world-clock').textContent(), /Night/);
      await page.getByLabel('Show county clock', { exact: true }).uncheck();
      assert.equal(await page.locator('.wf-world-clock').count(), 0);
      await page.getByLabel('Show county clock', { exact: true }).check();
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.evaluate(() => window.__waysideFury.mutate(s => { s.worldCycleSeconds=0; }));
      await page.waitForFunction(mode => document.querySelector(mode === '3d' ? 'canvas.wf-canvas-3d' : '.wf-stage canvas')?.dataset.worldPhase === 'day'
        && !window.__waysideFury.state.enemies.some(e => e.nightAmbient), mode);
      await page.screenshot({ path: `${output}/${size.name}-u9-day-${mode}.png` });
      console.log(`${size.name}: ${mode} night rendered`);
    }
    await context.close();
  }
  assert.deepEqual(errors, []); console.log(`Wayside Fury U9 browser checks passed; screenshots: ${output}`);
} catch (error) {
  console.error('Browser errors:', errors);
  throw error;
} finally { await browser.close(); }
