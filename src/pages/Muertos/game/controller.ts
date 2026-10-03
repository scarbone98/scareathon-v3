// Runs Muertos: the frame loop, mouse, keyboard and touch input, and
// turning the sim's events into sound, callouts and the HUD.
import { botInput, newBot, type Bot } from "./bot";
import { PERKS, SPAWNS, type PerkId } from "./map";
import { Renderer, type View, type ViewMode } from "./render";
import { aliveZombies, curWeapon, newGame, NO_INPUT, rayZombie, rayZombie3D, step, type Game, type Input, type PowerKind } from "./sim";
import { Sound } from "./sound";
import { magOf, nameOf, WEAPONS } from "./weapons";

export type Hud = {
  round: number;
  phase: Game["phase"];
  points: number;
  hp: number;
  maxHp: number;
  weapon: string;
  pap: boolean;
  mag: number;
  reserve: number;
  magSize: number;
  reloading: boolean;
  reloadFrac: number; // 0..1 through the reload, for the bar
  others: string[];
  perks: PerkId[];
  prompt: Game["prompt"];
  insta: number;
  double: number;
  hurt: number; // 0..1, how red the screen is
  hitmarker: number;
  headHit: boolean;
  ads: boolean;
  left: number; // zombies left this round
  fps: number;
  view: ViewMode;
  pad: boolean; // playing on a gamepad, so prompts name its buttons
};

export type Popup = { id: number; text: string; sub?: string; color: string; big?: boolean };
export type PointsPop = { id: number; amount: number };
export type RunResult = { round: number; score: number; kills: number; headshots: number };

export type Callbacks = {
  onHud: (hud: Hud) => void;
  onPopup: (p: Popup) => void;
  onPoints: (p: PointsPop) => void;
  onOver: (r: RunResult) => void;
  onPause: () => void;
  // Gamepad menu buttons, on the press: Start, A, B, and Back/View.
  onPad: (b: "start" | "a" | "b" | "back") => void;
};

type Mode = "demo" | "play" | "over";

const POWER_NAMES: Record<PowerKind, string> = { ammo: "MAX AMMO", insta: "INSTA-KILL", double: "DOUBLE POINTS", nuke: "KABOOM!" };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Standard gamepad layout (Xbox names).
const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, l3: 10, r3: 11, up: 12 } as const;
const STICK_DEAD = 0.14;
// Past the dead zone, rescaled to 0..1 and curved so small nudges aim finely.
const stick = (x: number, y: number, curve = 1) => {
  const m = Math.hypot(x, y);
  if (m < STICK_DEAD) return { x: 0, y: 0, m: 0 };
  const k = Math.min(1, (m - STICK_DEAD) / (1 - STICK_DEAD));
  const s = Math.pow(k, curve) / m;
  return { x: x * s, y: y * s, m: Math.pow(k, curve) };
};

export class GameController {
  private renderer: Renderer;
  readonly sound = new Sound();
  private game: Game;
  private mode: Mode = "demo";
  private bot: Bot = newBot();
  private raf = 0;
  private last = performance.now();
  private time = 0;
  private paused = false;
  private disposed = false;
  private hudAt = 0;
  private popupId = 0;
  private overSent = false;
  private resizeObserver: ResizeObserver;

  private yaw = 0;
  private pitch = 0;
  private keys = new Set<string>();
  // Keys and clicks that came and went between two frames still count once.
  private tapped = new Set<string>();
  private mouse = { fire: false, ads: false };
  private touch = { mx: 0, mz: 0, fire: false, ads: false, reload: false, use: false, knife: false, swap: false, sprint: false };
  // The scroll wheel: +1 next gun, -1 the one before. Trackpads send a flood
  // of small deltas, so they add up to a notch and then rest a moment.
  private wheelDir = 0;
  private wheelAcc = 0;
  private wheelRest = 0;
  // Touch buttons pressed and let go between two frames still count once.
  private touchTap = new Set<string>();
  // Gamepads: only ones that have pressed a button, since some phones pose
  // their motion sensors as a pad with a stick stuck off-centre.
  private padsAwake = new Set<number>();
  private padHeld = new Set<number>();
  private padSprint = false;
  private usingPad = false;
  private sensitivity = 0.0022;
  private locked = false;

