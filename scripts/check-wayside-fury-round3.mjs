// One externally managed Vite server. Always mute Chromium's audio output.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(modulePath.startsWith('/') ? pathToFileURL(modulePath).href : modulePath);
const output = process.env.FURY_CAPTURE_OUTPUT ?? '/tmp/fury-round3';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: 'chrome' }), args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const results = [];
try {
  for (const gfx of (process.env.FURY_CAPTURE_GFX?.split(',') ?? ['2d', '3d'])) for (const size of [{ width: 390, height: 844, dpr: 3 }, { width: 1440, height: 900, dpr: 2 }]) {
    if (process.env.FURY_CAPTURE_SIZE && Number(process.env.FURY_CAPTURE_SIZE) !== size.width) continue;
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: size.dpr, hasTouch: size.width === 390, isMobile: size.width === 390 });
    await context.addInitScript(() => localStorage.setItem('wayside-fury-controls-dismissed', '1'));
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(120000);
    console.log(`Loading ${size.width}x${size.height} ${gfx}`);
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.goto(`${process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5186'}/wayside-fury?gfx=${gfx}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('.wf-primary').click();
    await page.getByRole('button', { name: 'Skip prologue' }).click();
    await page.waitForFunction(gfx => window.__waysideFury?.state.scene === 'overworld' && (gfx === '2d' || document.querySelector('.wf-stage canvas')?.dataset.gfx === '3d'), gfx);
    if (size.width === 390) await page.evaluate(() => window.__waysideFury.setTouch({}));
    else await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    const roads = await page.evaluate(async () => {
      const { roadMarks } = await import('/src/pages/WaysideFury/game/roadMarkings.ts');
      const { OVERWORLD, TILE } = await import('/src/pages/WaysideFury/game/world.ts');
      const marks = [];
      for (let row = 0; row < OVERWORLD.rows; row++) for (let col = 0; col < OVERWORLD.cols; col++) {
        if (OVERWORLD.tiles[row * OVERWORLD.cols + col] !== 'road') continue;
        for (const mark of roadMarks(OVERWORLD, col, row)) {
          if (mark.x < col * TILE || mark.y < row * TILE || mark.x + mark.w > (col + 1) * TILE || mark.y + mark.h > (row + 1) * TILE) throw Error('Mark crosses its tile');
          if (mark.color === '#c7b68c') marks.push(mark);
        }
      }
      const straight = marks.filter(m => m.x > 300 && m.x < 600 && m.y > 448 && m.y < 512);
      if (!straight.length || straight.some(m => m.y < 479.5 || m.y + m.h > 480.5)) throw Error('Multiple horizontal centerlines');
      if (marks.some(m => m.x >= 624 && m.x < 688 && m.y >= 448 && m.y < 512)) throw Error('Paint inside junction');
      const dashes = new Map();
      for (const m of marks) {
        const horizontal = m.w > m.h;
        // Centerlines can straddle two rows/columns; merge their half-widths.
        const centerKey = horizontal ? `h:${Math.floor(m.x / 32)}:${Math.round((m.y + m.h / 2) / 16)}` : `v:${Math.round((m.x + m.w / 2) / 16)}:${Math.floor(m.y / 32)}`;
        dashes.set(centerKey, (dashes.get(centerKey) ?? 0) + m.w * m.h);
      }
      if ([...dashes.values()].some(area => Math.abs(area - 12) > .001)) throw Error('Partial dash at a tile, chunk or junction boundary');
      return { laneFragments: marks.length, straightFragments: straight.length, completeDashes: dashes.size };
    });
    const capture = async name => {
      // Wait for rendered frames, not a wall-clock delay on a busy host. A
      // paused inspection must finish its cosmetic scene fade before capture.
      await page.evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const g = window.__waysideFury;
        if (g.paused) g.renderer.flat.transition = 0;
        await new Promise(requestAnimationFrame);
      });
      const layout = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('.wf-touch-btn,.wf-pause,.wf-hud')].filter(e => e.getClientRects().length).map(e => ({ label: e.getAttribute('aria-label'), ...JSON.parse(JSON.stringify(e.getBoundingClientRect())) }));
        const c = document.querySelector(document.querySelector('.wf-stage canvas')?.dataset.gfx === '3d' ? '.wf-canvas-3d' : '.wf-stage canvas');
        return { boxes, canvas: { width: c.width, height: c.height, cssWidth: c.clientWidth, cssHeight: c.clientHeight, ...c.dataset }, scrollWidth: document.querySelector('.wf-shell').scrollWidth };
      });
      assert.ok(layout.scrollWidth <= size.width);
      for (const b of layout.boxes) assert.ok(b.x >= 0 && b.y >= 0 && b.right <= size.width + 1 && b.bottom <= size.height + 1, `${b.label} stays inside viewport`);
      for (const b of layout.boxes.filter(b => b.label && /Attack|Guard|Dash|Ki blast|Swap hero/.test(b.label))) assert.ok(b.width >= 56 && b.height >= 56);
      const hud = layout.boxes.find(b => b.label === 'Hero status');
      for (const b of layout.boxes.filter(b => /Attack|Guard|Dash|Ki blast/.test(b.label ?? ''))) assert.ok(b.y >= hud.bottom, 'Controls clear HUD');
      await page.screenshot({ path: `${output}/${size.width}x${size.height}-${gfx}-${name}.png` });
      results.push({ gfx, size, name, ...layout });
      console.log(`${size.width}x${size.height} ${gfx} ${name}`);
    };
    await capture('overworld');
    await page.evaluate(() => { const g = window.__waysideFury; g.setPaused(true); g.state.notice = ''; });
    for (const [name, x, y] of [['forest', 656, 196], ['city', 1032, 580], ['blast', 1088, 395]]) {
      await page.evaluate(({ x, y, gfx }) => {
        const g = window.__waysideFury; g.state.x = x; g.state.y = y;
        if (gfx === '3d') { g.renderer.depth.cameraReady = false; g.renderer.depth.tier = 0; g.renderer.depth.configureQuality(); g.renderer.depth.resize(); }
        else { g.renderer.flat.sceneKey = ''; g.renderer.flat.qualityCap = 3; g.renderer.flat.resize(); }
      }, { x, y, gfx });
      await capture(name);
    }
    if (gfx === '3d') {
      const actors = await page.evaluate(() => {
        const r = window.__waysideFury.renderer.depth;
        return { near: r.camera.near, far: r.camera.far, actors: [...r.billboards.values()].map(a => ({ y: a.group.position.y, ground: r.terrain.heightAt(a.x, a.y), sprites: a.sprites.map(s => ({ type: s.type, depthTest: s.material.depthTest, depthWrite: s.material.depthWrite, pitch: s.rotation.x })) })) };
      });
      assert.ok(actors.actors.length >= 3, 'Station greeter sheets loaded');
      assert.ok(actors.near <= 1 && actors.far > 1500);
      for (const actor of actors.actors) { assert.ok(actor.y > actor.ground); for (const s of actor.sprites) assert.ok(s.type === 'Mesh' && s.depthTest && s.depthWrite && s.pitch === 0); }
      results.push({ gfx, size, actors });
    }
    await page.evaluate(async () => { const g = window.__waysideFury; const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts'); g.mutate(s => { enterScene(s, 'dungeon'); s.notice = ''; }); });
    await capture('battle');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Collection', exact: true }).waitFor();
    assert.match(await page.locator('.wf-pause-summary').innerText(), /candy/);
    await capture('pause');
    assert.deepEqual(errors, []);
    results.push({ gfx, size, roads, errors });
    await context.close();
  }
} finally { await writeFile(`${output}/metrics.json`, JSON.stringify(results, null, 2)); await browser.close(); }
