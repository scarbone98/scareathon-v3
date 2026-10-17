// Runs a game of Hippo Rapids: the local sim (solo, and the demo behind the menus) or the
// server's snapshots (online), your input, sound and the renderer.
import {
  GAS_RESTART,
  HIPPO_NAMES,
  RIM_SPEED,
  STEP,
  createSim,
  getCourse,
  wrapAngle,
  type Course,
  type HippoState,
  type Level,
  type Sim,
  type SimEvent,
  type Snapshot,
} from "../../../../server/shared/hippoRapids/index.js";
import { Renderer, type View } from "./render";
import { sfx } from "./sfx";

export interface Hud {
  phase: Snapshot["ph"];
  countdown: number;
  run: number;
  progress: number; // 0..1 down the river
  hull: number;
  sinks: number;
  hits: number;
  cp: number;
  section: string;
  sunk: boolean;
  // Your hippo.
  seat: number;
  gas: number;
  spent: boolean;
  farting: boolean;
  seats: number;
  names: string[];
  humans: boolean[];
  gases: number[];
  levelName: string;
  checkpoints: number[];
  ringsGot: number;
  ringsTotal: number;
}

export type Mode = "demo" | "solo" | "online";

interface Opts {
  onHud: (hud: Hud) => void;
  onFinish: (result: { run: number; sinks: number; hits: number; seats: number; rings: number; ringsTotal: number }) => void;
  // For the cabinet video: the demo with a stronger crew.
  attract?: boolean;
}

const KEY_AIM: Record<string, [number, number]> = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
};
const FART_KEYS = new Set(["Space", "ShiftLeft", "ShiftRight", "KeyZ", "KeyX"]);
const INTERP_MS = 100;
const HUD_MS = 90;
const HEARTBEAT_MS = 250;

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const lerpAngle = (a: number, b: number, f: number) => a + wrapAngle(b - a) * f;

export class GameController {
  private gl: Renderer;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private mode: Mode = "demo";
  private sim: Sim | null = null;
  private seats = 4;
  private course: Course = getCourse('lagoon');
  private level: string | Level = 'lagoon';
  private me = -1;
  private names: string[] = [];
  private paused = false;
  private disposed = false;
  private demoDoneAt = 0;
  private finished = false;
  private view: View | null = null;
  private hudAt = 0;
  private countBeep = -1;
  private tootAt: number[] = [];
  private lastHits: { x: number; z: number }[] = [];
  private keys = new Set<string>();
  private aim: [number, number] = [0, 0];
  private touchAim: [number, number] | null = null;
  private fartHeld = false;
  private pointerFart = false;
  private touchFart = false;
  // Your own hippo's angle, predicted so walking round the rim feels instant online.
  private predAng = 0;
  private mv = 0;
  // Online.
  private send: ((message: { type: string; [key: string]: unknown }) => void) | null = null;
  private buf: { at: number; s: Snapshot }[] = [];
  private sentAt = 0;
  private sentMv = 0;
  private sentF = false;
  private resizeObs: ResizeObserver;

  constructor(
    private host: HTMLElement,
    canvas: HTMLCanvasElement,
    private opts: Opts,
  ) {
    this.gl = new Renderer(canvas);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(host);
    this.resize();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    const params = new URLSearchParams(window.location.search);
    this.demo(4, opts.attract ? (params.get("level") ?? "whole") : "lagoon");
    this.raf = requestAnimationFrame(this.frame);
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    this.gl.resize(Math.max(1, r.width), Math.max(1, r.height));
  }

  // --- modes --------------------------------------------------------------------------------

  private fresh(seats: number, skill: number, level: string | Level) {
    // The same level again keeps its built scene; a different one gets rebuilt.
    if (level !== this.level || !this.sim) {
      this.course = getCourse(level);
      this.level = level;
      this.gl.setCourse(this.course);
    }
    this.sim = createSim({ seats, skill, seed: Math.floor(Math.random() * 1e6), level: this.course });
    this.seats = seats;
    this.acc = 0;
    this.finished = false;
    this.countBeep = -1;
    this.tootAt = Array(seats).fill(0);
    this.buf = [];
    this.view = null;
  }

