import { FuryCoop } from "./coop";
import { MusicDirector, type AudioSettings } from "./music";
import { FuryAudio } from "./audio";
import type { RenderPresentation } from "./render";
import { GraphicsRenderer, readGraphicsMode, type GraphicsMode, type GraphicsStatus } from "./graphics";
import type { HeroAvatar } from "./avatar";
import { GameInput, type InputMode } from "./input";
import { captureMotion, interpolateMotion, type MotionSnapshot } from "./motion";
import { exitCoop, idleInput, newGame, step, type GameEvent, type GameState, type Input } from "./sim";
export interface Callbacks {
  onState: (state: GameState) => void;
  onInputMode: (mode: InputMode) => void;
  onPresentation?: (presentation: RenderPresentation) => void;
  onGraphics?: (status: GraphicsStatus) => void;
  onSoundBlocked?: (blocked: boolean) => void;
  onPause: () => void;
  onConfirm: () => boolean;
  onNavigate: (direction: number, axis?: "horizontal" | "vertical") => void;
  onEvent?: (state: GameState, event: GameEvent) => void;
}
export class GameController {
  state: GameState = newGame();
  private renderer: GraphicsRenderer;
  coop: FuryCoop | null = null;
  private input: GameInput;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private hudAt = 0;
  private presentationAt = 0;
  private paused = true;
  private started = false;
  private sound = new MusicDirector();
  private audio = new FuryAudio(this.sound);
  private soundBlocked = false;
  private audioGestures = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;
  unlockAudio = () => { void this.sound.unlock(); };
  private visibleAudio = () => { void this.sound.setVisible(!document.hidden); };
  private uiClick = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (button && !button.classList.contains("wf-touch-btn")) void this.sound.unlock().then(() => this.sound.playSfx("select"));
  };
  private previousMotion: MotionSnapshot | null = null;
  private presentationSuspended = false;
  constructor(canvas: HTMLCanvasElement, private cb: Callbacks, graphicsMode = readGraphicsMode()) {
    this.renderer = new GraphicsRenderer(canvas, graphicsMode, cb.onGraphics);
    this.input = new GameInput(cb.onInputMode, cb.onPause, cb.onConfirm, cb.onNavigate, this.unlockAudio);
    this.audio.menu(); this.visibleAudio();
    // Capture runs before React/game handlers can stop propagation, including
    // touch controls whose preventDefault suppresses the synthetic click.
    for (const gesture of this.audioGestures) window.addEventListener(gesture, this.unlockAudio, { capture: true, passive: true });
    window.addEventListener("click", this.uiClick);
    document.addEventListener("visibilitychange", this.visibleAudio);
    window.addEventListener("pageshow", this.visibleAudio);
    cb.onInputMode(this.input.mode);
    this.raf = requestAnimationFrame(this.frame);
  }
  start(state = newGame()) { this.presentationSuspended=false; this.coop?.beginRun(); this.started = true; this.state = state; if (this.coop?.room) this.state.coop = { role: this.coop.isHost ? "host" : "guest", seat: this.coop.room.seat, remoteHeroes: [], appliedHits: [] }; this.paused = false; this.state.localPaused=false; this.acc = 0; this.previousMotion = null; this.input.clear(); this.renderer.reset(); this.audio.start(state); this.publish(); }
  setPresentationSuspended(suspended: boolean) { this.presentationSuspended=suspended; if(!suspended)this.renderer.reset(); }
  setPaused(paused: boolean) { if (this.paused === paused) return; this.paused = paused; this.state.localPaused=paused; this.sound.setPaused(paused); this.acc = 0; this.previousMotion = null; this.input.clear(); this.state.previousInput.ki = false; if (paused) this.state.charge = 0; }
  showTitle() { this.presentationSuspended=false; this.started = false; this.setPaused(true); this.audio.menu(); }
  get graphicsMode() { return this.renderer.graphicsMode; }
  setGraphicsMode(mode: GraphicsMode) { this.renderer.setGraphicsMode(mode); }
  setAudioSettings(settings: AudioSettings) { this.sound.setSettings(settings); }
  itemGet() { this.sound.jingle("item"); }
  setAvatar(assets: HeroAvatar) { this.renderer.setAvatar(assets); this.coop?.setAvatar(assets); }
  setRemoteAvatar(seat: number, assets: HeroAvatar) { this.renderer.setRemoteAvatar(seat, assets); }
  setCoop(coop: FuryCoop | null) { this.coop = coop; if (!coop) exitCoop(this.state); else if (coop.room) this.state.coop = { role: coop.isHost ? "host" : "guest", seat: coop.room.seat, remoteHeroes: [], appliedHits: [] }; }
  setTouch(input: Partial<Input>) { this.input.setTouch(input); }
  mutate(action: (state: GameState) => void) {
    this.previousMotion = null;
    const overlay = this.state.overlay;
    this.state.events.length = 0; action(this.state);
    if (!overlay && this.state.overlay) this.input.clearTouch();
    for (const event of this.state.events) { this.renderer.onEvent(this.state, event); this.audio.event(this.state, event); this.coop?.event(this.state, event); this.cb.onEvent?.(this.state, event); }
    this.state.events.length = 0; if (this.started) this.audio.sync(this.state); this.publish();
  }
  private publish() {
    const blocked = this.sound.needsGesture();
    if (blocked !== this.soundBlocked) { this.soundBlocked = blocked; this.cb.onSoundBlocked?.(blocked); }
    const s = this.state;
    this.cb.onState({ ...s,
      heroes: Object.fromEntries(Object.entries(s.heroes).map(([id, hero]) => [id, { ...hero }])) as GameState["heroes"],
      character: { ...s.character }, gear: { ...s.gear }, party: [...s.party], unlockedHeroes: [...s.unlockedHeroes],
      enemies: s.enemies.map(enemy => ({ ...enemy })), effects: s.effects.map(effect => ({ ...effect })),
      floaters: s.floaters.map(floater => ({ ...floater })), projectiles: s.projectiles.map(shot => ({ ...shot, hits: [...shot.hits] })),
      clearedRooms: [...s.clearedRooms], areas: [...s.areas], bosses: [...s.bosses], previousInput: { ...s.previousInput }, events: [...s.events],
      foundItems: [...s.foundItems],
      contextAttack: { ...s.contextAttack }, dialogue: s.dialogue ? { ...s.dialogue, lines: [...s.dialogue.lines] } : null,
    });
  }
  dispose() {
    this.coop?.leave(); cancelAnimationFrame(this.raf); this.input.dispose(); this.renderer.dispose(); this.sound.dispose();
    for (const gesture of this.audioGestures) window.removeEventListener(gesture, this.unlockAudio, true);
    window.removeEventListener("click", this.uiClick); document.removeEventListener("visibilitychange", this.visibleAudio);
    window.removeEventListener("pageshow", this.visibleAudio);
  }
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const input = this.input.read();
    const frameDelta = (now - (this.last || now)) / 1000;
    const delta = Math.min(0.1, frameDelta);
    this.acc += this.paused && !this.coop?.room ? 0 : delta;
    this.last = now;
    while (this.acc >= 1 / 60) {
      this.previousMotion = captureMotion(this.state);
      const ready = this.state.hitStop <= 0, overlay = this.state.overlay, dialogue = !!this.state.dialogue;
      const appliedInput = this.paused ? { ...input, x: 0, y: 0, attack: false, ki: false, dash: false, guard: false, swap: false, interact: false } : { ...input };
      step(this.state, appliedInput, 1 / 60);
      this.coop?.update(this.state, dialogue || this.state.dialogue ? idleInput() : appliedInput, now);
      this.audio.sync(this.state);
      if (!overlay && this.state.overlay) this.input.clearTouch();
      if (ready) this.input.consume();
      for (const event of this.state.events) { this.renderer.onEvent(this.state, event); this.audio.event(this.state, event); this.coop?.event(this.state, event); this.cb.onEvent?.(this.state, event); }
      this.acc -= 1 / 60;
    }
    if(this.presentationSuspended) { if(now-this.hudAt>80){this.hudAt=now;this.publish();} return; }
    const rendered = this.paused ? this.state : interpolateMotion(this.previousMotion, this.state, this.acc * 60);
    this.renderer.draw(rendered, this.paused ? 0 : delta, frameDelta);
    if (now - this.presentationAt > 30) { this.presentationAt = now; this.cb.onPresentation?.(this.renderer.presentation(rendered)); }
    if (now - this.hudAt > 80) { this.hudAt = now; this.publish(); }
  };
}
