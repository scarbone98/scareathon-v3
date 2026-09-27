// Ghost Ridge's soundtrack: original jungle made in the browser. A breakbeat
// is synthesized once, then chopped and rearranged every bar like a sampler
// would, under a detuned reese bass, dark pads, rave stabs and a theremin
// wail. The sound effects share the same audio graph.

const BPM = 170;
const STEP = 60 / BPM / 4; // a sixteenth
const BAR = STEP * 16;
const LOOKAHEAD = 0.2;

// F minor, with a spooky flat-2 and flat-5 in the melody.
const ROOTS = [41, 41, 37, 39, 41, 41, 37, 36]; // one per bar, MIDI (F2, Db2, Eb2, C2)
const CHORDS: Record<number, number[]> = {
  41: [65, 68, 72, 75], // Fm7
  37: [61, 65, 68, 72], // Dbmaj7
  39: [63, 67, 70, 74], // Eb
  36: [60, 64, 67, 70], // C7
};
const MELODY = [77, -1, 80, 79, -1, 77, 76, -1, 77, -1, -1, 72, 73, -1, 71, -1];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// Slices of the break to play each sixteenth. -1 is a rest; r marks a
// reversed slice, and a rate pitches the slice up for rolls.
type Slice = { i: number; r?: boolean; rate?: number };
const S = (...xs: (number | Slice)[]) => xs.map((x) => (typeof x === "number" ? { i: x } : x));
const CHOPS: Slice[][] = [
  S(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15),
  S(0, 1, 2, 3, 4, 5, 4, 5, 8, 9, 10, 11, 12, 13, 12, 15),
  S(0, 1, 4, 3, 4, 5, 10, 11, 0, 1, 2, 3, 12, 13, 14, 15),
  S(0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 2, 3, 12, 13, 4, 7),
  S(0, 1, 2, 3, 12, 5, 6, 7, 8, 9, 10, 11, { i: 12, r: true }, { i: 12, r: true }, 4, 15),
];
const FILLS: Slice[][] = [
  S(0, 1, 2, 3, 4, 5, 6, 7, 12, 12, { i: 12, rate: 1.1 }, { i: 12, rate: 1.2 }, { i: 4, rate: 1.3 }, { i: 4, rate: 1.4 }, { i: 4, rate: 1.55 }, { i: 4, rate: 1.7 }),
  S(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, { i: 4, r: true }, { i: 5, r: true }, 12, 12, 12, 12),
];

