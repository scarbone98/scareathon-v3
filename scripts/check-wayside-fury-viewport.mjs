// Requires a running Vite development server and Playwright with its browser installed.
// FURY_BASE_URL=http://127.0.0.1:5185 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//   node scripts/check-wayside-fury-viewport.mjs
// Optional FURY_VIEWPORT_CASES=430x932-dpr3,1280x800-dpr2-iframe selects retries.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5185';
const browserName = process.env.PLAYWRIGHT_BROWSER ?? 'chromium';
const moduleName = process.env.PLAYWRIGHT_MODULE;
let playwright;
try {
  playwright = await import(moduleName?.startsWith('/') ? pathToFileURL(moduleName).href : moduleName ?? 'playwright');
} catch {
  console.error('Wayside Fury viewport checks need Playwright. Install it outside the worktree if preferred, then set PLAYWRIGHT_MODULE to its index.mjs. Install a browser with playwright install chromium.');
  process.exit(1);
}
assert.ok(playwright[browserName], `Unknown Playwright browser: ${browserName}`);
let browser;
try {
  browser = await playwright[browserName].launch({ headless: true });
} catch (error) {
  console.error(`Cannot launch Playwright ${browserName}. Ensure its browser is installed (playwright install ${browserName}) and the environment permits browser processes.\n${error.message}`);
  process.exit(1);
}
const errors = [];
const sizes = [
  { width: 390, height: 844, dpr: 3 },
  { width: 430, height: 932, dpr: 3 },
  { width: 844, height: 390, dpr: 3 },
  { width: 932, height: 430, dpr: 3 },
  { width: 1280, height: 800, dpr: 2 },
  { width: 1280, height: 800, dpr: 3 },
];
const inside = (box, width, height) => box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1;
const overlaps = (a, b) => a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;

async function ready(frame) {
  await frame.waitForFunction(() => {
    const canvas = document.querySelector('.wf-stage canvas');
    if (!window.__waysideFury || !canvas?.dataset.pixelScale) return false;
    const dpr = Number(canvas.dataset.renderDpr);
    return Math.abs(canvas.width - canvas.clientWidth * dpr) <= 2 && Math.abs(canvas.height - canvas.clientHeight * dpr) <= 2;
  });
}

