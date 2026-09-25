// Tiny synthesized sound effects for the cartridge arcade: no files to load.
// The AudioContext is created on first use, which is always after a click.

let context: AudioContext | null = null;

function audio() {
  if (!context) {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    context = new Context();
  }
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

function noiseBuffer(ctx: AudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function playNoise(seconds: number, filterType: BiquadFilterType, from: number, to: number, volume: number) {
  const ctx = audio();
  if (!ctx) return;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, seconds);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(from, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + seconds);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
}

// Cartridge flying off the shelf
export function playWhoosh() {
  playNoise(0.35, "bandpass", 400, 2400, 0.12);
}

// Cartridge seating in the slot: a low thump plus a plastic click
export function playClunk() {
  const ctx = audio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.18);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.35, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.25);
  playNoise(0.05, "highpass", 3000, 6000, 0.18);
}

// Screen static while the game boots
export function playStatic() {
  playNoise(0.45, "highpass", 1200, 5000, 0.05);
}

// Soft tick when browsing the shelf
export function playTick() {
  const ctx = audio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = 880;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.03, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);
}
