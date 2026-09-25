// Runs Frog Ball on a canvas: the fixed-step sim, the Monkey Ball camera,
// input (keys, gamepad, or a virtual joystick on touch screens) and the run
// of stages.
// React only sees HUD numbers and a few events.
import * as THREE from "three";
import { Renderer } from "./render";
import { sfx } from "./sfx";
import { headingDir, MAX_TILT, newGame, newPilot, pilotTilt, READY_TIME, ropeStep, speedOf, stageScore, step, tiltedGravity, FLIES_PER_LIFE, type Game, type Pilot, type Tether, type V3 } from "./sim";
import { COOP_STAGES, STAGES, type StageDef } from "./stages";
import type { Seat, ServerMessage } from "./coopNet";

// demo: the autopilot plays (behind the title). preview: orbit a stage (stage select).
// coop: a two-player chained run, driven by the co-op server.
export type Mode = "demo" | "preview" | "run" | "practice" | "coop";

// What the controller needs from the co-op connection.
export interface CoopLink {
  send: (message: { type: string; [key: string]: unknown }) => void;
  serverNow: () => number;
}

type StartMessage = Extract<ServerMessage, { type: "start" }>;
type OutcomeMessage = Extract<ServerMessage, { type: "outcome" }>;
type PeerMessage = Extract<ServerMessage, { type: "peer" }>;

interface CoopState {
  link: CoopLink;
  seat: Seat;
  attempt: number;
  at: number; // server time (ms) when this attempt's stage clock reads 0
  // The partner's latest ball update, in their stage clock, with how they
  // were tilting (so we can guess how they're speeding up).
  peer: { t: number; p: V3; v: V3; k: { x: number; z: number }; s: string };
  // Where we draw the partner is our best guess plus this, which fades to
  // nothing: each new update's correction is eased in rather than snapped.
  visOffset: THREE.Vector3;
  lastSend: number;
  reported: boolean; // told the server how this attempt ended for us
  menu: boolean; // the in-game menu is open (co-op can't pause)
}

export interface Hud {
  score: number;
  timeLeft: number;
  flies: number;
  lives: number;
  speed: number; // km/h
  stage: number;
  stageTime: number;
  practice: boolean;
  coop: boolean;
}

export interface ClearInfo {
  timeBonus: number;
  flyBonus: number;
  fast: boolean;
  total: number;
}

export interface RunResult {
  score: number;
  stage: number; // index of the last stage reached
  cleared: boolean;
  flies: number;
}

// coop: a small message about the partner ("P2 IS THROUGH!").
export type BannerKind = "ready" | "go" | "goal" | "fall" | "time" | "oneup" | "hurry" | "coop";

export interface GameCallbacks {
  onHud: (hud: Hud) => void;
  onStage: (stage: number) => void;
  onBanner: (text: string, kind: BannerKind) => void;
  onClear: (info: ClearInfo) => void;
  onOver: (result: RunResult) => void;
  onPauseKey: () => void;
}

const START_LIVES = 3;
// The attract mode behind the menu shows off a few stages.
const DEMO_STAGES = [5, 8, 12, 1, 3, 10, 4];
// Rendering is deliberately chunky, like Salmon Run 2: the long side of the
// screen is drawn at about this many pixels and scaled up.
const PIXEL_LONG_SIDE = 720;
// The virtual joystick: how far (CSS px) the knob travels for full tilt.
const STICK_RANGE = 46;
const STICK_DEAD = 0.08;

// The co-op ball update rate, and how far ahead we'll guess the partner's ball.
const COOP_SEND_MS = 33;
const MAX_PEER_AGE = 0.35;
// How fast a correction to the partner's drawn position fades (per second),
// and how big a correction is snapped rather than eased.
const PEER_EASE = 12;
const PEER_SNAP = 3;
// The stage clock eases toward the server's by at most this share of each
// frame, unless it's more than CLOCK_SNAP seconds out.
const CLOCK_SLEW = 0.25;
const CLOCK_SNAP = 0.3;

