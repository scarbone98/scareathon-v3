// Run against the Vite DEV server (the inspection API is absent from builds).
// FURY_BASE_URL=http://127.0.0.1:5185 PLAYWRIGHT_MODULE=/tmp/fury-playwright-metal.mjs \
//   node scripts/check-wayside-fury-items-browser.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5185';
const output = process.env.FURY_ITEMS_SHOTS ?? '/tmp/fury-update1-shots';
const moduleName = process.env.PLAYWRIGHT_MODULE;
const browserName = process.env.PLAYWRIGHT_BROWSER ?? 'chromium';
const timeout = Number(process.env.FURY_READY_TIMEOUT ?? 900000);
let playwright;
try { playwright = await import(moduleName?.startsWith('/') ? pathToFileURL(moduleName).href : moduleName ?? 'playwright'); }
catch { throw new Error('Wayside Fury item checks need Playwright. Set PLAYWRIGHT_MODULE to its external index.mjs and install its browser.'); }
assert.ok(playwright[browserName], `Unknown Playwright browser: ${browserName}`);
const extraArgs = JSON.parse(process.env.PLAYWRIGHT_ARGS ?? '[]');
assert.ok(Array.isArray(extraArgs) && extraArgs.every(value => typeof value === 'string'), 'PLAYWRIGHT_ARGS must be a JSON array of browser flags');
const browser = await playwright[browserName].launch({ headless: browserName === 'webkit' || process.env.PLAYWRIGHT_HEADLESS !== 'false', timeout,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
  args: [...(browserName === 'chromium' ? ['--mute-audio'] : []), ...extraArgs] });
const sizes = [{ name: 'portrait', width: 390, height: 844, dpr: 3 }, { name: 'desktop', width: 1440, height: 900, dpr: 2 }];
const errors = [], results = [], radarMarkup = new Map();
await mkdir(output, { recursive: true });

async function activate(locator, size) { if (size.name === 'portrait') await locator.tap(); else await locator.click(); }
async function boot(page, size, mode, reload = false) {
  let rejectStartup;
  const failed = new Promise((_, reject) => { rejectStartup = reject; });
  const startupError = error => rejectStartup(new Error(`Wayside Fury startup failed: ${error.message}`, { cause: error }));
  page.on('pageerror', startupError);
  try {
    await Promise.race([failed, (async () => {
      if (reload) await page.reload({ waitUntil: 'commit' });
      else await page.goto(new URL(`/wayside-fury${mode === '3d' ? '?gfx=3d' : ''}`, baseUrl).href, { waitUntil: 'commit' });
      console.log(`Items ${size.name}/${mode}: ${reload ? 'reload' : 'initial'} document committed; awaiting game initialization`);
      await page.waitForFunction(() => !!window.__waysideFury && document.querySelector('.wf-primary') && !document.querySelector('.wf-primary').disabled,
        null, { timeout });
      console.log(`Items ${size.name}/${mode}: controller and save ready`);
    })()]);
  } finally { page.off('pageerror', startupError); }
  await activate(page.getByRole('button', { name: /Begin adventure|Continue adventure/ }), size);
  await page.waitForFunction(() => !document.querySelector('.wf-primary') && window.__waysideFury.state.scene !== 'test');
  assert.equal(await page.evaluate(() => window.__waysideFury.graphicsMode), mode, 'selected graphics mode matches the URL');
}
async function atHub(page, position) {
  await page.evaluate(async position => {
    const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
    window.__waysideFury.setTouch({});
    window.__waysideFury.mutate(state => { enterScene(state, 'hub'); Object.assign(state, position); state.notice = ''; });
  }, position);
}
async function character(page, size) {
  await activate(page.getByRole('button', { name: 'Pause', exact: true }), size);
  await activate(page.getByRole('button', { name: 'Character', exact: true }), size);
  await page.locator('.wf-character').waitFor({ state: 'visible' });
}
async function resume(page, size) {
  await activate(page.getByRole('button', { name: 'Back to pause', exact: true }), size);
  await activate(page.getByRole('button', { name: 'Resume', exact: true }), size);
  await page.locator('.wf-character').waitFor({ state: 'hidden' });
}
async function stateItems(page) { return page.evaluate(() => structuredClone(window.__waysideFury.state.u1.items)); }
async function deviceItems(page) {
  return page.evaluate(async () => {
    const { readSave } = await import('/src/pages/WaysideFury/game/save.ts');
    return readSave()?.u1?.items ?? null;
  });
}
async function snapshot(page, size, mode, name) {
  await page.waitForTimeout(240);
  assert.equal((await page.locator('body').innerText()).includes('[Interact]'), false, 'the HUD never exposes a literal Interact placeholder');
  await page.screenshot({ path: join(output, `items-${size.name}-${mode}-${name}.png`) });
}
async function radarLayout(page, size) {
  const layout = await page.evaluate(() => {
    const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const visible = node => { const style = getComputedStyle(node); return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > .1; };
    const radar = document.querySelector('.wf-radar-toggle'), rect = radar.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const canvas = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
    return { radar: box(radar), reachable: radar.contains(hit), dpr: devicePixelRatio,
      canvas: { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, dpr: Number(canvas.dataset.renderDpr) },
      prompts: [...document.querySelectorAll('.wf-interact-prompt, .wf-notice, .wf-party-hud, .wf-save-in-game')].filter(visible).map(box) };
  });
  assert.equal(layout.dpr, size.dpr);
  assert.ok(layout.radar.x >= 0 && layout.radar.y >= 0 && layout.radar.x + layout.radar.width <= size.width + 1 && layout.radar.y + layout.radar.height <= size.height + 1, 'radar remains inside the viewport');
  assert.ok(layout.radar.height >= 44 && layout.reachable, 'radar is a reachable touch target');
  for (const prompt of layout.prompts) {
    const a = layout.radar, b = prompt;
    assert.equal(a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1, false, 'radar does not cover prompts or party status');
  }
  assert.ok(Math.abs(layout.canvas.width - layout.canvas.cssWidth * layout.canvas.dpr) <= 2, 'canvas width follows native render DPR');
  assert.ok(Math.abs(layout.canvas.height - layout.canvas.cssHeight * layout.canvas.dpr) <= 2, 'canvas height follows native render DPR');
  return layout;
}

