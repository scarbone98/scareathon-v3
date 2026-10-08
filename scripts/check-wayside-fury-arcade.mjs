// Verifies the real ArcadeV2 cabinet and CartridgeIndex with the shared registry.
// Uses an isolated component host because /arcade-v2 now redirects to the station.
// FURY_BASE_URL=http://127.0.0.1:5173 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//   node scripts/check-wayside-fury-arcade.mjs
// Optional PLAYWRIGHT_BROWSER=chromium|webkit|firefox selects the installed engine.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5173';
const moduleName = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const browserName = process.env.PLAYWRIGHT_BROWSER ?? 'chromium';
const playwright = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
assert.ok(['chromium', 'webkit', 'firefox'].includes(browserName), `Unknown Playwright browser: ${browserName}`);
const shots = '/tmp/fury-arcade-shots';
await mkdir(shots, { recursive: true });
const browser = await playwright[browserName].launch({ headless: true });
const results = [];
let activePage;
let primaryError;

async function stage(label, action, timeout = 30000) {
  console.log(`${label}: starting`);
  let timer;
  try {
    const result = await Promise.race([action(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeout}ms`)), timeout);
    })]);
    console.log(`${label}: completed`);
    return result;
  } catch (error) {
    console.error(`${label}: ${error.message}`);
    throw error;
  } finally { clearTimeout(timer); }
}

try {
  for (const size of [{ width: 1280, height: 900, dpr: 2 }, { width: 390, height: 844, dpr: 3 }]) {
    const label = `${size.width}x${size.height}`;
    console.log(`Checking Wayside Fury arcade at ${label}`);
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr });
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.addInitScript(() => {
      const create = document.createElement.bind(document);
      window.__furyArcadeVideos = [];
      window.__furyArcadeVideoEvents = [];
      document.createElement = (...args) => {
        const element = create(...args);
        if (args[0] === 'video') {
          window.__furyArcadeVideos.push(element);
          for (const event of ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'pause', 'stalled', 'error']) element.addEventListener(event, () => {
            window.__furyArcadeVideoEvents.push({ event, time: Math.round(performance.now()), source: element.currentSrc,
              readyState: element.readyState, paused: element.paused, currentTime: element.currentTime, error: element.error?.message });
          });
        }
        return element;
      };
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      window.__furyArcadeVideoPaints = 0;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (args[0] instanceof HTMLVideoElement && args[0].src.endsWith('/game-recordings/WaysideFury.mp4')) window.__furyArcadeVideoPaints++;
        return draw.apply(this, args);
      };
    });
    await page.goto(`${baseUrl}/wayside-fury`);
    await page.waitForFunction(() => !!window.__waysideFury);
    const registry = await page.evaluate(async () => {
      const loadedModule = filename => {
        const module = performance.getEntriesByType('resource').find(resource => new URL(resource.name).pathname.endsWith(`/deps/${filename}`));
        if (!module) throw new Error(`Vite optimized module is missing: ${filename}`);
        return module.name;
      };
      // Vite may append an HMR timestamp to a source module. Reuse the app's
      // exact context URL so the test provider and cabinet share one context.
      const navigatorModule = performance.getEntriesByType('resource').find(resource => new URL(resource.name).pathname === '/src/components/navigator/context.tsx');
      if (!navigatorModule) throw new Error('Navigator context module has not loaded');
      const [reactModule, domModule, { createArcadeGames }, { default: CartridgeArcade }, { stillUrlFor }, { NavigatorProvider }] = await Promise.all([
        import(loadedModule('react.js')), import(loadedModule('react-dom_client.js')),
        import('/src/pages/Arcade/games.tsx'), import('/src/pages/ArcadeV2/CartridgeArcade.tsx'), import('/src/pages/ArcadeV2/cartridge.ts'),
        import(navigatorModule.name),
      ]);
      const { createElement } = reactModule.default ?? reactModule;
      const { createRoot } = domModule.default ?? domModule;
      const games = createArcadeGames();
      const game = games.find(game => game.name === 'Wayside Fury');
      if (!game) throw new Error('Wayside Fury is missing from the registry');
      window.__waysideFury.dispose();
      const host = document.createElement('div');
      document.body.replaceChildren(host);
      // Use the real registry entry in the station's cabinet configuration.
      // Keeping this fixture to one game avoids compiling unrelated cart shaders.
      window.__furyArcadeRoot = createRoot(host);
      window.__furyArcadeRoot.render(createElement(NavigatorProvider, null,
        createElement(CartridgeArcade, { games: [game], initialGameName: game.name, paused: false, withRoom: false,
          onInsert: () => {}, onPlay: () => {}, onLeaderboard: () => {} })));
      // Verify the actual full directory separately without rendering every
      // game's 3D cartridge just to check this game's local label image.
      window.__furyMountIndex = async () => {
        const { default: CartridgeIndex } = await import('/src/pages/ArcadeV2/CartridgeIndex.tsx');
        window.__furyArcadeRoot.render(createElement(CartridgeIndex, { games, current: games.indexOf(game),
          onPick: () => {}, onClose: () => {} }));
      };
      return { name: game.name, videoUrl: game.videoUrl, stillUrl: stillUrlFor(game.videoUrl) };
    });
    assert.equal(registry.videoUrl, '/game-recordings/WaysideFury.mp4');
    assert.equal(registry.stillUrl, '/game-recordings/stills/WaysideFury.jpg');
    await page.getByRole('button', { name: 'Show all games', exact: true }).waitFor({ timeout: 60000 });
    console.log(`${label}: cabinet built`);
    // The cabinet UI appears before shader compilation finishes. Its render
    // loop creates the preview afterward; avoid spending the gesture before
    // the production playback handler has a video to unlock.
    await stage(`${label} preview source`, () => page.waitForFunction(() => window.__furyArcadeVideos.some(video => video.src.endsWith('/game-recordings/WaysideFury.mp4')),
      undefined, { timeout: 30000 }), 35000);
    await stage(`${label} playback gesture`, () => page.mouse.click(size.width / 2, 60)); // Unlock muted playback on gesture-limited browsers.
    await stage(`${label} video playback and cabinet paints`, () => page.waitForFunction(() => window.__furyArcadeVideos.some(video => video.src.endsWith('/game-recordings/WaysideFury.mp4') && video.videoWidth === 960 && video.currentTime > 0.5 && !video.paused)
      && window.__furyArcadeVideoPaints > 3, undefined, { timeout: 30000 }), 35000);
    await page.waitForTimeout(700);
    const video = await page.evaluate(() => {
      const video = window.__furyArcadeVideos.find(video => video.src.endsWith('/game-recordings/WaysideFury.mp4'));
      return { source: video.currentSrc, width: video.videoWidth, height: video.videoHeight, currentTime: video.currentTime,
        duration: video.duration, muted: video.muted, loop: video.loop, paints: window.__furyArcadeVideoPaints };
    });
    assert.ok(video.muted && video.loop, 'cabinet attract clip is muted and loops');
    await page.screenshot({ path: `${shots}/cabinet-${label}.png` });
    console.log(`${label}: local video playing on the cabinet`);
    await page.evaluate(() => window.__furyMountIndex());
    await page.getByRole('textbox', { name: 'Search games' }).fill('Wayside Fury');
    const image = page.getByRole('dialog', { name: 'All games' }).locator('img[src="/game-recordings/stills/WaysideFury.jpg"]');
    await image.waitFor();
    await image.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelector('img[src="/game-recordings/stills/WaysideFury.jpg"]');
      return image?.complete && image.naturalWidth === 552 && image.naturalHeight === 310 && getComputedStyle(image).display !== 'none';
    });
    await page.screenshot({ path: `${shots}/index-${label}.png` });
    console.log(`${label}: still loaded in the full cartridge index`);
    assert.equal(errors.length, 0, errors.join('\n'));
    results.push({ size, registry, video });
    await page.evaluate(() => window.__furyArcadeRoot.unmount());
    await context.close();
  }
  await writeFile(`${shots}/arcade.json`, JSON.stringify(results, null, 2));
  console.log(`Wayside Fury cabinet video and cartridge still pass at desktop and phone DPR. Screenshots: ${shots}/`);
} catch (error) {
  primaryError = error;
  if (activePage && !activePage.isClosed()) {
    const video = await stage('Failure video diagnostics', () => activePage.evaluate(() => ({ paints: window.__furyArcadeVideoPaints,
      videos: window.__furyArcadeVideos?.map(video => ({ source: video.currentSrc, width: video.videoWidth, height: video.videoHeight,
        currentTime: video.currentTime, readyState: video.readyState, networkState: video.networkState, paused: video.paused,
        muted: video.muted, loop: video.loop, error: video.error?.message })), events: window.__furyArcadeVideoEvents })), 10000).catch(error => ({ unavailable: error.message }));
    await writeFile(`${shots}/arcade-failure-video.json`, JSON.stringify(video, null, 2));
    await stage('Failure screenshot', () => activePage.screenshot({ path: `${shots}/arcade-failure.png`, timeout: 10000 }), 12000).catch(() => {});
    const body = await stage('Failure body', () => activePage.locator('body').innerText({ timeout: 5000 }), 10000).catch(() => '');
    await writeFile(`${shots}/arcade-failure.txt`, body);
  }
  throw error;
} finally {
  await stage('Arcade browser shutdown', () => browser.close(), 15000).catch(error => { if (!primaryError) throw error; });
}
