import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const phase = process.argv[2] ?? 'after';
assert.ok(['before', 'after'].includes(phase));
const output = 'docs/wayside-fury-design/puddle-3d';
const moduleName = process.env.FURY_PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
await mkdir(output, { recursive: true });
const report = [];
try {
  for (const size of [{ width: 390, height: 844, dpr: 3 }, { width: 1440, height: 900, dpr: 2 }]) {
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: size.dpr, hasTouch: size.width === 390, isMobile: size.width === 390, reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.setItem('wayside-fury-controls-dismissed', '1'));
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /THREE.WebGLProgram|VALIDATE_STATUS|shader error/i.test(message.text())) errors.push(message.text()); });
    await page.goto(`${process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5217'}/wayside-fury?gfx=3d`);
    await page.waitForFunction(() => window.__waysideFury && !document.querySelector('.wf-primary').disabled);
    await page.locator('.wf-primary').click();
    await page.evaluate(async () => {
      const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
      const game = window.__waysideFury;
      game.mutate(s => { enterScene(s, 'overworld'); s.x = 779; s.y = 510; s.notice = ''; });
      game.setPaused(true);
      game.renderer.reset();
    });
    await page.waitForFunction(() => {
      const flat = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
      if (flat.dataset.gfxStatus === 'fallback') throw new Error(flat.dataset.gfxError);
      return flat.dataset.gfx === '3d' && Number(document.querySelector('.wf-canvas-3d')?.dataset.triangles) > 0;
    });
    await page.waitForTimeout(600);
    const metrics = await page.evaluate(phase => {
      const game = window.__waysideFury, depth = game.renderer.depth;
      game.setPaused(true);
      depth.visualTime = 0;
      depth.reset();
      const before = JSON.stringify(game.state);
      for (let i = 0; i < 12; i++) game.renderer.draw(game.state, 0, 0);
      const canvas = document.querySelector('.wf-canvas-3d');
      const decals = ['puddle-water', 'puddle-rim'].map(name => {
        const mesh = depth.scene.getObjectByName(name);
        if (!mesh) return null;
        const positions = mesh.geometry.attributes.position;
        const offset = name === 'puddle-water' ? .12 : .06;
        let maxHeightError = 0;
        for (let i = 0; i < positions.count; i++) maxHeightError = Math.max(maxHeightError, Math.abs(positions.getY(i) - depth.terrain.heightAt(positions.getX(i), positions.getZ(i)) - offset));
        return { name, maxHeightError, vertices: positions.count, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, depthWrite: mesh.material.depthWrite, transparent: mesh.material.transparent, polygonOffset: mesh.material.polygonOffset, renderOrder: mesh.renderOrder };
      });
      return { phase, sameState: before === JSON.stringify(game.state), width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, dpr: devicePixelRatio, calls: depth.renderer.info.render.calls, triangles: depth.renderer.info.render.triangles, decals };
    }, phase);
    assert.ok(metrics.sameState);
    assert.ok(Math.abs(metrics.width - metrics.cssWidth * size.dpr) <= 2);
    assert.ok(Math.abs(metrics.height - metrics.cssHeight * size.dpr) <= 2);
    if (phase === 'after') for (const decal of metrics.decals) {
      assert.ok(decal && decal.maxHeightError < .00001, 'every decal vertex follows terrain');
      assert.equal(decal.castShadow, false);
      assert.equal(decal.receiveShadow, true);
      assert.equal(decal.depthWrite, false);
      assert.equal(decal.transparent, true);
      assert.equal(decal.polygonOffset, true);
    }
    await page.screenshot({ path: `${output}/${phase}-${size.width}x${size.height}.png` });
    assert.deepEqual(errors, []);
    report.push({ size, ...metrics });
    await context.close();
  }
} finally {
  await writeFile(`${output}/${phase}-metrics.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(`Puddle ${phase} captures and native-DPR assertions passed.`);
