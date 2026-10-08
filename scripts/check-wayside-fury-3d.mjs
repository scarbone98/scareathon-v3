// Run against the Vite development server (the game exposes its inspection API in DEV).
// FURY_BASE_URL=http://127.0.0.1:5185 \
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check-wayside-fury-3d.mjs
// Captures and measurements are written to /tmp/fury-3d-shots by default.
// Optional launch controls: PLAYWRIGHT_CHANNEL=chromium|chrome,
// PLAYWRIGHT_EXECUTABLE_PATH=/path/to/browser, PLAYWRIGHT_HEADLESS=false,
// FURY_WEBGL_BACKEND=default|metal|swiftshader|opengl, and PLAYWRIGHT_ARGS='["--flag"]'.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5185';
const output = process.env.FURY_3D_SHOTS ?? '/tmp/fury-3d-shots';
const browserName = process.env.PLAYWRIGHT_BROWSER ?? 'chromium';
const moduleName = process.env.PLAYWRIGHT_MODULE;
const samples = Number(process.env.FURY_FRAME_SAMPLES ?? 180);
const startupTimeout = Number(process.env.FURY_READY_TIMEOUT ?? 180000);
assert.ok(Number.isInteger(samples) && samples >= 30, 'FURY_FRAME_SAMPLES must be at least 30');
assert.ok(Number.isFinite(startupTimeout) && startupTimeout > 0, 'FURY_READY_TIMEOUT must be positive');
let playwright;
try {
  playwright = await import(moduleName?.startsWith('/') ? pathToFileURL(moduleName).href : moduleName ?? 'playwright');
} catch {
  throw new Error('Install Playwright and its browser, or set PLAYWRIGHT_MODULE to an existing Playwright index.mjs.');
}
assert.ok(playwright[browserName], `Unknown Playwright browser: ${browserName}`);
const headless = process.env.PLAYWRIGHT_HEADLESS ?? 'true';
assert.ok(['true', 'false', '1', '0'].includes(headless), 'PLAYWRIGHT_HEADLESS must be true/false or 1/0');
const backend = process.env.FURY_WEBGL_BACKEND ?? 'default';
const backendArgs = { default: [], metal: ['--use-angle=metal', '--enable-gpu'], swiftshader: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], opengl: ['--use-angle=gl', '--enable-gpu'] };
assert.ok(Object.hasOwn(backendArgs, backend), `Unknown FURY_WEBGL_BACKEND: ${backend}`);
if (backend !== 'default') assert.equal(browserName, 'chromium', 'FURY_WEBGL_BACKEND applies to Chromium browsers');
const extraArgs = JSON.parse(process.env.PLAYWRIGHT_ARGS ?? '[]');
assert.ok(Array.isArray(extraArgs) && extraArgs.every(value => typeof value === 'string'), 'PLAYWRIGHT_ARGS must be a JSON array of browser flags');
const launchOptions = { headless: headless === 'true' || headless === '1',
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
  ...([...backendArgs[backend], ...extraArgs].length ? { args: [...backendArgs[backend], ...extraArgs] } : {}) };
const browser = await playwright[browserName].launch(launchOptions);
const errors = [];
const measurements = [];
const checks = [];
const phones = [{ width: 390, height: 844, dpr: 3 }, { width: 430, height: 932, dpr: 3 }, { width: 844, height: 390, dpr: 3 }, { width: 932, height: 430, dpr: 3 }];
const desktop = { width: 1440, height: 900, dpr: 2 };
const threeResource = url => /(?:\/render3d\.ts|\/terrain3d\.ts|\/three\/|\/deps\/three(?:_[^/]*)?\.js)(?:[/?]|$)/.test(url);
const sizeName = size => `${size.width}x${size.height}`;
const inside = (box, width, height) => box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1;

