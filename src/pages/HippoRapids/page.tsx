import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LEVELS, MAX_HULL, RING_BONUS, getLevel, type Level } from "../../../server/shared/hippoRapids/index.js";
import { GameController, SAY, type Hud } from "./game/controller";
import { RoomSocket, roomLink, type RoomStatus, type ServerMessage, type SocketStatus } from "./game/net";
import { HIPPO_LOOKS } from "./game/render";
import { sfx } from "./game/sfx";
import { MEDALS, decodeLevel, fmtTime, loadCustom, loadRecords, medalFor, newLevelId, recordKey, saveCustom, saveRecords, type Record, type SavedLevel } from "./levels";
import "./hipporapids.css";

const Editor = lazy(() => import("./Editor"));

type View = "title" | "levels" | "friends" | "joining" | "lobby" | "play" | "result" | "editor";

interface Room {
  code: string;
  seat: number;
  seats: number;
  host: number;
  level: string;
  def: Level | null;
  status: RoomStatus;
  names: (string | null)[];
  connected: boolean[];
}

interface Result {
  run: number;
  sinks: number;
  hits: number;
  seats: number;
  rings: number;
  ringsTotal: number;
}

// What's being rafted: a built-in or one of the player's own, with its par times if it has any.
interface Playing {
  key: string;
  name: string;
  value: string | Level;
  par: [number, number, number] | null;
  testing: boolean;
}

const NAME_KEY = "hippo-rapids-name";
const CODE_LENGTH = 4;

function loadName() {
  try {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) return saved;
  } catch {
    // ignore
  }
  return `HIPPO${Math.floor(10 + Math.random() * 90)}`;
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
function Stick({ onAim, hint }: { onAim: (a: [number, number] | null) => void; hint: boolean }) {
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
      ) : hint ? (
        <div className="hr-o pointer-events-none absolute left-5 text-sm opacity-80" style={{ bottom: "max(7rem, calc(env(safe-area-inset-bottom) + 6rem))" }}>
          DRAG: WHERE TO GO
        </div>
      ) : null}
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
      className={`hr-btn hr-green absolute flex h-24 w-24 flex-col items-center justify-center rounded-full text-xl ${down ? "hr-down" : ""}`}
      style={{ touchAction: "none", right: "max(1rem, env(safe-area-inset-right))", bottom: "max(2rem, calc(env(safe-area-inset-bottom) + 1rem))" }}
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
      {hud.checkpoints.map((f, i) => (
        <div key={i} className="absolute top-[-5px] h-[calc(100%+10px)] w-[3px]" style={{ left: `${f * 100}%`, background: i <= hud.cp ? "#7cff8a" : "#d9d3ee" }} />
      ))}
      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl" style={{ left: `${hud.progress * 100}%`, filter: "drop-shadow(0 2px 0 #1b1030)" }}>
        🛟
      </div>
    </div>
  );
}