type Mood = "off" | "menu" | "ride" | "end";

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private drums!: GainNode;
  private drumFilter!: BiquadFilterNode;
  private sfx!: GainNode;
  private verb!: ConvolverNode;
  private verbSend!: GainNode;
  private delay!: DelayNode;
  private delaySend!: GainNode;
  private breakBuf!: AudioBuffer;
  private breakRev!: AudioBuffer;
  private noise!: AudioBuffer;
  private carveGain!: GainNode;
  private carveFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private timer = 0;
  private nextTime = 0;
  private bar = 0;
  private step = 0;
  private chop = CHOPS[0];
  private mood: Mood = "off";
  private muted = false;
  private rnd = Math.random;

  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  private build() {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = 20000;
    this.music = ctx.createGain();
    this.music.gain.value = 0.8;
    this.music.connect(this.musicFilter).connect(this.master);

    this.drumFilter = ctx.createBiquadFilter();
    this.drumFilter.type = "lowpass";
    this.drumFilter.frequency.value = 20000;
    this.drums = ctx.createGain();
    this.drums.connect(this.drumFilter).connect(this.music);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.8);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.5;
    this.verbSend.connect(this.verb).connect(this.music);

    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dFilter = ctx.createBiquadFilter();
    dFilter.type = "bandpass";
    dFilter.frequency.value = 1500;
    this.delaySend = ctx.createGain();
    this.delaySend.connect(this.delay);
    this.delay.connect(dFilter).connect(fb).connect(this.delay);
    dFilter.connect(this.music);
    dFilter.connect(this.verbSend);

    this.breakBuf = this.renderBreak();
    this.breakRev = this.reversed(this.breakBuf);
    this.noise = this.noiseBuffer(2);

    // Board and wind noise run all the time, turned up and down.
    const carve = ctx.createBufferSource();
    carve.buffer = this.noise;
    carve.loop = true;
    this.carveFilter = ctx.createBiquadFilter();
    this.carveFilter.type = "bandpass";
    this.carveFilter.frequency.value = 1800;
    this.carveFilter.Q.value = 0.7;
    this.carveGain = ctx.createGain();
    this.carveGain.gain.value = 0;
    carve.connect(this.carveFilter).connect(this.carveGain).connect(this.sfx);
    carve.start();
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    wind.playbackRate.value = 0.5;
    const wf = ctx.createBiquadFilter();
    wf.type = "lowpass";
    wf.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(wf).connect(this.windGain).connect(this.sfx);
    wind.start(0, 0.7);

    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  dispose() {
    window.clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }

  // ---------- the break ----------

  private noiseBuffer(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  private reversed(buf: AudioBuffer) {
    const out = this.ctx!.createBuffer(1, buf.length, buf.sampleRate);
    const src = buf.getChannelData(0);
    const dst = out.getChannelData(0);
    // Reverse each sixteenth in place, so slice i reversed is still at i.
    const n = Math.floor(buf.length / 16);
    for (let s = 0; s < 16; s++) for (let j = 0; j < n; j++) dst[s * n + j] = src[s * n + (n - 1 - j)];
    return out;
  }

  // One bar of a funky breakbeat, drawn sample by sample.
  private renderBreak() {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(BAR * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const at = (step: number) => Math.floor(step * STEP * sr + (step % 2 ? STEP * 0.12 * sr : 0));
    let lp = 0;
    let hpPrev = 0;
    let hpOut = 0;
    const kick = (step: number, vol: number) => {
      const s0 = at(step);
      let ph = 0;
      for (let i = 0; i < sr * 0.32 && s0 + i < len; i++) {
        const t = i / sr;
        const f = 48 + 110 * Math.exp(-t * 28);
        ph += (2 * Math.PI * f) / sr;
        out[s0 + i] += Math.sin(ph) * Math.exp(-t * 9) * vol + (i < 40 ? (Math.random() - 0.5) * 0.4 * vol : 0);
      }
    };
    const snare = (step: number, vol: number) => {
      const s0 = at(step);
      let ph = 0;
      lp = 0;
      for (let i = 0; i < sr * 0.28 && s0 + i < len; i++) {
        const t = i / sr;
        ph += (2 * Math.PI * (185 - t * 60)) / sr;
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * 0.55;
        out[s0 + i] += (Math.sin(ph) * Math.exp(-t * 30) * 0.7 + lp * Math.exp(-t * 14) * 0.9) * vol;
      }
    };
    const hat = (step: number, vol: number, decay: number) => {
      const s0 = at(step);
      for (let i = 0; i < sr * 0.12 && s0 + i < len; i++) {
        const t = i / sr;
        const n = Math.random() * 2 - 1;
        hpOut = 0.6 * (hpOut + n - hpPrev);
        hpPrev = n;
        out[s0 + i] += hpOut * Math.exp(-t * decay) * vol;
      }
    };
    // An original pattern in the spirit of the classic funk breaks.
    kick(0, 1);
    kick(2, 0.8);
    kick(10, 1);
    kick(11, 0.7);
    snare(4, 1);
    snare(7, 0.35);
    snare(9, 0.4);
    snare(12, 1);
    snare(14, 0.3);
    snare(15, 0.45);
    for (let s = 0; s < 16; s += 2) hat(s, s % 4 === 0 ? 0.35 : 0.5, 45);
    for (const s of [3, 6, 13]) hat(s, 0.22, 70);
    hat(8, 0.3, 12);
    // A little room and grit, like a sampled record.
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const room = i > 900 ? out[i - 900] * 0.18 + (i > 2100 ? out[i - 2100] * 0.1 : 0) : 0;
      out[i] = Math.tanh((out[i] + room) * 1.6);
      peak = Math.max(peak, Math.abs(out[i]));
    }
    for (let i = 0; i < len; i++) out[i] /= peak;
    return buf;
  }

  // ---------- the arrangement ----------

  setMood(mood: Mood) {
    if (!this.ctx || mood === this.mood) return;
    const now = this.ctx.currentTime;
    if (this.mood === "off") {
      this.nextTime = now + 0.08;
      this.bar = 0;
      this.step = 0;
    }
    // A new run starts the tune from the top.
    if (mood === "ride") {
      this.bar = 0;
      this.step = 0;
      this.nextTime = Math.max(now + 0.05, this.nextTime);
    }
    this.mood = mood;
    this.drumFilter.frequency.setTargetAtTime(mood === "ride" ? 20000 : 650, now, 0.4);
    this.music.gain.setTargetAtTime(mood === "off" ? 0 : mood === "end" ? 0.55 : 0.8, now, 0.3);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || this.mood === "off") return;
    // Tabs in the background get throttled; skip ahead rather than pile up.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.nextTime);
      this.nextTime += STEP;
      if (++this.step === 16) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  private playStep(t: number) {
    const s = this.step;
    const bar = this.bar;
    const ride = this.mood === "ride";
    // 32-bar song: 4 bars intro, 20 bars rolling, 4 bars breakdown, 4 bars drop.
    const section = bar % 32;
    const intro = ride && bar < 4;
    const breakdown = ride && section >= 24 && section < 28;
    const drums = !breakdown && (this.mood !== "menu" || bar % 8 >= 4);

    if (s === 0) {
      const phraseEnd = bar % 4 === 3;
      this.chop = phraseEnd || section === 23 ? FILLS[Math.floor(this.rnd() * FILLS.length)] : CHOPS[Math.floor(this.rnd() * CHOPS.length)];
      if (bar % 2 === 0) this.pad(t, ROOTS[bar % 8], bar % 8 === 0 ? 2 : 2);
      if (breakdown || this.mood === "menu" || section >= 28) {
        if (bar % 2 === 0) this.theremin(t, bar);
      }
      if (intro) this.drumFilter.frequency.setTargetAtTime(bar === 3 ? 20000 : 400 + bar * 500, t, 0.5);
    }
    if (drums) {
      const slice = this.chop[s];
      if (slice.i >= 0) this.slice(t, slice);
      // Extra sub kick under the downbeats.
      if (ride && !intro && (s === 0 || s === 10)) this.sub(t);
    }
    if (!breakdown && !intro && this.mood !== "end") this.bass(t, s, ROOTS[bar % 8], section >= 28);
    if (ride && !breakdown && !intro && section >= 12 && section < 24 && (s === 6 || s === 14) && bar % 2 === 1) this.stab(t, ROOTS[bar % 8]);
    if (ride && section >= 28 && s === 0 && bar % 2 === 0) this.stab(t, ROOTS[bar % 8]);
  }

  private slice(t: number, sl: Slice) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = sl.r ? this.breakRev : this.breakBuf;
    const rate = sl.rate ?? 1;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.85, t);
    g.gain.setValueAtTime(0.85, t + STEP * 0.9);
    g.gain.linearRampToValueAtTime(0, t + STEP);
    src.connect(g).connect(this.drums);
    src.start(t, sl.i * STEP, STEP * rate);
    if (sl.i === 4 || sl.i === 12) {
      const v = ctx.createGain();
      v.gain.value = 0.12;
      g.connect(v).connect(this.verbSend);
    }
  }

  private sub(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.32);
  }

  // A rolling reese: two detuned saws and a sine sub, filtered.
  private bass(t: number, s: number, root: number, busy: boolean) {
    const hits: Record<number, [number, number]> = busy
      ? { 0: [0, 3], 3: [0, 3], 6: [12, 2], 8: [0, 2], 10: [0, 3], 13: [-2, 3] }
      : { 0: [0, 6], 7: [0, 3], 10: [0, 4], 14: [3, 2] };
    const hit = hits[s];
    if (!hit) return;
    const ctx = this.ctx!;
    const f = hz(root - 12 + hit[0]);
    const dur = hit[1] * STEP;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.linearRampToValueAtTime(520, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(240, t + dur);
    lp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.01);
    g.gain.setValueAtTime(0.2, t + dur - 0.03);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g).connect(this.music);
    for (const det of [-14, 14]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
    const sub = ctx.createOscillator();
    sub.frequency.value = f / 2;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, t);
    sg.gain.linearRampToValueAtTime(0.32, t + 0.01);
    sg.gain.setValueAtTime(0.32, t + dur - 0.03);
    sg.gain.linearRampToValueAtTime(0, t + dur);
    sub.connect(sg).connect(this.music);
    sub.start(t);
    sub.stop(t + dur + 0.02);
  }

  private pad(t: number, root: number, bars: number) {
    const ctx = this.ctx!;
    const dur = BAR * bars;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(1400, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 1.2);
    g.gain.setValueAtTime(0.045, t + dur - 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.2);
    lp.connect(g);
    g.connect(this.music);
    g.connect(this.verbSend);
    for (const note of CHORDS[root] ?? CHORDS[41]) {
      for (const det of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(note - 12);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 0.3);
      }
    }
  }

  private stab(t: number, root: number) {
    const ctx = this.ctx!;
    const bp = ctx.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.setValueAtTime(3000, t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    bp.connect(g);
    g.connect(this.music);
    g.connect(this.delaySend);
    for (const note of CHORDS[root] ?? CHORDS[41]) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = hz(note);
      o.connect(bp);
      o.start(t);
      o.stop(t + 0.32);
    }
  }

  // A wobbly theremin line, the ghost of the tune.
  private theremin(t: number, bar: number) {
    const ctx = this.ctx!;
    const half = (bar / 2) % 2;
    for (let i = 0; i < 8; i++) {
      const note = MELODY[half * 8 + i];
      if (note < 0) continue;
      const nt = t + i * STEP * 4;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(hz(note) * 0.97, nt);
      o.frequency.exponentialRampToValueAtTime(hz(note), nt + 0.12);
      const vib = ctx.createOscillator();
      vib.frequency.value = 6;
      const vg = ctx.createGain();
      vg.gain.value = hz(note) * 0.02;
      vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, nt);
      g.gain.linearRampToValueAtTime(0.07, nt + 0.1);
      g.gain.linearRampToValueAtTime(0, nt + STEP * 7);
      o.connect(g);
      g.connect(this.music);
      g.connect(this.delaySend);
      g.connect(this.verbSend);
      o.start(nt);
      vib.start(nt);
      o.stop(nt + STEP * 7 + 0.05);
      vib.stop(nt + STEP * 7 + 0.05);
    }
  }

  // ---------- the ride ----------

  // Muffle the music while airborne; it slams back in on landing.
  setAir(air: boolean) {
    if (!this.ctx) return;
    this.musicFilter.frequency.setTargetAtTime(air ? 900 : 20000, this.ctx.currentTime, air ? 0.25 : 0.04);
  }

  setRide(speed: number, carve: number, air: boolean) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.carveGain.gain.setTargetAtTime(air ? 0 : Math.min(0.35, speed / 120 + carve * 0.25), now, 0.05);
    this.carveFilter.frequency.setTargetAtTime(900 + carve * 2500, now, 0.05);
    this.windGain.gain.setTargetAtTime(Math.min(0.3, (speed / 45) ** 2 * 0.25) * (air ? 1.4 : 1), now, 0.1);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.sfx);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private hiss(dur: number, freq: number, vol: number, type: BiquadFilterType = "lowpass") {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t0, Math.random());
    src.stop(t0 + dur);
  }

  readonly play = {
    beep: () => this.tone(520, 0.18, "square", 0.08),
    go: () => {
      this.tone(1040, 0.4, "square", 0.08);
      this.tone(780, 0.4, "square", 0.05);
    },
    jump: () => this.hiss(0.15, 3000, 0.2, "highpass"),
    land: (hard: number) => {
      this.hiss(0.25, 700, 0.25 + hard * 0.4);
      this.tone(90, 0.15, "sine", 0.2 + hard * 0.3, 45);
    },
    trick: (points: number) => {
      const notes = points > 2000 ? [72, 76, 79, 84, 88] : points > 1000 ? [72, 76, 79, 84] : [72, 79];
      notes.forEach((n, i) => this.tone(hz(n), 0.25, "square", 0.05, undefined, i * 0.06));
    },
    crash: () => {
      this.hiss(0.7, 500, 0.6);
      this.tone(160, 0.5, "sawtooth", 0.12, 50);
      if (this.ctx) {
        // The music stumbles.
        const now = this.ctx.currentTime;
        this.musicFilter.frequency.cancelScheduledValues(now);
        this.musicFilter.frequency.setValueAtTime(350, now);
        this.musicFilter.frequency.setTargetAtTime(20000, now + 0.9, 0.3);
      }
    },
    candy: () => {
      this.tone(1319, 0.06, "square", 0.05);
      this.tone(1760, 0.12, "square", 0.05, undefined, 0.05);
    },
    gate: () => [67, 71, 74, 79].forEach((n, i) => this.tone(hz(n + 12), 0.3, "triangle", 0.12, undefined, i * 0.08)),
    boost: () => this.hiss(0.5, 1200, 0.25, "bandpass"),
    finish: () => [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.tone(hz(n + 12), 0.35, "square", 0.06, undefined, i * 0.09)),
    timeup: () => [67, 63, 60, 55].forEach((n, i) => this.tone(hz(n), 0.4, "sawtooth", 0.06, undefined, i * 0.22)),
    ghost: () => this.tone(700, 0.9, "sine", 0.1, 300),
    select: () => this.tone(880, 0.08, "square", 0.05),
  };
}
