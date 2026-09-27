import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { MachineData } from "../Arcade/games.tsx";
import { useNavigatorContext } from "../../components/navigator/context.tsx";
import { TERMINAL_FONT, whenFontReady } from "./arcadeFonts.ts";

// A green-screen terminal in a beige case, like the one on the cartridge slot:
// it types out the picked game's name and pitch, and gives a way into its
// leaderboard. Tapping or swiping the cartridges does the rest, so there's no
// play button. Fixed row heights keep it the same size for every game.

const TERMINAL_FAMILY = `"VT323", ui-monospace, Menlo, Consolas, monospace`;
const PHOSPHOR = "#39ff6a";
const GLOW = "0 0 6px rgba(57, 255, 106, 0.65), 0 0 1px rgba(57, 255, 106, 0.9)";
const CHARS_PER_SECOND = 60;

// The site's phone menu, docked into the terminal as a key of its own
function MenuKey() {
  const { mobileMenuOpen, setMobileMenuOpen } = useNavigatorContext();
  return (
    <TerminalButton
      onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      pressed={mobileMenuOpen}
      label="Site menu"
      menuToggle
    >
      ≡
    </TerminalButton>
  );
}

type Props = {
  game: MachineData | undefined;
  phone: boolean; // docks the site menu button into the card
  style?: CSSProperties;
  className?: string;
  onLeaderboard: (game: MachineData) => void;
};

// Types `parts` out one after another, a character at a time, starting over
// whenever `resetKey` changes. Returns how much of each part shows.
function useTypewriter(parts: string[], resetKey: string) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    setTyped(0);
    const start = performance.now();
    const timer = window.setInterval(() => {
      const count = Math.floor(((performance.now() - start) / 1000) * CHARS_PER_SECOND);
      setTyped(Math.min(count, total));
      if (count >= total) window.clearInterval(timer);
    }, 16);
    return () => window.clearInterval(timer);
  }, [resetKey, total]);
  let left = typed;
  return {
    shown: parts.map((part) => {
      const shown = part.slice(0, Math.max(left, 0));
      left -= part.length;
      return shown;
    }),
    // Which part the cursor sits in: the one being typed, else the last
    cursorAt: Math.min(
      parts.findIndex((_, i) => parts.slice(0, i + 1).reduce((sum, part) => sum + part.length, 0) > typed),
      parts.length - 1
    ),
    done: typed >= total,
  };
}

function Cursor() {
  return <span className="ml-0.5 inline-block h-[0.85em] w-[0.5em] translate-y-[0.1em] animate-pulse" style={{ background: PHOSPHOR }} />;
}

// The game's name on one line: long names shrink to fit rather than wrapping.
// Measured on the whole name, so it doesn't resize as it types out.
function FittedTitle({ text, shown, cursor }: { text: string; shown: string; cursor: boolean }) {
  const boxRef = useRef<HTMLHeadingElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return;
    const fit = () => setScale(Math.min(1, box.clientWidth / Math.max(measure.offsetWidth + 16, 1)));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    whenFontReady(TERMINAL_FONT).then(fit);
    return () => observer.disconnect();
  }, [text]);

  return (
    <h2
      ref={boxRef}
      className="relative flex h-10 w-full items-center justify-center overflow-hidden whitespace-nowrap text-[2.4rem] leading-none sm:h-11 sm:text-[2.7rem]"
      title={text}
    >
      <span ref={measureRef} aria-hidden="true" className="invisible absolute">
        {text}
      </span>
      <span className="inline-block" style={{ transform: `scale(${scale})` }}>
        {shown}
        {cursor && <Cursor />}
      </span>
    </h2>
  );
}

// A terminal key: bracketed, lighting up when pressed, or hovered where there's
// a mouse (a tap on a phone would otherwise leave it lit after it's let go)
function TerminalButton({
  children,
  onClick,
  pressed,
  label,
  menuToggle = false,
}: {
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  label?: string;
  menuToggle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={menuToggle ? undefined : pressed}
      aria-expanded={menuToggle ? pressed : undefined}
      data-mobile-menu-toggle={menuToggle || undefined}
      className="whitespace-nowrap px-1.5 leading-6 transition-colors focus:outline-none focus-visible:bg-[#39ff6a] focus-visible:text-[#021407] [@media(hover:hover)]:hover:bg-[#39ff6a] [@media(hover:hover)]:hover:text-[#021407]"
      style={pressed ? { background: PHOSPHOR, color: "#021407" } : undefined}
    >
      [ {children} ]
    </button>
  );
}

