// Runs a match in the browser. The engine steps on a fixed 20 Hz clock and
// each frame goes to the renderer with an interpolation factor, so motion
// stays smooth at any frame rate. Where the plays come from is a Driver:
// the local bot, or the server in a friend match.
import {
  DOUBLE_ELIXIR_TICK,
  HALF_LENGTH,
  HALF_WIDTH,
  TICK_RATE,
  botPlay,
  canDeployAt,
  createBot,
  createMatch,
  getCard,
  hashState,
  stepMatch,
  type Bot,
  type MatchEvent,
  type MatchResult,
  type MatchState,
  type Play,
  type Team,
} from "../../../../server/shared/royale/index.js";
import { openPockets, Renderer, type Positions, type ViewOptions } from "./renderer";

export interface Hud {
  tick: number;
  phase: MatchState["phase"];
  me: Team;
  elixir: number;
  hand: string[];
  pending: string[];
  next: string;
  crowns: [number, number];
  doubleElixir: boolean;
  result: MatchResult | null;
  countdown: number;
}

// Supplies the plays for each tick.
interface Driver {
  me: Team;
  // Plays for the state's next tick, or null if that tick isn't known yet.
  next(state: MatchState): Play[] | null;
  submit(play: Play): void;
  // Ticks ready to simulate right now (the network driver buffers some).
  buffered(): number;
  // The server's fingerprint for a tick, when it sent one.
  hashAt?(tick: number): number | undefined;
  desynced?(): void;
}

class BotDriver implements Driver {
  me: Team = 0;
  private pending: Play[] = [];
  private bots: [Team, Bot][];
  // `bothSides` lets bots play each other (the menu backdrop).
  constructor(seed: string, reaction: [number, number], bothSides = false) {
    this.bots = [[1, createBot(seed, { reaction })]];
    if (bothSides) this.bots.push([0, createBot(`${seed}:mirror`, { reaction })]);
  }
  next(state: MatchState) {
    const plays = this.pending;
    this.pending = [];
    for (const [team, bot] of this.bots) {
      const move = botPlay(state, team, bot);
      if (move) plays.push(move);
    }
    return plays;
  }
  submit(play: Play) {
    this.pending.push(play);
  }
  buffered() {
    return 1;
  }
}

export class NetDriver implements Driver {
  private queue: { n: number; plays: Play[]; hash?: number }[] = [];
  private hashes = new Map<number, number>();
  constructor(
    public me: Team,
    private send: (play: Play) => void,
    private requestSync: () => void,
  ) {}
  receive(bundle: { n: number; plays: Play[]; hash?: number }) {
    this.queue.push(bundle);
  }
  next(state: MatchState) {
    while (this.queue.length && this.queue[0].n < state.tick) this.queue.shift();
    const bundle = this.queue[0];
    if (!bundle) return null;
    if (bundle.n > state.tick) {
      // A gap (e.g. after a reconnect): wait for a snapshot.
      this.requestSync();
      return null;
    }
    this.queue.shift();
    if (bundle.hash !== undefined) this.hashes.set(bundle.n + 1, bundle.hash);
    return bundle.plays;
  }
  submit(play: Play) {
    this.send(play);
  }
  buffered() {
    return this.queue.length;
  }
  hashAt(tick: number) {
    const hash = this.hashes.get(tick);
    this.hashes.delete(tick);
    return hash;
  }
  desynced() {
    this.requestSync();
  }
}

const STEP = 1 / TICK_RATE;
const MAX_CATCH_UP = 0.25;
// Network play keeps a couple of ticks in hand to ride out jitter, and
// speeds up to catch up when too many pile up.
const NET_BUFFER = 2;
// Further behind than this (a backgrounded or occluded tab stops animation
// frames while the server keeps going), jump straight to the present
// instead of fast-forwarding on screen: a tick costs microseconds.
const SKIP_AHEAD = TICK_RATE / 2;

