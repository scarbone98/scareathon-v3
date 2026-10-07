import { Renderer } from "./render";
import { GameInput, type InputMode } from "./input";
import { newGame, step, type GameEvent, type GameState, type Input } from "./sim";
export interface Callbacks {
  onState: (state: GameState) => void;
  onInputMode: (mode: InputMode) => void;
  onPause: () => void;
  onConfirm: () => boolean;
  onNavigate: (direction: number) => void;
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
  private paused = true;
  constructor(canvas: HTMLCanvasElement, private cb: Callbacks) {
    this.renderer = new Renderer(canvas);
    this.input = new GameInput(cb.onInputMode, cb.onPause, cb.onConfirm, cb.onNavigate);
    cb.onInputMode(this.input.mode);
    this.raf = requestAnimationFrame(this.frame);
  }
  start(state = newGame()) { this.state = state; this.paused = false; this.acc = 0; this.input.clear(); this.publish(); }
  setPaused(paused: boolean) { this.paused = paused; this.acc = 0; this.input.clear(); this.state.previousInput.ki = false; }
  setTouch(input: Partial<Input>) { this.input.setTouch(input); }
  mutate(action: (state: GameState) => void) {
    const overlay = this.state.overlay;
    this.state.events.length = 0; action(this.state);
    if (!overlay && this.state.overlay) this.input.clearTouch();
    for (const event of this.state.events) this.cb.onEvent?.(this.state, event);
    this.state.events.length = 0; this.publish();
  }
  private publish() { this.cb.onState({ ...this.state, heroes: { joe: { ...this.state.heroes.joe }, matt: { ...this.state.heroes.matt } }, enemies: [...this.state.enemies] }); }
  dispose() { cancelAnimationFrame(this.raf); this.input.dispose(); }
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const input = this.input.read();
    this.acc += this.paused ? 0 : Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    while (this.acc >= 1 / 60) { const ready = this.state.hitStop <= 0, overlay = this.state.overlay; step(this.state, input, 1 / 60); if (!overlay && this.state.overlay) this.input.clearTouch(); if (ready) this.input.consume(); for (const event of this.state.events) this.cb.onEvent?.(this.state, event); this.acc -= 1 / 60; }
    this.renderer.draw(this.state);
    if (now - this.hudAt > 80) { this.hudAt = now; this.publish(); }
  };
}