export default function GameCard({ game, phone, style, className = "", onLeaderboard }: Props) {
  // Stays on while browsing, so you can flick through every game's details
  const [showInfo, setShowInfo] = useState(false);
  const name = game ? game.name.replace(/[‘’]/g, "'").toUpperCase() : "";
  const lines = !game
    ? []
    : showInfo
      ? [
          `RELEASED ${game.cartridge.about.released}`,
          `PLAYERS  ${game.cartridge.about.players.toUpperCase()}`,
          `GENRE    ${game.cartridge.about.genre.toUpperCase()}`,
        ]
      : [`> ${game.cartridge.tagline}`];
  const typing = useTypewriter([name, ...lines], `${name}|${showInfo}`);
  const [shownName, ...shownLines] = typing.shown;

  return (
    <div className={`pointer-events-none flex flex-col items-center gap-2 text-center ${className}`} style={style}>
      {game ? (
        // The beige case, stretching to whatever room the ledge leaves
        <div
          className="pointer-events-auto relative flex w-full flex-1 flex-col rounded-2xl p-2.5 pb-5"
          style={{
            background: "linear-gradient(#c9bc9f, #b3a585)",
            boxShadow: "inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -3px 0 rgba(0,0,0,0.2), 0 10px 30px rgba(0,0,0,0.55)",
          }}
        >
          {/* The glass: scanlines, a vignette, and phosphor text */}
          <div
            className="relative flex flex-1 flex-col justify-center overflow-hidden rounded-xl px-4 pb-2 pt-1"
            style={{
              background: "radial-gradient(ellipse at center, #06260f 0%, #021407 70%, #010a04 100%)",
              boxShadow: "inset 0 0 22px rgba(0,0,0,0.9), inset 0 0 2px rgba(0,0,0,1), 0 0 0 3px #1a1614",
              color: PHOSPHOR,
              fontFamily: TERMINAL_FAMILY,
              textShadow: GLOW,
            }}
          >
            <FittedTitle text={name} shown={shownName} cursor={typing.cursorAt === 0} />

            {/* The pitch and leaderboard, or the info key's details: the same
                height either way so the card doesn't jump */}
            <div className="mt-1 flex h-[5.5rem] flex-col items-center justify-center text-xl leading-6">
              {showInfo ? (
                <pre className="text-left" style={{ fontFamily: TERMINAL_FAMILY }}>
                  {shownLines.map((line, i) => (
                    <div key={i}>
                      {line}
                      {typing.cursorAt === i + 1 && !typing.done && <Cursor />}
                    </div>
                  ))}
                  {typing.done && <Cursor />}
                </pre>
              ) : (
                <>
                  <p className="line-clamp-2 min-h-12">
                    {shownLines[0]}
                    {typing.cursorAt === 1 && <Cursor />}
                  </p>
                  <div className="mt-1 h-7">
                    {game.hasLeaderboard !== false ? (
                      <TerminalButton onClick={() => onLeaderboard(game)}>LEADERBOARD</TerminalButton>
                    ) : (
                      <span className="opacity-60">NO SCORES KEPT</span>
                    )}
                  </div>
                </>
              )}
            </div>

            {!phone && (
              <p className="mt-1 h-5 text-base leading-5 opacity-55">CLICK A CART TO PICK · AGAIN TO PLAY · ← → ENTER</p>
            )}

            {phone && (
              <div className="absolute bottom-1.5 left-2 z-10 text-xl">
                <MenuKey />
              </div>
            )}
            <div className="absolute bottom-1.5 right-2 z-10 text-xl">
              <TerminalButton
                onClick={() => setShowInfo(!showInfo)}
                pressed={showInfo}
                label={showInfo ? "Hide game details" : "Show game details"}
              >
                ?
              </TerminalButton>
            </div>

            {/* Scanlines over everything */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{ background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0.28) 0 1px, transparent 1px 3px)" }}
            />
          </div>
          {/* The case's badge and power light */}
          <div className="absolute inset-x-4 bottom-1 flex items-center justify-between font-sans text-[0.55rem] font-bold uppercase tracking-[0.2em] text-[#5a5040]">
            <span>SA-86 Terminal</span>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: PHOSPHOR, boxShadow: `0 0 4px ${PHOSPHOR}` }} />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {phone && (
            <div className="pointer-events-auto rounded bg-[#021407] text-xl" style={{ color: PHOSPHOR, fontFamily: TERMINAL_FAMILY }}>
              <MenuKey />
            </div>
          )}
          <p className="rounded-full border border-orange-500/30 bg-black/60 px-4 py-2 text-sm text-orange-100/80 backdrop-blur-sm">
            {phone ? "Swipe the shelf and tap a cartridge to play" : "Click a cartridge to play"}
          </p>
        </div>
      )}
    </div>
  );
}