  // Bots raft the river behind the menus.
  demo(seats: number, level: string | Level = "lagoon") {
    this.mode = "demo";
    this.send = null;
    this.me = -1;
    this.fresh(seats, this.opts.attract ? 0.95 : 0.8, level);
    this.names = HIPPO_NAMES.slice(0, seats);
    this.demoDoneAt = 0;
    this.sim!.t = 0;
    // The cabinet video joins the bots partway down the river (?attract&at=225).
    const at = this.opts.attract ? Number(new URLSearchParams(window.location.search).get("at")) : 0;
    if (at > 0) this.jumpTo(at);
    sfx.river(false);
  }

  private jumpTo(z: number) {
    const sim = this.sim!;
    sim.phase = "run";
    sim.countdown = 0;
    sim.z = z;
    sim.x = this.course.centerX(z);
    sim.vz = 3;
    sim.cp = this.course.checkpoints.filter((c) => c <= z).length - 1;
  }

  solo(seats: number, name: string, level: string | Level) {
    this.mode = "solo";
    this.send = null;
    this.me = 0;
    this.fresh(seats, 0.5, level);
    const sim = this.sim!;
    sim.hippos[0].bot = false;
    this.predAng = sim.hippos[0].ang;
    this.names = [name || "YOU", ...HIPPO_NAMES.slice(1, seats)];
    this.paused = false;
  }

  // The server runs the raft; this just draws it. names are by seat.
  online(seat: number, seats: number, names: (string | null)[], send: (message: { type: string; [key: string]: unknown }) => void, level: string | Level) {
    this.mode = "online";
    this.send = send;
    if (level !== this.level) {
      this.course = getCourse(level);
      this.level = level;
      this.gl.setCourse(this.course);
    }
    this.me = seat;
    this.seats = seats;
    this.sim = null;
    this.buf = [];
    this.view = null;
    this.finished = false;
    this.countBeep = -1;
    this.tootAt = Array(seats).fill(0);
    this.names = names.map((n, i) => n ?? HIPPO_NAMES[i]);
    this.paused = false;
    this.sentF = false;
    this.sentMv = 0;
    this.sentAt = 0;
  }

  setNames(names: (string | null)[]) {
    this.names = names.map((n, i) => n ?? HIPPO_NAMES[i]);
  }

  pushSnap(s: Snapshot) {
    if (this.mode !== "online") return;
    const last = this.buf[this.buf.length - 1];
    // A new run starts its clock again.
    if (last && s.t < last.s.t - 0.5) this.buf = [];
    this.buf.push({ at: performance.now(), s });
    if (this.buf.length > 40) this.buf.shift();
    // Sounds and bursts go off as the snapshot arrives; the picture lags it by INTERP_MS.
    this.handleEvents(s.ev, s);
  }

  setPaused(p: boolean) {
    if (this.mode === "solo") this.paused = p;
  }

  get isPaused() {
    return this.paused;
  }

