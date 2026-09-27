// Runs a Mystery Crypt stage on a canvas: takes input (keys, the on-screen
// D-pad and move buttons, or tapping a tile to walk there), plays a turn, and
// waits for the animation to catch up before the next one. React only sees
// the HUD.
import { defaultMoves, HEROES, MOVES, STAGES, type HeroId, type ItemId, type MoveId, type UnitKind } from "./data.ts";
import { loadAssets, Renderer } from "./render.ts";
import type { RosterEntry, StageReport } from "./save.ts";
import {
  act,
  autoAction,
  isBossFloor,
  isFloor,
  leader,
  MAP_W,
  newGame,
  newMap,
  onStairs,
  party,
  pathStep,
  placeUnit,
  report,
  stepToward,
  unitAt,
  xpToNext,
  type Action,
  type GameOptions,
  type GameState,
  type MapDef,
  type Unit,
} from "./sim.ts";
import { PARTNER_NAME, SPEAKERS, type Step } from "./story.ts";

export interface Member {
  id: number;
  kind: UnitKind;
  hp: number;
  maxHp: number;
  level: number;
  leader: boolean;
}

export interface Hud {
  mode: GameState["mode"];
  stageName: string;
  floor: number;
  floors: number;
  boss: { name: string; hp: number; maxHp: number } | null;
  candy: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpNext: number;
  party: Member[];
  moves: { id: MoveId; pp: number; max: number }[];
  bag: ItemId[];
  onStairs: boolean;
}

export interface StageResult {
  report: StageReport;
  kills: number;
}

export interface Dialogue {
  speaker: string;
  name: string;
  color: string;
  text: string;
  kind?: UnitKind;
  sprite?: string;
}

// Story scenes to play during a stage, each the first time its moment comes.
export interface StoryHooks {
  start?: Step[];
  enemy?: Step[];
  stairs?: Step[];
  floor2?: Step[];
  boss?: Step[];
}

export interface GameCallbacks {
  onHud: (hud: Hud) => void;
  onDialogue: (dialogue: Dialogue | null) => void;
  onCard: (card: { title: string; sub?: string } | null) => void;
  onFade: (fade: "out" | "in") => void;
  onScene: (playing: boolean) => void;
  onTalk: (who: string) => void;
  onMessage: (text: string, color?: string) => void;
  onFloor: (floor: number, boss: boolean) => void;
  onOver: (result: StageResult) => void;
  // Space or Enter during a scene (the dialogue box decides what that does).
  onAdvanceKey?: () => void;
}

type Dir = { dx: number; dy: number };

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  w: { dx: 0, dy: -1 },
  s: { dx: 0, dy: 1 },
  a: { dx: -1, dy: 0 },
  d: { dx: 1, dy: 0 },
};

// Seconds between the attract-mode bot's moves.
const DEMO_STEP = 0.16;

function member(u: Unit, s: GameState): Member {
  return { id: u.id, kind: u.kind, hp: u.hp, maxHp: u.maxHp, level: u.level, leader: u.id === s.leaderId };
}

// The menu's background: a random hero and two monsters on a random early stage.
function demoOptions(): GameOptions {
  const heroes = Object.keys(HEROES) as HeroId[];
  const stage = Math.floor(Math.random() * 4);
  const level = STAGES[stage].level + 2;
  const hero = heroes[Math.floor(Math.random() * heroes.length)];
  const kinds: UnitKind[] = [hero, ...STAGES[stage].monsters.slice(0, 2)];
  return { stage, roster: kinds.map((kind) => ({ uid: null, kind, level, xp: 0, moves: defaultMoves(kind, level) })), bag: ["heart"] };
}

export class GameController {
  private state: GameState | null = null;
  private renderer: Renderer | null = null;
  private raf = 0;
  private last = 0;
  private paused = false;
  private disposed = false;
  private width = 0;
  private height = 0;
  private resizeObserver: ResizeObserver;
  private demo = false;
  // Dev: the bot plays a real stage, for testing.
  private autoplay = false;
  private demoClock = 0;
  private overClock = -1;
  // Directions held down (keys or D-pad), newest last.
  private held: Dir[] = [];
  private queued: Action | null = null;
  private walkTo: { x: number; y: number } | null = null;
  // The story scene playing, if any.
  private script: { steps: Step[]; i: number; t: number; wait: "tap" | "time" | "walk" | null; walkers: Record<string, { x: number; y: number }>; done?: () => void } | null = null;
  private hooks: StoryHooks = {};
  private hooksDone = new Set<keyof StoryHooks>();

