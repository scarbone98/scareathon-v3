import { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LEVELS, MAX_HULL, RING_BONUS, getLevel, type Level } from "../../../server/shared/hippoRapids/index.js";
import { GameController, SAY, type Hud } from "./game/controller";
import { RoomSocket, roomLink, type RoomStatus, type ServerMessage, type SocketStatus } from "./game/net";
import { MenuList, RoomRows, type MenuItem, type RoomRow } from "./menus";
import { HIPPO_LOOKS } from "./game/render";
import { sfx } from "./game/sfx";
import { MEDALS, decodeLevel, fmtTime, loadCustom, loadRecords, medalFor, newLevelId, recordKey, saveCustom, saveRecords, type Record, type SavedLevel } from "./levels";
import "./hipporapids.css";

const Editor = lazy(() => import("./Editor"));

type View = "title" | "levels" | "rooms" | "host" | "joining" | "lobby" | "play" | "result" | "editor";

interface Room {
  code: string;
  seat: number;
  seats: number;
  host: number;
  level: string;
  def: Level | null;
  public: boolean;
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

function Logo({ small = false, left = false }: { small?: boolean; left?: boolean }) {
  return (
    <div className={`hr-float pointer-events-none ${left ? "text-center sm:text-left" : "text-center"}`}>
      <div className="hr-title" style={{ fontSize: small ? 44 : 88, color: "#ffe9a0", textShadow: "0 0 26px rgba(255,170,60,0.7), 0 3px 0 rgba(130,70,0,0.5), 0 6px 18px rgba(10,4,30,0.7)" }}>
        HIPPO
      </div>
      <div className="hr-title" style={{ fontSize: small ? 36 : 72, color: "#b8ff9a", textShadow: "0 0 26px rgba(110,240,120,0.65), 0 3px 0 rgba(30,100,30,0.5), 0 6px 18px rgba(10,4,30,0.7)", marginTop: small ? 0 : 2 }}>
        RAPIDS
      </div>
    </div>
  );
}

function HippoChip({ seat, active = false, size = 44 }: { seat: number; active?: boolean; size?: number }) {
  const look = HIPPO_LOOKS[seat];
  return (
    <div
      className="flex items-center justify-center rounded-full border border-white/25"
      style={{ width: size, height: size, background: look.body, boxShadow: active ? "0 0 14px 3px rgba(255,200,90,0.8)" : undefined, fontSize: size * 0.55 }}
    >
      🦛
    </div>
  );
}

function SeatPicker({ seats, onChange }: { seats: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-3">
      {[1, 2, 4].map((n) => (
        <button
          key={n}
          type="button"
          className={`hr-btn px-4 py-2 text-base ${seats === n ? "hr-green hr-down" : "hr-grey"}`}
          onClick={() => {
            sfx.blip();
            onChange(n);
          }}
        >
          {n === 1 ? "SOLO" : `${n} HIPPOS`}
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
      <div className="h-4 overflow-hidden rounded-full border border-white/25 bg-[#2a1d46]">
        <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${Math.round(gas * 100)}%`, background: spent ? "#ff7a6a" : gas < 0.3 ? "#ffb02e" : "#9be03a" }} />
      </div>
    </div>
  );
}

function Progress({ hud }: { hud: Hud }) {
  return (
    <div className="relative mx-auto h-5 w-full max-w-md rounded-full border border-white/25 bg-[#2a1d46]/80">
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
              <div className="h-2 w-10 overflow-hidden rounded-full border border-white/25 bg-[#2a1d46]">
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
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [hostRiver, setHostRiver] = useState("lagoon");
  const [hostPublic, setHostPublic] = useState(true);
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
  // Alone on a small raft is slower going, so the medal times stretch a bit.
  const parFor = (par: [number, number, number]): [number, number, number] => (seats === 1 ? [Math.round(par[0] * 1.3), Math.round(par[1] * 1.3), Math.round(par[2] * 1.3)] : par);
  const playBuiltIn = (id: string) => {
    const l = getLevel(id);
    if (l) startSolo({ key: id, name: l.def.name, value: id, par: parFor(l.par), testing: false });
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
        const r: Room = { code: m.code, seat: m.seat, seats: m.seats, host: m.host, level: m.level, def: m.def, public: m.public, status: m.status, names: m.names, connected: m.connected };
        const lk = m.level + (m.def ? JSON.stringify(m.def) : "");
        const levelChanged = lk !== roomLevel.current.key;
        if (levelChanged) roomLevel.current = { key: lk, value: m.def ?? m.level };
        setRoom(r);
        setError(null);
        ctrl?.setNames(m.names);
        const v = viewRef.current;
        if (m.status === "playing" && v !== "play" && v !== "result") enterRun(r);
        else if ((m.status === "lobby" && (v === "rooms" || v === "host" || v === "joining" || v === "title" || v === "play" || v === "result")) || (m.status === "done" && (v === "rooms" || v === "host" || v === "joining" || v === "title"))) {
          // (A raft that already finished is back at the dock for anyone arriving after.)
          if (!prev || prev.seats !== r.seats || levelChanged || v === "play" || v === "result") ctrl?.demo(r.seats, roomLevel.current.value);
          setView("lobby");
        }
        break;
      }
      case "rooms":
        setRooms(m.rooms);
        break;
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
        if (viewRef.current === "joining") setView("rooms");
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

  // Every river a host can pick: the built-in ones, then the player's own.
  const riverOptions = () => [...LEVELS.map((l) => ({ id: l.id, name: l.def.name, value: l.id as string | Level })), ...custom.map((c) => ({ id: c.id, name: c.def.name, value: c.def as string | Level }))];

  const host = () => {
    setError(null);
    setView("joining");
    const pick = riverOptions().find((o) => o.id === hostRiver) ?? riverOptions()[0];
    openSocket().send({ type: "create", name: myName(), seats, level: pick.value, public: hostPublic });
  };

  const quickPlay = () => {
    setError(null);
    setView("joining");
    openSocket().send({ type: "quick", name: myName(), seats });
  };

  // The room finder keeps its own connection open and asks for the list every couple of seconds.
  const openFinder = () => {
    setError(null);
    setRooms([]);
    openSocket();
    setView("rooms");
  };

  const join = (c: string) => {
    setError(null);
    setView("joining");
    (sockRef.current ?? openSocket()).send({ type: "join", code: c, name: myName() });
  };

  const backToTitle = () => {
    sockRef.current?.close();
    sockRef.current = null;
    setError(null);
    setView("title");
  };

  // Cycles through the rivers on offer: -1 or +1.
  const nextRiver = (current: string, dir: number) => {
    const opts = riverOptions();
    const i = Math.max(0, opts.findIndex((o) => o.id === current));
    return opts[(i + dir + opts.length) % opts.length];
  };

  // A link with ?room= opens straight into that room; a refresh rejoins the room this tab was in.
  useEffect(() => {
    if (attract) return;
    const link = new URLSearchParams(window.location.search).get("room");
    if (link) {
      setCode(link.toUpperCase().slice(0, CODE_LENGTH));
      setView("rooms");
      setRooms([]);
      openSocket();
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

  // The room finder asks for the list of open rafts every couple of seconds.
  useEffect(() => {
    if (view !== "rooms" || net !== "open") return;
    const ask = () => sockRef.current?.send({ type: "list" });
    ask();
    const t = window.setInterval(ask, 2500);
    return () => window.clearInterval(t);
  }, [view, net]);

  // Behind the menus the camera drifts slowly round the raft.
  useEffect(() => {
    ctrlRef.current?.setMenuCam(!attract && ["title", "levels", "rooms", "host", "joining", "lobby", "result"].includes(view));
  }, [view, attract]);

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

      {!attract && ["title", "levels", "rooms", "host", "joining", "lobby", "result"].includes(view) && <div className="hr-vignette" />}
      {!attract && ["title", "rooms", "host", "joining", "lobby"].includes(view) && <div className="hr-side-fade" />}
      {!attract && view === "title" && (
        <div className="hr-left hr-soft-in">
          <Logo left small={short} />
          <p className="hr-o max-w-xs text-center text-xs tracking-[0.3em] text-[#e8d9ff] sm:text-left">EVERYONE FARTS · ONE RAFT · DON'T WAKE THE DEAD</p>
          <MenuList
            active={!howTo}
            items={[
              { key: "solo", label: "Play", hint: "Solo, or with a crew of bots" },
              { key: "quick", label: "Quick play", hint: "Hop on any open raft" },
              { key: "find", label: "Find a room", hint: "See who's on the water" },
              { key: "host", label: "Host a room", hint: "Start your own raft" },
              { key: "editor", label: "Level editor", hint: "Build a river" },
              { key: "how", label: "How to play" },
            ]}
            onPick={(k) => {
              if (k === "solo") setView("levels");
              else if (k === "quick") quickPlay();
              else if (k === "find") openFinder();
              else if (k === "host") setView("host");
              else if (k === "editor") openEditor(null);
              else setHowTo(true);
            }}
          />
          <label className="flex items-center gap-3 text-[0.7rem] tracking-[0.25em] text-[#cbbdf0]">
            PLAYER
            <input className="hr-input w-36 px-2 py-1 text-sm" value={name} maxLength={12} onChange={(e) => saveName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </label>
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
                  <div className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-white/25 text-2xl" style={{ background: l.color }}>
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-lg leading-tight">{l.def.name}</div>
                    <div className="text-xs opacity-80">{l.blurb}</div>
                    <div className="mt-1 text-xs opacity-70">
                      {l.def.finish} m · gold {fmtTime(parFor(l.par)[0])}
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

      {!attract && view === "rooms" && (
        <div className="hr-left hr-soft-in">
          {!short && <Logo left small />}
          <div className="hr-o text-xs tracking-[0.35em] text-[#ffd9a8]">FIND A ROOM</div>
          <div className="hr-glass flex flex-col gap-3 p-4" style={{ minWidth: "min(36rem, 90vw)" }}>
            {net !== "open" ? (
              <div className="py-4 text-center text-xs tracking-[0.25em] opacity-80">CONNECTING…</div>
            ) : rooms.length === 0 ? (
              <div className="py-4 text-center text-xs tracking-[0.2em] opacity-80">NO OPEN RAFTS RIGHT NOW. HOST ONE, OR TRY QUICK PLAY.</div>
            ) : (
              <>
                <div className="flex px-10 text-[0.6rem] tracking-[0.25em] opacity-60">
                  <span className="w-[38%]">HOST</span>
                  <span className="w-[34%]">RIVER</span>
                  <span className="w-[28%] text-right">SEATS</span>
                </div>
                <RoomRows rooms={rooms} onJoin={join} onBack={backToTitle} />
              </>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <label className="flex items-center gap-2 text-[0.65rem] tracking-[0.25em] opacity-90">
                CODE
                <input
                  className="hr-input w-24 py-1 text-lg uppercase tracking-[0.3em]"
                  placeholder="····"
                  value={code}
                  maxLength={CODE_LENGTH}
                  autoCapitalize="characters"
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter" && code.length === CODE_LENGTH) join(code);
                  }}
                />
              </label>
              <div className="flex gap-2">
                <Btn color="orange" className="!px-4 !py-2 !text-sm" disabled={code.length !== CODE_LENGTH} onClick={() => join(code)}>
                  JOIN
                </Btn>
                <Btn color="grey" className="!px-4 !py-2 !text-sm" onClick={backToTitle}>
                  BACK
                </Btn>
              </div>
            </div>
            {error && <div className="text-center text-xs tracking-wider text-[#ff9a8a]">{error}</div>}
          </div>
        </div>
      )}

      {!attract && view === "host" && (
        <div className="hr-left hr-soft-in">
          {!short && <Logo left small />}
          <div className="hr-o text-xs tracking-[0.35em] text-[#ffd9a8]">HOST A ROOM</div>
          <div className="hr-glass p-3">
            <MenuList
              items={[
                { key: "seats", label: "Seats", value: `${seats === 2 ? 2 : 4} hippos` },
                { key: "river", label: "River", value: riverOptions().find((o) => o.id === hostRiver)?.name ?? "" },
                { key: "public", label: "Room", value: hostPublic ? "Open" : "Private" },
                { key: "go", label: "Open the room", hint: hostPublic ? "Shows up in the room finder" : "Only people with the code" },
                { key: "back", label: "Back" },
              ]}
              onPick={(k) => (k === "go" ? host() : k === "back" ? setView("title") : undefined)}
              onLeft={(k) => (k === "seats" ? changeSeats(seats === 2 ? 4 : 2) : k === "river" ? setHostRiver(nextRiver(hostRiver, -1).id) : k === "public" ? setHostPublic(!hostPublic) : undefined)}
              onRight={(k) => (k === "seats" ? changeSeats(seats === 2 ? 4 : 2) : k === "river" ? setHostRiver(nextRiver(hostRiver, 1).id) : k === "public" ? setHostPublic(!hostPublic) : undefined)}
              onBack={() => setView("title")}
            />
          </div>
          {error && <div className="text-xs tracking-wider text-[#ff9a8a]">{error}</div>}
        </div>
      )}

      {!attract && view === "joining" && (
        <div className="hr-left hr-soft-in">
          {!short && <Logo left small />}
          <div className="hr-o text-xs tracking-[0.35em] text-[#ffd9a8]">{net === "open" ? "BLOWING UP THE RAFT…" : "CONNECTING…"}</div>
          {error && <div className="text-xs tracking-wider text-[#ff9a8a]">{error}</div>}
          <div className="hr-glass p-3">
            <MenuList items={[{ key: "cancel", label: "Cancel" }]} onPick={leaveRoom} onBack={leaveRoom} />
          </div>
        </div>
      )}

      {!attract && view === "lobby" && room && (
        <div className="hr-left hr-soft-in">
          {!short && <Logo left small />}
          <div className="hr-glass flex flex-col gap-3 p-4" style={{ minWidth: "min(24rem, 90vw)" }}>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[0.6rem] tracking-[0.35em] opacity-70">ROOM CODE</div>
                <div className="hr-title text-6xl tracking-[0.16em]" style={{ color: "#ffe9a0", textShadow: "0 0 22px rgba(255,170,60,0.6)" }}>
                  {room.code}
                </div>
              </div>
              <div className="pb-2 text-right text-[0.6rem] tracking-[0.25em] opacity-80">{room.public ? "OPEN ROOM" : "PRIVATE"}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: room.seats }, (_, i) => {
                const n = room.names[i];
                const here = !!n && room.connected[i];
                return (
                  <div key={i} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-2" style={{ opacity: here ? 1 : 0.5 }}>
                    <HippoChip seat={i} active={i === room.seat} size={34} />
                    <div className="min-w-0 text-sm">
                      <div className="truncate">{n ?? "BOT"}</div>
                      <div className="text-[0.6rem] tracking-[0.2em] opacity-70">{i === room.host ? "HOST" : i === room.seat ? "YOU" : here ? "" : n ? "AWAY" : "EMPTY"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <MenuList
              items={[
                ...(iAmHost ? [{ key: "go", label: "Set off", hint: "Empty seats get bots" }] : [{ key: "wait", label: `Waiting for ${room.names[room.host] ?? "the host"}`, disabled: true }]),
                { key: "river", label: "River", value: room.def ? room.def.name : (getLevel(room.level)?.def.name ?? room.level), disabled: !iAmHost },
                ...(iAmHost ? [{ key: "public", label: "Room", value: room.public ? "Open" : "Private" }] : []),
                { key: "invite", label: copied ? "Copied!" : touch ? "Share invite" : "Copy invite link" },
                { key: "leave", label: "Leave" },
              ] as MenuItem[]}
              onPick={(k) => {
                if (k === "go") sockRef.current?.send({ type: "start" });
                else if (k === "invite") void copyLink();
                else if (k === "leave") leaveRoom();
              }}
              onLeft={(k) => {
                if (k === "river" && iAmHost) {
                  const o = nextRiver(room.def ? "" : room.level, -1);
                  sockRef.current?.send({ type: "level", level: o.value });
                } else if (k === "public") sockRef.current?.send({ type: "public", public: !room.public });
              }}
              onRight={(k) => {
                if (k === "river" && iAmHost) {
                  const o = nextRiver(room.def ? "" : room.level, 1);
                  sockRef.current?.send({ type: "level", level: o.value });
                } else if (k === "public") sockRef.current?.send({ type: "public", public: !room.public });
              }}
              onBack={leaveRoom}
            />
          </div>
          {note && <div className="hr-o hr-note text-sm">{note.text}</div>}
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