async function check(page, size, mode) {
  await boot(page, size, mode);
  console.log(`Items ${size.name}/${mode}: game ready; checking chip collection and loadout`);
  const registryFixture = await page.evaluate(async () => {
    const { registryRadarTargets } = await import('/src/pages/WaysideFury/game/u1/items/hiddenRadar.ts');
    const state = { ...window.__waysideFury.state, scene: 'dungeon', room: 2, foundItems: ['already-found'] };
    let receivedPersonalState = false;
    const registry = { availablePickups: personal => {
      receivedPersonalState = personal === state;
      return [
        { id: 'current-find', name: 'A side find', scene: 'dungeon', room: 2, x: 200, y: 160 },
        { id: 'already-found', name: 'Found', scene: 'dungeon', room: 2, x: 201, y: 160 },
        { id: 'other-room', name: 'Another room', scene: 'dungeon', room: 3, x: 202, y: 160 },
        { id: 'other-scene', name: 'Another scene', scene: 'realm', room: 2, x: 203, y: 160 },
        { id: 'invalid-x', name: 'Invalid', scene: 'dungeon', room: 2, x: NaN, y: 160 },
        { id: 'invalid-y', name: 'Invalid', scene: 'dungeon', room: 2, x: 204, y: Infinity },
      ].filter(pickup => !personal.foundItems.includes(pickup.id));
    } };
    return { targets: registryRadarTargets(state, registry), missingRegistry: registryRadarTargets(state), receivedPersonalState };
  });
  assert.equal(registryFixture.receivedPersonalState, true, 'JOB E registry receives this player\'s state');
  assert.deepEqual(registryFixture.missingRegistry, [], 'an absent JOB E module is a harmless stub');
  assert.deepEqual(registryFixture.targets, [{ id: 'current-find', name: 'A side find', scene: 'dungeon', room: 2, x: 200, y: 160, kind: 'hidden' }], 'JOB E adapter accepts only available unfound pickups in this room with finite coordinates');
  await atHub(page, { x: 546, y: 208, faceX: 1, faceY: 0 });
  await snapshot(page, size, mode, 'hub');
  await activate(page.locator('.wf-interact-prompt').filter({ hasText: 'Collect Scanner' }), size);
  await page.waitForFunction(() => window.__waysideFury.state.u1.items.chips.owned.includes('scanner'));
  console.log(`Items ${size.name}/${mode}: Scanner collected; opening character sheet`);
  await character(page, size);
  console.log(`Items ${size.name}/${mode}: character sheet ready`);
  assert.equal(await page.locator('#wf-chip-slot-1').isDisabled(), true, 'slot 2 locks before level 3');
  assert.equal(await page.locator('#wf-chip-slot-2').isDisabled(), true, 'slot 3 locks before level 6');
  await activate(page.getByRole('button', { name: 'Equip Scanner in slot 1', exact: true }), size);
  assert.equal((await stateItems(page)).chips.equipped[0], 'scanner');
  await page.evaluate(async () => {
    const { grantChip } = await import('/src/pages/WaysideFury/game/u1/items/chips.ts');
    window.__waysideFury.mutate(state => { state.character.level = 3; grantChip(state, 'ki-coil', 'browser slot-unlock fixture'); });
  });
  assert.equal(await page.locator('#wf-chip-slot-1').isDisabled(), false, 'slot 2 unlocks at level 3');
  assert.equal(await page.locator('#wf-chip-slot-2').isDisabled(), true, 'slot 3 still locks at level 3');
  await activate(page.getByRole('button', { name: 'Equip Ki Coil in slot 2', exact: true }), size);
  await page.evaluate(async () => {
    const { grantChip } = await import('/src/pages/WaysideFury/game/u1/items/chips.ts');
    window.__waysideFury.mutate(state => { state.character.level = 6; grantChip(state, 'iron-guard', 'browser slot-unlock fixture'); });
  });
  assert.equal(await page.locator('#wf-chip-slot-2').isDisabled(), false, 'slot 3 unlocks at level 6');
  await activate(page.getByRole('button', { name: 'Equip Iron Guard in slot 3', exact: true }), size);
  assert.deepEqual((await stateItems(page)).chips.equipped, ['scanner', 'ki-coil', 'iron-guard']);
  await page.locator('#wf-chips-title').scrollIntoViewIfNeeded();
  await snapshot(page, size, mode, 'library');
  await resume(page, size);
  console.log(`Items ${size.name}/${mode}: chip loadout passed; checking relic and wish`);

  const crest = await page.evaluate(async () => {
    const { relicTargets } = await import('/src/pages/WaysideFury/game/u1/items/relics.ts');
    const target = relicTargets(window.__waysideFury.state).find(target => target.id === 'station-crest');
    if (!target) throw new Error('Station Crest did not spawn');
    window.__waysideFury.mutate(state => { state.x = target.x - 14; state.y = target.y; state.faceX = 1; state.faceY = 0; state.notice = ''; });
    return target.id;
  });
  await activate(page.locator('.wf-interact-prompt').filter({ hasText: 'Collect Station Crest' }), size);
  assert.ok((await stateItems(page)).relics.collected.includes(crest));
  console.log(`Items ${size.name}/${mode}: Station Crest collected; checking altar choices`);
  await character(page, size);
  assert.equal(await page.locator('.wf-relic-list li.is-future').count(), 0, 'all seven relics are available in the current campaign');
  assert.equal(await page.getByRole('button', { name: /Lasting strength/ }).isDisabled(), true, 'one relic cannot summon a wish');
  // The headless checks collect every real campaign placement. Supply a full
  // set here to exercise the altar UI once, then let it scatter normally.
  await page.evaluate(async () => {
    const { RELICS, RELIC_SUMMON } = await import('/src/pages/WaysideFury/game/u1/items/relics.ts');
    window.__waysideFury.mutate(state => { state.u1.items.relics.collected = RELICS.map(relic => relic.id); state.x = RELIC_SUMMON.x; state.y = RELIC_SUMMON.y; });
  });
  const wish = page.getByRole('button', { name: /Lasting strength/ });
  assert.equal(await wish.isDisabled(), false, 'the full set resonates at the altar');
  console.log(`Items ${size.name}/${mode}: full-set fixture resonates; choosing one strength wish`);
  await wish.scrollIntoViewIfNeeded();
  await snapshot(page, size, mode, 'wish');
  await activate(wish, size);
  const wished = (await stateItems(page)).relics;
  assert.equal(wished.cycle, 1); assert.equal(wished.statBonus.power, 2); assert.equal(wished.wishes.length, 1);
  assert.deepEqual(wished.collected, [], 'one wish scatters all seven relics');
  assert.equal(await page.getByRole('button', { name: /Lasting protection/ }).isDisabled(), true, 'the next rotating wish needs a new full set');
  await resume(page, size);
  console.log(`Items ${size.name}/${mode}: single wish and scatter passed; checking radar and persistence`);

  await atHub(page, { x: 448, y: 370, faceX: 0, faceY: 1 });
  await activate(page.locator('.wf-interact-prompt').filter({ hasText: 'Collect Relic Radar' }), size);
  await page.locator('.wf-radar-toggle').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.wf-radar-toggle').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.wf-radar-text').innerText(), /E · \d+ steps/);
  const layout = await radarLayout(page, size);
  const markup = await page.locator('.wf-items-hud').innerHTML();
  if (radarMarkup.has(size.name)) assert.equal(markup, radarMarkup.get(size.name), '2D and opt-in 3D share the same radar HUD');
  else radarMarkup.set(size.name, markup);
  await snapshot(page, size, mode, 'radar');
  await activate(page.locator('.wf-radar-toggle'), size);
  assert.equal(await page.locator('.wf-radar-toggle').getAttribute('aria-pressed'), 'false');
  await page.waitForFunction(async () => {
    const { readSave } = await import('/src/pages/WaysideFury/game/save.ts');
    return readSave()?.u1?.items?.radar?.enabled === false;
  });
  const saved = await deviceItems(page);
  assert.deepEqual(saved.chips.equipped, ['scanner', 'ki-coil', 'iron-guard']);
  assert.equal(saved.relics.cycle, 1); assert.equal(saved.relics.statBonus.power, 2);
  assert.deepEqual(saved.radar, { owned: true, enabled: false });
  await boot(page, size, mode, true);
  console.log(`Items ${size.name}/${mode}: device save reloaded; checking shared taxi HUD`);
  const restored = await stateItems(page);
  assert.deepEqual(restored.chips.equipped, saved.chips.equipped);
  assert.deepEqual(restored.relics, saved.relics);
  assert.deepEqual(restored.radar, saved.radar, 'device reload preserves the disabled radar');
  await activate(page.locator('.wf-radar-toggle'), size);
  assert.equal(await page.locator('.wf-radar-toggle').getAttribute('aria-pressed'), 'true', 'the saved off state remains toggleable');
  await page.evaluate(async () => {
    const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
    window.__waysideFury.setTouch({});
    window.__waysideFury.mutate(state => { enterScene(state, 'overworld'); state.x = 752; state.y = 480; state.notice = ''; });
  });
  await page.waitForFunction(mode => {
    const canvas = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
    if (mode === '3d' && canvas?.dataset.gfxStatus === 'fallback') throw new Error(`3D failed: ${canvas.dataset.gfxError || 'unknown renderer error'}`);
    return canvas?.dataset.gfx === mode;
  }, mode);
  if (mode === '3d') await page.waitForFunction(() => Number(document.querySelector('.wf-canvas-3d')?.dataset.triangles) > 0);
  assert.equal(await page.locator('.wf-items-hud').count(), 1, 'only one shared DOM radar accompanies the taxi');
  assert.match(await page.locator('.wf-radar-text').innerText(), /No signal/, 'the taxi radar reveals no relic from a different area');
  await snapshot(page, size, mode, 'taxi');
  results.push({ viewport: size.name, graphics: mode, layout, saved: { chips: saved.chips.equipped, cycle: saved.relics.cycle, statBonus: saved.relics.statBonus, radar: saved.radar } });
}

