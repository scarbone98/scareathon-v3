import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { MachineData } from "../Arcade/games.tsx";
import { useNavigatorContext } from "../../components/navigator/context.tsx";
import { TERMINAL_FONT, whenFontReady } from "./arcadeFonts.ts";
import {
  gameTitle,
  LOADING_BLOCKS,
  loadingView,
  nowSeconds,
  PLAY_HINT,
  rebootView,
  settled,
  terminalControls,
  typedParts,
  typeOut,
  type TerminalScreen,
} from "./terminalScreen.ts";

// A green-screen terminal in a beige case: the one on the cartridge slot, seen
// up close. It shows what that terminal shows (see terminalScreen.ts): the
// picked game's name and pitch, loading, ejecting, a crash and reboot; and gives
// a way into the game's leaderboard. Tapping or swiping the cartridges does the
// rest, so there's no play button. Fixed row heights keep it the same size throughout.

const TERMINAL_FAMILY = `"VT323", ui-monospace, Menlo, Consolas, monospace`;
const PHOSPHOR = "#39ff6a";
const GLOW = "0 0 6px rgba(57, 255, 106, 0.65), 0 0 1px rgba(57, 255, 106, 0.9)";

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
  screen: TerminalScreen;
  details: boolean; // the ? key: release, players and genre instead of the pitch
  onToggleDetails: () => void;
  phone: boolean; // docks the site menu button into the card
  style?: CSSProperties;
  className?: string;
  onLeaderboard: (game: MachineData) => void;
  onBrowseAll: () => void; // opens the index of every cartridge
};

// Types `parts` out one after another, a character at a time, starting over
// whenever `resetKey` changes. Returns how much of each part shows.
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


// Keeps `now` ticking while the screen is still changing (typing, a filling bar, a
// reboot), and stops once it settles
function useClock(screen: TerminalScreen, details: boolean) {
  const [now, setNow] = useState(nowSeconds);
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const time = nowSeconds();
      setNow(time);
      if (!settled(screen, details, time)) timer = window.setTimeout(tick, 33);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [screen, details]);
  return now;
}

function LoadingBar({ blocks }: { blocks: number }) {
  return (
    <div className="flex h-5 items-center gap-1 border-2 px-[3px]" style={{ borderColor: PHOSPHOR, boxShadow: GLOW }}>
      {Array.from({ length: LOADING_BLOCKS }, (_, i) => (
        <span key={i} className="h-3 w-3" style={{ background: i < blocks ? PHOSPHOR : "transparent" }} />
      ))}
    </div>
  );
}

// The terminal's heading and body for whatever it's showing; the same layout as
// the little terminal on the slot draws
function ScreenBody({
  screen,
  details,
  phone,
  now,
  onLeaderboard,
}: {
  screen: TerminalScreen;
  details: boolean;
  phone: boolean;
  now: number;
  onLeaderboard: (game: MachineData) => void;
}) {
  const parts = typedParts(screen, details);
  const typing = typeOut(parts, screen, now);
  const [shownFirst = "", ...shownRest] = typing.shown;
  const body = "mt-1 flex h-[5.5rem] flex-col items-center justify-center text-xl leading-6";

  if (screen.kind === "game" && details) {
    // The details have the glass to themselves (the other keys and the hint hide),
    // in exactly the height of the usual screen so the card doesn't grow. Phones
    // have no hint row to take over, so their lines sit a little tighter.
    return (
      <div
        className={`flex items-center justify-center ${phone ? "h-[8.25rem] text-lg leading-5 sm:h-[8.5rem]" : "h-[9.75rem] text-xl leading-6 sm:h-[10rem]"}`}
      >
        <pre className="max-w-full text-left" style={{ fontFamily: TERMINAL_FAMILY }}>
          {typing.shown.map((line, i) => (
            <div key={i} className="overflow-hidden text-ellipsis whitespace-pre">
              {line}
              {(typing.done ? i === typing.shown.length - 1 : typing.cursorAt === i) && <Cursor />}
            </div>
          ))}
        </pre>
      </div>
    );
  }
  if (screen.kind === "game") {
    return (
      <>
        <div className="px-2">
          <FittedTitle text={gameTitle(screen.game)} shown={shownFirst} cursor={typing.cursorAt === 0} />
        </div>
        <div className={body}>
          <p className="line-clamp-2 min-h-12">
            {shownRest[0]}
            {typing.cursorAt === 1 && <Cursor />}
          </p>
          <div className="mt-1 h-7">
            {screen.game.hasLeaderboard !== false ? (
              <TerminalButton onClick={() => onLeaderboard(screen.game)}>LEADERBOARD</TerminalButton>
            ) : (
              <span className="opacity-60">NO SCORES KEPT</span>
            )}
          </div>
        </div>
      </>
    );
  }
  if (screen.kind === "message") {
    return (
      <>
        <div className="px-2">
          <FittedTitle text={screen.lines[0] ?? ""} shown={shownFirst} cursor={typing.cursorAt === 0} />
        </div>
        <div className={body}>
          {shownRest.map((line, i) => (
            <p key={i}>
              {line}
              {typing.cursorAt === i + 1 && <Cursor />}
            </p>
          ))}
        </div>
      </>
    );
  }
  if (screen.kind === "loading") {
    const loading = loadingView(screen, now);
    const title = screen.title.replace(/[‘’]/g, "'").toUpperCase();
    return (
      <>
        <div className="px-2">
          <FittedTitle text={title} shown={title} cursor={false} />
        </div>
        <div className={`${body} gap-2`}>
          <p>{loading.label}</p>
          <LoadingBar blocks={loading.blocks} />
        </div>
      </>
    );
  }
  const reboot = rebootView(screen, now);
  return reboot.crashed ? (
    <>
      <div className="px-2">
        <FittedTitle text="*** FATAL ERROR ***" shown={reboot.blink ? "*** FATAL ERROR ***" : ""} cursor={false} />
      </div>
      <div className={body}>
        <p>TILT DETECTED</p>
        <p>CORE DUMPED</p>
      </div>
    </>
  ) : (
    <>
      <div className="px-2">
        <FittedTitle text="> REBOOTING..." shown={`> REBOOTING${reboot.dots}`} cursor={false} />
      </div>
      <div className={`${body} gap-2`}>
        <LoadingBar blocks={reboot.blocks} />
        <p className="h-6">{reboot.check}</p>
      </div>
    </>
  );
}

