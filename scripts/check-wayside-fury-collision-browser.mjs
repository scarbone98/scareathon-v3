// Requires a running Vite development server and Playwright with Chromium installed.
// FURY_BASE_URL=http://127.0.0.1:5185 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//   node scripts/check-wayside-fury-collision-browser.mjs
// Real keyboard movement at the requested phone viewport; DEV mutation only places
// the hero at a controlled, unobstructed start and removes unrelated enemies.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5185';
const shots = '/tmp/fury-collision-shots';
const moduleName = process.env.PLAYWRIGHT_MODULE;
console.log(`Starting Wayside Fury browser checks (PID ${process.pid})`);
let playwright;
try {
  playwright = await import(moduleName?.startsWith('/') ? pathToFileURL(moduleName).href : moduleName ?? 'playwright');
} catch {
  console.error('Wayside Fury collision checks need Playwright. Set PLAYWRIGHT_MODULE to its index.mjs and install its Chromium browser outside this worktree.');
  process.exit(1);
}
await mkdir(shots, { recursive: true });
const browser = await playwright.chromium.launch({ headless: process.env.FURY_HEADED !== '1',
  args: ['--mute-audio', '--disable-gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
console.log('Chromium launched');
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
await context.addInitScript(() => localStorage.setItem('wayside-fury-controls-dismissed', '1'));
const page = await context.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', error => { errors.push(error.message); console.error(`Browser error: ${error.message}`); });
page.on('requestfailed', request => console.error(`Request failed: ${request.url()} (${request.failure()?.errorText})`));
const results = [];

async function prepare({ scene, room = 0, kind, slide = false, canopy = false }) {
  return page.evaluate(async ({ scene, room, kind, slide, canopy }) => {
    const [{ getWorld, isBlocked }, { enterScene }] = await Promise.all([
      import('/src/pages/WaysideFury/game/world.ts'),
      import('/src/pages/WaysideFury/game/sim.ts'),
    ]);
    const world = getWorld(scene, room), radius = 7;
    const clearLine = (x1, y1, x2, y2) => {
      const pieces = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
      for (let n = 0; n <= pieces; n++) {
        const fraction = n / Math.max(1, pieces);
        if (isBlocked(world, x1 + (x2 - x1) * fraction, y1 + (y2 - y1) * fraction, radius)) return false;
      }
      return true;
    };
    let chosen;
    for (const prop of world.props.filter(prop => prop.kind === kind)) {
      if (prop.x < 48 || prop.y < 48 || prop.x + prop.w > world.width - 48 || prop.y + prop.h > world.height - 48) continue;
      for (const footprint of prop.footprints ?? []) {
        const above = kind === 'fence';
        const horizontal = kind === 'rock';
        const contactY = above ? footprint.y - radius : footprint.y + footprint.h + radius;
        const y = horizontal ? footprint.y + footprint.h / 2 : contactY + (above ? -1 : 1) * (slide ? 10 : 34);
        const contactX = footprint.x - radius;
        const fractions = above ? [0.5, 0.75, 0.25, 0.9, 0.1] : [slide ? 0.25 : 0.5];
        const fraction = horizontal ? 0.5 : fractions.find(value => clearLine(footprint.x + footprint.w * value, contactY + (above ? -0.1 : 0.1), footprint.x + footprint.w * value, y));
        if (fraction === undefined) continue;
        const x = horizontal ? contactX - 34 : footprint.x + footprint.w * fraction;
        if (horizontal && !clearLine(contactX - 0.1, y, x, y)) continue;
        if (slide && (footprint.w < 80 || !clearLine(x, contactY + 0.1, x + 40, contactY + 0.1))) continue;
        const canopyY = footprint.y - radius - 2;
        const canopyStart = prop.x - radius - 8, canopyEnd = prop.x + prop.w + radius + 8;
        if (canopy && (canopyY <= prop.y + 2 || !clearLine(canopyStart, canopyY, canopyEnd, canopyY))) continue;
        chosen = { prop, footprint, radius, start: canopy ? { x: canopyStart, y: canopyY } : { x, y },
          contactY, contactX, canopyEnd, scene, room, above, horizontal };
        break;
      }
      if (chosen) break;
    }
    if (!chosen) throw new Error(`No isolated ${kind} collision case in ${world.id}`);
    window.__waysideFury.mutate(state => {
      enterScene(state, scene, room);
      state.enemies = []; state.notice = ''; state.overlay = null;
      state.x = chosen.start.x; state.y = chosen.start.y;
      state.transitionCooldown = 100;
    });
    return chosen;
  }, { scene, room, kind, slide, canopy });
}

async function hold(keys, seconds) {
  await page.evaluate(async () => {
    const { getWorld, isBlocked } = await import('/src/pages/WaysideFury/game/world.ts');
    const trace = { running: true, started: window.__waysideFury.state.time, samples: [] };
    window.__waysideCollisionTrace = trace;
    const sample = () => {
      if (!trace.running) return;
      const state = window.__waysideFury.state;
      trace.samples.push({ x: state.x, y: state.y, time: state.time, dash: state.dashTimer,
        scene: state.scene, blocked: isBlocked(getWorld(state.scene, state.room), state.x, state.y, 7) });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  try {
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForFunction(seconds => window.__waysideFury.state.time - window.__waysideCollisionTrace.started >= seconds, seconds, { timeout: 15000 });
  } finally {
    for (const key of keys) await page.keyboard.up(key);
  }
  const trace = await page.evaluate(() => {
    const trace = window.__waysideCollisionTrace;
    trace.running = false;
    return { samples: trace.samples, final: { x: window.__waysideFury.state.x, y: window.__waysideFury.state.y }, elapsed: window.__waysideFury.state.time - trace.started };
  });
  assert.ok(trace.samples.length >= 12, `live animation frames were sampled: ${JSON.stringify(trace)}`);
  assert.ok(trace.elapsed >= seconds, 'the unpaused simulation advanced during keyboard movement');
  assert.ok(trace.samples.every(sample => !sample.blocked), `hero entered a solid footprint: ${JSON.stringify(trace)}`);
  return trace;
}

async function record(label, chosen, trace) {
  await page.waitForTimeout(160); // Let the camera and rendered hero settle at contact.
  await page.screenshot({ path: `${shots}/${label}.png` });
  results.push({ label, prop: chosen.prop, footprint: chosen.footprint, start: chosen.start, final: trace.final, frames: trace.samples.length, elapsed: trace.elapsed });
  console.log(`${label}: ${trace.samples.length} live frames, (${chosen.start.x.toFixed(1)}, ${chosen.start.y.toFixed(1)}) → (${trace.final.x.toFixed(1)}, ${trace.final.y.toFixed(1)})`);
}

async function contact(label, spec, dash = false) {
  const chosen = await prepare(spec);
  const key = chosen.horizontal ? 'd' : chosen.above ? 's' : 'w';
  const trace = await hold(dash ? [key, 'l'] : [key], 1.1);
  const axis = chosen.horizontal ? 'x' : 'y';
  const approach = chosen.horizontal || chosen.above ? 1 : -1;
  assert.ok((trace.final[axis] - chosen.start[axis]) * approach > 20, `${label}: keyboard moved the hero toward the prop`);
  const remaining = ((chosen.horizontal ? chosen.contactX : chosen.contactY) - trace.final[axis]) * approach;
  assert.ok(remaining >= -0.001 && remaining <= 2,
    `${label}: hero stopped at the prop base: ${JSON.stringify({ chosen, trace })}`);
  const tail = trace.samples.filter(sample => sample.time >= trace.samples.at(-1).time - 0.25);
  assert.ok(tail.length >= 2, `${label}: stationary contact sampled across multiple live frames`);
  assert.ok(Math.max(...tail.map(sample => sample[axis])) - Math.min(...tail.map(sample => sample[axis])) < 0.01, `${label}: hero remains stopped while movement is held`);
  if (dash) assert.ok(trace.samples.some(sample => sample.dash > 0), `${label}: actual combat dash was observed`);
  await record(label, chosen, trace);
}

try {
  console.log(`Loading Wayside Fury collision preview: ${baseUrl}`);
  await page.goto(new URL('/wayside-fury', baseUrl).href, { waitUntil: 'commit', timeout: 120000 });
  console.log('Preview navigation committed; waiting for actual game controller');
  await page.waitForFunction(() => !!window.__waysideFury && !!document.querySelector('.wf-stage canvas')?.dataset.pixelScale, null, { timeout: 120000 });
  console.log('Wayside Fury controller and renderer ready');
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  assert.deepEqual(viewport, { width: 390, height: 844, dpr: 3 }, 'requested phone viewport is active');
  const animation = await page.evaluate(() => new Promise(resolve => {
    let frames = 0, running = true;
    const frame = () => { if (!running) return; frames++; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    setTimeout(() => {
      running = false;
      const bounds = selector => {
        const element = document.querySelector(selector), style = element && getComputedStyle(element), box = element?.getBoundingClientRect();
        return box && { x: box.x, y: box.y, width: box.width, height: box.height, display: style.display, visibility: style.visibility };
      };
      resolve({ frames, visible: document.visibilityState, ready: document.readyState,
        shell: bounds('.wf-shell'), menu: bounds('.wf-menu'), button: bounds('.wf-primary') });
    }, 1000);
  }));
  console.log(`Animation readiness: ${JSON.stringify(animation)}`);
  await page.waitForFunction(() => {
    const button = document.querySelector('.wf-primary'), rect = button?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0;
  });
  await page.getByRole('button', { name: /Begin adventure|Continue adventure/ }).click();
  console.log('Adventure started');
  await page.getByRole('button', { name: 'Skip prologue' }).click();
  console.log('Prologue skipped; live keyboard collision checks beginning');
  await contact('tree-walk', { scene: 'hub', kind: 'tree' });
  await contact('rock-walk', { scene: 'dungeon', room: 0, kind: 'rock' });
  await contact('fence-walk', { scene: 'hub', kind: 'fence' });
  await contact('building-walk', { scene: 'hub', kind: 'shop' });
  await contact('rock-dash', { scene: 'dungeon', room: 0, kind: 'rock' }, true);
  await contact('fence-dash', { scene: 'dungeon', room: 2, kind: 'fence' }, true);
  await contact('building-dash', { scene: 'dungeon', room: 2, kind: 'shed' }, true);

  const slide = await prepare({ scene: 'hub', kind: 'shop', slide: true });
  const slideTrace = await hold(['w', 'd'], 0.9);
  assert.ok(slideTrace.final.x > slide.start.x + 25, 'diagonal movement slides horizontally along the building base');
  assert.ok(slideTrace.final.y >= slide.contactY - 0.001 && slideTrace.final.y <= slide.contactY + 2, 'diagonal movement stops only the blocked axis');
  await record('building-diagonal-slide', slide, slideTrace);

  const canopy = await prepare({ scene: 'hub', kind: 'tree', canopy: true });
  const canopyTrace = await hold(['d'], (canopy.canopyEnd - canopy.start.x) / 70 + 0.25);
  assert.ok(canopyTrace.final.x >= canopy.canopyEnd - 1, 'hero walks behind the tree canopy above the solid trunk');
  assert.ok(Math.abs(canopyTrace.final.y - canopy.start.y) < 0.01, 'canopy crossing stays on its unobstructed line');
  await record('tree-canopy-walk', canopy, canopyTrace);
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  await writeFile(`${shots}/results.json`, `${JSON.stringify({ viewport, results }, null, 2)}\n`);
  console.log(`Wayside Fury live collision checks pass. Screenshots and measurements: ${shots}/`);
} catch (error) {
  await page.screenshot({ path: `${shots}/failure.png`, timeout: 10000 }).catch(() => {});
  if (errors.length) console.error(`Browser errors: ${errors.join('\n')}`);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
