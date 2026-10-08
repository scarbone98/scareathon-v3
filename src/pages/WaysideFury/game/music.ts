/** Procedural Wayside Fury soundtrack. No recorded audio is loaded by this module. */
export type Mood = 'off' | 'title' | 'bbq' | 'hub' | 'taxi' | 'cozy' | 'dungeon' | 'boss' | 'haywire';
export type MusicMood = Mood;
export type Jingle = 'victory' | 'level' | 'item' | 'gameOver' | 'taxiHorn' | 'darkSky';
export type SfxName = 'attack' | 'hit' | 'hurt' | 'block' | 'dash' | 'ki' | 'beam' | 'swap' | 'select' | 'crunch';
export interface AudioSettings { musicVolume: number; sfxVolume: number }
type TrackMood = Exclude<Mood, 'off'>;
type Instrument = 'pulse' | 'triangle' | 'sine' | 'noise' | 'power';
type Lane = 'lead' | 'bass' | 'arp' | 'drum' | 'stab';
export interface MusicNote {
  lane: Lane; instrument: Instrument; midi: number; duration: number; volume: number;
  priority: number; offset?: number; filter?: number; slide?: number;
}
export interface TrackMetadata {
  label: string; bpm: number; introBars: number; loopBars: number;
  loopStartSeconds: number; loopDurationSeconds: number; hook: boolean;
}
function track(label: string, bpm: number, introBars: number, loopBars: number, hook = false): TrackMetadata {
  return Object.freeze({ label, bpm, introBars, loopBars, loopStartSeconds: introBars * 240 / bpm,
    loopDurationSeconds: loopBars * 240 / bpm, hook });
}
export const TRACK_METADATA: Readonly<Record<TrackMood, TrackMetadata>> = Object.freeze({
  title: track('Wayside Fury', 150, 4, 24, true),
  bbq: track('Before the Sky Broke', 104, 2, 16),
  hub: track('Last Train Home', 112, 2, 16, true),
  taxi: track('Redline Road', 160, 2, 24),
  cozy: track('Warm Windows', 96, 1, 16),
  dungeon: track('Under the Blast Yard', 136, 2, 24),
  boss: track('The Watcher Wakes', 175, 2, 24, true),
  haywire: track('Haywire Signal', 148, 2, 24),
});
// Spectrally transcribed from the SITE-OWNED scareathon-theme.mp3: audio input was
// unavailable, so this is not claimed to be an ear-verified transcription. The
// repeated G–D–Eb–C–Bb–D–A–F eighth-note contour is clear; octave is approximate.
export const SITE_HOOK: readonly number[] = Object.freeze([67, 74, 75, 72, 70, 74, 69, 65]);
const MELODIES: Record<TrackMood, readonly (readonly number[])[]> = {
  title: [[70, 74, 77, 79, 77, 74, 72, 74], [79, 77, 74, 72, 70, 72, 74, 77],
    [75, 79, 82, 79, 77, 75, 74, 72], [77, 81, 84, 81, 79, 77, 74, 72],
    [70, 77, 74, 79, 82, 79, 77, 74], [79, 82, 86, 82, 79, 77, 74, 72],
    [75, 77, 79, 82, 79, 75, 74, 72], [77, 79, 81, 84, 81, 77, 74, 70]],
  bbq: [[70, 74, 77, 74, 72, 70, 69, 72], [74, 79, 77, 74, 72, 74, 70, -1],
    [75, 79, 77, 75, 74, 72, 70, 74], [77, 81, 79, 77, 74, 72, 69, -1],
    [70, 72, 74, 77, 74, 70, 72, -1], [79, 77, 74, 72, 74, 79, 77, -1],
    [75, 74, 72, 70, 72, 75, 79, 77], [77, 74, 72, 69, 70, -1, 70, -1]],
  hub: [[70, -1, 74, 77, 74, -1, 72, 70], [67, 70, 74, -1, 77, 74, 70, -1],
    [75, -1, 79, 77, 75, 74, 72, -1], [77, 74, 72, -1, 69, 72, 74, -1],
    [70, 74, 77, -1, 79, 77, 74, 72], [67, -1, 70, 74, 77, 74, 70, -1],
    [75, 79, 82, 79, 77, -1, 75, 74], [77, 74, 72, 69, 70, -1, 70, -1]],
  taxi: [[67, 70, 74, 77, 74, 70, 69, 70], [67, 74, 77, 79, 77, 74, 70, 69],
    [63, 67, 70, 75, 74, 70, 67, 65], [65, 69, 72, 77, 74, 72, 69, 65],
    [67, 74, 70, 77, 79, 77, 74, 70], [79, 77, 74, 70, 74, 77, 81, 79],
    [75, 74, 70, 67, 70, 75, 79, 77], [77, 74, 72, 69, 72, 74, 77, 74]],
  cozy: [[70, -1, 74, -1, 77, 74, 72, -1], [67, -1, 70, 74, 70, -1, 67, -1],
    [75, -1, 79, -1, 77, 75, 74, -1], [72, 74, 77, -1, 74, -1, 70, -1],
    [74, -1, 77, 79, 77, -1, 74, -1], [70, 74, 77, -1, 74, 70, 67, -1],
    [75, 77, 79, -1, 77, 75, 74, -1], [72, -1, 69, -1, 70, -1, -1, -1]],
  dungeon: [[67, -1, 70, -1, 69, -1, 65, -1], [62, -1, -1, 67, -1, 65, 62, -1],
    [63, -1, 67, -1, 70, -1, 69, -1], [62, -1, 65, -1, 66, 65, 62, -1],
    [67, -1, 74, -1, 70, 69, 67, -1], [65, -1, 69, -1, 70, -1, 74, -1],
    [63, 67, -1, 70, -1, 69, 67, -1], [62, -1, 66, 65, 62, -1, 69, -1]],
  boss: [[67, 70, 74, 73, 74, 77, 75, 74], [65, 69, 72, 71, 72, 77, 74, 72],
    [63, 67, 70, 69, 70, 75, 74, 70], [62, 66, 69, 68, 69, 74, 73, 69],
    [79, 77, 74, 70, 74, 73, 74, 77], [77, 74, 72, 69, 72, 71, 72, 74],
    [75, 74, 70, 67, 70, 69, 70, 74], [74, 73, 69, 66, 69, 70, 73, 74]],
  // A future-area palette, already playable: unstable accents and step lengths.
  haywire: [[67, 74, -1, 70, 73, -1, 74, 65], [65, -1, 72, 71, 69, 72, -1, 77],
    [63, 70, 69, -1, 75, 67, -1, 70], [62, 69, -1, 66, 73, -1, 74, 69],
    [79, -1, 74, 73, 70, 74, -1, 67], [77, 72, -1, 71, 74, 69, -1, 65],
    [75, -1, 70, 69, 74, -1, 67, 63], [74, 69, -1, 66, 73, 74, -1, 62]],
};
const BRIGHT_ROOTS = [46, 43, 51, 53];
const DARK_ROOTS = [43, 41, 39, 38];
/** Pure score, also used by the QA script. Durations/offsets are sixteenth steps. */
export function scoreStep(mood: TrackMood, absoluteBar: number, step: number, realm = false): MusicNote[] {
  const meta = TRACK_METADATA[mood];
  const intro = absoluteBar < meta.introBars;
  const bar = intro ? absoluteBar : (absoluteBar - meta.introBars) % meta.loopBars;
  const dark = mood === 'dungeon' || mood === 'boss' || mood === 'taxi' || mood === 'haywire';
  const roots = dark ? DARK_ROOTS : BRIGHT_ROOTS;
  const chord = Math.floor(bar / 2) % 4;
  const root = roots[chord];
  const minor = dark ? chord === 0 : chord === 1;
  const tones = [root + 24, root + (minor ? 27 : 28), root + 31, root + 36];
  const notes: MusicNote[] = [];
  const swing = mood === 'bbq' && step % 4 >= 2 ? 0.3 : 0;
  const sparse = mood === 'cozy' || mood === 'dungeon';
  const breakdown = !intro && bar >= meta.loopBars / 2 && bar < meta.loopBars / 2 + 2;
  const loud = mood === 'boss' || mood === 'taxi';
  const hook = !intro && meta.hook && (mood === 'title' ? bar >= meta.loopBars - 2 :
    mood === 'hub' ? bar % 8 === 7 : bar % 4 === 3);
  if (step % 2 === 0 && (!intro || bar >= meta.introBars - 1) && (!breakdown || step % 4 === 0)) {
    const midi = (hook ? SITE_HOOK : MELODIES[mood][bar % 8])[step / 2];
    if (midi >= 0) notes.push({ lane: 'lead', instrument: 'pulse', midi: midi + (mood === 'boss' && hook ? 12 : 0),
      duration: sparse ? 2.5 : 1.7, volume: loud ? 0.068 : 0.052, priority: 6, offset: swing });
  }
  if (step % (loud ? 2 : 4) === 0) {
    const chromatic = mood === 'boss' && step === 14 ? root - 1 : root;
    const midi = chromatic + (loud && step % 4 === 2 ? 12 : 0);
    notes.push({ lane: 'bass', instrument: 'triangle', midi, duration: loud ? 1.65 : 3.5,
      volume: 0.105, priority: 5, offset: swing });
  }
  if (step % 2 === 1 && (!intro || bar > 0) && !breakdown && (!sparse || step % 4 === 1)) {
    notes.push({ lane: 'arp', instrument: 'pulse', midi: tones[(Math.floor(step / 2) + bar) % 4],
      duration: 0.62, volume: 0.023, priority: 3, offset: swing });
  }
  if (!intro || bar > 0) {
    if (step === 0 || step === 8 || (loud && step === 10)) notes.push({ lane: 'drum', instrument: 'sine',
      midi: 35, duration: 0.95, volume: 0.17, priority: 4, slide: -22 });
    else if ((step === 4 || step === 12) && !breakdown) notes.push({ lane: 'drum', instrument: 'noise',
      midi: 0, duration: 0.65, volume: 0.12, priority: 3, filter: 1900, offset: swing });
    else if (!breakdown && (mood === 'boss' ? true : step % 2 === 0) && (!realm || step % 4 === 2)) {
      notes.push({ lane: 'drum', instrument: 'noise', midi: 0, duration: 0.22, volume: 0.043,
        priority: 1, filter: 6500, offset: swing });
    }
  }
  if (!realm && loud && step === 0 && (!intro || bar > 0) && !breakdown) {
    notes.push({ lane: 'stab', instrument: 'power', midi: root + 12, duration: 2.4, volume: 0.033, priority: 2 });
  }
  return notes;
}
export interface VoiceSlot { id: number; start: number; end: number; priority: number }
export function peakOverlaps(slots: readonly VoiceSlot[]): number {
  const edges = slots.filter(v => v.end > v.start).flatMap(v => [[v.start, 1], [v.end, -1]]);
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let active = 0, peak = 0;
  for (const edge of edges) { active += edge[1]; peak = Math.max(peak, active); }
  return peak;
}
/** Reserves audible intervals, including lookahead notes, across BOTH audio buses. */
export class VoiceBudget {
  readonly limit: number;
  peak = 0;
  private nextId = 1;
  private slots = new Map<number, VoiceSlot>();
  constructor(limit = 8) { this.limit = limit; }
  reserve(start: number, end: number, priority: number): { id: number; stolen: number[] } | null {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const candidate = { id: this.nextId, start, end, priority };
    const proposed = new Map([...this.slots].map(([id, value]) => [id, { ...value }]));
    const stolen: number[] = [];
    while (peakOverlaps([...proposed.values(), candidate]) > this.limit) {
      const edges = [...proposed.values(), candidate].flatMap(v => [[v.start, 1], [v.end, -1]]);
      edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let count = 0, crowded = start;
      for (const [time, delta] of edges) { count += delta; if (count > this.limit) { crowded = time; break; } }
      const victim = [...proposed.values()].filter(v => v.start <= crowded && v.end > crowded && v.priority <= priority)
        .sort((a, b) => a.priority - b.priority || a.start - b.start)[0];
      if (!victim) return null;
      stolen.push(victim.id);
      if (victim.start >= start) proposed.delete(victim.id);
      else victim.end = start;
    }
    proposed.set(candidate.id, candidate);
    this.slots = proposed; this.nextId += 1;
    this.peak = Math.max(this.peak, peakOverlaps([...proposed.values()]));
    return { id: candidate.id, stolen };
  }
  release(id: number): void { this.slots.delete(id); }
  trim(id: number, end: number): void {
    const slot = this.slots.get(id);
    if (slot) { slot.end = Math.min(slot.end, end); if (slot.end <= slot.start) this.slots.delete(id); }
  }
  prune(now: number): void { for (const [id, slot] of this.slots) if (slot.end <= now) this.slots.delete(id); }
  active(now: number): number { return [...this.slots.values()].filter(v => v.start <= now && v.end > now).length; }
  clear(): void { this.slots.clear(); }
}
interface TrackRun { mood: TrackMood; gain: GainNode; bar: number; step: number; next: number;
  born: number; fadingIn: boolean; fadeEnd: number | null }
