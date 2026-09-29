import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useSearchParams } from "react-router-dom";
import AnimatedPage from "../components/AnimatedPage";
import LoadingSpinner from "../components/LoadingSpinner";
import { useNavigatorContext } from "../components/navigator/context";
import CrtTransition from "../pages/ArcadeV2/CrtTransition";
import LeaderboardDialog from "../pages/Arcade/LeaderboardDialog";
import { createArcadeGames, normalizeMachineName, pickShuffleGame, useIsMobileArcade, type MachineData } from "../pages/Arcade/games";
import { eventState, useContentLoop, useScareboard, useSession, useTodayMovie } from "./data.ts";
import { HEADINGS, isHeading, isStopId, STOPS, STOP_IDS, VIEWS, type GoTo, type Heading, type StopId } from "./stops.ts";
import { useBoardPapers, type Paper } from "./board/BoardPapers.tsx";
import { PaperReader } from "./board/PaperReader.tsx";
import { plate, sans, serif } from "./panels/theme.ts";
import StationPlay from "./StationPlay.tsx";
import type { Boards } from "./StationScene.tsx";

const StationScene = lazy(() => import("./StationScene.tsx"));
const CartridgeArcade = lazy(() => import("../pages/ArcadeV2/CartridgeArcade.tsx"));
const EventsPanel = lazy(() => import("./panels/EventsPanel.tsx"));
const DeparturesPanel = lazy(() => import("./panels/DeparturesPanel.tsx"));
const KioskPanel = lazy(() => import("./panels/KioskPanel.tsx"));

// Wayside Station: the whole site as one train platform, and nothing here leads back to
// the classic pages. The board's papers are the home page; the arcade cabinet is the
// arcade, exactly as it works at /arcade; the other objects open a panel beside them.
// Where the visitor is lives in the URL (?at= an object, ?open= a tab or game there,
// ?face= which way they face), so Back walks them back.

// Links into the classic site that turn up inside reused components go to the matching
// place in the station instead
function stationPlaceFor(path: string): [StopId, string?] {
  if (path.startsWith("/profile/shop")) return ["tickets", "shop"];
  if (path.startsWith("/profile/avatar")) return ["tickets", "wardrobe"];
  if (path.startsWith("/profile/inbox") || path.startsWith("/inbox")) return ["tickets", "inbox"];
  if (path.startsWith("/profile") || path.startsWith("/authentication")) return ["tickets"];
  if (path.startsWith("/arcade")) return ["arcade"];
  if (path.includes("scareboard")) return ["departures"];
  if (path.includes("calendar")) return ["departures", "timetable"];
  if (path.includes("rules")) return ["events", "rules"];
  if (path.startsWith("/scareathon/today")) return ["events", "tonight"];
  if (path.startsWith("/scareathon")) return ["events"];
  return ["bulletin"];
}

// Paint the boards in the scene from live data: the papers' headlines (under their crisp
// HTML), the Scareboard, tonight's film or the countdown on the departure board, and the
// poster over the events table
function useBoards(signedIn: boolean, papers: Paper[]): Boards {
  const { isLive, daysUntil, year } = eventState();
  const { data: items = [] } = useContentLoop();
  const { data: scoreboard } = useScareboard(null, signedIn);
  const { data: movie } = useTodayMovie(isLive && signedIn);
  // Keyed on the text, so the board is only repainted when a paper's headline changes
  const noticeKey = papers.map((paper) => `${paper.kind}\u0000${paper.title}`).join("\u0001");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const notices = useMemo(() => papers.map((paper) => ({ kind: paper.kind, title: paper.title })), [noticeKey]);
  return useMemo(() => {
    const lines: string[] = [];
    if (movie?.data?.title) lines.push(`TONIGHT  ${movie.data.title}`);
    (scoreboard?.leaderboard.data ?? []).slice(0, 3 - lines.length).forEach((row) => lines.push(`${String(row.rank).padStart(2)}  ${row.name}  ${row.total ?? ""}`));
    if (!isLive) lines.push(`SCAREATHON  OCT 01  IN ${daysUntil} ${daysUntil === 1 ? "DAY" : "DAYS"}`);
    const challenge = items.find((item) => item.type === "weekly_challenge");
    if (challenge?.gameName) lines.push(`CHALLENGE  ${challenge.gameName}`);
    lines.push("ARCADE  ALL NIGHT  BOARDING");
    const film = movie?.data;
    const poster = film ? { image: film.lowResUrl ?? null, title: film.title, line: "Showing tonight" } : { image: null, title: "Scare-athon", line: isLive ? "Showing all October" : `October 1 to 31, ${year}` };
    return { notices, departures: lines.slice(0, 3), poster };
  }, [notices, items, scoreboard, movie, isLive, daysUntil, year]);
}