  private view: View = { bob: 0, kick: 0, swayX: 0, swayY: 0, flash: 0, deathT: 0, shake: 0 };
  private bobT = 0;
  private hurt = 0;
  private hitmarker = 0;
  private headHit = false;
  private lastYaw = 0;
  private lastPitch = 0;
  private viewMode: ViewMode = "fps";
  // Top-down aiming: where the mouse is on screen.
  private cursor: { x: number; y: number } | null = null;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 60;
  private slowSpells = 0;
  // Attract mode records on a stepped clock; its frame rate means nothing.
  private autoQuality = !new URLSearchParams(window.location.search).has("attract");

  constructor(private host: HTMLElement, private canvas: HTMLCanvasElement, private cb: Callbacks) {
    this.renderer = new Renderer(canvas);
    this.game = this.demoGame();
    this.renderer.resetBoards(this.game);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("contextmenu", this.onContext);
    document.addEventListener("pointerlockchange", this.onLockChange);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private demoGame() {
    const g = newGame({ demo: true });
    this.yaw = g.player.yaw;
    this.pitch = 0;
    this.bot = newBot();
    return g;
  }

  demo() {
    this.mode = "demo";
    this.paused = false;
    this.game = this.demoGame();
    this.renderer.resetBoards(this.game);
    this.view.deathT = 0;
    this.view.snap = true;
    this.sound.setMood("menu");
  }

  play() {
    this.sound.unlock();
    this.mode = "play";
    this.paused = false;
    this.overSent = false;
    this.game = newGame();
    this.yaw = this.game.player.yaw;
    this.pitch = 0;
    this.view.deathT = 0;
    this.view.snap = true;
    this.hurt = 0;
    this.renderer.resetBoards(this.game);
    this.clearInput();
    this.sound.setMood("play");
    this.lock();
  }

  setView(mode: ViewMode) {
    this.viewMode = mode;
    this.renderer.setView(mode);
    this.view.snap = true;
    if (mode === "top" && document.pointerLockElement) document.exitPointerLock();
    if (mode === "fps") {
      this.pitch = 0;
      this.lock();
    }
  }

  get viewing() {
    return this.viewMode;
  }

  // The twin-stick aim, from the right stick: screen up is north.
  setAim(x: number, y: number) {
    const mag = Math.hypot(x, y);
    if (mag > 0.2) this.yaw = Math.atan2(x, -y);
    this.touch.fire = mag > 0.55;
  }

  get isTouch() {
    return window.matchMedia("(pointer: coarse)").matches;
  }

  lock() {
    if (this.isTouch || this.mode !== "play" || this.viewMode === "top") return;
    const c = this.canvas as HTMLCanvasElement & { requestPointerLock: (o?: unknown) => Promise<void> | void };
    try {
      const r = c.requestPointerLock();
      if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => {});
    } catch {
      // Some browsers refuse without a click; the next click tries again.
    }
  }

  unlockAudio() {
    this.sound.unlock();
  }

  setMuted(m: boolean) {
    this.sound.setMuted(m);
  }

  setSensitivity(s: number) {
    this.sensitivity = 0.0022 * s;
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.last = performance.now();
    this.sound.setPaused(p);
    if (p) {
      this.clearInput();
      if (document.pointerLockElement) document.exitPointerLock();
    } else this.lock();
  }

  // Touch controls.
  setMove(x: number, z: number) {
    this.touch.mx = x;
    this.touch.mz = z;
  }
  look(dx: number, dy: number) {
    this.yaw += dx * 0.0055;
    this.pitch = clamp(this.pitch - dy * 0.0055, -1.35, 1.35);
  }
  setButton(name: "fire" | "ads" | "reload" | "use" | "knife" | "swap" | "sprint", down: boolean) {
    this.touch[name] = down;
    if (down) this.touchTap.add(name);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("contextmenu", this.onContext);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    if (document.pointerLockElement) document.exitPointerLock();
    this.sound.dispose();
    this.renderer.dispose();
  }