async function check(page, frame, label, { gameplay = false, native = false, controls = true, story = false } = {}) {
  await ready(frame);
  if (story) await frame.waitForFunction(() => {
    const title = document.querySelector('.wf-story-title');
    return window.__waysideFury.state.scene === 'prologue' && title && Number(getComputedStyle(title).opacity) >= 0.99 && document.querySelector('.wf-dialogue') && document.querySelector('.wf-skip');
  });
  // Finish entrance animations before comparing UI rectangles.
  await frame.waitForTimeout(280);
  if (story) {
    const text = await frame.evaluate(async () => {
      const { PROLOGUE } = await import('/src/pages/WaysideFury/game/content.ts');
      return PROLOGUE[window.__waysideFury.state.cutscene].text;
    });
    await frame.waitForFunction(text => {
      const title = document.querySelector('.wf-story-title');
      return window.__waysideFury.state.scene === 'prologue' && title && Number(getComputedStyle(title).opacity) >= 0.99 && document.querySelector('.wf-dialogue p')?.textContent === text && document.querySelector('.wf-skip');
    }, text);
  }
  const layout = await frame.evaluate(() => {
    const canvas = document.querySelector('.wf-stage canvas');
    const rect = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const elements = selectors => selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)).filter(element => {
      const style = getComputedStyle(element), bounds = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && bounds.width > 0 && bounds.height > 0;
    }).map(element => ({ selector, ...rect(element), text: element.textContent, fontSize: parseFloat(getComputedStyle(element).fontSize), transform: getComputedStyle(element).transform })));
    return {
      width: innerWidth, height: innerHeight, deviceDpr: devicePixelRatio,
      canvas: { ...rect(canvas), clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight, backingWidth: canvas.width, backingHeight: canvas.height, dataset: { ...canvas.dataset } },
      touch: elements(['.wf-stick-zone', '.wf-stick', '.wf-touch-btn', '.wf-pause', '.wf-interact-prompt', '.wf-hint button']),
      ui: elements(['.wf-hud', '.wf-touch-dock', '.wf-story-title', '.wf-dialogue', '.wf-skip', '.wf-shift-caption', '.wf-overlay']),
      text: elements(['.wf-hero-hud strong', '.wf-meter small', '.wf-status', '.wf-scene-label', '.wf-dialogue p', '.wf-menu h1', '.wf-overlay h2', '.wf-overlay p']),
      rotateHint: elements(['.wf-rotate-hint']),
      viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
      scene: window.__waysideFury.state.scene,
    };
  });
  const screenshot = `/tmp/fury-viewport-${label}.png`;
  await page.screenshot({ path: screenshot });
  const description = `${label}: ${JSON.stringify(layout)}`;
  assert.ok(layout.viewportMeta.includes('viewport-fit=cover'), `Safari edge-to-edge viewport opt-in: ${description}`);
  const canvas = layout.canvas, dpr = Number(canvas.dataset.renderDpr), scale = Number(canvas.dataset.pixelScale), zoom = Number(canvas.dataset.zoom);
  assert.ok(inside(canvas, layout.width, layout.height), `canvas clipped: ${description}`);
  assert.ok(dpr > 0 && dpr <= Math.min(layout.deviceDpr, 3), `DPR cap: ${description}`);
  assert.equal(dpr, Math.min(layout.deviceDpr, Number(canvas.dataset.qualityCap)), `active quality cap follows DPR: ${description}`);
  if (native) assert.equal(dpr, Math.min(layout.deviceDpr, 3), `initial native DPR: ${description}`);
  assert.ok(Math.abs(canvas.backingWidth - canvas.clientWidth * dpr) <= 2, `native backing width: ${description}`);
  assert.ok(Math.abs(canvas.backingHeight - canvas.clientHeight * dpr) <= 2, `native backing height: ${description}`);
  assert.ok(Number.isInteger(scale) && scale > 0, `integer device-pixel world zoom: ${description}`);
  assert.ok(Math.abs(zoom * dpr - scale) < 0.0001, `DPR-aware zoom: ${description}`);
  assert.ok(Number(canvas.dataset.worldWidth) > 0 && Number(canvas.dataset.worldHeight) > 0, `dynamic world viewport: ${description}`);
  assert.ok(Math.abs(Number(canvas.dataset.worldWidth) * zoom - canvas.width) <= 2, `world width follows canvas: ${description}`);
  assert.ok(Math.abs(Number(canvas.dataset.worldHeight) * zoom - canvas.height) <= 2, `world height follows canvas: ${description}`);
  if (gameplay) {
    const portrait = layout.width < layout.height;
    const area = canvas.width * canvas.height / (layout.width * layout.height);
    assert.ok(area >= (portrait ? 0.55 : 0.75), `gameplay canvas area ${area}: ${description}`);
    if (portrait) {
      assert.ok(canvas.x <= 1 && canvas.width >= layout.width - 2, `portrait canvas fills width: ${description}`);
      const dock = layout.ui.find(element => element.selector === '.wf-touch-dock');
      if (dock) assert.ok(dock.height <= layout.height * 0.28 + 1, `portrait dock at most 28%: ${description}`);
      const hud = layout.ui.find(element => element.selector === '.wf-hud');
      if (hud) assert.ok(hud.height <= 80, `compact portrait HUD: ${description}`);
    }
    assert.equal(layout.rotateHint.length, 0, 'obsolete rotation line removed');
    if (controls) assert.equal(layout.touch.filter(element => element.selector === '.wf-touch-btn').length, 5, `five touch actions: ${description}`);
  }
  for (const box of layout.touch) {
    assert.ok(inside(box, layout.width, layout.height), `touch target clipped: ${JSON.stringify(box)} in ${description}`);
    if (box.selector === '.wf-touch-btn') assert.ok(box.width >= 52 && box.height >= 52 && box.width <= 72.1 && box.height <= 72.1, `52–72px action size: ${description}`);
  }
  for (const box of layout.ui) assert.ok(inside(box, layout.width, layout.height), `UI clipped: ${description}`);
  const hud = layout.ui.find(element => element.selector === '.wf-hud');
  const dock = layout.ui.find(element => element.selector === '.wf-touch-dock');
  const bands = layout.ui.filter(element => ['.wf-story-title', '.wf-dialogue', '.wf-shift-caption', '.wf-overlay'].includes(element.selector));
  for (const band of bands) {
    if (hud) assert.ok(!overlaps(band, hud), `dialog/title/modal overlaps HUD: ${description}`);
    if (dock) assert.ok(!overlaps(band, dock), `dialog/title/modal overlaps controls: ${description}`);
  }
  const title = layout.ui.find(element => element.selector === '.wf-story-title');
  const dialogue = layout.ui.find(element => element.selector === '.wf-dialogue');
  const skip = layout.ui.find(element => element.selector === '.wf-skip');
  if (story) {
    assert.equal(layout.scene, 'prologue', `expected prologue scene: ${description}`);
    assert.ok(title && dialogue && skip, `story title, dialogue and skip are present: ${description}`);
  }
  if (title && dialogue) assert.ok(!overlaps(title, dialogue), `story title/dialogue overlap: ${description}`);
  if (title && skip) assert.ok(!overlaps(title, skip), `story title/skip overlap: ${description}`);
  assert.ok(layout.text.length > 0, `text is native DOM UI: ${description}`);
  for (const element of layout.text) assert.ok(element.fontSize >= 10 && Number.isFinite(element.fontSize), `readable native DOM text: ${description}`);
  return layout;
}