async function contextFor(size, init) {
  const phone = size.width < 1000;
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr, hasTouch: true, isMobile: phone,
    ...(phone ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' } : {}) });
  context.setDefaultTimeout(startupTimeout);
  context.setDefaultNavigationTimeout(startupTimeout);
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}

async function navigate(page, path) {
  // Vite's cold module transforms can finish after the document commits. Wait
  // for the actual game API, and expose an initialization exception immediately.
  let rejectStartup;
  const failed = new Promise((_, reject) => { rejectStartup = reject; });
  const onError = error => rejectStartup(new Error(`Wayside Fury startup failed: ${error.message}`, { cause: error }));
  page.on('pageerror', onError);
  try {
    await Promise.race([failed, (async () => {
      await page.goto(new URL(path, baseUrl).href, { waitUntil: 'commit', timeout: startupTimeout });
      await page.waitForFunction(() => !!window.__waysideFury, null, { timeout: startupTimeout });
    })()]);
  } finally { page.off('pageerror', onError); }
}

async function boot(page, mode, frame = page.mainFrame(), expected = mode) {
  if (frame === page.mainFrame()) await navigate(page, `/wayside-fury${mode === '3d' ? '?gfx=3d' : ''}`);
  await frame.waitForFunction(() => !!window.__waysideFury, null, { timeout: startupTimeout });
  const begin = frame.getByRole('button', { name: /Begin adventure|Continue adventure/ });
  await begin.waitFor({ timeout: startupTimeout });
  await begin.click({ timeout: startupTimeout });
  if (await frame.getByRole('button', { name: 'Skip prologue' }).count()) await frame.getByRole('button', { name: 'Skip prologue' }).click();
  await enter(frame, 'overworld');
  await effective(frame, expected);
  await frame.locator('.wf-touch-dock').waitFor({ state: 'visible' });
}

async function enter(frame, scene) {
  await frame.evaluate(async scene => {
    const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
    const game = window.__waysideFury;
    game.setTouch({});
    game.mutate(state => { enterScene(state, scene); state.notice = ''; });
  }, scene);
}

async function effective(frame, mode) {
  await frame.waitForFunction(mode => {
    const canvas = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
    if (mode === '3d' && canvas?.dataset.gfxStatus === 'fallback') throw new Error(`The requested 3D renderer failed: ${canvas.dataset.gfxError || 'unknown graphics error'}. Refusing to capture a 2D fallback as 3D.`);
    return canvas?.dataset.gfx === mode;
  }, mode, { timeout: startupTimeout });
  if (mode === '3d') {
    await frame.waitForFunction(() => {
      const original = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
      if (original?.dataset.gfxStatus === 'fallback') throw new Error(`The 3D renderer failed before producing a frame: ${original.dataset.gfxError || 'unknown graphics error'}.`);
      const canvas = document.querySelector('.wf-canvas-3d');
      return canvas?.dataset.renderer === '3d' && Number(canvas.dataset.triangles) > 0 && canvas.width > 0 && canvas.height > 0;
    }, null, { timeout: startupTimeout });
  }
}

async function layout(frame, label) {
  // Let DOM entrance animations finish before checking the visible controls.
  await frame.waitForTimeout(240);
  // Resuming the real Pause panel restores the touch dock and changes the scene
  // height. Wait for the renderer's resize frame before taking geometry samples.
  await frame.waitForFunction(() => {
    const original = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
    const canvas = original?.dataset.gfx === '3d' ? document.querySelector('.wf-canvas-3d') : original;
    if (!canvas) return false;
    const box = canvas.getBoundingClientRect(), dpr = Number(canvas.dataset.renderDpr);
    return dpr > 0 && Math.abs(canvas.width - box.width * dpr) <= 2 && Math.abs(canvas.height - box.height * dpr) <= 2;
  }, null, { timeout: startupTimeout });
  const result = await frame.evaluate(() => {
    const rect = element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; };
    const visible = element => { const style = getComputedStyle(element); return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && element.getBoundingClientRect().width > 0; };
    const select = selector => [...document.querySelectorAll(selector)].filter(visible).map(element => ({ selector, ...rect(element), label: element.getAttribute('aria-label') ?? element.textContent }));
    const original = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
    const canvas = original.dataset.gfx === '3d' ? document.querySelector('.wf-canvas-3d') : original;
    return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, gfx: original.dataset.gfx,
      canvas: { ...rect(canvas), pixelWidth: canvas.width, pixelHeight: canvas.height, data: { ...canvas.dataset } },
      controls: ['.wf-touch-btn', '.wf-stick-zone', '.wf-pause', '.wf-interact-prompt'].flatMap(select),
      ui: ['.wf-hud', '.wf-touch-dock', '.wf-overlay'].flatMap(select),
      text: document.body.innerText, viewportMeta: document.querySelector('meta[name="viewport"]')?.content };
  });
  assert.ok(result.viewportMeta?.includes('viewport-fit=cover'), `${label}: edge-to-edge Safari viewport`);
  assert.ok(inside(result.canvas, result.width, result.height), `${label}: canvas inside viewport`);
  const dpr = Number(result.canvas.data.renderDpr);
  assert.ok(dpr > 0 && dpr <= Math.min(result.dpr, 3), `${label}: native DPR with quality cap`);
  assert.ok(Math.abs(result.canvas.pixelWidth - result.canvas.width * dpr) <= 2, `${label}: backing width follows CSS/DPR: ${JSON.stringify(result.canvas)}`);
  assert.ok(Math.abs(result.canvas.pixelHeight - result.canvas.height * dpr) <= 2, `${label}: backing height follows CSS/DPR: ${JSON.stringify(result.canvas)}`);
  assert.equal(result.controls.filter(box => box.selector === '.wf-touch-btn').length, 5, `${label}: all five touch actions`);
  for (const box of [...result.controls, ...result.ui]) assert.ok(inside(box, result.width, result.height), `${label}: clipped ${box.selector}: ${JSON.stringify(box)}`);
  for (const box of result.controls.filter(box => box.selector === '.wf-touch-btn')) assert.ok(box.width >= 56 && box.height >= 56, `${label}: thumb-sized ${box.label}`);
  assert.ok(!result.text.includes('[Interact]'), `${label}: no literal interaction placeholder`);
  return result;
}

