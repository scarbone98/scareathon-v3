import { PROLOGUE } from './content.ts';
import type { GameState } from './sim.ts';

export const PROLOGUE_FADE = .55;
export function revealCount(text: string, seconds: number) {
  // A short establishing hold, conversational letters, then punctuation rests.
  let budget = Math.max(0, seconds - .45), count = 0;
  for (const letter of text) {
    budget -= /[.!?]/.test(letter) ? .19 : /[,;:]/.test(letter) ? .09 : .024;
    if (budget < 0) break;
    count++;
  }
  return count;
}
export function storyRevealed(s: Pick<GameState, 'cutscene' | 'sceneTimer' | 'prologueRevealed'>) {
  const text = PROLOGUE[s.cutscene]?.text ?? '';
  return !!s.prologueRevealed || revealCount(text, s.sceneTimer) >= text.length;
}
export function prologueCamera(index: number, time: number, reduced: boolean) {
  const beat = PROLOGUE[index] ?? PROLOGUE[0], p = reduced ? 1 : 1 - Math.exp(-Math.max(0, time) * .55);
  const speakerX = { joe: 119, matt: 143, alex: 188, jon: 216 };
  const target = beat.phase === 'portal' ? 227 : beat.hero && beat.phase !== 'taxi' && beat.phase !== 'suitup' ? speakerX[beat.hero] : 160;
  return { x: 160 + (target - 160) * p * .55, y: beat.phase === 'suitup' ? 80 : 88,
    zoom: 1 + (beat.phase === 'years' ? .07 : beat.phase === 'portal' ? .14 : .1) * p };
}
