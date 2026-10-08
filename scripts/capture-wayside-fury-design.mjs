// Supports before|after and round2-before|round2-after (four-screen matrix).
// FURY_BASE_URL=http://127.0.0.1:5186 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/capture-wayside-fury-design.mjs before|after
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const phase = process.argv[2] ?? 'after';
assert.ok(['before', 'after', 'round2-before', 'round2-after'].includes(phase));
const round2 = phase.startsWith('round2-');
const after = phase.endsWith('after');
const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(modulePath.startsWith('/') ? pathToFileURL(modulePath).href : modulePath);
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', ...(process.env.FURY_WEBGL_BACKEND === 'metal' ? ['--use-angle=metal', '--enable-gpu'] : [])], ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const output = process.env.FURY_CAPTURE_OUTPUT ? `${process.env.FURY_CAPTURE_OUTPUT.replace(/\/$/, '')}/` : new URL(`../docs/wayside-fury-design/${phase}/`, import.meta.url).pathname;
await mkdir(output, { recursive: true });
const report = [];
try {
  for (const gfx of (process.env.FURY_CAPTURE_GFX?.split(',') ?? ['2d', '3d'])) for (const size of (round2 ? [
    { name: '390x844', width: 390, height: 844, dpr: 3, touch: true },
    { name: '430x932', width: 430, height: 932, dpr: 3, touch: true },
    { name: '844x390', width: 844, height: 390, dpr: 3, touch: true },
    { name: '1440x900', width: 1440, height: 900, dpr: 2, touch: false },
  ] : [
    { name: 'iphone-portrait', width: 393, height: 852, dpr: 3, touch: true },
    { name: 'iphone-landscape', width: 852, height: 393, dpr: 3, touch: true },
    { name: 'desktop', width: 1440, height: 900, dpr: 2, touch: false },
  ])) {
    if (process.env.FURY_CAPTURE_SIZE && !process.env.FURY_CAPTURE_SIZE.split(',').includes(size.name)) continue;
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: size.dpr, hasTouch: size.touch, isMobile: size.touch });
    await context.addInitScript(() => localStorage.setItem('wayside-fury-controls-dismissed', '1'));
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
    console.log(`Loading ${size.name} ${gfx}`);
    await page.goto(`${process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5186'}/wayside-fury${gfx === '3d' ? '?gfx=3d' : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.__waysideFury && document.querySelector('.wf-primary')?.disabled === false, null, { timeout: 120000 });
    const shot = async name => {
      await page.waitForTimeout(350);
      const labelBoxes = await page.evaluate(() => [...document.querySelectorAll('.wf-scene-label:not(.wf-label-floater)')].map(label => ({
        text: label.textContent, width: label.offsetWidth, height: label.offsetHeight,
        reservedWidth: parseFloat(label.style.width), reservedHeight: parseFloat(label.style.height),
      })));
      if (phase !== 'before') for (const box of labelBoxes) {
        assert.ok(Math.abs(box.width - box.reservedWidth) <= 1 && Math.abs(box.height - box.reservedHeight) <= 1, `Label box matches collision layout: ${JSON.stringify(box)}`);
      }
      if (round2 && after) {
        const overlaps = await page.evaluate(() => {
          const save = document.querySelector('.wf-play-band > .wf-save-status');
          if (!save) return [];
          const a = save.getBoundingClientRect();
          return [...document.querySelectorAll('.wf-play-band > :not(.wf-save-status)')].filter(el => {
            const b = el.getBoundingClientRect();
            return b.width && b.height && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          }).map(el => el.className);
        });
        assert.deepEqual(overlaps, [], 'Save feedback never covers gameplay messages');
      }
      if (round2 && after && ['overworld', 'hub-hud', 'battle'].includes(name)) {
        const layout = await page.evaluate(() => ({
          canvases: [...document.querySelectorAll('.wf-stage canvas')].filter(c => getComputedStyle(c).visibility !== 'hidden').map(c => ({ width: c.width, height: c.height, cssWidth: c.clientWidth, cssHeight: c.clientHeight, dpr: Number(c.dataset.renderDpr) })),
          controls: [...document.querySelectorAll('.wf-hud,.wf-touch-btn,.wf-stick')].filter(el => el.getBoundingClientRect().width).map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }),
        }));
        for (const c of layout.canvases) assert.ok(Math.abs(c.width - c.cssWidth * c.dpr) <= 2 && Math.abs(c.height - c.cssHeight * c.dpr) <= 2, 'Canvas backing follows the active DPR');
        for (const b of layout.controls) assert.ok(b.x >= -1 && b.y >= -1 && b.x + b.width <= size.width + 1 && b.y + b.height <= size.height + 1, 'HUD and touch controls fit the viewport');
      }
      await page.screenshot({ path: `${output}${size.name}-${gfx}-${name}.png`, timeout: 120000 });
      report.push({ size, gfx, scene: name, ...(await page.evaluate(() => ({ canvases: [...document.querySelectorAll('.wf-stage canvas')].map(c => ({ width: c.width, height: c.height, cssWidth: c.clientWidth, cssHeight: c.clientHeight, ...c.dataset })) }))), errors: [...errors] });
      console.log(`${phase}: ${size.name} ${gfx} ${name}`);
      if (after && gfx === '2d' && ['overworld', 'hub-hud', 'battle'].includes(name)) {
        // A separate inspection fixture shows native detail under host contention.
        // Live captures above retain the real adaptive resolution behavior.
        const paused = await page.evaluate(() => {
          const game = window.__waysideFury, paused = game.paused;
          game.setPaused(true);
          game.renderer.flat.qualityCap = 3; game.renderer.flat.resize();
          return paused;
        });
        try {
          await page.waitForTimeout(150);
          await page.screenshot({ path: `${output}${size.name}-${gfx}-${name}-native.png`, timeout: 120000 });
          const data = await page.locator('canvas').first().evaluate(c => ({ ...c.dataset }));
          assert.equal(Number(data.renderDpr), size.dpr);
          report.push({ size, gfx, scene: `${name}-native`, fixture: 'paused native-detail inspection', canvas: data });
        } finally { await page.evaluate(paused => window.__waysideFury.setPaused(paused), paused); }
      }
    };
    await shot('title');
    await page.locator('.wf-primary').click();
    await page.getByRole('button', { name: 'Skip prologue' }).click();
    await page.waitForFunction(() => window.__waysideFury.state.scene === 'overworld');
    if (gfx === '3d') {
      try { await page.waitForFunction(() => document.querySelector('canvas')?.dataset.gfx === '3d', null, { timeout: 180000 }); }
      catch (error) { console.error(await page.locator('canvas').first().evaluate(c => ({ ...c.dataset, scene: window.__waysideFury.state.scene, mode: window.__waysideFury.renderer.graphicsMode, url: location.href }))); throw error; }
    }
    if (round2 && after) {
      const quality = await page.evaluate(gfx => {
        const game = window.__waysideFury, paused = game.paused;
        game.setPaused(true);
        const before = JSON.stringify(game.state);
        const renderer = gfx === '3d' ? game.renderer.depth : game.renderer.flat;
        for (let i = 0; i < 410; i++) renderer.checkQuality(.025);
        const canvas = gfx === '3d' ? document.querySelector('.wf-canvas-3d') : document.querySelector('.wf-stage canvas');
        const low = Number(canvas.dataset.renderDpr);
        for (let tier = 0; tier < 4; tier++) for (let i = 0; i < 601; i++) renderer.checkQuality(1 / 60);
        const result = { low, restored: Number(canvas.dataset.renderDpr), sameState: before === JSON.stringify(game.state) };
        game.setPaused(paused);
        return result;
      }, gfx);
      assert.equal(quality.low, 1, 'sustained slow frames retain the minimum fallback');
      assert.equal(quality.restored, size.dpr, 'healthy frame budgets recover native DPR');
      assert.equal(quality.sameState, true, 'quality adaptation never changes simulation');
      report.push({ size, gfx, check: 'quality-recovery', ...quality });
    }
    await page.waitForTimeout(750);
    await shot('overworld');
    await page.evaluate(async () => {
      const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
      window.__waysideFury.mutate(s => { enterScene(s, 'hub'); s.notice = ''; });
    });
    await shot('hub-hud');
    await page.evaluate(async () => {
      const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
      window.__waysideFury.mutate(s => { enterScene(s, 'dungeon'); s.x = 230; s.y = 120; s.heroes[s.active].invulnerable = 30; s.notice = ''; s.enemies.slice(0, 3).forEach((e, i) => { e.x = 252 + i * 15; e.y = 106 + i * 17; e.speed = 0; e.cooldown = 30; }); });
    });
    if (size.touch) await page.evaluate(() => window.__waysideFury.setTouch({ ki: true }));
    else await page.keyboard.down('k');
    await page.waitForTimeout(800);
    await shot('battle');
    if (size.touch) await page.evaluate(() => window.__waysideFury.setTouch({}));
    else await page.keyboard.up('k');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await shot('pause');
    await page.getByRole('button', { name: 'Collection', exact: true }).click();
    await shot('collection');
    if (round2 && after) {
      await page.locator('.wf-collection').evaluate(panel => { panel.scrollTop = panel.scrollHeight / 2; });
      await page.waitForTimeout(200);
      const back = await page.getByRole('button', { name: 'Back', exact: true }).boundingBox();
      assert.ok(back && back.y >= 0 && back.y + back.height <= size.height && back.height >= 44, 'Collection Back stays reachable while browsing');
      await shot('collection-scrolled');
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    }
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    await context.close();
  }
} finally {
  await writeFile(`${output}metrics${process.env.FURY_CAPTURE_GFX ? '-' + process.env.FURY_CAPTURE_GFX : ''}${process.env.FURY_CAPTURE_SIZE ? '-' + process.env.FURY_CAPTURE_SIZE : ''}.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
