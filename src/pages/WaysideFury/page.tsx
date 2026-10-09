import { WorldClock } from "./game/u1/world/WorldClock";
import { GlobeTravel } from "./GlobeTravel";
import { globeAvailable, type GlobeDestination } from "./game/globe";
import { COUNTY_STOPS } from "./game/county";
import { LOCATIONS } from "./game/content";
import { getMap } from "./game/campaign";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import { CoopMenu } from "./CoopMenu";
import { CharacterSheet } from "./CharacterSheet";
import { layoutLabels } from "./game/labelLayout";
import { Collection } from "./Collection";
import { HeroPortrait } from "./HeroPortrait";
import { FuryCoop, type CoopRoom } from "./game/coop";
import { composeAppearance, loadHeroAvatar, type HeroAvatar } from "./game/avatar";
import { GameController } from "./game/controller";
import { readGraphicsMode, rememberGraphicsMode, type GraphicsMode, type GraphicsStatus } from "./game/graphics";
import { showAttackPresentation, type InputMode } from "./game/input";
import type { ActionPrompt } from "./game/contextAttack";
import { type RenderPresentation } from "./game/render";
import { sampleSpaceFilm } from "./game/chapters/ch3Films";
import { HERO_IDS, HERO_NAMES, nextPartyHero, requestSwap, activeHero, advanceDialogue, advanceStory, buyItem, enterCampaignMap, enterScene, interact, newGame, restAtHome, skipPrologue, toggleParty, type GameState, type Input } from "./game/sim";
import { PROLOGUE, SHOP_ITEMS } from "./game/content";
import { progressReport, readSave, restoreSave, makeSave, type SaveSettings } from "./game/save";
import { connectSaveStore } from "./store";
import type { CloudSaveStore, SaveStatus } from "./game/cloud";
import "./style.css";
import "./design.css";
const DEFAULT_SETTINGS: SaveSettings = { difficulty: "normal", musicVolume: .6, sfxVolume: .8, controls: { tutorialDismissed: false, stickSensitivity: 1 } };
const SAVE_LABELS: Record<SaveStatus, string> = { loading: "Loading save…", saving: "Saving…", saved: "Saved", local: "Saved on this device", offline: "Offline, saved on this device", unavailable: "Save unavailable, keep this tab open" };
const TUTORIAL_KEY = "wayside-fury-controls-dismissed";
function tutorialVisible() { try { return localStorage.getItem(TUTORIAL_KEY) !== "1"; } catch { return true; } }
function Controls({ mode }: { mode: InputMode }) {
  return <section className="wf-controls-panel" aria-label="Controls">
    <h2>Controls</h2>
    <dl><dt>Move</dt><dd>WASD / arrows · left stick / d-pad</dd>
      <dt>Attack / Use</dt><dd>J · A / Cross · nearby talk/use · tap: 3-hit combo · hold/release: charged strike</dd>
      <dt>Ki</dt><dd>K · X / Square · tap: blast, hold: charge</dd>
      <dt>Signature</dt><dd>Release Ki at a full bar for your hero's beam</dd>
      <dt>Dash / Guard</dt><dd>L / Shift · B / Circle / RT or RB</dd>
      <dt>Swap</dt><dd>Q / E · LB / Y · Tag partner</dd>
      <dt>Interact / Pause</dt><dd>Enter / Esc · A / Cross / Start</dd></dl>
    <p>{mode === "touch" ? "Use the stick and buttons below. Hold Ki or Guard while moving." : "Controllers connect automatically. Charge somewhere safe."}</p>
  </section>;
}
function GraphicsSettings({ mode, status, onChange, onNewGame, resetDisabled, difficulty, onDifficulty, inCoop, hardUnlocked }: { difficulty: "normal" | "hard"; onDifficulty: (value: "normal" | "hard") => void; inCoop: boolean; hardUnlocked: boolean; mode: GraphicsMode; status: GraphicsStatus; onChange: (mode: GraphicsMode) => void; onNewGame: () => void; resetDisabled: boolean }) {
  return <section className="wf-graphics-settings" aria-label="Graphics settings">
    <h2>Settings</h2><p>Combat difficulty</p>
    <div role="radiogroup" aria-label="Combat difficulty">
      {(["normal", "hard"] as const).map(value => <button key={value} role="radio" aria-checked={difficulty === value} disabled={inCoop} className="wf-secondary" onClick={() => onDifficulty(value)}>{value === "hard" ? "Hard" : "Normal"}</button>)}
    </div>
    <p className="wf-small">{inCoop ? "The host sets difficulty before joining co-op." : hardUnlocked ? "Chapter 1 cleared: Hard unlocked. Faster decisions, flanking and stronger attacks." : "Normal is approachable. You can opt into Hard here at any time."}</p><p>Overworld graphics</p>
    <div role="radiogroup" aria-label="Overworld graphics">
      <button role="radio" aria-checked={mode === "2d"} className="wf-secondary" onClick={() => onChange("2d")}>2D</button>
      <button role="radio" aria-checked={mode === "3d"} className="wf-secondary" onClick={() => onChange("3d")}>3D HD-2D</button>
    </div>
    <p className="wf-small">3D applies to the county and Space. Other dungeons use 2D. Remembered on this device.</p>
    <p className="wf-small" role="status">{status.status === "fallback" ? "3D is unavailable. Using 2D. Select 3D to retry." : status.status === "loading" ? "Loading the 3D overworld…" : mode === "3d" ? "3D selected for county and Space. Other dungeons use 2D." : "2D overworld selected."}</p>
    <button className="wf-secondary" disabled={resetDisabled} onClick={onNewGame}>New Game</button>
    <p className="wf-small">Restart the story. Your Collection and lore cards stay with you. Leave co-op first to restart.</p>
  </section>;
}
function PromptGlyph({ mode, action = "interact" }: { mode: InputMode; action?: "attack" | "interact" }) {
  if (mode === "touch") return null;
  const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected);
  const glyph = /playstation|dualshock|dualsense|sony/i.test(pad?.id ?? "") ? "✕" : /switch|nintendo/i.test(pad?.id ?? "") ? "B" : "A";
  return mode === "keyboard" ? <kbd aria-hidden="true">{action === "attack" ? "J" : "↵"}</kbd> : <span className="wf-pad-glyph" aria-hidden="true">{glyph}</span>;
}
function SceneSurface({ canvas, presentation, onTouch, soundBlocked, onSound }: { canvas: RefObject<HTMLCanvasElement>; presentation: RenderPresentation | null; onTouch: () => void; soundBlocked: boolean; onSound: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 1, height: 1, top: 40 });
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    let band: Element | null = null;
    const measure = () => {
      // Read the resolved custom property through a probe: it may contain calc()/env().
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;top:var(--wf-label-top,40px);visibility:hidden';
      element.append(probe);
      let top = parseFloat(getComputedStyle(probe).top) || 40; probe.remove();
      const nextBand = element.parentElement?.querySelector('.wf-play-band') ?? null;
      if (nextBand !== band) { if (band) observer.unobserve(band); band = nextBand; if (band) observer.observe(band); }
      if (band?.getClientRects().length) top = Math.max(top, band.getBoundingClientRect().bottom - element.getBoundingClientRect().top + 8);
      setBounds({ width: element.clientWidth, height: element.clientHeight, top });
    };
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    const shellObserver = new MutationObserver(measure);
    if (element.parentElement) shellObserver.observe(element.parentElement, { attributes: true, attributeFilter: ['class'], childList: true });
    return () => { observer.disconnect(); shellObserver.disconnect(); };
  }, []);
  const labels = layoutLabels(presentation?.labels ?? [], bounds.width, bounds.height, bounds.top, presentation?.focus);
  return <div className="wf-stage" ref={stage}>
    <div className="wf-scene-surface" onPointerDown={e => { if (e.pointerType === "touch") onTouch(); }}>
      <canvas ref={canvas} aria-label="Wayside Fury action RPG" />
      <div className="wf-scene-labels" aria-hidden="true">{labels.map(label => <span key={label.id}
        className={`wf-scene-label wf-label-${label.kind}`} style={{ left: label.left, top: label.bottom, width: label.width, height: label.height, color: label.color, opacity: label.opacity, transform: `translate(-50%, -100%) scale(${label.scale ?? 1})` }}>{label.text}</span>)}</div>
    </div>
    {soundBlocked && <button className="wf-sound-chip" onClick={onSound}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M11 4 6 8H3v8h3l5 4V4Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></svg>Tap for sound</button>}
  </div>;
}
function ActionIcon({ action, glyph }: { action: keyof Input; glyph?: ActionPrompt["glyph"] }) {
  const paths: Partial<Record<keyof Input, ReactNode>> = {
    attack: <><path d="m7 21 14-14 3-5-5 3L5 19" /><path d="m5 15 8 8M3 25l4-4" /></>,
    ki: <><circle cx="15" cy="15" r="6" /><path d="M15 1v5m0 18v5M1 15h5m18 0h5M5 5l4 4m12 12 4 4M25 5l-4 4M9 21l-4 4" /></>,
    dash: <><path d="m9 5 10 10L9 25m9-20 10 10-10 10M1 10h5m-5 10h5" /></>,
    guard: <path d="M15 2 26 7v9c0 7-11 12-11 12S4 23 4 16V7L15 2Z" />,
    swap: <><path d="M4 10h21l-5-5m5 5-5 5M26 21H5l5 5m-5-5 5-5" /></>,
  };
  const contextPaths: Partial<Record<ActionPrompt["glyph"], ReactNode>> = {
    talk: <path d="M5 4h20a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H13l-8 5v-5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3ZM8 12h14M8 17h9" />,
    use: <><path d="M10 16V7a2 2 0 0 1 4 0v8-10a2 2 0 0 1 4 0v10-7a2 2 0 0 1 4 0v8-4a2 2 0 0 1 4 0v8c0 5-3 8-8 8h-3c-3 0-5-2-7-4l-5-5a2.5 2.5 0 0 1 3-4l4 3" /></>,
    taxi: <><path d="m5 13 3-7h14l3 7M3 13h24v10H3V13Zm5 10v4m14-4v4M12 6V3h6v3" /><path d="M6 18h3m12 0h3M11 18h8" /></>,
    next: <><path d="m11 5 10 10-10 10" /><path d="m4 5 10 10L4 25" /></>,
  };
  return <svg viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{glyph && glyph !== "attack" ? contextPaths[glyph] : paths[action]}</svg>;
}
function Stick({ send, sensitivity }: { send: (input: Partial<Input>) => void; sensitivity: number }) {
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0, dx: 0, dy: 0, active: false });
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== drag.current?.id) return;
    const dx = (e.clientX - drag.current.x) * sensitivity, dy = (e.clientY - drag.current.y) * sensitivity;
    const factor = 30 / Math.max(30, Math.hypot(dx, dy));
    setStick(previous => ({ ...previous, dx: dx * factor, dy: dy * factor }));
    send({ x: dx * factor / 30, y: dy * factor / 30 });
  };
  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== drag.current?.id) return;
    drag.current = null; setStick(previous => ({ ...previous, dx: 0, dy: 0, active: false })); send({ x: 0, y: 0 });
  };
  return <div className="wf-stick-zone" role="group" aria-label="Movement stick. Touch anywhere here and drag to move." onPointerDown={e => {
    e.preventDefault(); if (drag.current) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setStick({ x: Math.max(48, Math.min(bounds.width - 48, e.clientX - bounds.left)), y: Math.max(48, Math.min(bounds.height - 48, e.clientY - bounds.top)), dx: 0, dy: 0, active: true });
    e.currentTarget.setPointerCapture(e.pointerId); send({ x: 0, y: 0 });
  }} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    <span className={`wf-stick ${stick.active ? "wf-stick-active" : ""}`} style={stick.active ? { left: stick.x, top: stick.y } : undefined}>
      <span className="wf-stick-thumb" style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} />
    </span>
  </div>;
}
function TouchButton({ action, label, send, prompt }: { action: keyof Input; label: string; send: (input: Partial<Input>) => void; prompt?: ActionPrompt }) {
  const pointer = useRef<number | null>(null);
  const [held, setHeld] = useState(false);
  const glyph = prompt?.glyph ?? "attack";
  const lastGlyph = useRef(glyph);
  const [outgoing, setOutgoing] = useState<ActionPrompt["glyph"] | null>(null);
  useEffect(() => {
    if (lastGlyph.current === glyph) return;
    setOutgoing(lastGlyph.current); lastGlyph.current = glyph;
    const timer = window.setTimeout(() => setOutgoing(null), 120);
    return () => window.clearTimeout(timer);
  }, [glyph]);
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null; setHeld(false); send({ [action]: false });
  };
  return <button className={`wf-touch-btn wf-${action} ${held ? "wf-held" : ""}`} aria-label={prompt?.label ?? label} aria-pressed={held} data-glyph={action === "attack" ? glyph : action} onPointerDown={e => {
    e.preventDefault(); if (pointer.current !== null) return;
    pointer.current = e.pointerId; setHeld(true); e.currentTarget.setPointerCapture(e.pointerId); send({ [action]: true, ...(action === "attack" && prompt ? { attackPresentation: { action: prompt.action, targetId: prompt.targetId } } : {}) });
  }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    {outgoing && <span className="wf-action-glyph wf-glyph-out" aria-hidden="true"><ActionIcon action={action} glyph={outgoing} /></span>}
    <span className={`wf-action-glyph ${outgoing ? "wf-glyph-in" : ""}`} key={glyph}><ActionIcon action={action} glyph={action === "attack" ? glyph : undefined} /></span>
  </button>;
}
function Meter({ value, max, kind, children }: { value: number; max: number; kind: string; children?: ReactNode }) {
  const width = `${Math.max(0, Math.min(100, value / max * 100))}%`;
  return <div className={`wf-meter wf-${kind}`}><span className="wf-meter-trail" style={{ width }} /><span className="wf-meter-fill" style={{ width }} />{children && <small>{children}</small>}</div>;
}
export default function WaysideFury() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<GameController | null>(null);
  const [saved, setSaved] = useState(readSave);
  const saveRef = useRef(saved);
  const [settings, setSettings] = useState<SaveSettings>(() => saved?.settings ?? { ...DEFAULT_SETTINGS, controls: { ...DEFAULT_SETTINGS.controls, tutorialDismissed: !tutorialVisible() } });
  const settingsRef = useRef(settings);
  const coopRef = useRef<FuryCoop | null>(null);
  const [coopOpen, setCoopOpen] = useState(() => new URLSearchParams(location.search).has("coop"));
  const [coopBusy, setCoopBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const joinCode = useRef(new URLSearchParams(location.search).get("coop")?.toUpperCase().slice(0, 4) ?? "");
  const autoJoined = useRef(false);
  const [coopRoom, setCoopRoom] = useState<CoopRoom | null>(null);
  const storeRef = useRef<CloudSaveStore | null>(null);
  const playingRef = useRef(false);
  const pausedRef = useRef(false);
  const exitRef = useRef<() => void>(() => {});
  const lastExit = useRef({ at: 0, account: undefined as string | null | undefined });
  const [syncStatus, setSyncStatus] = useState<SaveStatus>("loading");
  const [loadingSave, setLoadingSave] = useState(true);
  const [loadingAvatar, setLoadingAvatar] = useState(true);
  const [avatar, setAvatar] = useState<HeroAvatar | null>(null);
  const [saveToast, setSaveToast] = useState("");
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [state, setState] = useState<GameState>(newGame);
  const [worldRoute, setWorldRoute] = useState(false);
  const worldRouteRef=useRef(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [controls, setControls] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newGameConfirm, setNewGameConfirm] = useState(false);
  const [newGameBusy, setNewGameBusy] = useState(false);
  const newGameBusyRef = useRef(false);
  const [newGameError, setNewGameError] = useState("");
  const resetDialog = useRef<HTMLDivElement | null>(null);
  const resetDisabled = loadingSave || loadingAvatar || !!coopRoom || newGameBusy;
  const requestNewGame = () => {
    if (resetDisabled) return;
    setNewGameError(""); setNewGameConfirm(true);
  };
  const [graphicsMode, setGraphicsMode] = useState<GraphicsMode>(readGraphicsMode);
  const graphicsModeRef = useRef(graphicsMode);
  const [graphicsStatus, setGraphicsStatus] = useState<GraphicsStatus>({ requested: graphicsMode, active: "2d", status: "ready" });
  const updateGraphics = (next: GraphicsMode) => {
    graphicsModeRef.current = next; setGraphicsMode(next); rememberGraphicsMode(next); controller.current?.setGraphicsMode(next);
  };
  const [mode, setMode] = useState<InputMode>(navigator.maxTouchPoints > 0 ? "touch" : "keyboard");
  const [reward, setReward] = useState(0);
  const [presentation, setPresentation] = useState<RenderPresentation | null>(null);
  const [viewport, setViewport] = useState({ height: window.visualViewport?.height ?? window.innerHeight, width: window.visualViewport?.width ?? window.innerWidth, top: window.visualViewport?.offsetTop ?? 0, left: window.visualViewport?.offsetLeft ?? 0 });
  const [tutorial, setTutorial] = useState(tutorialVisible);
  const [noticeVisible, setNoticeVisible] = useState(false);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const accountEpochRef = useRef(0);
  const dismissTutorialRef = useRef(() => {});
  const handlers = useRef({ pause: () => {}, confirm: (): boolean => false, navigate: (direction: number, axis?: "horizontal" | "vertical") => { void direction; void axis; } });
  const begin = (retry = false) => { if (loadingSave || loadingAvatar) return; playingRef.current = true; pausedRef.current = false; const next = saveRef.current ? restoreSave(saveRef.current, retry || saveRef.current.party.every(id => saveRef.current!.heroes[id].hp <= 0)) : newGame(); if (!saveRef.current) enterScene(next, "prologue"); if (import.meta.env.DEV && !retry && new URLSearchParams(location.search).get("chapter") === "3") { next.campaignMilestones.push("space-dev-entry"); enterScene(next,"dungeon",0,"space-launch"); } next.difficulty = settingsRef.current.difficulty ?? "normal"; controller.current?.start(next); setPlaying(true); setPaused(false); setCharacterOpen(false); setCollectionOpen(false); setControls(false); setSettingsOpen(false); };
  const confirmNewGame = async () => {
    const store = storeRef.current;
    if (!store || resetDisabled || newGameBusyRef.current) return;
    newGameBusyRef.current = true; setNewGameBusy(true); setNewGameError("");
    const epoch = accountEpochRef.current;
    try {
      const fresh = await store.newGame();
      if (epoch !== accountEpochRef.current) return;
      saveRef.current = fresh; setSaved(fresh); setNewGameConfirm(false); setReward(0);
      begin();
    } catch {
      if (epoch === accountEpochRef.current) setNewGameError("Could not start a new game. Check your connection and try again. The restart could not be confirmed.");
    } finally { newGameBusyRef.current = false; setNewGameBusy(false); }
  };
  useEffect(() => {
    if (!newGameConfirm) return;
    const previous = document.activeElement;
    resetDialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons = Array.from(resetDialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
      if (!buttons.length) { event.preventDefault(); return; }
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    };
    window.addEventListener("keydown", trap);
    return () => { window.removeEventListener("keydown", trap); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [newGameConfirm]);
  const persist = (s: GameState, home = false, credit = false) => {
    const store = storeRef.current;
    if (!store?.ready || newGameBusyRef.current) return;
    const report = credit ? progressReport(s, store.save?.lastReported) : null;
    const next = makeSave(s, store.save, home, report?.receipt);
    if (next && !store.persist({ ...next, settings: settingsRef.current }, !!report?.score)) s.notice = "Saving is unavailable in this browser. Keep this tab open.";
  };
  const updateSettings = (next: SaveSettings) => {
    settingsRef.current = next; setSettings(next); controller.current?.mutate(s => { if (!s.coop) s.difficulty = next.difficulty ?? "normal"; }); controller.current?.setAudioSettings(next); setTutorial(!next.controls.tutorialDismissed);
    const store = storeRef.current, game = controller.current;
    if (!store?.ready || !game || newGameBusyRef.current) return;
    const snapshot = makeSave(game.state, store.save);
    if (snapshot) store.persist({ ...snapshot, settings: next });
  };
  exitRef.current = () => {
    const game = controller.current;
    const account = storeRef.current?.userId;
    const now = performance.now();
    if (playingRef.current && game && game.state.scene !== "prologue" &&
      (account !== lastExit.current.account || now - lastExit.current.at >= 250)) {
      lastExit.current = { at: now, account }; persist(game.state);
    }
    storeRef.current?.flushOnExit();
  };
  const togglePause = () => { if (worldRoute) return;  if (newGameConfirm) { if (!newGameBusyRef.current) setNewGameConfirm(false); return; } if (coopOpen) { closeCoop(); return; } if (!playing || loadingSave || loadingAvatar) return; const next = !paused; if (!next) { setCharacterOpen(false); setCollectionOpen(false); setSettingsOpen(false); } pausedRef.current = next; controller.current?.setPaused(next); setPaused(next); };
  const overlayControls = () => {
    const overlays = document.querySelectorAll<HTMLElement>(".wf-overlay");
    const overlay = overlays[overlays.length - 1];
    return overlay ? Array.from(overlay.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button:not(:disabled), input:not(:disabled)")) : [];
  };
  handlers.current = { pause: togglePause, confirm: () => {
    // Story and world confirmations are consumed by the simulation exactly once.
    const buttons = overlayControls();
    if (!buttons.length) return false;
    const active = buttons.find(button => button === document.activeElement) ?? buttons[0];
    active.click(); return true;
  }, navigate: (direction: number, axis = "vertical") => {
    const active = document.activeElement;
    if (axis === "horizontal" && active instanceof HTMLInputElement && active.type === "range") {
      const value = Math.round(Math.max(Number(active.min), Math.min(Number(active.max), Number(active.value) + direction * Number(active.step))) * 100) / 100;
      const current = settingsRef.current;
      updateSettings(active.id === "wf-music-volume" ? { ...current, musicVolume: value } : active.id === "wf-sfx-volume" ? { ...current, sfxVolume: value } : { ...current, controls: { ...current.controls, stickSensitivity: value } });
      return;
    }
    const buttons = overlayControls(); if (!buttons.length) return;
    const index = buttons.findIndex(button => button === document.activeElement);
    buttons[(index < 0 ? direction > 0 ? 0 : buttons.length - 1 : (index + direction + buttons.length) % buttons.length)].focus();
  } };
  useEffect(() => {
    const game = new GameController(canvas.current!, {onState: setState, onInputMode: setMode, onPresentation: setPresentation, onSoundBlocked: setSoundBlocked, onGraphics: setGraphicsStatus,
      onPause: () => handlers.current.pause(), onConfirm: () => handlers.current.confirm(), onNavigate: (direction, axis) => handlers.current.navigate(direction, axis),
      onEvent: (s, event) => {
        if (event.type !== "checkpoint" && event.type !== "death" && event.type !== "ambient-taxi-crash") return;
        const store = storeRef.current;
        if (!store?.ready || newGameBusyRef.current) return;
        const report = progressReport(s, store.save?.lastReported);
        const next = makeSave(s, store.save, event.type === "checkpoint" && event.id === "home", report.receipt);
        if (next && !store.persist({ ...next, settings: settingsRef.current }, report.score > 0)) s.notice = "Saving is unavailable in this browser. Keep this tab open.";
      }}, graphicsModeRef.current);
    controller.current = game;
    const coop = new FuryCoop({ onRoom: room => { setCoopRoom(room); if (!room) delete game.state.coop; }, onToast: setSaveToast,
      onAvatar: (seat, appearance) => { const userId = coop.room?.players.find(p => p.seat === seat)?.userId; void composeAppearance(appearance).then(assets => { if (coop.room?.players.some(p => p.seat === seat && p.userId === userId)) game.setRemoteAvatar(seat, assets); }); },
    });
    coopRef.current = coop; game.setCoop(coop);
    let mounted = true;
    let avatarAccount: string | null | undefined;
    let avatarAbort: AbortController | null = null;
    let saveReady = false, avatarReady = false;
    const resumeWhenReady = () => game.setPaused(pausedRef.current || worldRouteRef.current || !playingRef.current || !saveReady || !avatarReady);
    const refreshAvatar = (id: string | null) => {
      if (avatarAccount === id) return;
      avatarAccount = id; avatarAbort?.abort(); avatarAbort = new AbortController();
      const signal = avatarAbort.signal;
      avatarReady = false; setLoadingAvatar(true); game.setPaused(true);
      void loadHeroAvatar(id, signal).then(assets => {
        if (!mounted || signal.aborted || connected.store.userId !== id || !connected.store.ready) return;
        avatarReady = true; game.setAvatar(assets); setAvatar(assets); setLoadingAvatar(false);
        resumeWhenReady();
      }).catch(() => { /* An account change aborts the obsolete load. */ });
    };
    const connected = connectSaveStore({
      onChange: ({ save, status, ready }) => {
        if (!mounted) return;
        saveReady = ready; if (ready) setSignedIn(!!connected.store.userId); saveRef.current = save; setSaved(save); setSyncStatus(status); setLoadingSave(!ready);
        if (!ready && playingRef.current) game.setPaused(true);
        if (ready) {
          const nextSettings = save?.settings ?? { ...DEFAULT_SETTINGS, controls: { ...DEFAULT_SETTINGS.controls, tutorialDismissed: connected.store.userId === null && !tutorialVisible() } };
          settingsRef.current = nextSettings; setSettings(nextSettings); game.setAudioSettings(nextSettings); setTutorial(!nextSettings.controls.tutorialDismissed);
          refreshAvatar(connected.store.userId);
        }
        resumeWhenReady();
      },
      onReplaced: (save, reason) => {
        if (!mounted) return;
        saveRef.current = save; setSaved(save);
        if (playingRef.current) {
          const next = save ? restoreSave(save) : newGame();
          if (!save) enterScene(next, "prologue");
          worldRouteRef.current=false; setWorldRoute(false); game.start(next); resumeWhenReady();
        }
        if (reason === "conflict") setSaveToast("A newer account save was loaded.");
      },
      onCredit: score => {
        if (score <= 0) return;
        window.parent.postMessage({ type: "PLAYER_DIED", score }, window.location.origin);
        if (mounted) setReward(score);
      },
    }, () => {
      coop.leave(); setCoopOpen(false); setNewGameConfirm(false); setSignedIn(false); exitRef.current(); accountEpochRef.current++; setAccountEpoch(accountEpochRef.current); avatarAbort?.abort(); avatarAccount = undefined;
      avatarReady = false; saveReady = false; setCharacterOpen(false); setCollectionOpen(false); setLoadingAvatar(true); game.setPaused(true);
    });
    storeRef.current = connected.store;
    if (import.meta.env.DEV) Object.defineProperty(window, "__waysideFury", { value: game, configurable: true });
    const preventGesture = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", preventGesture, { passive: false });
    const hidden = () => { if (document.hidden) { exitRef.current(); game.setPaused(true); pausedRef.current = true; setPaused(true); } };
    const blur = () => { exitRef.current(); game.setPaused(true); pausedRef.current = true; setPaused(true); };
    const pagehide = () => exitRef.current();
    window.addEventListener("pagehide", pagehide);
    document.addEventListener("visibilitychange", hidden); window.addEventListener("blur", blur);
    return () => { exitRef.current(); mounted = false; avatarAbort?.abort(); connected.dispose(); storeRef.current = null; window.removeEventListener("pagehide", pagehide); document.removeEventListener("gesturestart", preventGesture); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("blur", blur); game.dispose(); controller.current = null; if (import.meta.env.DEV) Reflect.deleteProperty(window, "__waysideFury"); };
  }, []);
  useEffect(() => {
    // Safari must opt into the full display before env(safe-area-inset-*) can
    // reserve the notch/home indicator around HUD and controls.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute("content");
    const settings = (original ?? "width=device-width, initial-scale=1").split(",").map(setting => setting.trim()).filter(setting => !setting.startsWith("viewport-fit="));
    meta.setAttribute("content", [...settings, "viewport-fit=cover"].join(", "));
    return () => { if (original === null) meta.removeAttribute("content"); else meta.setAttribute("content", original); };
  }, []);
  useEffect(() => {
    const update = () => setViewport({ height: window.visualViewport?.height ?? window.innerHeight, width: window.visualViewport?.width ?? window.innerWidth, top: window.visualViewport?.offsetTop ?? 0, left: window.visualViewport?.offsetLeft ?? 0 });
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update); update();
    return () => { window.visualViewport?.removeEventListener("resize", update); window.visualViewport?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  useEffect(() => {
    if (!reward) return;
    const timer = window.setTimeout(() => setReward(0), 2800);
    return () => window.clearTimeout(timer);
  }, [reward]);
  useEffect(() => {
    if (!saveToast) return;
    const timer = window.setTimeout(() => setSaveToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [saveToast]);
  useEffect(() => {
    if (characterOpen && mode !== "touch" && !document.activeElement?.closest(".wf-character")) document.querySelector<HTMLButtonElement>(".wf-character button")?.focus();
  }, [characterOpen, mode]);
  const send = (input: Partial<Input>) => controller.current?.setTouch(input);
  const hero = activeHero(state);

  const partner = nextPartyHero(state);
  const cinematic = !!state.film || state.scene === "prologue" || state.scene === "shift" || state.scene === "results";
  const beat = PROLOGUE[state.cutscene] ?? PROLOGUE[0];
  const progressScore = (state.areas.length + state.bosses.length) * 1000 + (state.character.level - 1) * 100 + state.clearedRooms.length * 50;
  const boss = state.enemies.find(e => e.kind === "boss");
  const target = state.contextAttack.target;
  const actionPrompt = state.contextAttack.displayed;
  useLayoutEffect(() => showAttackPresentation(actionPrompt), [actionPrompt]);
  const touchControls = mode === "touch" && playing && !paused && !state.overlay && !cinematic && state.scene !== "dead";
  const storyTitles = { backstory: "THE CREW MADE IT HOME.", years: "FIVE YEARS LATER", bbq: "A QUIET LIFE", dark: "SOMETHING IN THE SKY", portal: "THE REAL EVIL ARRIVES", suitup: "GEAR UP", taxi: "THE BLAST SITE" };
  const storyEyebrows = { backstory: "THE STORY SO FAR", years: "A QUIET LIFE", bbq: "WAYSIDE · FIVE YEARS LATER", dark: "OUT PAST THE OLD ROAD", portal: "A FLICKER THROUGH THE CRACK", suitup: "JOE · MATT · ALEX · JON", taxi: "CHAPTER 1" };
  const quit = () => { setCoopOpen(false); exitRef.current(); coopRef.current?.leave(); playingRef.current = false; pausedRef.current = false; controller.current?.showTitle(); setPlaying(false); setPaused(false); setCharacterOpen(false); setCollectionOpen(false); setControls(false); setSettingsOpen(false); };
  const connectCoop = async (kind: "create" | "join", code?: string) => {
    if (!signedIn || loadingSave || loadingAvatar || coopBusy || !coopRef.current) return;
    setCoopBusy(true);
    try {
      await coopRef.current.connect(kind, code);
      if (!playingRef.current) {
        const next = saveRef.current ? restoreSave(saveRef.current) : newGame();
        if (!saveRef.current) enterScene(next, "hub");
        playingRef.current = true; next.difficulty = settingsRef.current.difficulty ?? "normal"; controller.current?.start(next); setPlaying(true);
      }
      if (avatar) coopRef.current.setAvatar(avatar);
      pausedRef.current = true; setPaused(true); controller.current?.setPaused(true);
    } catch (error) { setSaveToast(error instanceof Error ? error.message : "Could not join co-op."); }
    finally { setCoopBusy(false); }
  };
  const coopJoinRef = useRef(connectCoop); coopJoinRef.current = connectCoop;
  useEffect(() => {
    if (!joinCode.current || !signedIn || loadingSave || loadingAvatar || autoJoined.current) return;
    autoJoined.current = true; setCoopOpen(true); void coopJoinRef.current("join", joinCode.current);
  }, [signedIn, loadingSave, loadingAvatar]);
  const closeCoop = () => { setCoopOpen(false); if (playingRef.current) { pausedRef.current = false; setPaused(false); controller.current?.setPaused(false); } };
  const reviveTarget = state.coop?.remoteHeroes.find(peer => peer.hero.hp <= 0 && peer.scene === state.scene && peer.room === state.room && Math.hypot(peer.x - state.x, peer.y - state.y) < 32);
  const showTutorial = tutorial && playing && !loadingSave && !loadingAvatar && !cinematic && !paused && !state.overlay && !state.dialogue && !target;
  const dismissTutorial = () => updateSettings({ ...settingsRef.current, controls: { ...settingsRef.current.controls, tutorialDismissed: true } });
  dismissTutorialRef.current = dismissTutorial;
  useEffect(() => {
    if (!playing || cinematic || !state.notice) { setNoticeVisible(false); return; }
    setNoticeVisible(true);
    const timer = window.setTimeout(() => setNoticeVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, [state.notice, playing, cinematic]);
  useEffect(() => {
    if (!showTutorial) return;
    const epoch = accountEpochRef.current;
    const timer = window.setTimeout(() => { if (epoch === accountEpochRef.current) dismissTutorialRef.current(); }, 7000);
    return () => window.clearTimeout(timer);
  }, [showTutorial, accountEpoch]);
  const atWorldStop = !state.film && !state.enemies.length && !state.dialogue && !state.overlay && (state.scene === "hub" && Math.hypot(state.x-480,state.y-440)<64 || state.scene === "overworld" && [...LOCATIONS,...COUNTY_STOPS].some(stop=>Math.hypot(state.x-stop.x,state.y-stop.y)<64) || ["space-launch","blast-0"].includes(state.mapId) && (()=>{const m=getMap(state.mapId);return !!m&&Math.hypot(state.x-m.spawn.x,state.y-m.spawn.y)<64;})());
  const openWorldRoute = () => { if (!atWorldStop || state.coop) return; worldRouteRef.current=true; controller.current?.setTouch({}); controller.current?.mutate(s=>{s.checkpointMapId=s.mapId;persist(s);}); controller.current?.setPaused(true); controller.current?.setPresentationSuspended(true); setWorldRoute(true); };
  const closeWorldRoute = () => { controller.current?.setPresentationSuspended(false); worldRouteRef.current=false; setWorldRoute(false); controller.current?.setTouch({}); controller.current?.setPaused(pausedRef.current); };
  const landWorldRoute = (destination: GlobeDestination) => {
    const game=controller.current; if(!game)return;
    game.mutate(s=>{if(!globeAvailable(s,destination))return;if(enterCampaignMap(s,destination.mapId)){s.checkpointMapId=destination.mapId;s.notice=`County Cruiser arrived at ${destination.name}.`;persist(s);}});
    closeWorldRoute();
  };
  const inlineSave = playing && !cinematic && !paused && !state.overlay && !coopOpen && state.scene !== "dead";
  return <main onPointerDown={event => { if (event.pointerType === "touch") controller.current?.setTouch({}); }} className={`wf-shell ${(coopOpen || playing && (paused || state.overlay || state.scene === "dead")) ? "wf-has-modal" : ""} ${coopRoom ? "wf-in-coop" : ""} ${touchControls && !coopOpen ? "wf-has-touch" : ""} ${cinematic && playing ? "wf-cinematic" : "wf-gameplay"} ${state.scene === "prologue" && playing ? "wf-prologue" : ""}`} style={{ "--wf-viewport-height": `${viewport.height}px`, "--wf-viewport-width": `${viewport.width}px`, top: viewport.top, left: viewport.left } as CSSProperties}>
    {worldRoute && playing && <GlobeTravel state={state} avatar={avatar} mode={graphicsMode} onMode={updateGraphics} onLand={landWorldRoute} onClose={closeWorldRoute} />}
    {!inlineSave && !state.film && <span className={`wf-save-status wf-save-${syncStatus}`} role="status">{SAVE_LABELS[syncStatus]}</span>}
    {saveToast && <div className="wf-save-toast" role="status">{saveToast}</div>}
    {(loadingSave || loadingAvatar) && playing && <div className="wf-sync-loading">Loading your character…</div>}
    <SceneSurface canvas={canvas} presentation={playing ? presentation : null} onTouch={() => send({})} soundBlocked={soundBlocked} onSound={() => controller.current?.unlockAudio()} />
    {!playing ? <div className="wf-overlay wf-menu">
      <p className="wf-eyebrow">8 BIT EVIL RETURNS PRESENTS</p><h1>WAYSIDE<br /><span>FURY</span></h1>
      <p className="wf-tagline">Five years later, the real evil arrives.</p>
      <div className="wf-crew">{HERO_IDS.map(id => <div key={id}><HeroPortrait id={id} avatar={avatar} /><small>{HERO_NAMES[id]}</small></div>)}</div>
      <div className="wf-title-actions"><button className="wf-primary" disabled={loadingSave || loadingAvatar} onClick={() => begin()}>{loadingSave ? "Loading your save…" : loadingAvatar ? "Loading your look…" : saved ? "Continue adventure" : "Begin adventure"}</button><button className="wf-secondary" disabled={resetDisabled} onClick={requestNewGame}>New Game</button></div>
      <button className="wf-secondary" disabled={loadingSave || loadingAvatar} onClick={() => setCoopOpen(true)}>Co-op</button>
      <div className="wf-menu-options"><button className="wf-secondary" onClick={() => { setControls(!controls); setSettingsOpen(false); }}>Controls</button><button className="wf-secondary" onClick={() => { setSettingsOpen(!settingsOpen); setControls(false); }}>Settings</button></div>
      {controls && <Controls mode={mode} />}{settingsOpen && <GraphicsSettings mode={graphicsMode} status={graphicsStatus} onChange={updateGraphics} onNewGame={requestNewGame} resetDisabled={resetDisabled} difficulty={settings.difficulty ?? "normal"} onDifficulty={difficulty => updateSettings({ ...settingsRef.current, difficulty })} inCoop={!!state.coop} hardUnlocked={state.clearedRooms.includes("realm-0") || state.bosses.includes("blast-watcher")} />}<p className="wf-small">Chapter 1 · The Blast Site</p>
    </div> : <>
      {!cinematic && <header className="wf-hud" aria-label="Hero status"><div className="wf-hero-hud">
        {partner ? <button className="wf-tag-partner wf-hud-faces" aria-label={`Swap to ${HERO_NAMES[partner]}`} disabled={state.heroes[partner].hp <= 0} onClick={() => controller.current?.mutate(requestSwap)}><HeroPortrait id={state.active} avatar={avatar} className="wf-hud-portrait" /><HeroPortrait id={partner} avatar={avatar} className="wf-tag-face" /></button> : <span className="wf-hud-faces"><HeroPortrait id={state.active} avatar={avatar} className="wf-hud-portrait" /></span>}
        <strong>{HERO_NAMES[state.active]} <small>LV {state.character.level}</small></strong>
        <Meter value={hero.hp} max={hero.maxHp} kind="hp">HP {Math.ceil(hero.hp)}/{hero.maxHp}</Meter>
        <Meter value={hero.ki} max={hero.maxKi} kind="ki">KI {Math.floor(hero.ki)}/{hero.maxKi}</Meter>
      </div>
        <button className="wf-pause" aria-label="Pause" onClick={togglePause}>Ⅱ</button>
      </header>}
      {!cinematic && !paused && coopRoom && <div className="wf-party-hud" aria-label="Party HP">{coopRoom.players.map(player => {
        const peer = state.coop?.remoteHeroes.find(p => p.seat === player.seat), h = player.seat === coopRoom.seat ? hero : peer?.hero;
        return <div key={player.seat}><strong>{player.name}{!player.connected ? " · Offline" : h?.hp === 0 ? " · Down" : ""}</strong><Meter value={h?.hp ?? 0} max={h?.maxHp ?? 1} kind="hp" /></div>;
      })}</div>}
      {!cinematic && <div className="wf-play-band">
        {inlineSave && (syncStatus === "saving" || syncStatus === "offline" || syncStatus === "unavailable") && <span className={`wf-save-status wf-save-${syncStatus}`} role="status">{SAVE_LABELS[syncStatus]}</span>}
        {showTutorial && mode !== "touch" && !paused && !state.overlay && !actionPrompt.target && <span className="wf-action-hint" aria-label={actionPrompt.label}><ActionIcon action="attack" glyph={actionPrompt.glyph} /><PromptGlyph mode={mode} action="attack" />{actionPrompt.label}</span>}
        {state.coop?.downed && <p className="wf-notice">You are down. A teammate can hold their interact control nearby to revive you.</p>}
        {reviveTarget && !state.coop?.downed && !paused && <button className="wf-revive-prompt" onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); send({ interact: true }); }} onPointerUp={() => send({ interact: false })} onPointerCancel={() => send({ interact: false })} onLostPointerCapture={() => send({ interact: false })} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); send({ interact: true }); } }} onKeyUp={() => send({ interact: false })}>Hold to revive {reviveTarget.name}</button>}
        {atWorldStop && !paused && !worldRoute && <button className="wf-world-route" disabled={!!state.coop} onClick={openWorldRoute}>{state.coop ? "World route · solo only for now" : "World route · County Cruiser"}</button>}
        {boss && <div className="wf-boss-hud"><strong>{boss.woodsBehavior === "foreman" ? "THE FOREMAN" : boss.woodsBehavior === "bailiff" ? "BRIAR BAILIFF" : boss.behavior === "architect" ? "THE ARCHITECT" : boss.behavior === "switchmaster" ? "SWITCHMASTER" : boss.behavior === "warden" ? "APOGEE WARDEN" : boss.behavior === "inspector" ? "CHEESE INSPECTOR" : boss.miniBoss ? "THE SENTINEL" : "THE WATCHER"} {boss.phase === 2 ? "· ENRAGED" : ""}</strong><Meter value={boss.hp} max={boss.maxHp} kind="boss" /><small>{boss.woodsBehavior ? boss.woodsBehavior === "foreman" && boss.phase === 2 && !boss.shieldBroken ? "BREAK HOUSINGS · HOLD KI AT BOTH BYPASSES" : "Strike during recovery; watch for break-out bursts" : boss.behavior === "architect" || boss.behavior === "switchmaster" ? (boss.exposed ?? 0) > 0 ? "RELAY OPEN · COMBO / KI" : boss.behavior === "switchmaster" ? "KI-HIT THE SWITCH · STRIKE DURING RECOVERY" : "KI-HIT A RELAY · AVOID THE BROKEN SIGIL" : boss.behavior ? boss.phase === 2 && !boss.shieldBroken && boss.behavior === "warden" ? "GROUND THE THREE PYLONS" : "Watch the body tell; strike during recovery" : "Watch the body tell; strike during recovery"}</small></div>}
        {reward > 0 && <div className="wf-reward" role="status">Checkpoint · +{reward} progress reported</div>}
        {actionPrompt.target && !(noticeVisible && state.notice) && !(state.coop && (state.coop.downed || hero.hp <= 0)) && !actionPrompt.target.id.startsWith("coop-revive-") && !state.overlay && !state.dialogue && !paused && mode !== "touch" && <button className="wf-interact-prompt" onClick={() => controller.current?.mutate(s => interact(s))}><ActionIcon action="attack" glyph={actionPrompt.glyph} /><PromptGlyph mode={mode} action="attack" />{actionPrompt.target.locked ? `${actionPrompt.label} · Taken over` : actionPrompt.label}</button>}
        {target && !(noticeVisible && state.notice) && actionPrompt.action !== "interact" && !target.id.startsWith("coop-revive-") && !state.coop?.downed && !state.overlay && !state.dialogue && !paused && <button className="wf-interact-prompt" onClick={() => controller.current?.mutate(s => interact(s))}><ActionIcon action="attack" glyph={target.kind} /><PromptGlyph mode={mode} />{target.name}</button>}
        {noticeVisible && state.notice && !showTutorial && !state.overlay && !state.dialogue && !paused && <p className="wf-notice" key={state.notice} role="status">{state.notice}</p>}
        {showTutorial && <div className="wf-hint"><span>{mode === "gamepad" ? "A tap/hold attack · X ki · B dash · RT guard · LB swap" : mode === "touch" ? "Drag to move. Hold Attack, then release for a charged strike. Hold Ki for your signature." : "WASD move · tap/hold J attack · hold K signature · L dash · Shift guard · Q/E swap"}</span><button aria-label="Dismiss tutorial" onClick={dismissTutorial}>×</button></div>}
      </div>}
      {state.overlay === "shop" && <div className="wf-overlay wf-place-panel"><p className="wf-eyebrow">WAYSIDE GENERAL STORE</p><h2>Spend a little sweetness.</h2><p>◈ {state.candy} candy · Power {hero.power} · Defense {hero.defense}</p>
        {SHOP_ITEMS.map(item => <button key={item.id} disabled={state.candy < item.cost || item.id === "heal" && hero.hp === hero.maxHp} onClick={() => controller.current?.mutate(s => { if (buyItem(s, item.id)) { controller.current?.itemGet(); persist(s); } })}><strong>{item.name} · {item.cost} candy</strong><small>{item.description}</small></button>)}
        <p className="wf-small" role="status">{state.notice}</p><button className="wf-secondary" onClick={() => controller.current?.mutate(s => { s.overlay = null; })}>Leave shop</button></div>}
      {state.overlay === "home" && <div className="wf-overlay wf-place-panel"><p className="wf-eyebrow">THERE'S STILL A LIGHT ON</p><h2>Home, sweet Wayside.</h2><p>Rest restores the crew and sets your retry save.</p><button onClick={() => controller.current?.mutate(s => { restAtHome(s); })}>Rest & save</button>
        <div className="wf-party"><p className="wf-small">Choose one or two heroes. Rest to recover benched heroes.</p>{HERO_IDS.map(id => <button key={id} className={`wf-secondary ${state.party.includes(id) ? "wf-in-party" : ""}`} aria-pressed={state.party.includes(id)} onClick={() => controller.current?.mutate(s => { if (toggleParty(s, id)) persist(s); })}><HeroPortrait id={id} avatar={avatar} />{HERO_NAMES[id]} · {state.party.includes(id) ? "IN PARTY" : "BENCH"}</button>)}</div>
        <p className="wf-small" role="status">{state.notice}</p><button className="wf-secondary" onClick={() => controller.current?.mutate(s => { s.overlay = null; })}>Leave home</button></div>}
      {touchControls && !coopOpen && <div className="wf-touch-dock"><Stick send={send} sensitivity={settings.controls.stickSensitivity} /><div className="wf-action-buttons">
        <TouchButton action="swap" label="Swap hero" send={send} /><TouchButton action="guard" label="Guard (hold)" send={send} />
        <TouchButton action="dash" label="Dash" send={send} /><TouchButton action="ki" label="Ki blast (hold to charge)" send={send} /><TouchButton action="attack" label="Attack" send={send} prompt={actionPrompt} />
      </div></div>}
      {state.mapId.startsWith("moon-") && !state.film && !paused && <p className="wf-oxygen" role="status">{state.oxygen <= 0 ? "Reserve air — refill when convenient" : `Air ${Math.ceil(state.oxygen)}% · Free air posts`}</p>}
      {state.film && !paused && <section className="wf-space-film" aria-label="Space film captions">
        <p>{sampleSpaceFilm(state.film.id,state.film.elapsed,state.campaignMilestones.includes("prism-lens")||state.coop?.worldCampaignMilestones?.includes("prism-lens")===true).shot.caption}</p>
        <div><button onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);send({guard:true});}} onPointerUp={()=>send({guard:false})} onPointerCancel={()=>send({guard:false})} onLostPointerCapture={()=>send({guard:false})} onKeyDown={e=>{if(e.key===" "||e.key==="Enter")send({guard:true});}} onKeyUp={()=>send({guard:false})}>Hold Skip · {Math.round(state.filmSkipHeld*100)}%{state.coop ? " · party vote" : ""}</button>
        <button onClick={()=>controller.current?.mutate(s=>{s.filmCaptionHold=!s.filmCaptionHold;s.filmHold=s.filmCaptionHold;})}>Hold captions: {state.filmHold ? "on" : "off"}</button></div>
      </section>}
      {state.dialogue && !paused && <section className="wf-dialogue wf-world-dialogue" aria-label={`${state.dialogue.speaker} dialogue`} role="dialog">
        <div><strong>{state.dialogue.speaker}</strong><p>{state.dialogue.lines[state.dialogue.index]}</p><button onClick={() => controller.current?.mutate(advanceDialogue)}><ActionIcon action="attack" glyph="next" /><PromptGlyph mode={mode} action="attack" />{state.dialogue.index < state.dialogue.lines.length - 1 ? "Next" : "Continue"}</button></div>
      </section>}
      {state.scene === "prologue" && !paused && <>
        <button className="wf-skip wf-secondary" onClick={() => controller.current?.mutate(skipPrologue)}>Skip prologue</button>
        <div className="wf-story-title" key={beat.phase}><p className="wf-eyebrow">{storyEyebrows[beat.phase]}</p><h2>{storyTitles[beat.phase]}</h2></div>
        <section className="wf-dialogue" aria-label="Story dialogue">
          {beat.hero && <span className="wf-portrait" style={{ backgroundImage:`url(/mystery-crypt/portraits/${beat.hero}.png)`, backgroundPosition:`-${beat.frame * 72}px 0` }} />}
          <div><strong>{beat.speaker}</strong><p>{beat.text}</p><button onClick={() => controller.current?.mutate(advanceStory)}><ActionIcon action="attack" glyph="next" /><PromptGlyph mode={mode} action="attack" />{state.cutscene === PROLOGUE.length - 1 ? "Drive out" : "Next"}</button></div>
        </section>
      </>}
      {state.scene === "shift" && <div className="wf-shift-caption"><p className="wf-eyebrow">A FLICKER THROUGH THE CRACK</p><h2>THE WORLD IS BREAKING.</h2><p>"That egg... wait! The portal's pulling us in!"</p><strong>ENTERING THE 8-BIT REALM</strong></div>}
      {state.scene === "results" && <div className="wf-overlay wf-results"><p className="wf-eyebrow">CHAPTER 1 COMPLETE</p>{state.sceneTimer < 2.2 ? <h2 className="wf-tbc">TO BE<br /><span>CONTINUED</span></h2> : <><h2>Beyond the flicker.</h2><p>The Architect's Creation is still sleeping.</p><p className="wf-result-score">{progressScore.toLocaleString()} <small>progress score</small></p><div className="wf-result-stats"><span>{state.kills}<small>Enemies defeated</small></span><span>LV {state.character.level}<small>Crew level</small></span><span>{state.deaths}<small>Deaths</small></span><span>◈ {state.candy}<small>Candy</small></span></div><p className="wf-small">The taken-over areas open in later chapters.</p><button onClick={quit}>Back to menu</button></>}</div>}
      {state.scene === "dead" && (state.sceneTimer >= 0.65 || paused) && <div className="wf-overlay"><p className="wf-eyebrow">THE CREW FELL</p><h2>GAME OVER</h2><p>Your next attempt starts at your last HOME save.</p><button onClick={() => begin(true)}>Retry from HOME</button><button className="wf-secondary" onClick={quit}>Quit</button></div>}
      {paused && characterOpen && state.scene !== "dead" && <CharacterSheet state={state} avatar={avatar} settings={settings} mode={mode} onSettings={updateSettings} onParty={id => controller.current?.mutate(s => { if (toggleParty(s, id, true)) persist(s); })} onBack={() => setCharacterOpen(false)} />}
      {paused && collectionOpen && state.scene !== "dead" && <Collection state={state} onBack={() => setCollectionOpen(false)} />}
      {paused && settingsOpen && state.scene !== "dead" && <div className="wf-overlay wf-pause-panel"><GraphicsSettings mode={graphicsMode} status={graphicsStatus} onChange={updateGraphics} onNewGame={requestNewGame} resetDisabled={resetDisabled} difficulty={settings.difficulty ?? "normal"} onDifficulty={difficulty => updateSettings({ ...settingsRef.current, difficulty })} inCoop={!!state.coop} hardUnlocked={state.clearedRooms.includes("realm-0") || state.bosses.includes("blast-watcher")} /><button className="wf-secondary" onClick={() => setSettingsOpen(false)}>Back</button></div>}
      {paused && !characterOpen && !collectionOpen && !settingsOpen && state.scene !== "dead" && <div className="wf-overlay wf-pause-panel"><p className="wf-eyebrow">TAKE A BREATHER</p><h2>Paused</h2>{settings.showWorldClock !== false && <WorldClock state={state} />}<label className="wf-small"><input type="checkbox" checked={settings.showWorldClock !== false} onChange={e => updateSettings({ ...settingsRef.current, showWorldClock: e.target.checked })} /> Show county clock</label><p className="wf-pause-summary">LV {state.character.level} · ◈ {state.candy} candy · {SAVE_LABELS[syncStatus]}</p><div className="wf-pause-actions"><button onClick={togglePause}>Resume</button><button className="wf-secondary" onClick={() => setCharacterOpen(true)}>Character</button><button className="wf-secondary" onClick={() => setCollectionOpen(true)}>Collection</button><button className="wf-secondary" onClick={() => setSettingsOpen(true)}>Settings</button><button className="wf-secondary" onClick={() => setCoopOpen(true)}>Co-op</button><button className="wf-secondary" onClick={quit}>Quit to menu</button></div><Controls mode={mode} /><p className="wf-small"><PromptGlyph mode={mode} /> Resume · Esc / Start pause</p></div>}
    </>}
    {coopOpen && <CoopMenu signedIn={signedIn} room={coopRoom} busy={coopBusy} initialCode={joinCode.current} onHost={() => { void connectCoop("create"); }} onJoin={code => { void connectCoop("join", code); }} onLeave={() => { persist(controller.current!.state); coopRef.current?.leave(); closeCoop(); }} onBack={closeCoop} />}
    {newGameConfirm && <div ref={resetDialog} className="wf-overlay wf-new-game-confirm" role="alertdialog" aria-modal="true" aria-labelledby="wf-new-game-title" aria-describedby="wf-new-game-warning" aria-busy={newGameBusy}>
      <h2 id="wf-new-game-title">Start a new game?</h2>
      <p id="wf-new-game-warning">Start a new game? Your current progress will be erased.</p>
      <p>Your Collection and lore cards will be kept.</p>
      <button className="wf-secondary" disabled={newGameBusy} onClick={() => setNewGameConfirm(false)}>Cancel</button>
      <button disabled={newGameBusy} onClick={() => { void confirmNewGame(); }}>{newGameBusy ? "Starting new game…" : "Start New Game"}</button>
      {newGameError && <p role="alert">{newGameError}</p>}
    </div>}
  </main>;
}
