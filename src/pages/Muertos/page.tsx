import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameController, type Hud, type PointsPop, type Popup, type RunResult } from "./game/controller";
import { PERKS } from "./game/map";
import "./muertos.css";

const BEST_KEY = "muertos-best";
const MUTE_KEY = "muertos-muted";
const SENS_KEY = "muertos-sens";
const VIEW_KEY = "muertos-view";
const FPS_KEY = "muertos-fps";

type ViewMode = "fps" | "top";
const VIEW_NAMES: Record<ViewMode, string> = { fps: "FIRST PERSON", top: "TOP DOWN" };

type View = "title" | "howto" | "play" | "result";

function Btn({ children, color = "red", className = "", onClick }: { children: ReactNode; color?: string; className?: string; onClick: () => void }) {
  return (
    <button type="button" className={`mz-btn mz-${color} px-4 py-3 text-sm ${className}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="pointer-events-none text-center">
      <div className="mz-title mz-drip" style={{ fontSize: small ? 54 : 88, color: "#d8231f" }}>
        MUERTOS
      </div>
      <div className="mz-o mt-1 text-[10px] tracking-[0.3em] text-[#f3d9a0] sm:text-xs">EN EL VIEJO SAN JUAN</div>
    </div>
  );
}

// Round counter, chalk tallies for the first five like the real thing.
function RoundMark({ round }: { round: number }) {
  if (round <= 0) return null;
  if (round <= 5) {
    return (
      <div className="flex items-end gap-[5px]">
        {Array.from({ length: Math.min(round, 4) }, (_, i) => (
          <div key={i} className="mz-tally" style={{ transform: `rotate(${(i % 2 ? 3 : -2)}deg)` }} />
        ))}
        {round === 5 && <div className="mz-tally absolute" style={{ width: 52, height: 7, transform: "translate(-4px, -22px) rotate(-28deg)" }} />}
      </div>
    );
  }
  return <div className="mz-title text-6xl text-[#b8120f]">{round}</div>;
}

function Stick({ ctrl }: { ctrl: GameController | null }) {
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const grip = useRef<{ id: number; cx: number; cy: number; ox: number; oy: number } | null>(null);
  const R = 46;
  const end = () => {
    grip.current = null;
    setKnob(null);
    ctrl?.setMove(0, 0);
    ctrl?.setButton("sprint", false);
  };
  return (
    <div
      className="absolute bottom-0 left-0 top-1/4 w-1/2"
      onPointerDown={(e) => {
        if (grip.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        grip.current = { id: e.pointerId, cx: e.clientX, cy: e.clientY, ox: e.clientX - rect.left, oy: e.clientY - rect.top };
        setKnob({ ox: grip.current.ox, oy: grip.current.oy, x: 0, y: 0 });
      }}
      onPointerMove={(e) => {
        const g = grip.current;
        if (!g || e.pointerId !== g.id) return;
        let dx = e.clientX - g.cx;
        let dy = e.clientY - g.cy;
        const len = Math.hypot(dx, dy);
        // Push past the rim to sprint.
        ctrl?.setButton("sprint", len > R * 1.5 && dy < 0);
        if (len > R) {
          dx = (dx / len) * R;
          dy = (dy / len) * R;
        }
        setKnob({ ox: g.ox, oy: g.oy, x: dx, y: dy });
        const dead = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
        ctrl?.setMove(dead(dx / R), dead(-dy / R));
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {knob ? (
        <div className="pointer-events-none absolute" style={{ left: knob.ox - R, top: knob.oy - R, width: R * 2, height: R * 2 }}>
          <div className="absolute inset-0 rounded-full border-4 border-white/25 bg-black/30" />
          <div className="absolute rounded-full border-4 border-black/70 bg-[#d8231f]/85" style={{ width: 40, height: 40, left: R - 20 + knob.x, top: R - 20 + knob.y }} />
        </div>
      ) : (
        <div className="mz-o pointer-events-none absolute bottom-10 left-6 text-[9px] text-white/50">
          drag to move
          <br />
          push far to run
        </div>
      )}
    </div>
  );
}

// Top-down's right stick: drag to aim, push past halfway to fire.
function AimStick({ ctrl }: { ctrl: GameController | null }) {
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const grip = useRef<{ id: number; cx: number; cy: number; ox: number; oy: number } | null>(null);
  const R = 46;
  const end = () => {
    grip.current = null;
    setKnob(null);
    ctrl?.setAim(0, 0);
  };
  return (
    <div
      className="absolute bottom-0 right-0 top-[40%] w-1/2"
      onPointerDown={(e) => {
        if (grip.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = e.currentTarget.getBoundingClientRect();
        grip.current = { id: e.pointerId, cx: e.clientX, cy: e.clientY, ox: e.clientX - rect.left, oy: e.clientY - rect.top };
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
        ctrl?.setAim(dx / R, dy / R);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {knob ? (
        <div className="pointer-events-none absolute" style={{ left: knob.ox - R, top: knob.oy - R, width: R * 2, height: R * 2 }}>
          <div className="absolute inset-0 rounded-full border-4 border-[#ff5a4a]/40 bg-black/30" />
          <div className="absolute rounded-full border-4 border-black/70 bg-[#ffd84a]/85" style={{ width: 40, height: 40, left: R - 20 + knob.x, top: R - 20 + knob.y }} />
        </div>
      ) : (
        <div className="mz-o pointer-events-none absolute bottom-10 right-6 text-right text-[9px] text-white/50">
          drag to aim
          <br />
          push far to shoot
        </div>
      )}
    </div>
  );
}

function TwinSticks({ ctrl, hud }: { ctrl: GameController | null; hud: Hud | null }) {
  return (
    <>
      <Stick ctrl={ctrl} />
      <AimStick ctrl={ctrl} />
      <Pad label="R" ctrl={ctrl} color="#3a3440cc" className="right-4 top-[26%] h-12 w-12 text-[11px]" onChange={(d) => ctrl?.setButton("reload", d)} />
      <Pad label="KNIFE" ctrl={ctrl} color="#3a3440cc" className="right-[72px] top-[26%] h-12 w-12 text-[7px]" onChange={(d) => ctrl?.setButton("knife", d)} />
      <Pad label="SWAP" ctrl={ctrl} color="#3a3440cc" className="right-[128px] top-[26%] h-12 w-12 text-[7px]" onChange={(d) => ctrl?.setButton("swap", d)} />
      {hud?.prompt && <Pad label="USE" ctrl={ctrl} color="#c89a2acc" className="bottom-[46%] left-1/2 h-16 w-16 -translate-x-1/2 text-[10px]" onChange={(d) => ctrl?.setButton("use", d)} />}
    </>
  );
}

// The right half turns the view; buttons sit on top of it.
function LookPad({ ctrl }: { ctrl: GameController | null }) {
  const last = useRef<{ id: number; x: number; y: number } | null>(null);
  return (
    <div
      className="absolute bottom-0 right-0 top-0 w-1/2"
      onPointerDown={(e) => {
        if (last.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        const l = last.current;
        if (!l || l.id !== e.pointerId) return;
        ctrl?.look(e.clientX - l.x, e.clientY - l.y);
        l.x = e.clientX;
        l.y = e.clientY;
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
    />
  );
}

// A button that can also be dragged to look, so the thumb never leaves FIRE.
function Pad({ label, className, color, ctrl, onChange, look = false }: { label: string; className: string; color: string; ctrl: GameController | null; onChange: (d: boolean) => void; look?: boolean }) {
  const [down, setDown] = useState(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const set = (d: boolean) => {
    setDown(d);
    onChange(d);
  };
  return (
    <button
      type="button"
      data-down={down}
      className={`mz-pad absolute flex items-center justify-center ${className}`}
      style={{ background: color }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        last.current = { x: e.clientX, y: e.clientY };
        set(true);
      }}
      onPointerMove={(e) => {
        if (!look || !last.current) return;
        ctrl?.look(e.clientX - last.current.x, e.clientY - last.current.y);
        last.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => {
        last.current = null;
        set(false);
      }}
      onPointerCancel={() => {
        last.current = null;
        set(false);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

function TouchControls({ ctrl, hud }: { ctrl: GameController | null; hud: Hud | null }) {
  return (
    <>
      <LookPad ctrl={ctrl} />
      <Stick ctrl={ctrl} />
      <Pad label="FIRE" look ctrl={ctrl} color="#b8120fcc" className="bottom-8 right-6 h-[92px] w-[92px] text-[12px]" onChange={(d) => ctrl?.setButton("fire", d)} />
      <Pad label="AIM" look ctrl={ctrl} color="#3a3440cc" className="bottom-[124px] right-[18px] h-14 w-14 text-[9px]" onChange={(d) => ctrl?.setButton("ads", d)} />
      <Pad label="R" ctrl={ctrl} color="#3a3440cc" className="bottom-[40px] right-[118px] h-14 w-14 text-[11px]" onChange={(d) => ctrl?.setButton("reload", d)} />
      <Pad label="KNIFE" ctrl={ctrl} color="#3a3440cc" className="bottom-[104px] right-[96px] h-14 w-14 text-[8px]" onChange={(d) => ctrl?.setButton("knife", d)} />
      <Pad label="SWAP" ctrl={ctrl} color="#3a3440cc" className="right-4 top-[92px] h-12 w-12 text-[7px]" onChange={(d) => ctrl?.setButton("swap", d)} />
      {hud?.prompt && <Pad label="USE" ctrl={ctrl} color="#c89a2acc" className="bottom-[176px] right-[80px] h-16 w-16 text-[10px]" onChange={(d) => ctrl?.setButton("use", d)} />}
    </>
  );
}

function HudView({ hud, pops, touch, fps, onPause }: { hud: Hud; pops: PointsPop[]; touch: boolean; fps: number | null; onPause: () => void }) {
  const low = hud.mag <= Math.ceil(hud.magSize / 4);
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Hurt. */}
      <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 ${60 + hud.hurt * 140}px ${hud.hurt * 60}px rgba(150,0,0,${hud.hurt * 0.85})` }} />

      {/* Crosshair and hitmarker. */}
      {!hud.ads && hud.view === "fps" && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="mz-cross" />
        </div>
      )}
      {hud.hitmarker > 0 && hud.view === "fps" && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ opacity: Math.min(1, hud.hitmarker * 8) }}>
          <div className={`mz-hit ${hud.headHit ? "mz-hit-head" : ""}`} />
        </div>
      )}

      <div className="absolute left-4 top-3">
        <RoundMark round={hud.round} />
        {hud.phase === "between" && <div className="mz-o mt-1 text-[8px] text-[#f3d9a0]">NEXT ROUND…</div>}
      </div>

      {fps !== null && <div className="mz-o absolute left-1/2 top-2 -translate-x-1/2 text-[9px] text-[#7dff9a]">{fps} FPS</div>}

      <button type="button" aria-label="Pause" onClick={onPause} className="mz-btn mz-stone pointer-events-auto absolute right-3 top-3 px-2 py-1.5 text-[10px]">
        II
      </button>

      {/* Power-ups running. */}
      <div className="absolute bottom-[26%] left-1/2 flex -translate-x-1/2 gap-3">
        {hud.insta > 0 && <div className={`mz-power ${hud.insta < 5 ? "mz-blink" : ""}`}>☠</div>}
        {hud.double > 0 && <div className={`mz-power ${hud.double < 5 ? "mz-blink" : ""}`}>x2</div>}
      </div>

      {/* Prompt. */}
      {hud.prompt && (
        <div className={`mz-o absolute left-1/2 ${touch ? (hud.view === "top" ? "bottom-[57%]" : "top-[30%]") : "top-[60%]"} w-[90%] max-w-md -translate-x-1/2 text-center text-[10px] leading-relaxed text-white`}>
          {touch ? "" : "Press E: "}
          {hud.prompt.text}
          {hud.prompt.cost !== undefined && <span className={hud.prompt.can ? "text-[#ffd84a]" : "text-[#ff6a5a]"}> [{hud.prompt.cost.toLocaleString()}]</span>}
        </div>
      )}

      {/* Points and perks. */}
      <div className={`absolute ${touch ? "left-4 top-[88px]" : "bottom-5 left-5"}`}>
        <div className="mb-1 flex gap-1">
          {hud.perks.map((p) => (
            <div key={p} className="mz-perk" style={{ background: PERKS[p].color }} title={PERKS[p].name}>
              {PERKS[p].name[0]}
            </div>
          ))}
        </div>
        <div className="relative">
          <div className="mz-points text-2xl">{hud.points.toLocaleString()}</div>
          <div className="absolute bottom-full left-0">
            {pops.map((p) => (
              <div key={p.id} className="mz-pointpop absolute text-sm" style={{ color: p.amount < 0 ? "#ff6a5a" : "#ffd84a", left: 20 + ((p.id * 37) % 40) }}>
                {p.amount > 0 ? `+${p.amount}` : p.amount}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ammo. */}
      <div className={`absolute text-right ${touch ? "right-[76px] top-3" : "bottom-5 right-5"}`}>
        <div className={`mz-o text-[9px] ${hud.pap ? "text-[#d890ff]" : "text-[#f3d9a0]"}`}>{hud.weapon}</div>
        <div className="mz-o text-xl">
          <span className={hud.mag === 0 ? "text-[#ff4a3a]" : low ? "text-[#ffb04a]" : "text-white"}>{hud.mag}</span>
          <span className="text-sm text-white/70"> / {hud.reserve}</span>
        </div>
        {hud.others.map((o) => (
          <div key={o} className="mz-o text-[8px] text-white/50">
            {o}
          </div>
        ))}
        {hud.mag === 0 && hud.reserve === 0 && <div className="mz-o mz-blink text-[8px] text-[#ff6a5a]">NO AMMO</div>}
        {hud.mag === 0 && hud.reserve > 0 && !hud.reloading && <div className="mz-o text-[8px] text-[#ffb04a]">RELOAD</div>}
      </div>
    </div>
  );
}

