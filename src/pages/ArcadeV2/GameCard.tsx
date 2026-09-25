import { useEffect, useState, type CSSProperties } from "react";
import { AnimatePresence, m as motion } from "framer-motion";
import { FaCrown, FaPlay, FaTrophy } from "react-icons/fa";
import type { MachineData } from "../Arcade/games.tsx";
import { formatLeaderboardScore, useLeaderboard } from "../Arcade/leaderboard.ts";

// The card beside the shelf: the focused (or plugged-in) game's name, pitch,
// top score, and what you can do with it.

type Props = {
  game: MachineData | undefined;
  index: number;
  total: number;
  isInserted: boolean;
  insertedGame: MachineData | undefined;
  layout: "wall" | "ledge";
  style?: CSSProperties;
  className?: string;
  onPlay: (game: MachineData) => void;
  onLeaderboard: (game: MachineData) => void;
  onPlugIn: () => void;
};

// Hovering along the shelf changes the game every few frames; only ask for
// scores once the pointer has settled on one.
function useSettled<T>(value: T, delay: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

function TopScore({ game }: { game: MachineData }) {
  const settledName = useSettled(game.name, 350);
  const settled = settledName === game.name;
  const { data, isLoading, isError } = useLeaderboard(settledName, settled);
  const top = data?.[0];

  let content;
  if (!settled || isLoading) {
    content = <span className="inline-block h-3 w-40 animate-pulse rounded bg-white/10 align-middle" />;
  } else if (isError) {
    content = null;
  } else if (top) {
    content = (
      <>
        <FaCrown aria-hidden="true" className="text-yellow-300" />
        <span className="truncate">{top.username}</span>
        <span className="font-mono tabular-nums text-yellow-200">{formatLeaderboardScore(game.name, top.metricValue)}</span>
      </>
    );
  } else {
    content = <span className="text-orange-100/60">No scores yet. Be the first!</span>;
  }

  return (
    <p className="flex h-5 items-center justify-center gap-2 text-sm text-orange-50/90" aria-live="polite">
      {content}
    </p>
  );
}

export default function GameCard({
  game,
  index,
  total,
  isInserted,
  insertedGame,
  layout,
  style,
  className = "",
  onPlay,
  onLeaderboard,
  onPlugIn,
}: Props) {
  const accent = game?.cartridge.color ?? "#ff7a1a";

  return (
    <div className={`pointer-events-none flex flex-col items-center gap-2 text-center ${className}`} style={style}>
      {game ? (
        <div
          className="pointer-events-auto relative w-full overflow-hidden rounded-2xl border bg-[#0b0710]/80 px-5 pb-4 pt-3 backdrop-blur-md transition-[border-color,box-shadow] duration-300"
          style={{ borderColor: `${accent}aa`, boxShadow: `0 0 28px ${accent}55, inset 0 0 24px ${accent}18` }}
        >
          {/* The cartridge's colour, as a stripe along the top like its label */}
          <div className="absolute inset-x-0 top-0 h-1 transition-colors duration-300" style={{ background: accent }} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={game.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="flex flex-col items-center gap-1"
            >
              <div className="flex w-full items-center justify-between text-[0.7rem] font-semibold uppercase tracking-[0.18em]">
                <span className="font-mono text-orange-100/50">
                  {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
                </span>
                {isInserted ? (
                  <span className="flex items-center gap-1.5 text-emerald-300">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                    </span>
                    In the machine
                  </span>
                ) : (
                  <span className="text-orange-100/50">On the shelf</span>
                )}
              </div>
              <h2
                className="font-zombie text-3xl leading-tight tracking-wide text-orange-50 sm:text-4xl"
                style={{ textShadow: `0 0 14px ${accent}, 0 0 2px ${accent}` }}
              >
                {game.name}
              </h2>
              <p className="text-sm text-orange-100/80">{game.cartridge.tagline}</p>
              {game.hasLeaderboard !== false && <TopScore game={game} />}
            </motion.div>
          </AnimatePresence>

          <div className="mt-3 flex justify-center gap-2">
            {isInserted ? (
              <>
                <motion.button
                  type="button"
                  onClick={() => onPlay(game)}
                  whileTap={{ scale: 0.95 }}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-2 font-bold text-black shadow-[0_0_18px_rgba(255,122,26,0.55)] transition hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                >
                  <FaPlay aria-hidden="true" /> Play
                </motion.button>
                {game.hasLeaderboard !== false && (
                  <motion.button
                    type="button"
                    onClick={() => onLeaderboard(game)}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 rounded-lg border border-orange-500/70 bg-black/60 px-4 py-2 font-semibold text-orange-100 transition hover:border-orange-300 hover:bg-orange-950 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  >
                    <FaTrophy aria-hidden="true" /> Leaderboard
                  </motion.button>
                )}
              </>
            ) : (
              <motion.button
                type="button"
                onClick={onPlugIn}
                whileTap={{ scale: 0.95 }}
                className="rounded-lg border px-6 py-2 font-semibold text-orange-50 transition hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-orange-200"
                style={{ borderColor: accent, background: `${accent}2e` }}
              >
                Plug it in
              </motion.button>
            )}
          </div>

          {layout === "ledge" && !isInserted && (
            <p className="mt-2 text-[0.7rem] text-orange-100/45">Tap the cartridge again to plug it in</p>
          )}
          {layout === "wall" && (
            <p className="mt-3 text-[0.7rem] text-orange-100/45">
              <kbd className="rounded border border-white/20 px-1">←</kbd>{" "}
              <kbd className="rounded border border-white/20 px-1">→</kbd> browse ·{" "}
              <kbd className="rounded border border-white/20 px-1">Enter</kbd> {isInserted ? "play" : "plug in"}
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-full border border-orange-500/30 bg-black/60 px-4 py-2 text-sm text-orange-100/80 backdrop-blur-sm">
          {layout === "ledge" ? "Swipe the shelf and tap a cartridge to pick it" : "Pick a cartridge from the shelf"}
        </p>
      )}
      <AnimatePresence>
        {insertedGame && !isInserted && (
          <motion.p
            key="in-machine"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-orange-100/75"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: insertedGame.cartridge.color }} />
            In the machine: {insertedGame.name}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
