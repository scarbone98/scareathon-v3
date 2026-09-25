import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Embers, Panel, Sprite } from "../Royale/ui/parts";
import { ORANGE, PURPLE, SPRITES } from "../Royale/ui/theme";
import { GameController, type Hud, type RunResult } from "./game/controller";

const BEST_KEY = "horde-rush-best";

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

const HERO_SPRITES = [SPRITES.joe, SPRITES.matt, SPRITES.alex, SPRITES.jon];
const sheet = (url: string, frameWidth: number, frameHeight: number, frames: number) => ({ url, frameWidth, frameHeight, frames, height: 1 });
const HORDE_SPRITES = [
  sheet("/sprites/zombiesprite-1.png", 16, 24, 6),
  sheet("/sprites/pumpkin.png", 16, 16, 6),
  sheet("/sprites/werewolfsprite.png", 30, 26, 7),
  sheet("/sprites/ghost.png", 16, 32, 6),
];

function Title() {
  return (
    <div className="cc-bob pointer-events-none text-center" style={{ filter: "drop-shadow(0 0 18px #ff6a0055)" }}>
      <div className="cc-title" style={{ fontSize: 50, color: "#c88cff", textShadow: "0 3px 0 #4a1a7a, 0 6px 0 #140a1c" }}>
        HORDE
      </div>
      <div className="cc-title" style={{ fontSize: 80, color: ORANGE, textShadow: "0 4px 0 #8a3a00, 0 8px 0 #140a1c, 0 0 24px #ff8a1f66" }}>
        RUSH
      </div>
    </div>
  );
}

function Menu({ best, onPlay }: { best: number; onPlay: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center overflow-y-auto px-5 pb-6 pt-[8vh]">
      <Title />
      <div className="mt-6 flex items-end gap-1">
        {HERO_SPRITES.map((s, i) => (
          <Sprite key={i} sprite={s} size={46} fps={7} />
        ))}
        <span className="cc-outline mx-3 self-center text-2xl text-[#ffcf4a]">VS</span>
        {HORDE_SPRITES.map((s, i) => (
          <Sprite key={i} sprite={s} size={42} fps={8} flip />
        ))}
      </div>
      <Panel className="mt-6 w-full max-w-sm px-1 text-sm leading-snug text-[#ffe9c4]">
        <ul className="cc-outline-sm space-y-1.5">
          <li>
            <span className="text-[#ffcf4a]">Drag</span> to steer your army. They fire on their own.
          </li>
          <li>
            <span className="text-[#6ae0ff]">Shoot the gates</span> to pump up their numbers, then run through the best one.
          </li>
          <li>
            <span className="text-[#7dffb0]">Blast barrels</span> for extra heroes and fire rate.
          </li>
          <li>
            <span className="text-[#ff5a6a]">Monsters</span> take out one hero for every 2 HP they have left when they reach you.
          </li>
        </ul>
      </Panel>
      <Button color="orange" onClick={onPlay} className="cc-shine relative mt-6 w-full max-w-xs overflow-hidden py-2 text-3xl">
        Play
      </Button>
      {best > 0 && <p className="cc-outline-sm mt-4 text-sm text-[#ffe9c4]">Best: <span className="text-[#ffcf4a]">{best.toLocaleString()}</span></p>}
    </div>
  );
}

