// Native Node 24+ checks: authored composition, global audible voice cap, lifecycle.
import assert from 'node:assert/strict';
import { MusicDirector, SITE_HOOK, TRACK_METADATA, VoiceBudget, peakOverlaps, scoreStep } from '../src/pages/WaysideFury/game/music.ts';

for (const [mood, meta] of Object.entries(TRACK_METADATA)) {
  assert.ok(meta.introBars > 0 && meta.loopBars > 0, `${mood} has an intro and a loop point`);
  assert.ok(meta.loopDurationSeconds >= 30 && meta.loopDurationSeconds <= 60, `${mood} loop lasts 30–60 seconds`);
  assert.equal(meta.loopStartSeconds, meta.introBars * 240 / meta.bpm);
  let lead = 0, bass = 0, drums = 0;
  for (let bar = 0; bar < meta.introBars + meta.loopBars; bar++) for (let step = 0; step < 16; step++) {
    const notes = scoreStep(mood, bar, step);
    for (const note of notes) {
      assert.ok(Number.isFinite(note.midi) && note.midi >= 0 && note.midi <= 96);
      assert.ok(note.duration > 0 && note.volume > 0 && note.volume <= 0.2);
      if (note.lane === 'lead') lead++;
      if (note.lane === 'bass') bass++;
      if (note.lane === 'drum') drums++;
    }
    assert.ok(scoreStep(mood, bar, step, true).every(note => note.lane !== 'stab'), 'realm uses four lanes');
    if (bar >= meta.introBars) assert.deepEqual(scoreStep(mood, bar, step), scoreStep(mood, bar + meta.loopBars, step));
  }
  assert.ok(lead > 40 && bass > 40 && drums > 20, `${mood} is a full arrangement`);
}
for (const mood of ['title', 'hub', 'boss']) {
  const meta = TRACK_METADATA[mood];
  const bar = meta.introBars + (mood === 'title' ? meta.loopBars - 1 : mood === 'hub' ? 7 : 3);
  const lead = Array.from({ length: 8 }, (_, i) => scoreStep(mood, bar, i * 2).find(n => n.lane === 'lead')?.midi);
  assert.deepEqual(lead, SITE_HOOK.map(n => n + (mood === 'boss' ? 12 : 0)), `${mood} carries the site-owned hook`);
}
assert.equal(peakOverlaps([{ id: 1, start: 0, end: 1, priority: 1 }, { id: 2, start: 1, end: 2, priority: 1 }]), 1);
const budget = new VoiceBudget();
const first = Array.from({ length: 8 }, () => budget.reserve(0, 2, 5));
assert.ok(first.every(Boolean));
assert.equal(budget.reserve(0.5, 1.5, 1), null, 'low-priority reservation fails atomically');
assert.equal(budget.active(1), 8);
const stolen = budget.reserve(0.5, 1.5, 9);
assert.equal(stolen.stolen.length, 1);
assert.equal(budget.active(0.75), 8);
assert.equal(budget.active(0.25), 8, 'stealing preserves the preceding interval');
assert.ok(budget.peak <= 8);
let seed = 319;
for (let i = 0; i < 3000; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const start = 2 + i * 0.01, length = (seed % 100) / 100 + 0.02;
  budget.prune(start - 0.2); budget.reserve(start, start + length, seed % 11);
  assert.ok(budget.active(start + 0.005) <= 8);
}
assert.equal(budget.peak, 8);