interface SourceVoice {
  id: number; source: OscillatorNode | AudioBufferSourceNode; gain: GainNode; nodes: AudioNode[];
  start: number; end: number; music: boolean; run?: TrackRun; lane?: Lane; pulse: boolean;
  baseMidi: number; vibrato: boolean; duty: number;
}
export interface MusicDebugSnapshot {
  context: string; mood: Mood; realm: number; paused: boolean; visible: boolean; unlocked: boolean;
  activeVoices: number; activeMusicVoices: number; musicPaletteLimit: number;
  scheduledVoices: number; peakVoices: number; voiceLimit: number;
  transport: { mood: TrackMood; bar: number; step: number; loopBar: number; intro: boolean } | null;
  outgoingMood: Mood | null; settings: AudioSettings; darkSky: boolean;
}
const midiHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value: number): number => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
export class MusicDirector {
  private createContext: (() => AudioContext) | undefined;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicInput: GainNode | null = null;
  private musicVolume: GainNode | null = null;
  private sfxVolume: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private realmFilter: BiquadFilterNode | null = null;
  private delayWet: GainNode | null = null;
  private graphNodes: AudioNode[] = [];
  private noise: AudioBuffer | null = null;
  private pulseWaves: PeriodicWave[] = [];
  private powerWave: PeriodicWave | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private resumePending: Promise<void> | null = null;
  private suspendPending: Promise<void> | null = null;
  private unlockSources = new Set<AudioBufferSourceNode>();
  private activeRun: TrackRun | null = null;
  private outgoingRun: TrackRun | null = null;
  private retiredRuns: TrackRun[] = [];
  private voices = new Map<number, SourceVoice>();
  private budget = new VoiceBudget(8);
  private mood: Mood = 'off';
  private realm = 0;
  private realmApplied = false;
  private paused = false;
  private visible = true;
  private unlocked = false;
  private disposed = false;
  private settings: AudioSettings = { musicVolume: 0.6, sfxVolume: 0.8 };
  private charge: number | null = null;
  private chargeVoice: number | null = null;
  private droneVoice: number | null = null;
  private darkSky = false;
  private duckUntil = 0;
  private lastJingle = new Map<Jingle, number>();
  constructor(createContext?: () => AudioContext) { this.createContext = createContext; }
  unlock(): Promise<void> {
    if (this.disposed || !this.visible) return Promise.resolve();
    this.unlocked = true;
    if (!this.ctx) {
      const browser = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const Context = browser.AudioContext || browser.webkitAudioContext;
      // iOS mutes Web Audio under the ring/silent switch unless the session is media playback.
      const session = (globalThis.navigator as Navigator & { audioSession?: { type: string } } | undefined)?.audioSession;
      if (!this.createContext && session) { try { session.type = "playback"; } catch { /* unsupported */ } }
      if (!this.createContext && !Context) return Promise.resolve();
      try { this.ctx = this.createContext ? this.createContext() : new Context!(); this.buildGraph(); }
      catch {
        const failed = this.ctx; this.ctx = null;
        if (failed) void failed.close().catch(() => undefined);
        this.graphNodes = []; this.realmApplied = false;
        return Promise.resolve();
      }
    }
    // These calls must stay on the real gesture's stack. In particular, a
    // pending hide/suspend or an autoplay-blocked resume must not consume the
    // touchend/click activation that WebKit needs to unlock its output device.
    const suspension = this.suspendPending;
    const resuming = this.resume(true);
    this.startUnlockSample();
    return suspension ? Promise.all([suspension, resuming]).then(() => this.resume()) : resuming;
  }
  private startUnlockSample(): void {
    const ctx = this.ctx!;
    try {
      const source = ctx.createBufferSource();
      source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      source.connect(ctx.destination);
      this.unlockSources.add(source);
      source.onended = () => { source.disconnect(); this.unlockSources.delete(source); };
      source.start(ctx.currentTime);
      source.stop(ctx.currentTime + 1 / ctx.sampleRate);
    } catch { /* A future gesture can retry a device that is still interrupted. */ }
  }
  private resume(gesture = false): Promise<void> {
    if (!this.ctx || !this.visible || this.disposed) return Promise.resolve();
    if (this.resumePending && !gesture) return this.resumePending;
    const ctx = this.ctx;
    let resumed: Promise<void>;
    try {
      // "interrupted" is an additional iOS state. Every non-running state
      // needs recovery, and a new gesture must retry even an unresolved resume.
      resumed = gesture || ctx.state !== 'running' ? ctx.resume() : Promise.resolve();
    } catch { return Promise.resolve(); }
    const pending = resumed.then(() => {
      if (this.disposed || !this.visible || ctx.state !== 'running') return;
      // iOS can suspend a context without a visibility event. Mood intent may
      // change during that interruption, so never revive the stale score.
      if (this.activeRun && (this.activeRun.mood !== this.mood || this.darkSky)) {
        this.retireRun(this.activeRun, ctx.currentTime); this.activeRun = null;
        if (this.outgoingRun) this.retireRun(this.outgoingRun, ctx.currentTime);
        this.outgoingRun = null;
      }
      this.master?.gain.setTargetAtTime(0.72, ctx.currentTime, 0.025);
      if (!this.activeRun && this.mood !== 'off' && !this.darkSky) this.activeRun = this.makeRun(this.mood, false);
      if (!this.timer) this.timer = setInterval(() => this.tick(), 25);
      this.tick();
    }).catch(() => { /* A subsequent real gesture can retry an autoplay rejection. */ });
    this.resumePending = pending;
    void pending.then(() => { if (this.resumePending === pending) this.resumePending = null; });
    return pending;
  }
  private buildGraph(): void {
    const ctx = this.ctx!;
    const master = this.master = ctx.createGain(); master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16; compressor.knee.value = 12; compressor.ratio.value = 5;
    compressor.attack.value = 0.004; compressor.release.value = 0.15;
    master.connect(compressor); compressor.connect(ctx.destination);
    const input = this.musicInput = ctx.createGain();
    const music = this.musicVolume = ctx.createGain(); music.connect(master);
    const sfx = this.sfxVolume = ctx.createGain(); sfx.connect(master);
    const dry = this.dry = ctx.createGain(); input.connect(dry); dry.connect(music);
    const shaper = ctx.createWaveShaper();
    shaper.curve = Float32Array.from({ length: 2049 }, (_, i) => Math.round((i / 1024 - 1) * 16) / 16);
    shaper.oversample = 'none';
    const filter = this.realmFilter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 0.7;
    const wet = this.wet = ctx.createGain(); input.connect(shaper); shaper.connect(filter); filter.connect(wet); wet.connect(music);
    const delay = ctx.createDelay(0.5); delay.delayTime.value = 0.19;
    const delayFilter = ctx.createBiquadFilter(); delayFilter.type = 'lowpass'; delayFilter.frequency.value = 2300;
    const feedback = ctx.createGain(); feedback.gain.value = 0.19;
    const echo = this.delayWet = ctx.createGain(); echo.gain.value = 0;
    input.connect(delay); delay.connect(delayFilter); delayFilter.connect(feedback); feedback.connect(delay);
    delayFilter.connect(echo); echo.connect(music);
    this.graphNodes = [master, compressor, input, music, sfx, dry, shaper, filter, wet, delay, delayFilter, feedback, echo];
    const noise = this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0); let seed = 0x7351;
    for (let i = 0; i < data.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; data[i] = (seed >>> 0) / 0x80000000 - 1; }
    this.pulseWaves = [0.125, 0.25, 0.5, 0.75].map(duty => {
      const real = new Float32Array(33), imaginary = new Float32Array(33);
      for (let n = 1; n <= 32; n++) { real[n] = Math.sin(2 * Math.PI * n * duty) / n;
        imaginary[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / n; }
      return ctx.createPeriodicWave(real, imaginary);
    });
    const real = new Float32Array(9), imaginary = new Float32Array(9);
    imaginary[1] = 1; imaginary[2] = 0.5; imaginary[3] = 0.45; imaginary[6] = 0.15;
    this.powerWave = ctx.createPeriodicWave(real, imaginary);
    this.applySettings(); this.setRealm(this.realm);
  }
  setMood(mood: Mood): void {
    if (this.disposed || this.mood === mood) return;
    this.mood = mood; this.darkSky = false;
    this.releaseVoice(this.droneVoice, 0.07); this.droneVoice = null;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.visible) return;
    const now = ctx.currentTime;
    if (this.outgoingRun) this.retireRun(this.outgoingRun, now + 0.025);
    this.outgoingRun = this.activeRun;
    if (this.outgoingRun) {
      this.outgoingRun.fadeEnd = now + 0.8;
      this.outgoingRun.gain.gain.cancelScheduledValues(now);
      const level = this.outgoingRun.fadingIn ? clamp((now - this.outgoingRun.born) / 0.8) : 1;
      this.outgoingRun.fadingIn = false;
      this.outgoingRun.gain.gain.setValueAtTime(level, now);
      this.outgoingRun.gain.gain.linearRampToValueAtTime(0, now + 0.8);
    }
    this.activeRun = mood === 'off' ? null : this.makeRun(mood, true);
    this.delayWet?.gain.setTargetAtTime(mood === 'dungeon' ? 0.14 : 0, now, 0.2);
    this.tick();
  }
  private makeRun(mood: TrackMood, fade: boolean): TrackRun {
    const ctx = this.ctx!; const gain = ctx.createGain(); gain.connect(this.musicInput!);
    gain.gain.setValueAtTime(fade ? 0 : 1, ctx.currentTime);
    if (fade) gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.8);
    this.delayWet?.gain.setTargetAtTime(mood === 'dungeon' ? 0.14 : 0, ctx.currentTime, 0.2);
    return { mood, gain, bar: 0, step: 0, next: ctx.currentTime + 0.035,
      born: ctx.currentTime, fadingIn: fade, fadeEnd: null };
  }
  setRealm(amount: number): void {
    const next = clamp(amount);
    if (next === this.realm && this.realmApplied) return;
    this.realm = next;
    const ctx = this.ctx; if (!ctx) return;
    this.realmApplied = true;
    for (const [node, target] of [[this.dry, 1 - this.realm], [this.wet, this.realm]] as const) if (node) {
      node.gain.cancelScheduledValues(ctx.currentTime);
      node.gain.setValueAtTime(node.gain.value, ctx.currentTime);
      node.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.8);
    }
    this.realmFilter?.frequency.setTargetAtTime(7000 - this.realm * 4200, ctx.currentTime, 0.18);
    for (const voice of this.voices.values()) if (voice.music) {
      if (this.realm > 0.01 && voice.lane === 'stab') this.stopVoiceAt(voice.id, ctx.currentTime + 0.03);
      if ('detune' in voice.source) voice.source.detune.setTargetAtTime(-300 * this.realm, ctx.currentTime, 0.18);
    }
  }
  setSettings(settings: AudioSettings): void {
    this.settings = { musicVolume: Number.isFinite(settings.musicVolume) ? clamp(settings.musicVolume) : 0.6,
      sfxVolume: Number.isFinite(settings.sfxVolume) ? clamp(settings.sfxVolume) : 0.8 };
    this.applySettings();
  }
  needsGesture(): boolean {
    return this.unlocked && this.visible && !this.disposed && this.ctx?.state !== 'running' &&
      (this.settings.musicVolume > 0 || this.settings.sfxVolume > 0);
  }
  private applySettings(): void {
    if (!this.ctx) return;
    const duck = this.paused ? 0.32 : this.ctx.currentTime < this.duckUntil ? 0.45 : 1;
    this.musicVolume?.gain.setTargetAtTime(this.settings.musicVolume * duck, this.ctx.currentTime, 0.04);
    this.sfxVolume?.gain.setTargetAtTime(this.settings.sfxVolume, this.ctx.currentTime, 0.025);
  }
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.setCharge(null);
    this.applySettings();
  }
  async setVisible(visible: boolean): Promise<void> {
    this.visible = visible;
    if (!this.ctx || this.disposed) return;
    if (visible) {
      if (this.suspendPending) await this.suspendPending;
      if (this.unlocked && this.visible) await this.resume();
      return;
    }
    this.master?.gain.setValueAtTime(0, this.ctx.currentTime);
    this.stopTransport();
    this.charge = null;
    this.suspendPending = this.ctx.suspend().catch(() => undefined).finally(() => { this.suspendPending = null; });
    await this.suspendPending;
  }
  private tick(): void {
    const ctx = this.ctx; if (!ctx || ctx.state !== 'running' || !this.visible || this.disposed) return;
    const now = ctx.currentTime; this.budget.prune(now);
    for (const run of this.retiredRuns) if (!this.hasRunVoices(run)) run.gain.disconnect();
    this.retiredRuns = this.retiredRuns.filter(run => this.hasRunVoices(run));
    if (this.outgoingRun?.fadeEnd !== null && this.outgoingRun && now >= this.outgoingRun.fadeEnd!) {
      this.retireRun(this.outgoingRun, now); this.outgoingRun = null;
    }
    if (!this.darkSky) {
      if (this.activeRun) this.scheduleRun(this.activeRun, now);
      if (this.outgoingRun) this.scheduleRun(this.outgoingRun, now);
    } else if (this.droneVoice === null) this.startDrone();
    for (const voice of this.voices.values()) {
      if (voice.start > now || voice.end <= now || !('detune' in voice.source)) continue;
      const age = now - voice.start;
      const cents = (voice.music ? -300 * this.realm : 0) + (voice.vibrato ? Math.sin(age * Math.PI * 12) * 11 : 0);
      voice.source.detune.setTargetAtTime(cents, now, 0.012);
      if (voice.pulse && 'setPeriodicWave' in voice.source) {
        const duty = Math.floor(age * 9) % 4;
        if (duty !== voice.duty) { voice.source.setPeriodicWave(this.pulseWaves[duty]); voice.duty = duty; }
      }
    }
    if (this.charge !== null && !this.paused && this.chargeVoice === null) this.startCharge();
    this.applySettings();
  }
  private scheduleRun(run: TrackRun, now: number): void {
    const meta = TRACK_METADATA[run.mood];
    if (run.next < now) run.next = now + 0.02; // Do not schedule in the past or replay a stalled tab's backlog.
    let guard = 0;
    while (run.next < now + 0.13 && guard++ < 32) {
      if (run.fadeEnd !== null && run.next >= run.fadeEnd) break;
      const stepDuration = 15 / meta.bpm;
      for (const note of scoreStep(run.mood, run.bar, run.step, this.realm > 0.01)) {
        // Crossfade stems remain clear, rather than doubling dense percussion/arps.
        if (this.outgoingRun && note.lane !== 'lead' && note.lane !== 'bass' &&
            (run === this.outgoingRun || note.lane === 'stab' || note.lane === 'arp')) continue;
        const start = run.next + (note.offset ?? 0) * stepDuration;
        const end = Math.min(start + note.duration * stepDuration, run.fadeEnd ?? Infinity);
        this.note(note.instrument, note.midi, start, end, note.volume, note.priority - (run === this.outgoingRun ? 2 : 0),
          run.gain, true, run, note.filter, note.slide, note.lane === 'lead', note.lane);
      }
      const wobble = run.mood === 'haywire' ? 1 + Math.sin((run.bar * 16 + run.step) * 1.7) * 0.03 : 1;
      run.next += stepDuration * wobble;
      run.step += 1;
      if (run.step === 16) { run.step = 0; run.bar += 1;
        if (run.bar >= meta.introBars + meta.loopBars) run.bar = meta.introBars; }
    }
  }
  private note(instrument: Instrument, midi: number, start: number, end: number, volume: number, priority: number,
    bus: AudioNode, music = false, run?: TrackRun, filterHz?: number, slide?: number, vibrato = false, lane?: Lane): number | null {
    const ctx = this.ctx; if (!ctx || end <= start || ctx.state !== 'running' || !this.visible) return null;
    // The realm palette is strictly monophonic in each of its four lanes, even
    // during a mood crossfade. SFX still share the global eight-source broker.
    if (music && lane && this.realm > 0.01) {
      for (const voice of this.voices.values()) if (voice.music && voice.lane === lane &&
        voice.start < end && voice.end > start) this.stopVoiceAt(voice.id, start);
    }
    const slot = this.budget.reserve(start, end, priority); if (!slot) return null;
    for (const id of slot.stolen) this.stopVoiceAt(id, start);
    const source = instrument === 'noise' ? ctx.createBufferSource() : ctx.createOscillator();
    const gain = ctx.createGain(); const nodes: AudioNode[] = [];
    if ('buffer' in source) { source.buffer = this.noise; source.loop = true; }
    else {
      source.frequency.setValueAtTime(midiHz(midi), start);
      if (slide !== undefined) source.frequency.exponentialRampToValueAtTime(midiHz(midi + slide), end);
      source.detune.setValueAtTime(music ? -300 * this.realm : 0, start);
      if (instrument === 'pulse') source.setPeriodicWave(this.pulseWaves[1]);
      else if (instrument === 'power') source.setPeriodicWave(this.powerWave!);
      else source.type = instrument as OscillatorType;
    }
    if (filterHz && instrument === 'noise') {
      const filter = ctx.createBiquadFilter(); filter.type = filterHz > 3000 ? 'highpass' : 'bandpass';
      filter.frequency.value = filterHz; filter.Q.value = 0.65;
      source.connect(filter); filter.connect(gain); nodes.push(filter);
    } else source.connect(gain);
    gain.connect(bus);
    const attack = Math.min(0.008, (end - start) / 4), release = Math.min(0.028, (end - start) / 3);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.setValueAtTime(volume, Math.max(start + attack, end - release)); gain.gain.linearRampToValueAtTime(0, end);
    const voice: SourceVoice = { id: slot.id, source, gain, nodes, start, end, music, run, lane,
      pulse: instrument === 'pulse' && music, baseMidi: midi, vibrato, duty: 1 };
    this.voices.set(slot.id, voice);
    source.onended = () => {
      source.disconnect(); gain.disconnect(); for (const node of nodes) node.disconnect();
      this.voices.delete(slot.id); this.budget.release(slot.id);
      if (this.chargeVoice === slot.id) this.chargeVoice = null;
      if (this.droneVoice === slot.id) this.droneVoice = null;
    };
    source.start(start); source.stop(end); return slot.id;
  }
  private stopVoiceAt(id: number, at: number): void {
    const voice = this.voices.get(id); if (!voice || !this.ctx) return;
    const now = this.ctx.currentTime, stop = Math.max(now, at);
    voice.gain.gain.cancelScheduledValues(now);
    if (voice.start < stop) { voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, stop); }
    else voice.gain.gain.setValueAtTime(0, now);
    voice.end = stop; this.budget.trim(id, stop);
    try { voice.source.stop(stop); } catch { /* Already ended. */ }
  }
  private releaseVoice(id: number | null, duration = 0.02): void {
    if (id !== null && this.ctx) this.stopVoiceAt(id, this.ctx.currentTime + duration);
  }
  private hasRunVoices(run: TrackRun): boolean { return [...this.voices.values()].some(v => v.run === run); }
  private retireRun(run: TrackRun, at: number): void {
    for (const voice of this.voices.values()) if (voice.run === run) this.stopVoiceAt(voice.id, at);
    if (this.hasRunVoices(run)) this.retiredRuns.push(run); else run.gain.disconnect();
  }
  setCharge(amount: number | null): void {
    this.charge = amount === null ? null : clamp(amount);
    if (this.charge === null || this.paused) { this.releaseVoice(this.chargeVoice); this.chargeVoice = null; return; }
    if (!this.ctx || !this.visible || this.ctx.state !== 'running') return;
    if (this.chargeVoice === null) this.startCharge();
    const voice = this.chargeVoice === null ? undefined : this.voices.get(this.chargeVoice);
    if (voice && 'frequency' in voice.source) {
      voice.source.frequency.setTargetAtTime(240 + this.charge * 760, this.ctx.currentTime, 0.035);
      voice.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      voice.gain.gain.setTargetAtTime(0.025 + this.charge * 0.045, this.ctx.currentTime, 0.035);
    }
  }
  private startCharge(): void {
    if (!this.ctx || !this.sfxVolume || this.charge === null) return;
    const midi = 69 + 12 * Math.log2((240 + (this.charge ?? 0) * 760) / 440);
    this.chargeVoice = this.note('triangle', midi, this.ctx.currentTime + 0.015, this.ctx.currentTime + 3600,
      0.025 + (this.charge ?? 0) * 0.045, 7, this.sfxVolume);
  }
  private startDrone(): void {
    if (!this.ctx || !this.musicInput || this.droneVoice !== null) return;
    this.droneVoice = this.note('triangle', 31, this.ctx.currentTime + 0.015, this.ctx.currentTime + 3600,
      0.065, 4, this.musicInput, true);
  }
  playSfx(name: SfxName, strength = 1): void {
    const ctx = this.ctx, bus = this.sfxVolume;
    if (!ctx || !bus || !this.visible || this.disposed || ctx.state !== 'running') return;
    const start = ctx.currentTime + 0.015, volume = Math.min(1.5, Math.max(0.25, Number.isFinite(strength) ? strength : 1));
    const tone = (midi: number, duration: number, slide: number, amp = 0.13) =>
      this.note('pulse', midi, start, start + duration, amp * volume, 8, bus, false, undefined, undefined, slide);
    const noise = (duration: number, filter: number, amp = 0.12) =>
      this.note('noise', 0, start, start + duration, amp * volume, 7, bus, false, undefined, filter);
    switch (name) {
      case 'attack': noise(0.07, 4200, 0.10); tone(46, 0.075, -15, 0.075); break;
      case 'hit': tone(48, 0.09, -17); noise(0.055, 1200, 0.11); break;
      case 'hurt': tone(57, 0.22, -24); noise(0.12, 950, 0.12); break;
      case 'block': tone(83, 0.07, -5, 0.09); noise(0.055, 5400, 0.085); break;
      case 'dash': noise(0.14, 3300, 0.1); break;
      case 'ki': tone(67, 0.13, 16, 0.12); break;
      case 'beam': tone(45, 0.3, 29, 0.105); noise(0.25, 2200, 0.11); break;
      case 'swap': tone(79, 0.1, 7, 0.07); break;
      case 'select': tone(81, 0.055, 0, 0.065); break;
      case 'crunch': tone(35, 0.32, -23, 0.16); noise(0.28, 1700, 0.22); noise(0.1, 6400, 0.12); break;
    }
  }
  jingle(name: Jingle): void {
    if (this.disposed) return;
    // These events change the score even before the first gesture finishes
    // resuming audio, or while the page is hidden. Only transient notes are lost.
    if (name === 'darkSky') { this.darkSky = true; this.cutMusic(); }
    else if (name === 'gameOver') {
      this.mood = 'off'; this.darkSky = false; this.releaseVoice(this.droneVoice); this.droneVoice = null;
      this.cutMusic();
    }
    const ctx = this.ctx, bus = this.sfxVolume;
    if (!ctx || !bus || !this.visible || this.disposed || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.lastJingle.get(name) ?? -Infinity) < 0.25) return;
    this.lastJingle.set(name, now);
    this.duckUntil = Math.max(this.duckUntil, now + (name === 'victory' ? 1.65 : 0.65));
    this.applySettings();
    const play = (pitches: number[], spacing: number, duration: number, instrument: Instrument = 'pulse') => {
      pitches.forEach((midi, i) => this.note(instrument, midi, now + 0.015 + i * spacing,
        now + 0.015 + i * spacing + duration, 0.09, 10, bus));
    };
    switch (name) {
      case 'victory': play([70, 74, 77, 79, 82, 77, 82], 0.16, 0.14);
        this.note('triangle', 46, now + 0.015, now + 1.35, 0.1, 10, bus); break;
      case 'level': play([72, 76, 79, 84], 0.085, 0.075); break;
      case 'item': play([84, 89], 0.11, 0.12); break;
      case 'taxiHorn': play([70, 74, 70, 74], 0.075, 0.16, 'triangle'); break;
      case 'gameOver': play([67, 63, 60, 58, 57, 55], 0.22, 0.2, 'triangle'); break;
      case 'darkSky':
        this.note('noise', 0, now + 0.015, now + 0.48, 0.15, 10, bus, false, undefined, 700);
        this.note('power', 43, now + 0.015, now + 0.8, 0.075, 10, bus, false, undefined, undefined, -12);
        this.startDrone(); break;
    }
  }
  private cutMusic(): void {
    if (!this.ctx) return;
    const end = this.ctx.currentTime + (this.visible && this.ctx.state === 'running' ? 0.04 : 0);
    if (this.activeRun) this.retireRun(this.activeRun, end);
    if (this.outgoingRun) this.retireRun(this.outgoingRun, end);
    this.activeRun = null; this.outgoingRun = null;
  }
  private stopTransport(): void {
    if (this.timer) clearInterval(this.timer); this.timer = null;
    const now = this.ctx?.currentTime ?? 0;
    for (const voice of this.voices.values()) this.stopVoiceAt(voice.id, now);
    const runs = new Set([this.activeRun, this.outgoingRun, ...this.retiredRuns]);
    for (const run of runs) run?.gain.disconnect();
    this.activeRun = null; this.outgoingRun = null; this.retiredRuns = [];
    this.budget.clear(); this.chargeVoice = null; this.droneVoice = null;
  }
  debugSnapshot(): MusicDebugSnapshot {
    const run = this.activeRun; const meta = run ? TRACK_METADATA[run.mood] : null;
    const now = this.ctx?.currentTime ?? 0;
    return { context: this.ctx?.state ?? 'locked', mood: this.mood, realm: this.realm, paused: this.paused,
      visible: this.visible, unlocked: this.unlocked, activeVoices: this.budget.active(now),
      activeMusicVoices: [...this.voices.values()].filter(v => v.music && v.start <= now && v.end > now).length,
      musicPaletteLimit: this.realm > 0.01 ? 4 : 8,
      scheduledVoices: this.voices.size, peakVoices: this.budget.peak, voiceLimit: this.budget.limit,
      transport: run && meta ? { mood: run.mood, bar: run.bar, step: run.step, intro: run.bar < meta.introBars,
        loopBar: run.bar < meta.introBars ? -1 : (run.bar - meta.introBars) % meta.loopBars } : null,
      outgoingMood: this.outgoingRun?.mood ?? null, settings: { ...this.settings }, darkSky: this.darkSky };
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.stopTransport();
    for (const source of this.unlockSources) { source.disconnect(); source.onended = null; }
    this.unlockSources.clear();
    for (const voice of this.voices.values()) { voice.source.disconnect(); voice.gain.disconnect();
      for (const node of voice.nodes) node.disconnect(); voice.source.onended = null; }
    this.voices.clear();
    for (const node of this.graphNodes) node.disconnect(); this.graphNodes = [];
    if (this.ctx) void this.ctx.close().catch(() => undefined);
  }
}