async function immutablePresentation(frame, label) {
  // The app's save/settings callbacks restore its React pause state. A DEV-only
  // controller pause can therefore be undone by a pending settings save; use
  // the real pause control while observing presentation-only frames.
  await frame.getByRole('button', { name: 'Pause', exact: true }).click();
  await frame.getByRole('button', { name: 'Resume', exact: true }).waitFor({ state: 'visible' });
  let result;
  try {
    result = await frame.evaluate(async () => {
      const { OVERWORLD } = await import('/src/pages/WaysideFury/game/world.ts');
      const game = window.__waysideFury;
      const before = JSON.stringify(game.state), worldBefore = JSON.stringify(OVERWORLD), pausedBefore = game.paused;
      for (let index = 0; index < 12; index++) await new Promise(requestAnimationFrame);
      const after = JSON.stringify(game.state), previous = JSON.parse(before), current = JSON.parse(after);
      const changed = Object.keys({ ...previous, ...current }).filter(key => JSON.stringify(previous[key]) !== JSON.stringify(current[key]))
        .map(key => ({ key, before: previous[key], after: current[key] }));
      return { sameState: before === after, sameWorld: worldBefore === JSON.stringify(OVERWORLD), pausedBefore, pausedAfter: game.paused, changed };
    });
  } finally {
    // Remove the panel for layout/captures while retaining the frozen scene.
    // Keep both actions in one task so no simulation frame occurs between them.
    await frame.evaluate(() => {
      [...document.querySelectorAll('.wf-pause-panel button')].find(button => button.textContent === 'Resume')?.click();
      window.__waysideFury.setPaused(true);
    });
    await frame.getByRole('button', { name: 'Resume', exact: true }).waitFor({ state: 'hidden' });
  }
  assert.ok(result.pausedBefore && result.pausedAfter, `${label}: app pause remains active during presentation`);
  assert.ok(result.sameState, `${label}: presentation cannot mutate authoritative simulation: ${JSON.stringify(result.changed)}`);
  assert.ok(result.sameWorld, `${label}: presentation cannot change world/collision data`);
}