// A deterministic Web Audio test double records audible intervals rather than
// merely counting allocated nodes, so lookahead and stolen sources are covered.
class Param {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class Node {
  connections = []; disconnected = false;
  connect(other) { this.connections.push(other); return other; }
  disconnect() { this.disconnected = true; }
}
class Source extends Node {
  constructor(ctx, oscillator) { super(); this.ctx = ctx; this.gain = new Param(); this.startAt = Infinity; this.endAt = Infinity;
    this.onended = null; this.ended = false;
    if (oscillator) { this.frequency = new Param(); this.detune = new Param(); this.type = 'sine'; }
    else { this.buffer = null; this.loop = false; }
  }
  setPeriodicWave(wave) { this.wave = wave; }
  start(at) { this.startAt = at; this.ctx.sources.push(this); }
  stop(at) { this.endAt = at; }
}
let callback = null;
class Context {
  state = 'suspended'; currentTime = 0; sampleRate = 8000; sources = []; gains = []; buffers = []; destination = new Node();
  resumes = 0; suspends = 0; closed = false; pendingSuspend = null; pendingResume = null;
  createGain() { const node = Object.assign(new Node(), { gain: new Param() }); this.gains.push(node); return node; }
  createDynamicsCompressor() { return Object.assign(new Node(), Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(n => [n, new Param()]))); }
  createWaveShaper() { return new Node(); }
  createBiquadFilter() { return Object.assign(new Node(), { frequency: new Param(), Q: new Param() }); }
  createDelay() { return Object.assign(new Node(), { delayTime: new Param() }); }
  createBuffer(_, length, sampleRate) { const data = new Float32Array(length), buffer = { length, sampleRate, getChannelData: () => data }; this.buffers.push(buffer); return buffer; }
  createPeriodicWave(real, imaginary) { return { real, imaginary }; }
  createOscillator() { return new Source(this, true); }
  createBufferSource() { return new Source(this, false); }
  async resume() { this.resumes++; if (this.pendingResume) await this.pendingResume; this.state = 'running'; }
  async suspend() { this.suspends++; if (this.pendingSuspend) await this.pendingSuspend; this.state = 'suspended'; }
  async close() { this.state = 'closed'; this.closed = true; }
  advance(seconds) {
    this.currentTime += seconds;
    for (const source of this.sources) if (!source.ended && source.endAt <= this.currentTime) {
      source.ended = true; source.onended?.();
    }
    callback?.();
  }
  peak() { return peakOverlaps(this.sources.filter(s => s.buffer?.length !== 1).map((s, id) => ({ id, start: s.startAt, end: s.endAt, priority: 0 }))); }
}
const originalInterval = globalThis.setInterval, originalClear = globalThis.clearInterval;
globalThis.setInterval = fn => { callback = fn; return 1; };
globalThis.clearInterval = () => { callback = null; };
let created = 0;
const ctx = new Context(); const music = new MusicDirector(() => { created++; return ctx; });
try {
  assert.deepEqual(music.debugSnapshot().settings, { musicVolume: 0.6, sfxVolume: 0.8 }, 'fresh guests start with audible volumes');
  music.setSettings({ musicVolume: NaN, sfxVolume: undefined });
  assert.deepEqual(music.debugSnapshot().settings, { musicVolume: 0.6, sfxVolume: 0.8 }, 'invalid settings recover the audible defaults');
  music.setSettings({ musicVolume: 0, sfxVolume: 0 });
  assert.deepEqual(music.debugSnapshot().settings, { musicVolume: 0, sfxVolume: 0 }, 'an explicit saved mute is preserved');
  music.setMood('title'); music.setSettings({ musicVolume: 0.25, sfxVolume: 0.75 });
  assert.equal(created, 0, 'constructing and selecting a mood do not create AudioContext');
  const firstUnlock = music.unlock();
  assert.equal(created, 1, 'AudioContext is created on the gesture stack');
  assert.equal(ctx.resumes, 1, 'resume is called before unlock returns');
  assert.equal(ctx.sources[0].buffer.length, 1, 'the gesture synchronously starts a silent unlock sample');
  assert.equal(ctx.sources[0].buffer.getChannelData(0)[0], 0);
  await firstUnlock; assert.equal(music.debugSnapshot().context, 'running');
  assert.equal(ctx.gains[0].gain.value, 0.72, 'the master bus opens after resume');
  for (const mood of Object.keys(TRACK_METADATA)) {
    music.setMood(mood);
    for (let i = 0; i < 700; i++) {
      if (i % 37 === 0) music.playSfx('beam');
      if (i % 133 === 0) music.jingle('victory');
      if (i === 220) music.setCharge(0.8);
      if (i === 250) music.setCharge(null);
      if (i === 400) music.setRealm(1);
      ctx.advance(0.025);
      assert.ok(music.debugSnapshot().activeVoices <= 8);
      assert.ok(music.debugSnapshot().peakVoices <= 8);
      if (i > 440) assert.ok(music.debugSnapshot().activeMusicVoices <= 4, 'realm settles into four music voices');
    }
    music.setRealm(0);
  }
  music.setMood('title');
  for (let i = 0; i < 1900; i++) ctx.advance(0.025);
  assert.equal(music.debugSnapshot().transport.intro, false, 'intro plays once across the first whole loop');
  assert.ok(music.debugSnapshot().transport.bar >= TRACK_METADATA.title.introBars);
  assert.ok(ctx.peak() <= 8, 'actual source overlap stays within eight through crossfades/SFX/jingles/charging');
  music.setMood('bbq'); music.jingle('darkSky'); ctx.advance(1);
  assert.equal(music.debugSnapshot().darkSky, true); assert.equal(music.debugSnapshot().transport, null);
  music.setMood('bbq'); assert.equal(music.debugSnapshot().darkSky, true, 'repeated same mood cannot restart the BBQ');
  music.setMood('hub'); assert.equal(music.debugSnapshot().darkSky, false);
  music.setPaused(true); assert.equal(music.debugSnapshot().paused, true); music.setPaused(false);
  await ctx.suspend(); music.setMood('taxi');
  assert.equal(music.debugSnapshot().mood, 'taxi');
  await music.unlock(); ctx.advance(0.05);
  assert.equal(music.debugSnapshot().transport.mood, 'taxi', 'external interruption resumes the requested score, not stale hub');
  await ctx.suspend(); music.setMood('off'); await music.unlock(); ctx.advance(0.05);
  assert.equal(music.debugSnapshot().transport, null, 'off requested during an external suspension remains silent');
  ctx.state = 'interrupted';
  assert.equal(music.needsGesture(), true, 'an iOS interruption offers the sound chip');
  const interruptedResumes = ctx.resumes, interruptedUnlock = music.unlock();
  assert.equal(ctx.resumes, interruptedResumes + 1, 'an interrupted context is resumed synchronously on the next gesture');
  await interruptedUnlock;
  assert.equal(music.needsGesture(), false, 'the sound chip disappears after output resumes');
  let releaseSuspend;
  ctx.pendingSuspend = new Promise(resolve => { releaseSuspend = resolve; });
  const hiding = music.setVisible(false), showing = music.setVisible(true);
  const pendingSuspendResumes = ctx.resumes, gestureDuringSuspend = music.unlock();
  assert.equal(ctx.resumes, pendingSuspendResumes + 1, 'a pending suspend never delays the gesture resume');
  releaseSuspend(); await Promise.all([hiding, showing, gestureDuringSuspend]); ctx.pendingSuspend = null;
  assert.equal(ctx.state, 'running', 'rapid hide/show resumes after the pending suspend');
  await music.setVisible(false); assert.equal(callback, null); assert.equal(music.debugSnapshot().activeVoices, 0);
  const count = ctx.sources.length; music.playSfx('hit'); music.jingle('item');
  assert.equal(ctx.sources.length, count, 'hidden input creates no stale audio');
  await music.setVisible(true); assert.equal(ctx.state, 'running'); assert.ok(callback);
  music.setMood('title'); const beforeStall = ctx.sources.length; ctx.advance(0.17);
  assert.ok(ctx.sources.slice(beforeStall).every(source => source.startAt >= ctx.currentTime), 'a short scheduler stall never schedules notes in the past');
  music.dispose(); assert.equal(ctx.closed, true); assert.equal(callback, null);
  await music.unlock(); assert.equal(created, 1, 'disposed director cannot restart');
  const retryContext = new Context(), retryDirector = new MusicDirector(() => retryContext);
  try {
    let releaseBlocked;
    retryContext.pendingResume = new Promise(resolve => { releaseBlocked = resolve; });
    const blocked = retryDirector.unlock();
    assert.equal(retryDirector.needsGesture(), true);
    retryContext.pendingResume = null;
    const realGesture = retryDirector.unlock();
    assert.equal(retryContext.resumes, 2, 'touchend retries an unresolved pointerdown resume on its own gesture stack');
    await realGesture; assert.equal(retryContext.state, 'running');
    releaseBlocked(); await blocked;
  } finally { retryDirector.dispose(); }
  const failedContext = new Context(), recoveredContext = new Context();
  failedContext.createGain = () => { throw new Error('device initialization failed'); };
  let failedAttempts = 0;
  const failedDirector = new MusicDirector(() => failedAttempts++ === 0 ? failedContext : recoveredContext);
  try {
    await failedDirector.unlock();
    assert.equal(failedContext.closed, true, 'a partially initialized context is closed after graph failure');
    assert.equal(failedDirector.needsGesture(), true, 'a failed first tap still offers the sound chip');
    await failedDirector.unlock();
    assert.equal(recoveredContext.state, 'running', 'a later gesture can recreate failed device initialization');
    assert.equal(failedDirector.needsGesture(), false);
  } finally { failedDirector.dispose(); }
  for (const sampleRate of [44100, 48000]) {
    const deviceContext = new Context(); deviceContext.sampleRate = sampleRate;
    const deviceDirector = new MusicDirector(() => deviceContext);
    try {
      await deviceDirector.unlock();
      assert.ok(deviceContext.buffers.every(buffer => buffer.sampleRate === sampleRate), 'noise and silent unlock buffers use the device sample rate');
      assert.equal(deviceContext.buffers.find(buffer => buffer.length > 1).length, sampleRate * 2);
    } finally { deviceDirector.dispose(); }
  }
  for (const event of ['darkSky', 'gameOver']) for (const when of ['beforeUnlock', 'pendingResume', 'hidden']) {
    const slowContext = new Context(), director = new MusicDirector(() => slowContext);
    try {
      director.setMood('bbq');
      let releaseResume, starting;
      if (when === 'pendingResume') {
        slowContext.pendingResume = new Promise(resolve => { releaseResume = resolve; });
        starting = director.unlock();
        assert.equal(slowContext.state, 'suspended');
      } else if (when === 'hidden') { await director.unlock(); await director.setVisible(false); }
      director.jingle(event);
      assert.equal(director.debugSnapshot().darkSky, event === 'darkSky', `${event} intent persists during ${when}`);
      assert.equal(director.debugSnapshot().transport, null);
      if (event === 'darkSky') director.setMood('bbq');
      else assert.equal(director.debugSnapshot().mood, 'off');
      if (when === 'pendingResume') { releaseResume(); await starting; }
      else if (when === 'hidden') await director.setVisible(true);
      else await director.unlock();
      slowContext.advance(0.06);
      assert.equal(director.debugSnapshot().transport, null, `${event} does not restart BBQ after ${when}`);
      assert.equal(director.debugSnapshot().activeMusicVoices, event === 'darkSky' ? 1 : 0);
      await director.unlock();
      assert.equal(director.debugSnapshot().transport, null, 'later gestures preserve the event intent');
      director.setMood('hub'); slowContext.advance(0.1);
      assert.equal(director.debugSnapshot().darkSky, false, 'an explicit future mood clears the latch');
      assert.equal(director.debugSnapshot().mood, 'hub');
      assert.ok(director.debugSnapshot().transport, 'future mood begins its own score');
    } finally { director.dispose(); }
  }
} finally { music.dispose(); globalThis.setInterval = originalInterval; globalThis.clearInterval = originalClear; }
console.log('Wayside Fury music: compositions, site hook, voice cap, crossfades, SFX, realm, dark sky and lifecycle passed.');