function HudBar({ hud, onPause }: { hud: Hud; onPause: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 px-3 pt-3">
      <div className="flex items-center gap-2">
        <div className="cc-outline-sm shrink-0 rounded border-2 border-[#140a1c] bg-[#2a1638]/90 px-2 py-0.5 text-sm text-[#ffcf4a]">LV {hud.level}</div>
        <div className="relative h-3 flex-1 overflow-hidden rounded-sm border-2 border-[#140a1c] bg-[#140a1c]/70">
          <div className="h-full bg-gradient-to-r from-[#b061ff] to-[#ff8a1f] transition-[width] duration-100" style={{ width: `${hud.progress * 100}%` }} />
        </div>
        <Sprite sprite={SPRITES.skull} size={22} />
        <button
          type="button"
          onClick={onPause}
          aria-label="Pause"
          className="cc-sbtn cc-sbtn-stone pointer-events-auto ml-1 px-0 text-xs"
        >
          <span>II</span>
        </button>
      </div>
      <div className="mt-2 flex items-start justify-between">
        <div className="cc-outline text-xl text-white">{hud.score.toLocaleString()}</div>
        <div className="cc-outline-sm rounded border-2 border-[#140a1c] bg-[#3a1a08]/85 px-2 py-0.5 text-sm text-[#ffb04a]">
          FIRE {Math.round(hud.fire * 100)}%
        </div>
      </div>
      {hud.boss && (
        <div className="mx-auto mt-2 w-[80%]">
          <div className="cc-outline-sm text-center text-xs uppercase tracking-widest text-[#ffcf4a]">Boss</div>
          <div className="mt-0.5 h-3 overflow-hidden rounded-sm border-2 border-[#140a1c] bg-[#140a1c]/70">
            <div className="h-full bg-gradient-to-r from-[#ff2d55] to-[#ff8a1f]" style={{ width: `${(hud.boss.hp / hud.boss.maxHp) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function GameOver({ result, best, newBest, onAgain, onMenu }: { result: RunResult; best: number; newBest: boolean; onAgain: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0712]/70 px-6">
      <div className="cc-pop cc-title text-center" style={{ fontSize: 54, color: PURPLE, textShadow: "0 4px 0 #4a1a7a, 0 8px 0 #140a1c" }}>
        OVERRUN!
      </div>
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
            Level <span className="text-[#ffcf4a]">{result.level}</span>
          </span>
          <span>
            Kills <span className="text-[#ffcf4a]">{result.kills}</span>
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

// Horde Rush: steer an army down a haunted road, shooting gates to grow it
// and blasting through the monsters coming the other way.
export default function HordeRush() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<GameController | null>(null);
  const [view, setView] = useState<View>("menu");
  const [hud, setHud] = useState<Hud | null>(null);
  const [paused, setPaused] = useState(false);
  const [banner, setBanner] = useState<{ text: string; key: number; color: string } | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [best, setBest] = useState(loadBest);
  const [newBest, setNewBest] = useState(false);
  const bestRef = useRef(best);

  const showBanner = useCallback((text: string, color: string) => {
    setBanner({ text, color, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 1600);
    return () => window.clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    const ctrl = new GameController(hostRef.current!, canvasRef.current!, {
      onHud: setHud,
      onLevel: (level) => showBanner(`LEVEL ${level}`, "#ffcf4a"),
      onBoss: () => showBanner("BOSS!", "#ff2d55"),
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
    ctrlRef.current = ctrl;
    void ctrl.start(true);
    return () => {
      ctrl.dispose();
      ctrlRef.current = null;
    };
  }, [showBanner]);

  useEffect(() => {
    ctrlRef.current?.setPaused(paused);
  }, [paused]);

  // Leaving the tab pauses a run in progress.
  useEffect(() => {
    if (view !== "playing") return;
    const onHidden = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [view]);

  const play = () => {
    setResult(null);
    setHud(null);
    setPaused(false);
    setView("playing");
    showBanner("LEVEL 1", "#ffcf4a");
    void ctrlRef.current?.start(false);
  };

  const menu = () => {
    setPaused(false);
    setView("menu");
    setBanner(null);
    void ctrlRef.current?.start(true);
  };

  return (
    <div className="cc-root fixed inset-0 z-50 flex justify-center bg-[#0b0712] text-white select-none" style={{ fontVariantLigatures: "none" }}>
      <div className="relative h-full w-full overflow-hidden" style={{ maxWidth: "min(100vw, calc(100dvh * 0.6))" }}>
        <div ref={hostRef} className="absolute inset-0 touch-none" style={view === "menu" ? { filter: "brightness(0.5) saturate(1.2) blur(1.5px)" } : undefined}>
          <canvas ref={canvasRef} className="block" />
        </div>
        {view === "menu" && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0b0712]/70 via-transparent to-[#0b0712]/80" />
            <Embers />
            <Menu best={best} onPlay={play} />
          </>
        )}
        {view === "playing" && hud && <HudBar hud={hud} onPause={() => setPaused(true)} />}
        {view === "playing" && !hud && (
          <p className="cc-outline-sm absolute inset-x-0 top-1/2 text-center text-[#ffe9c4]">Loading…</p>
        )}
        {view === "playing" && banner && (
          <div key={banner.key} className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center">
            <div className="cc-count cc-title" style={{ fontSize: 64, color: banner.color, textShadow: "0 4px 0 #140a1c, 0 0 24px currentColor" }}>
              {banner.text}
            </div>
          </div>
        )}
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
