import type { MusicNote } from "../../music.ts";

// Keep the road theme's transport intact while twilight brings in a sparse
// Scareathon stem. The existing voice budget, pause and mute buses own it.
export function mixNightScore(notes: readonly MusicNote[], bar: number, step: number, amount: number): MusicNote[] {
  const mix = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
  const result = notes.map(note => ({ ...note, volume: note.volume * (1 - mix * (note.lane === "lead" ? .38 : .2)) }));
  if (mix <= 0) return result;
  if (step === 0) result.push({ lane: "bass", instrument: "triangle", midi: 43, duration: 12, volume: .035 * mix, priority: 3 });
  if (step === 0 || step === 8) result.push({ lane: "arp", instrument: "sine", midi: [74, 70, 67, 69][((bar % 4) + 4) % 4] + (step === 8 ? 12 : 0),
    duration: 5, volume: .05 * mix, priority: 5, slide: -2 });
  if (bar % 4 === 3 && step === 6) result.push({ lane: "drum", instrument: "noise", midi: 0, duration: 2, volume: .025 * mix, priority: 2, filter: 1500 });
  return result;
}
