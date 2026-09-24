import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MATCH_TICKS, OVERTIME_TICKS, TICK_RATE, getCard, type Team } from "../../../server/shared/royale/index.js";
import { MatchController, NetDriver, type Hud } from "./game/controller";
import { BOT_REACTION, PRESET_DECKS, type Difficulty } from "./game/decks";
import { ClashSocket, savedSession, type ServerMessage, type SocketStatus } from "./game/net";

const ORANGE = "#ff8a1f";
const PURPLE = "#b061ff";
const NAME_KEY = "crypt-clash-name";
const DECK_KEY = "crypt-clash-deck";

function loadPref(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered; fine.
  }
}

function deckById(id: string) {
  return (PRESET_DECKS.find((d) => d.id === id) ?? PRESET_DECKS[0]).cards;
}

function CardArt({ id, size }: { id: string; size: number }) {
  const { frameWidth: fw, frameHeight: fh, frames, url } = getCard(id).sprite;
  const k = size / Math.max(fw, fh);
  return (
    <div
      style={{
        width: fw * k,
        height: fh * k,
        backgroundImage: `url(${url})`,
        backgroundSize: `${fw * frames * k}px ${fh * k}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}

function formatClock(ticks: number) {
  const secs = Math.max(0, Math.ceil(ticks / TICK_RATE));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

const panel = "rounded-lg border-2 border-[#4a3060] bg-[#2a1a3a]";
const picked = "rounded-lg border-2 border-[#ffcf4a] bg-[#3c2656]";
const primary = "rounded-lg bg-[#ff8a1f] py-3 text-lg font-bold tracking-widest text-[#1a1026] hover:bg-[#ffa04a] disabled:opacity-50";
const secondary = "rounded-lg border-2 border-[#4a3060] bg-[#2a1a3a] py-3 font-bold tracking-widest hover:bg-[#3c2656]";

function DeckPicker({ deckId, onPick }: { deckId: string; onPick: (id: string) => void }) {
  return (
    <div className="mt-2 space-y-2">
      {PRESET_DECKS.map((d) => (
        <button key={d.id} onClick={() => onPick(d.id)} className={`w-full p-3 text-left ${d.id === deckId ? picked : panel}`}>
          <div className="flex items-baseline justify-between">
            <span className="font-bold">{d.name}</span>
            <span className="text-[10px] text-white/50">avg {(d.cards.reduce((s, id) => s + getCard(id).cost, 0) / d.cards.length).toFixed(1)} elixir</span>
          </div>
          <div className="text-[11px] text-white/60">{d.blurb}</div>
          <div className="mt-2 grid grid-cols-8 gap-1">
            {d.cards.map((id) => (
              <div key={id} className="relative flex h-10 items-center justify-center rounded bg-black/30" title={getCard(id).name}>
                <CardArt id={id} size={26} />
                <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#c23bd4] text-[9px] font-bold">{getCard(id).cost}</span>
              </div>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

function NameField({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  return (
    <label className="mt-6 block">
      <span className="text-xs uppercase tracking-widest text-white/50">Your name</span>
      <input
        value={name}
        maxLength={20}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border-2 border-[#4a3060] bg-[#2a1a3a] px-3 py-2 outline-none focus:border-[#ffcf4a]"
      />
    </label>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col overflow-y-auto px-4 py-6">{children}</div>;
}

function Title({ subtitle }: { subtitle: string }) {
  return (
    <>
      <h1 className="mt-4 text-center text-3xl font-bold tracking-widest text-[#ffcf4a]">CRYPT CLASH</h1>
      <p className="mt-1 text-center text-xs text-white/60">{subtitle}</p>
    </>
  );
}

// ---------- menu ----------

function Menu({ onBot, onChallenge }: { onBot: (deck: string[], difficulty: Difficulty) => void; onChallenge: (deck: string[], name: string) => void }) {
  const [deckId, setDeckId] = useState(() => loadPref(DECK_KEY, PRESET_DECKS[0].id));
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [name, setName] = useState(() => loadPref(NAME_KEY, `Guest ${Math.floor(1000 + Math.random() * 9000)}`));
  const pickDeck = (id: string) => {
    setDeckId(id);
    savePref(DECK_KEY, id);
  };
  return (
    <Shell>
      <Link to="/" className="text-xs text-white/50 hover:text-white">
        ← back
      </Link>
      <Title subtitle="Knock down the enemy towers. Protect your own." />
      <h2 className="mt-6 text-xs uppercase tracking-widest text-white/50">Pick a deck</h2>
      <DeckPicker deckId={deckId} onPick={pickDeck} />

      <h2 className="mt-6 text-xs uppercase tracking-widest text-white/50">Play a friend</h2>
      <NameField name={name} onChange={setName} />
      <button
        onClick={() => {
          savePref(NAME_KEY, name);
          onChallenge(deckById(deckId), name);
        }}
        className={`mt-3 w-full ${primary}`}
      >
        CHALLENGE A FRIEND
      </button>

      <h2 className="mt-8 text-xs uppercase tracking-widest text-white/50">Or practice against a bot</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
          <button key={d} onClick={() => setDifficulty(d)} className={`py-2 text-sm capitalize ${d === difficulty ? picked : panel}`}>
            {d}
          </button>
        ))}
      </div>
      <button onClick={() => onBot(deckById(deckId), difficulty)} className={`mt-3 w-full ${secondary}`}>
        BATTLE THE BOT
      </button>
      <p className="mt-3 text-center text-[11px] text-white/40">Drag a card onto your side, or tap a card then tap where it goes.</p>
    </Shell>
  );
}

// ---------- the arena and HUD (bot and online) ----------

interface MatchViewProps {
  onReady: (ctrl: MatchController) => void;
  names?: [string, string]; // [you, them]
  opponentOnline?: boolean;
  connection?: SocketStatus;
  rematch?: { mine: boolean; theirs: boolean } | null;
  opponentLeft?: boolean;
  onRematch: () => void;
  onExit: () => void;
}

function MatchView({ onReady, names, opponentOnline = true, connection = "open", rematch, opponentLeft, onRematch, onExit }: MatchViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<MatchController | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const dragRef = useRef<{ slot: number; x: number; y: number; moved: boolean } | null>(null);
  const hudRef = useRef<Hud | null>(null);
  const selectedRef = useRef<number | null>(null);
  hudRef.current = hud;
  selectedRef.current = selected;

  useEffect(() => {
    let toastTimer = 0;
    const ctrl = new MatchController(hostRef.current!, setHud, (message) => {
      setToast(message);
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setToast(null), 1200);
    });
    ctrlRef.current = ctrl;
    onReady(ctrl);
    return () => {
      window.clearTimeout(toastTimer);
      ctrl.dispose();
      ctrlRef.current = null;
    };
    // One controller per mount; later matches reuse it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag a card onto the arena, or tap a card and then tap the arena.
  useEffect(() => {
    const cardAt = (slot: number | null) => (slot === null ? null : hudRef.current?.hand[slot] ?? null);
    const move = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) drag.moved = true;
      ctrlRef.current?.setPreview(cardAt(drag ? drag.slot : selectedRef.current), e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      const ctrl = ctrlRef.current;
      const drag = dragRef.current;
      dragRef.current = null;
      if (!ctrl) return;
      if (drag) {
        if (!drag.moved) return; // a tap: stay selected and wait for the arena tap
        const card = cardAt(drag.slot);
        if (card) ctrl.play(card, e.clientX, e.clientY);
        setSelected(null);
        ctrl.setPreview(null);
        return;
      }
      const card = cardAt(selectedRef.current);
      if (card && e.target === hostRef.current?.querySelector("canvas") && ctrl.play(card, e.clientX, e.clientY)) {
        setSelected(null);
        ctrl.setPreview(null);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const over = !!hud?.result;
  useEffect(() => {
    if (over) setSelected(null);
  }, [over]);

  const cardDown = (slot: number, e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    if (selected === slot && !dragRef.current) {
      setSelected(null);
      ctrlRef.current?.setPreview(null);
      return;
    }
    dragRef.current = { slot, x: e.clientX, y: e.clientY, moved: false };
    setSelected(slot);
  };

  const overtime = hud?.phase === "overtime";
  const clock = hud ? (overtime ? MATCH_TICKS + OVERTIME_TICKS - hud.tick : MATCH_TICKS - hud.tick) : MATCH_TICKS;
  const result = hud?.result;
  const won = result && result.winner === hud?.me;
  const lost = result && result.winner !== null && result.winner !== hud?.me;

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex-1 overflow-hidden">
        <div ref={hostRef} className="absolute inset-0" />
        {hud && (
          <>
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-center">
              <div className="text-[9px] uppercase tracking-widest text-white/50">{overtime ? "overtime" : "time left"}</div>
              <div className={`text-lg font-bold leading-none ${overtime ? "text-[#ff5a5a]" : ""}`}>{formatClock(clock)}</div>
            </div>
            <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 rounded bg-black/60 px-2 py-1 text-sm">
                {names && (
                  <span className="max-w-[9rem] truncate text-xs" style={{ color: PURPLE }}>
                    {names[1]}
                    {!opponentOnline && !opponentLeft && <span className="ml-1 text-white/50">(reconnecting…)</span>}
                    {opponentLeft && <span className="ml-1 text-white/50">(left)</span>}
                  </span>
                )}
                <span style={{ color: PURPLE }}>{"♛".repeat(hud.crowns[1]) || "·"}</span>
              </div>
              <div className="flex items-center gap-2 rounded bg-black/60 px-2 py-1 text-sm">
                {names && (
                  <span className="max-w-[9rem] truncate text-xs" style={{ color: ORANGE }}>
                    {names[0]}
                  </span>
                )}
                <span style={{ color: ORANGE }}>{"♛".repeat(hud.crowns[0]) || "·"}</span>
              </div>
            </div>
            {hud.doubleElixir && !result && (
              <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded bg-[#c23bd4] px-2 py-0.5 text-xs font-bold">2x ELIXIR</div>
            )}
            {hud.countdown > 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="text-7xl font-bold text-[#ffcf4a] drop-shadow-[0_4px_0_#000]">{hud.countdown}</div>
              </div>
            )}
          </>
        )}
        {connection !== "open" && !result && (
          <div className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-xs text-[#ffcf4a]">Reconnecting…</div>
        )}
        {toast && !result && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-sm text-[#ff9a9a]">{toast}</div>
        )}
        {result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 px-6 text-center">
            <div className="text-4xl font-bold tracking-widest" style={{ color: won ? "#ffcf4a" : lost ? PURPLE : "#ffffff" }}>
              {won ? "VICTORY" : lost ? "DEFEAT" : "DRAW"}
            </div>
            <div className="text-2xl">
              <span style={{ color: ORANGE }}>{hud?.crowns[0]}</span>
              <span className="mx-3 text-white/40">–</span>
              <span style={{ color: PURPLE }}>{hud?.crowns[1]}</span>
            </div>
            {rematch?.theirs && !rematch.mine && <div className="text-sm text-[#ffcf4a]">{names?.[1]} wants a rematch!</div>}
            {opponentLeft && <div className="text-sm text-white/60">{names?.[1]} left the room.</div>}
            <div className="flex gap-3">
              <button onClick={onRematch} disabled={!!rematch?.mine || opponentLeft} className="rounded-lg bg-[#ff8a1f] px-5 py-2 font-bold text-[#1a1026] disabled:opacity-50">
                {rematch?.mine ? `Waiting for ${names?.[1] ?? "them"}…` : "Rematch"}
              </button>
              <button onClick={onExit} className="rounded-lg border-2 border-[#4a3060] bg-[#2a1a3a] px-5 py-2">
                Leave
              </button>
            </div>
          </div>
        )}
      </div>

      {hud && (
        <div className="border-t-4 border-[#2a1a3a] bg-[#1a1026] px-2 pb-2 pt-2">
          <div className="flex items-end gap-2">
            <div className="flex w-11 flex-col items-center text-[10px] text-white/60">
              next
              <div className="mt-1 flex h-12 w-10 items-center justify-center rounded bg-[#2a1a3a] opacity-70">
                <CardArt id={hud.next} size={26} />
              </div>
            </div>
            {hud.hand.map((id, i) => {
              const card = getCard(id);
              const affordable = hud.elixir >= card.cost && !hud.pending.includes(id);
              return (
                <button
                  key={`${i}-${id}`}
                  onPointerDown={(e) => cardDown(i, e)}
                  className={`relative flex h-24 flex-1 touch-none flex-col items-center justify-end rounded-md border-2 pb-1 transition-transform ${
                    selected === i ? "-translate-y-2 border-[#ffcf4a] bg-[#3c2656]" : "border-[#4a3060] bg-[#2a1a3a]"
                  } ${affordable ? "" : "opacity-50 grayscale"}`}
                >
                  <div className="flex flex-1 items-center justify-center">
                    <CardArt id={id} size={46} />
                  </div>
                  <div className="text-[10px] leading-none">{card.name}</div>
                  <div className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#1a1026] bg-[#c23bd4] text-xs font-bold">{card.cost}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex h-5 w-7 items-center justify-center rounded bg-[#c23bd4] text-xs font-bold">{Math.floor(hud.elixir)}</div>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-[#2a1a3a]">
              <div className="h-full bg-gradient-to-r from-[#9b2fc0] to-[#e05ae8]" style={{ width: `${hud.elixir * 10}%` }} />
              <div className="absolute inset-0 flex">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="flex-1 border-r border-[#1a1026]/80 last:border-r-0" />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- bot games ----------

function BotGame({ deck, difficulty, onExit }: { deck: string[]; difficulty: Difficulty; onExit: () => void }) {
  const ctrlRef = useRef<MatchController | null>(null);
  const start = () => {
    const botDeck = PRESET_DECKS[Math.floor(Math.random() * PRESET_DECKS.length)].cards;
    void ctrlRef.current?.startBot({ playerDeck: deck, botDeck, reaction: BOT_REACTION[difficulty], seed: `${Date.now()}-${Math.random()}` });
  };
  return (
    <MatchView
      onReady={(ctrl) => {
        ctrlRef.current = ctrl;
        start();
      }}
      onRematch={start}
      onExit={onExit}
    />
  );
}

// ---------- friend games ----------

type OnlineIntent = { kind: "create"; deck: string[]; name: string } | { kind: "join"; code: string } | { kind: "resume"; code: string };

function inviteLink(code: string) {
  return `${window.location.origin}/crypt-clash?room=${code}`;
}

function OnlineGame({ intent, onExit }: { intent: OnlineIntent; onExit: () => void }) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [screen, setScreen] = useState<"connecting" | "lobby" | "invite" | "match" | "error">(intent.kind === "join" ? "invite" : "connecting");
  const [code, setCode] = useState<string | null>(intent.kind === "create" ? null : intent.code);
  const [host, setHost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<[string, string] | undefined>();
  const [presence, setPresence] = useState<[boolean, boolean]>([true, true]);
  const [rematch, setRematch] = useState<{ mine: boolean; theirs: boolean } | null>(null);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deckId, setDeckId] = useState(() => loadPref(DECK_KEY, PRESET_DECKS[0].id));
  const [name, setName] = useState(() => loadPref(NAME_KEY, `Guest ${Math.floor(1000 + Math.random() * 9000)}`));

  const socketRef = useRef<ClashSocket | null>(null);
  const ctrlRef = useRef<MatchController | null>(null);
  const teamRef = useRef<Team>(0);
  const driverRef = useRef<NetDriver | null>(null);
  // The current match's start (and any newer snapshot) stay around so a
  // remounted controller (StrictMode runs effects twice) can start it too.
  const currentStart = useRef<Extract<ServerMessage, { type: "start" }> | null>(null);
  const latestSync = useRef<Extract<ServerMessage, { type: "sync" }>["state"] | null>(null);
  const launched = useRef<{ ctrl: MatchController; start: object } | null>(null);
  const lastSyncAsk = useRef(0);

  const launch = useCallback(() => {
    const ctrl = ctrlRef.current;
    const start = currentStart.current;
    const driver = driverRef.current;
    if (!ctrl || !start || !driver) return;
    if (launched.current?.ctrl === ctrl && launched.current.start === start) return;
    launched.current = { ctrl, start };
    void ctrl.startNet({ seed: start.seed, decks: start.decks, startsInMs: start.startsInMs }, driver);
    if (latestSync.current) ctrl.sync(latestSync.current);
  }, []);

  useEffect(() => {
    const onMessage = (m: ServerMessage) => {
      switch (m.type) {
        case "room-info":
          if (m.status === "missing") {
            setError("That challenge link has expired or doesn't exist.");
            setScreen("error");
          } else if (m.status === "full") {
            setError("Someone already accepted that challenge.");
            setScreen("error");
          } else setHost(m.host ?? null);
          break;
        case "room":
          setCode(m.code);
          teamRef.current = m.team;
          window.history.replaceState(null, "", `/crypt-clash?room=${m.code}`);
          if (m.status === "waiting" && m.team === 0) setScreen("lobby");
          break;
        case "start": {
          const me = m.team;
          teamRef.current = me;
          setNames([m.names[me], m.names[1 - me]]);
          setRematch(null);
          setOpponentLeft(false);
          const socket = socketRef.current!;
          driverRef.current = new NetDriver(
            me,
            (play) => socket.send({ type: "play", card: play.card, x: play.x, z: play.z }),
            () => {
              if (performance.now() - lastSyncAsk.current < 1000) return;
              lastSyncAsk.current = performance.now();
              socket.send({ type: "resync" });
            },
          );
          currentStart.current = m;
          latestSync.current = null;
          setScreen("match");
          launch();
          break;
        }
        case "tick":
          driverRef.current?.receive(m);
          break;
        case "sync":
          latestSync.current = m.state;
          if (ctrlRef.current && launched.current?.ctrl === ctrlRef.current) ctrlRef.current.sync(m.state);
          break;
        case "presence":
          setPresence(m.connected);
          break;
        case "rematch": {
          const me = teamRef.current;
          setRematch({ mine: m.ready[me], theirs: m.ready[1 - me] });
          break;
        }
        case "left":
          if (m.team !== teamRef.current) setOpponentLeft(true);
          break;
        case "error":
          setError(m.message);
          setScreen("error");
          break;
        default:
          break;
      }
    };
    const resume = intent.kind === "resume" ? savedSession() : null;
    const socket = new ClashSocket(onMessage, setStatus, resume);
    socketRef.current = socket;
    if (intent.kind === "create") socket.send({ type: "create", name: intent.name, deck: intent.deck });
    if (intent.kind === "join") socket.send({ type: "peek", code: intent.code });
    return () => {
      socket.close();
      socketRef.current = null;
    };
    // The session is set up once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = () => {
    socketRef.current?.leave();
    window.history.replaceState(null, "", "/crypt-clash");
    onExit();
  };

  if (screen === "match") {
    const me = teamRef.current;
    return (
      <MatchView
        onReady={(ctrl) => {
          ctrlRef.current = ctrl;
          launch();
        }}
        names={names}
        opponentOnline={presence[1 - me]}
        connection={status}
        rematch={rematch}
        opponentLeft={opponentLeft}
        onRematch={() => socketRef.current?.send({ type: "rematch" })}
        onExit={leave}
      />
    );
  }

  if (screen === "error") {
    return (
      <Shell>
        <Title subtitle="" />
        <p className="mt-10 text-center text-[#ff9a9a]">{error}</p>
        <button onClick={leave} className={`mt-6 ${secondary}`}>
          BACK
        </button>
      </Shell>
    );
  }

  if (screen === "invite") {
    return (
      <Shell>
        <Title subtitle={host ? `${host} challenged you!` : "Loading the challenge…"} />
        <h2 className="mt-6 text-xs uppercase tracking-widest text-white/50">Pick a deck</h2>
        <DeckPicker
          deckId={deckId}
          onPick={(id) => {
            setDeckId(id);
            savePref(DECK_KEY, id);
          }}
        />
        <NameField name={name} onChange={setName} />
        <button
          disabled={!host}
          onClick={() => {
            savePref(NAME_KEY, name);
            socketRef.current?.send({ type: "join", code, name, deck: deckById(deckId) });
          }}
          className={`mt-4 ${primary}`}
        >
          ACCEPT CHALLENGE
        </button>
        <button onClick={leave} className="mt-3 text-sm text-white/50 hover:text-white">
          No thanks
        </button>
      </Shell>
    );
  }

  const link = code ? inviteLink(code) : "";
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Crypt Clash", text: "I challenge you to Crypt Clash!", url: link });
        return;
      } catch {
        // Cancelled; fall through to copy.
      }
    }
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Shell>
      <Title subtitle={screen === "lobby" ? "Waiting for your friend to accept…" : "Setting up the room…"} />
      {screen === "lobby" && (
        <>
          <p className="mt-10 text-center text-sm text-white/70">Send this link to a friend. The match starts as soon as they accept.</p>
          <div className="mt-3 break-all rounded-lg border-2 border-dashed border-[#4a3060] bg-black/30 p-3 text-center text-sm text-[#ffcf4a]">{link}</div>
          <button onClick={share} className={`mt-4 ${primary}`}>
            {copied ? "COPIED!" : "SHARE LINK"}
          </button>
          <div className="mt-8 flex justify-center">
            <div className="h-3 w-3 animate-ping rounded-full bg-[#ff8a1f]" />
          </div>
        </>
      )}
      {status === "reconnecting" && <p className="mt-6 text-center text-xs text-[#ffcf4a]">Reconnecting to the server…</p>}
      <button onClick={leave} className="mt-10 text-sm text-white/50 hover:text-white">
        Cancel
      </button>
    </Shell>
  );
}

// ---------- page ----------

type Screen = { kind: "menu" } | { kind: "bot"; deck: string[]; difficulty: Difficulty } | { kind: "online"; intent: OnlineIntent };

function initialScreen(): Screen {
  const code = new URLSearchParams(window.location.search).get("room");
  if (!code) return { kind: "menu" };
  // Back after a refresh or dropped tab: rejoin the room we were in.
  const session = savedSession();
  if (session?.code === code) return { kind: "online", intent: { kind: "resume", code } };
  return { kind: "online", intent: { kind: "join", code } };
}

// Crypt Clash: a lane battler against a friend (by link) or a bot. Not
// linked from the nav yet, so it can be tested in prod by URL.
export default function CryptClash() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const toMenu = () => setScreen({ kind: "menu" });
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-[#0b0712] font-mono text-white select-none">
      <div className="h-full w-full" style={{ maxWidth: "min(100vw, calc(100dvh * 0.6))" }}>
        {screen.kind === "menu" && (
          <Menu
            onBot={(deck, difficulty) => setScreen({ kind: "bot", deck, difficulty })}
            onChallenge={(deck, name) => setScreen({ kind: "online", intent: { kind: "create", deck, name } })}
          />
        )}
        {screen.kind === "bot" && <BotGame deck={screen.deck} difficulty={screen.difficulty} onExit={toMenu} />}
        {screen.kind === "online" && <OnlineGame intent={screen.intent} onExit={toMenu} />}
      </div>
    </div>
  );
}
