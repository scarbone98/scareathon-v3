// Runs Ghost Ridge: the frame loop, keyboard and touch input, the chase
// camera, and turning sim events into sound and on-screen callouts.
import * as THREE from "three";
import { centerAt, halfAt, heightAt, LENGTH } from "./course";
import { botInput, newBot, type Bot } from "./bot";
import { Sound } from "./music";
import { Renderer } from "./render";
import { distance, newGame, NO_INPUT, sharedCourse, speedOf, step, type Game, type Input } from "./sim";

export type Hud = {
  time: number;
  score: number;
  speed: number; // km/h
  boost: number;
  boosting: boolean;
  candy: number;
  progress: number; // 0..1 down the mountain
  checkpoints: number;
  status: Game["status"];
};

export type Popup = { id: number; text: string; sub?: string; color: string; big?: boolean };

export type RunResult = {
  finished: boolean;
  score: number;
  elapsed: number;
  tricks: number;
  candy: number;
  candyTotal: number;
  bestTrick: { name: string; points: number } | null;
  finishBonus: number;
};

export type Callbacks = {
  onHud: (hud: Hud) => void;
  onPopup: (p: Popup) => void;
  onOver: (r: RunResult) => void;
  onPause: () => void;
};

type Mode = "demo" | "ride" | "over";
type Shot = { kind: "chase" } | { kind: "side"; pos: THREE.Vector3 };

