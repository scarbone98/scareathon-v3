import { muteWebKitContext } from './wayside-fury-browser-audio.mjs';
// Run against Vite: FURY_BASE_URL=http://127.0.0.1:5173 node scripts/check-wayside-fury-webkit-audio.mjs
// Install Playwright/WebKit first (npx playwright install webkit). An external
// installation can be selected with PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5173';
const moduleName = process.env.PLAYWRIGHT_MODULE;
let playwright;
try {
  playwright = await import(moduleName?.startsWith('/') ? pathToFileURL(moduleName).href : moduleName ?? 'playwright');
} catch {
  throw new Error('Install Playwright and its WebKit browser, or set PLAYWRIGHT_MODULE to an external index.mjs.');
}
const device = playwright.devices['iPhone 15'];
assert.ok(device, 'Playwright provides the iPhone 15 descriptor');
const browser = await playwright.webkit.launch({ headless: true });
const shots = '/tmp/fury-webkit-audio';
await mkdir(shots, { recursive: true });
const results = [];

async function audible(page, label) {
  // Measure the real output graph, after master gain and compressor. No test
  // oscillator, fake AudioContext, or SFX is used to make this assertion pass.
  await page.evaluate(() => { window.__furyAudioProbe.samples = []; });
  await page.waitForFunction(() => {
    const probe = window.__furyAudioProbe;
    const ctx = probe.contexts.at(-1);
    const taps = probe.taps.filter(tap => tap.ctx === ctx);
    if (ctx?.state !== 'running' || !taps.length) return false;
    const rms = Math.max(...taps.map(({ analyser }) => {
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
    }));
    probe.samples.push(rms);
    return probe.samples.filter(sample => sample > 0.00001).length >= 10;
  }, null, { polling: 50, timeout: 15000 });
  const result = await page.evaluate(() => {
    const probe = window.__furyAudioProbe, ctx = probe.contexts.at(-1);
    return { state: ctx.state, sampleRate: ctx.sampleRate,
      peakRms: Math.max(...probe.samples), audibleSamples: probe.samples.filter(sample => sample > 0.00001).length,
      settings: window.__waysideFury.sound.debugSnapshot().settings,
      resumes: probe.resumes, buffers: probe.buffers };
  });
  assert.equal(result.state, 'running', `${label}: native AudioContext runs`);
  assert.ok(result.peakRms > 0, `${label}: destination RMS is above zero`);
  assert.ok(result.audibleSamples >= 10, `${label}: music is sustained beyond the UI click`);
  results.push({ label, ...result });
  return result;
}

