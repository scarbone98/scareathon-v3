import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  GameController,
  type Hud,
  type Popup,
  type RunResult,
} from "./game/controller";
import { START_TIME } from "./game/sim";
import { GATES } from "./game/course";
import "./ghostridge.css";

const BEST_KEY = "ghost-ridge-best";
const MUTE_KEY = "ghost-ridge-muted";

type View = "title" | "howto" | "ride" | "result";

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

function Btn({
  children,
  color = "orange",
  className = "",
  onClick,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`gr-btn gr-${color} px-4 py-3 text-sm ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div
      className="gr-float pointer-events-none text-center"
      style={{ filter: "drop-shadow(0 0 16px #7b3fd088)" }}
    >
      <div
        className="gr-title"
        style={{
          fontSize: small ? 34 : 58,
          color: "#c88cff",
          textShadow: "0 3px 0 #4a1a7a, 0 6px 0 #120a24",
        }}
      >
        GHOST
      </div>
      <div
        className="gr-title"
        style={{
          fontSize: small ? 48 : 84,
          color: "#ff8a1f",
          textShadow: "0 4px 0 #8a3a00, 0 8px 0 #120a24, 0 0 26px #ff8a1f66",
        }}
      >
        RIDGE
      </div>
    </div>
  );
}

// A thumbstick that appears wherever the left thumb lands.
function Stick({ ctrl }: { ctrl: GameController | null }) {
  const [knob, setKnob] = useState<{
    ox: number;
    oy: number;
    x: number;
    y: number;
  } | null>(null);
  const grip = useRef<{
    id: number;
    cx: number;
    cy: number;
    ox: number;
    oy: number;
  } | null>(null);
  const R = 46;
  const end = () => {
    grip.current = null;
    setKnob(null);
    ctrl?.setStick(0, 0);
  };
  return (
    <div
      className="absolute bottom-0 left-0 top-1/3 w-1/2"
      onPointerDown={(e) => {
        if (grip.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        grip.current = {
          id: e.pointerId,
          cx: e.clientX,
          cy: e.clientY,
          ox: e.clientX - rect.left,
          oy: e.clientY - rect.top,
        };
        setKnob({ ox: grip.current.ox, oy: grip.current.oy, x: 0, y: 0 });
      }}
      onPointerMove={(e) => {
        const g = grip.current;
        if (!g || e.pointerId !== g.id) return;
        let dx = e.clientX - g.cx;
        let dy = e.clientY - g.cy;
        const len = Math.hypot(dx, dy);
        if (len > R) {
          dx = (dx / len) * R;
          dy = (dy / len) * R;
        }
        setKnob({ ox: g.ox, oy: g.oy, x: dx, y: dy });
        const dead = (v: number) => (Math.abs(v) < 0.2 ? 0 : v);
        ctrl?.setStick(dead(dx / R), dead(-dy / R));
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {knob ? (
        <div
          className="pointer-events-none absolute"
          style={{
            left: knob.ox - R,
            top: knob.oy - R,
            width: R * 2,
            height: R * 2,
          }}
        >
          <div className="absolute inset-0 rounded-full border-4 border-white/30 bg-[#120a24]/40" />
          <div
            className="absolute rounded-full border-4 border-[#120a24] bg-[#ff8a1f]/90"
            style={{
              width: 40,
              height: 40,
              left: R - 20 + knob.x,
              top: R - 20 + knob.y,
            }}
          />
        </div>
      ) : (
        <div className="gr-o pointer-events-none absolute bottom-10 left-6 text-[9px] text-white/60">
          drag to steer
          <br />▲ tuck ▼ brake
        </div>
      )}
    </div>
  );
}

function Pad({
  label,
  className,
  color,
  onChange,
}: {
  label: string;
  className: string;
  color: string;
  onChange: (down: boolean) => void;
}) {
  const [down, setDown] = useState(false);
  const set = (d: boolean) => {
    setDown(d);
    onChange(d);
  };
  return (
    <button
      type="button"
      data-down={down}
      className={`gr-pad absolute flex items-center justify-center ${className}`}
      style={{ background: color }}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

function TouchControls({ ctrl }: { ctrl: GameController | null }) {
  return (
    <>
      <Stick ctrl={ctrl} />
      <Pad
        label="JUMP"
        color="#ff7a1acc"
        className="bottom-6 right-5 h-[88px] w-[88px] text-[11px]"
        onChange={(d) => ctrl?.setButton("jump", d)}
      />
      <Pad
        label="GRAB"
        color="#7b3fd0cc"
        className="bottom-[104px] right-[92px] h-16 w-16 text-[9px]"
        onChange={(d) => ctrl?.setButton("grab", d)}
      />
      <Pad
        label="BOOST"
        color="#2fae62cc"
        className="bottom-[124px] right-4 h-16 w-16 text-[8px]"
        onChange={(d) => ctrl?.setButton("boost", d)}
      />
    </>
  );
}

function HudBar({ hud, onPause }: { hud: Hud; onPause: () => void }) {
  const low = hud.time < 10 && hud.status === "ride";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 px-3 pt-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="gr-o text-[9px] text-[#c88cff]">TIME</div>
          <div
            className={`gr-o text-xl ${low ? "gr-blink text-[#ff5a6a]" : "text-white"}`}
          >
            {hud.time.toFixed(1)}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="text-right">
            <div className="gr-o text-[9px] text-[#c88cff]">SCORE</div>
            <div className="gr-o text-lg text-[#ffcf4a]">
              {hud.score.toLocaleString()}
            </div>
            <div className="gr-o mt-1 text-[9px] text-[#ffb36b]">
              CANDY {hud.candy}
            </div>
          </div>
          <button
            type="button"
            aria-label="Pause"
            onClick={onPause}
            className="gr-btn gr-stone pointer-events-auto px-2 py-1.5 text-[10px]"
          >
            II
          </button>
        </div>
      </div>
      {/* How far down the mountain, with the checkpoints marked. */}
      <div className="relative mx-auto mt-2 h-2 w-[70%] border-2 border-[#120a24] bg-[#120a24]/60">
        <div
          className="h-full bg-gradient-to-r from-[#7b3fd0] to-[#ff8a1f]"
          style={{ width: `${hud.progress * 100}%` }}
        />
        {GATES.map((d, i) => (
          <div
            key={d}
            className={`absolute -top-1 h-3 w-1 ${i < hud.checkpoints ? "bg-[#7dffb0]" : "bg-[#ffcf4a]"}`}
            style={{ left: `${(d / 3000) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function SpeedBoost({ hud, touch }: { hud: Hud; touch: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute ${touch ? "right-4 top-24 items-end" : "bottom-4 left-4 items-start"} flex flex-col gap-1`}
    >
      <div className="gr-o text-base text-white">
        {hud.speed}
        <span className="text-[9px] text-[#c88cff]"> KM/H</span>
      </div>
      <div className="gr-o text-[8px] text-[#7dffb0]">BOOST</div>
      <div className="h-2.5 w-24 border-2 border-[#120a24] bg-[#120a24]/60">
        <div
          className={`h-full ${hud.boosting ? "bg-white" : "bg-[#2fe07a]"}`}
          style={{ width: `${hud.boost * 100}%` }}
        />
      </div>
    </div>
  );
}

function Popups({ popups }: { popups: Popup[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[24%] flex flex-col items-center gap-1 px-4 text-center">
      {popups.map((p) => (
        <div key={p.id} className="gr-pop">
          <div
            className={`gr-o ${p.big ? "text-4xl" : "text-sm"}`}
            style={{ color: p.color }}
          >
            {p.text}
          </div>
          {p.sub && <div className="gr-o mt-1 text-xs text-white">{p.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function HowTo({ onBack, touch }: { onBack: () => void; touch: boolean }) {
  const rows: [string, string][] = touch
    ? [
        ["Drag left side", "Steer. Up to tuck for speed, down to brake."],
        ["Hold JUMP", "Crouch. Let go to jump; hold longer for more pop."],
        ["In the air", "Drag left/right to spin, up/down to flip."],
        ["GRAB", "Hold in the air for grab points."],
        ["BOOST", "Tricks and candy fill the meter."],
      ]
    : [
        ["← →", "Steer. ↑ to tuck for speed, ↓ to brake."],
        ["Space", "Hold to crouch, let go to jump."],
        ["In the air", "← → to spin, ↑ ↓ to flip."],
        ["Z / K", "Hold in the air to grab."],
        ["Shift / X", "Boost. Tricks and candy fill the meter."],
      ];
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b0718]/70 p-4">
      <div className="gr-panel w-full max-w-sm p-4">
        <div className="gr-o mb-3 text-center text-sm text-[#ffcf4a]">
          HOW TO RIDE
        </div>
        <ul className="space-y-2.5">
          {rows.map(([k, v]) => (
            <li key={k} className="flex gap-3 text-[9px] leading-relaxed">
              <span className="w-24 shrink-0 text-[#ff8a1f]">{k}</span>
              <span className="text-white/90">{v}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[9px] leading-relaxed text-[#c88cff]">
          Land with the board straight (or riding backwards) and upright, or you
          bail. Checkpoints add time. Watch out for graves, trees and ghosts!
        </p>
        <Btn color="stone" className="mt-4 w-full" onClick={onBack}>
          BACK
        </Btn>
      </div>
    </div>
  );
}

function Results({
  result,
  best,
  isBest,
  onAgain,
  onMenu,
}: {
  result: RunResult;
  best: number;
  isBest: boolean;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const rows: [string, string][] = [
    ["Time", result.finished ? fmtTime(result.elapsed) : "DNF"],
    ["Tricks landed", String(result.tricks)],
    ["Candy", `${result.candy} / ${result.candyTotal}`],
    ["Finish bonus", result.finishBonus.toLocaleString()],
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b0718]/75 p-4">
      <div className="gr-panel w-full max-w-sm p-4 text-center">
        <div
          className="gr-title gr-o text-5xl"
          style={{ color: result.finished ? "#7dffb0" : "#ff5a6a" }}
        >
          {result.finished ? "FINISHED!" : "TIME UP"}
        </div>
        <ul className="mt-3 space-y-1.5 text-left text-[10px]">
          {rows.map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span className="text-[#c88cff]">{k}</span>
              <span className="text-white">{v}</span>
            </li>
          ))}
        </ul>
        {result.bestTrick && (
          <div className="mt-3 text-[9px] leading-relaxed text-white/80">
            Best trick:{" "}
            <span className="text-[#ffcf4a]">{result.bestTrick.name}</span> (
            {result.bestTrick.points.toLocaleString()})
          </div>
        )}
        <div className="mt-4 text-[9px] text-[#c88cff]">SCORE</div>
        <div className="gr-o text-2xl text-[#ffcf4a]">
          {result.score.toLocaleString()}
        </div>
        <div
          className={`mt-1 text-[9px] ${isBest ? "gr-blink text-[#7dffb0]" : "text-white/60"}`}
        >
          {isBest ? "NEW BEST!" : `Best ${best.toLocaleString()}`}
        </div>
        <Btn className="mt-4 w-full" onClick={onAgain}>
          RIDE AGAIN
        </Btn>
        <Btn color="stone" className="mt-2 w-full" onClick={onMenu}>
          MENU
        </Btn>
      </div>
    </div>
  );
}

// Ghost Ridge: a PS1-style 3D snowboarding run down a haunted mountain, to
// a jungle soundtrack. Race the clock through the checkpoints, and land
// tricks off the kickers for points.
export default function GhostRidge() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ctrl, setCtrl] = useState<GameController | null>(null);
  const [view, setView] = useState<View>("title");
  const [hud, setHud] = useState<Hud | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<{
    run: RunResult;
    isBest: boolean;
  } | null>(null);
  const [best, setBest] = useState(
    () => Number(localStorage.getItem(BEST_KEY)) || 0,
  );
  const [muted, setMuted] = useState(
    () => localStorage.getItem(MUTE_KEY) === "1",
  );
  const [touch] = useState(
    () => window.matchMedia("(pointer: coarse)").matches,
  );
  // ?attract shows just the bot riding, for recording the cabinet video.
  const [attract] = useState(() =>
    new URLSearchParams(window.location.search).has("attract"),
  );

  useEffect(() => {
    const c = new GameController(hostRef.current!, canvasRef.current!, {
      onHud: setHud,
      onPopup: (p) => setPopups((list) => [...list.slice(-2), p]),
      onPause: () => setPaused(true),
      onOver: (run) => {
        const prev = Number(localStorage.getItem(BEST_KEY)) || 0;
        const isBest = run.score > prev;
        if (isBest) {
          localStorage.setItem(BEST_KEY, String(run.score));
          setBest(run.score);
        }
        // Inside the arcade cabinet, the arcade saves the score to the leaderboard.
        if (window.parent !== window)
          window.parent.postMessage(
            { type: "PLAYER_DIED", score: run.score },
            window.location.origin,
          );
        setResult({ run, isBest });
        setView("result");
      },
    });
    c.setMuted(localStorage.getItem(MUTE_KEY) === "1");
    setCtrl(c);
    return () => c.dispose();
  }, []);

  // Popups clear themselves once their animation is done.
  useEffect(() => {
    if (!popups.length) return;
    const t = window.setTimeout(() => setPopups((list) => list.slice(1)), 1700);
    return () => window.clearTimeout(t);
  }, [popups]);

  useEffect(() => {
    ctrl?.setPaused(paused);
  }, [ctrl, paused]);

  // Leaving the tab pauses a run.
  useEffect(() => {
    if (view !== "ride") return;
    const onHidden = () => document.hidden && setPaused(true);
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [view]);

  // Space or Enter starts a run from the title and results.
  useEffect(() => {
    if (view !== "title" && view !== "result") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") ride();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ride = () => {
    ctrl?.ride();
    setHud(null);
    setPopups([]);
    setResult(null);
    setPaused(false);
    setView("ride");
  };

  const toMenu = () => {
    ctrl?.demo();
    setPaused(false);
    setResult(null);
    setView("title");
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    ctrl?.setMuted(m);
    ctrl?.unlockAudio();
  };

  return (
    <div
      className="gr-root fixed inset-0 z-50 overflow-hidden bg-[#0b0718] text-white"
      onPointerDown={() => ctrl?.unlockAudio()}
    >
      <div ref={hostRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="gr-canvas" />
      </div>

      {attract ? null : (
        <>
          {view === "ride" && hud && (
            <>
              <HudBar hud={hud} onPause={() => setPaused(true)} />
              <SpeedBoost hud={hud} touch={touch} />
            </>
          )}
          {view === "ride" && <Popups popups={popups} />}
          {view === "ride" && touch && !paused && <TouchControls ctrl={ctrl} />}

          {(view === "title" || view === "howto") && (
            <div className="absolute inset-0 flex flex-col items-center justify-between bg-gradient-to-b from-[#0b0718]/60 via-transparent to-[#0b0718]/80 px-6 pb-8 pt-[8vh]">
              <Logo />
              {view === "title" && (
                <div className="flex w-full max-w-xs flex-col items-stretch gap-3">
                  <Btn className="py-4 text-lg" onClick={ride}>
                    RIDE
                  </Btn>
                  <div className="grid grid-cols-2 gap-3">
                    <Btn
                      color="purple"
                      className="text-[10px]"
                      onClick={() => setView("howto")}
                    >
                      HOW TO
                    </Btn>
                    <Btn
                      color="stone"
                      className="text-[10px]"
                      onClick={toggleMute}
                    >
                      {muted ? "SOUND OFF" : "SOUND ON"}
                    </Btn>
                  </div>
                  <div className="gr-o text-center text-[9px] text-[#c88cff]">
                    {best > 0
                      ? `BEST ${best.toLocaleString()}`
                      : `${START_TIME} seconds on the clock. Make it down.`}
                  </div>
                </div>
              )}
            </div>
          )}
          {view === "howto" && (
            <HowTo touch={touch} onBack={() => setView("title")} />
          )}

          {view === "ride" && paused && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b0718]/75 px-6">
              <div className="gr-title gr-o mb-4 text-6xl text-[#ff8a1f]">
                PAUSED
              </div>
              <Btn
                color="green"
                className="w-full max-w-xs"
                onClick={() => setPaused(false)}
              >
                RESUME
              </Btn>
              <Btn className="w-full max-w-xs" onClick={ride}>
                RESTART
              </Btn>
              <Btn
                color="stone"
                className="w-full max-w-xs text-[10px]"
                onClick={toggleMute}
              >
                {muted ? "SOUND OFF" : "SOUND ON"}
              </Btn>
              <Btn color="purple" className="w-full max-w-xs" onClick={toMenu}>
                QUIT
              </Btn>
            </div>
          )}

          {view === "result" && result && (
            <Results
              result={result.run}
              isBest={result.isBest}
              best={best}
              onAgain={ride}
              onMenu={toMenu}
            />
          )}
        </>
      )}
    </div>
  );
}
