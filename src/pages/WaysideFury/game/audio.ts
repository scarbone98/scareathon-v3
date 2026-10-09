import { sampleDayNight } from "./u1/world/dayNight.ts";
import { worldCycleSeconds } from "./u1/world/dayNightRuntime.ts";
import { spaceAudio } from "./spaceAudio.ts";
import { PROLOGUE } from "./content.ts";
import { GATEKEEPER_ROOM, WATCHER_ROOM } from "./world.ts";
import { activeHero, type GameState, type GameEvent } from "./sim.ts";
import type { MusicDirector, Mood } from "./music.ts";

export function moodForState(s: GameState, current: Mood = "dungeon"): Mood {
  const space=spaceAudio(s);if(space) return space.mood;
  if (s.scene === "prologue") {
    const phase = PROLOGUE[s.cutscene]?.phase;
    if (phase === "dark" || phase === "portal") return "off";
    if (phase === "taxi") return "taxi";
    return phase === "backstory" || phase === "suitup" ? "title" : "bbq";
  }
  if (s.scene === "dead") return "off";
  if (s.scene === "shift" || s.scene === "realm") return current === "off" ? "dungeon" : current;
  if (s.scene === "results") return "title";
  if (s.overlay === "shop" || s.overlay === "home") return "cozy";
  if (s.scene === "hub") return "hub";
  if (s.scene === "overworld") return "taxi";
  return s.enemies.some(e => e.kind === "boss" && e.hp > 0) ? "boss" : "dungeon";
}
export function realmForState(s: GameState): number {
  if (s.scene === "shift") return Math.max(0, Math.min(1, s.transitionPalette === "eightbit" ? (s.sceneTimer - 1.15) / .8 : 1 - (s.sceneTimer - 1.15) / .8));
  return s.palette === "eightbit" ? 1 : 0;
}
interface Previous { beat: number; spaceShot: string | null; phase: string | undefined; taxi: boolean; attack: number; dash: number; nextId: number }
// Scene routing is separate from synthesis, so story/realm transitions can be
// checked without an AudioContext. Only simulation edges trigger combat SFX.
export class FuryAudio {
  private sound: MusicDirector;
  private mood: Mood = "title";
  private previous: Previous | null = null;
  constructor(sound: MusicDirector) { this.sound = sound; }
  menu() { this.previous = null; this.mood = "title"; this.sound.setCharge(null); this.sound.setRealm(0); this.sound.setMood("title"); this.sound.setPaused(false); }
  start(s: GameState) { this.previous = null; this.sound.setPaused(false); this.sync(s); }
  sync(s: GameState) {
    this.sound.setNightMix(s.scene === "overworld" ? sampleDayNight(worldCycleSeconds(s)).nightFactor : 0);
    this.mood = moodForState(s, this.mood); this.sound.setMood(this.mood); this.sound.setRealm(realmForState(s));
    const space=spaceAudio(s);
    if(space?.cue && space.key!==this.previous?.spaceShot) this.sound.playSfx(space.cue,.7);
    const phase = s.scene === "prologue" ? PROLOGUE[s.cutscene]?.phase : undefined;
    const beat = s.scene === 'prologue' ? s.cutscene : -1;
    if (beat >= 0 && beat !== this.previous?.beat) {
      if (phase === 'portal' && this.previous?.phase !== 'portal') this.sound.playSfx('ki', .45);
      else if (phase === 'suitup') this.sound.playSfx('block', .5);
      else if (phase !== 'dark' && phase !== 'taxi') this.sound.playSfx('select', .25);
    }
    const taxi = s.scene === "overworld" || phase === "taxi";
    if ((phase === "dark" || phase === "portal") && this.previous?.phase !== "dark" && this.previous?.phase !== "portal") this.sound.jingle("darkSky");
    if (taxi && !this.previous?.taxi) this.sound.jingle("taxiHorn");
    if (this.previous) {
      if (s.attackTimer > this.previous.attack + .01) this.sound.playSfx("attack");
      if (s.dashTimer > this.previous.dash + .01) this.sound.playSfx("dash");
      const shots = s.projectiles.filter(p => p.owner === "hero" && p.id >= this.previous!.nextId);
      if (shots.length) this.sound.playSfx(shots.some(p => p.beam) ? "beam" : "ki");
    }
    const hero = activeHero(s);
    this.sound.setCharge(s.charge > 0 && s.scene !== "dead" ? hero.ki / hero.maxKi : null);
    this.previous = { beat, spaceShot: space?.key ?? null, phase, taxi, attack: s.attackTimer, dash: s.dashTimer, nextId: s.nextId };
  }
  event(s: GameState, event: GameEvent) {
    if (event.type === "ambient-taxi-crash") this.sound.playSfx("crunch");
    if (event.type === "fusion-start") { this.sound.playSfx("fusion"); }
    if (event.type === "fusion-special") { this.sound.playSfx("fusion-special"); }
    if (event.type === "fusion-end") this.sound.playSfx("fusion-end");
    if (event.type === "training-complete") this.sound.jingle("level");
    if (event.type === "pickup") this.sound.jingle("item");
    if (event.type === "hit") this.sound.playSfx(event.target === "hero" ? s.guard ? "block" : "hurt" : "hit", Math.min(1.5, .5 + event.damage / 30));
    if (event.type === "swap") this.sound.playSfx("swap");
    if (event.type === "level") this.sound.jingle("level");
    if (event.type === "death") { this.sound.setCharge(null); this.sound.jingle("gameOver"); }
    if (event.type === "checkpoint") {
      if (event.id.startsWith("loot-")) this.sound.jingle("item");
      if ([`blast-${WATCHER_ROOM}`, `blast-${GATEKEEPER_ROOM}`, "realm-0", "moon-m06", "moon-m08"].includes(event.id)) this.sound.jingle("victory");
    }
  }
}
