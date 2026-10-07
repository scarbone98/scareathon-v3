import { Renderer } from "./render";
import { idleInput, newGame, step, type GameState, type Input } from "./sim";
export class GameController {
  state: GameState = newGame();
  private renderer: Renderer;
  private keys = new Set<string>();
  private touch = idleInput();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = true;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    this.raf = requestAnimationFrame(this.frame);
  }
  start() { this.state = newGame(); this.paused = false; }
  setPaused(paused: boolean) { this.paused = paused; this.keys.clear(); this.touch = idleInput(); }
  setTouch(input: Partial<Input>) { Object.assign(this.touch, input); }
  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
  }
  private down = (e: KeyboardEvent) => {
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
      e.preventDefault(); this.keys.add(e.key.toLowerCase());
    }
  };
  private up = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    this.acc += this.paused ? 0 : Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    while (this.acc >= 1 / 60) {
      const has = (...keys: string[]) => keys.some(k => this.keys.has(k));
      const input = { ...this.touch,
        x: this.touch.x || Number(has("d", "arrowright")) - Number(has("a", "arrowleft")),
        y: this.touch.y || Number(has("s", "arrowdown")) - Number(has("w", "arrowup")) };
      step(this.state, input, 1 / 60); this.acc -= 1 / 60;
    }
    this.renderer.draw(this.state);
  };
}