async function deterministicScene(frame) {
  await frame.evaluate(async () => {
    const { enterScene, newGame } = await import('/src/pages/WaysideFury/game/sim.ts');
    const next = newGame(100);
    enterScene(next, 'overworld'); next.time = 12; next.sceneTimer = 2; next.notice = '';
    window.__waysideFury.setTouch({});
    window.__waysideFury.mutate(state => { Object.assign(state, next); });
    window.__waysideFury.setPaused(true);
  });
  await frame.waitForTimeout(600);
}

const summarize = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
  const round = value => Math.round(value * 100) / 100;
  return { median: round(percentile(.5)), p95: round(percentile(.95)), max: round(sorted.at(-1) ?? 0), mean: round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)) };
};

async function measure(frame, label, captureQuality) {
  await frame.evaluate(() => window.__waysideFury.setPaused(false));
  await frame.waitForTimeout(500);
  const result = await frame.evaluate(async samples => {
    const cadence = [], cpu = [], reported = [];
    let previous = await new Promise(requestAnimationFrame);
    for (let index = 0; index < samples; index++) {
      const now = await new Promise(requestAnimationFrame);
      cadence.push(now - previous); previous = now;
      const original = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
      const canvas = original.dataset.gfx === '3d' ? document.querySelector('.wf-canvas-3d') : original;
      const renderMs = Number(canvas.dataset.renderMs), frameMs = Number(canvas.dataset.frameMs);
      if (Number.isFinite(renderMs) && canvas.dataset.renderMs) cpu.push(renderMs);
      if (Number.isFinite(frameMs) && canvas.dataset.frameMs) reported.push(frameMs);
    }
    const original = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
    const canvas = original.dataset.gfx === '3d' ? document.querySelector('.wf-canvas-3d') : original;
    let gpu = null;
    if (original.dataset.gfx === '3d') {
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      if (info) gpu = { vendor: gl.getParameter(info.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL) };
    }
    return { cadence, cpu, reported, data: { ...canvas.dataset }, gpu, userAgent: navigator.userAgent, gfx: original.dataset.gfx };
  }, samples);
  const record = { label, samples, captureQuality, cadenceMs: summarize(result.cadence), renderCpuMs: result.cpu.length ? summarize(result.cpu) : null,
    reportedFrameMs: result.reported.length ? summarize(result.reported) : null, quality: result.data, gpu: result.gpu, userAgent: result.userAgent, effectiveGraphics: result.gfx };
  measurements.push(record);
  console.log(`${label}: frame median ${record.cadenceMs.median} ms, p95 ${record.cadenceMs.p95} ms; render CPU ${record.renderCpuMs ? `${record.renderCpuMs.median} ms median / ${record.renderCpuMs.p95} ms p95` : 'not exposed'}; capture ${captureQuality.tier} at DPR ${captureQuality.renderDpr}; sampled tier ${record.quality.qualityTier ?? '2D'} at DPR ${record.quality.renderDpr}`);
  return record;
}