  // --- input --------------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    sfx.unlock();
    if (KEY_AIM[e.code] || FART_KEYS.has(e.code)) e.preventDefault();
    this.keys.add(e.code);
    this.readKeys();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    this.readKeys();
  };

  private onBlur = () => {
    this.keys.clear();
    this.pointerFart = false;
    this.readKeys();
  };

  private readKeys() {
    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const a = KEY_AIM[code];
      if (a) {
        x += a[0];
        y += a[1];
      }
    }
    const len = Math.hypot(x, y);
    this.aim = len ? [x / len, y / len] : [0, 0];
    this.fartHeld = [...this.keys].some((k) => FART_KEYS.has(k));
  }

  private onPointerDown = (e: PointerEvent) => {
    sfx.unlock();
    if (e.pointerType === "mouse" && e.button === 0) this.pointerFart = true;
  };

  private onPointerUp = () => {
    this.pointerFart = false;
  };

  // The on-screen stick: x right, y up, each -1..1 (or null when let go).
  setTouchAim(a: [number, number] | null) {
    this.touchAim = a;
  }

  setTouchFart(f: boolean) {
    if (f) sfx.unlock();
    this.touchFart = f;
  }

  // Which way the stick points, in the river's terms, and so which way the raft should go.
  private wantedAng(yaw: number): number | null {
    const [ax, ay] = this.touchAim ?? this.aim;
    if (Math.hypot(ax, ay) < 0.3) return null;
    const h = this.gl.heading;
    // Screen right and up, as directions in the world (the camera turns with the river).
    const wx = ax * Math.cos(h) + ay * Math.sin(h);
    const wz = -ax * Math.sin(h) + ay * Math.cos(h);
    // The tail points away from where the raft is to go.
    return wrapAngle(Math.atan2(-wx, -wz) - yaw);
  }

  private steer(ang: number, yaw: number) {
    const want = this.wantedAng(yaw);
    if (want === null) return 0;
    const err = wrapAngle(want - ang);
    return Math.abs(err) < 0.07 ? 0 : err > 0 ? 1 : -1;
  }

  private farting() {
    return this.fartHeld || this.pointerFart || this.touchFart;
  }

  // --- the frame ----------------------------------------------------------------------------

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    if (document.hidden) return;

    let view: View | null = null;
    if (this.mode === "online") view = this.onlineView(dt);
    else if (this.sim) view = this.localView(dt);
    if (!view) return;
    this.view = view;
    this.gl.update(view, this.paused ? 0 : dt, this.lastHits);
    this.lastHits = [];
    this.sounds(view, dt);
    if (now - this.hudAt > HUD_MS) {
      this.hudAt = now;
      this.opts.onHud(this.hud(view));
    }
  };

  private localView(dt: number): View {
    const sim = this.sim!;
    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 6) {
        this.acc -= STEP;
        steps++;
        if (this.me >= 0) {
          const h = sim.hippos[this.me];
          const mv = this.steer(h.ang, sim.yaw);
          sim.setInput(this.me, mv, this.farting());
        }
        sim.step(STEP);
      }
      if (steps === 6) this.acc = 0;
    }
    const snap = sim.snapshot();
    this.handleEvents(snap.ev, snap);
    if (this.mode === "demo" && snap.ph === "done") {
      this.demoDoneAt ||= performance.now();
      if (performance.now() - this.demoDoneAt > 5000) {
        sim.reset();
        this.demoDoneAt = 0;
      }
    }
    if (this.mode === "solo" && snap.ph === "done" && !this.finished) {
      this.finished = true;
      this.opts.onFinish({ run: snap.run, sinks: snap.sinks, hits: snap.hits, seats: this.seats, rings: snap.rg.length, ringsTotal: this.course.rings.length });
    }
    const { ev, ...rest } = snap;
    void ev;
    return { ...rest, me: this.me, names: this.names, humans: snap.h.map((h) => !h[5]) };
  }

  private onlineView(dt: number): View | null {
    if (!this.buf.length) return null;
    const rt = performance.now() - INTERP_MS;
    let a = this.buf[0];
    let b = this.buf[this.buf.length - 1];
    for (let i = 0; i < this.buf.length - 1; i++) {
      if (this.buf[i].at <= rt && rt <= this.buf[i + 1].at) {
        a = this.buf[i];
        b = this.buf[i + 1];
        break;
      }
    }
    const f = a === b ? 1 : Math.min(1, Math.max(0, (rt - a.at) / (b.at - a.at)));
    const s = b.s;
    const p = a.s;
    // After a respawn the raft jumps; don't slide it across the river.
    const jumped = Math.hypot(s.x - p.x, s.z - p.z) > 6 || s.sunk > 0 !== p.sunk > 0;
    const k = jumped ? 1 : f;
    const h = s.h.map((st, i): HippoState => {
      const pa = p.h[i]?.[0] ?? st[0];
      return [lerpAngle(pa, st[0], k), st[1], st[2], st[3], st[4], st[5]];
    });
    // Your own hippo walks on your say-so, then settles to where the server says it is.
    if (this.me >= 0 && h[this.me]) {
      const mine = h[this.me];
      this.predAng = wrapAngle(this.predAng + this.mv * RIM_SPEED * dt);
      this.predAng = lerpAngle(this.predAng, mine[0], Math.min(1, 6 * dt));
      mine[0] = this.predAng;
      this.mv = this.steer(this.predAng, lerpAngle(p.yaw, s.yaw, k));
      this.sendInput();
    }
    if (s.ph === "done" && !this.finished) {
      this.finished = true;
      this.opts.onFinish({ run: s.run, sinks: s.sinks, hits: s.hits, seats: this.seats, rings: s.rg.length, ringsTotal: this.course.rings.length });
    }
    const { ev, ...rest } = s;
    void ev;
    return {
      ...rest,
      t: lerp(p.t, s.t, k),
      x: lerp(p.x, s.x, k),
      z: lerp(p.z, s.z, k),
      yaw: lerpAngle(p.yaw, s.yaw, k),
      vx: lerp(p.vx, s.vx, k),
      vz: lerp(p.vz, s.vz, k),
      h,
      me: this.me,
      names: this.names,
      humans: s.h.map((x) => !x[5]),
    };
  }

  private sendInput() {
    if (!this.send) return;
    const f = this.farting();
    const now = performance.now();
    if (f !== this.sentF || this.mv !== this.sentMv || now - this.sentAt > HEARTBEAT_MS) {
      this.sentF = f;
      this.sentMv = this.mv;
      this.sentAt = now;
      this.send({ type: "in", mv: this.mv, f });
    }
  }

  // --- sounds and bursts -----------------------------------------------------------------------

  private handleEvents(events: SimEvent[], s: Snapshot) {
    for (const e of events) {
      switch (e.e) {
        case "go":
          sfx.beep(true);
          break;
        case "bump":
          sfx.bump(e.s);
          this.gl.burst(s.x, s.z, "splash");
          break;
        case "hit":
          sfx.hit();
          this.lastHits.push({ x: e.x, z: e.z });
          break;
        case "sink":
          sfx.sink();
          this.gl.burst(s.x, s.z, "sink");
          break;
        case "respawn":
          sfx.respawn();
          break;
        case "cp":
          sfx.checkpoint();
          this.gl.burst(s.x, s.z, "cp");
          break;
        case "ring":
          sfx.ring(s.rg.length);
          break;
        case "boost":
          if (Math.random() < 0.02) sfx.boost();
          break;
        case "finish":
          sfx.finish();
          this.gl.burst(s.x, s.z, "cp");
          break;
      }
    }
  }

  private sounds(view: View, dt: number) {
    const quiet = this.mode === "demo" && !this.opts.attract;
    if (this.paused || quiet) {
      sfx.river(false);
      return;
    }
    const speed = Math.hypot(view.vx, view.vz);
    sfx.river(view.ph !== "done" || speed > 0.5, speed);
    if (view.ph === "countdown") {
      const n = Math.ceil(view.cd);
      if (n !== this.countBeep && n >= 1 && n <= 3) {
        this.countBeep = n;
        sfx.beep(false);
      }
    }
    view.h.forEach((h, i) => {
      if (!h[1]) return;
      this.tootAt[i] = (this.tootAt[i] ?? 0) - dt;
      if (this.tootAt[i] <= 0) {
        this.tootAt[i] = 0.17 + Math.random() * 0.12;
        sfx.fart(i, i === view.me ? 1 : 0.55);
      }
    });
  }

  private hud(view: View): Hud {
    const mine = view.me >= 0 ? view.h[view.me] : undefined;
    return {
      phase: view.ph,
      countdown: view.cd,
      run: view.run,
      progress: Math.max(0, Math.min(1, view.z / this.course.length)),
      hull: view.hull,
      sinks: view.sinks,
      hits: view.hits,
      cp: view.cp,
      section: this.course.sectionAt(view.z),
      sunk: view.sunk > 0,
      seat: view.me,
      gas: mine ? mine[2] : 1,
      spent: mine ? mine[3] === 1 || mine[2] < GAS_RESTART : false,
      farting: mine ? mine[1] === 1 : false,
      seats: view.h.length,
      names: view.names,
      humans: view.humans,
      gases: view.h.map((h) => h[2]),
      levelName: this.course.name,
      checkpoints: this.course.checkpoints.map((z) => z / this.course.length),
      ringsGot: view.rg.length,
      ringsTotal: this.course.rings.length,
    };
  }

  // The renderer's last frame, for screenshots and tests.
  get current() {
    return this.view;
  }

  get renderer() {
    return this.gl;
  }

  get simState() {
    return this.sim;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerup", this.onPointerUp);
    sfx.river(false);
    this.gl.dispose();
  }
}
