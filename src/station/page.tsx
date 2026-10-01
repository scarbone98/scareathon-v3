import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import AnimatedPage from "../components/AnimatedPage";
import LoadingSpinner from "../components/LoadingSpinner";
import { useNavigatorContext } from "../components/navigator/context";
import CrtTransition from "../pages/ArcadeV2/CrtTransition";
import type { CabinetFrame } from "../pages/ArcadeV2/CartridgeArcade";
import LeaderboardDialog from "../pages/Arcade/LeaderboardDialog";
import { createArcadeGames, normalizeMachineName, pickShuffleGame, useIsMobileArcade, type MachineData } from "../pages/Arcade/games";
import { eventState, useContentLoop, useScareboard, useSession, useSummary, useTodayMovie } from "./data.ts";
import { FOLD, HEADINGS, isHeading, isStopId, STOPS, STOP_IDS, VIEWS, type GoTo, type Heading, type StopId } from "./stops.ts";
import { PinnedPaper, useBoardPapers, type Paper } from "./board/BoardPapers.tsx";
import { FlyerFace, useEventThings } from "./things/EventThings.tsx";
import DepartureBoard from "./things/DepartureBoard.tsx";
import { KioskWindow } from "./things/Kiosk.tsx";
import { Letters, Register, Shop, Wardrobe } from "./things/Belongings.tsx";
import Sheet, { type SheetContent } from "./Sheet.tsx";
import HeldCard, { type HeldItem } from "./HeldCard.tsx";
import { STATION_FONTS, sans } from "./style/theme.ts";
import StationPlay from "./StationPlay.tsx";
import PixelArrow from "./style/PixelArrow.tsx";
import type { Boards } from "./StationScene.tsx";
import { ROW_DONE_MS } from "./arcadeRow.ts";
import { stationPlaceFor } from "./places.ts";

const StationScene = lazy(() => import("./StationScene.tsx"));
const CartridgeArcade = lazy(() => import("../pages/ArcadeV2/CartridgeArcade.tsx"));

// Wayside Station: the whole site as one train platform, with one way of using it: the
// things in the station. The board's papers are the home page; the events table's flyers
// and poster are the event and its calendar; the scoreboard shows the Scareboard; the
// kiosk window is your ticket and the item shop; your locker holds your clothes; your
// pigeonhole your letters, and the register beside it your name; the cabinet is the
// arcade, exactly as at /arcade. Nothing here leads back to the classic pages.
//
// Phones first: standing at an object, the object sits in the top of the screen and the
// thing you're holding fills the rest (HeldCard), as the arcade's card sits under its
// cabinet; taps in the scene choose what you hold. On wider screens you read and use the
// things where they stand, and pick up what's worth a closer look (Sheet).
//
// Where the visitor is lives in the URL (?at= an object, ?open= something there,
// ?face= which way they face), so Back walks them back.

// Paint the scene's own textures from live data: the papers' headlines (the stand-ins
// under their HTML), the departure board as seen from afar, and the poster
function useBoards(signedIn: boolean, papers: Paper[]): Boards {
  const { isLive, daysUntil, year } = eventState();
  const { data: items = [] } = useContentLoop();
  const { data: scoreboard } = useScareboard(null, signedIn);
  const { data: movie } = useTodayMovie(isLive && signedIn);
  const { data: summary } = useSummary();
  const unread = signedIn ? summary?.unreadCount ?? 0 : 0;
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
    const poster = film
      ? { image: film.lowResUrl ?? null, title: film.title, line: "Showing tonight" }
      : isLive
        ? { image: null, title: "Showing tonight", line: "Sign in to see what's on" }
        : { image: null, title: "Dark tonight", line: `The first reel: October 1, ${year}` };
    return { notices, departures: lines.slice(0, 3), poster, unread };
  }, [notices, items, scoreboard, movie, isLive, daysUntil, year, unread]);
}

// How much of a phone's screen the held card takes, under the object
const CARD_FRACTION = 0.58;

// Direction signs for turning
function ArrowSign({ direction, onClick }: { direction: -1 | 1; onClick: () => void }) {
  const left = direction === -1;
  return (
    <button
      type="button"
      aria-label={left ? "Turn left" : "Turn right"}
      onClick={onClick}
      className={`pointer-events-auto p-1 transition active:translate-y-px ${left ? "md:hover:-translate-x-1" : "md:hover:translate-x-1"}`}
    >
      <PixelArrow pointing={left ? "left" : "right"} className="h-9 w-[3.75rem] md:h-10 md:w-[4.2rem]" />
    </button>
  );
}