export class MatchController {
  private renderer: Renderer;
  private state: MatchState | null = null;
  private driver: Driver | null = null;
  private events: MatchEvent[] = [];
  private prev: Positions = new Map();
  private acc = 0;
  private last = 0;
  private raf = 0;
  private disposed = false;
  private hudT = 0;
  private startAt = 0;
  private waiting = true;
  private unconfirmed: string[] = [];
  private preview: { card: string; x: number; y: number } | null = null;
  private demo: [string[], string[]] | null = null;
  private demoRestart = 0;

  constructor(
    host: HTMLElement,
    private onHud: (hud: Hud) => void,
    private onToast: (message: string) => void,
  ) {
    this.renderer = new Renderer(host);
  }

  private async begin(state: MatchState, driver: Driver, startsInMs: number) {
    this.renderer.reset();
    this.renderer.setPerspective(driver.me);
    this.state = state;
    this.driver = driver;
    this.events = [];
    this.prev = new Map();
    this.acc = 0;
    this.preview = null;
    this.unconfirmed = [];
    this.waiting = true;
    this.startAt = performance.now() + startsInMs;
    await this.renderer.load([...state.players[0].deck, ...state.players[1].deck]);
    if (this.disposed) return;
    this.emitHud();
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  startBot(setup: { playerDeck: string[]; botDeck: string[]; reaction: [number, number]; seed: string }) {
    const state = createMatch({ seed: setup.seed, decks: [setup.playerDeck, setup.botDeck] });
    return this.begin(state, new BotDriver(setup.seed, setup.reaction), 0);
  }

  // Bots on both sides, restarting after each match: the menu backdrop.
  startDemo(decks: [string[], string[]]) {
    const seed = `demo-${Date.now()}-${Math.random()}`;
    this.demo = decks;
    this.renderer.showBars = false;
    return this.begin(createMatch({ seed, decks }), new BotDriver(seed, [10, 22], true), 0);
  }

  startNet(setup: { seed: string; decks: [string[], string[]]; startsInMs: number }, driver: NetDriver) {
    return this.begin(createMatch({ seed: setup.seed, decks: setup.decks }), driver, setup.startsInMs);
  }

  // Replaces the whole match with the server's copy (reconnects, desyncs).
  sync(state: MatchState) {
    if (!this.state) return;
    this.renderer.reset();
    this.state = state;
    this.prev = new Map();
    this.events = [];
    this.unconfirmed = [];
    this.acc = 0;
    this.startAt = 0;
  }

  dispose() {
    this.disposed = true;
    window.clearTimeout(this.demoRestart);
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }

  setView(view: ViewOptions) {
    this.renderer.setView(view);
  }

  // ---------- player input ----------

  private get me(): Team {
    return this.driver?.me ?? 0;
  }

  private availableElixir() {
    if (!this.state) return 0;
    return this.state.players[this.me].elixir - this.unconfirmed.reduce((sum, id) => sum + getCard(id).cost, 0);
  }

  private groundAt(clientX: number, clientY: number) {
    const at = this.renderer.pick(clientX, clientY);
    if (!at || Math.abs(at.x) > HALF_WIDTH || Math.abs(at.z) > HALF_LENGTH) return null;
    return at;
  }

  private canPlace(cardId: string, at: { x: number; z: number }) {
    return getCard(cardId).type === "spell" || canDeployAt(this.state!, this.me, at.x, at.z);
  }

  setPreview(cardId: string | null, clientX = 0, clientY = 0) {
    this.preview = cardId ? { card: cardId, x: clientX, y: clientY } : null;
    this.updatePreview();
  }

  private updatePreview() {
    if (!this.state) return;
    const pockets = openPockets(this.state, this.me);
    if (!this.preview) {
      this.renderer.setPreview(null, null, false, pockets);
      return;
    }
    const card = getCard(this.preview.card);
    const at = this.groundAt(this.preview.x, this.preview.y);
    const valid = !!at && this.canPlace(card.id, at) && this.availableElixir() >= card.cost;
    this.renderer.setPreview(card, at, valid, pockets);
  }

  // Tries to play a card at a screen point. Returns false (and toasts why)
  // if it can't go there; the engine re-checks it on its tick.
  play(cardId: string, clientX: number, clientY: number) {
    const state = this.state;
    if (!state || !this.driver || state.result || this.waiting) return false;
    const at = this.groundAt(clientX, clientY);
    if (!at) return false;
    if (this.unconfirmed.includes(cardId)) return false;
    if (!this.canPlace(cardId, at)) {
      this.onToast("Can't deploy there");
      return false;
    }
    if (this.availableElixir() < getCard(cardId).cost) {
      this.onToast("Not enough elixir");
      return false;
    }
    this.unconfirmed.push(cardId);
    this.driver.submit({ team: this.me, card: cardId, x: at.x, z: at.z });
    this.hudT = 0;
    return true;
  }

  // ---------- loop ----------

  private frame = (now: number) => {
    if (this.disposed || !this.state || !this.driver) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(MAX_CATCH_UP, (now - this.last) / 1000);
    this.last = now;
    const state = this.state;
    const driver = this.driver;

    let buffered = driver.buffered();
    if (buffered > SKIP_AHEAD && now >= this.startAt) {
      while (buffered > NET_BUFFER && !state.result && this.state === state) {
        const plays = driver.next(state);
        if (!plays) break;
        this.waiting = false;
        this.step(plays, true);
        const expected = driver.hashAt?.(state.tick);
        if (expected !== undefined && expected !== hashState(state)) driver.desynced?.();
        buffered = driver.buffered();
      }
      this.acc = 0;
    }
    // Drift a little faster when a few ticks pile up from network jitter.
    const rate = driver instanceof NetDriver && buffered > NET_BUFFER * 2 ? 1.25 : 1;
    if (now >= this.startAt) this.acc += dt * rate;
    while (this.acc >= STEP && !state.result) {
      const plays = driver.next(state);
      if (!plays) {
        this.acc = Math.min(this.acc, STEP);
        break;
      }
      this.waiting = false;
      this.acc -= STEP;
      this.step(plays);
      const expected = driver.hashAt?.(state.tick);
      if (expected !== undefined && expected !== hashState(state)) driver.desynced?.();
      if (this.state !== state) break;
    }
    if (state.result) this.preview = null;
    if (state.result && this.demo && !this.demoRestart) {
      const decks = this.demo;
      this.demoRestart = window.setTimeout(() => {
        this.demoRestart = 0;
        void this.startDemo([decks[1], decks[0]]);
      }, 3000);
    }
    this.updatePreview();
    const alpha = state.result ? 1 : Math.min(1, this.acc / STEP);
    this.renderer.render(state, this.prev, alpha, this.events, dt);
    this.events = [];
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.emitHud();
    }
  };