const smooth = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const toV3 = (a: number[]): V3 => ({ x: a[0], y: a[1], z: a[2] });
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class GameController {
  readonly renderer: Renderer;
  private game: Game = newGame(STAGES[0]);
  private mode: Mode = "demo";
  private stageIndex = 0;
  private demoIndex = 0;
  private pilot: Pilot = newPilot();
  private lives = START_LIVES;
  private score = 0;
  private flies = 0;
  private overSent = false;
  private advanced = false;
  private padHeld = new Set<number>();
  private coop: CoopState | null = null;

  private raf = 0;
  private last = 0;
  private clock = 0;
  private paused = false;
  private disposed = false;
  private hudAt = 0;
  private resizeObserver: ResizeObserver;

  // Camera state.
  private camYaw = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private smoothY = 0;
  private tiltVis = { x: 0, y: 0 };

  // Input.
  // Phones and tablets steer with a virtual joystick.
  private touch = window.matchMedia("(pointer: coarse)").matches;
  private keys = new Set<string>();
  private keyInput = { x: 0, y: 0 };
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private stickEls: { base: HTMLDivElement; knob: HTMLDivElement };

  constructor(private host: HTMLElement, private canvas: HTMLCanvasElement, private cb: GameCallbacks) {
    this.renderer = new Renderer(canvas);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.stickEls = this.makeStick();
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // Orbit a stage without playing it, behind the stage select.
  preview(stageIndex: number) {
    this.paused = false;
    if (this.mode === "preview" && this.stageIndex === stageIndex) return;
    this.mode = "preview";
    this.loadStage(stageIndex);
  }

  // Try the stage again from the start; in a run it costs a life.
  retry() {
    if (!this.isLive()) return false;
    if (this.mode === "run") {
      if (this.lives <= 0) return false;
      this.lives--;
    }
    this.paused = false;
    this.loadStage(this.stageIndex);
    return true;
  }

  // Keep going from the stage you lost on, with fresh lives and a fresh score.
  continueRun(stageIndex: number) {
    this.stageIndex = stageIndex;
    this.mode = "run";
    this.lives = START_LIVES;
    this.score = 0;
    this.flies = 0;
    this.overSent = false;
    this.paused = false;
    this.loadStage(this.stageIndex);
  }

  // Hurry past the goal tally or a fall.
  skip() {
    const g = this.game;
    if (!this.isLive() || this.paused) return;
    if ((g.status === "goal" && g.statusT > 1.2) || ((g.status === "fallout" || g.status === "timeover") && g.statusT > 1)) g.statusT = 99;
  }

  private isLive() {
    return this.mode === "run" || this.mode === "practice" || this.mode === "coop";
  }

  private stageList(): StageDef[] {
    return this.mode === "coop" ? COOP_STAGES : STAGES;
  }

  start(mode: Mode, stageIndex = 0) {
    this.leaveCoop();
    this.mode = mode;
    this.lives = START_LIVES;
    this.score = 0;
    this.flies = 0;
    this.overSent = false;
    this.paused = false;
    if (mode === "demo") {
      this.demoIndex = stageIndex % DEMO_STAGES.length;
      this.loadStage(DEMO_STAGES[this.demoIndex]);
    } else {
      this.loadStage(stageIndex);
    }
  }

  setPaused(paused: boolean) {
    // A co-op world keeps going; the menu just takes your hands off the controls.
    if (this.coop) {
      this.coop.menu = paused;
      this.stick = null;
      this.drawStick();
      return;
    }
    this.paused = paused;
    this.last = performance.now();
    if (paused) this.stick = null;
    this.drawStick();
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
    window.removeEventListener("blur", this.onBlur);
    this.stickEls.base.remove();
    this.renderer.dispose();
  }

  // --- stages ----------------------------------------------------------------

  private loadStage(i: number) {
    const stage = this.stageList()[i];
    this.stageIndex = i;
    this.game = newGame(stage, this.coop?.seat);
    this.pilot = newPilot();
    this.advanced = false;
    this.renderer.setStage(this.game);
    this.camYaw = (stage.heading * Math.PI) / 180;
    this.placeIntroCamera(0, true);
    if (this.isLive()) {
      this.cb.onStage(i);
      this.cb.onBanner("READY", "ready");
      sfx.ready();
    }
  }

  private handleEvents() {
    const g = this.game;
    const live = this.isLive();
    for (const e of g.events) {
      switch (e.type) {
        case "go":
          if (live) {
            this.cb.onBanner("GO!", "go");
            sfx.go();
          }
          break;
        case "fly": {
          this.renderer.pop(new THREE.Vector3(e.at.x, e.at.y, e.at.z), e.big);
          if (!live) break;
          if (this.coop) {
            this.coop.link.send({ type: "fly", attempt: this.coop.attempt, id: g.flies.findIndex((f) => f.at === e.at), big: e.big });
            this.flies += e.big ? 10 : 1;
            if (e.big) sfx.bigFly();
            else sfx.fly();
            break;
          }
          const n = e.big ? 10 : 1;
          const before = Math.floor(this.flies / FLIES_PER_LIFE);
          this.flies += n;
          if (e.big) sfx.bigFly();
          else sfx.fly();
          if (this.mode === "run" && Math.floor(this.flies / FLIES_PER_LIFE) > before) {
            this.lives++;
            this.cb.onBanner("1UP!", "oneup");
            sfx.oneUp();
          }
          break;
        }
        case "bump":
          if (live) sfx.bump();
          break;
        case "wall":
          if (live && e.strength > 0.3) sfx.land(e.strength);
          break;
        case "land":
          if (live) sfx.land(e.strength);
          break;
        case "spring":
          if (live) sfx.spring();
          break;
        case "boost":
          if (live) sfx.boost();
          break;
        case "tick":
          if (!live) break;
          sfx.tick();
          if (e.seconds === 10) this.cb.onBanner("HURRY UP!", "hurry");
          break;
        case "yank":
          if (live) sfx.yank(e.strength);
          break;
        case "goal":
          if (!live) break;
          if (this.coop) {
            // One ball through clears it for both; the server's verdict brings the fanfare.
            this.coop.link.send({ type: "goal", attempt: this.coop.attempt, left: g.timeLeft, limit: g.stage.time });
            this.coop.reported = true;
            break;
          }
          sfx.goal();
          this.cb.onBanner("GOAL!", "goal");
          if (this.mode === "run") {
            const info = stageScore(g);
            this.score += info.total;
            this.cb.onClear(info);
          } else {
            this.cb.onClear({ ...stageScore(g), total: 0 });
          }
          break;
        case "fallout":
          if (!live) break;
          if (this.coop) {
            this.reportFail("fall");
            break;
          }
          sfx.fallout();
          this.cb.onBanner("FALL OUT", "fall");
          break;
        case "timeover":
          if (!live) break;
          if (this.coop) {
            this.reportFail("time");
            break;
          }
          sfx.timeover();
          this.cb.onBanner("TIME OVER", "time");
          break;
      }
    }
    g.events.length = 0;
  }

  // After a goal or a fall, move on once the moment has played out.
  private advance() {
    const g = this.game;
    if (this.advanced) return;
    if (this.mode === "preview" || this.mode === "coop") return;
    if (this.mode === "demo") {
      if ((g.status === "goal" && g.statusT > 2.5) || ((g.status === "fallout" || g.status === "timeover") && g.statusT > 1.5)) {
        this.advanced = true;
        this.demoIndex = (this.demoIndex + 1) % DEMO_STAGES.length;
        this.loadStage(DEMO_STAGES[this.demoIndex]);
      }
      return;
    }
    if (g.status === "goal" && g.statusT > 4.4) {
      this.advanced = true;
      const next = this.stageIndex + 1;
      if (next >= STAGES.length) this.finish(true);
      else this.loadStage(next);
    } else if ((g.status === "fallout" || g.status === "timeover") && g.statusT > 2.4) {
      this.advanced = true;
      if (this.mode === "run") {
        this.lives--;
        if (this.lives < 0) {
          this.finish(false);
          return;
        }
      }
      this.loadStage(this.stageIndex);
    }
  }

  private finish(cleared: boolean) {
    if (this.overSent) return;
    this.overSent = true;
    this.paused = true;
    if (cleared && this.mode === "run") this.score += Math.max(0, this.lives) * 1000;
    this.cb.onOver({ score: this.mode === "run" ? this.score : 0, stage: this.stageIndex, cleared, flies: this.flies });
  }

  // --- input -------------------------------------------------------------------------

  private makeStick() {
    const base = document.createElement("div");
    // Styled like the arcade UI: ink outlines and the menu yellow.
    base.style.cssText =
      "position:absolute;width:112px;height:112px;margin:-56px 0 0 -56px;border-radius:50%;border:4px solid #1a1033;box-shadow:inset 0 0 0 3px rgba(255,243,196,.75);background:rgba(35,22,81,.45);pointer-events:none;display:none;z-index:5";
    const knob = document.createElement("div");
    knob.style.cssText =
      "position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;border:4px solid #1a1033;background:linear-gradient(#ffe56e 0 50%,#ffc424 50% 100%);box-shadow:inset 0 -4px 0 #d98a00";
    base.appendChild(knob);
    this.host.appendChild(base);
    return { base, knob };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.isLive() || this.paused) return;
    // Touch anywhere on the game to grab the joystick there.
    if (e.pointerType === "mouse" || this.stick) return;
    const r = this.host.getBoundingClientRect();
    this.stick = { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top, x: 0, y: 0 };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.stick || e.pointerId !== this.stick.id) return;
    const r = this.host.getBoundingClientRect();
    const dx = e.clientX - r.left - this.stick.ox;
    const dy = e.clientY - r.top - this.stick.oy;
    const m = Math.hypot(dx, dy);
    const k = m > STICK_RANGE ? STICK_RANGE / m : 1;
    this.stick.x = (dx * k) / STICK_RANGE;
    this.stick.y = (-dy * k) / STICK_RANGE;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.stick && e.pointerId === this.stick.id) this.stick = null;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" || e.key === "p" || e.key === "P") {
      if (this.isLive() && !this.paused && !this.overSent) this.cb.onPauseKey();
      return;
    }
    if (e.key === "Enter" || e.key === " ") this.skip();
    if (e.key.startsWith("Arrow") || e.key === " ") e.preventDefault();
    this.keys.add(e.key.toLowerCase());
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onBlur = () => {
    this.keys.clear();
    this.stick = null;
  };

  // Tilt as (right, forward) relative to the camera, length up to 1.
  private readInput(dt: number) {
    const k = this.keys;
    const tx = (k.has("arrowright") || k.has("d") ? 1 : 0) - (k.has("arrowleft") || k.has("a") ? 1 : 0);
    const ty = (k.has("arrowup") || k.has("w") ? 1 : 0) - (k.has("arrowdown") || k.has("s") ? 1 : 0);
    // Keys ease in, so a tap is a nudge and holding is full tilt.
    const r = smooth(tx || ty ? 7 : 12, dt);
    this.keyInput.x += (tx - this.keyInput.x) * r;
    this.keyInput.y += (ty - this.keyInput.y) * r;
    let x = this.keyInput.x;
    let y = this.keyInput.y;
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > 0.15) {
        x += ax;
        y -= ay;
      }
      // Start pauses, A hurries the tally along; on the press, not while held.
      for (const b of [9, 0]) {
        const down = !!pad.buttons[b]?.pressed;
        const key = pad.index * 100 + b;
        if (down && !this.padHeld.has(key)) {
          if (b === 9 && this.isLive() && !this.paused && !this.overSent) this.cb.onPauseKey();
          if (b === 0) this.skip();
        }
        if (down) this.padHeld.add(key);
        else this.padHeld.delete(key);
      }
    }
    if (this.stick) {
      // A small dead zone so resting a thumb on it doesn't drift.
      const m = Math.hypot(this.stick.x, this.stick.y);
      const k = m < STICK_DEAD ? 0 : (m - STICK_DEAD) / (1 - STICK_DEAD) / m;
      x += this.stick.x * k;
      y += this.stick.y * k;
    }
    const m = Math.hypot(x, y);
    return m > 1 ? { x: x / m, y: y / m } : { x, y };
  }

  // --- camera -------------------------------------------------------------------------

  private followPose(yaw: number, ballY: number, out: { pos: THREE.Vector3; look: THREE.Vector3 }) {
    const g = this.game;
    const fwd = headingDir(yaw);
    const portrait = this.renderer.camera.aspect < 1;
    const dist = portrait ? 5 : 4.3;
    const height = portrait ? 2.3 : 1.9;
    out.pos.set(g.p.x - fwd.x * dist, ballY + height, g.p.z - fwd.z * dist);
    // Tall screens look further ahead, so the ball sits low and the path fills the view.
    const ahead = portrait ? 2.2 : 1.5;
    out.look.set(g.p.x + fwd.x * ahead, ballY + (portrait ? 0.6 : 0.35), g.p.z + fwd.z * ahead);
  }

  // The READY swoop: from a high view of the whole stage down to the ball.
  private placeIntroCamera(k: number, reset = false) {
    const g = this.game;
    const s = g.stage;
    const gx = s.goal.at[0];
    const gz = s.goal.at[2];
    const cx = (s.start[0] + gx) / 2;
    const cz = (s.start[2] + gz) / 2;
    const cy = (s.start[1] + s.goal.at[1]) / 2;
    const span = Math.hypot(gx - s.start[0], gz - s.start[2]);
    const yaw0 = this.camYaw + Math.PI * 0.35;
    const fwd = headingDir(yaw0);
    const high = { pos: new THREE.Vector3(cx - fwd.x * span * 0.75, cy + span * 0.55 + 6, cz - fwd.z * span * 0.75), look: new THREE.Vector3(cx, cy, cz) };
    const follow = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.smoothY = g.p.y;
    this.followPose(this.camYaw, g.p.y, follow);
    const e = k * k * (3 - 2 * k);
    this.camPos.lerpVectors(high.pos, follow.pos, e);
    this.camLook.lerpVectors(high.look, follow.look, e);
    if (reset) this.tiltVis = { x: 0, y: 0 };
  }

  private updateCamera(dt: number, input: { x: number; y: number }) {
    const g = this.game;
    const cam = this.renderer.camera;
    if (this.mode === "preview") {
      // A slow orbit round the whole stage.
      const s = g.stage;
      const cx = (s.start[0] + s.goal.at[0]) / 2;
      const cy = (s.start[1] + s.goal.at[1]) / 2;
      const cz = (s.start[2] + s.goal.at[2]) / 2;
      const r = Math.max(16, Math.hypot(s.goal.at[0] - s.start[0], s.goal.at[2] - s.start[2]) * 0.85);
      const a = this.clock * 0.16;
      cam.position.set(cx + Math.sin(a) * r, cy + r * 0.5 + 4, cz + Math.cos(a) * r);
      cam.up.set(0, 1, 0);
      cam.lookAt(cx, cy - 2, cz);
      return;
    }
    if (g.status === "ready") {
      this.placeIntroCamera(Math.min(1, g.statusT / (READY_TIME * 0.85)));
    } else if (g.status === "fallout" || (g.status === "timeover" && g.p.y < g.killY + 8)) {
      // Stay put and watch the ball drop away.
      this.camLook.lerp(new THREE.Vector3(g.p.x, g.p.y, g.p.z), smooth(6, dt));
    } else {
      const vx = g.v.x - g.groundVel.x;
      const vz = g.v.z - g.groundVel.z;
      const sp = Math.hypot(vx, vz);
      if (g.status === "goal") {
        this.camYaw += dt * 0.9;
      } else if (sp > 1) {
        // Swing round behind the ball, faster the faster it goes.
        const want = Math.atan2(-vx, -vz);
        this.camYaw += wrapAngle(want - this.camYaw) * smooth(Math.min(3, (sp - 1) * 0.3), dt);
      }
      this.smoothY += (g.p.y - this.smoothY) * smooth(g.grounded ? 10 : 4, dt);
      const pose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
      this.followPose(this.camYaw, this.smoothY, pose);
      this.camPos.lerp(pose.pos, smooth(14, dt));
      this.camLook.lerp(pose.look, smooth(18, dt));
    }
    cam.position.copy(this.camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.camLook);

    // Tip the view the way the stage tips, around the ball.
    const playing = g.status === "play";
    this.tiltVis.x += ((playing ? input.x : 0) - this.tiltVis.x) * smooth(8, dt);
    this.tiltVis.y += ((playing ? input.y : 0) - this.tiltVis.y) * smooth(8, dt);
    const amt = MAX_TILT * 0.45;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quaternion);
    const q = new THREE.Quaternion()
      .setFromAxisAngle(right, this.tiltVis.y * amt)
      .multiply(new THREE.Quaternion().setFromAxisAngle(back, this.tiltVis.x * amt));
    const pivot = new THREE.Vector3(g.p.x, g.p.y, g.p.z);
    cam.position.sub(pivot).applyQuaternion(q).add(pivot);
    cam.quaternion.premultiply(q);
  }

  // --- loop ----------------------------------------------------------------------------

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    const ratio = Math.min(window.devicePixelRatio || 1, PIXEL_LONG_SIDE / Math.max(w, h));
    this.renderer.resize(w, h, ratio);
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const realDt = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.05, realDt);
    this.last = now;
    if (this.coop) {
      // Co-op keeps to real time (the server's clock), however slow the frames.
      this.coopFrame(Math.min(0.25, realDt), now);
      return;
    }
    if (this.paused) {
      this.renderer.render(this.clock);
      return;
    }
    this.clock += dt;
    const g = this.game;
    const input = this.isLive() ? this.readInput(dt) : { x: 0, y: 0 };
    let tilt: { x: number; z: number };
    if (this.mode === "demo") {
      tilt = pilotTilt(g, this.pilot);
    } else if (this.mode === "preview") {
      tilt = { x: 0, z: 0 };
    } else {
      const f = headingDir(this.camYaw);
      tilt = { x: f.x * input.y - f.z * input.x, z: f.z * input.y + f.x * input.x };
    }
    step(g, dt, tilt);
    this.handleEvents();
    this.advance();
    if (this.game !== g) return; // a new stage was loaded

    // Show the demo's steering as tilt too.
    let visInput = input;
    if (this.mode === "demo") {
      const f = headingDir(this.camYaw);
      visInput = { x: tilt.x * -f.z + tilt.z * f.x, y: tilt.x * f.x + tilt.z * f.z };
    }
    this.updateCamera(dt, visInput);
    this.renderer.sync(g, this.clock, dt);
    this.renderer.render(this.clock);
    this.drawStick();

    if (this.isLive() && now - this.hudAt > 50) {
      this.hudAt = now;
      this.cb.onHud({
        score: this.score,
        timeLeft: g.timeLeft,
        flies: this.flies,
        lives: this.lives,
        speed: Math.round(speedOf(g) * 3.6),
        stage: this.stageIndex,
        stageTime: g.stage.time,
        practice: this.mode === "practice",
        coop: false,
      });
    }
  };

  // --- co-op ---------------------------------------------------------------------------

  // A stage of a co-op run, as announced by the server (also every retry).
  startCoop(link: CoopLink, seat: Seat, m: StartMessage) {
    const newRun = m.stage === 0 && m.attempt === 1;
    this.mode = "coop";
    this.lives = m.lives;
    this.score = m.score;
    if (newRun) this.flies = 0;
    this.overSent = false;
    this.paused = false;
    const other = newGame(COOP_STAGES[m.stage], seat === 0 ? 1 : 0);
    this.coop = {
      link,
      seat,
      attempt: m.attempt,
      at: m.at,
      peer: { t: 0, p: other.p, v: { x: 0, y: 0, z: 0 }, k: { x: 0, z: 0 }, s: "ready" },
      visOffset: new THREE.Vector3(),
      lastSend: 0,
      reported: false,
      menu: this.coop?.menu ?? false,
    };
    this.renderer.setCoop(true, seat);
    this.loadStage(m.stage);
  }

  coopPeer(m: PeerMessage) {
    const c = this.coop;
    if (!c || m.a !== c.attempt || m.t < c.peer.t) return;
    const before = this.peerGuess(this.game.t, true);
    c.peer = { t: m.t, p: toV3(m.p), v: toV3(m.v), k: m.k ? { x: m.k[0], z: m.k[1] } : { x: 0, z: 0 }, s: m.s };
    const after = this.peerGuess(this.game.t, true);
    // Keep the drawn frog where it was this frame, then ease out the difference.
    c.visOffset.x += before.x - after.x;
    c.visOffset.y += before.y - after.y;
    c.visOffset.z += before.z - after.z;
    if (c.visOffset.length() > PEER_SNAP) c.visOffset.set(0, 0, 0);
  }

  // Where the partner's ball should be at stage time t: its last update,
  // carried on at its speed and sped up by the way it was tilting. For
  // drawing (withChain) it's also held by the chain to our ball, since on
  // their screen our ball yanks theirs just as theirs yanks ours.
  private peerGuess(t: number, withChain = false): V3 {
    const peer = this.coop!.peer;
    const age = Math.max(0, Math.min(MAX_PEER_AGE, t - peer.t));
    const rolling = peer.s === "play";
    const grav = rolling ? tiltedGravity(peer.k) : { x: 0, y: 0, z: 0 };
    if (!withChain || age === 0) {
      return {
        x: peer.p.x + peer.v.x * age + 0.5 * grav.x * age * age,
        y: peer.p.y + peer.v.y * age,
        z: peer.p.z + peer.v.z * age + 0.5 * grav.z * age * age,
      };
    }
    const g = this.game;
    const steps = Math.max(1, Math.ceil(age / (1 / 120)));
    const h = age / steps;
    let p = { ...peer.p };
    let v = { ...peer.v };
    for (let i = 0; i < steps; i++) {
      v = { x: v.x + grav.x * h, y: v.y, z: v.z + grav.z * h };
      p = { x: p.x + v.x * h, y: p.y + v.y * h, z: p.z + v.z * h };
      if (g.t > 0 && peer.s !== "ready") ({ p, v } = ropeStep(p, v, g.p, g.v, h));
    }
    return p;
  }

  // A fly eaten by either of us; ours are already gone.
  coopFly(id: number, seat: Seat) {
    const c = this.coop;
    const f = this.game.flies[id];
    if (!c || seat === c.seat || !f || f.taken) return;
    f.taken = true;
    this.flies += f.big ? 10 : 1;
    this.renderer.pop(new THREE.Vector3(f.at.x, f.at.y, f.at.z), f.big);
    sfx.fly();
  }

  // The server's verdict on this attempt.
  coopOutcome(m: OutcomeMessage, name: string) {
    const c = this.coop;
    if (!c || m.attempt !== c.attempt) return;
    const g = this.game;
    this.lives = m.lives;
    this.score = m.score;
    c.reported = true;
    if (m.kind === "clear") {
      if (g.status === "play") g.status = "goal";
      g.statusT = 0;
      sfx.goal();
      this.cb.onBanner("GOAL!", "goal");
      if (m.seat !== undefined && m.seat !== c.seat) this.cb.onBanner(`${name} GOT YOU THROUGH!`, "coop");
      if (m.info) this.cb.onClear(m.info);
      return;
    }
    // Whoever slipped, the attempt is over for both of us.
    if (g.status === "play" || g.status === "goal") {
      g.status = m.kind === "time" ? "timeover" : "fallout";
      g.statusT = 0;
    }
    if (m.kind === "time") {
      sfx.timeover();
      this.cb.onBanner("TIME OVER", "time");
    } else {
      sfx.fallout();
      this.cb.onBanner(m.seat === c.seat ? "FALL OUT" : `${name} FELL!`, "fall");
    }
  }

  private leaveCoop() {
    if (!this.coop) return;
    this.coop = null;
    this.renderer.setCoop(false);
  }

  private reportFail(why: "fall" | "time") {
    const c = this.coop!;
    if (c.reported) return;
    c.reported = true;
    c.link.send({ type: "fail", attempt: c.attempt, why });
  }

  private coopFrame(dt: number, now: number) {
    const c = this.coop!;
    this.clock += dt;
    const g = this.game;
    // Our stage clock follows the server's, so the partner's is the same. It
    // eases toward it, so a better clock estimate never makes the world jump
    // or stall; only a big gap (a hidden tab) is closed at once.
    const target = (c.link.serverNow() - c.at) / 1000;
    const behind = target - (g.t + dt);
    const simDt = target <= 0 ? 0 : Math.abs(behind) > CLOCK_SNAP ? Math.max(0, Math.min(2, target - g.t)) : Math.max(0, dt + Math.max(-dt * CLOCK_SLEW, Math.min(dt * CLOCK_SLEW, behind)));
    const input = c.menu ? { x: 0, y: 0 } : this.readInput(dt);
    const f = headingDir(this.camYaw);
    const tilt = { x: f.x * input.y - f.z * input.x, z: f.z * input.y + f.x * input.x };

    const peer = c.peer;
    const guess = this.peerGuess(g.t + simDt / 2);
    const chained = g.t > 0 && peer.s !== "ready";
    const tether: Tether | undefined = chained ? { at: guess, vel: { ...peer.v } } : undefined;
    step(g, simDt, tilt, tether);
    this.handleEvents();

    if (now - c.lastSend >= COOP_SEND_MS && target >= 0) {
      c.lastSend = now;
      const r = (n: number) => Math.round(n * 1000) / 1000;
      c.link.send({ type: "state", a: c.attempt, t: r(g.t), p: [r(g.p.x), r(g.p.y), r(g.p.z)], v: [r(g.v.x), r(g.v.y), r(g.v.z)], k: [r(tilt.x), r(tilt.z)], s: g.status });
    }

    // Draw the partner at our best guess for now, plus the fading correction.
    c.visOffset.multiplyScalar(Math.exp(-PEER_EASE * dt));
    const now3 = this.peerGuess(g.t, true);
    const vis = new THREE.Vector3(now3.x + c.visOffset.x, now3.y + c.visOffset.y, now3.z + c.visOffset.z);
    this.updateCamera(dt, input);
    this.renderer.sync(g, this.clock, dt);
    this.renderer.syncPartner(vis, new THREE.Vector3(peer.v.x, peer.v.y, peer.v.z), true, true, dt, this.clock);
    this.renderer.render(this.clock);
    this.drawStick();

    if (now - this.hudAt > 50) {
      this.hudAt = now;
      this.cb.onHud({
        score: this.score,
        timeLeft: g.timeLeft,
        flies: this.flies,
        lives: this.lives,
        speed: Math.round(speedOf(g) * 3.6),
        stage: this.stageIndex,
        stageTime: g.stage.time,
        practice: false,
        coop: true,
      });
    }
  }

  // On touch screens the joystick rests at the bottom of the screen during
  // play, and jumps to wherever you put your thumb down.
  private drawStick() {
    const { base, knob } = this.stickEls;
    if (!this.touch || !this.isLive() || this.paused || this.overSent || this.coop?.menu) {
      base.style.display = "none";
      return;
    }
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const rest = w < h ? { x: w / 2, y: h - 104 } : { x: 124, y: h - 104 };
    const at = this.stick ? { x: this.stick.ox, y: this.stick.oy } : rest;
    base.style.display = "block";
    base.style.opacity = this.stick ? "1" : "0.6";
    base.style.left = `${at.x}px`;
    base.style.top = `${at.y}px`;
    const sx = this.stick?.x ?? 0;
    const sy = this.stick?.y ?? 0;
    knob.style.transform = `translate(${sx * STICK_RANGE}px, ${-sy * STICK_RANGE}px)`;
  }
}
