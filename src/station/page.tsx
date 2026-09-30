import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import AnimatedPage from "../components/AnimatedPage";
import LoadingSpinner from "../components/LoadingSpinner";
import { useNavigatorContext } from "../components/navigator/context";
import CrtTransition from "../pages/ArcadeV2/CrtTransition";
import LeaderboardDialog from "../pages/Arcade/LeaderboardDialog";
import { createArcadeGames, normalizeMachineName, pickShuffleGame, useIsMobileArcade, type MachineData } from "../pages/Arcade/games";
import { eventState, useContentLoop, useScareboard, useSession, useTodayMovie } from "./data.ts";
import { HEADINGS, PHONE_HEADINGS, isCatalogueTab, isHeading, isStopId, STOPS, STOP_IDS, type CatalogueTab, type GoTo, type Heading, type StopId } from "./stops.ts";
import { PinnedPaper, useBoardPapers, type Paper } from "./board/BoardPapers.tsx";
import { FlyerFace, useEventThings } from "./things/EventThings.tsx";
import DepartureBoard from "./things/DepartureBoard.tsx";
import { Catalogue, KioskWindow } from "./things/Kiosk.tsx";
import Sheet, { type SheetContent } from "./Sheet.tsx";
import HeldCard, { type HeldItem } from "./HeldCard.tsx";
import { plate, sans, serif } from "./style/theme.ts";
import StationPlay from "./StationPlay.tsx";
import type { Boards } from "./StationScene.tsx";

const StationScene = lazy(() => import("./StationScene.tsx"));
const CartridgeArcade = lazy(() => import("../pages/ArcadeV2/CartridgeArcade.tsx"));

// Wayside Station: the whole site as one train platform, with one way of using it: the
// things in the station. The board's papers are the home page; the events table's flyers
// and poster are the event; the departure board shows the Scareboard and timetable; the
// kiosk window is your ticket; the cabinet is the arcade, exactly as at /arcade. Nothing
// here leads back to the classic pages.
//
// Phones first: standing at an object, the object sits in the top of the screen and the
// thing you're holding fills the rest (HeldCard), as the arcade's card sits under its
// cabinet; taps in the scene choose what you hold. On wider screens you read and use the
// things where they stand, and pick up what's worth a closer look (Sheet).
//
// Where the visitor is lives in the URL (?at= an object, ?open= something there,
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

// Paint the scene's own textures from live data: the papers' headlines (the stand-ins
// under their HTML), the departure board as seen from afar, and the poster
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
      className={`pointer-events-auto p-1 drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)] transition active:scale-95 md:hover:scale-105 ${left ? "md:hover:-translate-x-1" : "md:hover:translate-x-1"}`}
    >
      <svg viewBox="0 0 72 44" className="h-10 w-16 md:h-11 md:w-[4.5rem]" style={{ transform: left ? undefined : "scaleX(-1)" }}>
        <path d="M3 22 L20 3 H69 V41 H20 Z" fill="#1d2a3a" stroke="#0b1017" strokeWidth="3" strokeLinejoin="round" />
        <path d="M9 22 L22.5 7.5 H64 V36.5 H22.5 Z" fill="none" stroke="#f2ead2" strokeWidth="2" strokeLinejoin="round" />
        <path d="M52 22 H30 M38 14 L30 22 L38 30" fill="none" stroke="#f2ead2" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// What's taken up to look at: a key, turned into content each render so it stays live
type Held =
  | { kind: "paper"; id: string }
  | { kind: "flyer"; id: string }
  | { kind: "departures" }
  | { kind: "window" }
  | { kind: "catalogue"; tab: CatalogueTab };