export default function GameCard({ screen, details, phone, style, className = "", onLeaderboard, onBrowseAll, onToggleDetails }: Props) {
  const now = useClock(screen, details);
  const controls = terminalControls(screen, details);

  return (
    <div className={`pointer-events-none flex flex-col items-center gap-2 text-center ${className}`} style={style}>
      {/* The beige case, stretching to whatever room the ledge leaves */}
      <div
        className="pointer-events-auto relative flex w-full flex-1 flex-col rounded-2xl p-1.5 pb-4"
        style={{
          background: "linear-gradient(#c9bc9f, #b3a585)",
          boxShadow: "inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -3px 0 rgba(0,0,0,0.2), 0 10px 30px rgba(0,0,0,0.55)",
        }}
      >
        {/* The glass: scanlines, a vignette, and phosphor text */}
        <div
          className="relative flex flex-1 flex-col justify-center overflow-hidden rounded-xl px-3 pb-1.5 pt-1"
          style={{
            background: "radial-gradient(ellipse at center, #06260f 0%, #021407 70%, #010a04 100%)",
            boxShadow: "inset 0 0 22px rgba(0,0,0,0.9), inset 0 0 2px rgba(0,0,0,1), 0 0 0 3px #1a1614",
            color: PHOSPHOR,
            fontFamily: TERMINAL_FAMILY,
            textShadow: GLOW,
          }}
        >
          <ScreenBody screen={screen} details={details} phone={phone} now={now} onLeaderboard={onLeaderboard} />

          {/* Hidden rather than removed while busy, so the card keeps its size (the
              details take its row over) */}
          {!phone && controls !== "details" && (
            <p className={`mt-1 h-5 text-base leading-5 opacity-55 ${controls === "none" ? "invisible" : ""}`}>{PLAY_HINT}</p>
          )}

          {/* The keys, along the bottom: the site menu (phones) and all games on the
              left; on the right ?, which lifts the cartridge up for a look */}
          {controls === "all" && (
            <div className="absolute bottom-0.5 left-1 z-10 flex text-xl">
              {phone && <MenuKey />}
              <TerminalButton onClick={onBrowseAll} label="Show all games">
                ^
              </TerminalButton>
            </div>
          )}
          {controls !== "none" && (
            <div className="absolute bottom-0.5 right-1 z-10 flex text-xl">
              <TerminalButton onClick={onToggleDetails} pressed={details} label={details ? "Put the cartridge back" : "Inspect the cartridge"}>
                ?
              </TerminalButton>
            </div>
          )}

          {/* Scanlines over everything */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0.28) 0 1px, transparent 1px 3px)" }}
          />
        </div>
        {/* The case's badge and power light */}
        <div className="absolute inset-x-3.5 bottom-0.5 flex items-center justify-between font-sans text-[0.55rem] font-bold uppercase tracking-[0.2em] text-[#5a5040]">
          <span>SA-86 Terminal</span>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: PHOSPHOR, boxShadow: `0 0 4px ${PHOSPHOR}` }} />
        </div>
      </div>
    </div>
  );
}
