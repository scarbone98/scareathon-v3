import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button, Embers, Panel, Sprite } from "../Royale/ui/parts";
import { ORANGE, PURPLE } from "../Royale/ui/theme";
import { GameController, type Hud, type Member } from "./game/controller";
import { UNIT_SHEETS } from "./game/render";
import { HEROES, ITEMS, MAX_PARTY, unitName, type HeroId, type ItemId, type RunResult, type UnitKind } from "./game/sim";
import "./mystery.css";

const BEST_KEY = "mystery-crypt-best";
const HERO_KEY = "mystery-crypt-hero";

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score: number) {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Not remembered; fine.
  }
}

function loadHero(): HeroId {
  try {
    const saved = localStorage.getItem(HERO_KEY);
    if (saved && saved in HEROES) return saved as HeroId;
  } catch {
    // Fall through.
  }
  return "joe";
}

// In dev, /mystery-crypt?floor=8 starts deeper down and ?autoplay lets the
// bot play, for testing.
function devStart() {
  if (!import.meta.env.DEV) return { floor: undefined, autoplay: false };
  const params = new URLSearchParams(window.location.search);
  return { floor: Number(params.get("floor")) || undefined, autoplay: params.has("autoplay") };
}

const spriteOf = (kind: UnitKind) => {
  const s = UNIT_SHEETS[kind];
  return { url: s.url, frameWidth: s.fw, frameHeight: s.fh, frames: s.frames, height: 1 };
};

function Title() {
  return (
    <div className="cc-bob pointer-events-none shrink-0 text-center" style={{ filter: "drop-shadow(0 0 18px #b061ff55)" }}>
      <div className="cc-title" style={{ fontSize: 34, color: "#c88cff", textShadow: "0 3px 0 #4a1a7a, 0 5px 0 #140a1c" }}>
        MYSTERY
      </div>
      <div className="cc-title -mt-1" style={{ fontSize: 60, color: ORANGE, textShadow: "0 4px 0 #8a3a00, 0 7px 0 #140a1c, 0 0 24px #ff8a1f66" }}>
        CRYPT
      </div>
    </div>
  );
}