try {
  for (const mode of ['2d', '3d']) for (const size of sizes) {
    console.log(`Checking Wayside Fury items: ${size.name} ${size.width}x${size.height} DPR${size.dpr}, ${mode}`);
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr,
      hasTouch: size.name === 'portrait', isMobile: size.name === 'portrait' });
    if (browserName === 'webkit') 
    context.setDefaultTimeout(180000); context.setDefaultNavigationTimeout(timeout);
    const page = await context.newPage();
    page.on('pageerror', error => { const message = `${size.name}/${mode}: ${error.message}`; errors.push(message); console.error(`Items runtime error: ${message}`); });
    try { await check(page, size, mode); }
    catch (error) {
      await page.screenshot({ path: join(output, `items-${size.name}-${mode}-failure.png`) }).catch(() => {});
      console.error(`Items browser check failed (${size.name}, ${mode}):`, await page.evaluate(() => ({
        text: document.body.innerText, scene: window.__waysideFury?.state.scene, items: window.__waysideFury?.state.u1?.items,
        canvas: [...document.querySelectorAll('canvas')].map(canvas => ({ ...canvas.dataset })) })).catch(() => null));
      throw error;
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, [], 'item flows emitted no browser runtime errors');
  await writeFile(join(output, 'items-measurements.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Wayside Fury item browser checks passed in 2D and 3D on native-DPR phone and desktop. Screenshots: ${output}`);
} finally { await browser.close(); }
