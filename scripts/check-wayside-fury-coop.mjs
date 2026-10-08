// FURY_BASE_URL=http://127.0.0.1:5185 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check-wayside-fury-coop.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { startFuryTestServer } from './fury-coop-test-server.mjs';
const base = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5185';
const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const playwright = await import(modulePath.startsWith('/') ? pathToFileURL(modulePath).href : modulePath);
const browserName = process.env.PLAYWRIGHT_BROWSER ?? 'chromium';
assert.ok(['chromium', 'webkit', 'firefox'].includes(browserName), `Unsupported browser: ${browserName}`);
const fixture = await startFuryTestServer(Number(process.env.FURY_TEST_PORT ?? 3000));
const browser = await playwright[browserName].launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
const errors = [];
const session = id => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: id, exp: 4_000_000_000, role: 'authenticated', aud: 'authenticated' })).toString('base64url');
  return { access_token: `${header}.${payload}.fixture`, refresh_token: 'fixture', expires_at: 4_000_000_000, expires_in: 3600,
    token_type: 'bearer', user: { id, aud: 'authenticated', role: 'authenticated', email: `${id}@example.invalid`, app_metadata: {}, user_metadata: {}, created_at: '2026-10-07T00:00:00Z' } };
};
async function player(id) {
  const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: Number(process.env.FURY_TEST_DPR ?? 3), hasTouch: true });
  await context.addInitScript(({ value }) => {
    localStorage.setItem('sb-wayside-fury-local-auth-token', JSON.stringify(value));
    localStorage.setItem('wayside-fury-controls-dismissed', '1');
  }, { value: session(id) });
  await context.route('https://**/*', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  // Keep synthetic portrait storage local, including WebKit's upload preflight.
  await context.route('http://wayside-fury-local.test/**', async route => {
    const request = route.request();
    const headers = { 'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, POST, PUT, OPTIONS',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const key = new URL(request.url()).pathname.match(/^\/storage\/v1\/object\/(?:public\/)?avatar-composites\/([^/]+\.png)$/)?.[1];
    if (key && ['POST', 'PUT'].includes(request.method())) {
      // Native WebKit omits Blob bytes from intercepted multipart requests.
      // The game still composes both real account looks from /user/avatar.
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ Key: `avatar-composites/${key}` }) });
    }
    return route.fulfill({ status: 404, headers, contentType: 'application/json', body: '{}' });
  });
  const page = await context.newPage();
  page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR', error.message); });
  page.on('request', request => { if (request.url().includes('/wayside-fury/save')) console.log('SAVE REQUEST', request.method()); });
  page.on('console', message => { if (message.type() === 'error') console.error('BROWSER', message.text()); });
  await page.goto(`${base}/wayside-fury`, { waitUntil: "domcontentloaded", timeout: 120000 });
  try { await page.waitForFunction(() => window.__waysideFury && !document.querySelector('.wf-primary')?.disabled, null, { timeout: 120000 }); } catch (error) { console.error('BOOT', await page.evaluate(() => ({ body: document.body.innerText, controller: !!window.__waysideFury }))); throw error; }
  return { context, page };
}
async function resume(page) {
  await page.bringToFront();
  const button = page.getByRole('button', { name: 'Resume', exact: true });
  if (await button.isVisible()) await button.click();
}
const game = async (page, fn, arg) => page.evaluate(fn, arg);
const snapshot = page => game(page, () => {
  const c = window.__waysideFury, s = c.state, canvas = document.querySelector('.wf-stage canvas');
  return { scene: s.scene, room: s.room, x: s.x, y: s.y, active: s.active, hp: s.heroes[s.active].hp,
    invulnerable: s.heroes[s.active].invulnerable, paused: c.paused, hidden: document.hidden, role: s.coop?.role,
    downed: s.coop?.downed, peers: s.coop?.remoteHeroes.map(peer => ({ seat: peer.seat, name: peer.name, scene: peer.scene,
      room: peer.room, x: peer.x, y: peer.y, hp: peer.hero.hp, downed: peer.downed })),
    enemies: s.enemies.slice(0, 8).map(enemy => ({ id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y,
      hp: enemy.hp, speed: enemy.speed, cooldown: enemy.cooldown })),
    presentation: c.renderer.presentation(s), flatCamera: c.renderer.flat.camera,
    canvas: { width: canvas.clientWidth, height: canvas.clientHeight, data: { ...canvas.dataset } },
    labels: [...document.querySelectorAll('.wf-scene-label')].slice(0, 20).map(element => element.textContent) };
});
try {
  const host = await player('dev-host'), guest = await player('dev-guest');
  await host.page.getByRole('button', { name: 'Co-op', exact: true }).click();
  await host.page.getByRole('button', { name: 'Host', exact: true }).click();
  const code = await host.page.getByTestId('coop-code').textContent();
  assert.match(code, /^[A-Z0-9]{4}$/);
  await host.page.getByRole('button', { name: 'Return to adventure' }).click();
  await game(host.page, async () => {
    const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
    window.__waysideFury.mutate(s => {
      enterScene(s, 'test');
      // Joining and composing appearances can be slow; reserve this encounter
      // for the explicit combat checks rather than attacking during setup.
      s.enemies.forEach(enemy => { enemy.speed = 0; enemy.cooldown = 100; });
      s.heroes[s.active].invulnerable = 60;
    });
    window.__waysideFury.setPaused(false);
  });
  await guest.page.getByRole('button', { name: 'Co-op', exact: true }).click();
  await guest.page.getByLabel('Room code', { exact: true }).fill(code);
  await guest.page.getByRole('button', { name: 'Join', exact: true }).click();
  await guest.page.getByRole('button', { name: 'Return to adventure' }).click();
  await host.page.waitForFunction(() => window.__waysideFury.state.coop?.remoteHeroes.length === 1);
  await guest.page.waitForFunction(() => window.__waysideFury.state.coop?.remoteHeroes.length === 1 && window.__waysideFury.state.scene === 'test');
  // The second participant also adds an authored extra enemy to the host wave.
  await game(host.page, () => window.__waysideFury.mutate(s => { s.enemies.forEach(enemy => { enemy.speed = 0; enemy.cooldown = 100; }); }));
  await game(guest.page, () => window.__waysideFury.mutate(s => { s.heroes[s.active].invulnerable = 60; }));
  for (const [page, hair] of [[host.page, 'ink'], [guest.page, 'sandy']]) await page.waitForFunction(hair => {
    const c = window.__waysideFury, peer = c.state.coop.remoteHeroes[0];
    const avatar = c.renderer.remoteAvatars.get(peer.seat);
    return avatar?.appearance?.profile.hair === hair && !avatar.fallback;
  }, hair);
  const appearances = await Promise.all([host.page, guest.page].map(page => game(page, () => {
    const c = window.__waysideFury, peer = c.state.coop.remoteHeroes[0];
    return { own: c.renderer.avatar.body.canvas.toDataURL(), remote: c.renderer.remoteAvatars.get(peer.seat).body.canvas.toDataURL() };
  })));
  assert.notEqual(appearances[0].own, appearances[1].own, 'the players wear different composed looks');
  assert.equal(appearances[0].remote, appearances[1].own, 'host renders the guest own composed look');
  assert.equal(appearances[1].remote, appearances[0].own, 'guest renders the host own composed look');
  assert.equal(await game(host.page, () => window.__waysideFury.state.enemies[0].maxHp), 51.2, 'two-player grunt HP is 1.6x');
  assert.equal(await game(guest.page, () => window.__waysideFury.state.enemies[0].maxHp), 51.2);
  const move = async (mover, observer) => {
    await resume(mover);
    const before = await game(mover, () => window.__waysideFury.state.x);
    await game(mover, () => { window.__waysideFury.setPaused(false); window.__waysideFury.setTouch({ x: 1 }); });
    await observer.waitForFunction(before => window.__waysideFury.state.coop.remoteHeroes[0].x > before + 10, before);
    await game(mover, () => window.__waysideFury.setTouch({ x: 0 }));
  };
  await move(host.page, guest.page); await move(guest.page, host.page);
  console.log("Two-player movement and scaled HP passed.");
  await resume(host.page);
  const beforeLabels = await Promise.all([host.page, guest.page].map(snapshot));
  try { await host.page.waitForFunction(() => document.querySelector('.wf-scene-label')?.textContent?.includes('Guest') || [...document.querySelectorAll('.wf-scene-label')].some(el => el.textContent.includes('Guest')), null, { timeout: 15000 }); }
  catch (error) {
    const afterLabels = await Promise.all([host.page, guest.page].map(snapshot));
    for (const [index, name] of ['host', 'guest'].entries()) console.error('PEER LABEL', name, JSON.stringify({ before: beforeLabels[index], after: afterLabels[index] }));
    throw error;
  }
  assert.ok(await game(host.page, () => window.__waysideFury.state.coop.remoteHeroes[0].hero.hp > 0));
  // A real guest attack reaches the host and reduces authoritative enemy HP.
  await game(host.page, () => window.__waysideFury.mutate(s => { s.projectiles = []; s.heroes[s.active].hp = s.heroes[s.active].maxHp; s.heroes[s.active].invulnerable = 60; s.enemies.forEach(e => { e.speed = 0; e.cooldown = 100; }); s.enemies[0].x = 145; s.enemies[0].y = 110; s.x = 75; s.y = 110; }));
  await resume(guest.page);
  await guest.page.waitForFunction(() => Math.abs(window.__waysideFury.state.enemies[0].x - 145) < 1);
  await game(guest.page, () => { window.__waysideFury.mutate(s => { s.x = 120; s.y = 110; s.heroes[s.active].hp = s.heroes[s.active].maxHp; s.heroes[s.active].invulnerable = 60; s.coop.downed = false; s.attackTimer = s.hitStop = 0; s.previousInput.attack = false; s.faceX = 1; s.faceY = 0; }); window.__waysideFury.setPaused(false); window.__waysideFury.setTouch({ x: 0, y: 0, attack: true }); });
  try { await host.page.waitForFunction(() => window.__waysideFury.state.enemies[0].hp < 51.2, null, { timeout: 60000 }); }
  catch (error) { for (const [name, page] of [['host', host.page], ['guest', guest.page]]) console.error('COMBAT', name, await game(page, () => { const c = window.__waysideFury, s = c.state; return { x: s.x, y: s.y, hero: s.heroes[s.active], enemies: s.enemies, coop: s.coop, previousInput: s.previousInput, attackTimer: s.attackTimer, paused: c.paused, room: c.coop.room }; })); throw error; }
  await game(guest.page, () => window.__waysideFury.setTouch({ attack: false }));
  console.log("Guest attack reached host.");
  // Defeat a separate grunt with guest input and verify both real account sheets.
  await game(host.page, () => window.__waysideFury.mutate(s => {
    s.enemies.forEach(e => { e.x = 260; e.y = 180; e.kx = e.ky = 0; });
    const target = s.enemies[s.enemies.length - 1]; target.x = 145; target.y = 110; target.hp = 1;
  }));
  await guest.page.waitForFunction(() => window.__waysideFury.state.enemies.some(e => e.hp === 1 && Math.abs(e.x - 145) < 1));
  await game(guest.page, () => { window.__waysideFury.mutate(s => { s.attackTimer = s.hitStop = 0; s.previousInput.attack = false; }); window.__waysideFury.setTouch({ attack: true }); });
  await host.page.waitForFunction(() => window.__waysideFury.state.kills === 1);
  await guest.page.waitForFunction(() => window.__waysideFury.state.kills === 1);
  await game(guest.page, () => window.__waysideFury.setTouch({ attack: false }));
  await guest.page.waitForFunction(() => document.querySelector('.wf-save-status')?.textContent === 'Saved');
  await host.page.waitForFunction(() => document.querySelector('.wf-save-status')?.textContent === 'Saved');
  for (const id of ['dev-host', 'dev-guest']) {
    const sheet = fixture.sheets.get(id)?.save;
    assert.equal(sheet?.character.xp, 28, `${id} gets full personal kill XP`);
    assert.ok(sheet?.candy >= 3 && sheet?.candy <= 5, `${id} gets personal candy`);
    assert.ok(sheet?.coopRewards.some(receipt => receipt.includes(':kill:')), `${id} stores durable reward receipts`);
  }
  const ratio = await game(host.page, () => window.__waysideFury.state.enemies[0].hp / window.__waysideFury.state.enemies[0].maxHp);
  await resume(host.page);
  await host.page.getByRole('button', { name: 'Pause', exact: true }).click();
  await host.page.getByRole('button', { name: 'Co-op', exact: true }).click();
  await host.page.keyboard.press('Escape');
  await host.page.waitForFunction(() => !document.querySelector('.wf-coop-menu') && !document.querySelector('.wf-pause-panel'));
  // Party HUD and native canvas survive both orientations, with every control visible.
  for (const [width, height] of [[390, 844], [844, 390]]) {
    await host.page.setViewportSize({ width, height });
    await game(host.page, () => window.__waysideFury.setTouch({}));
    await host.page.waitForTimeout(250);
    await host.page.waitForFunction(({ width, height }) => {
      const pause = document.querySelector('.wf-pause')?.getBoundingClientRect();
      const canvas = document.querySelector('.wf-stage canvas');
      return window.innerWidth === width && window.innerHeight === height && pause?.right <= width + 1
        && canvas && Math.abs(canvas.width - canvas.clientWidth * Number(canvas.dataset.renderDpr)) <= 2;
    }, { width, height });
    const layout = await game(host.page, () => {
      const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      const canvas = document.querySelector('.wf-stage canvas');
      return { controls: [...document.querySelectorAll('.wf-touch-btn, .wf-stick-zone, .wf-pause, .wf-party-hud')].map(rect), canvas: rect(canvas), backing: canvas.width, dpr: Number(canvas.dataset.renderDpr), buttons: document.querySelectorAll('.wf-touch-btn').length };
    });
    assert.equal(layout.buttons, 5);
    for (const r of layout.controls) assert.ok(r.x >= -1 && r.y >= -1 && r.x + r.width <= width + 1 && r.y + r.height <= height + 1, `control onscreen at ${width}×${height}: ${JSON.stringify(r)}`);
    assert.ok(Math.abs(layout.backing - layout.canvas.width * layout.dpr) <= 2);
    assert.ok(layout.canvas.width * layout.canvas.height / (width * height) >= (width < height ? .55 : .75));
    await host.page.screenshot({ path: `/tmp/fury-coop-${width}x${height}.png` });
  }
  await resume(guest.page);
  await guest.page.getByRole('button', { name: 'Pause', exact: true }).click();
  await guest.page.getByRole('button', { name: 'Co-op', exact: true }).click();
  await guest.page.getByRole('button', { name: 'Leave party', exact: true }).click();
  await host.page.waitForFunction(() => window.__waysideFury.state.enemies[0].maxHp === 32);
  assert.ok(Math.abs(await game(host.page, () => window.__waysideFury.state.enemies[0].hp / 32) - ratio) < .0001, 'leave preserves enemy HP percentage');

  // Rejoin through the real menu, then exercise both renderers with live peers.
  await resume(guest.page);
  await guest.page.getByRole('button', { name: 'Pause', exact: true }).click();
  await guest.page.getByRole('button', { name: 'Co-op', exact: true }).click();
  await guest.page.getByLabel('Room code', { exact: true }).fill(code);
  await guest.page.getByRole('button', { name: 'Join', exact: true }).click();
  await guest.page.getByRole('button', { name: 'Return to adventure' }).click();
  await host.page.waitForFunction(() => window.__waysideFury.state.coop?.remoteHeroes.length === 1);
  await game(host.page, async () => {
    const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
    const c = window.__waysideFury;
    c.setTouch({}); c.mutate(s => { enterScene(s, 'overworld'); s.active = 'you'; s.notice = ''; }); c.setPaused(false);
  });
  await guest.page.waitForFunction(() => window.__waysideFury.state.scene === 'overworld'
    && window.__waysideFury.state.coop?.remoteHeroes.some(peer => peer.scene === 'overworld'));
  await game(guest.page, () => { const c = window.__waysideFury; c.setTouch({}); c.mutate(s => { s.active = 'you'; }); c.setPaused(false); });
  for (const page of [host.page, guest.page]) await game(page, () => window.__waysideFury.setGraphicsMode('3d'));

  const checkDepthPeer = async (page, label, expectedBody) => {
    await page.waitForFunction(() => {
      const c = window.__waysideFury, original = document.querySelector('.wf-stage canvas:not(.wf-canvas-3d)');
      if (original?.dataset.gfxStatus === 'fallback') throw new Error(`Co-op 3D failed: ${original.dataset.gfxError}`);
      const canvas = document.querySelector('.wf-canvas-3d'), depth = c.renderer.depth;
      const peer = c.state.coop?.remoteHeroes.find(peer => peer.scene === c.state.scene && peer.room === c.state.room);
      if (!peer || peer.hero.id !== 'you' || original?.dataset.gfx !== '3d' || !depth || !(Number(canvas?.dataset.triangles) > 0)) return false;
      const taxi = depth.remoteTaxis.get(peer.seat), driver = depth.billboards.get(`peer-driver-${peer.seat}`);
      return taxi?.group.visible && driver?.group.visible && depth.remoteAvatarSheets.has(peer.seat)
        && depth.presentation(c.state).labels.some(entry => entry.id === `peer-${peer.seat}` && entry.text === peer.name)
        && [...document.querySelectorAll('.wf-scene-label')].some(element => element.textContent === peer.name);
    }, null, { timeout: 120000 });
    const result = await game(page, () => {
      const c = window.__waysideFury, depth = c.renderer.depth, peer = c.state.coop.remoteHeroes[0];
      const canvas = document.querySelector('.wf-canvas-3d'), taxi = depth.remoteTaxis.get(peer.seat);
      const driver = depth.billboards.get(`peer-driver-${peer.seat}`), sheets = depth.remoteAvatarSheets.get(peer.seat);
      const remoteBody = c.renderer.remoteAvatars.get(peer.seat).body.canvas, ownBody = c.renderer.avatar.body.canvas;
      return { seat: peer.seat, renderer: canvas.dataset.renderer, triangles: Number(canvas.dataset.triangles),
        width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, dpr: Number(canvas.dataset.renderDpr),
        taxiDistance: Math.hypot(taxi.group.position.x - peer.x, taxi.group.position.z - peer.y),
        source: driver.source, remoteSheet: driver.sheets === sheets,
        sheetBody: sheets.some(sheet => sheet.texture.image === remoteBody),
        driverBody: driver.sprites.some(sprite => sprite.material.map.image === remoteBody),
        ownBody: driver.sprites.some(sprite => sprite.material.map.image === ownBody),
        body: remoteBody.toDataURL(), sceneId: depth.scene.uuid };
    });
    assert.equal(result.renderer, '3d', `${label}: native depth canvas`);
    assert.ok(result.triangles > 0, `${label}: rendered geometry`);
    assert.ok(Math.abs(result.width - result.cssWidth * result.dpr) <= 2 && Math.abs(result.height - result.cssHeight * result.dpr) <= 2, `${label}: native backing follows DPR`);
    assert.ok(result.taxiDistance < 2, `${label}: peer taxi follows its network position`);
    assert.equal(result.source, `you:${result.seat}`, `${label}: peer driver belongs to its seat`);
    assert.ok(result.remoteSheet && result.sheetBody && result.driverBody && !result.ownBody, `${label}: peer driver uses remote composed sheets`);
    assert.equal(result.body, expectedBody, `${label}: peer wears the other account's appearance`);
    return result;
  };
  const depthPlayers = [[host.page, 'host', appearances[1].own], [guest.page, 'guest', appearances[0].own]];
  const firstDepth = [];
  for (const [page, label, body] of depthPlayers) firstDepth.push(await checkDepthPeer(page, label, body));
  // Real movement must reach the peer's rendered taxi, beyond the join snapshot.
  await move(host.page, guest.page);
  await move(guest.page, host.page);
  for (const [page, label, body] of depthPlayers) await checkDepthPeer(page, `${label}-moving`, body);
  for (const [index, [page, label, body]] of depthPlayers.entries()) {
    await game(page, () => window.__waysideFury.setGraphicsMode('2d'));
    await page.waitForFunction(() => !document.querySelector('.wf-canvas-3d') && document.querySelector('.wf-stage canvas')?.dataset.gfx === '2d');
    await game(page, () => window.__waysideFury.setGraphicsMode('3d'));
    const rebuilt = await checkDepthPeer(page, `${label}-rebuilt`, body);
    assert.notEqual(rebuilt.sceneId, firstDepth[index].sceneId, `${label}: 3D rebuild retains cached remote appearance`);
    await page.screenshot({ path: `/tmp/fury-coop-3d-${label}.png` });
  }
  await game(guest.page, () => window.__waysideFury.coop.leave());
  await host.page.waitForFunction(() => {
    const c = window.__waysideFury, depth = c.renderer.depth;
    return c.state.coop?.remoteHeroes.length === 0 && depth?.remoteTaxis.size === 0 && depth.remoteAvatarSheets.size === 0
      && ![...depth.billboards.keys()].some(key => key.startsWith('peer-driver-'))
      && !depth.presentation(c.state).labels.some(label => String(label.id).startsWith('peer-'));
  });
  console.log('Co-op 3D: live peer taxis, named drivers, distinct remote appearance, native canvas, renderer rebuild and leave cleanup pass.');
  assert.deepEqual(errors, []);
  console.log('Wayside Fury co-op browsers: authenticated host/join, distinct heroes, bidirectional movement, guest hits, scaled HP, live leave rescale, personal cloud rewards, menu back, party HUD and native portrait/landscape controls pass.');
} finally { await browser.close(); await fixture.app.close(); }