export default function StationPage() {
  const [params, setParams] = useSearchParams();
  const atParam = params.get("at");
  const faceParam = params.get("face");
  const open = params.get("open") ?? undefined;
  const at: StopId | null = isStopId(atParam) ? atParam : null;
  const session = useSession();
  const signedIn = Boolean(session);
  // Phones and tablets (and anything touch-first)
  const compact = useIsMobileArcade();
  // Phones turn to the events table on its own; wide screens see it with the board
  const headings = compact ? PHONE_HEADINGS : HEADINGS;
  const wanted: Heading = at ? STOPS[at].heading : isHeading(faceParam) ? faceParam : "front";
  const heading: Heading = headings.includes(wanted) ? wanted : "front";

  const faceParams = (face: Heading): Record<string, string> => (face === "front" ? {} : { face });
  const select = (id: StopId | null, openThere?: string) =>
    setParams(id ? { at: id, ...(openThere ? { open: openThere } : {}) } : faceParams(heading));
  const goTo: GoTo = (id, openThere) => select(id, openThere);
  const turn = (direction: 1 | -1) => {
    const next = headings[(headings.indexOf(heading) + direction + headings.length) % headings.length];
    setParams(faceParams(next), { replace: true });
  };

  // Everything that can be read or used
  const papers = useBoardPapers(signedIn, goTo);
  const { flyers, tonight } = useEventThings(signedIn, goTo);
  const boards = useBoards(signedIn, papers);
  const [held, setHeld] = useState<Held | null>(null);
  const putBack = useCallback(() => setHeld(null), []);

  // On phones, which of the object's things the card holds, and whether the walk there is done
  const [cardIndex, setCardIndex] = useState(0);
  const [atArrived, setAtArrived] = useState(false);
  useEffect(() => {
    setAtArrived(false);
    if (!at) return;
    const arrive = window.setTimeout(() => setAtArrived(true), 500);
    return () => window.clearTimeout(arrive);
  }, [at]);

  // Arriving with ?open= takes the named thing up (e.g. the shop, or tonight's film)
  useEffect(() => {
    setHeld(null);
    const flyerIndex = flyers.findIndex((flyer) => flyer.id === open);
    setCardIndex(at === "events" && flyerIndex >= 0 ? flyerIndex : 0);
    if (at === "events" && flyerIndex >= 0 && !compact) setHeld({ kind: "flyer", id: flyers[flyerIndex].id });
    if (at === "tickets" && signedIn && isCatalogueTab(open)) setHeld({ kind: "catalogue", tab: open });
    // The flyers are rebuilt every render; only arriving (or ?open= changing) should do this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, open, signedIn, compact]);

  const openCatalogue = (tab: CatalogueTab) => setHeld({ kind: "catalogue", tab });
  const sheet: SheetContent | null = (() => {
    if (!held) return null;
    if (held.kind === "paper") {
      const paper = papers.find((p) => p.id === held.id);
      return paper ? { id: paper.id, title: paper.title, tint: paper.tint, body: paper.full } : null;
    }
    if (held.kind === "flyer") return flyers.find((f) => f.id === held.id)?.sheet ?? (held.id === "tonight" ? tonight : null);
    if (held.kind === "departures")
      return { id: "departures", title: "Departure board", tone: "board", body: <DepartureBoard key={open} signedIn={signedIn} goTo={goTo} open={open} /> };
    if (held.kind === "window")
      return { id: "window", title: "Ticket kiosk", tint: "#efe3c8", body: <KioskWindow signedIn={session === undefined ? undefined : signedIn} onOpen={openCatalogue} /> };
    return { id: `catalogue-${held.tab}`, title: "Ticket kiosk", tone: "ledger", body: <Catalogue key={held.tab} initialTab={held.tab} /> };
  })();

  // A tap on a thing in the scene: on phones, hold it in the card; on wide screens (where
  // the HTML isn't drawn, or for the poster), pick it up
  const onPart = (part: string) => {
    if (compact) {
      const index =
        part.startsWith("paper-") || part.startsWith("flyer-") ? Number(part.slice(6)) : part === "poster" ? flyers.findIndex((f) => f.id === "tonight") : 0;
      if (index >= 0) setCardIndex(index);
      return;
    }
    if (part.startsWith("paper-")) {
      const paper = papers[Number(part.slice(6))];
      if (paper) setHeld({ kind: "paper", id: paper.id });
    } else if (part.startsWith("flyer-")) {
      const flyer = flyers[Number(part.slice(6))];
      if (flyer) setHeld({ kind: "flyer", id: flyer.id });
    } else if (part === "poster") setHeld({ kind: "flyer", id: "tonight" });
    else if (part === "departures") setHeld({ kind: "departures" });
    else if (part === "window") setHeld({ kind: "window" });
  };

  const surfaces: Record<string, ReactNode> = {
    departures: <DepartureBoard key={open} signedIn={signedIn} goTo={goTo} open={open} />,
    window: <KioskWindow signedIn={session === undefined ? undefined : signedIn} onOpen={openCatalogue} />,
  };
  papers.forEach(
    (paper, i) =>
      (surfaces[`paper-${i}`] = (
        <PinnedPaper paper={paper} held={compact && at === "bulletin" && cardIndex === i} onOpen={() => setHeld({ kind: "paper", id: paper.id })} />
      ))
  );
  flyers.forEach(
    (flyer, i) =>
      (surfaces[`flyer-${i}`] = (
        <FlyerFace flyer={flyer} held={compact && at === "events" && cardIndex === i} onOpen={() => setHeld({ kind: "flyer", id: flyer.id })} />
      ))
  );

  // Phones: what the card under the object can hold
  const cardItems: HeldItem[] | null =
    !compact || !at || at === "arcade"
      ? null
      : at === "bulletin"
        ? papers.map((paper) => ({
            id: paper.id,
            label: paper.kind === "THE POST" ? "The Scareathon Post" : paper.kind.toLowerCase(),
            tone: "paper" as const,
            tint: paper.tint,
            body: paper.full,
          }))
        : at === "events"
          ? flyers.map((flyer) => ({ id: flyer.id, label: flyer.title, tone: flyer.sheet.tone ?? "paper", tint: flyer.sheet.tint, body: flyer.sheet.body }))
          : at === "departures"
            ? [{ id: "departures", label: "Departures", tone: "board", body: <DepartureBoard key={open} signedIn={signedIn} goTo={goTo} open={open} /> }]
            : [
                {
                  id: "window",
                  label: "Ticket kiosk",
                  tone: "paper",
                  tint: "#efe3c8",
                  body: <KioskWindow signedIn={session === undefined ? undefined : signedIn} onOpen={openCatalogue} glass={false} />,
                },
              ];

  // The arcade: the cartridge arcade itself, once the visitor has walked up to the cabinet
  const games = useMemo(() => createArcadeGames().filter((g) => !compact || g.availableOnMobile !== false), [compact]);
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
  const keys = useRef({ at, heading, select, turn, busy: false });
  keys.current = { at, heading, select, turn, busy: Boolean(playing || held) };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const { at: current, heading: facing, select: go, turn: face, busy } = keys.current;
      if (busy) return;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      // A focused button or link keeps Enter for itself
      if (event.key === "Enter" && ["BUTTON", "A"].includes(target?.tagName ?? "")) return;
      const ahead = { front: "bulletin", table: "events", right: "tickets", back: null, left: "arcade" }[facing] as StopId | null;
      if (!current && event.key === "ArrowLeft") face(-1);
      else if (!current && event.key === "ArrowRight") face(1);
      else if (!current && (event.key === "ArrowUp" || event.key === "Enter") && ahead) go(ahead);
      else if (current && event.key === "Escape") go(null);
      // The arcade has its own arrow keys
      else if (current && current !== "arcade" && event.key === "ArrowDown") go(null);
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

  // Keep every click inside the station: site links go to the matching object instead
  const keepInStation = (event: ReactMouseEvent) => {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (!link || !href || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/station") || link.target === "_blank") return;
    event.preventDefault();
    const [id, openThere] = stationPlaceFor(href);
    select(id, openThere);
  };

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <div className="fixed inset-0 bg-black" onClickCapture={keepInStation} style={sans}>
        {/* On phones the scene gives the bottom of the screen to the held card */}
        <div className="absolute inset-x-0 top-0 transition-[bottom] duration-300 ease-out" style={{ bottom: cardItems ? "58%" : 0 }}>
          <Suspense fallback={<LoadingSpinner />}>
            <StationScene
            at={at}
            heading={heading}
            onSelect={select}
            onTurn={turn}
            boards={boards}
            paused={Boolean(playing) || atCabinet}
            surfaces={surfaces}
            surfacesInteractive={!compact}
            onPart={onPart}
            />
          </Suspense>
        </div>
        {cardItems && atArrived && <HeldCard items={cardItems} index={cardIndex} onIndex={setCardIndex} />}

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
            className={`${plate} absolute left-3 z-20 flex min-h-11 items-center rounded-[3px] px-3 text-sm uppercase tracking-[0.2em] md:left-4`}
            style={{ ...serif, top: "max(0.75rem, env(safe-area-inset-top))" }}
          >
            ◂ Platform
          </button>
        )}

        {/* Turning: direction signs, low on phones where thumbs are, mid-height on desktop */}
        {!at && (
          <div
            className="pointer-events-none absolute inset-x-0 flex justify-between px-2 md:top-1/2 md:-translate-y-1/2 md:px-3"
            style={compact ? { bottom: "max(1.25rem, env(safe-area-inset-bottom))" } : undefined}
          >
            <ArrowSign direction={-1} onClick={() => turn(-1)} />
            <ArrowSign direction={1} onClick={() => turn(1)} />
          </div>
        )}

        <Sheet sheet={sheet} onClose={putBack} />

        {/* Real controls for keyboard and screen-reader users: the canvas is only a picture */}
        <nav className="sr-only" aria-label="Station objects">
          {STOP_IDS.map((id) => (
            <button key={id} type="button" onClick={() => select(id)}>
              {STOPS[id].label}
            </button>
          ))}
          {at === "bulletin" &&
            papers.map((paper) => (
              <button key={paper.id} type="button" onClick={() => setHeld({ kind: "paper", id: paper.id })}>
                Read: {paper.title}
              </button>
            ))}
          {at === "events" &&
            flyers.map((flyer) => (
              <button key={flyer.id} type="button" onClick={() => setHeld({ kind: "flyer", id: flyer.id })}>
                Pick up: {flyer.title}
              </button>
            ))}
          {at === "departures" && (
            <button type="button" onClick={() => setHeld({ kind: "departures" })}>
              Read the departure board
            </button>
          )}
          {at === "tickets" && (
            <button type="button" onClick={() => setHeld({ kind: "window" })}>
              Go to the window
            </button>
          )}
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
          @keyframes station-card-up { from { transform: translateY(100%) } to { transform: none } }
          .station-card { animation: station-card-up 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both }
          @keyframes station-card-in { from { opacity: 0 } to { opacity: 1 } }
          .station-card-body { animation: station-card-in 0.2s ease-out both }
          @keyframes station-sheet-up { from { transform: translateY(100%) } to { transform: none } }
          @keyframes station-sheet-lift { from { opacity: 0; transform: translateY(24px) rotate(-1.5deg) scale(0.92) } to { opacity: 1; transform: none } }
          .station-sheet { animation: station-sheet-up 0.32s cubic-bezier(0.2, 0.8, 0.2, 1) both }
          @media (min-width: 768px) { .station-sheet { animation-name: station-sheet-lift; animation-duration: 0.28s } }
          @media (prefers-reduced-motion: reduce) { .station-arrive, .station-sheet, .station-card, .station-card-body { animation: none } }
        `}</style>
      </div>
    </AnimatedPage>
  );
}