  // `quiet` skips the renderer's effects (used when skipping ahead).
  private step(plays: Play[], quiet = false) {
    const state = this.state!;
    this.prev = new Map();
    for (const u of state.units) this.prev.set(u.id, { x: u.x, z: u.z });
    for (const p of state.projectiles) this.prev.set(p.id, { x: p.x, z: p.z });
    stepMatch(state, plays);
    for (const e of state.events) {
      if (!quiet) this.events.push(e);
      if ((e.type === "play" || e.type === "rejected") && e.team === this.me) {
        const i = this.unconfirmed.indexOf(e.card);
        if (i >= 0) this.unconfirmed.splice(i, 1);
        if (e.type === "rejected") this.onToast(e.reason === "not-enough-elixir" ? "Not enough elixir" : "Can't deploy there");
      }
      if (e.type === "end" || e.type === "tower-down" || e.type === "overtime" || e.type === "play") this.hudT = 0;
    }
  }

  private emitHud() {
    const s = this.state;
    if (!s) return;
    const me = s.players[this.me];
    const them = s.players[1 - this.me];
    this.onHud({
      tick: s.tick,
      phase: s.phase,
      me: this.me,
      elixir: Math.max(0, this.availableElixir()),
      hand: [...me.hand],
      pending: [...this.unconfirmed],
      next: me.queue[0],
      crowns: [me.crowns, them.crowns],
      doubleElixir: s.tick >= DOUBLE_ELIXIR_TICK,
      result: s.result,
      countdown: Math.max(0, Math.ceil((this.startAt - performance.now()) / 1000)),
    });
  }
}
