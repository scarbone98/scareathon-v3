// One externally managed dev server; this script never starts another server.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(modulePath.startsWith('/') ? pathToFileURL(modulePath).href : modulePath);
const output = process.env.FURY_CAPTURE_OUTPUT ?? 'docs/wayside-fury-design/round3b-after';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: 'chrome' }), args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const results = [];
try {
  for (const size of [{ width: 390, height: 844, dpr: 3 }, { width: 1440, height: 900, dpr: 2 }]) {
    if (process.env.FURY_CAPTURE_SIZE && Number(process.env.FURY_CAPTURE_SIZE) !== size.width) continue;
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: size.dpr, hasTouch: size.width === 390, isMobile: size.width === 390 });
    await context.addInitScript(() => localStorage.setItem('wayside-fury-controls-dismissed', '1'));
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(180000);
    page.on('pageerror', error => errors.push(error.message));
    console.log(`Loading ${size.width}x${size.height} 2D`);
    await page.goto(`${process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5186'}/wayside-fury?gfx=2d`, { waitUntil: 'domcontentloaded' });
    await page.locator('.wf-primary').click();
    await page.getByRole('button', { name: 'Skip prologue' }).click();
    await page.waitForFunction(() => window.__waysideFury.state.scene === 'overworld');
    const place = async (x, y, { scene = 'overworld', room = 0, wrecked = true, faceX = 1, faceY = 0 } = {}) => {
      await page.evaluate(async args => {
        const g = window.__waysideFury, { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
        g.setPaused(true);
        g.mutate(s => {
          enterScene(s, args.scene, args.room); s.x = args.x; s.y = args.y; s.moving = false; s.faceX = args.faceX; s.faceY = args.faceY;
          s.ambientTaxiWrecked = args.wrecked; s.ambientTaxiGag = args.wrecked ? 3.5 : -1; s.notice = ''; s.dialogue = null;
        });
        const r = g.renderer.flat; r.sceneKey = ''; r.qualityCap = 3; r.resize();
        await new Promise(requestAnimationFrame); r.transition = 0; await new Promise(requestAnimationFrame);
      }, { x, y, scene, room, wrecked, faceX, faceY });
    };
    const shot = async name => {
      const state = await page.evaluate(() => {
        const g = window.__waysideFury, c = document.querySelector('.wf-stage canvas');
        return { scene: g.state.scene, x: g.state.x, y: g.state.y, wrecked: g.state.ambientTaxiWrecked,
          canvas: { width: c.width, height: c.height, cssWidth: c.clientWidth, cssHeight: c.clientHeight, ...c.dataset },
          controls: [...document.querySelectorAll('.wf-hud,.wf-touch-btn,.wf-stick,.wf-pause')].filter(e => e.getClientRects().length).map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }) };
      });
      assert.equal(Number(state.canvas.renderDpr), size.dpr, 'native DPR inspection');
      assert.ok(Math.abs(state.canvas.width - state.canvas.cssWidth * size.dpr) <= 2);
      assert.ok(Math.abs(state.canvas.height - state.canvas.cssHeight * size.dpr) <= 2);
      for (const c of state.controls) assert.ok(c.x >= 0 && c.y >= 0 && c.right <= size.width + 1 && c.bottom <= size.height + 1, 'controls remain inside viewport');
      await page.screenshot({ path: `${output}/${size.width}x${size.height}-2d-${name}.png` });
      results.push({ size, name, fixture: 'paused native-resolution inspection', ...state });
      console.log(`${size.width}x${size.height}: ${name}`);
    };
    for (const [name, x, y, options] of [
      ['north-south', 656, 340, { faceX: 0, faceY: -1 }],
      ['east-west', 540, 480], ['intersection', 656, 480],
      ['east-end', 1210, 480], ['west-end', 70, 480],
      ['taxi-family', 438, 494], ['ambient-intact', 438, 494, { wrecked: false }],
      ['forest-entrance', 656, 248, { faceX: 0, faceY: -1 }],
      ['blast-entrance', 1088, 430], ['city-entrance', 1040, 522, { faceX: 0, faceY: 1 }],
      ['town-east-end', 890, 320, { scene: 'hub' }], ['town-west-end', 70, 320, { scene: 'hub' }],
      ['town-parking', 490, 430, { scene: 'hub' }],
      ['orchard-closed-end', 328, 80, { scene: 'dungeon', room: 8 }],
      ['depot-parking', 360, 128, { scene: 'dungeon', room: 9 }],
      ['courtyard-parking', 400, 176, { scene: 'dungeon', room: 5 }],
      ['depot-closed-end', 328, 320, { scene: 'dungeon', room: 9 }],
    ]) {
      if (process.env.FURY_CAPTURE_SCENE && process.env.FURY_CAPTURE_SCENE !== name) continue;
      await place(x, y, options); await shot(name);
    }

    await place(500, 495);
    const live = await page.evaluate(async () => {
      const g = window.__waysideFury, dressing = await import('/src/pages/WaysideFury/game/dressing.ts');
      if ('trafficForState' in dressing) throw Error('Moving traffic generator still exists');
      const start = { time: g.state.time, x: g.state.x, y: g.state.y }, samples = [];
      g.setPaused(false); g.setTouch({ x: 1, y: 0 });
      while (g.state.time - start.time < 1) {
        await new Promise(requestAnimationFrame); samples.push({ x: g.state.x, y: g.state.y, time: g.state.time });
      }
      g.setTouch({ x: 0, y: 0 });
      while (g.state.time - start.time < 2) await new Promise(requestAnimationFrame);
      g.setPaused(true);
      return { start, end: { x: g.state.x, y: g.state.y, time: g.state.time }, samples };
    });
    assert.ok(live.end.x > live.start.x + 30, 'player taxi still drives');
    assert.ok(Math.abs(live.end.y - live.start.y) < 1, 'straight input stays in its lane');
    results.push({ size, name: 'muted-live-drive', ...live });
    // Let the real one-shot boulder event run; it must still complete after
    // moving traffic is removed. Keep this separate from the paused art fixture.
    await place(328, 480, { wrecked: false });
    await page.evaluate(() => window.__waysideFury.setPaused(false));
    await page.waitForFunction(() => window.__waysideFury.state.ambientTaxiWrecked);
    await page.evaluate(() => window.__waysideFury.setPaused(true));
    results.push({ size, name: 'live-boulder-impact', wrecked: true });
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    results.push({ size, errors });
    await context.close();
  }
} finally { await writeFile(`${output}/metrics.json`, JSON.stringify(results, null, 2) + '\n'); await browser.close(); }
