import { Renderer, type RenderPresentation } from "./render";
import type { HeroAvatar } from "./avatar";
import { GameInput, type InputMode } from "./input";
import { newGame, step, type GameEvent, type GameState, type Input } from "./sim";
export interface Callbacks {
  onState: (state: GameState) => void;
  onInputMode: (mode: InputMode) => void;
  onPresentation?: (presentation: RenderPresentation) => void;
  onPause: () => void;
  onConfirm: () => boolean;
  onNavigate: (direction: number, axis?: "horizontal" | "vertical") => void;
  onEvent?: (state: GameState, event: GameEvent) => void;
}
export class GameController {
  state: GameState = newGame();
  private renderer: Renderer;
  private input: GameInput;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private hudAt = 0;
  private presentationAt = 0;
  private paused = true;
  constructor(canvas: HTMLCanvasElement, private cb: Callbacks) {
    this.renderer = new Renderer(canvas);
    this.input = new GameInput(cb.onInputMode, cb.onPause, cb.onConfirm, cb.onNavigate);
    cb.onInputMode(this.input.mode);
    this.raf = requestAnimationFrame(this.frame);
  }
  start(state = newGame()) { this.state = state; this.paused = false; this.acc = 0; this.input.clear(); this.renderer.reset(); this.publish(); }
  setPaused(paused: boolean) { if (this.paused === paused) return; this.paused = paused; this.acc = 0; this.input.clear(); this.state.previousInput.ki = false; }
  setAvatar(assets: HeroAvatar) { this.renderer.setAvatar(assets); }
  setTouch(input: Partial<Input>) { this.input.setTouch(input); }
  mutate(action: (state: GameState) => void) {
    const overlay = this.state.overlay;
    this.state.events.length = 0; action(this.state);
    if (!overlay && this.state.overlay) this.input.clearTouch();
    for (const event of this.state.events) { this.renderer.onEvent(this.state, event); this.cb.onEvent?.(this.state, event); }
    this.state.events.length = 0; this.publish();
  }
  private publish() {
    const s = this.state;
    this.cb.onState({ ...s,
      heroes: Object.fromEntries(Object.entries(s.heroes).map(([id, hero]) => [id, { ...hero }])) as GameState["heroes"],
      character: { ...s.character }, gear: { ...s.gear }, party: [...s.party], unlockedHeroes: [...s.unlockedHeroes],
      enemies: s.enemies.map(enemy => ({ ...enemy })), effects: s.effects.map(effect => ({ ...effect })),
      floaters: s.floaters.map(floater => ({ ...floater })), projectiles: s.projectiles.map(shot => ({ ...shot, hits: [...shot.hits] })),
      clearedRooms: [...s.clearedRooms], areas: [...s.areas], bosses: [...s.bosses], previousInput: { ...s.previousInput }, events: [...s.events],
    });
  }
  dispose() { cancelAnimationFrame(this.raf); this.input.dispose(); this.renderer.dispose(); }
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const input = this.input.read();
    const delta = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.acc += this.paused ? 0 : delta;
    this.last = now;
    while (this.acc >= 1 / 60) { const ready = this.state.hitStop <= 0, overlay = this.state.overlay; step(this.state, input, 1 / 60); if (!overlay && this.state.overlay) this.input.clearTouch(); if (ready) this.input.consume(); for (const event of this.state.events) { this.renderer.onEvent(this.state, event); this.cb.onEvent?.(this.state, event); } this.acc -= 1 / 60; }
    this.renderer.draw(this.state, this.paused ? 0 : delta);
    if (now - this.presentationAt > 30) { this.presentationAt = now; this.cb.onPresentation?.(this.renderer.presentation(this.state)); }
    if (now - this.hudAt > 80) { this.hudAt = now; this.publish(); }
  };
}
