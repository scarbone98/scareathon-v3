import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, m as motion } from "framer-motion";
import { FaTrophy } from "react-icons/fa";
import type { MachineData } from "../Arcade/games.tsx";
import { useNavigatorContext } from "../../components/navigator/context.tsx";

// The site's phone menu button, docked into the card so nothing floats over the arcade
function MenuSkull({ className = "relative" }: { className?: string }) {
  const { mobileMenuOpen, setMobileMenuOpen } = useNavigatorContext();
  return (
    <button
      type="button"
      data-mobile-menu-toggle
      onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      aria-label="Site menu"
      aria-expanded={mobileMenuOpen}
      className={`pointer-events-auto h-12 w-12 shrink-0 focus:outline-none ${mobileMenuOpen ? "opacity-100" : "opacity-70"} ${className}`}
    >
      <span className="absolute inset-1 animate-pulse rounded-full bg-red-500/60 blur-md" />
      <img src="/images/candleskull.gif" alt="" className="relative z-10 h-full w-full object-cover" />
    </button>
  );
}

// The card for the focused game: its name, its pitch, and a way into its
// leaderboard. Tapping or swiping the cartridges does the rest, so there's no
// play button. Fixed row heights keep it the same size for every game.

type Props = {
  game: MachineData | undefined;
  layout: "wall" | "ledge";
  style?: CSSProperties;
  className?: string;
  onLeaderboard: (game: MachineData) => void;
};

// The game's name on one line: long names shrink to fit rather than wrapping
function FittedTitle({ text, accent }: { text: string; accent: string }) {
  const boxRef = useRef<HTMLHeadingElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const span = textRef.current;
    if (!box || !span) return;
    // transform doesn't change the span's layout width, so this measures the unscaled text
    const fit = () => setScale(Math.min(1, box.clientWidth / Math.max(span.offsetWidth, 1)));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => observer.disconnect();
  }, [text]);

  return (
    <h2
      ref={boxRef}
      className="flex h-10 w-full items-center justify-center overflow-hidden whitespace-nowrap font-zombie text-3xl tracking-wide text-orange-50 sm:h-11 sm:text-4xl"
      style={{ textShadow: `0 0 14px ${accent}, 0 0 2px ${accent}` }}
      title={text}
    >
      <span ref={textRef} className="inline-block" style={{ transform: `scale(${scale})` }}>
        {text}
      </span>
    </h2>
  );
}

export default function GameCard({ game, layout, style, className = "", onLeaderboard }: Props) {
  const accent = game?.cartridge.color ?? "#ff7a1a";

  return (
    <div className={`pointer-events-none flex flex-col items-center gap-2 text-center ${className}`} style={style}>
      {game ? (
        <div
          className={`pointer-events-auto relative w-full overflow-hidden rounded-2xl border bg-[#0b0710]/80 pb-3 pt-2 backdrop-blur-md transition-[border-color,box-shadow] duration-300 ${
            layout === "ledge" ? "px-14" : "px-4"
          }`}
          style={{ borderColor: `${accent}aa`, boxShadow: `0 0 28px ${accent}55, inset 0 0 24px ${accent}18` }}
        >
          {/* The cartridge's colour, as a stripe along the top like its label */}
          <div className="absolute inset-x-0 top-0 h-1 transition-colors duration-300" style={{ background: accent }} />
          {layout === "ledge" && <MenuSkull className="absolute left-2 top-1/2 z-10 -translate-y-1/2" />}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={game.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="flex flex-col items-center gap-1"
            >
              <FittedTitle text={game.name} accent={accent} />
              {/* Room for two lines whether the tagline needs them or not */}
              <p className="flex h-10 items-center justify-center text-sm leading-5 text-orange-100/80">
                <span className="line-clamp-2">{game.cartridge.tagline}</span>
              </p>
            </motion.div>
          </AnimatePresence>

          <div className="mt-1 flex h-9 items-center justify-center">
            {game.hasLeaderboard !== false ? (
              <motion.button
                type="button"
                onClick={() => onLeaderboard(game)}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 rounded-lg border px-4 py-1.5 text-sm font-semibold text-orange-50 transition hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-orange-200"
                style={{ borderColor: accent, background: `${accent}2e` }}
              >
                <FaTrophy aria-hidden="true" /> Leaderboard
              </motion.button>
            ) : (
              <p className="text-xs text-orange-100/50">Just for fun: no scores kept</p>
            )}
          </div>

          {layout === "wall" && (
            <p className="mt-2 h-4 text-[0.7rem] text-orange-100/45">
              Click a cartridge to play ·{" "}
              <kbd className="rounded border border-white/20 px-1">←</kbd>{" "}
              <kbd className="rounded border border-white/20 px-1">→</kbd>{" "}
              <kbd className="rounded border border-white/20 px-1">Enter</kbd>
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {layout === "ledge" && <MenuSkull />}
          <p className="rounded-full border border-orange-500/30 bg-black/60 px-4 py-2 text-sm text-orange-100/80 backdrop-blur-sm">
            {layout === "ledge" ? "Swipe the shelf and tap a cartridge to play" : "Click a cartridge to play"}
          </p>
        </div>
      )}
    </div>
  );
}