async function enter(frame, scene, room = 0) {
  await frame.evaluate(async ({ scene, room }) => {
    const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
    window.__waysideFury.mutate(state => { enterScene(state, scene, room); state.notice = ''; });
    window.__waysideFury.setTouch({});
  }, { scene, room });
}

async function cameraBounds(frame, label) {
  await frame.waitForTimeout(700);
  const result = await frame.evaluate(async () => {
    const { getWorld } = await import('/src/pages/WaysideFury/game/world.ts');
    const state = window.__waysideFury.state, world = getWorld(state.scene, state.room);
    const data = document.querySelector('canvas').dataset;
    return { width: world.width, height: world.height, viewportWidth: Number(data.worldWidth), viewportHeight: Number(data.worldHeight), x: Number(data.cameraX), y: Number(data.cameraY) };
  });
  for (const [camera, mapSize, viewSize] of [[result.x, result.width, result.viewportWidth], [result.y, result.height, result.viewportHeight]]) {
    assert.ok(Number.isFinite(camera), `camera measurement ${label}: ${JSON.stringify(result)}`);
    if (mapSize < viewSize) assert.ok(Math.abs(camera - (mapSize - viewSize) / 2) < 0.05, `small room centered ${label}: ${JSON.stringify(result)}`);
    else assert.ok(camera >= -0.05 && camera <= mapSize - viewSize + 0.05, `camera within map ${label}: ${JSON.stringify(result)}`);
  }
}