const smooth = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

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
  private overAt = 0;
  private overSent = false;
  private countdown = -1;
  private airMusic = false;
  private resizeObserver: ResizeObserver;

  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camYaw = 0;
  private shot: Shot = { kind: "chase" };
  private shotT = 0;
  private fov = 70;
  private shake = 0;

  private keys = new Set<string>();
  private touch = { steer: 0, lean: 0, jump: false, grab: false, boost: false };

  constructor(private host: HTMLElement, canvas: HTMLCanvasElement, private cb: Callbacks) {
    this.renderer = new Renderer(canvas, sharedCourse());
    this.game = this.demoGame();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.resize();
    this.snapCamera();
    this.sound.setMood("menu");
    this.raf = requestAnimationFrame(this.frame);
  }

  // The title screen: the bot rides, the camera cuts between angles.
  demo() {
    this.mode = "demo";
    this.paused = false;
    this.game = this.demoGame();
    this.bot = newBot();
    this.snapCamera();
    this.sound.setMood("menu");
  }

  // The bot pushes straight off. In dev, ?at=<metres> starts it further down.
  private demoGame() {
    const g = newGame();
    g.status = "ride";
    g.time = 9999;
    g.ghostly = true;
    g.v.z = -12;
    const at = import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get("at")) : 0;
    if (at > 0) {
      g.p.x = centerAt(g.course, at);
      g.p.z = -at;
      g.p.y = heightAt(g.course, g.p.x, g.p.z);
      g.v.z = -25;
    }
    return g;
  }

  ride() {
    this.sound.unlock();
    this.mode = "ride";
    this.paused = false;
    this.overSent = false;
    this.overAt = 0;
    this.countdown = -1;
    this.game = newGame();
    this.shot = { kind: "chase" };
    this.snapCamera();
    this.sound.setMood("ride");
  }

  unlockAudio() {
    this.sound.unlock();
    this.sound.setMood(this.mode === "ride" ? "ride" : this.mode === "over" ? "end" : "menu");
  }

  setMuted(m: boolean) {
    this.sound.setMuted(m);
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.last = performance.now();
    if (p) this.touch = { steer: 0, lean: 0, jump: false, grab: false, boost: false };
  }

  setStick(steer: number, lean: number) {
    this.touch.steer = steer;
    this.touch.lean = lean;
  }

  setButton(name: "jump" | "grab" | "boost", down: boolean) {
    this.touch[name] = down;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.sound.dispose();
    this.renderer.dispose();
  }

  // ---------- input ----------

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(k)) e.preventDefault();
    if ((k === "escape" || k === "p") && this.mode === "ride") this.cb.onPause();
    this.keys.add(k);
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());

  private onBlur = () => {
    this.keys.clear();
    this.touch = { steer: 0, lean: 0, jump: false, grab: false, boost: false };
  };

  private readInput(): Input {
    const k = this.keys;
    const has = (...names: string[]) => names.some((n) => k.has(n));
    const steer = (has("arrowright", "d") ? 1 : 0) - (has("arrowleft", "a") ? 1 : 0);
    const lean = (has("arrowup", "w") ? 1 : 0) - (has("arrowdown", "s") ? 1 : 0);
    const t = this.touch;
    return {
      steer: Math.max(-1, Math.min(1, steer + t.steer)),
      lean: Math.max(-1, Math.min(1, lean + t.lean)),
      jump: has(" ", "j") || t.jump,
      grab: has("k", "z", "c") || t.grab,
      boost: has("shift", "l", "x") || t.boost,
    };
  }

  // ---------- loop ----------

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.resize(w, h);
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.paused) {
      this.time += dt;
      const g = this.game;
      const input = this.mode === "demo" ? botInput(g, this.bot, dt) : this.mode === "ride" ? this.readInput() : NO_INPUT;
      step(g, dt, input);
      this.handleEvents();
      if (this.mode === "demo" && (distance(g) > LENGTH - 60 || g.status !== "ride")) this.demo();
      if (this.mode === "ride" && g.status === "ready") this.countdownBeeps();
      if (this.mode === "over" && !this.overSent && this.time >= this.overAt) this.sendOver();
      const air = !g.onGround && g.airT > 0.3;
      if (air !== this.airMusic) {
        this.airMusic = air;
        this.sound.setAir(air);
      }
      this.sound.setRide(g.crashT > 0 || g.status === "ready" ? 0 : speedOf(g), g.carve, !g.onGround);
      this.renderer.rider.pose({
        crouch: g.crashT > 0 ? 0.6 : !g.onGround ? (g.grabT > 0 && input.grab ? 0.9 : 0.4) : Math.max(g.charge, input.lean > 0.3 ? 0.55 : 0.15),
        lean: g.onGround ? input.steer : 0,
        grab: !g.onGround && input.grab ? 1 : 0,
        tuck: g.onGround && input.lean > 0.3 ? 1 : 0,
        flail: g.crashT > 0 ? 1 : 0,
        time: this.time,
      });
      this.poseRider(g, dt);
      this.updateCamera(dt);
      this.renderer.sync(g, dt, this.time);
      if (this.mode !== "demo" && now - this.hudAt > 66) {
        this.hudAt = now;
        this.cb.onHud(this.hud());
      }
    }
    this.renderer.render();
  };

  private hud(): Hud {
    const g = this.game;
    return {
      time: g.time,
      score: g.score,
      speed: Math.round(speedOf(g) * 3.6),
      boost: g.boost,
      boosting: g.boosting,
      candy: g.candy,
      progress: Math.max(0, Math.min(1, distance(g) / LENGTH)),
      checkpoints: g.nextGate,
      status: g.status,
    };
  }

  private countdownBeeps() {
    const n = 3 - Math.floor(this.game.statusT);
    if (n !== this.countdown && n >= 1 && n <= 3) {
      this.countdown = n;
      this.sound.play.beep();
      this.popup(String(n), "#ffcf4a", undefined, true);
    }
  }

  private popup(text: string, color: string, sub?: string, big = false) {
    this.cb.onPopup({ id: ++this.popupId, text, sub, color, big });
  }

  private handleEvents() {
    const g = this.game;
    const live = this.mode === "ride";
    const play = this.sound.play;
    for (const e of g.events) {
      if (e.type === "land") {
        this.renderer.burst(g, e.clean ? 10 + Math.round(e.hard * 20) : 30, 3 + e.hard * 4);
        this.shake = Math.max(this.shake, e.hard * 0.5);
        if (live) play.land(e.hard);
      }
      if (e.type === "crash") this.renderer.burst(g, 25, 4);
      if (!live) continue;
      switch (e.type) {
        case "go":
          play.go();
          this.popup("GO!", "#7dffb0", undefined, true);
          break;
        case "jump":
          play.jump();
          break;
        case "trick":
          play.trick(e.points);
          this.popup(e.name, e.points >= 2000 ? "#ff8a1f" : e.points >= 1000 ? "#ffcf4a" : "#ffffff", `+${e.points.toLocaleString()}`);
          break;
        case "crash":
          play.crash();
          if (e.reason === "Spooked!") play.ghost();
          this.shake = 1;
          this.popup(e.reason, "#ff5a6a");
          break;
        case "candy":
          play.candy();
          break;
        case "gate":
          play.gate();
          this.popup("CHECKPOINT", "#ffcf4a", `+${e.bonus} seconds`);
          break;
        case "finish":
          play.finish();
          this.popup("FINISH!", "#7dffb0", `+${e.bonus.toLocaleString()} time bonus`, true);
          this.end();
          break;
        case "timeup":
          play.timeup();
          this.popup("TIME UP", "#ff5a6a", undefined, true);
          this.end();
          break;
      }
    }
    g.events.length = 0;
  }

  private end() {
    this.mode = "over";
    this.overAt = this.time + 2.6;
    this.sound.setMood("end");
  }

  private sendOver() {
    this.overSent = true;
    const g = this.game;
    this.cb.onHud(this.hud());
    this.cb.onOver({
      finished: g.status === "finish",
      score: g.score,
      elapsed: g.elapsed,
      tricks: g.tricks,
      candy: g.candy,
      candyTotal: g.course.candy.length,
      bestTrick: g.bestTrick,
      finishBonus: g.finishBonus,
    });
  }

  // ---------- rider and camera ----------

  private visSpin = 0;
  private visFlip = 0;
  private tumble = 0;

  private poseRider(g: Game, dt: number) {
    const pivot = this.renderer.rider.pivot;
    if (g.crashT > 0) {
      this.tumble += dt * 9 * Math.min(1, g.crashT);
      pivot.rotation.set(Math.sin(this.tumble) * 1.2, this.tumble, Math.PI / 2 * Math.min(1, (1.5 - g.crashT) * 4));
      this.visSpin = this.visFlip = 0;
      return;
    }
    this.tumble = 0;
    if (!g.onGround) {
      this.visSpin = g.spin;
      this.visFlip = g.flip;
    } else {
      // Settle out of the landing (a quick revert after a 180).
      const k = smooth(10, dt);
      this.visSpin = Math.atan2(Math.sin(this.visSpin), Math.cos(this.visSpin)) * (1 - k);
      this.visFlip = Math.atan2(Math.sin(this.visFlip), Math.cos(this.visFlip)) * (1 - k);
    }
    pivot.rotation.set(0, 0, 0);
    pivot.rotateY(-this.visSpin);
    pivot.rotateX(-this.visFlip);
  }

  private snapCamera() {
    const g = this.game;
    this.camYaw = g.heading;
    this.chaseTarget(this.camPos, this.camLook);
    this.renderer.camera.position.copy(this.camPos);
    this.renderer.camera.lookAt(this.camLook);
  }

  private chaseTarget(pos: THREE.Vector3, look: THREE.Vector3) {
    const g = this.game;
    const speed = speedOf(g);
    const dist = 7 + Math.min(speed, 45) * 0.06;
    const fx = Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    pos.set(g.p.x - fx * dist, g.p.y + 3.4, g.p.z - fz * dist);
    look.set(g.p.x + fx * 7, g.p.y + 0.6, g.p.z + fz * 7);
  }

  private updateCamera(dt: number) {
    const g = this.game;
    const cam = this.renderer.camera;
    const hv = Math.hypot(g.v.x, g.v.z);
    if (g.crashT <= 0) {
      const want = hv > 3 ? Math.atan2(g.v.x, -g.v.z) : g.heading;
      const diff = Math.atan2(Math.sin(want - this.camYaw), Math.cos(want - this.camYaw));
      this.camYaw += diff * smooth(g.onGround ? 4 : 1.5, dt);
    }

    if (this.mode === "demo") {
      this.shotT += dt;
      if (this.shot.kind === "chase" && this.shotT > 7) {
        const d = distance(g) + 32;
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = centerAt(g.course, d) + side * (halfAt(g.course, d) - 3);
        this.shot = { kind: "side", pos: new THREE.Vector3(x, heightAt(g.course, x, -d) + 2.2, -d) };
        this.shotT = 0;
      } else if (this.shot.kind === "side" && (distance(g) > -this.shot.pos.z + 12 || this.shotT > 6)) {
        this.shot = { kind: "chase" };
        this.shotT = 0;
        this.chaseTarget(this.camPos, this.camLook);
      }
    } else if (this.shot.kind !== "chase") this.shot = { kind: "chase" };

    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    if (this.shot.kind === "side") {
      pos.copy(this.shot.pos);
      look.set(g.p.x, g.p.y + 1, g.p.z);
      this.camPos.copy(pos);
      this.camLook.lerp(look, smooth(10, dt));
    } else {
      this.chaseTarget(pos, look);
      // Height follows loosely in the air, so jumps feel like jumps.
      const k = smooth(8, dt);
      this.camPos.x += (pos.x - this.camPos.x) * k;
      this.camPos.z += (pos.z - this.camPos.z) * k;
      this.camPos.y += (pos.y - this.camPos.y) * smooth(g.onGround ? 6 : 2.5, dt);
      this.camLook.lerp(look, smooth(10, dt));
      const floor = heightAt(g.course, this.camPos.x, this.camPos.z) + 1.2;
      if (this.camPos.y < floor) this.camPos.y = floor;
    }
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.5;
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    cam.lookAt(this.camLook);
    const speed = speedOf(g);
    const wantFov = 68 + Math.min(speed, 45) * 0.3 + (g.boosting ? 8 : 0) + (cam.aspect < 1 ? 10 : 0);
    this.fov += (wantFov - this.fov) * smooth(3, dt);
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
