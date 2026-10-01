import { useEffect, useRef } from "react";
import { formatLeaderboardScore, useLeaderboard } from "./leaderboard.ts";

// Top 10 scores for one game: the arcade terminal opened out to fill the screen, just as
// the cartridge index (ALL) does, with rank, name and score in phosphor rows. Mount it to
// show it.

const PHOSPHOR = "#39ff6a";
const TERMINAL_FAMILY = `"VT323", ui-monospace, Menlo, Consolas, monospace`;
const GLOW = "0 0 6px rgba(57, 255, 106, 0.65), 0 0 1px rgba(57, 255, 106, 0.9)";
const BRIGHT = "#d8ffe0";

export default function LeaderboardDialog({
  game,
  onClose,
  accent = PHOSPHOR,
}: {
  game: string;
  onClose: () => void;
  // The game's colour: a stripe along the top, as on its cartridge
  accent?: string;
}) {
  const { data: entries, isLoading, isError, refetch } = useLeaderboard(game);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape closes just the dialog. Listening in the capture phase and stopping
  // there keeps it from also closing a game that's open underneath.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown, true);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const button =
    "shrink-0 whitespace-nowrap px-1.5 leading-6 focus:outline-none focus-visible:bg-[#39ff6a] focus-visible:text-[#021407] [@media(hover:hover)]:hover:bg-[#39ff6a] [@media(hover:hover)]:hover:text-[#021407]";

  return (
    <div className="fixed inset-0 z-40 flex flex-col p-2 sm:p-6 md:pt-24" style={{ background: "rgba(0, 0, 0, 0.7)" }} onClick={onClose}>
      {/* The terminal's glass, filling the screen (as the index does) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leaderboard-title"
        className="relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-2xl border-[10px] border-[#b9ab8e]"
        style={{
          background: "radial-gradient(ellipse at center, #06260f 0%, #021407 70%, #010a04 100%)",
          boxShadow: "inset 0 0 30px rgba(0,0,0,0.9), 0 10px 40px rgba(0,0,0,0.7)",
          color: PHOSPHOR,
          fontFamily: TERMINAL_FAMILY,
          textShadow: GLOW,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-1.5 shrink-0" style={{ background: accent, boxShadow: "none" }} />
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3 text-2xl leading-none">
          <h2 id="leaderboard-title" className="truncate">
            {`> HI-SCORES · ${game.replace(/[‘’]/g, "'").toUpperCase()}`}
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close leaderboard" className={button}>
            [ X ]
          </button>
        </div>
        <div className="mx-4 border-t-2 border-[#39ff6a]/30" />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-xl leading-7 sm:text-2xl sm:leading-8">
          {isLoading ? (
            <p>
              READING TAPE<span className="animate-pulse">_</span>
            </p>
          ) : isError ? (
            <div>
              <p>ERR: SCORES LOST IN THE FOG</p>
              <button type="button" onClick={() => refetch()} className={`${button} mt-2`}>
                [ RETRY ]
              </button>
            </div>
          ) : !entries?.length ? (
            <p>NO SCORES YET. THE TOP SPOT IS YOURS.</p>
          ) : (
            <ol>
              {entries.map((entry, index) => (
                <li
                  key={`${entry.username}-${index}`}
                  className="flex items-baseline gap-3 px-1"
                  style={entry.isUserScore ? { background: "rgba(57, 255, 106, 0.15)" } : undefined}
                >
                  <span className="w-8 shrink-0 text-right opacity-70">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 truncate" style={index === 0 ? { color: BRIGHT } : undefined}>
                    {entry.isUserScore ? "> " : ""}
                    {entry.username.toUpperCase()}
                    {entry.isUserScore ? " (YOU)" : ""}
                  </span>
                  {/* A dotted run to the score, as on a printed table */}
                  <span aria-hidden="true" className="hidden min-w-4 flex-1 overflow-hidden whitespace-nowrap opacity-30 sm:block">
                    {".".repeat(40)}
                  </span>
                  <span className="shrink-0 tabular-nums" style={index === 0 ? { color: BRIGHT } : undefined}>
                    {formatLeaderboardScore(game, entry.metricValue)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="border-t-2 border-[#39ff6a]/30 px-4 py-2 text-lg leading-none opacity-70">{"> TOP 10 · PRESS ESC TO RETURN"}</div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0.22) 0 1px, transparent 1px 3px)" }}
        />
      </div>
    </div>
  );
}
