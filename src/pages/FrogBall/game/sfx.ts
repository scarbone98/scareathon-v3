// Little synthesized blips, so the game needs no audio files.
let ctx: AudioContext | null = null;
let muted = false;

export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function setMuted(m: boolean) {
  muted = m;
}

function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.08, slideTo?: number, delay = 0) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  ready: () => tone(440, 0.15, "square", 0.06),
  go: () => {
    tone(660, 0.1, "square", 0.07);
    tone(880, 0.25, "square", 0.07, undefined, 0.1);
  },
  fly: () => tone(1200, 0.08, "square", 0.05, 1800),
  bigFly: () => [880, 1100, 1320, 1760].forEach((f, i) => tone(f, 0.12, "square", 0.05, undefined, i * 0.06)),
  bump: () => tone(300, 0.18, "triangle", 0.12, 700),
  land: (k: number) => tone(120, 0.1, "triangle", 0.05 + k * 0.1, 60),
  spring: () => tone(200, 0.35, "sine", 0.14, 900),
  boost: () => tone(400, 0.3, "sawtooth", 0.05, 1600),
  tick: () => tone(1000, 0.05, "square", 0.04),
  goal: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.18, "square", 0.06, undefined, i * 0.11)),
  fallout: () => tone(900, 1.2, "triangle", 0.1, 80),
  timeover: () => [400, 300, 200].forEach((f, i) => tone(f, 0.3, "square", 0.07, undefined, i * 0.25)),
  oneUp: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.1, "square", 0.05, undefined, i * 0.08)),
  move: () => tone(660, 0.05, "square", 0.04),
  select: () => {
    tone(880, 0.06, "square", 0.05);
    tone(1320, 0.1, "square", 0.05, undefined, 0.06);
  },
  back: () => tone(440, 0.08, "square", 0.04, 300),
  coin: () => [988, 1319].forEach((f, i) => tone(f, i ? 0.35 : 0.08, "square", 0.06, undefined, i * 0.08)),
  letter: () => tone(1200, 0.03, "square", 0.04),
  tally: () => tone(1500, 0.025, "square", 0.03),
  denied: () => tone(150, 0.15, "square", 0.06),
  ribbit: () => {
    tone(180, 0.08, "sawtooth", 0.08, 260);
    tone(200, 0.1, "sawtooth", 0.08, 300, 0.1);
  },
};
