// Requires Vite, Playwright Chromium, ffmpeg and ImageMagick. Records live gameplay;
// scene jumps use the development hook to fit the chapter into an attract loop.
// FURY_BASE_URL=http://127.0.0.1:5173 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
//   node scripts/record-wayside-fury-preview.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5173';
const moduleName = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
const shots = '/tmp/fury-arcade-shots';
await mkdir(`${shots}/recording`, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2,
  recordVideo: { dir: `${shots}/recording`, size: { width: 960, height: 540 } } });
await context.addInitScript(() => localStorage.setItem('wayside-fury-controls-dismissed', '1'));
const recordingStarted = Date.now();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const marks = [];
const mark = name => {
  marks.push({ name, at: (Date.now() - recordingStarted) / 1000 });
  console.log(`Capturing ${name}`);
};
const hold = async (key, milliseconds) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up(key);
};
const screenshot = name => page.screenshot({ path: `${shots}/${name}.png` });

try {
  await page.goto(`${baseUrl}/wayside-fury`);
  await page.waitForFunction(() => window.__waysideFury && document.querySelector('.wf-menu .wf-primary')?.disabled === false);
  await page.waitForTimeout(400);
  mark('title');
  await screenshot('label-source');
  const binary = name => existsSync(`/opt/homebrew/bin/${name}`) ? `/opt/homebrew/bin/${name}` : name;
  const still = new URL('../public/game-recordings/stills/WaysideFury.jpg', import.meta.url).pathname;
  execFileSync(binary('magick'), [`${shots}/label-source.png`, '-resize', '552x310^', '-gravity', 'center', '-extent', '552x310', '-quality', '90', still]);
  // Keep the label capture at DPR 2; the 960px video needs one render pixel per
  // output pixel, leaving more headroom for live combat while recording.
  const metrics = await context.newCDPSession(page);
  await metrics.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
  await page.waitForTimeout(2300);
  await page.getByRole('button', { name: 'Begin adventure', exact: true }).click();
  await page.getByRole('button', { name: 'Skip prologue' }).click();
  await page.waitForFunction(() => window.__waysideFury.state.scene === 'overworld');
  mark('taxi');
  // Pass the parked car on the south side of the road.
  await hold('s', 210);
  await page.waitForTimeout(140);
  await hold('d', 3100);
  await screenshot('taxi');
  mark('combat');
  await page.evaluate(async () => {
    const { enterScene } = await import('/src/pages/WaysideFury/game/sim.ts');
    window.__waysideFury.mutate(state => enterScene(state, 'dungeon'));
  });
  // The ordinary enemy AI closes in while the hero charges, then the real Ki
  // release fires the signature beam. Repeated J inputs show the melee combo.
  await hold('d', 550);
  await hold('k', 1500);
  await page.waitForTimeout(160);
  await screenshot('beam');
  for (let n = 0; n < 5; n++) { await page.keyboard.press('j'); await page.waitForTimeout(290); }
  await page.keyboard.press('q');
  await hold('k', 1800);
  await page.waitForTimeout(250);
  await screenshot('combat');
  for (let n = 0; n < 4; n++) { await page.keyboard.press('j'); await page.waitForTimeout(275); }
  const combat = await page.evaluate(() => ({ kills: window.__waysideFury.state.kills, candy: window.__waysideFury.state.candy }));
  assert.ok(combat.kills > 0, 'scripted combat landed hits and defeated an enemy');
  mark('realm-shift');
  await page.evaluate(async () => {
    const { beginRealmShift } = await import('/src/pages/WaysideFury/game/sim.ts');
    window.__waysideFury.mutate(beginRealmShift);
  });
  await page.waitForTimeout(900);
  await screenshot('realm-shift');
  await page.waitForFunction(() => window.__waysideFury.state.scene === 'realm');
  mark('realm');
  await hold('d', 650);
  await hold('k', 650);
  await page.waitForTimeout(350);
  await screenshot('realm');
  mark('end');
  assert.equal(errors.length, 0, errors.join('\n'));
  const recording = page.video();
  await context.close();
  const video = await recording.path();
  const duration = 22;
  const sectionDurations = [2.75, 6.25, 7, 3, 3];
  // Fit the same live sections into a 22-second attract loop even if capture
  // loads slow this machine down. No manufactured gameplay frames are added.
  const sections = sectionDurations.map((length, index) => {
    const from = marks[index].at, until = marks[index + 1].at;
    return `[0:v]trim=start=${from}:end=${until},setpts=(PTS-STARTPTS)*${length / (until - from)},fps=30[v${index}]`;
  });
  const filter = `${sections.join(';')};${sectionDurations.map((_, index) => `[v${index}]`).join('')}concat=n=5:v=1:a=0,scale=960:540,tpad=stop_mode=clone:stop_duration=2,fade=t=in:st=0:d=0.25,fade=t=out:st=${duration - 0.6}:d=0.35[out]`;
  const output = new URL('../public/game-recordings/WaysideFury.mp4', import.meta.url).pathname;
  const encoded = `${shots}/recording/WaysideFury.mp4`;
  // Fade to black at both edges gives the attract loop an intentional seam.
  execFileSync(binary('ffmpeg'), ['-v', 'error', '-y', '-i', video, '-t', String(duration),
    '-filter_complex', filter, '-map', '[out]',
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-b:v', '1200k', '-maxrate', '1500k', '-bufsize', '3000k',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', encoded]);
  const probe = JSON.parse(execFileSync(binary('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', encoded]));
  assert.ok(Math.abs(Number(probe.format.duration) - duration) < 0.05, 'encoded loop has its full 22-second duration');
  for (const at of [0, duration - 0.05]) {
    const pixels = execFileSync(binary('ffmpeg'), ['-v', 'error', '-ss', String(at), '-i', encoded,
      '-frames:v', '1', '-vf', 'scale=16:9', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
    assert.ok(pixels.length > 0 && pixels.every(value => value <= 2), `loop edge at ${at}s is black`);
  }
  const bytes = (await stat(encoded)).size;
  assert.ok(bytes < 4_000_000, `preview must be under 4 MB, got ${bytes} bytes`);
  // Replace only after faststart and both black loop edges have been checked.
  await rename(encoded, output);
  const evidence = { dimensions: '960x540', labelDpr: 2, videoDpr: 1, duration, bytes, combat, marks, recording: video };
  await writeFile(`${shots}/recording.json`, JSON.stringify(evidence, null, 2));
  console.log(`Recorded Wayside Fury: ${duration.toFixed(2)}s, ${(bytes / 1_000_000).toFixed(2)} MB; title, taxi, live combat, realm shift and realm. Evidence: ${shots}/`);
} catch (error) {
  if (!page.isClosed()) await screenshot('recording-failure').catch(() => {});
  throw error;
} finally {
  await browser.close();
}
