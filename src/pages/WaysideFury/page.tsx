import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import { GameController } from "./game/controller";
import { type InputMode } from "./game/input";
import { type RenderPresentation } from "./game/render";
import { activeHero, advanceStory, buyItem, enterScene, interact, interactTarget, newGame, restAtHome, skipPrologue, toggleParty, type GameState, type Input } from "./game/sim";
import { PROLOGUE, SHOP_ITEMS } from "./game/content";
import { mergeReceipts, progressReport, readSave, restoreSave, writeSave } from "./game/save";
import "./style.css";
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
      <dt>Swap</dt><dd>Q / E · LB / Y · Joe ↔ Matt</dd>
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
function SceneSurface({ canvas, presentation, onTouch }: { canvas: RefObject<HTMLCanvasElement>; presentation: RenderPresentation | null; onTouch: () => void }) {
  return <div className="wf-stage">
    <div className="wf-scene-surface">
      <canvas ref={canvas} onPointerDown={e => { if (e.pointerType === "touch") onTouch(); }} aria-label="Wayside Fury action RPG" />
      <div className="wf-scene-labels" aria-hidden="true">{presentation?.labels.map(label => <span key={label.id}
        className={`wf-scene-label wf-label-${label.kind}`} style={{ left: `clamp(${Math.min(220, label.text.length * 7 + 16) / 2}px, ${label.x * 100}%, calc(100% - ${Math.min(220, label.text.length * 7 + 16) / 2}px))`, top: `clamp(40px, ${label.y * 100}%, 100%)`, color: label.color, opacity: label.opacity, transform: `translate(-50%, -100%) scale(${label.scale ?? 1})` }}>{label.text}</span>)}</div>
    </div>
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
function Stick({ send }: { send: (input: Partial<Input>) => void }) {
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0, dx: 0, dy: 0, active: false });
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== drag.current?.id) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
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
  const [state, setState] = useState<GameState>(newGame);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [controls, setControls] = useState(false);
  const [mode, setMode] = useState<InputMode>(navigator.maxTouchPoints > 0 ? "touch" : "keyboard");
  const [reward, setReward] = useState(0);
  const [presentation, setPresentation] = useState<RenderPresentation | null>(null);
  const [viewport, setViewport] = useState({ height: window.visualViewport?.height ?? window.innerHeight, width: window.visualViewport?.width ?? window.innerWidth, top: window.visualViewport?.offsetTop ?? 0, left: window.visualViewport?.offsetLeft ?? 0 });
  const [tutorial, setTutorial] = useState(tutorialVisible);
  const [noticeVisible, setNoticeVisible] = useState(false);
  const handlers = useRef({ pause: () => {}, confirm: (): boolean => false, navigate: (direction: number) => { void direction; } });
  const begin = (retry = false) => { const next = saveRef.current ? restoreSave(saveRef.current, retry || Object.values(saveRef.current.heroes).every(h => h.hp <= 0)) : newGame(); if (!saveRef.current) enterScene(next, "prologue"); controller.current?.start(next); setPlaying(true); setPaused(false); setControls(false); };
  const persist = (s: GameState, home = false) => {
    const next = writeSave(s, saveRef.current, home);
    if (next) { saveRef.current = next; setSaved(next); }
    else s.notice = "Saving is unavailable in this browser. Keep this tab open.";
  };
  const togglePause = () => { if (!playing) return; const next = !paused; controller.current?.setPaused(next); setPaused(next); };
  const overlayButtons = () => {
    const overlays = document.querySelectorAll<HTMLElement>(".wf-overlay");
    const overlay = overlays[overlays.length - 1];
    return overlay ? Array.from(overlay.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")) : [];
  };
  handlers.current = { pause: togglePause, confirm: () => {
    // Story and world confirmations are consumed by the simulation exactly once.
    const buttons = overlayButtons();
    if (!buttons.length) return false;
    const active = buttons.find(button => button === document.activeElement) ?? buttons[0];
    active.click(); return true;
  }, navigate: (direction: number) => {
    const buttons = overlayButtons(); if (!buttons.length) return;
    const index = buttons.findIndex(button => button === document.activeElement);
    buttons[(index < 0 ? direction > 0 ? 0 : buttons.length - 1 : (index + direction + buttons.length) % buttons.length)].focus();
  } };
  useEffect(() => {
    const game = new GameController(canvas.current!, {onState: setState, onInputMode: setMode, onPresentation: setPresentation,
      onPause: () => handlers.current.pause(), onConfirm: () => handlers.current.confirm(), onNavigate: direction => handlers.current.navigate(direction),
      onEvent: (s, event) => {
        if (event.type === "checkpoint" || event.type === "death") {
          const report = progressReport(s, mergeReceipts(saveRef.current?.lastReported, readSave()?.lastReported));
          const next = writeSave(s, saveRef.current, event.type === "checkpoint" && event.id === "home", report.receipt);
          if (next) {
            saveRef.current = next; setSaved(next);
            if (report.score > 0) {
              window.parent.postMessage({ type: "PLAYER_DIED", score: report.score }, window.location.origin);
              setReward(report.score);
            }
          }
          else s.notice = "Saving is unavailable in this browser. Keep this tab open.";
        }
      }});
    controller.current = game;
    if (import.meta.env.DEV) Object.defineProperty(window, "__waysideFury", { value: game, configurable: true });
    const preventGesture = (event: Event) => event.preventDefault();
    document.addEventListener("gesturestart", preventGesture, { passive: false });
    const hidden = () => { if (document.hidden) { game.setPaused(true); setPaused(true); } };
    const blur = () => { game.setPaused(true); setPaused(true); };
    document.addEventListener("visibilitychange", hidden); window.addEventListener("blur", blur);
    return () => { document.removeEventListener("gesturestart", preventGesture); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("blur", blur); game.dispose(); controller.current = null; if (import.meta.env.DEV) Reflect.deleteProperty(window, "__waysideFury"); };
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
  const send = (input: Partial<Input>) => controller.current?.setTouch(input);
  const hero = activeHero(state);
  const cinematic = state.scene === "prologue" || state.scene === "shift" || state.scene === "results";
  const beat = PROLOGUE[state.cutscene] ?? PROLOGUE[0];
  const progressScore = (state.areas.length + state.bosses.length) * 1000 + (Math.max(state.heroes.joe.level, state.heroes.matt.level) - 1) * 100 + state.clearedRooms.length * 50;
  const boss = state.enemies.find(e => e.kind === "boss");
  const target = interactTarget(state);
  const touchControls = mode === "touch" && playing && !paused && !state.overlay && !cinematic && state.scene !== "dead";
  const storyTitles = { backstory: "THE CREW MADE IT HOME.", years: "FIVE YEARS LATER", bbq: "A QUIET LIFE", dark: "SOMETHING IN THE SKY", portal: "THE REAL EVIL ARRIVES", suitup: "GEAR UP", taxi: "THE BLAST SITE" };
  const storyEyebrows = { backstory: "THE STORY SO FAR", years: "A QUIET LIFE", bbq: "WAYSIDE · FIVE YEARS LATER", dark: "OUT PAST THE OLD ROAD", portal: "A FLICKER THROUGH THE CRACK", suitup: "JOE · MATT · ALEX · JON", taxi: "CHAPTER 1" };
  const quit = () => { controller.current?.setPaused(true); setPlaying(false); setPaused(false); setControls(false); };
  const showTutorial = tutorial && playing && !cinematic && !paused && !state.overlay && !target;
  const dismissTutorial = () => { setTutorial(false); try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch { /* Session-only when storage is blocked. */ } };
  useEffect(() => {
    if (!playing || cinematic || !state.notice) { setNoticeVisible(false); return; }
    setNoticeVisible(true);
    const timer = window.setTimeout(() => setNoticeVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, [state.notice, playing, cinematic]);
  useEffect(() => {
    if (!showTutorial) return;
    const timer = window.setTimeout(() => {
      setTutorial(false);
      try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch { /* Session-only when storage is blocked. */ }
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [showTutorial]);
  return <main className={`wf-shell ${playing && (paused || state.overlay || state.scene === "dead") ? "wf-has-modal" : ""} ${touchControls ? "wf-has-touch" : ""} ${cinematic && playing ? "wf-cinematic" : "wf-gameplay"} ${state.scene === "prologue" && playing ? "wf-prologue" : ""}`} style={{ "--wf-viewport-height": `${viewport.height}px`, "--wf-viewport-width": `${viewport.width}px`, top: viewport.top, left: viewport.left } as CSSProperties}>
    <SceneSurface canvas={canvas} presentation={playing ? presentation : null} onTouch={() => send({})} />
    {!playing ? <div className="wf-overlay wf-menu">
      <p className="wf-eyebrow">8 BIT EVIL RETURNS PRESENTS</p><h1>WAYSIDE<br /><span>FURY</span></h1>
      <p className="wf-tagline">Five years later, the real evil arrives.</p>
      <div className="wf-crew">{["joe", "matt", "alex", "jon"].map((id,i) => <div key={id} className={i > 1 ? "wf-locked" : ""}><span className="wf-menu-sprite" style={{ backgroundImage:`url(${i < 2 ? "/royale/" : "/royale/ui/"}${id}_idle.png)` }} /><small>{id.toUpperCase()}{i > 1 ? " · LOCKED" : ""}</small></div>)}</div>
      <button className="wf-primary" onClick={() => begin()}>{saved ? "Continue adventure" : "Begin adventure"}</button>
      <button className="wf-secondary" onClick={() => setControls(!controls)}>Controls</button>
      {controls && <Controls mode={mode} />}<p className="wf-small">Chapter 1 · The Blast Site · Early access</p>
    </div> : <>
      {!cinematic && <header className="wf-hud" aria-label="Hero status"><div className="wf-hero-hud">
        <span className="wf-hud-portrait" aria-hidden="true" style={{ backgroundImage: `url(/mystery-crypt/portraits/${state.active}.png)` }} />
        <strong>{state.active.toUpperCase()} <small>LV {hero.level}</small></strong>
        <Meter value={hero.hp} max={hero.maxHp} kind="hp">HP {Math.ceil(hero.hp)}/{hero.maxHp}</Meter>
        <Meter value={hero.ki} max={hero.maxKi} kind="ki">KI {Math.floor(hero.ki)}/{hero.maxKi}</Meter>
      </div>
        <div className="wf-status" aria-label={`${state.candy} candy`}><span>◈ {state.candy}</span></div>
        <button className="wf-pause" aria-label="Pause" onClick={togglePause}>Ⅱ</button>
      </header>}
      {!cinematic && <div className="wf-play-band">
        {boss && <div className="wf-boss-hud"><strong>{boss.miniBoss ? "THE SENTINEL" : "THE WATCHER"} {boss.phase === 2 ? "· ENRAGED" : ""}</strong><Meter value={boss.hp} max={boss.maxHp} kind="boss" /><small>{boss.windup > 0 ? boss.pattern % 2 === 0 ? "RUSH — DASH ASIDE" : "RADIAL BLAST — GUARD OR DASH" : "Chapter 1 guardian"}</small></div>}
        {reward > 0 && <div className="wf-reward" role="status">Checkpoint · +{reward} progress reported</div>}
        {target && !state.overlay && !paused && <button className="wf-interact-prompt" onClick={() => controller.current?.mutate(s => interact(s))}><PromptGlyph mode={mode} />{target.locked ? `${target.name} · Taken over` : target.name}</button>}
        {noticeVisible && state.notice && !state.overlay && !paused && <p className="wf-notice" key={state.notice} role="status">{state.notice}</p>}
        {showTutorial && <div className="wf-hint"><span>{mode === "gamepad" ? "A attack · X ki · B dash · RT guard · LB swap" : mode === "touch" ? "Drag left to move. Hold the spark to charge Ki." : "WASD move · J attack · hold K charge · L dash · Shift guard · Q/E swap"}</span><button aria-label="Dismiss tutorial" onClick={dismissTutorial}>×</button></div>}
      </div>}
      {state.overlay === "shop" && <div className="wf-overlay wf-place-panel"><p className="wf-eyebrow">WAYSIDE GENERAL STORE</p><h2>Spend a little sweetness.</h2><p>◈ {state.candy} candy · Power {hero.power} · Defense {hero.defense}</p>
        {SHOP_ITEMS.map(item => <button key={item.id} disabled={state.candy < item.cost || item.id === "heal" && hero.hp === hero.maxHp} onClick={() => controller.current?.mutate(s => { if (buyItem(s, item.id)) persist(s); })}><strong>{item.name} · {item.cost} candy</strong><small>{item.description}</small></button>)}
        <p className="wf-small" role="status">{state.notice}</p><button className="wf-secondary" onClick={() => controller.current?.mutate(s => { s.overlay = null; })}>Leave shop</button></div>}
      {state.overlay === "home" && <div className="wf-overlay wf-place-panel"><p className="wf-eyebrow">THERE'S STILL A LIGHT ON</p><h2>Home, sweet Wayside.</h2><p>Rest restores the crew and sets your retry save.</p><button onClick={() => controller.current?.mutate(s => { restAtHome(s); })}>Rest & save</button>
        <div className="wf-party"><p className="wf-small">Choose your party. Keep one or two heroes; rest to recover benched heroes.</p>{(["joe", "matt", "alex", "jon"] as const).map(id => <button key={id} disabled={id === "alex" || id === "jon"} className="wf-secondary" onClick={() => controller.current?.mutate(s => { if (id === "joe" || id === "matt") { if (toggleParty(s, id)) persist(s); } })}>{id.toUpperCase()}{id === "alex" || id === "jon" ? " · LOCKED" : state.party.includes(id === "joe" || id === "matt" ? id : "joe") ? " · IN PARTY" : " · BENCH"}</button>)}</div>
        <p className="wf-small" role="status">{state.notice}</p><button className="wf-secondary" onClick={() => controller.current?.mutate(s => { s.overlay = null; })}>Leave home</button></div>}
      {touchControls && <div className="wf-touch-dock"><Stick send={send} /><div className="wf-action-buttons">
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
      {state.scene === "results" && <div className="wf-overlay wf-results"><p className="wf-eyebrow">CHAPTER 1 COMPLETE</p>{state.sceneTimer < 2.2 ? <h2 className="wf-tbc">TO BE<br /><span>CONTINUED</span></h2> : <><h2>Beyond the flicker.</h2><p>The Architect's Creation is still sleeping.</p><p className="wf-result-score">{progressScore.toLocaleString()} <small>progress score</small></p><div className="wf-result-stats"><span>{state.kills}<small>Enemies defeated</small></span><span>LV {hero.level}<small>Crew level</small></span><span>{state.deaths}<small>Deaths</small></span><span>◈ {state.candy}<small>Candy</small></span></div><p className="wf-small">Alex, Jon and the taken-over areas join the story in later chapters.</p><button onClick={quit}>Back to menu</button></>}</div>}
      {state.scene === "dead" && (state.sceneTimer >= 0.65 || paused) && <div className="wf-overlay"><p className="wf-eyebrow">THE CREW FELL</p><h2>GAME OVER</h2><p>Your next attempt starts at your last HOME save.</p><button onClick={() => begin(true)}>Retry from HOME</button><button className="wf-secondary" onClick={quit}>Quit</button></div>}
      {paused && state.scene !== "dead" && <div className="wf-overlay"><p className="wf-eyebrow">TAKE A BREATHER</p><h2>Paused</h2><button onClick={togglePause}>Resume</button><Controls mode={mode} /><button className="wf-secondary" onClick={quit}>Quit to menu</button><p className="wf-small"><PromptGlyph mode={mode} /> Resume · Esc / Start pause</p></div>}
    </>}
  </main>;
}
