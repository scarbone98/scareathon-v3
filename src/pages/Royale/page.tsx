import { useCallback, useEffect, useRef, useState } from "react";
import { MATCH_TICKS, OVERTIME_TICKS, TICK_RATE, getCard, type Team } from "../../../server/shared/royale/index.js";
import { MatchController, NetDriver, type Hud } from "./game/controller";
import { BOT_REACTION, PRESET_DECKS, type Difficulty } from "./game/decks";
import { ClashSocket, savedSession, type ServerMessage, type SocketStatus } from "./game/net";
import { Button, Embers, GameCard, Heading, Panel, Sprite, Title } from "./ui/parts";
import { ORANGE, PURPLE, SPRITES, useScreenScale } from "./ui/theme";
import { DeckStrip, DecksScreen, HomeScreen, NameEditor, Screen, TrainingScreen } from "./ui/screens";

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

function formatClock(ticks: number) {
  const secs = Math.max(0, Math.ceil(ticks / TICK_RATE));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

// ---------- the live arena behind the menus ----------

function Backdrop() {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ctrl = new MatchController(hostRef.current!, () => {}, () => {});
    const a = PRESET_DECKS[Math.floor(Math.random() * PRESET_DECKS.length)].cards;
    const b = PRESET_DECKS[Math.floor(Math.random() * PRESET_DECKS.length)].cards;
    void ctrl.startDemo([a, b]);
    return () => ctrl.dispose();
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0">
      <div ref={hostRef} className="absolute inset-0" style={{ filter: "brightness(0.55) saturate(1.2) blur(1.5px)" }} />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0712]/70 via-transparent to-[#0b0712]/80" />
      <Embers />
    </div>
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
  ui?: number; // HUD scale on big screens
}

function Crowns({ count, color }: { count: number; color: string }) {
  return (
    <span className="flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < count ? "cc-pop" : ""} style={{ color: i < count ? color : "#ffffff33", animationDelay: `${i * 0.15}s` }}>
          ♛
        </span>
      ))}
    </span>
  );
}