  constructor(private host: HTMLElement, private canvas: HTMLCanvasElement, private cb: GameCallbacks) {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  // Keeps the leader centred in the space between the HUD and the controls.
  setInsets(top: number, bottom: number) {
    if (!this.renderer) return;
    this.renderer.insetTop = top;
    this.renderer.insetBottom = bottom;
  }

  // A stage to play, or null for the menu's attract mode.
  async start(options: GameOptions | null, autoplay = false, hooks: StoryHooks = {}) {
    await this.begin(() => newGame(options ?? demoOptions()), !options, autoplay, hooks);
  }

  // A hand-built map: the camp, or a story scene's stage.
  async startMap(map: MapDef, roster: RosterEntry[]) {
    await this.begin(() => newMap(map, roster), false, false, {});
  }

  private async begin(make: () => GameState, demo: boolean, autoplay: boolean, hooks: StoryHooks) {
    const assets = await loadAssets();
    if (this.disposed) return;
    this.renderer ??= new Renderer(this.canvas, assets);
    this.resize();
    this.demo = demo;
    this.autoplay = autoplay;
    this.hooks = hooks;
    this.hooksDone = new Set();
    this.script = null;
    this.cb.onDialogue(null);
    this.state = make();
    this.renderer.handleEvents(this.state, [{ type: "floor", floor: this.state.floor }]);
    this.flushEvents();
    this.paused = false;
    this.overClock = -1;
    this.held = [];
    this.queued = null;
    this.walkTo = null;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
    this.pushHud();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.held = [];
    this.last = performance.now();
  }

  // Plays a story scene; `done` runs when it ends.
  runScript(steps: Step[], done?: () => void) {
    this.script = { steps, i: -1, t: 0, wait: null, walkers: {}, done };
    this.held = [];
    this.queued = null;
    this.walkTo = null;
    this.cb.onScene(true);
    this.nextStep();
  }

  // The player tapped through a line of dialogue.
  advance() {
    if (this.script?.wait === "tap") this.nextStep();
  }

  get inScene() {
    return !!this.script;
  }

  private actor(id: string): Unit | null {
    const s = this.state!;
    if (id === "wick") return s.units.find((u) => u.name === PARTNER_NAME) ?? null;
    if (id === "boss") return s.units.find((u) => u.boss) ?? null;
    return s.units.find((u) => u.team === "party" && u.kind === id && !u.name) ?? null;
  }

  private actorPos(id: string) {
    const u = this.actor(id);
    if (u) return { x: u.x, y: u.y };
    const p = this.state!.props.find((o) => o.id === id);
    return p ? { x: p.x, y: p.y } : null;
  }

  // A free floor tile a few steps from Alex, for someone to walk in from.
  private spotNear(from: { x: number; y: number }, min: number, max: number) {
    const s = this.state!;
    for (let r = min; r <= max; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) !== r) continue;
          const x = from.x + dx;
          const y = from.y + dy;
          if (isFloor(s, x, y) && !unitAt(s, x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  private nextStep() {
    const sc = this.script!;
    sc.i++;
    sc.t = 0;
    sc.wait = null;
    const step = sc.steps[sc.i];
    if (!step) {
      this.script = null;
      this.cb.onDialogue(null);
      this.cb.onCard(null);
      this.cb.onScene(false);
      this.pushHud();
      sc.done?.();
      return;
    }
    const s = this.state!;
    const r = this.renderer!;
    this.cb.onDialogue(null);
    if ("say" in step) {
      const sp = SPEAKERS[step.say] ?? SPEAKERS.narrator;
      // A stage's boss speaks as itself.
      const boss = step.say === "boss" ? s.units.find((u) => u.boss) : null;
      this.cb.onDialogue({
        speaker: step.say,
        name: boss?.boss ?? sp.name,
        color: sp.color,
        text: step.text,
        kind: boss ? boss.kind : sp.kind,
        sprite: sp.sprite,
      });
      sc.wait = "tap";
    } else if ("walk" in step) {
      sc.walkers = {};
      for (const [id, to] of Object.entries(step.walk)) {
        const target = to === "beside-alex" ? this.spotNear(this.actorPos("alex") ?? { x: 0, y: 0 }, 1, 2) : { x: to[0], y: to[1] };
        if (target) sc.walkers[id] = target;
      }
      sc.wait = "walk";
    } else if ("place" in step) {
      const u = this.actor(step.place);
      if (u) placeUnit(u, step.at[0], step.at[1]);
      this.nextStep();
    } else if ("face" in step) {
      const u = this.actor(step.face);
      if (u) {
        u.dx = step.dir === "left" ? -1 : step.dir === "right" ? 1 : 0;
        u.dy = step.dir === "up" ? -1 : step.dir === "down" ? 1 : 0;
      }
      this.nextStep();
    } else if ("emote" in step) {
      const at = this.actorPos(step.emote);
      if (at) r.emote(at.x, at.y, step.icon);
      sc.wait = "time";
      sc.t = -0.55;
    } else if ("wait" in step) {
      sc.wait = "time";
      sc.t = -step.wait;
    } else if ("shake" in step) {
      r.shakeFor(step.shake);
      sc.wait = "time";
      sc.t = -step.shake * 0.8;
    } else if ("fade" in step) {
      this.cb.onFade(step.fade);
      sc.wait = "time";
      sc.t = -0.7;
    } else if ("prop" in step) {
      s.props.push({ ...step.prop });
      sc.wait = "time";
      sc.t = -0.2;
    } else if ("card" in step) {
      this.cb.onCard({ title: step.card, sub: step.sub });
      sc.wait = "time";
      sc.t = -2.4;
    }
  }

  private updateScript(dt: number) {
    const sc = this.script!;
    sc.t += dt;
    if (sc.wait === "time" && sc.t >= 0) {
      this.cb.onCard(null);
      this.nextStep();
    } else if (sc.wait === "walk" && sc.t >= 0.15) {
      sc.t = 0;
      const s = this.state!;
      let moving = false;
      for (const [id, to] of Object.entries(sc.walkers)) {
        const u = this.actor(id);
        if (!u) continue;
        const step = stepToward(s, u, to.x, to.y);
        if (!step) continue;
        placeUnit(u, step.x, step.y);
        moving = true;
      }
      if (!moving) this.nextStep();
    }
  }

  // Runs a stage's story hook the first time its moment comes.
  private checkHooks() {
    const s = this.state!;
    if (this.demo || this.script || s.over) return;
    const run = (key: keyof StoryHooks, when: boolean) => {
      const steps = this.hooks[key];
      if (!steps || this.hooksDone.has(key) || !when) return false;
      this.hooksDone.add(key);
      this.runScript(steps);
      return true;
    };
    const seen = (u: Unit) => s.visible[u.y * MAP_W + u.x] === 1;
    if (run("start", true)) return;
    if (run("boss", s.units.some((u) => u.boss && seen(u)))) return;
    if (run("enemy", s.units.some((u) => u.team === "enemy" && seen(u)))) return;
    if (run("floor2", s.floor >= 2)) return;
    run("stairs", s.stairs.x >= 0 && s.visible[s.stairs.y * MAP_W + s.stairs.x] === 1);
  }

  // Moves the partner a few steps from Alex, so it can walk up to meet them.
  setPartnerApart() {
    const s = this.state!;
    const wick = this.actor("wick");
    const alex = leader(s);
    const spot = wick && this.spotNear(alex, 3, 5);
    if (wick && spot) placeUnit(wick, spot.x, spot.y);
  }

  // From the on-screen buttons.
  press(action: Action) {
    if (this.demo || this.paused) return;
    this.walkTo = null;
    this.queued = action;
  }

  // D-pad: a direction held down (null when let go).
  hold(dir: Dir | null) {
    this.walkTo = null;
    this.held = dir ? [dir] : [];
    if (dir && !this.demo && !this.paused) this.queued = { type: "move", ...dir };
  }

  // Gives up the stage in progress (it counts as fainting) and returns how it went.
  retreat(): StageResult | null {
    const s = this.state;
    if (!s || this.demo || s.over) return null;
    s.over = true;
    this.overClock = -1;
    return { report: report(s), kills: s.kills };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
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
    const r = this.renderer!;
    const s = this.state!;

    if (s.over) {
      if (this.overClock >= 0) {
        this.overClock += dt;
        // Let the last blow land before the results.
        if (this.overClock > 1.2) {
          this.overClock = -1;
          if (this.demo) void this.start(null);
          else this.cb.onOver({ report: report(s), kills: s.kills });
        }
      }
    } else if (this.script) {
      if (!this.paused) this.updateScript(dt);
    } else if (!this.paused && this.readyForTurn()) {
      this.checkHooks();
      if (!this.script) {
        const action = this.nextAction(dt);
        if (action) this.play(action);
      }
    }
    r.draw(s, dt);
  };

  // Nothing is mid-swing and the leader has nearly reached its tile. (Taking
  // the next step during the last few pixels of this one keeps walking smooth.)
  private readyForTurn() {
    const r = this.renderer!;
    return !r.busy() && r.leaderLag(this.state!) < 0.25;
  }

  private nextAction(dt: number): Action | null {
    const s = this.state!;
    if (this.demo || this.autoplay) {
      this.demoClock += dt;
      if (this.demoClock < DEMO_STEP) return null;
      this.demoClock = 0;
      return autoAction(s);
    }
    if (this.queued) {
      const a = this.queued;
      this.queued = null;
      return a;
    }
    const dir = this.held[this.held.length - 1];
    if (dir) return { type: "move", ...dir };
    if (this.walkTo) return this.walkStep();
    return null;
  }

  // One step of tap-to-walk.
  private walkStep(): Action | null {
    const s = this.state!;
    const l = leader(s);
    const to = this.walkTo!;
    if (l.x === to.x && l.y === to.y) {
      this.walkTo = null;
      return null;
    }
    const step = pathStep(s, to);
    if (!step) {
      this.walkTo = null;
      return null;
    }
    return { type: "move", dx: step.x - l.x, dy: step.y - l.y };
  }

  private play(action: Action) {
    const s = this.state!;
    const floorWas = s.floor;
    const seenBefore = this.visibleEnemies();
    const ok = act(s, action);
    // A refused action can still explain itself ("nothing to hit that way").
    this.flushEvents();
    if (!ok) {
      this.walkTo = null;
      this.pushHud();
      return;
    }
    if (s.floor !== floorWas) {
      this.walkTo = null;
      this.held = [];
      if (!this.demo) this.cb.onFloor(s.floor, isBossFloor(s));
    }
    // A new monster in sight interrupts tap-to-walk.
    if (this.walkTo && this.visibleEnemies() > seenBefore) this.walkTo = null;
    if (s.over) this.overClock = 0;
    this.pushHud();
  }

  private visibleEnemies() {
    const s = this.state!;
    return s.units.filter((u) => u.team === "enemy" && s.visible[u.y * MAP_W + u.x]).length;
  }

  private flushEvents() {
    const s = this.state!;
    this.renderer?.handleEvents(s, s.events);
    if (!this.demo) {
      for (const e of s.events) {
        if (e.type === "msg") this.cb.onMessage(e.text, e.color);
        if (e.type === "talk") this.cb.onTalk(e.talk);
      }
    }
    s.events.length = 0;
  }

  private pushHud() {
    if (this.demo) return;
    const s = this.state!;
    const l = leader(s);
    const boss = s.units.find((u) => u.boss && s.visible[u.y * MAP_W + u.x]);
    this.cb.onHud({
      mode: s.mode,
      stageName: s.def.name,
      floor: s.floor,
      floors: s.def.floors,
      boss: boss ? { name: boss.boss!, hp: Math.max(0, boss.hp), maxHp: boss.maxHp } : null,
      candy: s.candy,
      hp: Math.max(0, l?.hp ?? 0),
      maxHp: l?.maxHp ?? 1,
      level: l?.level ?? 1,
      xp: l?.xp ?? 0,
      xpNext: xpToNext(l?.level ?? 1),
      party: party(s).map((u) => member(u, s)),
      moves: (l?.moves ?? []).map((m) => ({ id: m.id, pp: m.pp, max: MOVES[m.id].pp })),
      bag: [...s.bag],
      onStairs: onStairs(s),
    });
  }

  private onPointerDown = (e: PointerEvent) => {
    const s = this.state;
    if (!s || this.demo || this.paused || s.over || this.script) return;
    const rect = this.canvas.getBoundingClientRect();
    const tile = this.renderer!.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
    const l = leader(s);
    const dist = Math.abs(tile.x - l.x) + Math.abs(tile.y - l.y);
    if (dist === 0) return;
    if (dist === 1) {
      // Next to you: step (or attack) that way.
      this.walkTo = null;
      this.queued = { type: "move", dx: tile.x - l.x, dy: tile.y - l.y };
      return;
    }
    this.walkTo = s.explored[tile.y * MAP_W + tile.x] ? tile : null;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.demo || this.paused || !this.state) return;
    if (this.script) {
      if (e.key === " " || e.key === "Enter" || e.key === "z") {
        e.preventDefault();
        this.cb.onAdvanceKey?.();
      }
      return;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const dir = KEY_DIRS[key];
    if (dir) {
      e.preventDefault();
      if (e.repeat) return;
      this.walkTo = null;
      this.held = [...this.held.filter((d) => d.dx !== dir.dx || d.dy !== dir.dy), dir];
      this.queued = { type: "move", ...dir };
      return;
    }
    if (key >= "1" && key <= "4") {
      if (!e.repeat) this.press({ type: "skill", slot: Number(key) - 1 });
    } else if (key === " " || key === "z" || key === "j") {
      e.preventDefault();
      if (!e.repeat) this.press({ type: "attack" });
    } else if (key === "Enter" || key === ">") {
      e.preventDefault();
      if (onStairs(this.state)) this.press({ type: "descend" });
    } else if (key === "." || key === "q") {
      this.press({ type: "wait" });
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const dir = KEY_DIRS[key];
    if (dir) this.held = this.held.filter((d) => d.dx !== dir.dx || d.dy !== dir.dy);
  };

  private onBlur = () => {
    this.held = [];
  };
}
