// Run against Vite with FURY_BASE_URL and optional FURY_PLAYWRIGHT_MODULE (absolute path).
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.FURY_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [width, height, dpr, gfx] of [[390, 844, 3, ''], [1440, 900, 1, ''], [390, 844, 3, '?gfx=3d']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
    await context.addInitScript(() => localStorage.setItem('wayside-fury-controls-dismissed', '1'));
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(`${process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5224'}/wayside-fury${gfx}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.wf-primary').click();
    await page.evaluate(async () => {
      const { skipPrologue } = await import('/src/pages/WaysideFury/game/sim.ts');
      const { itemsState } = await import('/src/pages/WaysideFury/game/u1/items/chips.ts');
      window.__waysideFury.mutate(s => {
        skipPrologue(s); s.scene = 'overworld'; s.mapId = 'overworld'; s.enemies = []; s.film = null; s.dialogue = null;
        itemsState(s).radar.owned = true; itemsState(s).radar.enabled = true;
        s.notice = 'Chapter 1: drive east to the Blast Site. Pull over at a marker.';
      });
    });
    await page.locator('.wf-items-hud').waitFor();
    await page.locator('.wf-notice').waitFor();
    await page.locator('.wf-minimap').waitFor();
    if (gfx) await page.waitForFunction(() => document.querySelector('.wf-stage canvas[data-gfx="3d"]'));
    if (gfx) await page.evaluate(() => window.__waysideFury.mutate(s => { s.notice += ' '; }));
    assert.equal(await page.locator('.wf-notice').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(16, 35, 52)', 'objective backdrop is opaque');
    for (const long of [false, true]) {
      if (long) await page.evaluate(() => window.__waysideFury.mutate(s => { s.notice = 'Long objective text withaverylongunbrokenwordthatmustwrapcleanly '.repeat(12); }));
      await page.waitForTimeout(150);
      const rects = await page.evaluate(() => ['.wf-hud', '.wf-notice', '.wf-items-hud', '.wf-minimap'].map(selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { selector, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }));
      for (let i = 0; i < rects.length; i++) {
        const a = rects[i];
        assert.ok(a.left >= 0 && a.right <= width && a.top >= 0 && a.bottom <= height, `${a.selector} stays in viewport`);
        for (const b of rects.slice(i + 1)) assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `${width} ${gfx}: ${a.selector} overlaps ${b.selector}`);
      }
      assert.ok(rects[2].top >= rects[1].bottom, 'compass follows objective');
      assert.ok(rects[3].left > width / 2, 'minimap stays on the right');
    }
    console.log(`HUD rects pass: ${width}x${height} DPR${dpr} ${gfx || '2D'}, chapter and long objectives`);
    await context.close();
  }
} finally { await browser.close(); }
