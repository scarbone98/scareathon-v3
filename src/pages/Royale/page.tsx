import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MATCH_TICKS, OVERTIME_TICKS, TICK_RATE, getCard } from "../../../server/shared/royale/index.js";
import { MatchController, type Hud } from "./game/controller";
import { BOT_REACTION, PRESET_DECKS, type Difficulty } from "./game/decks";

const ORANGE = "#ff8a1f";
const PURPLE = "#b061ff";

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

function Menu({ onPlay }: { onPlay: (deck: string[], difficulty: Difficulty) => void }) {
  const [deckId, setDeckId] = useState(PRESET_DECKS[0].id);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const deck = PRESET_DECKS.find((d) => d.id === deckId)!;
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-6">
      <Link to="/" className="text-xs text-white/50 hover:text-white">
        ← back
      </Link>
      <h1 className="mt-4 text-center text-3xl font-bold tracking-widest text-[#ffcf4a]">CRYPT CLASH</h1>
      <p className="mt-1 text-center text-xs text-white/60">Knock down the enemy towers. Protect your own.</p>

      <h2 className="mt-6 text-xs uppercase tracking-widest text-white/50">Pick a deck</h2>
      <div className="mt-2 space-y-2">
        {PRESET_DECKS.map((d) => (
          <button
            key={d.id}
            onClick={() => setDeckId(d.id)}
            className={`w-full rounded-lg border-2 p-3 text-left ${d.id === deckId ? "border-[#ffcf4a] bg-[#3c2656]" : "border-[#4a3060] bg-[#2a1a3a]"}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-bold">{d.name}</span>
              <span className="text-[10px] text-white/50">
                avg {(d.cards.reduce((s, id) => s + getCard(id).cost, 0) / d.cards.length).toFixed(1)} elixir
              </span>
            </div>
            <div className="text-[11px] text-white/60">{d.blurb}</div>
            <div className="mt-2 grid grid-cols-8 gap-1">
              {d.cards.map((id) => (
                <div key={id} className="relative flex h-10 items-center justify-center rounded bg-black/30" title={getCard(id).name}>
                  <CardArt id={id} size={26} />
                  <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#c23bd4] text-[9px] font-bold">
                    {getCard(id).cost}
                  </span>
                </div>
              ))}
            </div>
          </button>
        ))}
      </div>

      <h2 className="mt-6 text-xs uppercase tracking-widest text-white/50">Opponent</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            className={`rounded-lg border-2 py-2 text-sm capitalize ${d === difficulty ? "border-[#ffcf4a] bg-[#3c2656]" : "border-[#4a3060] bg-[#2a1a3a]"}`}
          >
            {d} bot
          </button>
        ))}
      </div>

      <button onClick={() => onPlay(deck.cards, difficulty)} className="mt-8 rounded-lg bg-[#ff8a1f] py-3 text-lg font-bold tracking-widest text-[#1a1026] hover:bg-[#ffa04a]">
        BATTLE
      </button>
      <p className="mt-3 text-center text-[11px] text-white/40">Drag a card onto your side, or tap a card then tap where it goes.</p>
    </div>
  );
}

function Match({ deck, difficulty, onExit }: { deck: string[]; difficulty: Difficulty; onExit: () => void }) {
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

  const start = () => {
    const botDeck = PRESET_DECKS[Math.floor(Math.random() * PRESET_DECKS.length)].cards;
    setSelected(null);
    void ctrlRef.current?.start({ playerDeck: deck, botDeck, reaction: BOT_REACTION[difficulty], seed: `${Date.now()}-${Math.random()}` });
  };

  useEffect(() => {
    let toastTimer = 0;
    const ctrl = new MatchController(hostRef.current!, setHud, (message) => {
      setToast(message);
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setToast(null), 1200);
    });
    ctrlRef.current = ctrl;
    start();
    return () => {
      window.clearTimeout(toastTimer);
      ctrl.dispose();
      ctrlRef.current = null;
    };
    // The match starts once per mount; rematches call start() directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Drag a card onto the arena, or tap a card and then tap the arena.
  useEffect(() => {
    const cardAt = (slot: number | null) => (slot === null ? null : hudRef.current?.hand[slot] ?? null);
    const move = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) drag.moved = true;
      const card = cardAt(drag ? drag.slot : selectedRef.current);
      ctrlRef.current?.setPreview(card, e.clientX, e.clientY);
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
      if (card && e.target === hostRef.current?.querySelector("canvas")) {
        if (ctrl.play(card, e.clientX, e.clientY)) {
          setSelected(null);
          ctrl.setPreview(null);
        }
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

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

  const over = !!hud?.result;
  useEffect(() => {
    if (over) setSelected(null);
  }, [over]);

  const overtime = hud?.phase === "overtime";
  const clock = hud ? (overtime ? MATCH_TICKS + OVERTIME_TICKS - hud.tick : MATCH_TICKS - hud.tick) : MATCH_TICKS;
  const result = hud?.result;

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
              <div className="rounded bg-black/60 px-2 py-1 text-sm">
                <span style={{ color: PURPLE }}>{"♛".repeat(hud.crowns[1]) || "·"}</span>
              </div>
              <div className="rounded bg-black/60 px-2 py-1 text-sm">
                <span style={{ color: ORANGE }}>{"♛".repeat(hud.crowns[0]) || "·"}</span>
              </div>
            </div>
            {hud.doubleElixir && !result && (
              <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded bg-[#c23bd4] px-2 py-0.5 text-xs font-bold">2x ELIXIR</div>
            )}
          </>
        )}
        {toast && !result && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-sm text-[#ff9a9a]">{toast}</div>
        )}
        {result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50">
            <div className="text-4xl font-bold tracking-widest" style={{ color: result.winner === 0 ? "#ffcf4a" : result.winner === 1 ? PURPLE : "#ffffff" }}>
              {result.winner === 0 ? "VICTORY" : result.winner === 1 ? "DEFEAT" : "DRAW"}
            </div>
            <div className="text-2xl">
              <span style={{ color: ORANGE }}>{hud?.crowns[0]}</span>
              <span className="mx-3 text-white/40">–</span>
              <span style={{ color: PURPLE }}>{hud?.crowns[1]}</span>
            </div>
            <div className="flex gap-3">
              <button onClick={start} className="rounded-lg bg-[#ff8a1f] px-5 py-2 font-bold text-[#1a1026]">
                Rematch
              </button>
              <button onClick={onExit} className="rounded-lg border-2 border-[#4a3060] bg-[#2a1a3a] px-5 py-2">
                Change deck
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
              const affordable = hud.elixir >= card.cost;
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
                  <div className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#1a1026] bg-[#c23bd4] text-xs font-bold">
                    {card.cost}
                  </div>
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

// Crypt Clash: a lane battler against a bot. Not linked from the nav yet, so
// it can be tested in prod by URL (like Monster Bash).
export default function CryptClash() {
  const [match, setMatch] = useState<{ deck: string[]; difficulty: Difficulty } | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-[#0b0712] font-mono text-white select-none">
      <div className="h-full w-full" style={{ maxWidth: "min(100vw, calc(100dvh * 0.6))" }}>
        {match ? <Match deck={match.deck} difficulty={match.difficulty} onExit={() => setMatch(null)} /> : <Menu onPlay={(deck, difficulty) => setMatch({ deck, difficulty })} />}
      </div>
    </div>
  );
}
