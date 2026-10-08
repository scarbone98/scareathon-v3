import { filmDuration, type SpaceFilmId } from './chapters/ch3Films.ts';
import type { GameState, Input } from './sim.ts';
export interface FilmState { id: SpaceFilmId; elapsed: number }
export function startSpaceFilm(s:GameState,id:SpaceFilmId) {
  s.film={id,elapsed:0}; s.filmCaptionHold=false; s.filmSkipHeld=0; s.filmHold=false;
  s.vx=s.vy=s.knockX=s.knockY=s.charge=s.attackTimer=0; s.moving=s.guard=false;
}
// Host owns time; held skip is a vote, removed automatically with a disconnected seat.
export function tickSpaceFilm(s:GameState,input:Input,dt:number):SpaceFilmId|null {
  if (!s.film) return null;
  s.filmSkipHeld=input.guard?Math.min(1,s.filmSkipHeld+dt):0; s.filmHold=s.filmCaptionHold||input.ki;
  if (s.coop?.role==='guest') return null;
  const peers=s.coop?.remoteHeroes ?? [];
  const allPresent=peers.length+1 >= (s.coop?.playerCount??1);
  const skip=s.filmSkipHeld>=1 && allPresent && peers.every(p=>p.filmSkip===true);
  if (!s.filmHold && !peers.some(p=>p.filmHold)) s.film.elapsed+=dt;
  if (!skip && s.film.elapsed<filmDuration(s.film.id)) return null;
  const id=s.film.id; s.film=null; s.filmSkipHeld=0; s.filmHold=false; return id;
}
