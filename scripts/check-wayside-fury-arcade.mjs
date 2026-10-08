// Verifies the real ArcadeV2 cabinet and CartridgeIndex with the shared registry.
// Uses an isolated component host because /arcade-v2 now redirects to the station.
// FURY_BASE_URL=http://127.0.0.1:5173 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//   node scripts/check-wayside-fury-arcade.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5173';
const startupTimeout = Number(process.env.FURY_READY_TIMEOUT ?? 120000);
const actionTimeout = Number(process.env.FURY_ACTION_TIMEOUT ?? 30000);
assert.ok(Number.isFinite(actionTimeout) && actionTimeout > 0, 'FURY_ACTION_TIMEOUT must be positive');
const moduleName = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
const shots = '/tmp/fury-arcade-shots';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true,
  args: ['--mute-audio'],
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
const results = [];
let activePage;
async function evaluateStartup(page, callback) {
  let deadline;
  try {
    return await Promise.race([
      page.evaluate(callback),
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error(`Arcade module initialization exceeded ${startupTimeout}ms`)), startupTimeout); }),
    ]);
  } finally { clearTimeout(deadline); }
}
try {
  for (const size of [{ width: 1280, height: 900, dpr: 2 }, { width: 390, height: 844, dpr: 3 }]) {
    const label = `${size.width}x${size.height}`;
    console.log(`Checking Wayside Fury arcade at ${label}`);
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr });
    context.setDefaultTimeout(actionTimeout);
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.addInitScript(() => {
      const create = document.createElement.bind(document);
      window.__furyArcadeVideos = [];
      document.createElement = (...args) => {
        const element = create(...args);
        if (args[0] === 'video') window.__furyArcadeVideos.push(element);
        return element;
      };
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      window.__furyArcadeVideoPaints = 0;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (args[0] instanceof HTMLVideoElement && args[0].src.endsWith('/game-recordings/WaysideFury.mp4')) window.__furyArcadeVideoPaints++;
        return draw.apply(this, args);
      };
    });
    await page.goto(`${baseUrl}/wayside-fury`, { waitUntil: 'domcontentloaded', timeout: startupTimeout });
    await page.waitForFunction(() => !!window.__waysideFury, null, { timeout: startupTimeout });
    console.log(`${label}: game controller ready; loading arcade cabinet modules`);
    const registry = await evaluateStartup(page, async () => {
      window.__waysideFury.dispose();
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
    await page.getByRole('button', { name: 'Show all games', exact: true }).waitFor({ timeout: startupTimeout });
    console.log(`${label}: cabinet built`);
    await page.mouse.click(size.width / 2, 60); // Unlock muted playback on gesture-limited browsers.
    try {
      await page.waitForFunction(() => window.__furyArcadeVideos.some(video => video.src.endsWith('/game-recordings/WaysideFury.mp4') && video.videoWidth === 960 && video.currentTime > 0.5 && !video.paused)
        && window.__furyArcadeVideoPaints > 3, undefined, { timeout: actionTimeout });
    } catch (error) {
      console.error('Cabinet video wait state', await page.evaluate(() => ({ hidden: document.hidden, paints: window.__furyArcadeVideoPaints,
        videos: window.__furyArcadeVideos.filter(video => video.src.endsWith('/game-recordings/WaysideFury.mp4')).map(video => ({
          src: video.currentSrc, width: video.videoWidth, height: video.videoHeight, currentTime: video.currentTime,
          paused: video.paused, muted: video.muted, readyState: video.readyState, networkState: video.networkState, error: video.error?.code,
        })) })));
      throw error;
    }
    await page.waitForTimeout(700);
    const video = await page.evaluate(() => {
      const video = window.__furyArcadeVideos.find(video => video.src.endsWith('/game-recordings/WaysideFury.mp4'));
      return { source: video.currentSrc, width: video.videoWidth, height: video.videoHeight, currentTime: video.currentTime,
        duration: video.duration, muted: video.muted, loop: video.loop, paints: window.__furyArcadeVideoPaints };
    });
    assert.ok(video.muted && video.loop, 'cabinet attract clip is muted and loops');
    await page.screenshot({ path: `${shots}/cabinet-${label}.png` });
    console.log(`${label}: local video playing on the cabinet`);
    await evaluateStartup(page, () => window.__furyMountIndex());
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
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${shots}/arcade-failure.png` }).catch(() => {});
    await writeFile(`${shots}/arcade-failure.txt`, await activePage.locator('body').innerText().catch(() => ''));
  }
  throw error;
} finally {
  await browser.close();
}