async function run(gesture) {
  const context = await browser.newContext({ ...device });
  await muteWebKitContext(context, false);
  const errors = [];
  // A fresh guest, and a tap on UI that stops bubbling. Blocking other gesture
  // types proves each required capture listener works independently.
  await context.addInitScript(({ gesture }) => {
    try { localStorage.clear(); } catch { /* initial about:blank */ }
    const probe = window.__furyAudioProbe = { contexts: [], taps: [], resumes: [], buffers: [], samples: [] };
    for (const name of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
      if (name !== gesture) window.addEventListener(name, event => event.stopImmediatePropagation(), { capture: true });
    }
    const NativeContext = window.AudioContext ?? window.webkitAudioContext;
    const connect = AudioNode.prototype.connect;
    const outputs = new WeakMap();
    AudioNode.prototype.connect = function (...args) {
      if (args[0] === this.context.destination) {
        // Tap before this test-only output mute, retaining real graph RMS.
        if (this instanceof DynamicsCompressorNode) {
          const analyser = this.context.createAnalyser(); analyser.fftSize = 2048;
          connect.call(this, analyser); probe.taps.push({ ctx: this.context, analyser });
        }
        let output = outputs.get(this.context);
        if (!output) {
          output = this.context.createGain(); output.gain.value = 0;
          connect.call(output, this.context.destination); outputs.set(this.context, output);
        }
        args[0] = output;
      }
      const result = connect.apply(this, args);
      return result;
    };
    class ObservedContext extends NativeContext {
      constructor(...args) {
        super(...args); probe.contexts.push(this);
      }
      resume() {
        probe.resumes.push({ before: this.state, time: this.currentTime });
        return super.resume();
      }
      createBuffer(channels, length, sampleRate) {
        probe.buffers.push({ channels, length, sampleRate });
        return super.createBuffer(channels, length, sampleRate);
      }
    }
    window.AudioContext = ObservedContext;
    if (window.webkitAudioContext) window.webkitAudioContext = ObservedContext;
  }, { gesture });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(new URL('/wayside-fury', baseUrl).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__waysideFury && !!document.querySelector('.wf-stage canvas')?.dataset.pixelScale);
    assert.equal(await page.evaluate(() => window.__furyAudioProbe.contexts.length), 0, 'no context is created before user input');
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'audio-gesture'; button.textContent = 'Sound activation test';
      Object.assign(button.style, { position: 'fixed', left: '8px', top: '8px', zIndex: '9999' });
      for (const name of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) button.addEventListener(name, event => event.stopPropagation());
      document.body.append(button);
    });
    const button = page.locator('#audio-gesture');
    if (gesture === 'keydown') { await button.focus(); await page.keyboard.press('Space'); }
    else if (gesture === 'click') await button.click();
    else await button.tap();
    await page.waitForFunction(() => window.__furyAudioProbe.contexts.at(-1)?.state === 'running');
    const settings = await page.evaluate(() => window.__waysideFury.sound.debugSnapshot().settings);
    assert.equal(settings.musicVolume, 0.6, 'fresh guest music volume is audible');
    assert.equal(settings.sfxVolume, 0.8, 'fresh guest SFX volume is valid');
    // Disable SFX so a single UI selection cannot masquerade as working BGM.
    await page.evaluate(() => window.__waysideFury.setAudioSettings({ musicVolume: 0.6, sfxVolume: 0 }));
    const first = await audible(page, `${gesture}-capture`);
    assert.ok(first.buffers.some(buffer => buffer.length === 1 && buffer.sampleRate === first.sampleRate), 'one-sample iOS unlock uses the native sample rate');
    assert.ok(first.buffers.some(buffer => buffer.length === first.sampleRate * 2 && buffer.sampleRate === first.sampleRate), 'noise buffer uses the native sample rate');
    await page.locator('.wf-sound-chip').waitFor({ state: 'hidden' });
    await button.evaluate(element => element.remove());

    if (gesture === 'touchend') {
      // A real native suspension approximates an OS interruption; the music
      // unit check separately covers WebKit's nonstandard "interrupted" state.
      await page.evaluate(() => window.__furyAudioProbe.contexts.at(-1).suspend());
      const chip = page.getByRole('button', { name: 'Tap for sound' });
      await chip.waitFor({ state: 'visible' });
      await page.screenshot({ path: `${shots}/tap-for-sound.png` });
      await chip.tap();
      await audible(page, 'speaker-chip-recovery');
      await chip.waitFor({ state: 'hidden' });

      await page.evaluate(() => window.__waysideFury.sound.setVisible(false));
      assert.equal(await page.evaluate(() => window.__furyAudioProbe.contexts.at(-1).state), 'suspended');
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await audible(page, 'pageshow-recovery');
      await page.evaluate(() => window.__waysideFury.sound.setVisible(false));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await audible(page, 'visibility-recovery');
      await page.screenshot({ path: `${shots}/iphone15-running.png` });
    }
    assert.deepEqual(errors, [], 'no uncaught WebKit errors');
    console.log(`${gesture}: native WebKit running, sustained BGM RMS ${first.peakRms.toFixed(6)}, ${first.sampleRate} Hz`);
  } finally {
    await context.close();
  }
}

try {
  for (const gesture of ['touchend', 'click', 'keydown']) await run(gesture);
  await writeFile(`${shots}/results.json`, `${JSON.stringify({ device: 'iPhone 15', results }, null, 2)}\n`);
  console.log(`Wayside Fury WebKit audio passes. Evidence: ${shots}/`);
} finally {
  await browser.close();
}
