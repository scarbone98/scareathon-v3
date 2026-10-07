import { useEffect, useRef, useState, type PointerEvent } from "react";
import { GameController } from "./game/controller";
import { type InputMode } from "./game/input";
import { activeHero, advanceStory, buyItem, enterScene, interact, interactTarget, newGame, restAtHome, skipPrologue, type GameState, type Input } from "./game/sim";
import { PROLOGUE, SHOP_ITEMS } from "./game/content";
import { readSave, restoreSave, writeSave } from "./game/save";
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
function Stick({ send }: { send: (input: Partial<Input>) => void }) {
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== drag.current?.id) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    const length = Math.hypot(dx, dy); const scale = 34 / Math.max(34, length);
    const x = dx * scale, y = dy * scale;
    setOffset({ x, y }); send({ x: x / 34, y: y / 34 });
  };
  const release = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== drag.current?.id) return;
    drag.current = null; setOffset({x: 0, y: 0}); send({x: 0, y: 0});
  };
  return <div className="wf-stick" role="group" aria-label="Movement stick" onPointerDown={e => {
    if (drag.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { id: e.pointerId, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    e.currentTarget.setPointerCapture(e.pointerId); move(e);
  }} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    <span className="wf-stick-cross">✛</span><span className="wf-stick-thumb" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} />
  </div>;
}
function TouchButton({ action, children, send }: { action: keyof Input; children: string; send: (input: Partial<Input>) => void }) {
  const pointer = useRef<number | null>(null);
  const [held, setHeld] = useState(false);
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null; setHeld(false); send({ [action]: false });
  };
  return <button className={`wf-touch-btn wf-${action} ${held ? "wf-held" : ""}`} onPointerDown={e => {
    e.preventDefault(); if (pointer.current !== null) return;
    pointer.current = e.pointerId; setHeld(true); e.currentTarget.setPointerCapture(e.pointerId); send({ [action]: true });
  }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>{children}</button>;
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
  const [tutorial, setTutorial] = useState(tutorialVisible);
  const handlers = useRef({ pause: () => {}, confirm: () => {} });
  const begin = (retry = false) => { const next = saveRef.current ? restoreSave(saveRef.current, retry || Object.values(saveRef.current.heroes).every(h => h.hp <= 0)) : newGame(); if (!saveRef.current) enterScene(next, "prologue"); controller.current?.start(next); setPlaying(true); setPaused(false); setControls(false); };
  const persist = (s: GameState, home = false) => {
    const next = writeSave(s, saveRef.current, home);
    if (next) { saveRef.current = next; setSaved(next); }
    else s.notice = "Saving is unavailable in this browser. Keep this tab open.";
  };
  const togglePause = () => { if (!playing) return; const next = !paused; controller.current?.setPaused(next); setPaused(next); };
  handlers.current = { pause: togglePause, confirm: () => { if (!playing) begin(); else if (paused) togglePause(); } };
  useEffect(() => {
    const game = new GameController(canvas.current!, {onState: setState, onInputMode: setMode,
      onPause: () => handlers.current.pause(), onConfirm: () => handlers.current.confirm(),
      onEvent: (s, event) => {
        if (event.type === "checkpoint" || event.type === "death") {
          const next = writeSave(s, saveRef.current);
          if (next) { saveRef.current = next; setSaved(next); }
          else s.notice = "Saving is unavailable in this browser. Keep this tab open.";
        }
      }});
    controller.current = game;
    if (import.meta.env.DEV) Object.defineProperty(window, "__waysideFury", { value: game, configurable: true });
    const hidden = () => { if (document.hidden) { game.setPaused(true); setPaused(true); } };
    const blur = () => { game.setPaused(true); setPaused(true); };
    document.addEventListener("visibilitychange", hidden); window.addEventListener("blur", blur);
    return () => { document.removeEventListener("visibilitychange", hidden); window.removeEventListener("blur", blur); game.dispose(); controller.current = null; if (import.meta.env.DEV) Reflect.deleteProperty(window, "__waysideFury"); };
  }, []);
  const send = (input: Partial<Input>) => controller.current?.setTouch(input);
  const hero = activeHero(state);
  const cinematic = state.scene === "prologue" || state.scene === "shift" || state.scene === "results";
  const beat = PROLOGUE[state.cutscene] ?? PROLOGUE[0];
  const progressScore = (state.areas.length + state.bosses.length) * 1000 + (Math.max(state.heroes.joe.level, state.heroes.matt.level) - 1) * 100 + state.clearedRooms.length * 50;
  const boss = state.enemies.find(e => e.kind === "boss");
  const target = interactTarget(state);
  const prompt = mode === "gamepad" ? "[A / Cross]" : mode === "touch" ? "[Interact]" : "[Enter]";
  const quit = () => { controller.current?.setPaused(true); setPlaying(false); setPaused(false); setControls(false); };
  const dismissTutorial = () => { setTutorial(false); try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch { /* Session-only when storage is blocked. */ } };
  return <main className={`wf-shell ${mode === "touch" && playing && !paused && !state.overlay && !cinematic ? "wf-has-touch" : ""}`}>
    <div className="wf-stage"><canvas ref={canvas} aria-label="Wayside Fury action RPG" /></div>
    {!playing ? <div className="wf-overlay wf-menu">
      <p className="wf-eyebrow">8 BIT EVIL RETURNS PRESENTS</p><h1>WAYSIDE<br /><span>FURY</span></h1>
      <p className="wf-tagline">Five years later, the real evil arrives.</p>
      <div className="wf-crew">{["joe", "matt", "alex", "jon"].map((id,i) => <div key={id} className={i > 1 ? "wf-locked" : ""}><span className="wf-menu-sprite" style={{ backgroundImage:`url(${i < 2 ? "/royale/" : "/royale/ui/"}${id}_idle.png)` }} /><small>{id.toUpperCase()}{i > 1 ? " · LOCKED" : ""}</small></div>)}</div>
      <button className="wf-primary" onClick={() => begin()}>{saved ? "Continue adventure" : "Begin adventure"}</button>
      <button className="wf-secondary" onClick={() => setControls(!controls)}>Controls</button>
      {controls && <Controls mode={mode} />}<p className="wf-small">Chapter 1 · The Blast Site · Early access</p>
    </div> : <>
      {!cinematic && <header className="wf-hud"><div className="wf-hero-hud"><strong>{state.active.toUpperCase()} <small>LV {hero.level}</small></strong>
        <div className="wf-meter wf-hp"><span style={{width:`${hero.hp / hero.maxHp * 100}%`}} /><small>HP {Math.ceil(hero.hp)} / {hero.maxHp}</small></div>
        <div className="wf-meter wf-ki"><span style={{width:`${hero.ki / hero.maxKi * 100}%`}} /><small>KI {Math.floor(hero.ki)} / {hero.maxKi}</small></div>
        <div className="wf-meter wf-stamina"><span style={{width:`${hero.stamina / hero.maxStamina * 100}%`}} /></div></div>
        <div className="wf-status"><span>◈ {state.candy} candy</span><small>{state.scene === "test" ? "TRAINING YARD" : state.scene === "dungeon" ? ["THE IMPACT", "BREACH APPROACH", "THE WATCHER"][state.room] : state.scene.toUpperCase()}</small></div>
        <button className="wf-pause" aria-label="Pause" onClick={togglePause}>Ⅱ</button></header>}
      {boss && <div className="wf-boss-hud"><strong>THE WATCHER {boss.phase === 2 ? "· ENRAGED" : ""}</strong><div className="wf-meter"><span style={{width:`${boss.hp / boss.maxHp * 100}%`}} /></div><small>{boss.windup > 0 ? boss.pattern % 2 === 0 ? "RUSH — DASH ASIDE" : "RADIAL BLAST — GUARD OR DASH" : "Chapter 1 guardian"}</small></div>}
      {target && !state.overlay && <button className="wf-interact-prompt" onClick={() => controller.current?.mutate(s => interact(s))}>{prompt} {target.locked ? "Taken over" : target.name}</button>}
      {state.overlay === "shop" && <div className="wf-overlay wf-place-panel"><p className="wf-eyebrow">WAYSIDE GENERAL STORE</p><h2>Spend a little sweetness.</h2><p>◈ {state.candy} candy · Power {hero.power} · Defense {hero.defense}</p>
        {SHOP_ITEMS.map(item => <button key={item.id} disabled={state.candy < item.cost || item.id === "heal" && hero.hp === hero.maxHp} onClick={() => controller.current?.mutate(s => { if (buyItem(s, item.id)) persist(s); })}><strong>{item.name} · {item.cost} candy</strong><small>{item.description}</small></button>)}
        <p className="wf-small" role="status">{state.notice}</p><button className="wf-secondary" onClick={() => controller.current?.mutate(s => { s.overlay = null; })}>Leave shop</button></div>}
      {state.overlay === "home" && <div className="wf-overlay wf-place-panel"><p className="wf-eyebrow">THERE'S STILL A LIGHT ON</p><h2>Home, sweet Wayside.</h2><p>Rest restores the crew and sets your retry save.</p><button onClick={() => controller.current?.mutate(s => { restAtHome(s); persist(s, true); })}>Rest & save</button>
        <div className="wf-party"><p className="wf-small">Choose who leads the party. Joe + Matt travel together.</p>{(["joe", "matt", "alex", "jon"] as const).map(id => <button key={id} disabled={id === "alex" || id === "jon"} className="wf-secondary" onClick={() => controller.current?.mutate(s => { if (id === "joe" || id === "matt") { s.active = id; persist(s); } })}>{id.toUpperCase()}{id === "alex" || id === "jon" ? " · LOCKED" : state.active === id ? " · LEAD" : ""}</button>)}</div>
        <p className="wf-small" role="status">{state.notice}</p><button className="wf-secondary" onClick={() => controller.current?.mutate(s => { s.overlay = null; })}>Leave home</button></div>}
      {state.notice && !state.overlay && !cinematic && <p className="wf-notice" role="status">{state.notice}</p>}
      {tutorial && !paused && !state.overlay && !cinematic && <div className="wf-hint"><span>{mode === "gamepad" ? "A attack · X ki · B dash · RT guard · LB swap" : mode === "touch" ? "Move + Attack. Hold Ki; release full bar for a beam." : "WASD move · J attack · hold K charge · L dash · Shift guard · Q/E swap"}</span><button aria-label="Dismiss tutorial" onClick={dismissTutorial}>×</button></div>}
      {mode === "touch" && !paused && !state.overlay && !cinematic && state.scene !== "dead" && <div className="wf-touch-dock"><Stick send={send} /><div className="wf-action-buttons">
        <TouchButton action="swap" send={send}>Swap</TouchButton><TouchButton action="guard" send={send}>Guard</TouchButton>
        <TouchButton action="dash" send={send}>Dash</TouchButton><TouchButton action="ki" send={send}>Ki (hold)</TouchButton><TouchButton action="attack" send={send}>Attack</TouchButton>
        <TouchButton action="interact" send={send}>Interact</TouchButton></div></div>}
      {state.scene === "prologue" && !paused && <>
        <button className="wf-skip wf-secondary" onClick={() => controller.current?.mutate(skipPrologue)}>Skip prologue</button>
        {(beat.phase === "backstory" || beat.phase === "years") && <div className="wf-story-title"><p className="wf-eyebrow">{beat.phase === "backstory" ? "THE STORY SO FAR" : "A QUIET LIFE"}</p><h2>{beat.phase === "years" ? <>FIVE YEARS<br /><span>LATER</span></> : <>THE CREW<br /><span>MADE IT HOME.</span></>}</h2></div>}
        <section className="wf-dialogue" aria-label="Story dialogue">
          {beat.hero && <span className="wf-portrait" style={{ backgroundImage:`url(/mystery-crypt/portraits/${beat.hero}.png)`, backgroundPosition:`-${beat.frame * 72}px 0` }} />}
          <div><strong>{beat.speaker}</strong><p>{beat.text}</p><button onClick={() => controller.current?.mutate(advanceStory)}>{prompt} {state.cutscene === PROLOGUE.length - 1 ? "Drive out" : "Next"}</button></div>
        </section>
      </>}
      {state.scene === "shift" && <div className="wf-shift-caption"><p className="wf-eyebrow">A FLICKER THROUGH THE CRACK</p><h2>THE WORLD IS BREAKING.</h2><p>"That egg... wait! The portal's pulling us in!"</p><strong>ENTERING THE 8-BIT REALM</strong></div>}
      {state.scene === "results" && <div className="wf-overlay wf-results"><p className="wf-eyebrow">CHAPTER 1 COMPLETE</p>{state.sceneTimer < 2.2 ? <h2 className="wf-tbc">TO BE<br /><span>CONTINUED</span></h2> : <><h2>Beyond the flicker.</h2><p>The Architect's Creation is still sleeping.</p><p className="wf-result-score">{progressScore.toLocaleString()} <small>progress score</small></p><div className="wf-result-stats"><span>{state.kills}<small>Enemies defeated</small></span><span>LV {hero.level}<small>Crew level</small></span><span>{state.deaths}<small>Deaths</small></span><span>◈ {state.candy}<small>Candy</small></span></div><p className="wf-small">Alex, Jon and the taken-over areas join the story in later chapters.</p><button onClick={quit}>Back to menu</button></>}</div>}
      {state.scene === "dead" && <div className="wf-overlay"><p className="wf-eyebrow">THE CREW FELL</p><h2>GAME OVER</h2><p>Your next attempt starts at your last HOME save.</p><button onClick={() => begin(true)}>Retry from HOME</button><button className="wf-secondary" onClick={quit}>Quit</button></div>}
      {paused && state.scene !== "dead" && <div className="wf-overlay"><p className="wf-eyebrow">TAKE A BREATHER</p><h2>Paused</h2><button onClick={togglePause}>Resume</button><Controls mode={mode} /><button className="wf-secondary" onClick={quit}>Quit to menu</button><p className="wf-small">{prompt} Resume · Esc / Start pause</p></div>}
    </>}
  </main>;
}
