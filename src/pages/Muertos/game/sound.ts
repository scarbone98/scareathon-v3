// Every sound is synthesized in the browser: gunfire, groans, the church
// bell that tolls each round, and the night around El Morro, with the surf
// below the walls and coquís singing in the dark.

type Mood = "menu" | "play" | "over";
type GunSound = "pistol" | "rifle" | "shotgun" | "smg" | "lmg" | "ray";

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private music!: GainNode;
  private noise!: AudioBuffer;
  private muted = false;
  private paused = false;
  private mood: Mood = "menu";
  private lx = 0;
  private lz = 0;
  private lyaw = 0;
  private timers: number[] = [];
  private heart = 0;
  private danger = 99;
  private groaning = new Map<number, number>();
  private musicStep = 0;
  private nextBeat = 0;
  private lowHp = 1;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended" && !this.paused) this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.music = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.music.connect(this.master);
    this.amb.gain.value = 0.5;
    this.music.gain.value = 0.35;
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
    this.timers.push(window.setInterval(() => this.tickMusic(), 50));
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!this.ctx) return;
    if (p) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  setMood(m: Mood) {
    this.mood = m;
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(m === "menu" ? 0.3 : m === "play" ? 0.28 : 0.4, this.ctx.currentTime, 0.5);
    if (m === "over") this.gameOverSong();
  }

  setListener(x: number, z: number, yaw: number) {
    this.lx = x;
    this.lz = z;
    this.lyaw = yaw;
  }
  setDanger(d: number) {
    this.danger = d;
  }
  setLowHealth(f: number) {
    this.lowHp = f;
  }

  dispose() {
    for (const t of this.timers) clearInterval(t);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  // ---------- building blocks ----------

  private get t() {
    return this.ctx!.currentTime;
  }

  // A gain and pan for a sound at a place in the world.
  private at(x: number, z: number, range = 30): AudioNode | null {
    const ctx = this.ctx!;
    const dx = x - this.lx;
    const dz = z - this.lz;
    const d = Math.hypot(dx, dz);
    if (d > range) return null;
    const g = ctx.createGain();
    g.gain.value = Math.pow(1 - d / range, 1.6);
    const p = ctx.createStereoPanner();
    const ang = Math.atan2(dx, -dz) - this.lyaw;
    p.pan.value = Math.sin(ang) * Math.min(1, d / 3) * 0.8;
    g.connect(p).connect(this.sfx);
    return g;
  }

  private noiseBurst(out: AudioNode, when: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1, freqEnd?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, when);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, when + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    src.connect(f).connect(g).connect(out);
    src.start(when, Math.random());
    src.stop(when + dur + 0.05);
  }

  private tone(out: AudioNode, when: number, dur: number, freq: number, vol: number, type: OscillatorType = "sine", freqEnd?: number, attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(out);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  // The bell of San José: a few inharmonic partials, slowly dying.
  private bell(when: number, base: number, vol: number, out: AudioNode = this.music) {
    for (const [ratio, v, dur] of [
      [0.5, 0.5, 5],
      [1, 1, 4],
      [1.19, 0.5, 3],
      [1.5, 0.35, 2.5],
      [2.0, 0.3, 2],
      [2.74, 0.2, 1.4],
      [3.76, 0.12, 0.9],
    ])
      this.tone(out, when, dur, base * ratio, vol * v, "sine", undefined, 0.004);
  }

  // ---------- ambience ----------

  private startAmbience() {
    const ctx = this.ctx!;
    // Surf: low noise swelling and falling.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = ctx.createGain();
    lg.gain.value = 0.12;
    lfo.connect(lg).connect(g.gain);
    src.connect(f).connect(g).connect(this.amb);
    src.start();
    lfo.start();
    // Wind, higher and thinner.
    const w = ctx.createBufferSource();
    w.buffer = this.noise;
    w.loop = true;
    w.playbackRate.value = 0.5;
    const wf = ctx.createBiquadFilter();
    wf.type = "bandpass";
    wf.frequency.value = 700;
    wf.Q.value = 3;
    const wg = ctx.createGain();
    wg.gain.value = 0.04;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.07;
    const wlg = ctx.createGain();
    wlg.gain.value = 300;
    wl.connect(wlg).connect(wf.frequency);
    w.connect(wf).connect(wg).connect(this.amb);
    w.start();
    wl.start();
    // Coquís: "co-QUÍ", now here, now there.
    const coqui = () => {
      if (!this.ctx) return;
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 2 - 1;
      const g2 = ctx.createGain();
      g2.gain.value = 0.05 + Math.random() * 0.06;
      g2.connect(pan).connect(this.amb);
      const t = this.t + 0.05;
      const reps = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < reps; i++) {
        const t0 = t + i * 0.5;
        this.tone(g2, t0, 0.09, 1150, 0.5, "sine", 1100);
        this.tone(g2, t0 + 0.13, 0.16, 1850, 0.5, "sine", 2150);
      }
      this.timers.push(window.setTimeout(coqui, 700 + Math.random() * 2600));
    };
    coqui();
  }

  // Music: a slow minor drone and a barril drum that quickens when the
  // dead get close, over a heartbeat when you're hurt.
  private tickMusic() {
    if (!this.ctx || this.paused) return;
    const now = this.t;
    if (this.nextBeat < now) this.nextBeat = now + 0.05;
    while (this.nextBeat < now + 0.2) {
      const t = this.nextBeat;
      const s = this.musicStep++;
      const bpm = this.mood === "play" && this.danger < 8 ? 112 : 92;
      const beat = 60 / bpm / 2;
      this.nextBeat += beat;
      if (this.mood === "over") continue;
      const bar = s % 16;
      // Drone, every two bars.
      if (bar === 0 && s % 32 === 0) {
        for (const f of [55, 82.4, 110 * (this.mood === "menu" ? 1.2 : 1.189)]) this.tone(this.music, t, beat * 32, f, 0.05, "triangle", undefined, 1.5);
      }
      if (this.mood === "play" && this.danger < 18) {
        // Bomba-ish barril: low open hits and slaps.
        const pat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
        if (pat[bar]) this.tone(this.music, t, 0.25, bar % 4 === 0 ? 90 : 130, 0.25, "sine", 50);
        if (bar % 4 === 2) this.noiseBurst(this.music, t, 0.06, 0.1, "bandpass", 1800, 2);
      }
      // A cuatro-ish pluck, now and then, in a minor key.
      if (bar % 4 === 0 && Math.random() < (this.mood === "menu" ? 0.5 : 0.25)) {
        const scale = [220, 246.9, 261.6, 293.7, 329.6, 349.2, 392];
        const f = scale[Math.floor(Math.random() * scale.length)];
        this.tone(this.music, t, 0.8, f, 0.06, "sawtooth");
        this.tone(this.music, t + 0.01, 0.8, f * 2.004, 0.03, "triangle");
      }
    }
    // Heartbeat when low.
    if (this.lowHp < 0.55 && this.mood === "play" && now > this.heart) {
      this.heart = now + 0.8;
      this.tone(this.sfx, now, 0.12, 60, 0.4, "sine", 40);
      this.tone(this.sfx, now + 0.18, 0.12, 55, 0.3, "sine", 38);
    }
  }

  private gameOverSong() {
    if (!this.ctx) return;
    const t = this.t + 0.3;
    this.bell(t, 196, 0.35);
    this.bell(t + 2.4, 174.6, 0.3);
    this.bell(t + 4.8, 146.8, 0.35);
    const melody = [440, 415.3, 392, 349.2, 329.6, 293.7, 329.6, 220];
    melody.forEach((f, i) => this.tone(this.music, t + 1 + i * 0.55, 1.0, f, 0.08, "triangle"));
  }

  // ---------- effects ----------

  readonly play = {
    shot: (kind: GunSound, pap: boolean) => {
      if (!this.ctx) return;
      const t = this.t;
      const o = this.sfx;
      if (kind === "ray") {
        this.tone(o, t, 0.25, pap ? 1600 : 1200, 0.25, "square", 180);
        this.tone(o, t, 0.2, pap ? 2400 : 1800, 0.12, "sawtooth", 300);
        return;
      }
      const big = kind === "shotgun" ? 1.5 : kind === "lmg" || kind === "rifle" ? 1.15 : kind === "smg" ? 0.8 : 0.9;
      this.noiseBurst(o, t, 0.08 * big + 0.05, 0.9, "lowpass", 5000, 0.7, 400);
      this.noiseBurst(o, t, 0.22 * big, 0.45, "lowpass", 900, 0.8, 120);
      this.tone(o, t, 0.12 * big, 140 * (kind === "pistol" ? 1.3 : 1), 0.6, "sine", 45);
      if (pap) this.tone(o, t, 0.15, 900, 0.08, "square", 300);
      // Tail off the stone walls.
      this.noiseBurst(o, t + 0.07, 0.4 * big, 0.08, "bandpass", 700, 1.2, 300);
    },
    hit: (head: boolean, kill: boolean) => {
      if (!this.ctx) return;
      const t = this.t;
      this.noiseBurst(this.sfx, t, 0.08, 0.35, "lowpass", 1200, 1);
      this.tone(this.sfx, t, 0.05, head ? 2200 : 1500, 0.08, "square");
      if (kill && head) this.noiseBurst(this.sfx, t + 0.02, 0.2, 0.3, "bandpass", 500, 1);
    },
    dry: () => this.ctx && this.tone(this.sfx, this.t, 0.04, 2400, 0.12, "square"),
    reload: () => {
      if (!this.ctx) return;
      const t = this.t;
      this.noiseBurst(this.sfx, t + 0.1, 0.05, 0.3, "highpass", 2500);
      this.noiseBurst(this.sfx, t + 0.5, 0.06, 0.35, "bandpass", 1800, 3);
      this.tone(this.sfx, t + 0.52, 0.04, 900, 0.1, "square");
    },
    shell: () => this.ctx && this.noiseBurst(this.sfx, this.t, 0.06, 0.3, "bandpass", 1400, 3),
    knife: (hit: boolean) => {
      if (!this.ctx) return;
      this.noiseBurst(this.sfx, this.t, 0.15, 0.25, "bandpass", 3000, 2, 1200);
      if (hit) this.noiseBurst(this.sfx, this.t + 0.1, 0.12, 0.5, "lowpass", 700, 1);
    },
    buy: () => {
      if (!this.ctx) return;
      const t = this.t;
      this.noiseBurst(this.sfx, t, 0.05, 0.3, "highpass", 3000);
      this.tone(this.sfx, t + 0.05, 0.3, 1568, 0.15, "triangle");
      this.tone(this.sfx, t + 0.12, 0.45, 2093, 0.15, "triangle");
    },
    denied: () => this.ctx && this.tone(this.sfx, this.t, 0.25, 160, 0.25, "square", 120),
    door: () => {
      if (!this.ctx) return;
      const t = this.t;
      this.noiseBurst(this.sfx, t, 1.4, 0.5, "lowpass", 600, 1, 150);
      this.tone(this.sfx, t, 1.2, 70, 0.4, "sawtooth", 40);
      this.play.buy();
    },
    hammer: (x: number, z: number) => {
      if (!this.ctx) return;
      const o = this.at(x, z, 20);
      if (!o) return;
      this.tone(o, this.t, 0.08, 520, 0.4, "square", 300);
      this.noiseBurst(o, this.t, 0.06, 0.4, "bandpass", 1500, 2);
    },
    boardTear: (x: number, z: number) => {
      if (!this.ctx) return;
      const o = this.at(x, z, 28);
      if (!o) return;
      this.noiseBurst(o, this.t, 0.3, 0.8, "bandpass", 900, 1.5, 300);
      this.tone(o, this.t, 0.15, 180, 0.3, "sawtooth", 80);
    },
    roundStart: (n: number) => {
      if (!this.ctx) return;
      const t = this.t + 0.1;
      const tolls = Math.min(3, 1 + Math.floor(n / 5));
      for (let i = 0; i < tolls; i++) this.bell(t + i * 1.6, 220, 0.3);
      this.tone(this.music, t, 3, 110, 0.08, "sawtooth", 104);
    },
    roundEnd: () => {
      if (!this.ctx) return;
      const t = this.t + 0.1;
      this.bell(t, 293.7, 0.25);
      [587, 523, 440, 392].forEach((f, i) => this.tone(this.music, t + 0.3 + i * 0.35, 0.9, f, 0.07, "triangle"));
    },
    hurt: () => {
      if (!this.ctx) return;
      this.noiseBurst(this.sfx, this.t, 0.2, 0.6, "lowpass", 800, 1);
      this.tone(this.sfx, this.t, 0.25, 180, 0.3, "sawtooth", 90);
    },
    down: () => {
      if (!this.ctx) return;
      this.tone(this.sfx, this.t, 1.5, 300, 0.3, "sawtooth", 40);
      this.noiseBurst(this.sfx, this.t, 1, 0.4, "lowpass", 600, 1, 80);
    },
    swipe: (x: number, z: number) => {
      if (!this.ctx) return;
      const o = this.at(x, z, 12);
      if (o) this.noiseBurst(o, this.t + 0.2, 0.2, 0.4, "bandpass", 1200, 1.5, 500);
    },
    groan: (x: number, z: number, gait: number, id: number) => {
      if (!this.ctx) return;
      const now = this.t;
      if ((this.groaning.get(id) ?? 0) > now) return;
      const o = this.at(x, z, 24);
      if (!o) return;
      this.groaning.set(id, now + 2);
      // A voice: a buzzy pitch through two formants.
      const ctx = this.ctx;
      const base = (gait === 2 ? 150 : 95) * (0.8 + ((id * 37) % 10) / 20);
      const src = ctx.createOscillator();
      src.type = "sawtooth";
      const dur = gait === 2 ? 0.6 : 1.1 + Math.random() * 0.6;
      src.frequency.setValueAtTime(base, now);
      src.frequency.linearRampToValueAtTime(base * (gait === 2 ? 1.6 : 0.75), now + dur);
      const vib = ctx.createOscillator();
      vib.frequency.value = 6 + Math.random() * 4;
      const vg = ctx.createGain();
      vg.gain.value = base * 0.06;
      vib.connect(vg).connect(src.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gait === 2 ? 0.3 : 0.22, now + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      for (const [fq, q] of [
        [500 + Math.random() * 200, 5],
        [1100 + Math.random() * 300, 8],
      ]) {
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = fq;
        f.Q.value = q;
        src.connect(f).connect(g);
      }
      g.connect(o);
      src.start(now);
      vib.start(now);
      src.stop(now + dur + 0.05);
      vib.stop(now + dur + 0.05);
    },
    dirt: (x: number, z: number) => {
      if (!this.ctx) return;
      const o = this.at(x, z, 25);
      if (o) this.noiseBurst(o, this.t, 0.8, 0.4, "lowpass", 400, 1, 100);
    },
    dropAppear: () => {
      if (!this.ctx) return;
      [880, 1109, 1319].forEach((f, i) => this.tone(this.sfx, this.t + i * 0.07, 0.3, f, 0.08, "triangle"));
    },
    power: (kind: string) => {
      if (!this.ctx) return;
      const t = this.t;
      const notes = kind === "nuke" ? [196, 147, 98] : [523, 659, 784, 1047];
      notes.forEach((f, i) => this.tone(this.sfx, t + i * 0.09, 0.5, f, 0.15, "square"));
      if (kind === "nuke") this.noiseBurst(this.sfx, t, 2, 0.9, "lowpass", 1500, 1, 60);
    },
    perk: () => {
      if (!this.ctx) return;
      const t = this.t;
      // A little salsa piano montuno.
      const notes = [392, 494, 587, 494, 659, 587, 494, 392, 440, 523, 659, 784];
      notes.forEach((f, i) => this.tone(this.music, t + i * 0.13, 0.2, f, 0.09, "triangle"));
      this.noiseBurst(this.sfx, t + 0.4, 0.4, 0.2, "bandpass", 2500, 1);
      [0, 0.26, 0.52, 0.91, 1.17].forEach((d) => this.noiseBurst(this.music, t + d, 0.05, 0.15, "highpass", 5000));
    },
    boxOpen: () => {
      if (!this.ctx) return;
      const t = this.t;
      // A music-box tune while it spins.
      const notes = [784, 988, 1175, 988, 784, 659, 784, 988, 880, 740, 880, 1175];
      notes.forEach((f, i) => this.tone(this.sfx, t + i * 0.26, 0.4, f, 0.07, "sine"));
      this.noiseBurst(this.sfx, t, 0.4, 0.3, "bandpass", 500, 1);
    },
    boxClose: () => this.ctx && this.noiseBurst(this.sfx, this.t, 0.3, 0.3, "lowpass", 400, 1),
    papStart: () => {
      if (!this.ctx) return;
      const t = this.t;
      for (let i = 0; i < 10; i++) this.noiseBurst(this.sfx, t + i * 0.28, 0.2, 0.4, "bandpass", 300 + (i % 3) * 200, 3);
      this.tone(this.sfx, t, 3, 55, 0.2, "sawtooth", 110);
    },
    papDone: () => {
      if (!this.ctx) return;
      const t = this.t;
      [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(this.music, t + i * 0.1, 0.8, f, 0.1, "square"));
      this.bell(t, 440, 0.15);
    },
    swap: () => this.ctx && this.noiseBurst(this.sfx, this.t, 0.08, 0.2, "bandpass", 2000, 2),
  };
}