  // ---------- input ----------

  private clearInput() {
    this.keys.clear();
    this.tapped.clear();
    this.touchTap.clear();
    this.wheelDir = 0;
    this.wheelAcc = 0;
    this.padSprint = false;
    this.mouse = { fire: false, ads: false };
    this.touch = { mx: 0, mz: 0, fire: false, ads: false, reload: false, use: false, knife: false, swap: false, sprint: false };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "tab"].includes(k)) e.preventDefault();
    if (e.repeat) return;
    this.usingPad = false;
    if ((k === "escape" || k === "p") && this.mode === "play") this.cb.onPause();
    this.keys.add(k);
    this.tapped.add(k);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private onBlur = () => this.clearInput();

  private onMouseMove = (e: MouseEvent) => {
    if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) this.usingPad = false;
    if (this.viewMode === "top") {
      const r = this.canvas.getBoundingClientRect();
      this.cursor = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
      return;
    }
    if (!this.locked || this.paused || this.mode !== "play") return;
    this.yaw += e.movementX * this.sensitivity;
    this.pitch = clamp(this.pitch - e.movementY * this.sensitivity, -1.35, 1.35);
  };
  private onMouseDown = (e: MouseEvent) => {
    if (this.mode !== "play" || this.paused || this.isTouch) return;
    this.usingPad = false;
    if (this.viewMode === "top") {
      // Clicks on buttons aren't shots.
      if (e.target !== this.canvas && !(e.target as HTMLElement)?.dataset?.grab) return;
      if (e.button === 0) {
        this.mouse.fire = true;
        this.tapped.add("mouse0");
      }
      return;
    }
    if (!this.locked) {
      // Only clicks on the game itself grab the mouse.
      if (e.target === this.canvas || (e.target as HTMLElement)?.dataset?.grab) this.lock();
      return;
    }
    if (e.button === 0) {
      this.mouse.fire = true;
      this.tapped.add("mouse0");
    }
    if (e.button === 2) this.mouse.ads = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouse.fire = false;
    if (e.button === 2) this.mouse.ads = false;
  };
  private onWheel = (e: WheelEvent) => {
    if (!(this.locked || this.viewMode === "top") || this.mode !== "play" || this.paused) return;
    if (performance.now() < this.wheelRest) return;
    this.wheelAcc += e.deltaMode === 0 ? e.deltaY : e.deltaY * 40;
    if (Math.abs(this.wheelAcc) < 40) return;
    this.wheelDir = Math.sign(this.wheelAcc);
    this.wheelAcc = 0;
    this.wheelRest = performance.now() + 220;
  };
  private onContext = (e: Event) => {
    if (this.mode === "play") e.preventDefault();
  };
  private onLockChange = () => {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.canvas;
    this.mouse = { fire: false, ads: false };
    // Escape frees the mouse; take that as a pause.
    if (was && !this.locked && this.mode === "play" && !this.paused && this.viewMode === "fps") this.cb.onPause();
  };

  // The live game, for dev tools.
  get state() {
    return this.game;
  }
  aim(yaw: number, pitch: number) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  get mouseLocked() {
    return this.locked;
  }

  get padActive() {
    return this.usingPad;
  }

  private pads() {
    const out: Gamepad[] = [];
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad || !pad.connected) continue;
      if (!this.padsAwake.has(pad.index)) {
        if (!pad.buttons.some((b) => b.pressed)) continue;
        this.padsAwake.add(pad.index);
      }
      out.push(pad);
    }
    return out;
  }

  // Menu buttons on the press, any time, even paused or on the title.
  private pollPadMenu() {
    for (const pad of this.pads()) {
      for (const [b, name] of [[PAD.start, "start"], [PAD.a, "a"], [PAD.b, "b"], [PAD.back, "back"]] as const) {
        const key = pad.index * 100 + b;
        const down = !!pad.buttons[b]?.pressed;
        if (down && !this.padHeld.has(key)) {
          this.usingPad = true;
          this.cb.onPad(name);
        }
        if (down) this.padHeld.add(key);
        else this.padHeld.delete(key);
      }
    }
  }

  // Gamepad play, laid out like Call of Duty: left stick moves (click it to
  // run), right stick looks, RT fires, LT aims, X reloads and uses, A uses,
  // Y swaps, B or R3 knifes.
  private readPad(dt: number) {
    const top = this.viewMode === "top";
    const out = { mx: 0, mz: 0, fire: false, ads: false, reload: false, use: false, knife: false, swap: false, sprint: false, any: false };
    for (const pad of this.pads()) {
      const btn = (i: number) => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value ?? 0) > 0.35;
      const move = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
      const look = stick(pad.axes[2] ?? 0, pad.axes[3] ?? 0, top ? 1 : 1.8);
      const fire = btn(PAD.rt);
      const ads = btn(PAD.lt);
      if (btn(PAD.l3) && move.m > 0.2) this.padSprint = true;
      if (move.m < 0.3 || fire || ads) this.padSprint = false;
      if (top) {
        out.mx += move.x;
        out.mz += move.y;
        if (look.m > 0.2) this.yaw = Math.atan2(look.x, -look.y);
      } else {
        // Forward and strafe, turned to where you face.
        const s = Math.sin(this.yaw);
        const c = Math.cos(this.yaw);
        out.mx += s * -move.y + c * move.x;
        out.mz += -c * -move.y + s * move.x;
        const rate = (this.sensitivity / 0.0022) * (this.mouse.ads || ads ? 0.5 : 1);
        this.yaw += look.x * 3.4 * rate * dt;
        this.pitch = clamp(this.pitch - look.y * 2.3 * rate * dt, -1.35, 1.35);
      }
      out.fire ||= fire;
      out.ads ||= ads;
      out.reload ||= btn(PAD.x);
      out.use ||= btn(PAD.x) || btn(PAD.a);
      out.knife ||= btn(PAD.b) || btn(PAD.r3) || btn(PAD.rb);
      out.swap ||= btn(PAD.y) || btn(PAD.up);
      out.sprint ||= this.padSprint;
      out.any ||= move.m > 0 || look.m > 0 || pad.buttons.some((b) => b.pressed);
    }
    if (out.any) this.usingPad = true;
    return out;
  }

  private readInput(dt: number): Input {
    const k = this.keys;
    const tap = this.tapped;
    const has = (...n: string[]) => n.some((x) => k.has(x) || tap.has(x));
    const tt = this.touchTap;
    const t = {
      ...this.touch,
      fire: this.touch.fire || tt.has("fire"),
      ads: this.touch.ads || tt.has("ads"),
      reload: this.touch.reload || tt.has("reload"),
      use: this.touch.use || tt.has("use"),
      knife: this.touch.knife || tt.has("knife"),
      swap: this.touch.swap || tt.has("swap"),
    };
    tt.clear();
    const top = this.viewMode === "top";
    const pad = this.readPad(dt);
    let fire = this.mouse.fire || has("j", "mouse0") || t.fire || pad.fire;
    let mx = 0;
    let mz = 0;
    if (top) {
      // Walk on the map's axes; aim at the mouse, or with the arrow keys.
      mx = (has("d") ? 1 : 0) - (has("a") ? 1 : 0) + t.mx;
      mz = (has("s") ? 1 : 0) - (has("w") ? 1 : 0) - t.mz + pad.mz;
      mx += pad.mx;
      const ax = (has("arrowright") ? 1 : 0) - (has("arrowleft") ? 1 : 0);
      const az = (has("arrowdown") ? 1 : 0) - (has("arrowup") ? 1 : 0);
      if (ax || az) {
        this.yaw = Math.atan2(ax, -az);
        fire = true;
      } else if (this.cursor && !this.isTouch && !this.usingPad) {
        const p = this.game.player;
        const q = this.renderer.groundPoint(this.cursor.x, this.cursor.y);
        if (Math.hypot(q.x - p.x, q.z - p.z) > 0.3) this.yaw = Math.atan2(q.x - p.x, -(q.z - p.z));
      }
      fire ||= has(" ");
    } else {
      // Arrow keys turn, for anyone without a mouse to hand.
      const turn = (has("arrowright") ? 1 : 0) - (has("arrowleft") ? 1 : 0);
      const tilt = (has("arrowup") ? 1 : 0) - (has("arrowdown") ? 1 : 0);
      this.yaw += turn * 2.4 * dt;
      this.pitch = clamp(this.pitch + tilt * 1.6 * dt, -1.35, 1.35);
      const fwd = clamp((has("w") ? 1 : 0) - (has("s") ? 1 : 0) + t.mz, -1, 1);
      const str = clamp((has("d") ? 1 : 0) - (has("a") ? 1 : 0) + t.mx, -1, 1);
      const s = Math.sin(this.yaw);
      const c = Math.cos(this.yaw);
      mx = s * fwd + c * str + pad.mx;
      mz = -c * fwd + s * str + pad.mz;
      fire ||= has(" ");
    }
    // A touch of aim assist on phones and pads, while shooting or aiming.
    if ((this.isTouch || this.usingPad) && (fire || (!top && pad.ads))) this.assist(dt);
    const swap = has("tab", "q") || t.swap || pad.swap;
    // Number keys pick a slot; the wheel steps through them either way.
    const p = this.game.player;
    const n = p.weapons.length;
    let slot: number | undefined = ["1", "2", "3"].findIndex((x) => has(x));
    if (slot < 0) slot = this.wheelDir && n > 1 ? (p.cur + this.wheelDir + n) % n : undefined;
    this.wheelDir = 0;
    const input: Input = {
      mx: clamp(mx, -1, 1),
      mz: clamp(mz, -1, 1),
      yaw: this.yaw,
      pitch: this.pitch,
      flat: top,
      ads: !top && (this.mouse.ads || has("z", "k") || t.ads || pad.ads),
      fire,
      reload: has("r") || t.reload || pad.reload,
      use: has("e", "f") || t.use || pad.use,
      knife: has("v", "c") || t.knife || pad.knife,
      swap,
      slot,
      sprint: has("shift") || t.sprint || pad.sprint,
    };
    tap.clear();
    return input;
  }

  private assist(dt: number) {
    const g = this.game;
    const p = g.player;
    const top = this.viewMode === "top";
    let best: { yaw: number; pitch: number; off: number } | null = null;
    for (const z of g.zombies) {
      if (z.state === "dead" || z.state === "spawn") continue;
      const dx = z.x - p.x;
      const dz = z.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > (top ? 18 : 30)) continue;
      const yaw = Math.atan2(dx, -dz);
      const pitch = top ? 0 : Math.atan2(z.gy + z.y + 1.3 - (p.y + 1.6), d);
      const dy = Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
      const off = Math.hypot(dy, pitch - this.pitch);
      if (off > (top ? 0.3 : 0.2)) continue;
      const cp = Math.cos(pitch);
      const hit = top ? rayZombie(z, p.x, p.z, Math.sin(yaw), -Math.cos(yaw), p.y) : rayZombie3D(z, p.x, p.y + 1.6, p.z, Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
      if (!hit) continue;
      if (!best || off < best.off) best = { yaw: this.yaw + dy, pitch, off };
    }
    if (!best) return;
    const k = Math.min(1, dt * (top ? 8 : 5));
    this.yaw += (best.yaw - this.yaw) * k;
    if (!top) this.pitch += (best.pitch - this.pitch) * k;
  }

  // ---------- loop ----------

  private resize() {
    this.renderer.resize(this.host.clientWidth || 1, this.host.clientHeight || 1);
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const raw = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.05, raw);
    this.last = now;
    this.pollPadMenu();
    if (!this.paused) {
      this.tick(dt);
      this.measure(raw);
    }
    this.renderer.render();
  };

  // Frames per second over the last second or so. Two slow spells in a row
  // drop the quality a step.
  private measure(raw: number) {
    this.fpsFrames++;
    this.fpsTime += raw;
    if (this.fpsTime < 1) return;
    this.fps = Math.round(this.fpsFrames / this.fpsTime);
    this.fpsFrames = 0;
    this.fpsTime = 0;
    if (this.time < 3 || !this.autoQuality) return;
    this.slowSpells = this.fps < 45 ? this.slowSpells + 1 : 0;
    if (this.slowSpells >= 2 && this.renderer.qualityLevel < 2) {
      this.renderer.setQuality(this.renderer.qualityLevel + 1);
      this.slowSpells = 0;
    }
  }

  private tick(dt: number) {
    this.time += dt;
    const g = this.game;
    let input: Input;
    if (this.mode === "demo") {
      input = { ...botInput(g, this.bot, dt, { roam: true }), flat: this.viewMode === "top" };
      this.yaw = input.yaw;
      this.pitch = input.pitch;
    } else if (this.mode === "play") input = this.readInput(dt);
    else input = { ...NO_INPUT, yaw: this.yaw, pitch: this.pitch };
    step(g, dt, input);
    this.renderer.events(g, g.events);
    this.handleEvents();

    // The view: bob, sway, kick, and falling down.
    const p = g.player;
    this.bobT += dt * (p.sprinting ? 13 : 9) * p.moving;
    this.view.bob = Math.sin(this.bobT) * 0.035 * p.moving;
    const dyaw = Math.atan2(Math.sin(this.yaw - this.lastYaw), Math.cos(this.yaw - this.lastYaw));
    this.lastYaw = this.yaw;
    const dp = this.pitch - this.lastPitch;
    this.lastPitch = this.pitch;
    this.view.swayX += (clamp(-dyaw * 0.6, -0.05, 0.05) + Math.sin(this.bobT * 0.5) * 0.008 * p.moving - this.view.swayX) * Math.min(1, dt * 10);
    this.view.swayY += (clamp(-dp * 0.6, -0.04, 0.04) - Math.abs(Math.cos(this.bobT * 0.5)) * 0.008 * p.moving - this.view.swayY) * Math.min(1, dt * 10);
    this.view.kick = Math.max(0, this.view.kick - dt * 9);
    this.view.shake = Math.max(0, this.view.shake - dt * 3);
    if (p.dead) this.view.deathT += dt;
    this.hurt = Math.max(p.dead ? 1 : 0, this.hurt - dt * 0.8);
    this.hitmarker = Math.max(0, this.hitmarker - dt);

    this.renderer.sync(g, dt, this.time, this.view);
    this.view.snap = false;
    this.sound.setListener(p.x, p.z, this.viewMode === "top" ? 0 : p.yaw);
    this.sound.setDanger(this.nearestZombie());
    this.sound.setLowHealth(p.hp / p.maxHp);

    if (this.mode === "over" && !this.overSent && this.view.deathT > 3) this.sendOver();
    const now = performance.now();
    if (this.mode !== "demo" && now - this.hudAt > 50) {
      this.hudAt = now;
      this.cb.onHud(this.hud());
    }
  }

  private nearestZombie() {
    const g = this.game;
    let d = 99;
    for (const z of g.zombies) if (z.state === "walk") d = Math.min(d, Math.hypot(z.x - g.player.x, z.z - g.player.z));
    return d;
  }

  private hud(): Hud {
    const g = this.game;
    const p = g.player;
    const w = curWeapon(g);
    return {
      round: g.round,
      phase: g.phase,
      points: p.points,
      hp: p.hp,
      maxHp: p.maxHp,
      weapon: nameOf(w),
      pap: w.pap,
      mag: w.mag,
      reserve: w.reserve,
      magSize: magOf(w),
      reloading: p.reloadT > 0,
      reloadFrac: p.reloadT > 0 ? clamp(1 - p.reloadT / (WEAPONS[w.id].reload * (p.perks.includes("piragua") ? 0.5 : 1)), 0, 1) : 0,
      others: p.weapons.filter((_, i) => i !== p.cur).map(nameOf),
      perks: [...p.perks],
      prompt: g.prompt,
      insta: g.insta,
      double: g.double,
      hurt: Math.max(this.hurt, p.hp < p.maxHp ? (1 - p.hp / p.maxHp) * 0.8 : 0),
      hitmarker: this.hitmarker,
      headHit: this.headHit,
      ads: p.ads,
      left: g.toSpawn + aliveZombies(g),
      fps: this.fps,
      view: this.viewMode,
      pad: this.usingPad,
    };
  }

  private popup(text: string, color: string, sub?: string, big = false) {
    this.cb.onPopup({ id: ++this.popupId, text, sub, color, big });
  }

  private handleEvents() {
    const g = this.game;
    const live = this.mode === "play";
    const s = this.sound.play;
    const p = g.player;
    for (const e of g.events) {
      switch (e.type) {
        case "shot":
          s.shot(WEAPONS[e.weapon].sound, e.pap);
          if (live && this.viewMode === "fps") {
            this.view.kick = Math.min(1, this.view.kick + 0.6);
            this.pitch = clamp(this.pitch + e.kick, -1.35, 1.35);
            this.yaw += (Math.random() - 0.5) * e.kick * 0.5;
          }
          break;
        case "hit":
          if (!live) break;
          this.hitmarker = 0.18;
          this.headHit = e.head;
          s.hit(e.head, e.kill);
          break;
        case "points":
          if (live) this.cb.onPoints({ id: ++this.popupId, amount: e.amount });
          break;
        case "dry":
          s.dry();
          break;
        case "reload":
          if (live) s.reload();
          break;
        case "shell":
          if (live) s.shell();
          break;
        case "knife":
          s.knife(e.hit);
          break;
        case "buy":
          s.buy();
          break;
        case "poor":
          s.denied();
          break;
        case "door":
          s.door();
          break;
        case "board": {
          const sp = this.boardPos(e.win);
          if (e.fix) s.hammer(sp.x, sp.z);
          else s.boardTear(sp.x, sp.z);
          break;
        }
        case "roundStart":
          if (live) {
            s.roundStart(e.round);
            this.popup(`ROUND ${e.round}`, "#d8231f", undefined, true);
          }
          break;
        case "roundEnd":
          if (live) s.roundEnd();
          break;
        case "hurt":
          s.hurt();
          this.hurt = Math.min(1, this.hurt + 0.6);
          this.view.shake = 1;
          break;
        case "down":
          s.down();
          this.mode = "over";
          this.sound.setMood("over");
          break;
        case "swing":
          if (live) s.swipe(...this.zPos(e.id));
          break;
        case "groan":
          s.groan(e.x, e.z, e.gait, e.id);
          break;
        case "spawn":
          if (e.kind === "ground" && live) s.dirt(e.x, e.z);
          break;
        case "drop":
          if (live) s.dropAppear();
          break;
        case "power":
          s.power(e.kind);
          this.popup(POWER_NAMES[e.kind], "#ffd84a", undefined, true);
          break;
        case "perk":
          s.perk();
          this.popup(PERKS[e.perk].name, PERKS[e.perk].color, PERKS[e.perk].blurb);
          break;
        case "box":
          if (e.state === "open") s.boxOpen();
          else if (e.state === "take") s.buy();
          else if (e.state === "close") s.boxClose();
          break;
        case "pap":
          if (e.state === "start") s.papStart();
          else {
            s.papDone();
            this.popup(nameOf(p.weapons[p.cur]), "#d890ff", "Pack-a-Punched!");
          }
          break;
        case "switch":
          s.swap();
          break;
      }
    }
    g.events.length = 0;
  }

  private zPos(id: number): [number, number] {
    const z = this.game.zombies.find((zz) => zz.id === id);
    return z ? [z.x, z.z] : [this.game.player.x, this.game.player.z];
  }

  private boardPos(win: number) {
    return { x: SPAWNS[win].at.x, z: SPAWNS[win].at.z };
  }

  private sendOver() {
    this.overSent = true;
    const g = this.game;
    const p = g.player;
    this.cb.onHud(this.hud());
    this.cb.onOver({ round: g.round, score: p.earned, kills: p.kills, headshots: p.headshots });
  }
}
