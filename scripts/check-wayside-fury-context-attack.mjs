// Run against Vite: FURY_BASE_URL=http://127.0.0.1:5185 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check-wayside-fury-context-attack.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5185';
const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const playwright = await import(modulePath.startsWith('/') ? pathToFileURL(modulePath).href : modulePath);
const browserName = process.env.PLAYWRIGHT_BROWSER ?? 'chromium';
assert.ok(playwright[browserName], `Unknown Playwright browser: ${browserName}`);
const browser = await playwright[browserName].launch({ headless: true,
  ...(browserName === 'chromium' ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {}) });
const shots = '/tmp/fury-context-shots';
await mkdir(shots, { recursive: true });
const results = [];

async function walk(page, input, reached, touch) {
  const keys = [input.x > 0 ? 'd' : input.x < 0 ? 'a' : null, input.y > 0 ? 's' : input.y < 0 ? 'w' : null].filter(Boolean);
  if (touch) await page.evaluate(input => window.__waysideFury.setTouch(input), input);
  else for (const key of keys) await page.keyboard.down(key);
  try { await page.waitForFunction(reached, null, { timeout: 15000 }); }
  finally {
    if (touch) await page.evaluate(() => window.__waysideFury.setTouch({ x: 0, y: 0 }));
    else for (const key of keys) await page.keyboard.up(key);
  }
  await page.waitForTimeout(280);
}
async function press(page, phone) {
  if (!phone) { await page.keyboard.press('j'); return; }
  const button = page.locator('.wf-attack');
  const box = await button.boundingBox();
  assert.ok(box, 'context Attack button is visible');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
async function prepare(page, scene, room, x, y, phone) {
  await page.evaluate(async ({ scene, room, x, y, phone }) => {
    const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
    const game = window.__waysideFury;
    if (phone) game.setTouch({ x: 0, y: 0, attack: false, interact: false });
    game.mutate(s => { enterScene(s, scene, room); s.enemies = []; s.notice = ''; s.x = x; s.y = y; s.transitionCooldown = 100; });
    game.setPaused(false);
  }, { scene, room, x, y, phone });
}

try {
  for (const phone of [true, false]) for (const graphics of ['2d', '3d']) {
    const label = `${phone ? 'phone' : 'desktop'}-${graphics}`;
    const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: phone ? 3 : 2, hasTouch: phone, isMobile: phone });
    context.setDefaultTimeout(120000);
    await context.addInitScript(() => { localStorage.clear(); localStorage.setItem('wayside-fury-controls-dismissed', '1'); });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      console.log(`${label}: loading preview`);
      await page.goto(`${base}/wayside-fury${graphics === '3d' ? '?gfx=3d' : ''}`, { waitUntil: 'commit', timeout: 120000 });
      await page.waitForFunction(() => window.__waysideFury && !document.querySelector('.wf-primary')?.disabled, null, { timeout: 120000 });
      await page.getByRole('button', { name: 'Begin adventure', exact: true }).click();
      await page.getByRole('button', { name: 'Skip prologue' }).click();
      console.log(`${label}: approaching NPC`);
      await prepare(page, 'dungeon', 8, 152, 204, phone);
      await walk(page, { y: -1 }, () => window.__waysideFury.state.y < 174, phone);
      await page.waitForFunction(() => document.querySelector('.wf-attack')?.getAttribute('aria-label') === 'Talk to Stranded scout' || document.querySelector('.wf-interact-prompt')?.textContent.includes('Stranded scout'));
      await page.screenshot({ path: `${shots}/${label}-talk.png` });
      await press(page, phone);
      await page.locator('.wf-dialogue').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => window.__waysideFury.state.attackTimer), 0, 'talk never also swings');
      await page.screenshot({ path: `${shots}/${label}-dialog.png` });
      // Next/Continue uses the same action until the conversation closes.
      for (let beat = 0; beat < 6 && await page.locator('.wf-dialogue').isVisible(); beat++) {
        await page.waitForTimeout(280); await press(page, phone); await page.waitForTimeout(200);
      }
      assert.equal(await page.locator('.wf-dialogue').isVisible(), false, 'Attack advances and closes the conversation');
      await walk(page, { y: 1 }, () => window.__waysideFury.state.y > 207, phone);
      await page.waitForFunction(() => window.__waysideFury.state.contextAttack?.displayed.action === 'attack');
      await press(page, phone);
      await page.waitForFunction(() => window.__waysideFury.state.combo === 1);
      await page.screenshot({ path: `${shots}/${label}-swing.png` });
      console.log(`${label}: talk, dialog and swing pass`);

      await prepare(page, 'overworld', 0, 378, 480, phone);
      await page.evaluate(() => {
        const game = window.__waysideFury; game.setPaused(true);
        game.mutate(s => { s.ambientTaxiWrecked = false; s.ambientTaxiGag = -1; });
      });
      await page.waitForFunction(graphics => {
        const canvas = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
        if (graphics === '3d' && canvas?.dataset.gfxStatus === 'fallback') throw Error(canvas.dataset.gfxError);
        return canvas?.dataset.gfx === graphics;
      }, graphics, { timeout: 120000 });
      await page.screenshot({ path: `${shots}/${label}-overworld-before.png` });
      const hp = await page.evaluate(() => window.__waysideFury.state.heroes.you.hp);
      await page.evaluate(() => window.__waysideFury.setPaused(false));
      await walk(page, { x: 1 }, () => window.__waysideFury.state.x > 418, phone);
      await page.waitForFunction(() => window.__waysideFury.state.ambientTaxiWrecked && window.__waysideFury.state.ambientTaxiGag >= 2);
      assert.equal(await page.evaluate(() => window.__waysideFury.state.heroes.you.hp), hp, 'stray rock never damages the player');
      await page.screenshot({ path: `${shots}/${label}-overworld-after.png` });
      console.log(`${label}: taxi gag pass`);

      const pickup = await page.evaluate(async () => {
        const { availablePickups } = await import('/src/pages/WaysideFury/game/collectibles.ts');
        const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
        const { getWorld, isBlocked } = await import('/src/pages/WaysideFury/game/world.ts');
        const game = window.__waysideFury;
        let chosen;
        game.mutate(s => {
          enterScene(s, 'hub'); s.enemies = []; s.notice = '';
          const world = getWorld(s.scene, s.room);
          chosen = availablePickups(s).find(item => !isBlocked(world, item.x, item.y + 22, 7));
          if (!chosen) throw Error('No reachable hidden pickup in hub');
          s.x = chosen.x; s.y = chosen.y + 22;
        });
        return { id: chosen.id, name: chosen.name };
      });
      await page.waitForTimeout(450);
      await press(page, phone);
      await page.waitForFunction(id => window.__waysideFury.state.foundItems.includes(id), pickup.id);
      await page.screenshot({ path: `${shots}/${label}-pickup.png` });
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.getByRole('button', { name: 'Collection', exact: true }).click();
      await page.getByRole('dialog', { name: 'Collection' }).waitFor({ state: 'visible' });
      assert.ok(await page.getByRole('dialog', { name: 'Collection' }).textContent(), 'Collection renders found totals and silhouettes');
      await page.screenshot({ path: `${shots}/${label}-collection.png` });
      assert.deepEqual(errors, [], `${label}: no browser errors`);
      results.push({ label, pickup, rockSafe: true, talkAndSwing: true });
    } catch (error) {
      console.error(`${label}: ${error.message}; browser errors: ${errors.join('; ')}`);
      await page.screenshot({ path: `${shots}/${label}-failure.png` }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  await writeFile(`${shots}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`Wayside Fury context Attack, dialog, dressing, safe taxi gag and Collection pass. Screenshots: ${shots}/`);
} finally { await browser.close(); }
