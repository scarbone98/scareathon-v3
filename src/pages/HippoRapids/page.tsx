import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CHECKPOINTS, COURSE_LENGTH, MAX_HULL } from "../../../server/shared/hippoRapids/index.js";
import { GameController, type Hud } from "./game/controller";
import { RoomSocket, roomLink, type RoomStatus, type ServerMessage, type SocketStatus } from "./game/net";
import { HIPPO_LOOKS } from "./game/render";
import { sfx } from "./game/sfx";
import "./hipporapids.css";

type View = "title" | "friends" | "joining" | "lobby" | "play" | "result";

interface Room {
  code: string;
  seat: number;
  seats: number;
  host: number;
  status: RoomStatus;
  names: (string | null)[];
  connected: boolean[];
}

interface Result {
  run: number;
  sinks: number;
  hits: number;
  seats: number;
}

const NAME_KEY = "hippo-rapids-name";
const BEST_KEY = "hippo-rapids-best";
const CODE_LENGTH = 4;

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
};

const stars = (r: Result) => (r.run < 270 && r.sinks === 0 ? 3 : r.run < 400 ? 2 : 1);

function loadName() {
  try {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) return saved;
  } catch {
    // ignore
  }
  return `HIPPO${Math.floor(10 + Math.random() * 90)}`;
}

