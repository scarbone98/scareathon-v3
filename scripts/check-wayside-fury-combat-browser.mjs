import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const wrapper = process.env.PLAYWRIGHT_MODULE ?? new URL('./wayside-fury-muted-playwright.mjs', import.meta.url).href;
const { chromium } = await import(wrapper.startsWith('/') ? pathToFileURL(wrapper).href : wrapper);
const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
const base = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5197';
try {
  for (const gfx of ['2d', '3d']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/wayside-fury?chapter=3&gfx=${gfx}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__waysideFury);
    await page.getByRole('button', { name: /Begin adventure|Continue adventure/ }).click();
    await page.waitForFunction(() => window.__waysideFury.state.mapId === 'space-launch');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('radio', { name: 'Hard', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__waysideFury.state.difficulty), 'hard');
    const results = await page.evaluate(async () => {
      const { GameInput, showAttackPresentation } = await import('/src/pages/WaysideFury/game/input.ts');
      const { newGame, addEnemy, activeHero, step, idleInput, enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
      const game = window.__waysideFury; game.setPaused(true);
      const results = [];
      for (const mode of ['keyboard', 'touch', 'gamepad']) {
        const input = new GameInput(() => {}, () => {}, () => false, () => {});
        showAttackPresentation({ action: 'attack' });
        const s = newGame(); s.enemies = []; s.x = 120; s.y = 110;
        const e = addEnemy(s, 'grunt', 145, 110); e.hp = e.maxHp = 10000; e.speed = 0; e.cooldown = 100;
        let pressed = true;
        const originalPad = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
        if (mode === 'keyboard') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }));
        if (mode === 'touch') input.setTouch({ attack: true });
        if (mode === 'gamepad') Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ connected: true, mapping: 'standard', axes: [0, 0], buttons: Array.from({ length: 16 }, (_, n) => ({ pressed: n === 0 && pressed, value: n === 0 && pressed ? 1 : 0 })) }] });
        for (let n = 0; n < 65; n++) { step(s, input.read(), 1 / 60); input.consume(); }
        const charged = s.meleeCharge, hp = e.hp;
        e.x = s.x + 25; e.y = s.y;
        if (mode === 'keyboard') window.dispatchEvent(new KeyboardEvent('keyup', { key: 'j' }));
        if (mode === 'touch') input.setTouch({ attack: false });
        pressed = false; step(s, input.read(), 1 / 60); input.consume();
        results.push({ mode, charged, damage: hp - e.hp, power: activeHero(s).power });
        input.dispose();
        if (mode === 'gamepad') { if (originalPad) Object.defineProperty(navigator, 'getGamepads', originalPad); else delete navigator.getGamepads; }
      }
      // Pausing cancels the charge without generating a release attack.
      game.mutate(s => { enterScene(s, 'test'); s.meleeHolding = true; s.meleeCharge = 1; });
      game.setPaused(false); game.setPaused(true);
      results.push({ pausedCharge: game.state.meleeCharge, pausedHolding: game.state.meleeHolding });
      for (const mapId of ['blast-7', 'moon-m08']) {
        game.mutate(s => { enterScene(s, 'dungeon', 0, mapId); const e = s.enemies.find(e => e.kind === 'boss'); e.burst = .65; e.windup = .65; e.escapeIframes = .95; });
        game.renderer.draw(game.state, 0, 0);
        const before = JSON.stringify(game.state);
        for (let n = 0; n < 8; n++) game.renderer.draw(game.state, 0, 0);
        const canvas = document.querySelector('canvas[aria-label="Wayside Fury action RPG"]'), box = canvas.getBoundingClientRect();
        results.push({ mapId, gfx: canvas.dataset.gfx, immutable: JSON.stringify(game.state) === before, native: Math.abs(canvas.width - box.width * devicePixelRatio) <= 1 && Math.abs(canvas.height - box.height * devicePixelRatio) <= 1 });
      }
      // A context interaction press must never arm a melee release.
      const safe = newGame(); enterScene(safe, 'hub'); step(safe, { ...idleInput(), attack: true }, 1 / 60);
      results.push({ safeHolding: safe.meleeHolding });
      return results;
    });
    for (const result of results) {
      if (result.mode) { assert.ok(result.charged >= .6, `${gfx}/${result.mode} hold`); assert.ok(result.damage >= result.power * 2.7, `${gfx}/${result.mode} release`); }
      if (result.mapId) { assert.ok(result.immutable); assert.ok(result.native); }
      if ('pausedCharge' in result) { assert.equal(result.pausedCharge, 0); assert.equal(result.pausedHolding, false); }
      if ('safeHolding' in result) assert.equal(result.safeHolding, false);
    }
    assert.deepEqual(errors, []); console.log(gfx, results);
    await context.close();
  }
} finally { await browser.close(); }