async function capture(size, mode, screenshot = true) {
  console.log(`Starting ${screenshot ? 'comparison capture' : 'responsive layout'}: ${mode}-${sizeName(size)}`);
  const { context, page } = await contextFor(size);
  const label = `${mode}-${sizeName(size)}`;
  const loaded = [];
  page.on('request', request => { if (threeResource(request.url())) loaded.push(request.url()); });
  try {
    await boot(page, mode);
    if (mode === '2d') assert.deepEqual(loaded, [], `${label}: default renderer does not download Three or its renderer`);
    else assert.ok(loaded.some(url => url.includes('render3d.ts')), `${label}: 3D is loaded on demand`);
    await deterministicScene(page.mainFrame());
    if (mode === '3d') {
      // Rebuild at maximum quality after startup, with simulation paused. This
      // keeps comparison pictures independent of any earlier adaptive slowdown.
      await page.evaluate(() => { window.__waysideFury.setGraphicsMode('2d'); window.__waysideFury.setGraphicsMode('3d'); });
      await effective(page.mainFrame(), '3d');
    }
    await immutablePresentation(page.mainFrame(), label);
    const bounds = await layout(page.mainFrame(), label);
    if (screenshot) {
      const captureQuality = { tier: bounds.canvas.data.qualityTier ?? '2d', renderDpr: Number(bounds.canvas.data.renderDpr),
        postFx: bounds.canvas.data.postFx ?? 'none', pixelWidth: bounds.canvas.pixelWidth, pixelHeight: bounds.canvas.pixelHeight };
      if (mode === '3d') {
        assert.equal(captureQuality.tier, 'high', `${label}: comparison begins at maximum quality`);
        assert.equal(captureQuality.renderDpr, Math.min(size.dpr, 3), `${label}: comparison uses native capped DPR`);
        for (const effect of ['depth-dof', 'bloom', 'vignette']) assert.ok(captureQuality.postFx.split(',').includes(effect), `${label}: comparison includes ${effect}`);
      }
      await page.screenshot({ path: join(output, `${label}.png`), timeout: startupTimeout });
      await measure(page.mainFrame(), label, captureQuality);
      if (mode === '3d') assert.equal(measurements.at(-1).effectiveGraphics, '3d', `${label}: capture must contain supported 3D`);
    }
    checks.push({ label, viewport: { width: bounds.width, height: bounds.height }, effectiveGraphics: bounds.gfx, checks: 'native canvas, controls, HUD, immutable simulation' });
    if (!screenshot) console.log(`${label}: responsive canvas, controls, HUD and immutable simulation passed`);
  } finally { await context.close(); }
}

async function settingsMode(frame, mode) {
  await frame.getByRole('button', { name: 'Pause', exact: true }).click();
  await frame.getByRole('button', { name: 'Settings', exact: true }).click();
  const group = frame.getByRole('radiogroup', { name: 'Overworld graphics', exact: true });
  await group.getByRole('radio', { name: mode === '3d' ? '3D HD-2D' : '2D', exact: true }).click();
  await frame.getByRole('button', { name: 'Back', exact: true }).click();
  await frame.getByRole('button', { name: 'Resume', exact: true }).click();
  await effective(frame, mode);
}

async function touchModeRecovery(page) {
  await effective(page.mainFrame(), '3d');
  await page.keyboard.press('v');
  await page.waitForFunction(() => window.__waysideFury.input.mode === 'keyboard');
  await page.locator('.wf-touch-dock').waitFor({ state: 'hidden' });
  await page.locator('.wf-scene-surface').tap();
  await page.waitForFunction(() => window.__waysideFury.input.mode === 'touch');
  await page.locator('.wf-touch-dock').waitFor({ state: 'visible' });
  await effective(page.mainFrame(), '3d');
  checks.push({ label: 'touch-mode-recovery', checks: 'keyboard input followed by a scene tap restores touch controls in 3D' });
  console.log('3D scene tap restores touch controls after keyboard input');
}

async function pausedSwitch(page) {
  console.log('Starting paused renderer switch after 3D travel');
  const result = await page.evaluate(async () => {
    const game = window.__waysideFury;
    const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
    // Use the clear road below the parked car, then travel with real input.
    game.mutate(state => { enterScene(state, 'overworld'); state.y = 504; state.notice = ''; });
    game.setPaused(false); game.setTouch({ x: 1 });
    for (let index = 0; index < 360 && game.state.x < 600; index++) await new Promise(requestAnimationFrame);
    game.setTouch({}); game.setPaused(true);
    const frozen = JSON.stringify(game.state), graphics = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)').dataset.gfx;
    game.setGraphicsMode('2d');
    // Observe the first flat presentation frame while the simulation stays paused.
    await new Promise(requestAnimationFrame);
    const data = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)').dataset;
    return { graphicsBefore: graphics, graphicsAfter: data.gfx, unchanged: frozen === JSON.stringify(game.state),
      x: game.state.x, y: game.state.y, cameraX: Number(data.cameraX), cameraY: Number(data.cameraY), width: Number(data.worldWidth), height: Number(data.worldHeight) };
  });
  assert.equal(result.graphicsBefore, '3d', 'taxi travels with 3D active');
  assert.ok(result.x >= 550, `taxi travels beyond the dormant flat camera before pausing: ${JSON.stringify(result)}`);
  assert.equal(result.graphicsAfter, '2d', 'paused switch presents 2D on its first frame');
  assert.ok(result.unchanged, 'switching renderer while paused does not resume the simulation');
  assert.ok(result.x - result.cameraX >= 10 && result.x - result.cameraX <= result.width - 10 && result.y - result.cameraY >= 10 && result.y - result.cameraY <= result.height - 10,
    `taxi is onscreen immediately after switching to 2D while paused: ${JSON.stringify(result)}`);
  checks.push({ label: 'paused-switch', checks: 'travel in 3D, pause, switch to 2D, taxi stays onscreen without resuming', ...result });
  console.log('Paused renderer switch: taxi remains onscreen on the first 2D frame without resuming');
}

