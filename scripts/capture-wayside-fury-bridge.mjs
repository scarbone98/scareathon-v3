// Production render path, paused at native DPR; optional 3D shares Canvas in Blast.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const phase = process.argv[2] ?? 'after';
assert.ok(['before', 'after'].includes(phase));
const source = process.env.FURY_PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(source.startsWith('/') ? pathToFileURL(source).href : source);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
const output = new URL('../docs/wayside-fury-design/bridge/', import.meta.url);
await mkdir(output, { recursive: true });
const metrics = [];
try {
  for (const mode of ['2d', '3d']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, reducedMotion: 'reduce' });
    const base = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5221';
    await page.route(url => new URL(url).pathname === '/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
    await page.goto(`${base}/?gfx=${mode}`);
    await page.evaluate(async mode => {
      const [{ GraphicsRenderer }, world, sim] = await Promise.all([import('/src/pages/WaysideFury/game/graphics.ts'), import('/src/pages/WaysideFury/game/world.ts'), import('/src/pages/WaysideFury/game/sim.ts')]);
      document.body.style.cssText = 'margin:0;background:#191e29';
      const canvas = document.createElement('canvas'); canvas.style.cssText = 'width:390px;height:844px;display:block'; document.body.append(canvas);
      const renderer = new GraphicsRenderer(canvas, mode);
      await Promise.all([...renderer.flat.images.values()].map(i => i.decode().catch(() => {})));
      window.bridgeFixture = { renderer, world, sim, canvas };
    }, mode);
    for (const [name, room, x, y] of [['split-creek-broken', 1, 432, 128], ['split-creek-crossing', 1, 480, 272], ['ravine-bridge', 3, 352, 152], ['supply-dock', 9, 160, 316]]) {
      const result = await page.evaluate(({ room, x, y, phase }) => {
        const { renderer, sim, canvas } = window.bridgeFixture;
        const s = sim.newGame(); sim.enterScene(s, 'dungeon', room); Object.assign(s, { x, y, active: 'joe', enemies: [], sceneTimer: 10 });
        renderer.reset(); const flat = renderer.flat, order = [];
        const prop = flat.prop.bind(flat), hero = flat.hero.bind(flat);
        flat.prop = (p, ...args) => { order.push(p.kind); return prop(p, ...args); };
        flat.hero = (...args) => { order.push('hero'); return hero(...args); };
        const before = JSON.stringify(s); renderer.draw(s, 0, 0);
        flat.prop = prop; flat.hero = hero;
        if (before !== JSON.stringify(s)) throw Error('Rendering changed state');
        if (phase === 'after') for (const kind of ['bridge', 'broken-bridge', 'bridge-rail', 'loading-dock']) {
          if (order.includes(kind) && order.lastIndexOf(kind) > order.indexOf('hero')) throw Error(`${kind} obscures actor`);
        }
        return { requested: renderer.graphicsMode, active: canvas.dataset.renderer, order, width: canvas.width, height: canvas.height, x, y };
      }, { room, x, y, phase });
      assert.equal(result.active, '2d'); assert.equal(result.width, 1170); assert.equal(result.height, 2532);
      metrics.push({ name, mode, ...result });
      await page.screenshot({ path: new URL(`${phase}-${mode}-${name}.png`, output).pathname });
      console.log(`${phase} ${mode} ${name}`);
    }
    await page.close();
  }
  if (phase === 'after') for (const name of ['split-creek-broken', 'split-creek-crossing', 'ravine-bridge', 'supply-dock']) {
    const [flat, optional] = await Promise.all(['2d','3d'].map(mode => readFile(new URL(`${phase}-${mode}-${name}.png`,output))));
    assert.ok(flat.equals(optional), `${name}: optional 3D shares exactly the same Canvas surface/actor rendering`);
  }
  await writeFile(new URL(`${phase}-metrics.json`, output), JSON.stringify(metrics, null, 2));
} finally { await browser.close(); }
