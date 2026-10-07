import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import { CharacterSheet } from "./CharacterSheet";
import { HeroPortrait } from "./HeroPortrait";
import { loadHeroAvatar, type HeroAvatar } from "./game/avatar";
import { GameController } from "./game/controller";
import { type InputMode } from "./game/input";
import { type RenderPresentation } from "./game/render";
import { HERO_IDS, HERO_NAMES, nextPartyHero, requestSwap, activeHero, advanceStory, buyItem, enterScene, interact, interactTarget, newGame, restAtHome, skipPrologue, toggleParty, xpForLevel, type GameState, type Input } from "./game/sim";
import { PROLOGUE, SHOP_ITEMS } from "./game/content";
import { getWorld } from "./game/world";
import { progressReport, readSave, restoreSave, makeSave, type SaveSettings } from "./game/save";
import { connectSaveStore } from "./store";
import type { CloudSaveStore, SaveStatus } from "./game/cloud";
import "./style.css";
const DEFAULT_SETTINGS: SaveSettings = { musicVolume: .6, sfxVolume: .8, controls: { tutorialDismissed: false, stickSensitivity: 1 } };
const SAVE_LABELS: Record<SaveStatus, string> = { loading: "Loading save…", saving: "Saving…", saved: "Saved", local: "Saved on this device", offline: "Offline, saved on this device", unavailable: "Save unavailable, keep this tab open" };
const TUTORIAL_KEY = "wayside-fury-controls-dismissed";
function tutorialVisible() { try { return localStorage.getItem(TUTORIAL_KEY) !== "1"; } catch { return true; } }
function Controls({ mode }: { mode: InputMode }) {
  return <section className="wf-controls-panel" aria-label="Controls">
    <h2>Controls</h2>
    <dl><dt>Move</dt><dd>WASD / arrows · left stick / d-pad</dd>
      <dt>Attack</dt><dd>J · A / Cross · 3-hit combo</dd>
      <dt>Ki</dt><dd>K · X / Square · tap: blast, hold: charge</dd>
      <dt>Signature</dt><dd>Release Ki at a full bar for your hero's beam</dd>
      <dt>Dash / Guard</dt><dd>L / Shift · B / Circle / RT or RB</dd>
      <dt>Swap</dt><dd>Q / E · LB / Y · Tag partner</dd>
      <dt>Interact / Pause</dt><dd>Enter / Esc · A / Cross / Start</dd></dl>
    <p>{mode === "touch" ? "Use the stick and buttons below. Hold Ki or Guard while moving." : "Controllers connect automatically. Charge somewhere safe."}</p>
  </section>;
}
function PromptGlyph({ mode }: { mode: InputMode }) {
  if (mode === "touch") return null;
  const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected);
  const glyph = /playstation|dualshock|dualsense|sony/i.test(pad?.id ?? "") ? "✕" : /switch|nintendo/i.test(pad?.id ?? "") ? "B" : "A";
  return mode === "keyboard" ? <kbd aria-hidden="true">↵</kbd> : <span className="wf-pad-glyph" aria-hidden="true">{glyph}</span>;
}
function SceneSurface({ canvas, presentation, onTouch, layoutKey }: { canvas: RefObject<HTMLCanvasElement>; presentation: RenderPresentation | null; onTouch: () => void; layoutKey: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const node = stage.current!;
    const resize = () => {
      const { width, height } = node.getBoundingClientRect();
      setScale(Math.max(1, Math.floor(Math.min(width / 320, (height - parseFloat(getComputedStyle(node).paddingBottom)) / 180))));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node); resize();
    return () => observer.disconnect();
  }, [layoutKey]);
  return <div className="wf-stage" ref={stage}>
    <div className="wf-scene-surface" style={{ width: 320 * scale, height: 180 * scale }}>
      <canvas ref={canvas} onPointerDown={e => { if (e.pointerType === "touch") onTouch(); }} aria-label="Wayside Fury action RPG" />
      <div className="wf-scene-labels" aria-hidden="true">{presentation?.labels.map(label => <span key={label.id}
        className={`wf-scene-label wf-label-${label.kind}`} style={{ left: `clamp(${Math.min(220, label.text.length * 7 + 16) / 2}px, ${label.x * 100}%, calc(100% - ${Math.min(220, label.text.length * 7 + 16) / 2}px))`, top: `clamp(40px, ${label.y * 100}%, 100%)`, color: label.color, opacity: label.opacity, transform: `translate(-50%, -100%) scale(${label.scale ?? 1})` }}>{label.text}</span>)}</div>
    </div>
    <p className="wf-rotate-hint">↻ Rotate for the best view · playable in portrait</p>
  </div>;
}
function ActionIcon({ action }: { action: keyof Input }) {
  const paths: Partial<Record<keyof Input, ReactNode>> = {
    attack: <><path d="m7 21 14-14 3-5-5 3L5 19" /><path d="m5 15 8 8M3 25l4-4" /></>,
    ki: <><circle cx="15" cy="15" r="6" /><path d="M15 1v5m0 18v5M1 15h5m18 0h5M5 5l4 4m12 12 4 4M25 5l-4 4M9 21l-4 4" /></>,
    dash: <><path d="m9 5 10 10L9 25m9-20 10 10-10 10M1 10h5m-5 10h5" /></>,
    guard: <path d="M15 2 26 7v9c0 7-11 12-11 12S4 23 4 16V7L15 2Z" />,
    swap: <><path d="M4 10h21l-5-5m5 5-5 5M26 21H5l5 5m-5-5 5-5" /></>,
  };
  return <svg viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[action]}</svg>;
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
function TouchButton({ action, label, send }: { action: keyof Input; label: string; send: (input: Partial<Input>) => void }) {
  const pointer = useRef<number | null>(null);
  const [held, setHeld] = useState(false);
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null; setHeld(false); send({ [action]: false });
  };
  return <button className={`wf-touch-btn wf-${action} ${held ? "wf-held" : ""}`} aria-label={label} aria-pressed={held} onPointerDown={e => {
    e.preventDefault(); if (pointer.current !== null) return;
    pointer.current = e.pointerId; setHeld(true); e.currentTarget.setPointerCapture(e.pointerId); send({ [action]: true });
  }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}><ActionIcon action={action} /></button>;
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
  const [state, setState] = useState<GameState>(newGame);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [controls, setControls] = useState(false);
  const [mode, setMode] = useState<InputMode>(navigator.maxTouchPoints > 0 ? "touch" : "keyboard");
  const [reward, setReward] = useState(0);
  const [presentation, setPresentation] = useState<RenderPresentation | null>(null);
  const [viewport, setViewport] = useState({ height: window.visualViewport?.height ?? window.innerHeight, width: window.visualViewport?.width ?? window.innerWidth, top: window.visualViewport?.offsetTop ?? 0 });
  const [tutorial, setTutorial] = useState(tutorialVisible);
  const handlers = useRef({ pause: () => {}, confirm: (): boolean => false, navigate: (direction: number, axis?: "horizontal" | "vertical") => { void direction; void axis; } });
  const begin = (retry = false) => { if (loadingSave || loadingAvatar) return; playingRef.current = true; pausedRef.current = false; const next = saveRef.current ? restoreSave(saveRef.current, retry || saveRef.current.party.every(id => saveRef.current!.heroes[id].hp <= 0)) : newGame(); if (!saveRef.current) enterScene(next, "prologue"); controller.current?.start(next); setPlaying(true); setPaused(false); setCharacterOpen(false); setControls(false); };
  const persist = (s: GameState, home = false, credit = false) => {
    const store = storeRef.current;
    if (!store?.ready) return;
    const report = credit ? progressReport(s, store.save?.lastReported) : null;
    const next = makeSave(s, store.save, home, report?.receipt);
    if (next && !store.persist({ ...next, settings: settingsRef.current }, !!report?.score)) s.notice = "Saving is unavailable in this browser. Keep this tab open.";
  };
  const updateSettings = (next: SaveSettings) => {
    settingsRef.current = next; setSettings(next); setTutorial(!next.controls.tutorialDismissed);
    const store = storeRef.current, game = controller.current;
    if (!store?.ready || !game) return;
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
  const togglePause = () => { if (!playing || loadingSave || loadingAvatar) return; const next = !paused; if (!next) setCharacterOpen(false); pausedRef.current = next; controller.current?.setPaused(next); setPaused(next); };
  const overlayControls = () => {
    const overlays = document.querySelectorAll<HTMLElement>(".wf-overlay");
    const overlay = overlays[overlays.length - 1];
    return overlay ? Array.from(overlay.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button:not(:disabled), input[type=range]:not(:disabled)")) : [];
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
    const game = new GameController(canvas.current!, {onState: setState, onInputMode: setMode, onPresentation: setPresentation,
      onPause: () => handlers.current.pause(), onConfirm: () => handlers.current.confirm(), onNavigate: (direction, axis) => handlers.current.navigate(direction, axis),
      onEvent: (s, event) => {
        if (event.type !== "checkpoint" && event.type !== "death") return;
        const store = storeRef.current;
        if (!store?.ready) return;
        const report = progressReport(s, store.save?.lastReported);
        const next = makeSave(s, store.save, event.type === "checkpoint" && event.id === "home", report.receipt);
        if (next && !store.persist({ ...next, settings: settingsRef.current }, report.score > 0)) s.notice = "Saving is unavailable in this browser. Keep this tab open.";
      }});
    controller.current = game;
    let mounted = true;
    let avatarAccount: string | null | undefined;
    let avatarAbort: AbortController | null = null;
    let saveReady = false, avatarReady = false;
    const resumeWhenReady = () => game.setPaused(pausedRef.current || !playingRef.current || !saveReady || !avatarReady);
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
        saveReady = ready; saveRef.current = save; setSaved(save); setSyncStatus(status); setLoadingSave(!ready);
        if (!ready && playingRef.current) game.setPaused(true);
        if (ready) {
          const nextSettings = save?.settings ?? { ...DEFAULT_SETTINGS, controls: { ...DEFAULT_SETTINGS.controls, tutorialDismissed: connected.store.userId === null && !tutorialVisible() } };
          settingsRef.current = nextSettings; setSettings(nextSettings); setTutorial(!nextSettings.controls.tutorialDismissed);
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
          game.start(next); resumeWhenReady();
        }
        if (reason === "conflict") setSaveToast("A newer account save was loaded.");
      },
      onCredit: score => {
        if (score <= 0) return;
        window.parent.postMessage({ type: "PLAYER_DIED", score }, window.location.origin);
        if (mounted) setReward(score);
      },
    }, () => {
      exitRef.current(); avatarAbort?.abort(); avatarAccount = undefined;
      avatarReady = false; saveReady = false; setCharacterOpen(false); setLoadingAvatar(true); game.setPaused(true);
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
    const update = () => setViewport({ height: window.visualViewport?.height ?? window.innerHeight, width: window.visualViewport?.width ?? window.innerWidth, top: window.visualViewport?.offsetTop ?? 0 });
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
  const cinematic = state.scene === "prologue" || state.scene === "shift" || state.scene === "results";
  const beat = PROLOGUE[state.cutscene] ?? PROLOGUE[0];
  const progressScore = (state.areas.length + state.bosses.length) * 1000 + (state.character.level - 1) * 100 + state.clearedRooms.length * 50;
  const boss = state.enemies.find(e => e.kind === "boss");
  const target = interactTarget(state);
  const touchControls = mode === "touch" && playing && !paused && !state.overlay && !cinematic && state.scene !== "dead";
  const storyTitles = { backstory: "THE CREW MADE IT HOME.", years: "FIVE YEARS LATER", bbq: "A QUIET LIFE", dark: "SOMETHING IN THE SKY", portal: "THE REAL EVIL ARRIVES", suitup: "GEAR UP", taxi: "THE BLAST SITE" };
  const storyEyebrows = { backstory: "THE STORY SO FAR", years: "A QUIET LIFE", bbq: "WAYSIDE · FIVE YEARS LATER", dark: "OUT PAST THE OLD ROAD", portal: "A FLICKER THROUGH THE CRACK", suitup: "JOE · MATT · ALEX · JON", taxi: "CHAPTER 1" };
  const quit = () => { exitRef.current(); playingRef.current = false; pausedRef.current = false; controller.current?.setPaused(true); setPlaying(false); setPaused(false); setCharacterOpen(false); setControls(false); };
  const dismissTutorial = () => updateSettings({ ...settingsRef.current, controls: { ...settingsRef.current.controls, tutorialDismissed: true } });
  return <main onPointerDown={event => { if (event.pointerType === "touch") controller.current?.setTouch({}); }} className={`wf-shell ${touchControls ? "wf-has-touch" : ""} ${cinematic && playing ? "wf-cinematic" : "wf-gameplay"} ${state.scene === "prologue" && playing ? "wf-prologue" : ""}`} style={{ "--wf-viewport-height": `${viewport.height}px`, top: viewport.top } as CSSProperties}>
    <span className={`wf-save-status wf-save-${syncStatus} ${playing && !cinematic && !paused && !state.overlay ? "wf-save-in-game" : ""}`} role="status">{SAVE_LABELS[syncStatus]}</span>
    {saveToast && <div className="wf-save-toast" role="status">{saveToast}</div>}
    {(loadingSave || loadingAvatar) && playing && <div className="wf-sync-loading">Loading your character…</div>}
    <SceneSurface canvas={canvas} presentation={playing ? presentation : null} onTouch={() => send({})} layoutKey={JSON.stringify([playing, paused, mode, cinematic, touchControls, state.cutscene, state.room, state.overlay, state.notice, target?.id, !!boss, tutorial, !!reward, viewport.width, viewport.height])} />
    {!playing ? <div className="wf-overlay wf-menu">
      <p className="wf-eyebrow">8 BIT EVIL RETURNS PRESENTS</p><h1>WAYSIDE<br /><span>FURY</span></h1>
      <p className="wf-tagline">Five years later, the real evil arrives.</p>
      <div className="wf-crew">{HERO_IDS.map(id => <div key={id}><HeroPortrait id={id} avatar={avatar} /><small>{HERO_NAMES[id]}</small></div>)}</div>
      <button className="wf-primary" disabled={loadingSave || loadingAvatar} onClick={() => begin()}>{loadingSave ? "Loading your save…" : loadingAvatar ? "Loading your look…" : saved ? "Continue adventure" : "Begin adventure"}</button>
      <button className="wf-secondary" onClick={() => setControls(!controls)}>Controls</button>
      {controls && <Controls mode={mode} />}<p className="wf-small">Chapter 1 · The Blast Site · Early access</p>
    </div> : <>
      {!cinematic && <header className="wf-hud"><div className="wf-hero-hud"><strong><span className="wf-hero-name"><HeroPortrait id={state.active} avatar={avatar} />{HERO_NAMES[state.active]}</span> <small>LV {state.character.level}</small></strong>
        <Meter value={hero.hp} max={hero.maxHp} kind="hp">HP {Math.ceil(hero.hp)} / {hero.maxHp}</Meter>
        <Meter value={hero.ki} max={hero.maxKi} kind="ki">KI {Math.floor(hero.ki)} / {hero.maxKi}</Meter>
        <Meter value={hero.stamina} max={hero.maxStamina} kind="stamina" />
        <div className="wf-partner">{partner ? <button className="wf-tag-partner" aria-label={`Swap to ${HERO_NAMES[partner]}`} disabled={state.heroes[partner].hp <= 0} onClick={() => controller.current?.mutate(requestSwap)}><HeroPortrait id={partner} avatar={avatar} />{HERO_NAMES[partner]} · {Math.ceil(state.heroes[partner].hp)} HP ↔</button> : "SOLO PARTY"} <span>XP {state.character.xp}/{xpForLevel(state.character.level)}</span></div></div>
        <div className="wf-status"><span>◈ {state.candy} candy</span><small>{getWorld(state.scene, state.room).name}</small></div>
        <button className="wf-pause" aria-label="Pause" onClick={togglePause}>Ⅱ</button>
        {boss && <div className="wf-boss-hud"><strong>{boss.miniBoss ? "THE SENTINEL" : "THE WATCHER"} {boss.phase === 2 ? "· ENRAGED" : ""}</strong><Meter value={boss.hp} max={boss.maxHp} kind="boss" /><small>{boss.windup > 0 ? boss.pattern % 2 === 0 ? "RUSH — DASH ASIDE" : "RADIAL BLAST — GUARD OR DASH" : "Chapter 1 guardian"}</small></div>}
      </header>}
      {!cinematic && <div className="wf-play-band">
        {reward > 0 && <div className="wf-reward" role="status">Checkpoint · +{reward} progress reported</div>}
        {target && !state.overlay && !paused && <button className="wf-interact-prompt" onClick={() => controller.current?.mutate(s => interact(s))}><PromptGlyph mode={mode} />{target.locked ? `${target.name} · Taken over` : target.name}</button>}
        {state.notice && !state.overlay && !paused && <p className="wf-notice" role="status">{state.notice}</p>}
        {tutorial && !paused && !state.overlay && !target && <div className="wf-hint"><span>{mode === "gamepad" ? "A attack · X ki · B dash · RT guard · LB swap" : mode === "touch" ? "Drag left to move. Hold the spark to charge Ki." : "WASD move · J attack · hold K charge · L dash · Shift guard · Q/E swap"}</span><button aria-label="Dismiss tutorial" onClick={dismissTutorial}>×</button></div>}
      </div>}
      {state.overlay === "shop" && <div className="wf-overlay wf-place-panel"><p className="wf-eyebrow">WAYSIDE GENERAL STORE</p><h2>Spend a little sweetness.</h2><p>◈ {state.candy} candy · Power {hero.power} · Defense {hero.defense}</p>
        {SHOP_ITEMS.map(item => <button key={item.id} disabled={state.candy < item.cost || item.id === "heal" && hero.hp === hero.maxHp} onClick={() => controller.current?.mutate(s => { if (buyItem(s, item.id)) persist(s); })}><strong>{item.name} · {item.cost} candy</strong><small>{item.description}</small></button>)}
        <p className="wf-small" role="status">{state.notice}</p><button className="wf-secondary" onClick={() => controller.current?.mutate(s => { s.overlay = null; })}>Leave shop</button></div>}
      {state.overlay === "home" && <div className="wf-overlay wf-place-panel"><p className="wf-eyebrow">THERE'S STILL A LIGHT ON</p><h2>Home, sweet Wayside.</h2><p>Rest restores the crew and sets your retry save.</p><button onClick={() => controller.current?.mutate(s => { restAtHome(s); })}>Rest & save</button>
        <div className="wf-party"><p className="wf-small">Choose one or two heroes. Rest to recover benched heroes.</p>{HERO_IDS.map(id => <button key={id} className={`wf-secondary ${state.party.includes(id) ? "wf-in-party" : ""}`} aria-pressed={state.party.includes(id)} onClick={() => controller.current?.mutate(s => { if (toggleParty(s, id)) persist(s); })}><HeroPortrait id={id} avatar={avatar} />{HERO_NAMES[id]} · {state.party.includes(id) ? "IN PARTY" : "BENCH"}</button>)}</div>
        <p className="wf-small" role="status">{state.notice}</p><button className="wf-secondary" onClick={() => controller.current?.mutate(s => { s.overlay = null; })}>Leave home</button></div>}
      {touchControls && <div className="wf-touch-dock"><Stick send={send} sensitivity={settings.controls.stickSensitivity} /><div className="wf-action-buttons">
        <TouchButton action="swap" label="Swap hero" send={send} /><TouchButton action="guard" label="Guard (hold)" send={send} />
        <TouchButton action="dash" label="Dash" send={send} /><TouchButton action="ki" label="Ki blast (hold to charge)" send={send} /><TouchButton action="attack" label="Attack" send={send} />
      </div></div>}
      {state.scene === "prologue" && !paused && <>
        <button className="wf-skip wf-secondary" onClick={() => controller.current?.mutate(skipPrologue)}>Skip prologue</button>
        <div className="wf-story-title" key={beat.phase}><p className="wf-eyebrow">{storyEyebrows[beat.phase]}</p><h2>{storyTitles[beat.phase]}</h2></div>
        <section className="wf-dialogue" aria-label="Story dialogue">
          {beat.hero && <span className="wf-portrait" style={{ backgroundImage:`url(/mystery-crypt/portraits/${beat.hero}.png)`, backgroundPosition:`-${beat.frame * 72}px 0` }} />}
          <div><strong>{beat.speaker}</strong><p>{beat.text}</p><button onClick={() => controller.current?.mutate(advanceStory)}><PromptGlyph mode={mode} />{state.cutscene === PROLOGUE.length - 1 ? "Drive out" : "Next"}</button></div>
        </section>
      </>}
      {state.scene === "shift" && <div className="wf-shift-caption"><p className="wf-eyebrow">A FLICKER THROUGH THE CRACK</p><h2>THE WORLD IS BREAKING.</h2><p>"That egg... wait! The portal's pulling us in!"</p><strong>ENTERING THE 8-BIT REALM</strong></div>}
      {state.scene === "results" && <div className="wf-overlay wf-results"><p className="wf-eyebrow">CHAPTER 1 COMPLETE</p>{state.sceneTimer < 2.2 ? <h2 className="wf-tbc">TO BE<br /><span>CONTINUED</span></h2> : <><h2>Beyond the flicker.</h2><p>The Architect's Creation is still sleeping.</p><p className="wf-result-score">{progressScore.toLocaleString()} <small>progress score</small></p><div className="wf-result-stats"><span>{state.kills}<small>Enemies defeated</small></span><span>LV {state.character.level}<small>Crew level</small></span><span>{state.deaths}<small>Deaths</small></span><span>◈ {state.candy}<small>Candy</small></span></div><p className="wf-small">The taken-over areas open in later chapters.</p><button onClick={quit}>Back to menu</button></>}</div>}
      {state.scene === "dead" && (state.sceneTimer >= 0.65 || paused) && <div className="wf-overlay"><p className="wf-eyebrow">THE CREW FELL</p><h2>GAME OVER</h2><p>Your next attempt starts at your last HOME save.</p><button onClick={() => begin(true)}>Retry from HOME</button><button className="wf-secondary" onClick={quit}>Quit</button></div>}
      {paused && characterOpen && state.scene !== "dead" && <CharacterSheet state={state} avatar={avatar} settings={settings} mode={mode} onSettings={updateSettings} onParty={id => controller.current?.mutate(s => { if (toggleParty(s, id, true)) persist(s); })} onBack={() => setCharacterOpen(false)} />}
      {paused && !characterOpen && state.scene !== "dead" && <div className="wf-overlay wf-pause-panel"><p className="wf-eyebrow">TAKE A BREATHER</p><h2>Paused</h2><button onClick={togglePause}>Resume</button><button className="wf-secondary" onClick={() => setCharacterOpen(true)}>Character</button><Controls mode={mode} /><button className="wf-secondary" onClick={quit}>Quit to menu</button><p className="wf-small"><PromptGlyph mode={mode} /> Resume · Esc / Start pause</p></div>}
    </>}
  </main>;
}
