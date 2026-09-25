// Runs a Horde Rush game on a canvas: fixed-step simulation, drawing, and
// steering by drag or keyboard. React only sees the HUD numbers.
import { loadAssets, Renderer } from "./render";
import { levelProgress, newGame, step, type GameState } from "./sim";

const STEP = 1 / 60;

export interface Hud {
  army: number;
  fire: number;
  level: number;
  progress: number;
  score: number;
  boss: { hp: number; maxHp: number } | null;
}

export interface RunResult {
  score: number;
  level: number;
  kills: number;
}

export interface GameCallbacks {
  onHud: (hud: Hud) => void;
  onLevel: (level: number) => void;
  onBoss: () => void;
  onOver: (result: RunResult) => void;
}

export class GameController {
  private state: GameState = newGame();
  private renderer: Renderer | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private disposed = false;
  private width = 0;
  private height = 0;
  private hudAt = 0;
  private drag: { id: number; x: number; target: number } | null = null;
  private keys = new Set<string>();
  private resizeObserver: ResizeObserver;
  // The attract mode on the menu: the army steers itself.
  private demo = false;

  constructor(private host: HTMLElement, private canvas: HTMLCanvasElement, private cb: GameCallbacks) {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  async start(demo = false) {
    const assets = await loadAssets();
    if (this.disposed) return;
    this.renderer ??= new Renderer(this.canvas, assets);
    this.resize();
    this.demo = demo;
    this.state = newGame();
    this.paused = false;
    this.acc = 0;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.last = performance.now();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private resize() {
    this.width = this.host.clientWidth;
    this.height = this.host.clientHeight;
    this.renderer?.resize(this.width, this.height, Math.min(window.devicePixelRatio || 1, 2));
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    let dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.paused) dt = 0;

    const s = this.state;
    const wasOver = s.over;
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.steer();
      step(s, STEP);
      this.renderer?.handleEvents(s, s.events);
      for (const e of s.events) {
        if (this.demo) continue;
        if (e.type === "level") this.cb.onLevel(e.level);
        if (e.type === "boss") this.cb.onBoss();
      }
      s.events.length = 0;
      if (s.over) break;
    }
    if (s.over && !wasOver) {
      if (this.demo) {
        // Attract mode just starts over.
        this.state = newGame();
      } else {
        this.cb.onOver({ score: s.score, level: s.level, kills: s.kills });
      }
    }
    // Keep drawing after game over so the last particles settle.
    this.renderer?.draw(this.state, dt, this.width, this.height);

    if (!this.demo && now - this.hudAt > 66) {
      this.hudAt = now;
      const boss = s.enemies.find((e) => e.boss && e.awake);
      this.cb.onHud({
        army: s.army,
        fire: s.fire,
        level: s.level,
        progress: levelProgress(s),
        score: s.score,
        boss: boss ? { hp: Math.max(0, boss.hp), maxHp: boss.maxHp } : null,
      });
    }
  };

  private steer() {
    const s = this.state;
    if (this.demo) {
      // Head for the best-looking door, otherwise wander after monsters.
      const gate = s.gates.filter((g) => !g.used && g.z > s.z && g.z - s.z < 20).sort((a, b) => a.z - b.z)[0];
      if (gate) {
        const pair = s.gates.filter((g) => g.pair === gate.pair);
        const best = pair.reduce((a, b) => (a.value * (a.kind === "mul" ? 12 : 1) >= b.value * (b.kind === "mul" ? 12 : 1) ? a : b));
        s.targetX = (best.x0 + best.x1) / 2;
      } else {
        const near = s.enemies.filter((e) => e.awake).sort((a, b) => a.z - b.z)[0];
        s.targetX = near ? near.x : Math.sin(s.t * 0.7) * 2;
      }
      return;
    }
    const dir = (this.keys.has("right") ? 1 : 0) - (this.keys.has("left") ? 1 : 0);
    if (dir) s.targetX = s.x + dir * 1.2;
  }

  // Drag anywhere to slide the army; it follows your finger's movement,
  // not its position, so your thumb never covers the action.
  private onPointerDown = (e: PointerEvent) => {
    if (this.demo || this.paused) return;
    this.drag = { id: e.pointerId, x: e.clientX, target: this.state.targetX };
    this.canvas.setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const unit = this.width * 0.094;
    this.state.targetX = this.drag.target + ((e.clientX - this.drag.x) / unit) * 1.25;
    // Past the edge of the road, re-anchor so dragging back responds at once.
    const clamped = Math.max(-5, Math.min(5, this.state.targetX));
    if (clamped !== this.state.targetX) {
      this.state.targetX = clamped;
      this.drag = { ...this.drag, x: e.clientX, target: clamped };
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.drag?.id === e.pointerId) this.drag = null;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const k = keyName(e.key);
    if (k) {
      this.keys.add(k);
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = keyName(e.key);
    if (k) {
      this.keys.delete(k);
      if (!this.keys.size) this.state.targetX = this.state.x;
    }
  };
}

function keyName(key: string) {
  if (key === "ArrowLeft" || key === "a" || key === "A") return "left";
  if (key === "ArrowRight" || key === "d" || key === "D") return "right";
  return null;
}
