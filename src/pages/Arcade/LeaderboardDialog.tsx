import { useEffect, useRef } from "react";
import { m as motion } from "framer-motion";
import { FaCrown, FaTimes, FaTrophy } from "react-icons/fa";
import { formatLeaderboardScore, useLeaderboard } from "./leaderboard.ts";

const DEFAULT_ACCENT = "#ff7a1a";
// Gold, silver, bronze
const PODIUM = ["#ffd24a", "#d6dbe4", "#e0955a"];

// Top 10 scores for one game, in a modal. Mount it to show it.
export default function LeaderboardDialog({
  game,
  onClose,
  accent = DEFAULT_ACCENT,
}: {
  game: string;
  onClose: () => void;
  // The game's colour, for the frame and title glow
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

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leaderboard-title"
        className="relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-[#0d0910]/95 text-orange-50"
        style={{ borderColor: `${accent}99`, boxShadow: `0 0 40px ${accent}40, inset 0 0 30px ${accent}14` }}
        initial={{ opacity: 0, y: 24, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 340, damping: 26 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{ background: `linear-gradient(180deg, ${accent}33, transparent)` }}
        />
        <div className="relative flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/70">
              <FaTrophy aria-hidden="true" style={{ color: accent }} /> High scores
            </p>
            <h2
              id="leaderboard-title"
              className="truncate font-zombie text-3xl tracking-wide text-orange-50"
              style={{ textShadow: `0 0 14px ${accent}` }}
            >
              {game}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close leaderboard"
            className="rounded-full p-2 text-orange-100/70 transition hover:bg-white/10 hover:text-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-200"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="relative flex-grow overflow-y-auto px-3 pb-4">
          {isLoading ? (
            <ol aria-label="Loading scores" className="space-y-1.5">
              {Array.from({ length: 6 }, (_, index) => (
                <li
                  key={index}
                  className="h-11 animate-pulse rounded-lg bg-white/5"
                  style={{ animationDelay: `${index * 80}ms` }}
                />
              ))}
            </ol>
          ) : isError ? (
            <div className="px-2 py-8 text-center text-sm text-orange-100/75">
              <p>The scores got lost in the fog.</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 rounded border border-orange-500/70 px-4 py-1.5 font-semibold text-orange-100 transition hover:bg-orange-950"
              >
                Try again
              </button>
            </div>
          ) : !entries?.length ? (
            <p className="px-2 py-10 text-center text-sm text-orange-100/75">
              No scores yet. The top spot is yours for the taking.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {entries.map((entry, index) => {
                const podium = PODIUM[index];
                return (
                  <motion.li
                    key={`${entry.username}-${index}`}
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 + index * 0.045, duration: 0.25, ease: "easeOut" }}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                      entry.isUserScore ? "bg-yellow-400/15 ring-1 ring-yellow-400/60" : index % 2 ? "bg-white/[0.03]" : "bg-white/[0.06]"
                    }`}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                      style={
                        podium
                          ? { background: podium, color: "#1a1016", boxShadow: `0 0 10px ${podium}88` }
                          : { color: "rgba(255, 237, 213, 0.6)" }
                      }
                    >
                      {index === 0 ? <FaCrown aria-label="1" /> : index + 1}
                    </span>
                    <span
                      className={`min-w-0 flex-grow truncate ${index < 3 ? "font-semibold" : ""} ${
                        entry.isUserScore ? "text-yellow-300" : ""
                      }`}
                    >
                      {entry.username}
                      {entry.isUserScore && <span className="ml-2 text-xs text-yellow-300/80">(you)</span>}
                    </span>
                    <span
                      className={`shrink-0 font-mono tabular-nums ${index === 0 ? "text-lg" : ""} ${
                        entry.isUserScore ? "text-yellow-300" : "text-orange-100"
                      }`}
                      style={podium ? { color: entry.isUserScore ? undefined : podium } : undefined}
                    >
                      {formatLeaderboardScore(game, entry.metricValue)}
                    </span>
                  </motion.li>
                );
              })}
            </ol>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