async function lifecycle() {
  console.log('Starting lifecycle checks: Settings, save independence, scene restriction, switching, touch movement and disposal');
  const { context, page } = await contextFor(phones[0]);
  try {
    await boot(page, '2d');
    await settingsMode(page.mainFrame(), '3d');
    await touchModeRecovery(page);
    await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (/wayside-fury.*save/.test(key)) localStorage.removeItem(key); });
    await boot(page, '2d', page.mainFrame(), '3d'); // The saved device preference wins when no query override is supplied.
    await effective(page.mainFrame(), '3d');
    assert.equal(await page.evaluate(() => window.__waysideFury.graphicsMode), '3d', 'graphics preference persists independently of the game save');
    await settingsMode(page.mainFrame(), '2d');
    await settingsMode(page.mainFrame(), '3d');
    for (const scene of ['hub', 'dungeon', 'realm', 'test', 'prologue']) {
      await enter(page.mainFrame(), scene);
      await effective(page.mainFrame(), '2d');
      assert.equal(await page.evaluate(() => window.__waysideFury.graphicsMode), '3d', `${scene}: presentation fallback preserves selected preference`);
    }
    await enter(page.mainFrame(), 'overworld'); await effective(page.mainFrame(), '3d');
    await page.evaluate(async () => {
      const game = window.__waysideFury;
      for (let index = 0; index < 12; index++) { game.setGraphicsMode(index % 2 ? '2d' : '3d'); await new Promise(resolve => setTimeout(resolve, 0)); }
      game.setGraphicsMode('3d');
    });
    await effective(page.mainFrame(), '3d');
    assert.equal(await page.locator('.wf-canvas-3d').count(), 1, 'rapid switching does not accumulate WebGL canvases');
    await immutablePresentation(page.mainFrame(), 'rapid-switch');
    await page.evaluate(async () => {
      const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
      const game = window.__waysideFury;
      game.mutate(state => { enterScene(state, 'overworld'); state.x = 208; state.y = 452; state.notice = ''; });
      game.setPaused(false);
    });
    const stick = await page.locator('.wf-stick-zone').boundingBox(), ki = await page.getByRole('button', { name: 'Ki blast (hold to charge)' }).boundingBox();
    assert.ok(stick && ki, 'movement and Ki controls are available');
    const origin = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
    let session;
    if (browserName === 'chromium') {
      session = await context.newCDPSession(page);
      const points = [{ id: 1, ...origin }, { id: 2, x: ki.x + ki.width / 2, y: ki.y + ki.height / 2 }];
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...points[0], y: origin.y - 28 }, points[1]] });
      assert.equal(await page.getByRole('button', { name: 'Ki blast (hold to charge)' }).getAttribute('aria-pressed'), 'true', 'second thumb holds Ki while movement continues');
    } else {
      await page.mouse.move(origin.x, origin.y); await page.mouse.down(); await page.mouse.move(origin.x, origin.y - 28);
    }
    const collision = await page.evaluate(async () => {
      for (let index = 0; index < 90; index++) await new Promise(requestAnimationFrame);
      const game = window.__waysideFury;
      game.setPaused(true);
      const { OVERWORLD, isBlocked } = await import('/src/pages/WaysideFury/game/world.ts');
      return { x: game.state.x, y: game.state.y, scene: game.state.scene, blocked: isBlocked(OVERWORLD, game.state.x, game.state.y, 10) };
    });
    if (session) { await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach(); }
    else await page.mouse.up();
    assert.equal(collision.scene, 'overworld'); assert.ok(collision.y < 450 && collision.y >= 441, `taxi moves and stops at the existing station collision: ${JSON.stringify(collision)}`); assert.equal(collision.blocked, false);
    await pausedSwitch(page);
    await page.evaluate(async () => {
      const game = window.__waysideFury;
      game.setGraphicsMode('3d');
      await new Promise(requestAnimationFrame);
      game.dispose();
      await new Promise(resolve => setTimeout(resolve, 300));
    });
    assert.equal(await page.locator('.wf-canvas-3d').count(), 0, 'unmount during lazy loading removes the overlay');
    checks.push({ label: 'lifecycle', checks: 'Settings preference independent of save, other scenes remain 2D, switching races, movement/collision, unmount' });
    console.log('Lifecycle checks passed');
  } finally { await context.close(); }
}