function HudBar({ hud, touch, par, online, onSay }: { hud: Hud; touch: boolean; par: [number, number, number] | null; online: boolean; onSay: (k: number) => void }) {
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
            {(par || hud.ringsTotal > 0) && (
              <div className="text-[10px] opacity-80">
                {hud.ringsTotal > 0 && <span>⭕ {hud.ringsGot}/{hud.ringsTotal} </span>}
                {par && <span>🥇 {fmtTime(par[0])}</span>}
              </div>
            )}
          </div>
        </div>
        <Progress hud={hud} />
        <div className="hr-o text-center text-sm tracking-widest text-[#ffe9b0]">{hud.section.toUpperCase()}</div>
      </div>
      {online && hud.seat >= 0 && (
        <div className="absolute right-2 flex flex-col gap-1" style={{ bottom: touch ? "9.5rem" : "0.75rem" }}>
          {SAY.map((text, k) => (
            <button key={text} type="button" className="hr-btn hr-blue px-2 py-1 text-xs" onClick={() => onSay(k)}>
              {!touch && <span className="opacity-60">{k + 1} </span>}
              {text}
            </button>
          ))}
        </div>
      )}
      {hud.seat >= 0 && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
          <Gas gas={hud.gas} spent={hud.spent} narrow={touch} />
          {!touch && racing && hud.run < 8 && <div className="hr-o text-xs opacity-80">ARROWS: WHERE TO GO · HOLD SPACE: FART</div>}
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
          <p>You're hippos on one round raft. Farts push the raft the opposite way.</p>
          <p>
            {touch ? "Drag the left stick" : "Use the arrow keys"} toward where you want to go and your hippo walks to the right spot. {touch ? "Hold FART" : "Hold SPACE"} to toot. Beans run out, so take turns.
          </p>
          <p>Spikes cost a pumpkin. Rings save a second. Some bits take the whole crew.</p>
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

// A phone on its side is under ~500px tall: tighten things up.
function useShort() {
  const [short, setShort] = useState(() => window.innerHeight < 520);
  useEffect(() => {
    const on = () => setShort(window.innerHeight < 520);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return short;
}

export default function HippoRapids() {
  const short = useShort();
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
  const [custom, setCustomState] = useState<SavedLevel[]>(loadCustom);
  const [records, setRecords] = useState(loadRecords);
  const [playing, setPlayingState] = useState<Playing | null>(null);
  const [draft, setDraft] = useState<SavedLevel | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const playingRef = useRef<Playing | null>(null);
  const hudRef = useRef<Hud | null>(null);
  // The level the room is rafting, kept as one object so the scene isn't rebuilt on every room message.
  const roomLevel = useRef<{ key: string; value: string | Level }>({ key: "", value: "lagoon" });
  const setPlaying = (p: Playing | null) => {
    playingRef.current = p;
    setPlayingState(p);
  };
  const setCustom = (list: SavedLevel[]) => {
    setCustomState(list);
    saveCustom(list);
  };
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
      onHud: (h) => {
        hudRef.current = h;
        setHud(h);
      },
      onFinish: (r) => {
        setResult(r);
        setView("result");
        const pl = playingRef.current;
        if (roomRef.current || !pl || pl.testing) return;
        // Solo: the time that counts is after the ring bonus; keep the best and the best medal.
        const time = r.run - r.rings * RING_BONUS;
        const medal = pl.par ? medalFor(pl.par, time) : 0;
        const key = recordKey(pl.key, r.seats);
        setRecords((rs) => {
          const old = rs[key];
          const next = { ...rs, [key]: { time: old ? Math.min(old.time, time) : time, medal: Math.max(old?.medal ?? 0, medal) as Record["medal"] } };
          saveRecords(next);
          return next;
        });
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

  const openEditor = (saved: SavedLevel | null) => {
    setDraft(saved);
    setView("editor");
  };

  const startSolo = (p: Playing) => {
    resetBanners();
    setPaused(false);
    setPlaying(p);
    ctrlRef.current?.solo(seats, myName(), p.value);
    setResult(null);
    setView("play");
  };
  const playBuiltIn = (id: string) => {
    const l = getLevel(id);
    if (l) startSolo({ key: id, name: l.def.name, value: id, par: l.par, testing: false });
  };
  const playCustom = (c: SavedLevel) => startSolo({ key: c.id, name: c.def.name, value: c.def, par: null, testing: false });
  const nextLevel = () => {
    const i = LEVELS.findIndex((l) => l.id === playing?.key);
    if (i >= 0 && i < LEVELS.length - 1) playBuiltIn(LEVELS[i + 1].id);
  };
  // Leaving a run goes back to wherever it was started: the editor for a test, the levels otherwise.
  const leaveRun = () => {
    const testing = playingRef.current?.testing;
    ctrlRef.current?.demo(seats, testing && draft ? draft.def : "lagoon");
    setPaused(false);
    setView(testing ? "editor" : "levels");
  };

  // --- online -----------------------------------------------------------------------------

  const enterRun = (r: Room) => {
    resetBanners();
    setPaused(false);
    setResult(null);
    const sock = sockRef.current;
    setPlaying(null);
    ctrlRef.current?.online(r.seat, r.seats, r.names, (m) => sock?.send(m), roomLevel.current.value);
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
        const r: Room = { code: m.code, seat: m.seat, seats: m.seats, host: m.host, level: m.level, def: m.def, status: m.status, names: m.names, connected: m.connected };
        const lk = m.level + (m.def ? JSON.stringify(m.def) : "");
        const levelChanged = lk !== roomLevel.current.key;
        if (levelChanged) roomLevel.current = { key: lk, value: m.def ?? m.level };
        setRoom(r);
        setError(null);
        ctrl?.setNames(m.names);
        const v = viewRef.current;
        if (m.status === "playing" && v !== "play" && v !== "result") enterRun(r);
        else if ((m.status === "lobby" && (v === "friends" || v === "joining" || v === "title" || v === "play" || v === "result")) || (m.status === "done" && (v === "friends" || v === "joining" || v === "title"))) {
          // (A raft that already finished is back at the dock for anyone arriving after.)
          if (!prev || prev.seats !== r.seats || levelChanged || v === "play" || v === "result") ctrl?.demo(r.seats, roomLevel.current.value);
          setView("lobby");
        }
        break;
      }
      case "say":
        ctrl?.onSay(m.seat, m.k);
        break;
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
    openSocket().send({ type: "create", name: myName(), seats, level: "lagoon" });
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
        <div className="hr-screen hr-title-screen">
          <div className="flex flex-col items-center gap-1 pt-2">
            <Logo small={short} />
            <p className="hr-o max-w-xs text-center text-base text-[#fff0c8]">Everyone farts. One raft. Don't wake the dead.</p>
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
              <Btn color="green" className="w-60" onClick={() => setView("levels")}>
                ▶ PLAY
              </Btn>
              <Btn color="orange" className="w-60" onClick={() => setView("friends")}>
                PLAY WITH FRIENDS
              </Btn>
            </div>
            <div className="flex items-center gap-3">
              <Btn color="pink" className="!py-2 !text-base" onClick={() => openEditor(null)}>
                LEVEL EDITOR
              </Btn>
              <Btn color="blue" className="!py-2 !text-base" onClick={() => setHowTo(true)}>
                HOW TO PLAY
              </Btn>
            </div>
          </div>
        </div>
      )}

      {!attract && view === "levels" && (
        <div className="hr-screen hr-top">
          <Logo small />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <SeatPicker seats={seats} onChange={changeSeats} />
          </div>
          <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
            {LEVELS.map((l, i) => {
              const rec = records[recordKey(l.id, seats)];
              return (
                <button key={l.id} type="button" className="hr-panel flex items-stretch gap-3 p-3 text-left active:translate-y-1" onClick={() => (sfx.unlock(), sfx.blip(), playBuiltIn(l.id))}>
                  <div className="flex w-12 shrink-0 items-center justify-center rounded-xl border-[3px] border-[#1b1030] text-2xl" style={{ background: l.color }}>
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-lg leading-tight">{l.def.name}</div>
                    <div className="text-xs opacity-80">{l.blurb}</div>
                    <div className="mt-1 text-xs opacity-70">
                      {l.def.finish} m · gold {fmtTime(l.par[0])}
                    </div>
                  </div>
                  <div className="flex w-16 shrink-0 flex-col items-end justify-center text-right">
                    <div className="text-2xl">{rec ? MEDALS[rec.medal] || "·" : ""}</div>
                    {rec && <div className="text-xs tabular-nums opacity-80">{fmtTime(rec.time)}</div>}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="hr-o mt-2 text-lg">MY RIVERS</div>
          <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
            {custom.map((c) => {
              const rec = records[recordKey(c.id, seats)];
              return (
                <div key={c.id} className="hr-panel flex items-center gap-2 p-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => (sfx.unlock(), sfx.blip(), playCustom(c))}>
                    <div className="truncate text-lg leading-tight">{c.def.name}</div>
                    <div className="text-xs opacity-70">
                      {c.def.finish} m · {c.def.items.length} things{rec ? ` · best ${fmtTime(rec.time)}` : ""}
                    </div>
                  </button>
                  <button type="button" className="hr-btn hr-blue px-2 py-1 text-sm" onClick={() => openEditor(c)}>
                    EDIT
                  </button>
                  <button
                    type="button"
                    className="hr-btn hr-grey px-2 py-1 text-sm"
                    onClick={() => window.confirm(`Delete "${c.def.name}"?`) && setCustom(custom.filter((x) => x.id !== c.id))}
                  >
                    🗑
                  </button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2">
              <Btn color="pink" className="!py-2 !text-base" onClick={() => openEditor(null)}>
                + NEW RIVER
              </Btn>
              <Btn color="blue" className="!py-2 !text-base" onClick={() => setImporting("")}>
                IMPORT CODE
              </Btn>
            </div>
          </div>
          <Btn color="grey" className="!py-2 !text-base" onClick={() => setView("title")}>
            BACK
          </Btn>
        </div>
      )}

      {!attract && importing !== null && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#1b1030]/80 p-4">
          <div className="hr-panel flex w-full max-w-md flex-col gap-2 p-4">
            <div className="text-lg">PASTE A LEVEL CODE</div>
            <textarea className="hr-input h-32 p-2 text-left font-mono text-xs" value={importing} onChange={(e) => setImporting(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            <div className="flex justify-end gap-2">
              <Btn
                color="green"
                className="!py-2 !text-base"
                onClick={() => {
                  const def = decodeLevel(importing);
                  if (!def) {
                    setError("That doesn't look like a level code.");
                    return;
                  }
                  setCustom([...custom, { id: newLevelId(), def }]);
                  setImporting(null);
                  setError(null);
                }}
              >
                ADD IT
              </Btn>
              <Btn color="grey" className="!py-2 !text-base" onClick={() => (setImporting(null), setError(null))}>
                CANCEL
              </Btn>
            </div>
            {error && <div className="text-sm text-[#ff9a8a]">{error}</div>}
          </div>
        </div>
      )}

      {view === "editor" && (
        <Suspense fallback={<div className="hr-o absolute inset-0 flex items-center justify-center bg-[#16213a] text-xl">LOADING THE MAP…</div>}>
          <Editor
            initial={draft}
            onExit={() => {
              setDraft(null);
              ctrlRef.current?.demo(seats, "lagoon");
              setView("title");
            }}
            onTest={(saved) => {
              setDraft(saved);
              startSolo({ key: "test", name: saved.def.name, value: saved.def, par: null, testing: true });
            }}
            onSave={(saved) => {
              setDraft(saved);
              setCustom(custom.some((c) => c.id === saved.id) ? custom.map((c) => (c.id === saved.id ? saved : c)) : [...custom, saved]);
            }}
          />
        </Suspense>
      )}

      {!attract && view === "friends" && (
        <div className="hr-screen">
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
        <div className="hr-screen">
          <Logo small />
          <div className="hr-o text-xl">{net === "open" ? "BLOWING UP THE RAFT…" : "CONNECTING…"}</div>
          {error && <div className="text-center text-[#ff9a8a]">{error}</div>}
          <Btn color="grey" className="!py-2 !text-base" onClick={leaveRoom}>
            CANCEL
          </Btn>
        </div>
      )}

      {!attract && view === "lobby" && room && (
        <div className="hr-screen">
          <Logo small />
          <div className="hr-panel flex w-full max-w-sm flex-col items-center gap-3 p-4">
            <div className="hr-o text-sm">ROOM CODE</div>
            <div className="hr-title text-6xl tracking-[0.15em] text-[#ffe45e]">{room.code}</div>
            <Btn color="blue" className="!py-2 !text-base" onClick={copyLink}>
              {copied ? "COPIED!" : touch ? "SHARE INVITE" : "COPY INVITE LINK"}
            </Btn>
            <div className="flex w-full items-center justify-between gap-2 text-sm">
              <span className="opacity-80">RIVER</span>
              {iAmHost ? (
                <select
                  className="hr-input max-w-[12rem] px-2 py-1 text-sm"
                  value={room.def ? "custom" : room.level}
                  onChange={(e) => {
                    const v = e.target.value;
                    const mine = custom.find((c) => c.id === v);
                    sockRef.current?.send({ type: "level", level: mine ? mine.def : v });
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {room.def && <option value="custom">{room.def.name} (custom)</option>}
                  {LEVELS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.def.name}
                    </option>
                  ))}
                  {custom.length > 0 && <option disabled>— my rivers —</option>}
                  {custom.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.def.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-right">{room.def ? `${room.def.name} (custom)` : (getLevel(room.level)?.def.name ?? room.level)}</span>
              )}
            </div>
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
            <div className="text-center text-xs opacity-80">Empty seats get bots.</div>
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
          <HudBar hud={hud} touch={touch} par={online ? null : (playing?.par ?? null)} online={online} onSay={(k) => ctrlRef.current?.say(k)} />
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
              <Stick hint={hud.run < 6} onAim={(a) => ctrlRef.current?.setTouchAim(a)} />
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
                  else leaveRun();
                }}
              >
                {online ? "LEAVE THE RAFT" : playing?.testing ? "BACK TO THE EDITOR" : "QUIT"}
              </Btn>
            </div>
          )}
          {online && net !== "open" && <div className="hr-o absolute inset-x-0 top-28 text-center text-lg text-[#ff9a8a]">RECONNECTING…</div>}
        </>
      )}

      {!attract && view === "result" && result && (() => {
        const time = result.run - result.rings * RING_BONUS;
        const medal = !online && playing?.par ? medalFor(playing.par, time) : 0;
        const rec = playing && !online ? records[recordKey(playing.key, result.seats)] : undefined;
        const nextId = LEVELS[LEVELS.findIndex((l) => l.id === playing?.key) + 1]?.id;
        return (
          <div className="hr-screen bg-[#1b1030]/55">
            <div className="hr-pop hr-title text-7xl text-[#ffe45e]" style={{ textShadow: "0 5px 0 #b86a00, 0 10px 0 #1b1030" }}>
              YOU MADE IT!
            </div>
            <div className="hr-o text-lg">{hud?.levelName?.toUpperCase()}</div>
            {medal > 0 && <div className="hr-pop text-6xl">{MEDALS[medal]}</div>}
            <div className="hr-panel flex flex-col items-center gap-1 px-8 py-4 text-lg">
              <div className="text-4xl tabular-nums">{fmtTime(time)}</div>
              {result.ringsTotal > 0 && (
                <div className="text-sm opacity-90">
                  {fmtTime(result.run)} − {result.rings}/{result.ringsTotal} rings ({(result.rings * RING_BONUS).toFixed(0)}s)
                </div>
              )}
              <div className="text-sm opacity-80">
                {result.hits} {result.hits === 1 ? "HIT" : "HITS"} · SUNK {result.sinks}×
              </div>
              {!online && playing?.par && (
                <div className="text-xs opacity-70">
                  🥇 {fmtTime(playing.par[0])} · 🥈 {fmtTime(playing.par[1])} · 🥉 {fmtTime(playing.par[2])}
                </div>
              )}
              {rec && Math.abs(rec.time - time) < 0.001 && !playing?.testing && <div className="text-sm text-[#7cf06a]">NEW BEST!</div>}
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {!online && playing && (
                <Btn color="green" onClick={() => startSolo(playing)}>
                  AGAIN
                </Btn>
              )}
              {!online && nextId && !playing?.testing && (
                <Btn color="orange" onClick={nextLevel}>
                  NEXT RIVER
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
                  else leaveRun();
                }}
              >
                {online ? "LEAVE" : playing?.testing ? "EDITOR" : "RIVERS"}
              </Btn>
            </div>
          </div>
        );
      })()}

      {!attract && howTo && <HowTo touch={touch} onClose={() => setHowTo(false)} />}
    </div>
  );
}
