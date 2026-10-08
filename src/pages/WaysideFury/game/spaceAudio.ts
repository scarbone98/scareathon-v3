import { sampleSpaceFilm } from './chapters/ch3Films.ts';
import type { GameState } from './sim.ts';
import type { Mood, SfxName } from './music.ts';
// Cue routing shares authoritative shot IDs; muted/blocked audio never gates time.
const cues: Record<string,SfxName> = { S1:'select', S2:'block', S3:'block', S4:'swap', F1:'select', F2:'block', F3:'beam', F4:'dash', F5:'swap', F6:'select', F8:'select', F9:'dash', F10:'block', R1:'dash', R3:'dash', R4:'block', R5:'swap' };
export function spaceAudio(s:GameState):{key:string;cue?:SfxName;mood:Mood}|null {
  if(!s.film)return null;
  const {shot}=sampleSpaceFilm(s.film.id,s.film.elapsed);
  return {key:`${s.film.id}:${shot.id}`,cue:cues[shot.id],mood:shot.composition==='earth'||s.film.id==='space-suitup'?'cozy':'title'};
}
