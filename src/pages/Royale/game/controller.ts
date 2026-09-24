// Runs a local match against the bot: steps the engine on a fixed 20 Hz
// clock, feeds it the player's and the bot's plays, and hands each frame to
// the renderer with an interpolation factor so motion stays smooth at any
// frame rate.
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
  stepMatch,
  type Bot,
  type MatchEvent,
  type MatchResult,
  type MatchState,
  type Play,
} from "../../../../server/shared/royale/index.js";
import { openPockets, Renderer, type Positions, type ViewOptions } from "./renderer";

export interface MatchSetup {
  playerDeck: string[];
  botDeck: string[];
  reaction: [number, number];
  seed: string;
}

export interface Hud {
  tick: number;
  phase: MatchState["phase"];
  elixir: number;
  hand: string[];
  next: string;
  crowns: [number, number];
  doubleElixir: boolean;
  result: MatchResult | null;
}

const STEP = 1 / TICK_RATE;
const MAX_CATCH_UP = 0.25;

export class MatchController {
  private renderer: Renderer;
  private state!: MatchState;
  private bot!: Bot;
  private pending: Play[] = [];
  private events: MatchEvent[] = [];
  private prev: Positions = new Map();
  private acc = 0;
  private last = 0;
  private raf = 0;
  private disposed = false;
  private hudT = 0;
  private preview: { card: string; x: number; y: number } | null = null;

  constructor(
    host: HTMLElement,
    private onHud: (hud: Hud) => void,
    private onToast: (message: string) => void,
  ) {
    this.renderer = new Renderer(host);
  }

  async start(setup: MatchSetup) {
    this.renderer.reset();
    this.state = createMatch({ seed: setup.seed, decks: [setup.playerDeck, setup.botDeck] });
    this.bot = createBot(setup.seed, { reaction: setup.reaction });
    this.pending = [];
    this.events = [];
    this.prev = new Map();
    this.acc = 0;
    this.preview = null;
    await this.renderer.load([...setup.playerDeck, ...setup.botDeck]);
    if (this.disposed) return;
    this.emitHud();
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }

  setView(view: ViewOptions) {
    this.renderer.setView(view);
  }

  // ---------- player input ----------

  private groundAt(clientX: number, clientY: number) {
    const at = this.renderer.pick(clientX, clientY);
    if (!at || Math.abs(at.x) > HALF_WIDTH || Math.abs(at.z) > HALF_LENGTH) return null;
    return at;
  }

  private canPlace(cardId: string, at: { x: number; z: number }) {
    const card = getCard(cardId);
    return card.type === "spell" || canDeployAt(this.state, 0, at.x, at.z);
  }

  setPreview(cardId: string | null, clientX = 0, clientY = 0) {
    this.preview = cardId ? { card: cardId, x: clientX, y: clientY } : null;
    this.updatePreview();
  }

  private updatePreview() {
    if (!this.state) return;
    const pockets = openPockets(this.state, 0);
    if (!this.preview) {
      this.renderer.setPreview(null, null, false, pockets);
      return;
    }
    const card = getCard(this.preview.card);
    const at = this.groundAt(this.preview.x, this.preview.y);
    const valid = !!at && this.canPlace(card.id, at) && this.state.players[0].elixir >= card.cost;
    this.renderer.setPreview(card, at, valid, pockets);
  }

  // Tries to play a card at a screen point. Returns false (and toasts why)
  // if it can't go there; the engine re-checks it on the next tick.
  play(cardId: string, clientX: number, clientY: number) {
    if (this.state.result) return false;
    const at = this.groundAt(clientX, clientY);
    if (!at) return false;
    const card = getCard(cardId);
    if (!this.canPlace(cardId, at)) {
      this.onToast("Can't deploy there");
      return false;
    }
    if (this.state.players[0].elixir < card.cost) {
      this.onToast("Not enough elixir");
      return false;
    }
    this.pending.push({ team: 0, card: cardId, x: at.x, z: at.z });
    return true;
  }

  // ---------- loop ----------

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(MAX_CATCH_UP, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step();
    }
    if (this.state.result) this.preview = null;
    this.updatePreview();
    const alpha = this.state.result ? 1 : this.acc / STEP;
    this.renderer.render(this.state, this.prev, alpha, this.events, dt);
    this.events = [];
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.emitHud();
    }
  };

  private step() {
    const state = this.state;
    if (state.result) return;
    this.prev = new Map();
    for (const u of state.units) this.prev.set(u.id, { x: u.x, z: u.z });
    for (const p of state.projectiles) this.prev.set(p.id, { x: p.x, z: p.z });
    const plays = this.pending;
    this.pending = [];
    const botMove = botPlay(state, 1, this.bot);
    if (botMove) plays.push(botMove);
    stepMatch(state, plays);
    for (const e of state.events) {
      this.events.push(e);
      if (e.type === "rejected" && e.team === 0) this.onToast(e.reason === "not-enough-elixir" ? "Not enough elixir" : "Can't deploy there");
      if (e.type === "end" || e.type === "tower-down" || e.type === "overtime" || e.type === "play") this.hudT = 0;
    }
  }

  private emitHud() {
    const s = this.state;
    const me = s.players[0];
    this.onHud({
      tick: s.tick,
      phase: s.phase,
      elixir: me.elixir,
      hand: [...me.hand],
      next: me.queue[0],
      crowns: [s.players[0].crowns, s.players[1].crowns],
      doubleElixir: s.tick >= DOUBLE_ELIXIR_TICK,
      result: s.result,
    });
  }
}