function MatchView({ onReady, names, opponentOnline = true, connection = "open", rematch, opponentLeft, onRematch, onExit, ui = 1 }: MatchViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<MatchController | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [fight, setFight] = useState(false);
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

  // "FIGHT!" flashes as the countdown ends.
  const counting = (hud?.countdown ?? 0) > 0;
  const wasCounting = useRef(false);
  useEffect(() => {
    if (wasCounting.current && !counting) {
      wasCounting.current = false;
      setFight(true);
      const t = window.setTimeout(() => setFight(false), 900);
      return () => window.clearTimeout(t);
    }
    wasCounting.current = counting;
  }, [counting]);

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
            <Panel className="pointer-events-none absolute left-1 top-1 origin-top-left px-0 text-center" style={{ borderWidth: 12, transform: `scale(${ui})` }}>
              <div className="text-[9px] uppercase tracking-widest text-white/60">{overtime ? "overtime" : "time"}</div>
              <div className={`cc-outline-sm text-xl font-bold leading-none ${overtime ? "text-[#ff5a5a]" : "text-white"}`}>{formatClock(clock)}</div>
            </Panel>
            <div className="pointer-events-none absolute right-1 top-1 flex origin-top-right flex-col items-end gap-1" style={{ transform: `scale(${ui})` }}>
              <Panel className="flex items-center gap-2 px-0 text-sm" style={{ borderWidth: 12 }}>
                {names && (
                  <span className="cc-outline-sm max-w-[8rem] truncate text-xs" style={{ color: PURPLE }}>
                    {names[1]}
                    {!opponentOnline && !opponentLeft && <span className="ml-1 text-white/60">(reconnecting…)</span>}
                    {opponentLeft && <span className="ml-1 text-white/60">(left)</span>}
                  </span>
                )}
                <Crowns count={hud.crowns[1]} color={PURPLE} />
              </Panel>
              <Panel className="flex items-center gap-2 px-0 text-sm" style={{ borderWidth: 12 }}>
                {names && (
                  <span className="cc-outline-sm max-w-[8rem] truncate text-xs" style={{ color: ORANGE }}>
                    {names[0]}
                  </span>
                )}
                <Crowns count={hud.crowns[0]} color={ORANGE} />
              </Panel>
            </div>
            {hud.doubleElixir && !result && (
              <div className="cc-pop cc-outline-sm pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 border-2 border-[#140a1c] bg-[#c23bd4] px-2 py-0.5 text-sm font-bold">2x ELIXIR</div>
            )}
            {hud.countdown > 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div key={hud.countdown} className="cc-count cc-title cc-outline text-[110px] text-[#ffcf4a]">
                  {hud.countdown}
                </div>
              </div>
            )}
            {fight && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="cc-count cc-title text-[88px]" style={{ color: ORANGE, textShadow: "0 5px 0 #8a3a00, 0 10px 0 #140a1c" }}>
                  FIGHT!
                </div>
              </div>
            )}
          </>
        )}
        {connection !== "open" && !result && (
          <div className="cc-outline-sm pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 bg-black/70 px-3 py-1 text-xs text-[#ffcf4a]">Reconnecting…</div>
        )}
        {toast && !result && (
          <div className="cc-outline-sm pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 border-2 border-[#140a1c] bg-[#3a1020]/90 px-3 py-1 text-sm text-[#ffb0b0]">{toast}</div>
        )}
        {result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 px-6 text-center">
            <div className="flex w-full flex-col items-center gap-4" style={{ transform: `scale(${ui})` }}>
            <div className="cc-pop cc-title" style={{ fontSize: 64, color: won ? "#ffcf4a" : lost ? PURPLE : "#ffffff", textShadow: "0 5px 0 #140a1c, 0 0 30px currentColor" }}>
              {won ? "VICTORY" : lost ? "DEFEAT" : "DRAW"}
            </div>
            <div className="flex items-end gap-6">
              <Sprite sprite={SPRITES.joe} size={72} fps={7} />
              <div className="cc-outline flex items-center gap-3 pb-4 text-4xl font-bold">
                <span style={{ color: ORANGE }}>{hud?.crowns[0]}</span>
                <span className="text-white/50">-</span>
                <span style={{ color: PURPLE }}>{hud?.crowns[1]}</span>
              </div>
              <Sprite sprite={SPRITES.matt} size={72} fps={7} flip />
            </div>
            {rematch?.theirs && !rematch.mine && <div className="cc-outline-sm text-sm text-[#ffcf4a]">{names?.[1]} wants a rematch!</div>}
            {opponentLeft && <div className="cc-outline-sm text-sm text-white/70">{names?.[1]} left the room.</div>}
            <div className="flex w-full max-w-xs flex-col gap-3">
              <Button color="orange" onClick={onRematch} disabled={!!rematch?.mine || opponentLeft} className="py-1 text-lg">
                {rematch?.mine ? `Waiting for ${names?.[1] ?? "them"}…` : "⚔ Rematch"}
              </Button>
              <Button color="stone" onClick={onExit} className="py-0.5">
                Leave
              </Button>
            </div>
            </div>
          </div>
        )}
      </div>

      {hud && (
        <div className="border-t-4 border-[#140a1c] bg-gradient-to-b from-[#2a1a3a] to-[#140a1c] px-2 pb-2 pt-3">
          <div className="flex items-end justify-between gap-1">
            <div className="flex flex-col items-center text-[10px] uppercase text-white/60" style={{ width: 48 * ui }}>
              next
              <div className="mt-1 opacity-80">
                <GameCard id={hud.next} width={40 * ui} animate={false} />
              </div>
            </div>
            {hud.hand.map((id, i) => {
              const affordable = hud.elixir >= getCard(id).cost && !hud.pending.includes(id);
              return (
                <button key={`${i}-${id}`} onPointerDown={(e) => cardDown(i, e)} className="touch-none pl-1 pt-1">
                  <GameCard id={id} width={70 * ui} selected={selected === i} dim={!affordable} />
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="cc-gem cc-outline-sm flex items-center justify-center rounded-full font-bold" style={{ width: 28 * ui, height: 28 * ui, fontSize: 14 * ui }}>
              {Math.floor(hud.elixir)}
            </div>
            <div className="relative flex-1 overflow-hidden border-2 border-[#140a1c] bg-[#1a0f24]" style={{ height: 20 * ui }}>
              <div className="h-full bg-gradient-to-b from-[#f08af2] via-[#c23bd4] to-[#8a1f9a] transition-[width] duration-100" style={{ width: `${hud.elixir * 10}%` }} />
              <div className="absolute inset-0 flex">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className="flex-1 border-r-2 border-[#140a1c]/70 last:border-r-0" />
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

function BotGame({ deck, difficulty, onExit, ui }: { deck: string[]; difficulty: Difficulty; onExit: () => void; ui: number }) {
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
      ui={ui}
    />
  );
}

// ---------- friend games ----------

type OnlineIntent = { kind: "create"; deck: string[]; name: string } | { kind: "join"; code: string } | { kind: "resume"; code: string };

function inviteLink(code: string) {
  return `${window.location.origin}/crypt-clash?room=${code}`;
}

type Fighter = { name: string | null; sprite: typeof SPRITES.joe; color: string; unknown?: boolean };

function Versus({ left, right }: { left: Fighter; right: Fighter }) {
  const side = (f: Fighter, flip: boolean) => (
    <div className="flex w-28 flex-col items-center">
      <div className="relative">
        <Sprite sprite={f.sprite} size={84} fps={7} flip={flip} style={f.unknown ? { filter: "brightness(0)" } : undefined} />
        {f.unknown && <span className="cc-title cc-outline absolute inset-0 flex items-center justify-center pb-4 text-4xl text-[#ffcf4a]">?</span>}
      </div>
      <div className="cc-outline-sm mt-1 max-w-full truncate text-sm" style={{ color: f.color }}>
        {f.name ?? "???"}
      </div>
    </div>
  );
  return (
    <div className="mt-4 flex items-end justify-center gap-4">
      {side(left, false)}
      <div className="cc-title cc-bob pb-8 text-5xl" style={{ color: "#ffcf4a", textShadow: "0 4px 0 #140a1c" }}>
        VS
      </div>
      {side(right, true)}
    </div>
  );
}

function OnlineGame({ intent, deckId, onDeck, onExit, onInMatch, ui }: { intent: OnlineIntent; deckId: string; onDeck: (id: string) => void; onExit: () => void; onInMatch: (inMatch: boolean) => void; ui: number }) {
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

  useEffect(() => onInMatch(screen === "match"), [screen, onInMatch]);

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
        ui={ui}
      />
    );
  }

  if (screen === "error") {
    return (
      <Screen onBack={leave}>
        <div className="mt-6">
          <Title small />
        </div>
        <div className="mx-auto mt-8 w-full max-w-xs px-3">
          <Panel className="px-1 py-2 text-center">
            <Sprite sprite={SPRITES.grave} size={64} className="mx-auto" />
            <p className="cc-outline-sm mt-2 text-[#ffb0b0]">{error}</p>
          </Panel>
          <Button color="stone" onClick={leave} className="mt-4 w-full py-1">
            Back
          </Button>
        </div>
      </Screen>
    );
  }

  if (screen === "invite") {
    const deck = PRESET_DECKS.find((d) => d.id === deckId) ?? PRESET_DECKS[0];
    const index = PRESET_DECKS.indexOf(deck);
    const shift = (by: number) => onDeck(PRESET_DECKS[(index + by + PRESET_DECKS.length) % PRESET_DECKS.length].id);
    return (
      <Screen onBack={leave}>
        <div className="px-3 pt-2 text-center">
          <Heading>{host ? `${host} challenges you!` : "Loading…"}</Heading>
        </div>
        <Versus left={{ name, sprite: SPRITES.joe, color: ORANGE }} right={{ name: host, sprite: SPRITES.matt, color: PURPLE }} />
        <div className="mx-auto mt-4 w-full max-w-sm px-3">
          <Panel className="px-1">
            <div className="flex items-center justify-between gap-2">
              <Button color="stone" onClick={() => shift(-1)} className="px-1 text-sm" aria-label="Previous deck">
                ◀
              </Button>
              <div className="cc-outline-sm text-center font-bold text-[#ffcf4a]">{deck.name}</div>
              <Button color="stone" onClick={() => shift(1)} className="px-1 text-sm" aria-label="Next deck">
                ▶
              </Button>
            </div>
            <DeckStrip cards={deck.cards} width={32} />
          </Panel>
          <div className="mt-3 flex justify-center">
            <NameEditor
              name={name}
              onChange={(n) => {
                setName(n);
                savePref(NAME_KEY, n);
              }}
            />
          </div>
          <Button
            color="orange"
            disabled={!host}
            onClick={() => socketRef.current?.send({ type: "join", code, name, deck: deck.cards })}
            className="mt-4 w-full py-2 text-2xl"
          >
            ⚔ Accept
          </Button>
          <Button color="stone" onClick={leave} className="mt-3 w-full py-0.5">
            No thanks
          </Button>
        </div>
      </Screen>
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
    <Screen onBack={leave}>
      <div className="px-3 pt-2 text-center">
        <Heading>{screen === "lobby" ? "Waiting for a challenger" : "Opening the crypt…"}</Heading>
      </div>
      <Versus left={{ name, sprite: SPRITES.joe, color: ORANGE }} right={{ name: null, sprite: SPRITES.matt, color: PURPLE, unknown: true }} />
      {screen === "lobby" && (
        <div className="mx-auto mt-5 w-full max-w-sm px-3">
          <Panel className="px-1 py-1 text-center">
            <p className="cc-outline-sm text-sm text-white">Send this link to a friend. The battle starts when they accept.</p>
            <div className="mt-2 select-all break-all border-2 border-dashed border-[#ffcf4a]/60 bg-black/40 px-2 py-1.5 text-sm text-[#ffcf4a]">{link}</div>
          </Panel>
          <Button color="orange" onClick={share} className="mt-4 w-full py-1 text-xl">
            {copied ? "✓ Copied!" : "Share link"}
          </Button>
          <div className="mt-6 flex justify-center">
            <span className="relative flex h-4 w-4">
              <span className="cc-pulse-ring absolute inset-0 rounded-full bg-[#ff8a1f]" />
              <span className="relative h-4 w-4 rounded-full border-2 border-[#140a1c] bg-[#ff8a1f]" />
            </span>
          </div>
        </div>
      )}
      {status === "reconnecting" && <p className="cc-outline-sm mt-6 text-center text-xs text-[#ffcf4a]">Reconnecting to the server…</p>}
    </Screen>
  );
}

// ---------- page ----------

type View =
  | { kind: "home" }
  | { kind: "decks"; back: "home" | "training" }
  | { kind: "training" }
  | { kind: "bot"; difficulty: Difficulty }
  | { kind: "online"; intent: OnlineIntent };

function initialView(): View {
  const code = new URLSearchParams(window.location.search).get("room");
  if (!code) return { kind: "home" };
  // Back after a refresh or dropped tab: rejoin the room we were in.
  const session = savedSession();
  if (session?.code === code) return { kind: "online", intent: { kind: "resume", code } };
  return { kind: "online", intent: { kind: "join", code } };
}

// Crypt Clash: a lane battler against a friend (by link) or a bot. Not
// linked from the nav yet, so it can be tested in prod by URL.
export default function CryptClash() {
  const [view, setView] = useState<View>(initialView);
  const [deckId, setDeckId] = useState(() => loadPref(DECK_KEY, PRESET_DECKS[0].id));
  const [name, setName] = useState(() => loadPref(NAME_KEY, `Guest ${Math.floor(1000 + Math.random() * 9000)}`));
  const [onlineInMatch, setOnlineInMatch] = useState(false);
  const home = () => setView({ kind: "home" });
  const pickDeck = (id: string) => {
    setDeckId(id);
    savePref(DECK_KEY, id);
  };
  const inMatch = view.kind === "bot" || (view.kind === "online" && onlineInMatch);
  const frameRef = useRef<HTMLDivElement>(null);
  const scale = useScreenScale(frameRef);
  // Menus scale up as a whole on big screens (pixel art included); in a
  // match the arena fills the screen and the HUD scales itself.
  const zoom = inMatch ? 1 : scale;

  return (
    <div className="cc-root fixed inset-0 z-50 flex justify-center bg-[#0b0712] text-white select-none">
      <div ref={frameRef} className="relative h-full w-full overflow-hidden" style={{ maxWidth: "min(100vw, calc(100dvh * 0.6))" }}>
        {!inMatch && <Backdrop />}
        <div className="relative origin-top-left" style={{ transform: zoom === 1 ? undefined : `scale(${zoom})`, width: `${100 / zoom}%`, height: `${100 / zoom}%` }}>
          {view.kind === "home" && (
            <HomeScreen
              name={name}
              onName={(n) => {
                setName(n);
                savePref(NAME_KEY, n);
              }}
              deckId={deckId}
              onPlayFriend={() => setView({ kind: "online", intent: { kind: "create", deck: deckById(deckId), name } })}
              onTraining={() => setView({ kind: "training" })}
              onDecks={() => setView({ kind: "decks", back: "home" })}
            />
          )}
          {view.kind === "decks" && <DecksScreen deckId={deckId} onPick={pickDeck} onBack={() => setView({ kind: view.back })} />}
          {view.kind === "training" && (
            <TrainingScreen deckId={deckId} onStart={(difficulty) => setView({ kind: "bot", difficulty })} onDecks={() => setView({ kind: "decks", back: "training" })} onBack={home} />
          )}
          {view.kind === "bot" && <BotGame deck={deckById(deckId)} difficulty={view.difficulty} onExit={home} ui={scale} />}
          {view.kind === "online" && (
            <OnlineGame
              ui={scale}
              intent={view.intent}
              deckId={deckId}
              onDeck={pickDeck}
              onExit={() => {
                setOnlineInMatch(false);
                home();
              }}
              onInMatch={setOnlineInMatch}
            />
          )}
        </div>
      </div>
    </div>
  );
}
