import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const source = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(source.startsWith('/') ? pathToFileURL(source).href : source);
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), args: ['--mute-audio'] });
const errors = [], shots = '/tmp/fury-u1hub-shots'; await mkdir(shots, { recursive: true });
try {
  for (const [name, viewport, dpr, gfx] of [['phone', { width: 390, height: 844 }, 3, '2d'], ['desktop', { width: 1280, height: 800 }, 2, '3d']]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: name === 'phone', isMobile: name === 'phone' });
    context.setDefaultTimeout(180_000); const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5229'}/wayside-fury?gfx=${gfx}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForFunction(() => window.__waysideFury);
    await page.getByRole('button', { name: /Begin adventure|Continue adventure/ }).first().click();
    await page.evaluate(async () => {
      const sim = await import('/src/pages/WaysideFury/game/sim.ts');
      window.__waysideFury.mutate(s => { sim.enterScene(s, 'hub'); s.x = 344; s.y = 248; sim.interact(s); });
    });
    await page.getByRole('button', { name: 'Quest request' }).click();
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.getByRole('button', { name: 'Accept quest' }).click();
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.evaluate(async () => { const sim = await import('/src/pages/WaysideFury/game/sim.ts'); window.__waysideFury.mutate(s => { s.x = 448; s.y = 248; sim.interact(s); }); });
    await page.getByLabel('Quest log', { exact: true }).waitFor();
    assert.equal(await page.locator('.wf-quest-card').count(), 7);
    await page.screenshot({ path: `${shots}/${name}-quests.png` });
    await page.getByRole('button', { name: 'Back to pause' }).click();
    await page.evaluate(async () => { const sim = await import('/src/pages/WaysideFury/game/sim.ts'); window.__waysideFury.mutate(s => { s.x = 624; s.y = 240; sim.interact(s); }); });
    await page.getByRole('button', { name: 'Start solo tournament' }).click();
    await page.waitForFunction(() => window.__waysideFury.state.enemies.length === 5);
    const native = await page.locator('canvas[aria-label="Wayside Fury action RPG"]').evaluate(canvas => Math.abs(canvas.width - canvas.clientWidth * devicePixelRatio) <= 2 && Math.abs(canvas.height - canvas.clientHeight * devicePixelRatio) <= 2);
    assert.equal(native, true, 'native DPR backing resolution');
    const state = await page.evaluate(() => ({ scene: window.__waysideFury.state.scene, gfx: document.querySelector('.wf-canvas')?.dataset.gfx, count: window.__waysideFury.state.enemies.length }));
    assert.equal(state.scene, 'arena'); assert.equal(state.count, 5); assert.equal(state.gfx, '2d', 'arena uses shared 2D rendering for both graphics choices');
    await page.screenshot({ path: `${shots}/${name}-arena.png` });
    await page.getByRole('button', { name: 'Retire', exact: true }).click();
    await page.getByLabel('Tournament Arena', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__waysideFury.state.hubArena.runs), 1);
    await context.close();
  }
  assert.deepEqual(errors, []); console.log(`U1 hub browser: phone DPR3 and desktop DPR2, quests, board, arena and 3D fallback pass. Screenshots: ${shots}`);
} finally { await browser.close(); }