function Menu({ best, hero, onHero, onPlay }: { best: number; hero: HeroId; onHero: (h: HeroId) => void; onPlay: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col overflow-y-auto px-5 py-4">
      {/* my-auto centres the menu when it fits and lets it scroll when it doesn't. */}
      <div className="my-auto flex w-full flex-col items-center">
        <Title />
        <div className="mt-3 grid w-full max-w-sm shrink-0 grid-cols-4 gap-2">
          {(Object.keys(HEROES) as HeroId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onHero(id)}
              className={`flex flex-col items-center rounded-md border-2 px-1 pb-1 pt-1.5 transition ${
                id === hero ? "border-[#ffcf4a] bg-[#3a2254]" : "border-[#140a1c] bg-[#1c1128]/80 opacity-70 hover:opacity-100"
              }`}
            >
              <Sprite sprite={spriteOf(id)} size={36} fps={7} animate={id === hero} />
              <span className="cc-outline-sm mt-0.5 text-sm text-white">{HEROES[id].name}</span>
            </button>
          ))}
        </div>
        <p className="cc-outline-sm mt-1.5 shrink-0 text-center text-sm text-[#ffcf4a]">{HEROES[hero].perk}</p>
        <Panel className="mt-3 w-full max-w-sm shrink-0 px-1 text-[13px] leading-snug text-[#ffe9c4]">
          <ul className="cc-outline-sm space-y-1">
            <li>
              Move one step, then the monsters move. <span className="text-[#ffcf4a]">Find the stairs</span> and go deep.
            </li>
            <li>
              <span className="text-[#ff9ad5]">Beaten monsters may join you</span> (up to {MAX_PARTY - 1}). Throw <span className="text-[#ffcf4a]">Candy Corn</span> first to help.
            </li>
            <li>If your hero faints, the run is over.</li>
          </ul>
        </Panel>
        <Button color="orange" onClick={onPlay} className="cc-shine relative mt-4 w-full max-w-xs shrink-0 overflow-hidden py-2 text-3xl">
          Play
        </Button>
        {best > 0 && (
          <p className="cc-outline-sm mt-2 shrink-0 text-sm text-[#ffe9c4]">
            Best: <span className="text-[#ffcf4a]">{best.toLocaleString()}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function Bar({ value, max, from, to }: { value: number; max: number; from: string; to: string }) {
  return (
    <div className="relative h-3 flex-1 overflow-hidden rounded-sm border-2 border-[#140a1c] bg-[#140a1c]/70">
      <div className="h-full transition-[width] duration-150" style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%`, background: `linear-gradient(90deg, ${from}, ${to})` }} />
    </div>
  );
}

function HudBar({ hud, onPause }: { hud: Hud; onPause: () => void }) {
  const low = hud.hp < hud.maxHp * 0.3;
  return (
    <div className="pointer-events-none px-3 pt-3">
      <div className="flex items-center gap-2">
        <div className="cc-outline-sm shrink-0 rounded border-2 border-[#140a1c] bg-[#2a1638]/90 px-2 py-0.5 text-sm text-[#c88cff]">B{hud.floor}F</div>
        <div className="cc-outline-sm shrink-0 text-sm text-[#ffe9c4]">Lv {hud.level}</div>
        <div className="flex flex-1 items-center gap-1.5">
          <span className={`cc-outline-sm text-xs ${low ? "text-[#ff5a6a]" : "text-[#7dffb0]"}`}>HP</span>
          <Bar value={hud.hp} max={hud.maxHp} from={low ? "#ff2d55" : "#3ad07a"} to={low ? "#ff8a1f" : "#7dffb0"} />
          <span className="cc-outline-sm w-14 text-right text-xs text-white">
            {hud.hp}/{hud.maxHp}
          </span>
        </div>
        <button type="button" onClick={onPause} aria-label="Pause" className="cc-sbtn cc-sbtn-stone pointer-events-auto ml-1 px-0 text-xs">
          <span>II</span>
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="cc-outline text-lg text-[#ffcf4a]">{hud.score.toLocaleString()}</div>
        <div className="flex gap-1">
          {hud.party
            .filter((m) => !m.leader)
            .map((m) => (
              <div key={m.id} className="flex flex-col items-center rounded border-2 border-[#140a1c] bg-[#1c1128]/85 px-1 pt-0.5">
                <Sprite sprite={spriteOf(m.kind)} size={20} fps={6} />
                <div className="mb-0.5 mt-0.5 h-1 w-6 overflow-hidden rounded-sm bg-[#140a1c]">
                  <div className="h-full bg-[#ff9ad5]" style={{ width: `${(m.hp / m.maxHp) * 100}%` }} />
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function PadButton({ children, onDown, onUp, className = "", label }: { children: ReactNode; onDown: () => void; onUp?: () => void; className?: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`cc-sbtn cc-sbtn-stone flex items-center justify-center p-0 text-lg ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span>{children}</span>
    </button>
  );
}

function Controls({ ctrl, onBag, bagCount }: { ctrl: GameController | null; onBag: () => void; bagCount: number }) {
  const hold = (dx: number, dy: number) => () => ctrl?.hold({ dx, dy });
  const release = () => ctrl?.hold(null);
  // Smaller on short screens so the map keeps some room.
  const size = "h-12 w-12 [@media(max-height:640px)]:h-10 [@media(max-height:640px)]:w-10";
  return (
    <div className="flex items-center justify-between px-4 pb-4 pt-2 [@media(max-height:640px)]:pb-2">
      <div className="grid grid-cols-3 grid-rows-3 gap-1">
        <span />
        <PadButton label="Up" className={size} onDown={hold(0, -1)} onUp={release}>
          ▲
        </PadButton>
        <span />
        <PadButton label="Left" className={size} onDown={hold(-1, 0)} onUp={release}>
          ◀
        </PadButton>
        <PadButton label="Wait a turn" className={`${size} text-xs`} onDown={() => ctrl?.press({ type: "wait" })}>
          ···
        </PadButton>
        <PadButton label="Right" className={size} onDown={hold(1, 0)} onUp={release}>
          ▶
        </PadButton>
        <span />
        <PadButton label="Down" className={size} onDown={hold(0, 1)} onUp={release}>
          ▼
        </PadButton>
        <span />
      </div>
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          className="cc-sbtn cc-sbtn-orange cc-outline-sm h-20 w-20 rounded-full p-0 text-2xl [@media(max-height:640px)]:h-16 [@media(max-height:640px)]:w-16"
          onPointerDown={(e) => {
            e.preventDefault();
            ctrl?.press({ type: "attack" });
          }}
        >
          <span>Hit</span>
        </button>
        <Button color="purple" onClick={onBag} className="w-24 py-0 text-base">
          Bag {bagCount}
        </Button>
      </div>
    </div>
  );
}

function Messages({ messages }: { messages: { id: number; text: string; color?: string }[] }) {
  return (
    <div className="pointer-events-none flex flex-col gap-0.5 px-3">
      {messages.map((m) => (
        <div key={m.id} className="cc-outline-sm mc-msg w-fit max-w-full rounded bg-[#0b0712]/75 px-2 py-0.5 text-[13px] leading-tight" style={{ color: m.color ?? "#ffe9c4" }}>
          {m.text}
        </div>
      ))}
    </div>
  );
}

function BagPanel({ bag, onUse, onClose }: { bag: ItemId[]; onUse: (slot: number) => void; onClose: () => void }) {
  const kinds = (Object.keys(ITEMS) as ItemId[]).filter((k) => bag.includes(k));
  const icon: Record<ItemId, ReactNode> = {
    heart: <Sprite sprite={{ url: "/royale/ui/heart.png", frameWidth: 16, frameHeight: 16, frames: 1, height: 1 }} size={28} />,
    candycorn: <Sprite sprite={{ url: "/sprites/candycornsprite.png", frameWidth: 24, frameHeight: 24, frames: 6, height: 1 }} size={30} />,
    lamp: <Sprite sprite={{ url: "/royale/ui/lamp.png", frameWidth: 16, frameHeight: 64, frames: 4, height: 1 }} size={34} />,
  };
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b0712]/75 px-5 py-4" onClick={onClose}>
      <Panel className="cc-pop max-h-full w-full max-w-sm overflow-y-auto">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="cc-outline mb-2 text-center text-2xl text-[#ffcf4a]">Bag</div>
          {kinds.length === 0 && <p className="cc-outline-sm py-4 text-center text-[#ffe9c4]">Empty. Look for items on the floor.</p>}
          <ul className="space-y-2">
            {kinds.map((k) => (
              <li key={k} className="flex items-center gap-3 rounded border-2 border-[#140a1c] bg-[#1c1128]/80 p-2">
                <div className="flex h-9 w-9 items-center justify-center">{icon[k]}</div>
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

function MemberRow({ m, children }: { m: Member; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded border-2 border-[#140a1c] bg-[#1c1128]/80 p-2">
      <div className="flex h-10 w-10 items-center justify-center">
        <Sprite sprite={spriteOf(m.kind)} size={36} fps={7} />
      </div>
      <div className="flex-1">
        <div className="cc-outline-sm text-white">
          {unitName(m.kind)} <span className="text-[#ffcf4a]">Lv {m.level}</span>
        </div>
        <div className="cc-outline-sm text-xs text-[#ffe9c4]/80">
          HP {m.hp}/{m.maxHp}
        </div>
      </div>
      {children}
    </div>
  );
}

function RecruitPanel({ hud, onAnswer }: { hud: Hud; onAnswer: (replaceId: number | null) => void }) {
  const newcomer = hud.recruit!;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b0712]/80 px-5 py-4">
      <Panel gold className="cc-pop max-h-full w-full max-w-sm overflow-y-auto">
        <div className="cc-outline text-center text-xl text-[#ff9ad5]">The {unitName(newcomer.kind)} wants to join!</div>
        <p className="cc-outline-sm mb-3 mt-1 text-center text-sm text-[#ffe9c4]">Your team is full. Swap someone out?</p>
        <MemberRow m={newcomer} />
        <div className="cc-outline-sm my-2 text-center text-xs uppercase tracking-widest text-[#ffe9c4]/70">Your team</div>
        <div className="space-y-2">
          {hud.party
            .filter((m) => !m.leader)
            .map((m) => (
              <MemberRow key={m.id} m={m}>
                <Button color="purple" onClick={() => onAnswer(m.id)} className="shrink-0 px-3 py-0 text-sm">
                  Swap
                </Button>
              </MemberRow>
            ))}
        </div>
        <Button color="stone" onClick={() => onAnswer(null)} className="mt-3 w-full py-0 text-base">
          No thanks
        </Button>
      </Panel>
    </div>
  );
}

function GameOver({ result, best, newBest, onAgain, onMenu }: { result: RunResult; best: number; newBest: boolean; onAgain: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0712]/75 px-6">
      <div className="cc-pop cc-title text-center" style={{ fontSize: 50, color: PURPLE, textShadow: "0 4px 0 #4a1a7a, 0 8px 0 #140a1c" }}>
        FAINTED
      </div>
      <div className="cc-outline-sm text-[#ffe9c4]">on B{result.floor}F</div>
      <Panel gold className="cc-pop mt-5 w-full max-w-xs text-center" style={{ animationDelay: "0.15s" }}>
        <div className="cc-outline-sm text-xs uppercase tracking-widest text-[#ffe9c4]">Score</div>
        <div className="cc-outline text-4xl text-white">{result.score.toLocaleString()}</div>
        {newBest ? (
          <div className="cc-outline-sm mt-1 text-sm text-[#7dffb0]">New best!</div>
        ) : (
          <div className="cc-outline-sm mt-1 text-sm text-[#ffe9c4]">Best {best.toLocaleString()}</div>
        )}
        <div className="cc-outline-sm mt-3 flex justify-around text-sm text-[#ffe9c4]">
          <span>
            Floor <span className="text-[#ffcf4a]">{result.floor}</span>
          </span>
          <span>
            Beaten <span className="text-[#ffcf4a]">{result.kills}</span>
          </span>
          <span>
            Joined <span className="text-[#ff9ad5]">{result.recruited}</span>
          </span>
        </div>
      </Panel>
      <Button color="orange" onClick={onAgain} className="mt-6 w-full max-w-xs py-1 text-2xl">
        Play again
      </Button>
      <Button color="stone" onClick={onMenu} className="mt-3 w-full max-w-xs py-0 text-base">
        Menu
      </Button>
    </div>
  );
}

type View = "menu" | "playing" | "over";
type Message = { id: number; text: string; color?: string; at: number };

// Mystery Crypt: a Mystery Dungeon-style crawl. Explore random floors one
// step at a time, and recruit the monsters you beat.
export default function MysteryCrypt() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [ctrl, setCtrl] = useState<GameController | null>(null);
  const [view, setView] = useState<View>("menu");
  const [hud, setHud] = useState<Hud | null>(null);
  const [paused, setPaused] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [banner, setBanner] = useState<{ text: string; key: number } | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [best, setBest] = useState(loadBest);
  const [newBest, setNewBest] = useState(false);
  const [hero, setHero] = useState<HeroId>(loadHero);
  const bestRef = useRef(best);
  const msgId = useRef(0);

  const addMessage = useCallback((text: string, color?: string) => {
    const id = ++msgId.current;
    setMessages((list) => [...list, { id, text, color, at: Date.now() }].slice(-3));
  }, []);

  // Messages fade after a few seconds.
  useEffect(() => {
    if (!messages.length) return;
    const timer = window.setTimeout(() => setMessages((list) => list.filter((m) => Date.now() - m.at < 3800)), 1000);
    return () => window.clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 1400);
    return () => window.clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    const c = new GameController(hostRef.current!, canvasRef.current!, {
      onHud: setHud,
      onMessage: addMessage,
      onFloor: (floor) => setBanner({ text: `B${floor}F`, key: Date.now() }),
      onOver: (run) => {
        setResult(run);
        // Inside the arcade cabinet, the arcade saves the score to the leaderboard
        if (window.parent !== window) {
          window.parent.postMessage({ type: "PLAYER_DIED", score: run.score }, window.location.origin);
        }
        const isBest = run.score > bestRef.current;
        setNewBest(isBest);
        if (isBest) {
          bestRef.current = run.score;
          setBest(run.score);
          saveBest(run.score);
        }
        setView("over");
      },
    });
    setCtrl(c);
    void c.start(true);
    return () => c.dispose();
  }, [addMessage]);

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

  const modal = paused || bagOpen || !!hud?.recruit;
  useEffect(() => {
    ctrl?.setPaused(paused || bagOpen);
  }, [ctrl, paused, bagOpen]);

  // Leaving the tab pauses a run in progress.
  useEffect(() => {
    if (view !== "playing") return;
    const onHidden = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [view]);

  const pickHero = (h: HeroId) => {
    setHero(h);
    try {
      localStorage.setItem(HERO_KEY, h);
    } catch {
      // Not remembered; fine.
    }
  };

  const play = () => {
    setResult(null);
    setHud(null);
    setPaused(false);
    setBagOpen(false);
    setMessages([]);
    setView("playing");
    const { floor, autoplay } = devStart();
    setBanner({ text: `B${floor ?? 1}F`, key: Date.now() });
    void ctrl?.start(false, { hero, floor }, autoplay);
  };

  const menu = () => {
    setPaused(false);
    setBagOpen(false);
    setView("menu");
    setBanner(null);
    void ctrl?.start(true);
  };

  const takeItem = (slot: number) => {
    setBagOpen(false);
    ctrl?.setPaused(false);
    ctrl?.press({ type: "use", slot });
  };

  return (
    <div className="cc-root fixed inset-0 z-50 flex justify-center bg-[#0b0712] text-white select-none" style={{ fontVariantLigatures: "none" }}>
      <div className="relative h-full w-full overflow-hidden" style={{ maxWidth: "min(100vw, calc(100dvh * 0.62))" }}>
        <div ref={hostRef} className="absolute inset-0 touch-none" style={view === "menu" ? { filter: "brightness(0.45) saturate(1.1) blur(1.5px)" } : undefined}>
          <canvas ref={canvasRef} className="block" />
        </div>
        {view === "menu" && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0b0712]/70 via-transparent to-[#0b0712]/80" />
            <Embers />
            <Menu best={best} hero={hero} onHero={pickHero} onPlay={play} />
          </>
        )}
        {view === "playing" && hud && (
          <>
            <div ref={topRef} className="absolute inset-x-0 top-0">
              <HudBar hud={hud} onPause={() => setPaused(true)} />
            </div>
            <div ref={bottomRef} className="absolute inset-x-0 bottom-0">
              {hud.onStairs && !modal && (
                <div className="flex justify-center pb-2">
                  <Button color="green" onClick={() => ctrl?.press({ type: "descend" })} className="cc-pop px-6 py-1 text-xl">
                    Go down the stairs ▼
                  </Button>
                </div>
              )}
              <Messages messages={messages} />
              <div className="mt-2 bg-gradient-to-t from-[#0b0712] via-[#0b0712]/90 to-transparent">
                <Controls ctrl={ctrl} onBag={() => setBagOpen(true)} bagCount={hud.bag.length} />
              </div>
            </div>
          </>
        )}
        {view === "playing" && !hud && <p className="cc-outline-sm absolute inset-x-0 top-1/2 text-center text-[#ffe9c4]">Loading…</p>}
        {view === "playing" && banner && (
          <div key={banner.key} className="pointer-events-none absolute inset-x-0 top-[26%] flex justify-center">
            <div className="cc-count cc-title" style={{ fontSize: 60, color: "#c88cff", textShadow: "0 4px 0 #140a1c, 0 0 24px currentColor" }}>
              {banner.text}
            </div>
          </div>
        )}
        {view === "playing" && bagOpen && hud && <BagPanel bag={hud.bag} onUse={takeItem} onClose={() => setBagOpen(false)} />}
        {view === "playing" && hud?.recruit && <RecruitPanel hud={hud} onAnswer={(id) => ctrl?.answerRecruit(id)} />}
        {view === "playing" && paused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0712]/75 px-6">
            <div className="cc-title" style={{ fontSize: 56, color: ORANGE, textShadow: "0 4px 0 #8a3a00, 0 8px 0 #140a1c" }}>
              PAUSED
            </div>
            <Button color="green" onClick={() => setPaused(false)} className="mt-6 w-full max-w-xs py-1 text-2xl">
              Resume
            </Button>
            <Button color="stone" onClick={menu} className="mt-3 w-full max-w-xs py-0 text-base">
              Quit
            </Button>
          </div>
        )}
        {view === "over" && result && <GameOver result={result} best={best} newBest={newBest} onAgain={play} onMenu={menu} />}
      </div>
    </div>
  );
}