async function fallback() {
  console.log('Starting unavailable WebGL fallback');
  const unavailable = await contextFor(phones[0], () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return /webgl/i.test(kind) ? null : getContext.call(this, kind, ...args); };
  });
  try {
    await navigate(unavailable.page, '/wayside-fury?gfx=3d');
    await unavailable.page.getByRole('button', { name: /Begin adventure|Continue adventure/ }).click({ timeout: startupTimeout });
    await unavailable.page.getByRole('button', { name: 'Skip prologue' }).click();
    // WebKit's emulated mobile context can report zero maxTouchPoints. Select
    // the input mode explicitly, as boot() does for the other phone scenarios.
    await unavailable.page.evaluate(() => window.__waysideFury.setTouch({}));
    await unavailable.page.locator('.wf-touch-dock').waitFor({ state: 'visible' });
    await unavailable.page.waitForFunction(() => document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)')?.dataset.gfxStatus === 'fallback');
    await effective(unavailable.page.mainFrame(), '2d');
    assert.equal(await unavailable.page.evaluate(() => window.__waysideFury.graphicsMode), '3d', 'unsupported WebGL preserves the preference');
    await layout(unavailable.page.mainFrame(), 'unsupported-WebGL');
  } finally { await unavailable.context.close(); }
  console.log('Unavailable WebGL fallback passed; starting context loss and retry');
  const { context, page } = await contextFor(phones[0]);
  try {
    await boot(page, '3d');
    assert.equal(await page.evaluate(() => {
      const canvas = document.querySelector('.wf-canvas-3d');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const extension = gl?.getExtension('WEBGL_lose_context');
      if (!extension) return false;
      extension.loseContext(); return true;
    }), true, 'test browser provides context-loss simulation');
    await effective(page.mainFrame(), '2d');
    await page.waitForFunction(() => document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)')?.dataset.gfxStatus === 'fallback');
    assert.equal(await page.evaluate(() => window.__waysideFury.graphicsMode), '3d', 'context loss preserves preference');
    await page.evaluate(() => window.__waysideFury.setGraphicsMode('3d'));
    await effective(page.mainFrame(), '3d');
    checks.push({ label: 'fallback', checks: 'unavailable WebGL, context loss, explicit retry' });
    console.log('Context loss fallback and explicit retry passed');
  } finally { await context.close(); }
}