async function qualityChecks(page, frame) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const result = await frame.evaluate(async () => {
    const [{ Renderer }, { newGame, enterScene }, { getWorld, cameraTarget }] = await Promise.all([
      import('/src/pages/WaysideFury/game/render.ts'),
      import('/src/pages/WaysideFury/game/sim.ts'),
      import('/src/pages/WaysideFury/game/world.ts'),
    ]);
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'fixed', left: '-9999px', top: '0', width: '200px', height: '240px' });
    document.body.append(canvas);
    const renderer = new Renderer(canvas);
    const state = newGame(); enterScene(state, 'hub'); state.enemies = [];
    try {
      renderer.draw(state, 1 / 60, 1 / 60);
      const cached = [...renderer.terrain.chunks.entries()];
      renderer.draw(state, 1 / 60, 1 / 60);
      const cacheReused = cached.length > 0 && cached.every(([key, value]) => renderer.terrain.chunks.get(key) === value);
      state.x += 8.25;
      renderer.draw(state, 1 / 60, 1 / 60);
      const target = cameraTarget(getWorld(state.scene, state.room), state.x, state.y, Number(canvas.dataset.worldWidth), Number(canvas.dataset.worldHeight));
      const reducedMotionCamera = Math.abs(Number(canvas.dataset.cameraX) - target.x) < 1e-6 && Math.abs(Number(canvas.dataset.cameraY) - target.y) < 1e-6;
      for (let index = 0; index < 10; index++) renderer.draw(state, 1 / 60, 0.025);
      renderer.draw(state, 1 / 60, 1 / 60); // A healthy frame resets the sustained sample.
      for (let index = 0; index < 70; index++) renderer.draw(state, 1 / 60, 0.025);
      const beforeSustained = Number(canvas.dataset.qualityCap);
      for (let index = 0; index < 11; index++) renderer.draw(state, 1 / 60, 0.025);
      const afterSustained = Number(canvas.dataset.qualityCap), effectiveDpr = Number(canvas.dataset.renderDpr);
      const refreshed = cached.every(([key, value]) => renderer.terrain.chunks.get(key) !== value);
      return { cacheReused, reducedMotionCamera, beforeSustained, afterSustained, effectiveDpr, refreshed,
        pixelWidth: canvas.width, pixelHeight: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight,
        cachePixels: renderer.terrain.cachePixels };
    } finally {
      renderer.dispose(); canvas.remove();
    }
  });
  assert.ok(result.cacheReused, 'static native terrain chunks are reused between frames');
  assert.ok(result.reducedMotionCamera, 'reduced motion removes camera easing');
  assert.equal(result.beforeSustained, 3, 'brief slow spikes do not trigger fallback');
  assert.equal(result.afterSustained, 2, 'sustained >20ms frames lower DPR cap after two seconds');
  assert.equal(result.effectiveDpr, 2);
  assert.ok(result.refreshed, 'DPR fallback invalidates terrain chunks');
  assert.equal(result.pixelWidth, result.clientWidth * 2);
  assert.equal(result.pixelHeight, result.clientHeight * 2);
  assert.ok(result.cachePixels <= 12_000_000, 'small terrain cache has a bounded memory budget');
  const desktop = await frame.evaluate(async () => {
    const [{ Renderer }, { newGame, enterScene }] = await Promise.all([
      import('/src/pages/WaysideFury/game/render.ts'), import('/src/pages/WaysideFury/game/sim.ts'),
    ]);
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'fixed', left: '-9999px', top: '0', width: '1280px', height: '800px' });
    document.body.append(canvas);
    const renderer = new Renderer(canvas);
    const state = newGame(); enterScene(state, 'hub'); state.x = 161; state.y = 160; state.enemies = [];
    try {
      renderer.draw(state, 1 / 60, 1 / 60);
      const cached = [...renderer.terrain.chunks.entries()];
      renderer.draw(state, 1 / 60, 1 / 60);
      return { reused: cached.length > 0 && cached.every(([key, value]) => renderer.terrain.chunks.get(key) === value),
        beforeCount: cached.length, afterCount: renderer.terrain.chunks.size,
        cachePixels: renderer.terrain.cachePixels, budget: renderer.terrain.cacheBudgetPixels,
        x: Number(canvas.dataset.cameraX), y: Number(canvas.dataset.cameraY),
        dpr: Number(canvas.dataset.renderDpr), pixelWidth: canvas.width, pixelHeight: canvas.height };
    } finally { renderer.dispose(); canvas.remove(); }
  });
  assert.equal(desktop.dpr, 3);
  assert.equal(desktop.pixelWidth, 3840); assert.equal(desktop.pixelHeight, 2400);
  assert.equal(desktop.x, 1); assert.equal(desktop.y, 60);
  assert.ok(desktop.reused, `HiDPI desktop keeps visible static chunks cached: ${JSON.stringify(desktop)}`);
  assert.equal(desktop.beforeCount, desktop.afterCount);
  assert.ok(desktop.cachePixels <= desktop.budget && desktop.cachePixels <= 12_000_000, `HiDPI desktop cache stays bounded: ${JSON.stringify(desktop)}`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

async function mountArcadeFrame(page) {
  // Mount the exact arcade game element, including GameRenderer's sizing logic and
  // authored toolbar reservation. This avoids depending on the station's 3D scene.
  await page.evaluate(async () => {
    const loadedModule = filename => {
      const module = performance.getEntriesByType('resource').find(resource => new URL(resource.name).pathname.endsWith(`/deps/${filename}`));
      if (!module) throw new Error(`Vite optimized module is missing: ${filename}`);
      return module.name;
    };
    const [reactModule, domModule, { createArcadeGames, GAME_TOOLBAR_HEIGHT }] = await Promise.all([
      import(loadedModule('react.js')),
      import(loadedModule('react-dom_client.js')),
      import('/src/pages/Arcade/games.tsx'),
    ]);
    const { createElement } = reactModule.default ?? reactModule;
    const { createRoot } = domModule.default ?? domModule;
    window.__waysideFury?.dispose();
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    const game = createArcadeGames().find(game => game.name === 'Wayside Fury');
    if (!game) throw new Error('Arcade Wayside Fury entry is missing');
    createRoot(host).render(createElement('main', { style: { position: 'fixed', inset: 0, height: '100dvh', display: 'flex', flexDirection: 'column', background: '#080e18' } },
      createElement('div', { style: { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, game.game),
      createElement('div', { style: { height: GAME_TOOLBAR_HEIGHT, flexShrink: 0 }, 'aria-label': 'Arcade toolbar' }, 'Arcade toolbar'),
    ));
  });
  const iframe = page.locator('iframe[title="Wayside Fury"]');
  await iframe.waitFor();
  const frame = await (await iframe.elementHandle()).contentFrame();
  assert.ok(frame, 'arcade iframe loaded');
  await frame.waitForFunction(() => !!window.__waysideFury);
  const size = await frame.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  console.log(`Actual arcade iframe: ${size.width}×${size.height}`);
  return frame;
}

async function run(size, iframe = false) {
  const phone = size.width !== 1280;
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr, hasTouch: true, isMobile: phone,
    ...(phone ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' } : {}) });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const prefix = `${size.width}x${size.height}-dpr${size.dpr}${iframe ? '-iframe' : ''}`;
  try {
    await page.goto(new URL('/wayside-fury', baseUrl).href, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !!window.__waysideFury);
    const frame = iframe ? await mountArcadeFrame(page) : page.mainFrame();
    await check(page, frame, `${prefix}-title`, { native: true });
    await frame.getByRole('button', { name: /Begin adventure|Continue adventure/ }).tap();
    await frame.getByRole('button', { name: 'Skip prologue' }).waitFor();
    await check(page, frame, `${prefix}-prologue`, { story: true });
    for (const beat of [1, 2, 5, 7, 9, 10]) {
      await frame.evaluate(beat => window.__waysideFury.mutate(state => { state.cutscene = beat; state.sceneTimer = 1; }), beat);
      await check(page, frame, `${prefix}-story-${beat}`, { story: true });
    }
    await frame.getByRole('button', { name: 'Skip prologue' }).tap();
    // WebKit can emulate touch while reporting maxTouchPoints=0. The actual
    // first canvas touch must activate the same dock used on a real phone.
    await frame.locator('.wf-stage canvas').tap();
    await frame.locator('.wf-touch-dock').waitFor({ state: 'visible' });
    await check(page, frame, `${prefix}-gameplay`, { gameplay: true });
    await cameraBounds(frame, `${prefix}-taxi`);
    await enter(frame, 'hub');
    await check(page, frame, `${prefix}-hub`, { gameplay: true });
    await cameraBounds(frame, `${prefix}-hub`);
    await frame.evaluate(() => window.__waysideFury.mutate(state => { state.overlay = 'home'; }));
    await check(page, frame, `${prefix}-home`);
    await frame.getByRole('button', { name: 'Leave home' }).tap();
    await frame.evaluate(() => window.__waysideFury.mutate(state => { state.overlay = 'shop'; }));
    await check(page, frame, `${prefix}-shop`);
    await frame.getByRole('button', { name: 'Leave shop' }).tap();
    await frame.getByRole('button', { name: 'Pause', exact: true }).tap();
    await check(page, frame, `${prefix}-paused`);
    await frame.getByRole('button', { name: 'Resume', exact: true }).tap();
    await frame.evaluate(async () => {
      const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
      const { WATCHER_ROOM } = await import('/src/pages/WaysideFury/game/world.ts');
      window.__waysideFury.mutate(state => { enterScene(state, 'dungeon', WATCHER_ROOM); state.enemies.forEach(enemy => { enemy.cooldown = 100; }); });
    });
    await check(page, frame, `${prefix}-boss`, { gameplay: true });
    await cameraBounds(frame, `${prefix}-boss`);
    await enter(frame, 'test');
    await frame.evaluate(() => window.__waysideFury.mutate(state => { state.enemies = []; }));
    await cameraBounds(frame, `${prefix}-small-room`);
    await check(page, frame, `${prefix}-small-room`, { gameplay: true });
    if (!iframe && size.width === 390) {
      for (const viewport of [{ width: 844, height: 390 }, { width: 430, height: 932 }, { width: 390, height: 620 }]) {
        await page.setViewportSize(viewport);
        await check(page, frame, `${prefix}-resize-${viewport.width}x${viewport.height}`, { gameplay: true });
        await cameraBounds(frame, `${prefix}-resize`);
      }
      if (browserName === 'chromium') {
        const session = await context.newCDPSession(page);
        for (const dpr of [4, 1.5]) {
          await session.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: dpr, mobile: true });
          await frame.waitForFunction(dpr => Math.abs(devicePixelRatio - dpr) < 0.01, dpr);
          // Long screenshot runs can activate the frame-time fallback on a
          // software-rendered CI browser. Initial native DPR is checked above;
          // live DPR changes must follow the renderer's explicit quality cap.
          await check(page, frame, `${prefix}-changed-dpr-${dpr}`, { gameplay: true });
        }
        await session.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
        await frame.waitForFunction(() => devicePixelRatio === 3);
        await qualityChecks(page, frame);
        await session.detach();
      }
    }
    console.log(`${prefix}: native backing, integer world scale, layout, controls, stories, dialogs, camera and resize passed`);
  } finally {
    await context.close();
  }
}

try {
  const cases = [...sizes.map(size => ({ size, iframe: false })), ...[sizes[0], sizes[2], sizes[4]].map(size => ({ size, iframe: true }))];
  const name = ({ size, iframe }) => `${size.width}x${size.height}-dpr${size.dpr}${iframe ? '-iframe' : ''}`;
  const requested = process.env.FURY_VIEWPORT_CASES?.split(',').map(value => value.trim()).filter(Boolean);
  if (requested) for (const entry of requested) assert.ok(cases.some(test => name(test) === entry), `Unknown viewport case: ${entry}`);
  const selected = requested ? cases.filter(test => requested.includes(name(test))) : cases;
  for (const test of selected) await run(test.size, test.iframe);
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log(`Wayside Fury responsive viewport checks pass (${selected.length} cases). Screenshots: /tmp/fury-viewport-*.png`);
} finally {
  await browser.close();
}
