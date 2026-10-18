// All the sounds are made in the browser: farts, splashes, bonks and a few jingles.
const MUTE_KEY = "hippo-rapids-muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  // Private mode: sound just starts on.
}
let water: { gain: GainNode } | null = null;
let lastToot = 0;
let windNode: { gain: GainNode; pan: StereoPannerNode; filter: BiquadFilterNode } | null = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function noise(dur: number, filter: BiquadFilterType, freq: number, q: number, vol: number, when = 0) {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  const t = c.currentTime + when;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

function tone(type: OscillatorType, from: number, to: number, dur: number, vol: number, when = 0) {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  // Browsers only start audio after a tap or key press.
  unlock() {
    const c = ensure();
    if (c?.state === "suspended") void c.resume();
  },
  get muted() {
    return muted;
  },
  setMuted(m: boolean) {
    muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {
      // ignore
    }
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
  },
  // A toot. Pitch is the hippo's (seat) voice; `near` is quieter for hippos that aren't yours.
  fart(voice: number, near = 1) {
    const c = ensure();
    if (!c || !master) return;
    const now = c.currentTime;
    if (now - lastToot < 0.045) return;
    lastToot = now;
    const dur = 0.16 + Math.random() * 0.22;
    const base = [78, 96, 66, 112][voice % 4] * (0.9 + Math.random() * 0.25);
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(base * 1.5, now);
    o.frequency.exponentialRampToValueAtTime(base, now + 0.05);
    o.frequency.exponentialRampToValueAtTime(base * (0.55 + Math.random() * 0.3), now + dur);
    // The flutter is what makes it a fart.
    const lfo = c.createOscillator();
    lfo.frequency.value = 26 + Math.random() * 18;
    const lfoGain = c.createGain();
    lfoGain.gain.value = base * 0.35;
    lfo.connect(lfoGain).connect(o.frequency);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520 + Math.random() * 300;
    lp.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.5 * near, now + 0.02);
    g.gain.setValueAtTime(0.5 * near, now + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(lp).connect(g).connect(master);
    o.start(now);
    lfo.start(now);
    o.stop(now + dur + 0.05);
    lfo.stop(now + dur + 0.05);
    noise(dur * 0.8, "bandpass", 400 + Math.random() * 300, 0.7, 0.18 * near);
  },
  bump(strength: number) {
    noise(0.12, "lowpass", 380, 1, 0.5 * strength + 0.1);
    tone("sine", 190, 70, 0.14, 0.4 * strength + 0.1);
  },
  hit() {
    noise(0.28, "bandpass", 1500, 0.8, 0.45);
    tone("square", 330, 90, 0.25, 0.22);
    tone("sawtooth", 140, 50, 0.3, 0.3, 0.02);
  },
  sink() {
    tone("sine", 520, 90, 1.1, 0.35);
    for (let i = 0; i < 6; i++) tone("sine", 300 + Math.random() * 400, 700 + Math.random() * 600, 0.1, 0.18, 0.12 * i);
    noise(1.2, "lowpass", 600, 1, 0.3);
  },
  respawn() {
    tone("triangle", 330, 660, 0.25, 0.3);
  },
  boost() {
    noise(0.35, "highpass", 1800, 0.6, 0.22);
    tone("sawtooth", 220, 880, 0.3, 0.12);
  },
  beep(go = false) {
    tone("square", go ? 880 : 440, go ? 880 : 440, go ? 0.5 : 0.18, 0.22);
  },
  // A lock gate hears the crew: a ding for each unison tap, a rumble and fanfare when it opens.
  gate(kind: "tap" | "open", taps = 0) {
    if (kind === "tap") {
      const f = 440 * 2 ** (Math.min(taps, 8) / 6);
      tone("square", f, f, 0.18, 0.2);
      tone("triangle", f * 2, f * 2, 0.25, 0.14, 0.04);
      return;
    }
    noise(0.9, "lowpass", 300, 1, 0.5);
    [392, 523, 659, 784].forEach((f, i) => tone("triangle", f, f, 0.3, 0.28, 0.12 * i));
  },
  // Each ring in a row sings a note higher.
  ring(n: number) {
    const f = 660 * 2 ** (((n - 1) % 7) / 6);
    tone("triangle", f, f * 1.5, 0.22, 0.3);
    tone("sine", f * 2, f * 2, 0.3, 0.12, 0.05);
  },
  checkpoint() {
    [523, 659, 784].forEach((f, i) => tone("triangle", f, f, 0.2, 0.3, i * 0.09));
  },
  finish() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone("square", f, f, i > 3 ? 0.4 : 0.16, 0.2, i * 0.13));
    noise(0.8, "bandpass", 3000, 0.5, 0.2, 0.6);
  },
  blip() {
    tone("square", 660, 880, 0.07, 0.15);
  },
  // Wind: a rising howl as a gust or headwind nears, leaning toward the side it blows from.
  wind(intensity: number, dir: number) {
    if (!ctx && intensity <= 0) return;
    const c = ensure();
    if (!c || !master || !noiseBuf) return;
    if (!windNode) {
      const src = c.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.8;
      const gain = c.createGain();
      gain.gain.value = 0;
      const pan = c.createStereoPanner();
      src.connect(filter).connect(gain).connect(pan).connect(master);
      src.start();
      windNode = { gain, pan, filter };
    }
    windNode.gain.gain.setTargetAtTime(intensity * 0.2, c.currentTime, 0.2);
    windNode.filter.frequency.setTargetAtTime(600 + intensity * 900, c.currentTime, 0.2);
    windNode.pan.pan.setTargetAtTime(dir * 0.6, c.currentTime, 0.2);
  },
  // The river's rush, louder the faster the raft goes.
  river(on: boolean, speed = 0) {
    if (!ctx && !on) return;
    const c = ensure();
    if (!c || !master || !noiseBuf) return;
    if (!water) {
      const src = c.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 650;
      f.Q.value = 0.4;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(master);
      src.start();
      water = { gain: g };
    }
    water.gain.gain.setTargetAtTime(on ? 0.05 + Math.min(0.12, speed * 0.015) : 0, c.currentTime, 0.15);
  },
};