// What's taken up to look at: a key, turned into content each render so it stays live
type Held =
  | { kind: "flyer"; id: string }
  | { kind: "departures" }
  | { kind: "window" }
  | { kind: "shop" }
  | { kind: "wardrobe" }
  | { kind: "letters" }
  | { kind: "register" };


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
  // The same four views on every screen
  const headings = HEADINGS;
  const wanted: Heading = at ? STOPS[at].heading : isHeading(faceParam) ? faceParam : "front";
  const heading: Heading = headings.includes(wanted) ? wanted : FOLD[wanted] ?? "front";

  const faceParams = (face: Heading): Record<string, string> => (face === "front" ? {} : { face });
  const select = (id: StopId | null, openThere?: string) =>
    setParams(id ? { at: id, ...(openThere ? { open: openThere } : {}) } : faceParams(heading));
  const goTo: GoTo = (id, openThere) => select(id, openThere);
  // Counting on from the last turn asked for, so quick presses aren't lost
  const aimed = useRef(heading);
  const settled = useRef(heading);
  if (settled.current !== heading) settled.current = aimed.current = heading;
  const turn = (to: Heading | 1 | -1) => {
    const next = typeof to === "string" ? to : headings[(headings.indexOf(aimed.current) + to + headings.length) % headings.length];
    if (next === aimed.current) return;
    aimed.current = next;
    setParams(faceParams(next), { replace: true });
  };

  // Arriving at the station: the platform for a beat, then up to the board. Only on the
  // way in with nowhere named; anything the visitor does first cancels it.
  const intro = useRef(!params.has("at") && !params.has("face"));
  // Coming in by train: while it stands at the platform, doors shut, the arcade's built
  // behind the scenes; then the doors open and you step off
  const [arriving] = useState(() => !params.has("at"));
  const [onPlatform, setOnPlatform] = useState(!arriving);
  const [trainStopped, setTrainStopped] = useState(false);
  const [doorsMayOpen, setDoorsMayOpen] = useState(false);
  const stopTrain = useCallback(() => setTrainStopped(true), []);
  const stepOff = useCallback(() => setOnPlatform(true), []);
  useEffect(() => {
    if (!intro.current || !onPlatform) return;
    // The visitor went somewhere themselves: no walk
    if (params.toString() !== "") {
      intro.current = false;
      return;
    }
    const walk = window.setTimeout(() => {
      intro.current = false;
      setParams({ at: "bulletin" }, { replace: true });
    }, 500);
    return () => window.clearTimeout(walk);
  }, [params, setParams, onPlatform]);

  // Everything that can be read or used
  const papers = useBoardPapers(signedIn, goTo);
  const { flyers, tonight } = useEventThings(signedIn, goTo);
  const boards = useBoards(signedIn, papers);
  const [held, setHeld] = useState<Held | null>(null);
  const putBack = useCallback(() => setHeld(null), []);

  // At the board, the paper the camera has come up to (by index), if any
  const [zoom, setZoom] = useState<number | null>(null);
  // Papers read where they hang (the welcome) aren't zoomed into
  const zoomTo = (i: number) => {
    if (papers[i] && !papers[i].noZoom) setZoom(i);
  };
  useEffect(() => setZoom(null), [at]);

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
    const flyerIndex = flyers.findIndex((flyer) => flyer.id === open || (open === "event" && flyer.id === "event"));
    setCardIndex(at === "events" && flyerIndex >= 0 ? flyerIndex : at === "mail" && open === "register" ? 1 : 0);
    if (at === "events" && flyerIndex >= 0 && !compact) setHeld({ kind: "flyer", id: flyers[flyerIndex].id });
    if (at === "tickets" && open === "shop") setHeld({ kind: "shop" });
    if (at === "mail" && !compact && (open === "letters" || open === "register")) setHeld({ kind: open });
    if (at === "lockers" && !compact && open) setHeld({ kind: "wardrobe" });
    // The flyers are rebuilt every render; only arriving (or ?open= changing) should do this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, open, signedIn, compact]);

  const openShop = () => setHeld({ kind: "shop" });
  const sheet: SheetContent | null = (() => {
    if (!held) return null;
    if (held.kind === "flyer") return flyers.find((f) => f.id === held.id)?.sheet ?? (held.id === "tonight" ? tonight : null);
    if (held.kind === "departures")
      return { id: "departures", title: "Scoreboard", tone: "board", body: <DepartureBoard signedIn={signedIn} goTo={goTo} /> };
    if (held.kind === "window")
      return { id: "window", title: "Ticket counter", tint: "#efe3c8", body: <KioskWindow signedIn={session === undefined ? undefined : signedIn} onShop={openShop} goTo={goTo} glass={false} /> };
    if (held.kind === "shop") return { id: "shop", title: "Item shop", tone: "ledger", body: <Shop signedIn={signedIn} goTo={goTo} /> };
    if (held.kind === "wardrobe") return { id: "wardrobe", title: "Your locker", tone: "ledger", body: <Wardrobe signedIn={signedIn} goTo={goTo} /> };
    if (held.kind === "letters") return { id: "letters", title: "Inbox", tone: "ledger", body: <Letters signedIn={signedIn} goTo={goTo} /> };
    return { id: "register", title: "Settings", tone: "ledger", body: <Register signedIn={signedIn} goTo={goTo} /> };
  })();

  // A tap on a thing in the scene: a paper, look closer at it; otherwise on phones, hold it
  // in the card, and on wide screens (where the HTML isn't drawn, or for the poster), pick it up
  const onPart = (part: string) => {
    if (part.startsWith("paper-")) {
      zoomTo(Number(part.slice(6)));
      return;
    }
    if (part === "window") {
      setHeld(signedIn ? { kind: "shop" } : { kind: "window" });
      return;
    }
    if (part.startsWith("advert-")) {
      select("arcade", part.slice(7));
      return;
    }
    if (compact) {
      const index = part.startsWith("flyer-")
        ? Number(part.slice(6)) + 1
        : part === "poster"
          ? 0
          : part === "register"
            ? 1
            : 0;
      if (index >= 0) setCardIndex(index);
      return;
    }
    if (part.startsWith("flyer-")) {
      const flyer = flyers[Number(part.slice(6)) + 1];
      if (flyer) setHeld({ kind: "flyer", id: flyer.id });
    } else if (part === "poster") setHeld({ kind: "flyer", id: "tonight" });
    else if (part === "departures") setHeld({ kind: "departures" });
    else if (part === "window") setHeld({ kind: "window" });
    else if (part === "locker") setHeld({ kind: "wardrobe" });
    else if (part === "letters" || part === "register") setHeld({ kind: part });
  };

  const surfaces: Record<string, ReactNode> = {
    departures: <DepartureBoard signedIn={signedIn} goTo={goTo} />,
  };
  papers.forEach(
    (paper, i) =>
      (surfaces[`paper-${i}`] = (
        <PinnedPaper paper={paper} zoomed={at === "bulletin" && zoom === i} onOpen={() => zoomTo(i)} />
      ))
  );
  flyers.slice(1).forEach(
    (flyer, i) =>
      (surfaces[`flyer-${i}`] = (
        <FlyerFace flyer={flyer} held={compact && at === "events" && cardIndex === i + 1} onOpen={() => setHeld({ kind: "flyer", id: flyer.id })} />
      ))
  );

  // Phones: what the card under the object can hold
  const cardItems: HeldItem[] | null =
    !compact || !at || at === "arcade" || at === "bulletin" || at === "tickets"
      ? null
      : at === "events"
          ? flyers.map((flyer) => ({ id: flyer.id, label: flyer.title, tone: flyer.sheet.tone ?? "paper", tint: flyer.sheet.tint, body: flyer.sheet.body }))
          : at === "departures"
            ? [{ id: "departures", label: "Scoreboard", tone: "board", body: <DepartureBoard signedIn={signedIn} goTo={goTo} /> }]
            : at === "lockers"
              ? [{ id: "wardrobe", label: "Your locker", tone: "ledger", body: <Wardrobe signedIn={signedIn} goTo={goTo} /> }]
              : at === "mail"
                ? [
                    { id: "letters", label: "Inbox", tone: "ledger", body: <Letters signedIn={signedIn} goTo={goTo} /> },
                    { id: "register", label: "Settings", tone: "ledger", body: <Register signedIn={signedIn} goTo={goTo} /> },
                  ]
                : null;

  // The arcade: the cartridge arcade itself, once the visitor has walked up to the cabinet
  const games = useMemo(() => createArcadeGames().filter((g) => !compact || g.availableOnMobile !== false), [compact]);
  // The arcade mounts (hidden) as you set off for the cabinet, so it can say where its
  // cabinet will be on screen; the walk ends with the station's there, and the arcade
  // fades in over it
  const [atCabinet, setAtCabinet] = useState(false);
  const [arcadeFrame, setArcadeFrame] = useState<CabinetFrame | null>(null);
  // The game the cabinet previews from the platform; the arcade opens on the same one, so
  // it's one of the arcade's own (phones don't get the desktop-only ones)
  const [preview] = useState(() => {
    const pool = games.filter((game) => game.game && game.videoUrl && !game.special);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return pick?.videoUrl ? { name: pick.name, video: pick.videoUrl, color: pick.cartridge.color } : null;
  });
  // The arcade is built in the background once the station has settled, and kept (paused
  // while out of sight), so walking up to the cabinet doesn't stall on loading it
  const [arcadeBuilt, setArcadeBuilt] = useState(at === "arcade");
  // The train stands at the platform: build it now, behind the shut doors, and open them
  // once it's up (it says where its cabinet sits when it is)
  useEffect(() => {
    if (trainStopped) setArcadeBuilt(true);
  }, [trainStopped]);
  useEffect(() => {
    if (!trainStopped) return;
    if (arcadeFrame) {
      setDoorsMayOpen(true);
      return;
    }
    const giveUp = window.setTimeout(() => setDoorsMayOpen(true), 6000);
    return () => window.clearTimeout(giveUp);
  }, [trainStopped, arcadeFrame]);
  // Building it takes the main thread for a moment, so not while you're moving: once you've
  // left the screen alone for a few seconds, or have settled on the arcade's view
  useEffect(() => {
    if (arcadeBuilt || (arriving && !trainStopped)) return; // (not while the train pulls in)
    const idle = (window as unknown as { requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    const build = () => (idle ? idle(() => setArcadeBuilt(true), { timeout: 1500 }) : setArcadeBuilt(true));
    let timer = window.setTimeout(build, heading === "left" ? 2500 : 3500);
    const wait = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(build, heading === "left" ? 2500 : 3500);
    };
    window.addEventListener("pointerdown", wait);
    window.addEventListener("keydown", wait);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", wait);
      window.removeEventListener("keydown", wait);
    };
  }, [arcadeBuilt, heading, arriving, trainStopped]);
  useEffect(() => {
    if (at === "arcade") setArcadeBuilt(true);
  }, [at]);
  useEffect(() => {
    if (at !== "arcade") {
      setAtCabinet(false);
      return;
    }
    // Once the walk's over and the cartridges have all flown in to their places
    const arrive = window.setTimeout(() => setAtCabinet(true), Math.max(1050, ROW_DONE_MS));
    return () => window.clearTimeout(arrive);
  }, [at]);
  // Which game the arcade starts on: the preview, unless you're sent to another (a "Play"
  // button elsewhere), in which case it's rebuilt on that one
  const [initialGame, setInitialGame] = useState<string | undefined>(preview?.name);
  useEffect(() => {
    if (at !== "arcade" || !open) return;
    const wanted = games.find((game) => normalizeMachineName(game.name) === normalizeMachineName(open))?.name;
    if (wanted && wanted !== initialGame && !atCabinet) setInitialGame(wanted);
    // Inserting a cartridge updates ?open= too; only arriving should rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  const [leaderboardGame, setLeaderboardGame] = useState<MachineData | null>(null);

  // Playing a game: a CRT power-on into it, and power-off back out, as in the arcade
  const [playing, setPlaying] = useState<MachineData | null>(null);
  const [transition, setTransition] = useState<{ mode: "on" | "off"; game: MachineData | null } | null>(null);
  const play = (game: MachineData) => {
    if (game.special === "mystery" || game.special === "soon" || game.special === "wayside") return;
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

  const stepBack = () => (at === "bulletin" && zoom !== null ? setZoom(null) : select(null));

  // Keyboard: arrows turn, Up or Enter walks to what's ahead, Down or Esc steps back; at a
  // paper, the arrows move across and down the board
  const keys = useRef({ at, heading, select, turn, stepBack, zoom, setZoom: zoomTo, busy: false });
  keys.current = { at, heading, select, turn, stepBack, zoom, setZoom: zoomTo, busy: Boolean(playing || held) };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const { at: current, heading: facing, select: go, turn: face, stepBack: back, zoom: reading, setZoom: read, busy } = keys.current;
      if (busy) return;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      // A focused button or link keeps Enter for itself
      if (event.key === "Enter" && ["BUTTON", "A"].includes(target?.tagName ?? "")) return;
      const ahead = VIEWS[facing].focus;
      const moveBy = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[event.key];
      if (reading !== null && moveBy !== undefined) {
        const next = reading + moveBy;
        if (next >= 0 && next < 6) read(next);
      } else if (!current && event.key === "ArrowLeft") face(-1);
      else if (!current && event.key === "ArrowRight") face(1);
      else if (!current && (event.key === "ArrowUp" || event.key === "Enter") && ahead) go(ahead);
      else if (current && event.key === "Escape") back();
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

  // The tab says where you are
  useEffect(() => {
    const before = document.title;
    document.title = "Wayside Station";
    return () => {
      document.title = before;
    };
  }, []);

  // Keep every click inside the station: site links go to the matching object instead
  const keepInStation = (event: ReactMouseEvent) => {
    const link = (event.target as HTMLElement).closest("a");
    const href = link?.getAttribute("href");
    if (!link || !href || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/station") || link.target === "_blank") return;
    event.preventDefault();
    const url = new URL(href, window.location.origin);
    const [id, openThere] = stationPlaceFor(url.pathname, url.search);
    select(id, openThere);
  };

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
            paused={Boolean(playing) || atCabinet}
            arcadeFrame={at === "arcade" ? arcadeFrame : null}
            hideArcade={atCabinet}
            preview={preview}
            arcadeGames={games}
            arrive={arriving}
            doorsMayOpen={doorsMayOpen}
            onTrainStopped={stopTrain}
            onArrived={stepOff}
            previewPlaying={heading === "left" || at === "arcade"}
            surfaces={surfaces}
            // On phones things are used through the held card, except a paper being read
            surfacesInteractive={!compact || at === "bulletin"}
            cardFraction={cardItems ? CARD_FRACTION : 0}
            zoom={at === "bulletin" ? zoom : null}
            onEmptyTap={stepBack}
            onPart={onPart}
          />
        </Suspense>
        {cardItems && atArrived && <HeldCard items={cardItems} index={cardIndex} onIndex={setCardIndex} />}

        {/* The arcade, as it is at /arcade, without its room */}
        {arcadeBuilt && (
          <div
            className="absolute inset-0 z-10 transition-[opacity,background-color] duration-500 ease-out"
            style={{
              opacity: atCabinet ? 1 : 0,
              pointerEvents: atCabinet ? "auto" : "none",
              backgroundColor: atCabinet ? "rgba(3,4,8,0.55)" : "transparent",
              // Hidden, it must take no touches at all: its terminal card sets pointer-events
              // of its own, which would otherwise catch taps and swipes meant for the station
              visibility: atCabinet ? "visible" : "hidden",
              transitionProperty: "opacity, background-color, visibility",
              transitionDelay: atCabinet ? "0s" : "0s, 0s, 0.5s",
            }}
          >
            <Suspense fallback={null}>
              <CartridgeArcade
                key={initialGame}
                transparent
                onFramed={setArcadeFrame}
                onBack={stepBack}
                games={games}
                initialGameName={initialGame}
                paused={Boolean(playing) || !atCabinet}
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

        {/* The way back: always in the same place, bottom left (at the arcade, a key on its terminal) */}
        {at && !(at === "arcade" && atCabinet) && (
          <button
            type="button"
            onClick={stepBack}
            aria-label="Back"
            title="Back"
            className="absolute left-2 z-20 flex min-h-11 items-center p-1 opacity-90 transition hover:opacity-100 active:translate-y-px md:left-3"
            style={{ bottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
          >
            <PixelArrow className="h-8 w-[3.3rem]" />
          </button>
        )}

        {/* Turning: direction signs, low on phones where thumbs are, mid-height on desktop */}
        {!at && !compact && (
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
              <button key={paper.id} type="button" onClick={() => setZoom(papers.indexOf(paper))}>
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
            <button type="button" onClick={() => setHeld(signedIn ? { kind: "shop" } : { kind: "window" })}>
              {signedIn ? "The item shop" : "Sign in"}
            </button>
          )}
          {at === "lockers" && (
            <button type="button" onClick={() => setHeld({ kind: "wardrobe" })}>
              Open your locker
            </button>
          )}
          {at === "mail" && (
            <>
              <button type="button" onClick={() => setHeld({ kind: "letters" })}>
                Open your inbox
              </button>
              <button type="button" onClick={() => setHeld({ kind: "register" })}>
                Settings
              </button>
            </>
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
          @import url('${STATION_FONTS}');
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
