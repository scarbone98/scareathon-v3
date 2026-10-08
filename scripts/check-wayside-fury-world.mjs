// U3/U9 browser check. Uses the development inspection API only for arranging
// scenarios; obstacle activation goes through the visible Attack control.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const moduleName = process.env.PLAYWRIGHT_MODULE ?? '/Users/szaneer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
const base = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5193';
const output = process.env.FURY_WORLD_SHOTS ?? '/tmp/fury-update1-shots';
const timeout = Number(process.env.FURY_READY_TIMEOUT ?? 900000);
const actionTimeout = Number(process.env.FURY_ACTION_TIMEOUT ?? 120000);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu', ...JSON.parse(process.env.PLAYWRIGHT_ARGS ?? '[]')],
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const errors = [];
try {
  for (const size of [{ name: 'phone', width: 390, height: 844, dpr: 3 }, { name: 'desktop', width: 1440, height: 900, dpr: 2 }]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr, hasTouch: true, isMobile: size.name === 'phone' });
    await context.addInitScript(() => localStorage.setItem('wayside-fury-controls-dismissed', '1'));
    const page = await context.newPage(); page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    page.on('requestfailed', request => console.error(`Request failed: ${request.url()} (${request.failure()?.errorText})`));
    console.log(`${size.name}: loading preview`);
    page.setDefaultTimeout(timeout);
    await page.goto(`${base}/wayside-fury`, { waitUntil: 'commit', timeout });
    await page.evaluate(async () => {
      const [sim, obstacles] = await Promise.all([
        import('/src/pages/WaysideFury/game/sim.ts'), import('/src/pages/WaysideFury/game/u1/world/obstacles.ts'),
      ]);
      window.__worldFixture = { sim, obstacles };
    });
    await page.waitForFunction(() => window.__waysideFury, null, { timeout });
    console.log(`${size.name}: preview ready`);
    await page.waitForFunction(() => !document.querySelector('.wf-primary')?.disabled);
    await page.getByRole('button', { name: /Begin adventure|Continue adventure/ }).click({ timeout, force: true });
    await page.waitForFunction(() => window.__waysideFury);
    await page.evaluate(() => {
      const { sim, obstacles: { HERO_OBSTACLES } } = window.__worldFixture;
      const gate = HERO_OBSTACLES[0], s = sim.newGame(); sim.enterScene(s, 'dungeon', 0);
      s.enemies = []; s.party = ['you', 'joe']; s.active = 'you'; s.x = gate.x + gate.w / 2; s.y = gate.y + gate.h + 10;
      window.__waysideFury.start(s);
    });
    const attack = page.getByRole('button', { name: /Tag Joe.*Smash cracked boulder/ }).last();
    await attack.waitFor(); await page.screenshot({ path: `${output}/${size.name}-u3-gate.png` });
    const box = await attack.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.waitForFunction(() => window.__waysideFury.state.previousInput.attack, null, { timeout: actionTimeout });
    await page.mouse.up();
    await page.waitForFunction(() => !window.__waysideFury.state.previousInput.attack, null, { timeout: actionTimeout });
    assert.equal(await page.evaluate(() => window.__waysideFury.state.u1.world.clearedObstacles.length), 0);
    await page.getByRole('button', { name: 'Swap to Joe', exact: true }).click({ force: true });
    await page.waitForFunction(() => window.__waysideFury.state.active === 'joe', null, { timeout: actionTimeout });
    // Real key binding checks the desktop/gamepad action path too.
    await page.keyboard.down('j');
    try { await page.waitForFunction(() => window.__waysideFury.state.u1.world.clearedObstacles.includes('world-joe-road'), null, { timeout: actionTimeout }); }
    finally { await page.keyboard.up('j'); }
    await page.screenshot({ path: `${output}/${size.name}-u3-cleared.png` });
    console.log(`${size.name}: gate cleared`);
    for (const mode of ['2d', '3d']) {
      await page.evaluate(({ mode }) => window.__waysideFury.mutate(s => {
        s.scene = 'overworld'; s.room = 0; s.x = 490; s.y = 480; s.vx = s.vy = 0; s.enemies = [];
        s.notice = ''; s.u1.world.cycleSeconds = 0; s.nightWorld = { window: null };
        window.__waysideFury.setGraphicsMode(mode);
      }), { mode });
      // Cold GPU initialization can outlast a night on a contended machine.
      // Warm the requested renderer before selecting the visual test phase.
      await page.waitForFunction(mode => document.querySelector('canvas')?.dataset.gfx === mode, mode, { timeout });
      await page.evaluate(() => window.__waysideFury.mutate(s => {
        s.u1.world.cycleSeconds = 300; s.enemies = []; s.nightWorld = { window: null };
      }));
      await page.waitForFunction(mode => {
        const canvas = document.querySelector(mode === '3d' ? 'canvas.wf-canvas-3d' : 'canvas');
        return canvas?.dataset.worldPhase === 'night' && document.querySelector('.wf-world-clock')?.textContent.includes('Night') &&
          window.__waysideFury.state.enemies.some(e => e.nightAmbient);
      }, mode, { timeout: actionTimeout });
      const facts = await page.evaluate(() => ({ phase: document.querySelector('.wf-world-clock')?.textContent,
        population: window.__waysideFury.state.enemies.filter(e => e.nightAmbient).length,
        candy: window.__waysideFury.state.candy, renderer: document.querySelector('canvas')?.dataset.gfx }));
      assert.match(facts.phase, /Night/); assert.ok(facts.population > 0 && facts.population <= 6); assert.equal(facts.candy, 0); assert.equal(facts.renderer, mode);
      await page.screenshot({ path: `${output}/${size.name}-u9-night-${mode}.png` });
      console.log(`${size.name}: ${mode} night rendered`);
    }
    await context.close();
  }
  assert.deepEqual(errors, []); console.log(`Wayside Fury U3/U9 browser checks passed; screenshots: ${output}`);
} catch (error) {
  console.error('Browser errors:', errors);
  throw error;
} finally { await browser.close(); }
