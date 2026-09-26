import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button, Embers, Panel } from "../Royale/ui/parts";
import { ORANGE } from "../Royale/ui/theme";
import { GameController, type Hud, type StageResult } from "./game/controller";
import { ITEMS, MOVES, type ItemId } from "./game/data";
import { applyReport, progressScore, startingRoster, type Save } from "./game/save";
import { SaveStore } from "./store";
import Camp from "./ui/camp";
import { Bar, Candy, ItemIcon, MoveIcon, UnitSprite } from "./ui/parts";
import Result from "./ui/result";
import "./mystery.css";

// In dev, ?autoplay lets the bot play and ?floor=N starts deeper, for testing.
function devOptions() {
  if (!import.meta.env.DEV) return { floor: undefined, autoplay: false };
  const params = new URLSearchParams(window.location.search);
  return { floor: Number(params.get("floor")) || undefined, autoplay: params.has("autoplay") };
}

function HudBar({ hud, onPause }: { hud: Hud; onPause: () => void }) {
  const low = hud.hp < hud.maxHp * 0.3;
  return (
    <div className="pointer-events-none px-3 pt-2">
      <div className="flex items-center gap-2">
        <div className="cc-outline-sm shrink-0 rounded border-2 border-[#140a1c] bg-[#2a1638]/90 px-1.5 text-sm text-[#c88cff]">
          B{hud.floor}F<span className="text-[#ffe9c4]/60">/{hud.floors}</span>
        </div>
        <div className="cc-outline-sm min-w-0 flex-1 truncate text-sm text-[#ffe9c4]">{hud.stageName}</div>
        <Candy amount={hud.candy} className="cc-outline-sm text-sm" />
        <button type="button" onClick={onPause} aria-label="Pause" className="cc-sbtn cc-sbtn-stone pointer-events-auto px-0 text-xs">
          <span>II</span>
        </button>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="cc-outline-sm shrink-0 text-xs text-[#ffe9c4]">Lv {hud.level}</span>
        <span className={`cc-outline-sm text-xs ${low ? "text-[#ff5a6a]" : "text-[#7dffb0]"}`}>HP</span>
        <Bar value={hud.hp} max={hud.maxHp} from={low ? "#ff2d55" : "#3ad07a"} to={low ? "#ff8a1f" : "#7dffb0"} />
        <span className="cc-outline-sm w-14 text-right text-xs text-white">
          {hud.hp}/{hud.maxHp}
        </span>
      </div>
      <div className="mt-1 flex gap-1">
        {hud.party
          .filter((m) => !m.leader)
          .map((m) => (
            <div key={m.id} className="flex items-center gap-1 rounded border-2 border-[#140a1c] bg-[#1c1128]/85 px-1">
              <UnitSprite kind={m.kind} size={18} />
              <div className="flex flex-col">
                <span className="cc-outline-sm text-[9px] leading-none text-white">Lv{m.level}</span>
                <div className="mt-0.5 h-1 w-7 overflow-hidden rounded-sm bg-[#140a1c]">
                  <div className="h-full bg-[#ff9ad5]" style={{ width: `${(m.hp / m.maxHp) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
      </div>
      {hud.boss && (
        <div className="mx-auto mt-1.5 w-[85%]">
          <div className="cc-outline-sm text-center text-xs text-[#ff5a6a]">{hud.boss.name}</div>
          <Bar value={hud.boss.hp} max={hud.boss.maxHp} from="#ff2d55" to="#ff8a1f" className="h-2.5" />
        </div>
      )}
    </div>
  );
}

const SHORT = "[@media(max-height:640px)]";

function PadButton({ children, onDown, onUp, className = "", label, color = "stone" }: { children: ReactNode; onDown: () => void; onUp?: () => void; className?: string; label: string; color?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`cc-sbtn cc-sbtn-${color} cc-outline-sm flex items-center justify-center p-0 ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="flex items-center justify-center">{children}</span>
    </button>
  );
}

function Controls({ ctrl, hud, onBag }: { ctrl: GameController | null; hud: Hud; onBag: () => void }) {
  const hold = (dx: number, dy: number) => () => ctrl?.hold({ dx, dy });
  const release = () => ctrl?.hold(null);
  const pad = `h-11 w-11 text-base ${SHORT}:h-10 ${SHORT}:w-10`;
  return (
    <div className={`flex items-end justify-between gap-2 px-3 pb-3 pt-1 ${SHORT}:pb-2`}>
      <div className="grid shrink-0 grid-cols-3 grid-rows-3 gap-1">
        <span />
        <PadButton label="Up" className={pad} onDown={hold(0, -1)} onUp={release}>
          ▲
        </PadButton>
        <span />
        <PadButton label="Left" className={pad} onDown={hold(-1, 0)} onUp={release}>
          ◀
        </PadButton>
        <PadButton label="Hit" color="orange" className={`${pad} text-xs`} onDown={() => ctrl?.press({ type: "attack" })}>
          Hit
        </PadButton>
        <PadButton label="Right" className={pad} onDown={hold(1, 0)} onUp={release}>
          ▶
        </PadButton>
        <span />
        <PadButton label="Down" className={pad} onDown={hold(0, 1)} onUp={release}>
          ▼
        </PadButton>
        <span />
      </div>
      <div className="flex min-w-0 max-w-[190px] flex-1 flex-col gap-1">
        <div className="grid grid-cols-2 gap-1">
          {Array.from({ length: 4 }, (_, i) => hud.moves[i]).map((m, i) =>
            m ? (
              <PadButton key={i} label={MOVES[m.id].name} color="purple" className={`h-12 w-full px-1 ${SHORT}:h-11`} onDown={() => ctrl?.press({ type: "skill", slot: i })}>
                <MoveIcon move={m.id} size={28} dim={m.pp === 0} />
                <span className={`ml-1.5 text-xs ${m.pp === 0 ? "text-[#ff9a8a]" : "text-[#ffe9c4]"}`}>
                  {m.pp}
                  <span className="text-[10px] opacity-60">/{m.max}</span>
                </span>
              </PadButton>
            ) : (
              <div key={i} className={`h-12 rounded border-2 border-dashed border-[#ffe9c4]/15 ${SHORT}:h-11`} />
            )
          )}
        </div>
        <div className="grid grid-cols-2 gap-1">
          <Button color="green" onClick={onBag} className="py-0 text-sm">
            Bag {hud.bag.length}
          </Button>
          <PadButton label="Wait a turn" className="h-full text-sm" onDown={() => ctrl?.press({ type: "wait" })}>
            Wait
          </PadButton>
        </div>
      </div>
    </div>
  );
}

function Messages({ messages }: { messages: { id: number; text: string; color?: string }[] }) {
  return (
    <div className="pointer-events-none flex flex-col gap-0.5 px-3">
      {messages.map((m) => (
        <div key={m.id} className="cc-outline-sm mc-msg w-fit max-w-full rounded bg-[#0b0712]/75 px-2 py-0.5 text-[12px] leading-tight" style={{ color: m.color ?? "#ffe9c4" }}>
          {m.text}
        </div>
      ))}
    </div>
  );
}

function BagPanel({ bag, onUse, onClose }: { bag: ItemId[]; onUse: (slot: number) => void; onClose: () => void }) {
  const kinds = (Object.keys(ITEMS) as ItemId[]).filter((k) => bag.includes(k));
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b0712]/75 px-5 py-4" onClick={onClose}>
      <Panel className="cc-pop max-h-full w-full max-w-sm overflow-y-auto">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="cc-outline mb-2 text-center text-2xl text-[#ffcf4a]">Bag</div>
          {kinds.length === 0 && <p className="cc-outline-sm py-4 text-center text-[#ffe9c4]">Empty. Look for items on the floor, or buy some at camp.</p>}
          <ul className="space-y-2">
            {kinds.map((k) => (
              <li key={k} className="flex items-center gap-2 rounded border-2 border-[#140a1c] bg-[#1c1128]/80 p-2">
                <ItemIcon item={k} />
                <div className="min-w-0 flex-1">
                  <div className="cc-outline-sm text-white">
                    {ITEMS[k].name} <span className="text-[#ffcf4a]">×{bag.filter((b) => b === k).length}</span>
                  </div>
                  <div className="cc-outline-sm text-xs leading-tight text-[#ffe9c4]/80">{ITEMS[k].about}</div>
                </div>
                <Button color={k === "candycorn" ? "orange" : "green"} onClick={() => onUse(bag.indexOf(k))} className="shrink-0 px-3 py-0 text-base">
                  {k === "candycorn" ? "Throw" : "Use"}
                </Button>
              </li>
            ))}
          </ul>
          <Button color="stone" onClick={onClose} className="mt-3 w-full py-0 text-base">
            Close
          </Button>
        </div>
      </Panel>
    </div>
  );
}

type View = "loading" | "camp" | "playing" | "result";
type Message = { id: number; text: string; color?: string; at: number };

// Mystery Crypt: a Mystery Dungeon-style crawl. Clear stages of random floors
// one step at a time, recruit the monsters you beat, and level them up.
export default function MysteryCrypt() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef<SaveStore | null>(null);
  const [ctrl, setCtrl] = useState<GameController | null>(null);
  const [view, setView] = useState<View>("loading");
  const [save, setSave] = useState<Save | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [paused, setPaused] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [banner, setBanner] = useState<{ text: string; key: number; color: string } | null>(null);
  const [result, setResult] = useState<{ result: StageResult; before: Save; after: Save } | null>(null);
  const stageRef = useRef(0);
  const msgId = useRef(0);

  const addMessage = useCallback((text: string, color?: string) => {
    const id = ++msgId.current;
    setMessages((list) => [...list, { id, text, color, at: Date.now() }].slice(-3));
  }, []);

  const persist = useCallback((next: Save) => {
    setSave(next);
    storeRef.current?.persist(next);
  }, []);

  // A finished (or abandoned) stage goes into the save, and a better
  // progress score goes to the arcade's leaderboard.
  const finishStage = useCallback(
    (run: StageResult) => {
      const before = storeRef.current!.save;
      let after = applyReport(before, run.report);
      const score = progressScore(after);
      if (score > after.submitted) {
        // Inside the arcade cabinet, the arcade saves the score to the leaderboard
        if (window.parent !== window) window.parent.postMessage({ type: "PLAYER_DIED", score }, window.location.origin);
        after = { ...after, submitted: score };
      }
      persist(after);
      setResult({ result: run, before, after });
      setView("result");
    },
    [persist]
  );

  // Messages fade after a few seconds.
  useEffect(() => {
    if (!messages.length) return;
    const timer = window.setTimeout(() => setMessages((list) => list.filter((m) => Date.now() - m.at < 3800)), 1000);
    return () => window.clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 1500);
    return () => window.clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    const c = new GameController(hostRef.current!, canvasRef.current!, {
      onHud: setHud,
      onMessage: addMessage,
      onFloor: (floor, boss) => setBanner({ text: boss ? "BOSS FLOOR" : `B${floor}F`, key: Date.now(), color: boss ? "#ff5a6a" : "#c88cff" }),
      onOver: finishStage,
    });
    setCtrl(c);
    void c.start(null);
    let cancelled = false;
    void SaveStore.open((replaced) => setSave(replaced)).then((store) => {
      if (cancelled) return;
      storeRef.current = store;
      setSave(store.save);
      setView("camp");
    });
    return () => {
      cancelled = true;
      c.dispose();
    };
  }, [addMessage, finishStage]);

  // Keep the leader centred between the HUD and the controls.
  const hudShown = hud !== null;
  useLayoutEffect(() => {
    if (!ctrl) return;
    const update = () => {
      const playing = view === "playing";
      ctrl.setInsets(playing ? topRef.current?.offsetHeight ?? 0 : 0, playing ? bottomRef.current?.offsetHeight ?? 0 : 0);
    };
    update();
    const observer = new ResizeObserver(update);
    if (topRef.current) observer.observe(topRef.current);
    if (bottomRef.current) observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [ctrl, view, hudShown]);

  useEffect(() => {
    ctrl?.setPaused(paused || bagOpen);
  }, [ctrl, paused, bagOpen]);

  // Leaving the tab pauses a stage in progress.
  useEffect(() => {
    if (view !== "playing") return;
    const onHidden = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [view]);

  const enter = (stage: number) => {
    const current = storeRef.current?.save;
    if (!current || !ctrl) return;
    stageRef.current = stage;
    // Items go into the stage with you (and come back in the report).
    persist({ ...current, bag: [] });
    setResult(null);
    setHud(null);
    setPaused(false);
    setBagOpen(false);
    setMessages([]);
    setView("playing");
    const { floor, autoplay } = devOptions();
    void ctrl.start({ stage, roster: startingRoster(current), bag: current.bag, floor }, autoplay);
  };

  const toCamp = () => {
    setPaused(false);
    setBagOpen(false);
    setView("camp");
    setBanner(null);
    void ctrl?.start(null);
  };

  const retreat = () => {
    setPaused(false);
    const run = ctrl?.retreat();
    if (run) finishStage(run);
  };

  const takeItem = (slot: number) => {
    setBagOpen(false);
    ctrl?.setPaused(false);
    ctrl?.press({ type: "use", slot });
  };

  const modal = paused || bagOpen;
  return (
    <div className="cc-root fixed inset-0 z-50 flex justify-center bg-[#0b0712] text-white select-none" style={{ fontVariantLigatures: "none" }}>
      <div className="relative h-full w-full overflow-hidden" style={{ maxWidth: "min(100vw, calc(100dvh * 0.62))" }}>
        <div ref={hostRef} className="absolute inset-0 touch-none" style={view !== "playing" ? { filter: "brightness(0.4) saturate(1.1) blur(1.5px)" } : undefined}>
          <canvas ref={canvasRef} className="block" />
        </div>
        {(view === "camp" || view === "loading") && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0b0712]/70 via-transparent to-[#0b0712]/80" />
            <Embers count={8} />
          </>
        )}
        {view === "loading" && <p className="cc-outline-sm absolute inset-x-0 top-1/2 text-center text-[#ffe9c4]">Loading your crypt…</p>}
        {view === "camp" && save && <Camp save={save} signedIn={!!storeRef.current?.signedIn} onChange={persist} onEnter={enter} />}
        {view === "playing" && hud && (
          <>
            <div ref={topRef} className="absolute inset-x-0 top-0">
              <HudBar hud={hud} onPause={() => setPaused(true)} />
            </div>
            <div ref={bottomRef} className="absolute inset-x-0 bottom-0">
              {hud.onStairs && !modal && (
                <div className="flex justify-center pb-1.5">
                  <Button color="green" onClick={() => ctrl?.press({ type: "descend" })} className="cc-pop px-5 py-0.5 text-lg">
                    Go down the stairs ▼
                  </Button>
                </div>
              )}
              <Messages messages={messages} />
              <div className="mt-1 bg-gradient-to-t from-[#0b0712] via-[#0b0712]/90 to-transparent">
                <Controls ctrl={ctrl} hud={hud} onBag={() => setBagOpen(true)} />
              </div>
            </div>
          </>
        )}
        {view === "playing" && !hud && <p className="cc-outline-sm absolute inset-x-0 top-1/2 text-center text-[#ffe9c4]">Loading…</p>}
        {view === "playing" && banner && (
          <div key={banner.key} className="pointer-events-none absolute inset-x-0 top-[28%] flex justify-center">
            <div className="cc-count cc-title" style={{ fontSize: 54, color: banner.color, textShadow: "0 4px 0 #140a1c, 0 0 24px currentColor" }}>
              {banner.text}
            </div>
          </div>
        )}
        {view === "playing" && bagOpen && hud && <BagPanel bag={hud.bag} onUse={takeItem} onClose={() => setBagOpen(false)} />}
        {view === "playing" && paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0712]/75 px-6">
            <div className="cc-title" style={{ fontSize: 56, color: ORANGE, textShadow: "0 4px 0 #8a3a00, 0 8px 0 #140a1c" }}>
              PAUSED
            </div>
            <Button color="green" onClick={() => setPaused(false)} className="mt-6 w-full max-w-xs py-1 text-2xl">
              Resume
            </Button>
            <Button color="stone" onClick={retreat} className="mt-3 w-full max-w-xs py-0 text-base">
              Retreat to camp
            </Button>
            <p className="cc-outline-sm mt-2 max-w-xs text-center text-xs text-[#ffe9c4]/70">Retreating counts as fainting: you keep levels and recruits, but lose what you found.</p>
          </div>
        )}
        {view === "result" && result && <Result {...result} onCamp={toCamp} onNext={() => enter(result.result.report.cleared && result.result.report.stage + 1 === result.after.cleared ? result.after.cleared : stageRef.current)} />}
      </div>
    </div>
  );
}