function Popups({ popups }: { popups: Popup[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[18%] flex flex-col items-center gap-1 px-4 text-center">
      {popups.map((p) => (
        <div key={p.id} className="mz-pop">
          <div className={p.big ? "mz-title text-5xl" : "mz-o text-sm"} style={{ color: p.color, textShadow: "0 3px 0 #000, 0 0 18px #000" }}>
            {p.text}
          </div>
          {p.sub && <div className="mz-o mt-1 text-[10px] text-white">{p.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function HowTo({ onBack, touch, view }: { onBack: () => void; touch: boolean; view: ViewMode }) {
  const rows: [string, string][] = view === "top"
    ? touch
      ? [
          ["Left stick", "Move. Push far up to run."],
          ["Right stick", "Aim. Push past halfway to shoot."],
          ["USE", "Buy, open doors, rebuild windows (hold)."],
          ["KNIFE / R / SWAP", "Stab, reload, change gun."],
        ]
      : [
          ["WASD", "Move. Shift to run."],
          ["Mouse", "Aim, click to shoot. Or aim and shoot with the arrow keys."],
          ["E", "Buy, open doors, hold to rebuild windows."],
          ["R / V / Q", "Reload, knife, swap guns."],
          ["T", "Switch to first person."],
        ]
    : touch
    ? [
        ["Left side", "Drag to move. Push far up to run."],
        ["Right side", "Drag to look. FIRE and AIM look too."],
        ["USE", "Buy, open doors, rebuild windows (hold)."],
        ["KNIFE / R / SWAP", "Stab, reload, change gun."],
      ]
    : [
        ["Mouse", "Look. Left click shoots, right click aims."],
        ["WASD", "Move. Shift to run."],
        ["E", "Buy, open doors, hold to rebuild windows."],
        ["R / V / Q", "Reload, knife, swap guns."],
        ["T", "Switch to top down."],
        ["Esc", "Pause."],
      ];
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
      <div className="mz-panel max-h-full w-full max-w-md overflow-y-auto p-4">
        <div className="mz-o mb-3 text-center text-sm text-[#d8231f]">HOW TO SURVIVE</div>
        <ul className="space-y-2.5">
          {rows.map(([k, v]) => (
            <li key={k} className="flex gap-3 text-[9px] leading-relaxed">
              <span className="w-28 shrink-0 text-[#ffd84a]">{k}</span>
              <span className="text-white/90">{v}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[9px] leading-relaxed text-[#f3d9a0]">
          Hits and kills earn points. Spend them on guns chalked on the walls, on the mystery box, and on perks: Café Colao, Coquí Cola and Piragua Punch. Open the rubble, then the city gate, then El Morro,
          where the Pack-a-Punch waits. Two hits and you're down — how many rounds can you last?
        </p>
        <Btn color="stone" className="mt-4 w-full" onClick={onBack}>
          BACK
        </Btn>
      </div>
    </div>
  );
}

function Results({ result, best, isBest, onAgain, onMenu }: { result: RunResult; best: number; isBest: boolean; onAgain: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/75 p-4">
      <div className="mz-panel w-full max-w-sm p-4 text-center">
        <div className="mz-title text-5xl text-[#d8231f]">GAME OVER</div>
        <div className="mz-o mt-2 text-[10px] text-[#f3d9a0]">You survived</div>
        <div className="mz-title text-6xl text-white">
          {result.round} {result.round === 1 ? "round" : "rounds"}
        </div>
        <ul className="mt-3 space-y-1.5 text-left text-[10px]">
          <li className="flex justify-between">
            <span className="text-[#f3d9a0]">Kills</span>
            <span>{result.kills}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-[#f3d9a0]">Headshots</span>
            <span>{result.headshots}</span>
          </li>
        </ul>
        <div className="mt-4 text-[9px] text-[#f3d9a0]">SCORE</div>
        <div className="mz-o text-2xl text-[#ffd84a]">{result.score.toLocaleString()}</div>
        <div className={`mt-1 text-[9px] ${isBest ? "mz-blink text-[#7dff9a]" : "text-white/60"}`}>{isBest ? "NEW BEST!" : `Best ${best.toLocaleString()}`}</div>
        <Btn className="mt-4 w-full" onClick={onAgain}>
          PLAY AGAIN
        </Btn>
        <Btn color="stone" className="mt-2 w-full" onClick={onMenu}>
          MENU
        </Btn>
      </div>
    </div>
  );
}

// Muertos en el Viejo San Juan: round-based zombie survival in the streets
// of Old San Juan, from Plaza de San José to the walls of El Morro.
export default function Muertos() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ctrl, setCtrl] = useState<GameController | null>(null);
  const [view, setView] = useState<View>("title");
  const [hud, setHud] = useState<Hud | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [pops, setPops] = useState<PointsPop[]>([]);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<{ run: RunResult; isBest: boolean } | null>(null);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY)) || 0);
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === "1");
  const [sens, setSens] = useState(() => Number(localStorage.getItem(SENS_KEY)) || 1);
  const [touch] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  // Phones start top-down, where twin sticks play best; desktops start in
  // first person. Either can switch.
  const [camView, setCamView] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === "fps" || saved === "top") return saved;
    return window.matchMedia("(pointer: coarse)").matches ? "top" : "fps";
  });
  const [showFps, setShowFps] = useState(() => localStorage.getItem(FPS_KEY) === "1" || new URLSearchParams(window.location.search).has("fps"));
  const [attract] = useState(() => new URLSearchParams(window.location.search).has("attract"));

  useEffect(() => {
    const c = new GameController(hostRef.current!, canvasRef.current!, {
      onHud: setHud,
      onPopup: (p) => setPopups((list) => [...list.slice(-2), p]),
      onPoints: (p) => setPops((list) => [...list.slice(-5), p]),
      onPause: () => setPaused(true),
      onOver: (run) => {
        const prev = Number(localStorage.getItem(BEST_KEY)) || 0;
        const isBest = run.score > prev;
        if (isBest) {
          localStorage.setItem(BEST_KEY, String(run.score));
          setBest(run.score);
        }
        // Inside the arcade cabinet, the arcade saves the score to the leaderboard.
        if (window.parent !== window) window.parent.postMessage({ type: "PLAYER_DIED", score: run.score }, window.location.origin);
        if (document.pointerLockElement) document.exitPointerLock();
        setResult({ run, isBest });
        setView("result");
      },
    });
    c.setMuted(localStorage.getItem(MUTE_KEY) === "1");
    c.setSensitivity(Number(localStorage.getItem(SENS_KEY)) || 1);
    {
      const saved = localStorage.getItem(VIEW_KEY);
      c.setView(saved === "fps" || saved === "top" ? saved : window.matchMedia("(pointer: coarse)").matches ? "top" : "fps");
    }
    setCtrl(c);
    // For screenshots and poking around in dev.
    if (import.meta.env.DEV) (window as unknown as { __muertos: GameController }).__muertos = c;
    return () => c.dispose();
  }, []);

  useEffect(() => {
    if (!popups.length) return;
    const t = window.setTimeout(() => setPopups((list) => list.slice(1)), 2200);
    return () => window.clearTimeout(t);
  }, [popups]);

  useEffect(() => {
    if (!pops.length) return;
    const t = window.setTimeout(() => setPops((list) => list.slice(1)), 700);
    return () => window.clearTimeout(t);
  }, [pops]);

  useEffect(() => {
    ctrl?.setPaused(paused);
  }, [ctrl, paused]);

  useEffect(() => {
    if (view !== "play") return;
    const onHidden = () => document.hidden && setPaused(true);
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [view]);

  useEffect(() => {
    if (view !== "title" && view !== "result") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const start = () => {
    ctrl?.play();
    setHud(null);
    setPopups([]);
    setPops([]);
    setResult(null);
    setPaused(false);
    setView("play");
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

  const toggleView = () => {
    const v: ViewMode = camView === "fps" ? "top" : "fps";
    setCamView(v);
    localStorage.setItem(VIEW_KEY, v);
    ctrl?.setView(v);
  };

  const toggleFps = () => {
    setShowFps(!showFps);
    localStorage.setItem(FPS_KEY, showFps ? "0" : "1");
  };

  // T switches views, any time.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "t" && !e.repeat) toggleView();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const cycleSens = () => {
    const steps = [0.5, 0.75, 1, 1.5, 2];
    const next = steps[(steps.indexOf(sens) + 1) % steps.length] ?? 1;
    setSens(next);
    localStorage.setItem(SENS_KEY, String(next));
    ctrl?.setSensitivity(next);
  };

  const needClick = view === "play" && !paused && !touch && camView === "fps" && ctrl && !ctrl.mouseLocked && hud !== null;

  return (
    <div className="mz-root fixed inset-0 z-50 overflow-hidden bg-black text-white" onPointerDown={() => ctrl?.unlockAudio()}>
      <div ref={hostRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="mz-canvas" style={{ cursor: camView === "top" && view === "play" ? "crosshair" : undefined }} />
      </div>

      {attract ? null : (
        <>
          {view === "play" && hud && <HudView hud={hud} pops={pops} touch={touch} fps={showFps ? hud.fps : null} onPause={() => setPaused(true)} />}
          {view === "play" && <Popups popups={popups} />}
          {view === "play" && touch && !paused && hud && !hud.phase.startsWith("over") && (camView === "top" ? <TwinSticks ctrl={ctrl} hud={hud} /> : <TouchControls ctrl={ctrl} hud={hud} />)}
          {needClick && (
            <div data-grab="1" className="mz-o absolute inset-x-0 bottom-[38%] cursor-pointer text-center text-[10px] text-white/80" onClick={() => ctrl?.lock()}>
              Click to aim with the mouse
            </div>
          )}

          {(view === "title" || view === "howto") && (
            <div className="absolute inset-0 flex flex-col items-center justify-between bg-gradient-to-b from-black/70 via-transparent to-black/85 px-6 pb-8 pt-[8vh]">
              <Logo />
              {view === "title" && (
                <div className="flex w-full max-w-xs flex-col items-stretch gap-3">
                  <Btn className="py-4 text-lg" onClick={start}>
                    PLAY
                  </Btn>
                  <Btn color="stone" className="text-[10px]" onClick={toggleView}>
                    VIEW: {VIEW_NAMES[camView]}
                  </Btn>
                  <div className="grid grid-cols-2 gap-3">
                    <Btn color="stone" className="text-[10px]" onClick={() => setView("howto")}>
                      HOW TO
                    </Btn>
                    <Btn color="stone" className="text-[10px]" onClick={toggleMute}>
                      {muted ? "SOUND OFF" : "SOUND ON"}
                    </Btn>
                  </div>
                  <div className="mz-o text-center text-[9px] text-[#f3d9a0]">{best > 0 ? `BEST ${best.toLocaleString()}` : "Survive the night in Old San Juan."}</div>
                </div>
              )}
            </div>
          )}
          {view === "howto" && <HowTo touch={touch} view={camView} onBack={() => setView("title")} />}

          {view === "play" && paused && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 px-6">
              <div className="mz-title mb-4 text-6xl text-[#d8231f]">PAUSED</div>
              <Btn color="green" className="w-full max-w-xs" onClick={() => setPaused(false)}>
                RESUME
              </Btn>
              <Btn className="w-full max-w-xs" onClick={start}>
                RESTART
              </Btn>
              <Btn color="stone" className="w-full max-w-xs text-[10px]" onClick={toggleView}>
                VIEW: {VIEW_NAMES[camView]}
              </Btn>
              <div className="grid w-full max-w-xs grid-cols-2 gap-3">
                <Btn color="stone" className="text-[10px]" onClick={toggleFps}>
                  {showFps ? "FPS ON" : "FPS OFF"}
                </Btn>
                <Btn color="stone" className="text-[10px]" onClick={toggleMute}>
                  {muted ? "SOUND OFF" : "SOUND ON"}
                </Btn>
                {!touch && camView === "fps" && (
                  <Btn color="stone" className="col-span-2 text-[10px]" onClick={cycleSens}>
                    MOUSE {sens}x
                  </Btn>
                )}
              </div>
              <Btn color="stone" className="w-full max-w-xs" onClick={toMenu}>
                QUIT
              </Btn>
            </div>
          )}

          {view === "result" && result && <Results result={result.run} isBest={result.isBest} best={best} onAgain={start} onMenu={toMenu} />}
        </>
      )}
    </div>
  );
}