function loadBest(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function Btn({ children, color = "orange", className = "", disabled, onClick }: { children: ReactNode; color?: string; className?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`hr-btn hr-${color} px-5 py-3 text-lg ${className}`}
      onClick={() => {
        sfx.unlock();
        sfx.blip();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="hr-float pointer-events-none text-center" style={{ filter: "drop-shadow(0 6px 0 rgba(27,16,48,0.55))" }}>
      <div className="hr-title" style={{ fontSize: small ? 40 : 76, color: "#ffe45e", textShadow: "0 4px 0 #b86a00, 0 8px 0 #1b1030" }}>
        HIPPO
      </div>
      <div className="hr-title" style={{ fontSize: small ? 34 : 64, color: "#7cf06a", textShadow: "0 4px 0 #2a7a22, 0 8px 0 #1b1030", marginTop: small ? 2 : 4 }}>
        RAPIDS
      </div>
    </div>
  );
}

function HippoChip({ seat, active = false, size = 44 }: { seat: number; active?: boolean; size?: number }) {
  const look = HIPPO_LOOKS[seat];
  return (
    <div
      className="flex items-center justify-center rounded-full border-[3px] border-[#1b1030]"
      style={{ width: size, height: size, background: look.body, boxShadow: active ? "0 0 0 4px #ffe45e" : undefined, fontSize: size * 0.55 }}
    >
      🦛
    </div>
  );
}

function SeatPicker({ seats, onChange }: { seats: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-3">
      {[2, 4].map((n) => (
        <button
          key={n}
          type="button"
          className={`hr-btn px-4 py-2 text-base ${seats === n ? "hr-green hr-down" : "hr-grey"}`}
          onClick={() => {
            sfx.blip();
            onChange(n);
          }}
        >
          {n} HIPPOS
        </button>
      ))}
    </div>
  );
}

// The thumbstick: wherever the left thumb lands, point it where the raft should go.
function Stick({ onAim }: { onAim: (a: [number, number] | null) => void }) {
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const grip = useRef<{ id: number; cx: number; cy: number; ox: number; oy: number } | null>(null);
  const R = 52;
  const end = () => {
    grip.current = null;
    setKnob(null);
    onAim(null);
  };
  return (
    <div
      className="absolute bottom-0 left-0 top-1/4 w-1/2"
      onPointerDown={(e) => {
        if (grip.current) return;
        sfx.unlock();
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
        onAim([dx / R, -dy / R]);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {knob ? (
        <div className="pointer-events-none absolute" style={{ left: knob.ox - R, top: knob.oy - R, width: R * 2, height: R * 2 }}>
          <div className="absolute inset-0 rounded-full border-4 border-white/50 bg-[#1b1030]/40" />
          <div className="absolute rounded-full border-4 border-[#1b1030] bg-[#ffe45e]" style={{ width: 46, height: 46, left: R - 23 + knob.x, top: R - 23 + knob.y }} />
        </div>
      ) : (
        <div className="hr-o pointer-events-none absolute bottom-10 left-6 max-w-[11rem] text-sm opacity-80">DRAG: WHERE TO GO</div>
      )}
    </div>
  );
}

function FartButton({ onHold }: { onHold: (f: boolean) => void }) {
  const [down, setDown] = useState(false);
  const set = (f: boolean) => {
    setDown(f);
    onHold(f);
  };
  return (
    <button
      type="button"
      className={`hr-btn hr-green absolute bottom-8 right-4 flex h-24 w-24 flex-col items-center justify-center rounded-full text-xl ${down ? "hr-down" : ""}`}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="text-3xl">💨</span>
      FART
    </button>
  );
}

function Gas({ gas, spent, narrow }: { gas: number; spent: boolean; narrow: boolean }) {
  return (
    <div className={`hr-panel px-3 py-2 ${narrow ? "w-36" : "w-56"}`}>
      <div className="hr-o mb-1 flex justify-between text-xs">
        <span>BEANS</span>
        <span className={spent ? "text-[#ff7a6a]" : ""}>{spent ? "OUT!" : ""}</span>
      </div>
      <div className="h-4 overflow-hidden rounded-full border-[3px] border-[#1b1030] bg-[#2a1d46]">
        <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${Math.round(gas * 100)}%`, background: spent ? "#ff7a6a" : gas < 0.3 ? "#ffb02e" : "#9be03a" }} />
      </div>
    </div>
  );
}

function Progress({ hud }: { hud: Hud }) {
  return (
    <div className="relative mx-auto h-5 w-full max-w-md rounded-full border-[3px] border-[#1b1030] bg-[#2a1d46]/80">
      <div className="absolute inset-y-0 left-0 rounded-full bg-[#4aa9f0]" style={{ width: `${hud.progress * 100}%` }} />
      {CHECKPOINTS.map((z, i) => (
        <div key={z} className="absolute top-[-5px] h-[calc(100%+10px)] w-[3px]" style={{ left: `${(z / COURSE_LENGTH) * 100}%`, background: i <= hud.cp ? "#7cff8a" : "#d9d3ee" }} />
      ))}
      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl" style={{ left: `${hud.progress * 100}%`, filter: "drop-shadow(0 2px 0 #1b1030)" }}>
        🛟
      </div>
    </div>
  );
}

function HudBar({ hud, touch }: { hud: Hud; touch: boolean }) {
  const racing = hud.phase === "run";
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-3 pr-28 sm:pr-3">
        <div className="mx-auto flex w-full max-w-md items-start justify-between gap-2">
          <div className="hr-panel px-3 py-1 text-xl" aria-label="Hull">
            {Array.from({ length: MAX_HULL }, (_, i) => (
              <span key={i} className={i < hud.hull ? "" : "opacity-25 grayscale"}>
                🎃
              </span>
            ))}
          </div>
          <div className="hr-panel px-3 py-1 text-center">
            <div className="text-2xl tabular-nums">{fmtTime(hud.run)}</div>
          </div>
        </div>
        <Progress hud={hud} />
        <div className="hr-o text-center text-sm tracking-widest text-[#ffe9b0]">{hud.section.toUpperCase()}</div>
      </div>
      {hud.seat >= 0 && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
          <Gas gas={hud.gas} spent={hud.spent} narrow={touch} />
          {!touch && racing && <div className="hr-o text-xs opacity-80">ARROWS: WHERE TO GO · HOLD SPACE: FART</div>}
        </div>
      )}
      {hud.seats > 1 && (
        <div className="pointer-events-none absolute left-3 top-28 flex flex-col gap-1">
          {hud.names.slice(0, hud.seats).map((n, i) => (
            <div key={i} className="flex items-center gap-2">
              <HippoChip seat={i} active={i === hud.seat} size={26} />
              <div className="hr-o hidden text-xs sm:block" style={{ opacity: hud.humans[i] ? 1 : 0.6 }}>
                {n}
                {!hud.humans[i] && " (BOT)"}
              </div>
              <div className="h-2 w-10 overflow-hidden rounded-full border-2 border-[#1b1030] bg-[#2a1d46]">
                <div className="h-full bg-[#9be03a]" style={{ width: `${Math.round((hud.gases[i] ?? 1) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function HowTo({ onClose, touch }: { onClose: () => void; touch: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#1b1030]/70 p-4">
      <div className="hr-panel max-h-full max-w-md overflow-auto p-5 text-center">
        <div className="hr-title text-4xl text-[#ffe45e]">HOW TO PLAY</div>
        <div className="mt-3 space-y-3 text-left text-base">
          <p>🛟 You are hippos on one round raft. The river only goes one way: downstream.</p>
          <p>
            💨 Farts push the raft the opposite way. {touch ? "Drag the left stick toward where you want to go" : "Press the arrow keys toward where you want to go"}, and your hippo walks round the rim to the right spot.{" "}
            {touch ? "Hold FART" : "Hold SPACE"} to let one rip.
          </p>
          <p>🫘 Beans run out. Rest a moment and they come back, so take turns with your crew.</p>
          <p>🎃 Spiked buoys and spiky logs smash your pumpkins. Lose all five and the raft sinks back to the last green flag.</p>
          <p>🏁 Make it to the finish, together.</p>
        </div>
        <div className="mt-4">
          <Btn color="green" onClick={onClose}>
            GOT IT
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function HippoRapids() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<GameController | null>(null);
  const sockRef = useRef<RoomSocket | null>(null);
  const roomRef = useRef<Room | null>(null);
  const viewRef = useRef<View>("title");
  const [attract] = useState(() => new URLSearchParams(window.location.search).has("attract"));
  const [touch] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [view, setViewState] = useState<View>("title");
  const [hud, setHud] = useState<Hud | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [name, setName] = useState(loadName);
  const [seats, setSeats] = useState(4);
  const [room, setRoomState] = useState<Room | null>(null);
  const [net, setNet] = useState<SocketStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; key: number } | null>(null);
  const [code, setCode] = useState("");
  const [howTo, setHowTo] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(sfx.muted);
  const [best, setBest] = useState(loadBest);
  const [countKey, setCountKey] = useState(0);

  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);
  const setRoom = useCallback((r: Room | null) => {
    roomRef.current = r;
    setRoomState(r);
  }, []);
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const nameRef = useRef(name);
  nameRef.current = name;

  const saveName = (n: string) => {
    const clean = n.replace(/[^\p{L}\p{N} _.-]/gu, "").slice(0, 12);
    setName(clean);
    try {
      localStorage.setItem(NAME_KEY, clean);
    } catch {
      // ignore
    }
  };
  const myName = () => nameRef.current.trim() || "HIPPO";

  // --- the game ---------------------------------------------------------------------------

  useEffect(() => {
    const ctrl = new GameController(hostRef.current!, canvasRef.current!, {
      attract,
      onHud: setHud,
      onFinish: (r) => {
        setResult(r);
        setView("result");
        if (!roomRef.current) {
          const key = `${r.seats}`;
          setBest((b) => {
            const next = { ...b, [key]: Math.min(b[key] ?? Infinity, r.run) };
            try {
              localStorage.setItem(BEST_KEY, JSON.stringify(next));
            } catch {
              // ignore
            }
            return next;
          });
        }
      },
    });
    ctrlRef.current = ctrl;
    // For poking at the game from the console (and recording the cabinet video) in dev.
    if (import.meta.env.DEV) (window as unknown as { hippoRapids?: GameController }).hippoRapids = ctrl;
    return () => {
      ctrl.dispose();
      ctrlRef.current = null;
    };
  }, [attract, setView]);

  // Esc pauses a solo run (online there's no pausing a river).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || viewRef.current !== "play") return;
      setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    ctrlRef.current?.setPaused(paused && !roomRef.current);
  }, [paused]);
  // Leaving the tab pauses a solo run.
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden && viewRef.current === "play" && !roomRef.current) setPaused(true);
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  // A banner when the crew passes a flag, sinks or sets off.
  const lastCp = useRef(-1);
  const lastSunk = useRef(false);
  const lastPhase = useRef("countdown");
  useEffect(() => {
    if (!hud || view !== "play") return;
    if (hud.cp > lastCp.current && hud.cp >= 0) setNote({ text: "CHECKPOINT!", key: Date.now() });
    lastCp.current = hud.cp;
    if (hud.sunk && !lastSunk.current) setNote({ text: "SUNK! BACK TO THE FLAG", key: Date.now() });
    lastSunk.current = hud.sunk;
    if (hud.phase === "run" && lastPhase.current === "countdown") setNote({ text: "GO!", key: Date.now() });
    lastPhase.current = hud.phase;
    if (hud.phase === "countdown") setCountKey(Math.ceil(hud.countdown));
  }, [hud, view]);
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 2200);
    return () => window.clearTimeout(t);
  }, [note]);

  const resetBanners = () => {
    lastCp.current = -1;
    lastSunk.current = false;
    lastPhase.current = "countdown";
    setNote(null);
  };

  const startSolo = () => {
    resetBanners();
    setPaused(false);
    ctrlRef.current?.solo(seats, myName());
    setResult(null);
    setView("play");
  };

  // --- online -----------------------------------------------------------------------------

  const enterRun = (r: Room) => {
    resetBanners();
    setPaused(false);
    setResult(null);
    const sock = sockRef.current;
    ctrlRef.current?.online(r.seat, r.seats, r.names, (m) => sock?.send(m));
    setView("play");
  };

  const onMessage = (m: ServerMessage) => {
    const ctrl = ctrlRef.current;
    switch (m.type) {
      case "snap":
        ctrl?.pushSnap(m);
        break;
      case "room": {
        const prev = roomRef.current;
        const r: Room = { code: m.code, seat: m.seat, seats: m.seats, host: m.host, status: m.status, names: m.names, connected: m.connected };
        setRoom(r);
        setError(null);
        ctrl?.setNames(m.names);
        const v = viewRef.current;
        if (m.status === "playing" && v !== "play" && v !== "result") enterRun(r);
        else if ((m.status === "lobby" && (v === "friends" || v === "joining" || v === "title" || v === "play" || v === "result")) || (m.status === "done" && (v === "friends" || v === "joining" || v === "title"))) {
          // (A raft that already finished is back at the dock for anyone arriving after.)
          if (!prev || prev.seats !== r.seats || v === "play" || v === "result") ctrl?.demo(r.seats);
          setView("lobby");
        }
        break;
      }
      case "start":
        break;
      case "presence": {
        const r = roomRef.current;
        if (r) setRoom({ ...r, connected: m.connected });
        break;
      }
      case "left":
        setNote({ text: `${m.name} ${m.reason === "dropped" ? "DROPPED OUT" : "LEFT"}`, key: Date.now() });
        break;
      case "error":
        setError(m.message);
        if (viewRef.current === "joining") setView("friends");
        break;
      default:
        break;
    }
  };
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const openSocket = (resume = false) => {
    sockRef.current?.close();
    const sock = new RoomSocket((m) => onMessageRef.current(m), setNet, resume);
    sockRef.current = sock;
    return sock;
  };

  const closeSocket = (leave: boolean) => {
    const sock = sockRef.current;
    sockRef.current = null;
    if (leave) sock?.leave();
    else sock?.close();
    setRoom(null);
    setError(null);
  };

  const leaveRoom = () => {
    closeSocket(true);
    ctrlRef.current?.demo(seatsRef.current);
    setPaused(false);
    setView("title");
  };

  const host = () => {
    setError(null);
    setView("joining");
    openSocket().send({ type: "create", name: myName(), seats });
  };

  const join = (c: string) => {
    setError(null);
    setView("joining");
    openSocket().send({ type: "join", code: c, name: myName() });
  };

  // A link with ?room= opens straight into that room; a refresh rejoins the room this tab was in.
  useEffect(() => {
    if (attract) return;
    const link = new URLSearchParams(window.location.search).get("room");
    if (link) {
      setCode(link.toUpperCase().slice(0, CODE_LENGTH));
      setView("friends");
    } else if (RoomSocket.savedRoom()) {
      setView("joining");
      openSocket(true);
    }
    return () => {
      sockRef.current?.close();
      sockRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- picture ----------------------------------------------------------------------------

  const iAmHost = !!room && room.host === room.seat;
  const toggleMute = () => {
    sfx.unlock();
    sfx.setMuted(!muted);
    setMuted(!muted);
  };
  const changeSeats = (n: number) => {
    setSeats(n);
    ctrlRef.current?.demo(n);
  };
  const linkCopied = useRef(0);
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    if (!room) return;
    const url = roomLink(room.code);
    try {
      if (navigator.share && touch) await navigator.share({ title: "Hippo Rapids", text: `Hop on my raft! Room ${room.code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.clearTimeout(linkCopied.current);
        linkCopied.current = window.setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      // Cancelled share or no clipboard: the code is on screen anyway.
    }
  };

  const online = !!room;

  return (
    <div ref={hostRef} className="hr-root relative h-full min-h-[100dvh] w-full overflow-hidden bg-[#2a1d63]" style={{ height: "100%" }}>
      <canvas ref={canvasRef} className="hr-canvas absolute inset-0" />

      {!attract && (
        <>
          <button type="button" className="hr-btn hr-grey absolute right-3 top-3 z-20 h-10 w-10 text-lg" onClick={toggleMute} aria-label="Sound">
            {muted ? "🔇" : "🔊"}
          </button>
          {view === "play" && (
            <button type="button" className="hr-btn hr-grey absolute right-16 top-3 z-20 h-10 w-10 text-lg" onClick={() => setPaused((p) => !p)} aria-label="Menu">
              ☰
            </button>
          )}
        </>
      )}

      {!attract && view === "title" && (
        <div className="absolute inset-0 flex flex-col items-center justify-between gap-2 p-4 pb-5">
          <div className="flex flex-col items-center gap-1 pt-2">
            <Logo />
            <p className="hr-o max-w-xs text-center text-base text-[#fff0c8]">Everyone farts. One raft. Don't hit the buoys.</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="hr-o text-sm">NAME</span>
                <input className="hr-input w-36 px-2 py-1 text-base" value={name} maxLength={12} onChange={(e) => saveName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
              </div>
              <SeatPicker seats={seats} onChange={changeSeats} />
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Btn color="green" className="w-60" onClick={startSolo}>
                ▶ PLAY WITH BOTS
              </Btn>
              <Btn color="orange" className="w-60" onClick={() => setView("friends")}>
                PLAY WITH FRIENDS
              </Btn>
            </div>
            <div className="flex items-center gap-4">
              <Btn color="blue" className="!py-2 !text-base" onClick={() => setHowTo(true)}>
                HOW TO PLAY
              </Btn>
              {best[`${seats}`] && (
                <div className="hr-o text-sm text-[#ffe45e]">
                  BEST ({seats} HIPPOS): {fmtTime(best[`${seats}`])}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!attract && view === "friends" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
          <Logo small />
          <div className="hr-panel flex w-full max-w-xs flex-col items-center gap-3 p-4">
            <div className="hr-o text-lg">HOST A RAFT</div>
            <SeatPicker seats={seats} onChange={changeSeats} />
            <Btn color="green" className="w-full" onClick={host}>
              GET A ROOM CODE
            </Btn>
            <div className="hr-o mt-2 text-lg">OR JOIN ONE</div>
            <input
              className="hr-input w-36 py-2 text-2xl uppercase tracking-[0.3em]"
              placeholder="CODE"
              value={code}
              maxLength={CODE_LENGTH}
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && code.length === CODE_LENGTH) join(code);
              }}
            />
            <Btn color="orange" className="w-full" disabled={code.length !== CODE_LENGTH} onClick={() => join(code)}>
              JUMP ABOARD
            </Btn>
            {error && <div className="text-center text-sm text-[#ff9a8a]">{error}</div>}
          </div>
          <Btn
            color="grey"
            className="!py-2 !text-base"
            onClick={() => {
              setError(null);
              setView("title");
            }}
          >
            BACK
          </Btn>
        </div>
      )}

      {!attract && view === "joining" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
          <Logo small />
          <div className="hr-o text-xl">{net === "open" ? "BLOWING UP THE RAFT…" : "CONNECTING…"}</div>
          {error && <div className="text-center text-[#ff9a8a]">{error}</div>}
          <Btn color="grey" className="!py-2 !text-base" onClick={leaveRoom}>
            CANCEL
          </Btn>
        </div>
      )}

      {!attract && view === "lobby" && room && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
          <Logo small />
          <div className="hr-panel flex w-full max-w-sm flex-col items-center gap-3 p-4">
            <div className="hr-o text-sm">ROOM CODE</div>
            <div className="hr-title text-6xl tracking-[0.15em] text-[#ffe45e]">{room.code}</div>
            <Btn color="blue" className="!py-2 !text-base" onClick={copyLink}>
              {copied ? "COPIED!" : touch ? "SHARE INVITE" : "COPY INVITE LINK"}
            </Btn>
            <div className="grid w-full grid-cols-2 gap-2">
              {Array.from({ length: room.seats }, (_, i) => {
                const n = room.names[i];
                const here = !!n && room.connected[i];
                return (
                  <div key={i} className="flex items-center gap-2 rounded-xl bg-[#2a1d46] p-2" style={{ opacity: here ? 1 : 0.55 }}>
                    <HippoChip seat={i} active={i === room.seat} size={36} />
                    <div className="min-w-0 text-sm">
                      <div className="truncate">{n ?? "BOT"}</div>
                      <div className="text-xs opacity-70">{i === room.host ? "HOST" : i === room.seat ? "YOU" : here ? "" : n ? "AWAY" : "WAITING"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-center text-xs opacity-80">Empty seats get a bot hippo. Friends can hop on any time, even mid-river.</div>
            {iAmHost ? (
              <Btn color="green" className="w-full" onClick={() => sockRef.current?.send({ type: "start" })}>
                ▶ SET OFF
              </Btn>
            ) : (
              <div className="hr-o text-sm">WAITING FOR {room.names[room.host] ?? "THE HOST"}…</div>
            )}
          </div>
          {note && <div className="hr-o hr-note text-sm">{note.text}</div>}
          <Btn color="grey" className="!py-2 !text-base" onClick={leaveRoom}>
            LEAVE
          </Btn>
        </div>
      )}

      {!attract && view === "play" && hud && (
        <>
          <HudBar hud={hud} touch={touch} />
          {hud.phase === "countdown" && countKey > 0 && (
            <div key={countKey} className="hr-pop hr-title hr-o pointer-events-none absolute inset-x-0 top-1/4 text-center text-9xl text-[#ffe45e]">
              {countKey}
            </div>
          )}
          {note && (
            <div key={note.key} className="hr-note hr-title hr-o pointer-events-none absolute inset-x-0 top-1/3 text-center text-5xl text-[#fff4a8]">
              {note.text}
            </div>
          )}
          {touch && hud.seat >= 0 && !paused && (
            <>
              <Stick onAim={(a) => ctrlRef.current?.setTouchAim(a)} />
              <FartButton onHold={(f) => ctrlRef.current?.setTouchFart(f)} />
            </>
          )}
          {paused && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#1b1030]/70">
              <div className="hr-title text-6xl text-[#ffe45e]">{online ? "MENU" : "PAUSED"}</div>
              {!online && (
                <Btn color="green" onClick={() => setPaused(false)}>
                  RESUME
                </Btn>
              )}
              {online && (
                <Btn color="green" onClick={() => setPaused(false)}>
                  BACK TO THE RIVER
                </Btn>
              )}
              <Btn
                color="grey"
                onClick={() => {
                  setPaused(false);
                  if (online) leaveRoom();
                  else {
                    ctrlRef.current?.demo(seats);
                    setView("title");
                  }
                }}
              >
                {online ? "LEAVE THE RAFT" : "QUIT"}
              </Btn>
            </div>
          )}
          {online && net !== "open" && <div className="hr-o absolute inset-x-0 top-28 text-center text-lg text-[#ff9a8a]">RECONNECTING…</div>}
        </>
      )}

      {!attract && view === "result" && result && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1b1030]/55 p-4">
          <div className="hr-pop hr-title text-7xl text-[#ffe45e]" style={{ textShadow: "0 5px 0 #b86a00, 0 10px 0 #1b1030" }}>
            YOU MADE IT!
          </div>
          <div className="hr-o text-5xl">{"⭐".repeat(stars(result))}{"☆".repeat(3 - stars(result))}</div>
          <div className="hr-panel flex flex-col items-center gap-1 px-8 py-4 text-lg">
            <div className="text-4xl tabular-nums">{fmtTime(result.run)}</div>
            <div className="text-sm opacity-80">
              {result.hits} {result.hits === 1 ? "BUOY HIT" : "BUOYS HIT"} · SUNK {result.sinks}×
            </div>
            {!online && best[`${result.seats}`] === result.run && <div className="text-sm text-[#7cf06a]">NEW BEST!</div>}
          </div>
          <div className="flex gap-3">
            {!online && (
              <Btn color="green" onClick={startSolo}>
                AGAIN
              </Btn>
            )}
            {online && iAmHost && (
              <Btn color="green" onClick={() => sockRef.current?.send({ type: "again" })}>
                AGAIN
              </Btn>
            )}
            {online && !iAmHost && <div className="hr-o self-center text-sm">WAITING FOR THE HOST…</div>}
            <Btn
              color="grey"
              onClick={() => {
                if (online) leaveRoom();
                else {
                  ctrlRef.current?.demo(seats);
                  setView("title");
                }
              }}
            >
              {online ? "LEAVE" : "MENU"}
            </Btn>
          </div>
        </div>
      )}

      {!attract && howTo && <HowTo touch={touch} onClose={() => setHowTo(false)} />}
    </div>
  );
}