// Direction signs for turning: a pointed enamel plate
function ArrowSign({ direction, onClick }: { direction: -1 | 1; onClick: () => void }) {
  const left = direction === -1;
  return (
    <button
      type="button"
      aria-label={left ? "Turn left" : "Turn right"}
      onClick={onClick}
      className={`pointer-events-auto drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)] transition hover:scale-105 ${left ? "hover:-translate-x-1" : "hover:translate-x-1"}`}
    >
      <svg viewBox="0 0 72 44" className="h-11 w-[4.5rem]" style={{ transform: left ? undefined : "scaleX(-1)" }}>
        <path d="M3 22 L20 3 H69 V41 H20 Z" fill="#1d2a3a" stroke="#0b1017" strokeWidth="3" strokeLinejoin="round" />
        <path d="M9 22 L22.5 7.5 H64 V36.5 H22.5 Z" fill="none" stroke="#f2ead2" strokeWidth="2" strokeLinejoin="round" />
        <path d="M52 22 H30 M38 14 L30 22 L38 30" fill="none" stroke="#f2ead2" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export default function StationPage() {
  const [params, setParams] = useSearchParams();
  const atParam = params.get("at");
  const faceParam = params.get("face");
  const open = params.get("open") ?? undefined;
  const at: StopId | null = isStopId(atParam) ? atParam : null;
  const heading: Heading = at ? STOPS[at].heading : isHeading(faceParam) ? faceParam : "front";
  const session = useSession();
  const signedIn = Boolean(session);

  const faceParams = (face: Heading): Record<string, string> => (face === "front" ? {} : { face });
  const select = (id: StopId | null, openThere?: string) =>
    setParams(id ? { at: id, ...(openThere ? { open: openThere } : {}) } : faceParams(heading));
  const goTo: GoTo = (id, openThere) => select(id, openThere);
  const turn = (direction: 1 | -1) => {
    const next = HEADINGS[(HEADINGS.indexOf(heading) + direction + HEADINGS.length) % HEADINGS.length];
    setParams(faceParams(next), { replace: true });
  };

  // The board's papers, and the one taken down to read
  const papers = useBoardPapers(signedIn, goTo);
  const [reading, setReading] = useState<string | null>(null);
  const readingPaper = papers.find((paper) => paper.id === reading) ?? null;
  const closeReader = useCallback(() => setReading(null), []);
  useEffect(() => {
    if (at !== "bulletin") setReading(null);
  }, [at]);
  const boards = useBoards(signedIn, papers);

  // The arcade: the cartridge arcade itself, once the visitor has walked up to the cabinet
  const isMobileArcade = useIsMobileArcade();
  const games = useMemo(() => createArcadeGames().filter((g) => !isMobileArcade || g.availableOnMobile !== false), [isMobileArcade]);
  const [atCabinet, setAtCabinet] = useState(false);
  useEffect(() => {
    if (at !== "arcade") {
      setAtCabinet(false);
      return;
    }
    const arrive = window.setTimeout(() => setAtCabinet(true), 950); // the walk to the cabinet
    return () => window.clearTimeout(arrive);
  }, [at]);
  const initialGame = useMemo(() => {
    const wanted = open ? normalizeMachineName(open) : null;
    return games.find((game) => normalizeMachineName(game.name) === wanted)?.name;
    // Read when the cabinet opens; inserting a cartridge updates ?open= and mustn't rebuild it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, atCabinet]);
  const [leaderboardGame, setLeaderboardGame] = useState<MachineData | null>(null);

  // Playing a game: a CRT power-on into it, and power-off back out, as in the arcade
  const [playing, setPlaying] = useState<MachineData | null>(null);
  const [transition, setTransition] = useState<{ mode: "on" | "off"; game: MachineData | null } | null>(null);
  const play = (game: MachineData) => {
    if (game.special === "mystery" || game.special === "soon") return;
    setTransition({ mode: "on", game: game.special === "shuffle" ? pickShuffleGame(games) : game });
  };
  const stopPlaying = () => setTransition({ mode: "off", game: null });

  // On phones the arcade's terminal has a key for the site menu; here it steps back to the platform
  const { mobileMenuOpen, setMobileMenuOpen } = useNavigatorContext();
  useEffect(() => {
    if (!mobileMenuOpen) return;
    setMobileMenuOpen(false);
    if (at) select(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileMenuOpen]);

  // Keyboard: arrows turn, Up or Enter walks to what's ahead, Down or Esc steps back
  const keys = useRef({ at, heading, select, turn, playing, reading });
  keys.current = { at, heading, select, turn, playing, reading };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const { at: current, heading: facing, select: go, turn: face, playing: inGame, reading: inReader } = keys.current;
      if (inGame || inReader) return;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      // A focused button or link keeps Enter for itself
      if (event.key === "Enter" && ["BUTTON", "A"].includes(target?.tagName ?? "")) return;
      const ahead = VIEWS[facing].focus;
      const inPanel = Boolean(target?.closest("[data-station-panel]"));
      if (!current && event.key === "ArrowLeft") face(-1);
      else if (!current && event.key === "ArrowRight") face(1);
      else if (!current && (event.key === "ArrowUp" || event.key === "Enter") && ahead) go(ahead);
      else if (current && event.key === "Escape") go(null);
      // The arcade has its own arrow keys
      else if (current && current !== "arcade" && event.key === "ArrowDown" && !inPanel) go(null);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // One fixed screen: no page scrolling behind the scene
  useEffect(() => {
    const targets = [document.documentElement, document.body];
    const previous = targets.map((el) => [el.style.overflow, el.style.overscrollBehavior]);
    targets.forEach((el) => {
      el.style.overflow = "hidden";
      el.style.overscrollBehavior = "none";
    });
    return () => {
      targets.forEach((el, i) => {
        el.style.overflow = previous[i][0];
        el.style.overscrollBehavior = previous[i][1];
      });
    };
  }, []);

  // A panel covers part of the screen; the scene shifts so the object stays in view beside it
  const hasPanel = at === "events" || at === "departures" || at === "tickets";
  const panelRef = useRef<HTMLElement | null>(null);
  const [inset, setInset] = useState({ right: 0, bottom: 0 });
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!hasPanel || !panel) {
      setInset({ right: 0, bottom: 0 });
      return;
    }
    const measure = () => {
      const wide = window.innerWidth >= 768;
      setInset(wide ? { right: panel.offsetWidth, bottom: 0 } : { right: 0, bottom: panel.offsetHeight });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    measure();
    return () => observer.disconnect();
  }, [hasPanel, at]);

  // Keep every click inside the station: site links go to the matching object instead
  const keepInStation = (event: ReactMouseEvent) => {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (!link || !href || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/station") || link.target === "_blank") return;
    event.preventDefault();
    const [id, openThere] = stationPlaceFor(href);
    select(id, openThere);
  };

  const panelProps = { signedIn, goTo, open };

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <div className="fixed inset-0 bg-black" onClickCapture={keepInStation} style={sans}>
        <Suspense fallback={<LoadingSpinner />}>
          <StationScene
            at={at}
            heading={heading}
            onSelect={select}
            onTurn={turn}
            boards={boards}
            inset={inset}
            paused={Boolean(playing) || atCabinet}
            papers={papers.map((paper) => ({ id: paper.id, tint: paper.tint, node: paper.pinned }))}
            onPaper={(i) => setReading(papers[i]?.id ?? null)}
          />
        </Suspense>

        {/* The arcade, as it is at /arcade, without its room */}
        {atCabinet && (
          <div className="station-arrive absolute inset-0 z-10 bg-black">
            <Suspense fallback={<LoadingSpinner />}>
              <CartridgeArcade
                games={games}
                initialGameName={initialGame}
                paused={Boolean(playing)}
                onInsert={(game) => setParams({ at: "arcade", open: game.name }, { replace: true })}
                onPlay={play}
                onLeaderboard={setLeaderboardGame}
                withRoom={false}
              />
            </Suspense>
          </div>
        )}
        {leaderboardGame && (
          <LeaderboardDialog game={leaderboardGame.name} accent={leaderboardGame.cartridge.color} onClose={() => setLeaderboardGame(null)} />
        )}

        {at && (
          <button
            type="button"
            onClick={() => select(null)}
            className={`${plate} absolute left-4 top-4 z-20 rounded-[3px] px-3 py-1.5 text-sm uppercase tracking-[0.2em]`}
            style={serif}
          >
            ◂ Platform
          </button>
        )}

        {/* Turning: direction signs at the edges, like Inscryption's arrows */}
        {!at && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-3">
            <ArrowSign direction={-1} onClick={() => turn(-1)} />
            <ArrowSign direction={1} onClick={() => turn(1)} />
          </div>
        )}

        {hasPanel && (
          <aside
            key={at}
            ref={panelRef}
            data-station-panel
            aria-label={at ? STOPS[at].label : undefined}
            className="absolute inset-x-0 bottom-0 h-[64%] overflow-y-auto overscroll-contain rounded-t-md border-t-2 border-[#f2ead2]/30 bg-[#0d131b]/95 px-5 pb-10 pt-5 text-stone-200 shadow-[0_-10px_40px_rgba(0,0,0,0.6)] backdrop-blur md:inset-x-auto md:right-0 md:top-0 md:h-auto md:w-[min(32rem,46vw)] md:rounded-none md:border-l-2 md:border-t-0 md:pb-8"
            style={{ touchAction: "pan-y" }}
          >
            <Suspense fallback={<LoadingSpinner />}>
              {at === "events" && <EventsPanel {...panelProps} />}
              {at === "departures" && <DeparturesPanel {...panelProps} />}
              {at === "tickets" && <KioskPanel signedIn={session === undefined ? undefined : signedIn} open={open} />}
            </Suspense>
          </aside>
        )}

        <PaperReader paper={readingPaper} onClose={closeReader} />

        {/* Real controls for keyboard and screen-reader users: the canvas is only a picture */}
        <nav className="sr-only" aria-label="Station objects">
          {STOP_IDS.map((id) => (
            <button key={id} type="button" onClick={() => select(id)}>
              {STOPS[id].label}
            </button>
          ))}
          {at === "bulletin" &&
            papers.map((paper) => (
              <button key={paper.id} type="button" onClick={() => setReading(paper.id)}>
                Read: {paper.title}
              </button>
            ))}
        </nav>

        <StationPlay machine={playing} onClose={stopPlaying} onSignIn={() => { stopPlaying(); select("tickets"); }} />
        {transition && (
          <CrtTransition
            mode={transition.mode}
            onMidpoint={() => setPlaying(transition.mode === "on" ? transition.game : null)}
            onDone={() => setTransition(null)}
          />
        )}
        <style>{`
          @keyframes station-arrive { from { opacity: 0 } to { opacity: 1 } }
          .station-arrive { animation: station-arrive 0.45s ease-out both }
          @keyframes station-lift { from { opacity: 0; transform: translateY(24px) rotate(-1.5deg) scale(0.92) } to { opacity: 1; transform: none } }
          .station-lift { animation: station-lift 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both }
          @media (prefers-reduced-motion: reduce) { .station-arrive, .station-lift { animation: none } }
        `}</style>
      </div>
    </AnimatedPage>
  );
}