async function qualityDrop() {
  console.log('Starting automatic quality reduction with fresh paused 3D rendering');
  const { context, page } = await contextFor(phones[0]);
  try {
    // Complete UI startup in 2D, then create 3D while paused so a slow test host
    // cannot consume every quality tier before the controlled pressure begins.
    await boot(page, '2d');
    await page.evaluate(() => { window.__waysideFury.setPaused(true); window.__waysideFury.setGraphicsMode('3d'); });
    await effective(page.mainFrame(), '3d');
    const result = await page.evaluate(async () => {
      const canvas = document.querySelector('.wf-canvas-3d');
      const before = { ...canvas.dataset };
      window.__waysideFury.setPaused(false);
      // Main-thread contention creates real slow presentation frames, as a busy
      // mobile browser would. This pressure is excluded from measured captures.
      for (let index = 0; index < 150; index++) {
        await new Promise(requestAnimationFrame);
        const until = performance.now() + 26;
        while (performance.now() < until) { /* busy browser workload */ }
      }
      await new Promise(requestAnimationFrame);
      return { before, after: { ...canvas.dataset }, gfx: document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)').dataset.gfx };
    });
    assert.equal(result.gfx, '3d', 'slow frames reduce quality while retaining 3D');
    assert.notEqual(result.before.qualityTier, result.after.qualityTier, `sustained slow frames lower quality: ${JSON.stringify(result)}`);
    assert.ok(Number(result.after.renderDpr) <= Number(result.before.renderDpr), 'quality fallback never increases pixel workload');
    checks.push({ label: 'quality', before: result.before.qualityTier, after: result.after.qualityTier, checks: 'real slow-frame pressure automatically reduces quality' });
    console.log(`Automatic quality reduction passed: ${result.before.qualityTier} → ${result.after.qualityTier}`);
  } finally { await context.close(); }
}

async function iframeCase(size) {
  console.log(`Starting actual arcade iframe: 3d-${sizeName(size)}`);
  const { context, page } = await contextFor(size);
  try {
    await navigate(page, '/wayside-fury');
    await page.evaluate(async () => {
      const moduleUrl = filename => performance.getEntriesByType('resource').find(resource => new URL(resource.name).pathname.endsWith(`/deps/${filename}`))?.name;
      const [react, dom, { createArcadeGames, GAME_TOOLBAR_HEIGHT }] = await Promise.all([import(moduleUrl('react.js')), import(moduleUrl('react-dom_client.js')), import('/src/pages/Arcade/games.tsx')]);
      const { createElement } = react.default ?? react, { createRoot } = dom.default ?? dom;
      window.__waysideFury.dispose();
      const host = document.createElement('div'); document.body.replaceChildren(host);
      const game = createArcadeGames().find(game => game.name === 'Wayside Fury');
      createRoot(host).render(createElement('main', { style: { position: 'fixed', inset: 0, height: '100dvh', display: 'flex', flexDirection: 'column' } },
        createElement('div', { style: { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, game.game),
        createElement('div', { style: { height: GAME_TOOLBAR_HEIGHT, flexShrink: 0 }, 'aria-label': 'Arcade toolbar' }, 'Arcade toolbar')));
    });
    const locator = page.locator('iframe[title="Wayside Fury"]'); await locator.waitFor();
    const frame = await (await locator.elementHandle()).contentFrame(); assert.ok(frame);
    await boot(page, '2d', frame);
    await settingsMode(frame, '3d');
    await layout(frame, `3d-${sizeName(size)}-iframe`);
    checks.push({ label: `3d-${sizeName(size)}-iframe`, checks: 'actual arcade iframe sizing and toolbar, Settings, controls' });
    console.log(`3d-${sizeName(size)}-iframe: toolbar sizing, Settings and controls passed`);
  } finally { await context.close(); }
}

try {
  await mkdir(output, { recursive: true });
  for (const size of [phones[0], desktop]) for (const mode of ['2d', '3d']) await capture(size, mode);
  for (const size of phones.slice(1)) await capture(size, '3d', false);
  await lifecycle();
  await fallback();
  await qualityDrop();
  for (const size of [phones[0], phones[2], desktop]) await iframeCase(size);
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  const report = { browser: browserName, browserVersion: browser.version(), launch: { headless: launchOptions.headless, channel: launchOptions.channel ?? null, executablePath: launchOptions.executablePath ?? null, webglBackend: backend }, generatedAt: new Date().toISOString(),
    caveat: 'Desktop Playwright with phone viewport/DPR emulation. rAF measures frame cadence; renderMs measures CPU submission, not GPU duration. Physical mid-iPhone performance requires a device run.', measurements, checks };
  await writeFile(join(output, 'frame-times.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wayside Fury 3D checks pass (${checks.length} cases). Captures and frame times: ${output}`);
} finally { await browser.close(); }
