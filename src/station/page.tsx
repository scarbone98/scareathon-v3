import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import AnimatedPage from "../components/AnimatedPage";
import LoadingSpinner from "../components/LoadingSpinner";
import { useNavigatorContext } from "../components/navigator/context";
import CrtTransition from "../pages/ArcadeV2/CrtTransition";
import type { CabinetFrame } from "../pages/ArcadeV2/CartridgeArcade";
import { UNLOCK_EVENT } from "../pages/Arcade/unlocks";
import { markPlayed, watchGameUpdates } from "../pages/Arcade/news";
import { createArcadeGames, normalizeMachineName, pickShuffleGame, TICKETS_EVENT, useIsMobileArcade, type MachineData } from "../pages/Arcade/games";
import { eventState, useDailyRune, useScareboard, useSession, useSummary, useTodayMovie, useLooks } from "./data.ts";
import { FOLD, HEADINGS, isHeading, isStopId, STOPS, STOP_IDS, VIEWS, type GoTo, type Heading, type StopId } from "./stops.ts";
import { PinnedPaper, useBoardPapers, type Paper } from "./board/BoardPapers.tsx";
import { FlyerFace, PosterSheet, useEventThings } from "./things/EventThings.tsx";
import DepartureBoard from "./things/DepartureBoard.tsx";
import { KioskWindow, linkFailed } from "./things/Kiosk.tsx";
import { Letters, Register, Shop, Wardrobe } from "./things/Belongings.tsx";
import Capsule from "./things/Capsule.tsx";
import Sheet, { type SheetContent } from "./Sheet.tsx";
import HeldCard, { type HeldItem } from "./HeldCard.tsx";
import { STATION_FONTS, sans, plateButton, serif } from "./style/theme.ts";
import SceneBoundary from "./SceneBoundary.tsx";
import StationPlay from "./StationPlay.tsx";
import PixelArrow from "./style/PixelArrow.tsx";
import ClerkSays from "./things/ClerkSays.tsx";
import TicketDrop from "./things/TicketDrop.tsx";
import { useSongs } from "./things/Songs.tsx";
import { useCarts } from "./things/Carts.tsx";
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
  const { isLive, year } = eventState();
  const { data: scoreboard } = useScareboard(null, signedIn);
  const { data: movie } = useTodayMovie(isLive && signedIn);
  const { data: summary } = useSummary();
  const { data: rune = null } = useDailyRune();
  const unread = signedIn ? summary?.unreadCount ?? 0 : 0;
  // (whoever's first on the Scareboard, and how they look)
  const first = scoreboard?.leaderboard.data[0];
  const { data: looks } = useLooks(first?.userId ? [first.userId] : []);
  // Keyed on the text, so the board is only repainted when a paper's headline changes
  const noticeKey = papers.map((paper) => `${paper.kind}\u0000${paper.title}`).join("\u0001");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const notices = useMemo(() => papers.map((paper) => ({ kind: paper.kind, title: paper.title })), [noticeKey]);
  return useMemo(() => {
    // The scoreboard's painted face shows what its HTML one does (see DepartureBoard)
    const meta = scoreboard?.leaderboard.meta;
    const rows = (scoreboard?.leaderboard.data ?? []).map((row) => ({ rank: row.rank, name: row.name, total: String(row.total ?? "") }));
    const departures = signedIn
      ? {
          label: meta ? (meta.isLive ? "LIVE STANDINGS" : meta.isPreseason ? "PRESEASON - STARTS OCT 01" : "HISTORICAL") : "",
          rows,
          lines: !scoreboard ? ["FLIPPING..."] : rows.length ? [] : [meta?.isPreseason ? `${meta.year} ON THE WAY - STANDINGS FROM OCT 01` : "NO SCORES YET"],
        }
      : { label: "", rows: [], lines: ["STANDINGS ......... SIGNED-IN PASSENGERS", "ARCADE ............ BOARDING ALL NIGHT"] };
    const film = movie?.data?.title ? movie.data : undefined; // (only a film with a title)
    const poster = film
      ? { image: film.lowResUrl ?? null, title: film.title, line: "Showing tonight" }
      : isLive
        ? { image: null, title: "Showing tonight", line: "Sign in to see what's on" }
        : { image: null, title: "Dark tonight", line: `The first reel: October 1, ${year}` };
    // Top of the board, for the poster by the ticket counter
    const champion = signedIn && first ? { name: first.name, total: String(first.total ?? ""), look: first.userId ? looks?.[first.userId] : undefined } : null;
    return { notices, departures, poster, unread, rune, champion };
  }, [notices, scoreboard, signedIn, movie, isLive, year, unread, rune, first, looks]);
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
  | { kind: "departures"; game?: string }
  | { kind: "window" }
  | { kind: "shop"; focus?: string }
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
  const [webglChecked, setWebglChecked] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryPaper, setDirectoryPaper] = useState<SheetContent | null>(null);
  const skipRef = useRef<HTMLAnchorElement | null>(null);
  const directoryRef = useRef<HTMLElement | null>(null);
  const sceneFailure = useCallback(() => { setSceneFailed(true); setDirectoryOpen(true); }, []);
  useEffect(() => {
    // Test before mounting either 3D scene; a normal browser may disable WebGL entirely.
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!context) sceneFailure();
      else context.getExtension("WEBGL_lose_context")?.loseContext();
    } catch { sceneFailure(); }
    setWebglChecked(true);
  }, [sceneFailure]);
  useEffect(() => { if (directoryOpen) directoryRef.current?.focus(); }, [directoryOpen]);
  // The arcade's games (on phones, those that play on one); the scoreboard shows the hi-scores
  // of the ones that keep scores
  // A secret cart unlocked at WaysideOS: once its reply has been on screen a moment, the
  // arcade is rebuilt with the new cart on the shelf and picked
  const [unlocks, setUnlocks] = useState(0);
  // (unlocks isn't read: it's there to re-read the unlocked carts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const games = useMemo(() => createArcadeGames().filter((g) => !compact || g.availableOnMobile !== false), [compact, unlocks]);
  // Which games have a newer build out (their "!" badges: Arcade/news.ts)
  useEffect(() => {
    void watchGameUpdates(games);
  }, [games]);
  const scoredGames = useMemo(() => games.filter((g) => g.hasLeaderboard !== false && !g.special).map((g) => g.name), [games]);
  // The same four views on every screen
  const headings = HEADINGS;
  const wanted: Heading = at ? STOPS[at].heading : isHeading(faceParam) ? faceParam : "front";
  const heading: Heading = headings.includes(wanted) ? wanted : FOLD[wanted] ?? "front";

  const faceParams = (face: Heading): Record<string, string> => (face === "front" ? {} : { face });
  // (on a big screen there's no walking up to the station board: the view from the platform
  // already has it, as near as makes no difference. Going to it is turning to face it; only
  // reading one of its papers brings you closer: see zoomTo)
  const select = (id: StopId | null, openThere?: string) =>
    setParams(id === "bulletin" && !compact && !sceneFailed && !directoryOpen ? faceParams("front") : id ? { at: id, ...(openThere ? { open: openThere } : {}) } : faceParams(heading));
  const goTo: GoTo = (id, openThere) => {
    const accessible = sceneFailed || directoryOpen;
    const contents = openThere ?? (accessible ? id === "mail" ? "letters" : id === "tickets" ? "window" : id === "lockers" ? "wardrobe" : undefined : undefined);
    setDirectoryPaper(null);
    select(id, contents);
    if (accessible && !sceneFailed && (id === "arcade" || id === "capsule" || id === "bench")) { setDirectoryOpen(false); skipRef.current?.focus(); }
  };
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
    // (a big screen stays where it stepped off: the board's already in front of it)
    if (!compact) {
      intro.current = false;
      return;
    }
    const walk = window.setTimeout(() => {
      intro.current = false;
      setParams({ at: "bulletin" }, { replace: true });
    }, 500);
    return () => window.clearTimeout(walk);
  }, [params, setParams, onPlatform, compact]);

  // A rune code or a run paid out at the arcade: the tickets on the board and in the shop catch up
  const ticketsClient = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      void ticketsClient.invalidateQueries({ queryKey: ["home-v2"] });
      void ticketsClient.invalidateQueries({ queryKey: ["user", "wallet"] });
    };
    window.addEventListener("wayside:tickets", refresh);
    window.addEventListener(TICKETS_EVENT, refresh);
    return () => {
      window.removeEventListener("wayside:tickets", refresh);
      window.removeEventListener(TICKETS_EVENT, refresh);
    };
  }, [ticketsClient]);

  // Everything that can be read or used
  const papers = useBoardPapers(signedIn, goTo);
  const { flyers, tonight } = useEventThings(signedIn, goTo);
  const boards = useBoards(signedIn, papers);
  const [held, setHeld] = useState<Held | null>(null);
  const putBack = useCallback(() => setHeld(null), []);
  // Shutting the wardrobe shuts the locker too, and putting the scoreboard down steps back
  // from it: back to the platform, facing the way that thing stands
  const closeSheet = () => {
    if (held?.kind === "wardrobe" && at === "lockers") setParams(faceParams("left"));
    if (held?.kind === "departures" && at === "departures") setParams(faceParams(STOPS.departures.heading));
    putBack();
  };

  // What the camera has come up to read, if anything: a paper on the board ("paper-2"), a
  // flyer on the events stand ("flyer-0") or the poster over it ("poster")
  const [zoom, setZoom] = useState<string | null>(null);
  // Papers read where they hang (the welcome) aren't zoomed into
  const zoomTo = (i: number) => {
    // The event's post isn't read up close: it takes you over to the events table
    if (papers[i]?.id === "event") {
      select("events");
      return;
    }
    if (!papers[i] || papers[i].noZoom) return;
    if (at === "bulletin") setZoom(`paper-${i}`);
    else {
      // (from the platform, on a big screen: up to the board and straight to the paper)
      toPaper.current = i;
      setParams({ at: "bulletin" });
    }
  };
  // The events table's things: tonight's film is the poster, the rest stand in a row
  const flyerSpot = (index: number) => (index === 0 ? "poster" : `flyer-${index - 1}`);
  const readsUpClose = at === "bulletin" || at === "events";
  // (walking up to the bench for its radio: straight to the close-up)
  const toRadio = useRef(false);
  // (and up to the board for one of its papers, on a big screen)
  const toPaper = useRef<number | null>(null);
  // (and up to the scoreboard for the champion's plaque beside it: that visit is for the
  // plaque, so the scoreboard doesn't come up full screen over it)
  const toChampion = useRef(false);
  const forChampion = useRef(false);
  useEffect(() => {
    const paper = toPaper.current;
    forChampion.current = at === "departures" && toChampion.current;
    setZoom(at === "bench" && toRadio.current ? "radio" : forChampion.current ? "champion" : at === "bulletin" && paper !== null ? `paper-${paper}` : null);
    toRadio.current = false;
    toChampion.current = false;
    toPaper.current = null;
    // A big screen is never just stood at the board (a link straight to it, say): back to the platform
    if (at === "bulletin" && !compact && paper === null && !sceneFailed && !directoryOpen) setParams(faceParams("front"), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  // The radio plays your songs (the ones everyone has, signed out)
  useSongs(signedIn);
  // Cartridges bought at the counter go on the arcade's shelf (wherever you've signed in)
  useCarts(signedIn);

  // On phones, which of the object's things the card holds, and whether the walk there is done
  const [cardIndex, setCardIndex] = useState(0);
  const [atArrived, setAtArrived] = useState(false);
  useEffect(() => {
    setAtArrived(false);
    if (!at) return;
    const arrive = window.setTimeout(() => setAtArrived(true), 500);
    return () => window.clearTimeout(arrive);
  }, [at]);

  // Walking up to your locker opens it: once you're there and the door's swung open, the
  // wardrobe comes up by itself. Walking up to the scoreboard likewise brings it up full screen
  useEffect(() => {
    if (at !== "lockers" && at !== "departures") return;
    if (at === "departures" && forChampion.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const kind = at === "lockers" ? "wardrobe" : "departures";
    const open = window.setTimeout(() => setHeld((current) => current ?? { kind }), reduced ? 0 : at === "lockers" ? 1100 : 700);
    return () => window.clearTimeout(open);
  }, [at]);

  // Arriving with ?open= takes the named thing up (e.g. the shop, or tonight's film), once
  // the walk there has been seen
  useEffect(() => {
    const flyerIndex = flyers.findIndex((flyer) => flyer.id === open || (open === "event" && flyer.id === "event"));
    setCardIndex(at === "mail" && open === "register" ? 1 : 0);
    if (at === "events" && flyerIndex >= 0) setZoom(flyerSpot(flyerIndex));
    const next: Held | null =
      at === "tickets" && open === "shop"
        ? { kind: "shop" }
        : at === "tickets" && (open === "window" || linkFailed) // (back from an email link: the sign-in window, up)
          ? { kind: "window" }
        : at === "mail" && (!compact || sceneFailed || directoryOpen) && (open === "letters" || open === "register")
          ? { kind: open }
          : at === "lockers" && open
            ? { kind: "wardrobe" }
            : at === "departures" && (sceneFailed || directoryOpen)
              ? { kind: "departures" }
              : null;
    if (!next) { setHeld(null); return; }
    if (sceneFailed || directoryOpen) { setHeld(next); return; }
    setHeld(null);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const take = window.setTimeout(() => setHeld(next), reduced || sceneFailed || directoryOpen ? 0 : 1000);
    return () => window.clearTimeout(take);
    // The flyers are rebuilt every render; only arriving (or ?open= changing) should do this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, open, signedIn, compact, sceneFailed, directoryOpen]);

  const openShop = () => setHeld({ kind: "shop" });
  const sheet: SheetContent | null = (() => {
    if (!held) return null;
    if (held.kind === "departures")
      return {
        id: "departures",
        title: "Scoreboard",
        tone: "board",
        full: true,
        // (bigger flaps on a big screen)
        body: (
          <div className="h-full md:[zoom:1.45]">
            <DepartureBoard signedIn={signedIn} goTo={goTo} games={scoredGames} game={held.game} />
          </div>
        ),
      };
    if (held.kind === "window")
      return { id: "window", title: "Ticket counter", tint: "#efe3c8", body: <KioskWindow signedIn={session === undefined ? undefined : signedIn} onShop={openShop} goTo={goTo} glass={false} /> };
    if (held.kind === "shop") return { id: "shop", title: "Item shop", tone: "ledger", full: true, body: <Shop signedIn={signedIn} goTo={goTo} focus={held.focus} /> };
    if (held.kind === "wardrobe") return { id: "wardrobe", title: "Your locker", tone: "ledger", full: true, body: <Wardrobe signedIn={signedIn} goTo={goTo} /> };
    if (held.kind === "letters") return { id: "letters", title: "Inbox", tone: "ledger", body: <Letters signedIn={signedIn} goTo={goTo} /> };
    return { id: "register", title: "Settings", tone: "ledger", body: <Register signedIn={signedIn} goTo={goTo} /> };
  })();

  // A tap on a thing in the scene: a paper, look closer at it; otherwise on phones, hold it
  // in the card, and on wide screens (where the HTML isn't drawn, or for the poster), pick it up
  const onPart = (part: string) => {
    // The radio on the bench: up close to it (its keys and screen are its own: StationScene)
    // The champion's plaque beside the scoreboard: up close to it
    if (part === "champion") {
      if (at === "departures") setZoom("champion");
      else {
        toChampion.current = true;
        select("departures");
      }
      return;
    }
    if (part === "radio") {
      if (at === "bench") setZoom("radio");
      else {
        toRadio.current = true;
        select("bench");
      }
      return;
    }
    if (part.startsWith("paper-")) {
      zoomTo(Number(part.slice(6)));
      return;
    }
    // The scoreboard and your locker open full screen, on phones too
    if (part === "departures") {
      setHeld({ kind: "departures" });
      return;
    }
    if (part === "locker") {
      setHeld({ kind: "wardrobe" });
      return;
    }
    if (part.startsWith("flyer-") || part === "poster") {
      setZoom(part);
      return;
    }
    if (part === "window") {
      setHeld(signedIn ? { kind: "shop" } : { kind: "window" });
      return;
    }
    // An advert for something in the shop opens the shop; one for a game, the game
    if (part.startsWith("advert-shop")) {
      setHeld(signedIn ? { kind: "shop", focus: part.slice("advert-shop:".length) || undefined } : { kind: "window" });
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
    if (part === "departures") setHeld({ kind: "departures" });
    else if (part === "window") setHeld({ kind: "window" });
    else if (part === "locker") setHeld({ kind: "wardrobe" });
    else if (part === "letters" || part === "register") setHeld({ kind: part });
  };

  const surfaces: Record<string, ReactNode> = {};
  papers.forEach(
    (paper, i) =>
      (surfaces[`paper-${i}`] = (
        <PinnedPaper paper={paper} zoomed={at === "bulletin" && zoom === `paper-${i}`} onOpen={() => zoomTo(i)} />
      ))
  );
  flyers.slice(1).forEach(
    (flyer, i) =>
      (surfaces[`flyer-${i}`] = (
        <FlyerFace flyer={flyer} zoomed={at === "events" && zoom === `flyer-${i}`} onOpen={() => setZoom(`flyer-${i}`)} />
      ))
  );
  // The poster is painted (tonight's film's own one-sheet); read up close, its details lie over it
  // (always there, so it fades in and out over the poster rather than appearing and vanishing)
  const readingPoster = at === "events" && zoom === "poster";
  surfaces.poster = (
    <div className="h-full w-full transition-opacity duration-500" style={{ opacity: readingPoster ? 1 : 0, pointerEvents: readingPoster ? "auto" : "none" }}>
      <PosterSheet sheet={tonight} />
    </div>
  );

  // Phones: what the card under the object can hold
  const cardItems: HeldItem[] | null =
    !compact || !at || at === "arcade" || at === "bulletin" || at === "events" || at === "tickets"
      ? null
      : at === "mail"
                ? [
                    { id: "letters", label: "Inbox", tone: "ledger", body: <Letters signedIn={signedIn} goTo={goTo} /> },
                    { id: "register", label: "Settings", tone: "ledger", body: <Register signedIn={signedIn} goTo={goTo} /> },
                  ]
                : null;

  // The arcade: the cartridge arcade itself, once the visitor has walked up to the cabinet
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
    let timer = 0;
    const onUnlock = (event: Event) => {
      const name = (event as CustomEvent<string>).detail;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setUnlocks((n) => n + 1);
        setInitialGame(name);
      }, 2200);
    };
    window.addEventListener(UNLOCK_EVENT, onUnlock);
    return () => {
      window.removeEventListener(UNLOCK_EVENT, onUnlock);
      window.clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (at !== "arcade" || !open) return;
    const wanted = games.find((game) => normalizeMachineName(game.name) === normalizeMachineName(open))?.name;
    if (wanted && wanted !== initialGame && !atCabinet) setInitialGame(wanted);
    // Inserting a cartridge updates ?open= too; only arriving should rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);

  // Playing a game: a CRT power-on into it, and power-off back out, as in the arcade
  const [playing, setPlaying] = useState<MachineData | null>(null);
  const [transition, setTransition] = useState<{ mode: "on" | "off"; game: MachineData | null } | null>(null);
  const play = (game: MachineData) => {
    if (game.special === "mystery" || game.special === "soon" || game.special === "wayside") return;
    const picked = game.special === "shuffle" ? pickShuffleGame(games) : game;
    markPlayed(picked.name);
    setTransition({ mode: "on", game: picked });
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

  // (from a paper on the board, a big screen steps right back to the platform)
  // (and from the champion's plaque, back to the platform, not to the scoreboard beside it)
  const stepBack = () => (readsUpClose && zoom !== null && !(at === "bulletin" && !compact) ? setZoom(null) : select(null));

  // Keyboard: arrows turn, Up or Enter walks to what's ahead, Down or Esc steps back; at a
  // paper, the arrows move across and down the board
  const keys = useRef({ at, heading, select, turn, stepBack, zoom, setZoom: zoomTo, busy: false });
  keys.current = { at, heading, select, turn, stepBack, zoom, setZoom: zoomTo, busy: Boolean(playing || held || directoryOpen || sceneFailed || directoryPaper) };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const { at: current, heading: facing, select: go, turn: face, stepBack: back, zoom: reading, setZoom: read, busy } = keys.current;
      if (busy || target?.closest("#station-directory")) return;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      // A focused button or link keeps Enter for itself
      if (event.key === "Enter" && ["BUTTON", "A"].includes(target?.tagName ?? "")) return;
      const ahead = VIEWS[facing].focus;
      const moveBy = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[event.key];
      if (reading?.startsWith("paper-") && moveBy !== undefined) {
        const next = Number(reading.slice(6)) + moveBy;
        if (next >= 0 && next < 6) read(next);
      } else if (reading && (event.key === "ArrowDown" || event.key === "Escape")) back(); else if (!current && event.key === "ArrowLeft") face(-1);
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
    goTo(id, openThere);
  };

  const directoryStop = (id: StopId, part?: string) => {
    const contents = part ?? (id === "mail" ? "letters" : id === "tickets" ? "window" : id === "lockers" ? "wardrobe" : undefined);
    goTo(id, contents);
    const calendar = part === "calendar" ? flyers.find(flyer => flyer.id === "calendar") : null;
    setDirectoryPaper(calendar ? { id: calendar.id, title: calendar.title, tint: calendar.tint, body: calendar.content(true) } : null);
    if (part === "register") setHeld({ kind: "register" });
    else if (id === "mail") setHeld({ kind: "letters" });
    else if (id === "departures") setHeld({ kind: "departures" });
    else if (id === "lockers") setHeld({ kind: "wardrobe" });
    else if (id === "tickets") setHeld({ kind: "window" });
    else setHeld(null);
  };
  const directoryVisible = sceneFailed || directoryOpen;
  const directory = (
    <nav id="station-directory" ref={directoryRef} onFocusCapture={() => { if (!directoryOpen && !sceneFailed) setDirectoryOpen(true); }} tabIndex={-1} aria-label="Station directory"
      className={directoryVisible ? "absolute inset-0 z-20 overflow-y-auto bg-[#0d131b] p-5 pb-20 text-[#f2ead2]" : "sr-only"}>
      <h1 className="text-3xl" style={serif}>Station directory</h1>
      {sceneFailed && <p className="mt-3" role="status">The 3D station is unavailable. Read and use the station’s objects here.</p>}
      <div className="my-4 flex flex-wrap gap-3">
        {STOP_IDS.map(id => <button type="button" key={id} className={plateButton} onClick={() => directoryStop(id)}>{id === "mail" ? "Inbox (pigeonholes)" : id === "lockers" ? "Lockers (left luggage)" : id === "events" ? "Flyers" : STOPS[id].label}</button>)}
        <button type="button" className={plateButton} onClick={() => directoryStop("mail", "register")}>Settings</button>
        <button type="button" className={plateButton} onClick={() => directoryStop("events", "calendar")}>Calendar</button>
      </div>
      {!sceneFailed && <button type="button" className={plateButton} onClick={() => { setDirectoryOpen(false); skipRef.current?.focus(); }}>Return to the scene</button>}
      <section className="mt-5 space-y-3" aria-label="Object contents">
        {(!at || at === "bulletin") && papers.map(paper => <button key={paper.id} type="button" className={`${plateButton} mr-3`} onClick={() => setDirectoryPaper({ id: paper.id, title: paper.title, tint: paper.tint, body: paper.full })}>Read: {paper.title}</button>)}
        {at === "events" && flyers.map(flyer => <button key={flyer.id} type="button" className={`${plateButton} mr-3`} onClick={() => setDirectoryPaper({ id: flyer.id, title: flyer.title, tint: flyer.tint, body: flyer.content(true) })}>Read: {flyer.title}</button>)}
        {at === "arcade" && <>
          <h2 className="text-xl" style={serif}>Arcade cartridges</h2>
          <p>Choose a cartridge. Games that need 3D graphics require WebGL.</p>
          <div className="space-y-3">{games.filter(game => !game.special).map(game => <div key={game.name} className="flex flex-wrap items-center gap-3">
            <button type="button" className={plateButton} onClick={() => play(game)}>{game.name}</button>
            {game.hasLeaderboard !== false && <button type="button" className={plateButton} onClick={() => setHeld({ kind: "departures", game: game.name })}>Scores for {game.name}</button>}
          </div>)}</div>
        </>}
        {at === "bench" && <p>The bench looks out over the tracks. Take a moment’s rest.</p>}
        {at === "capsule" && <p>The capsule machine needs the 3D scene. Your items are available at your locker.</p>}
      </section>
    </nav>
  );

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <div className="station-ui fixed inset-0 bg-black" onClickCapture={keepInStation} style={sans}>
        <a ref={skipRef} href="#station-directory" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-[#efe3c8] focus:p-3 focus:text-[#1d2a3a]"
          onClick={() => setDirectoryOpen(true)}>Station directory</a>
        {webglChecked && !sceneFailed && <div className="absolute inset-0" aria-hidden={directoryVisible ? true : undefined} ref={node => { if (node) node.inert = directoryVisible; }}>
        <SceneBoundary onFailure={sceneFailure}>
        <Suspense fallback={<LoadingSpinner />}>
          <StationScene
            onFailure={sceneFailure}
            at={at}
            heading={heading}
            onSelect={select}
            onTurn={turn}
            boards={boards}
            paused={Boolean(playing) || atCabinet || directoryVisible}
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
            // On phones things are used through the held card, except what's read where it hangs
            surfacesInteractive={!compact || readsUpClose}
            cardFraction={cardItems ? CARD_FRACTION : 0}
            zoom={readsUpClose || at === "bench" || at === "tickets" || at === "departures" ? zoom : null}
            onEmptyTap={stepBack}
            onPart={onPart}
            papersFromAfar={!compact}
            // (and as a big screen never walks up to the board, a paper that's used where it
            // hangs, the welcome and its buttons, is used from the platform)
            usedFromAfar={compact ? undefined : papers.flatMap((paper, i) => (paper.noZoom ? [`paper-${i}`] : []))}
          />
        </Suspense>
        </SceneBoundary></div>}
        {!directoryVisible && cardItems && atArrived && <HeldCard items={cardItems} index={cardIndex} onIndex={setCardIndex} />}

        {/* The arcade, as it is at /arcade, without its room */}
        {!directoryVisible && arcadeBuilt && (
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
                onLeaderboard={(game) => setHeld({ kind: "departures", game: game.name })}
                withRoom={false}
              />
            </Suspense>
          </div>
        )}

        {/* The way back: always in the same place, bottom left (at the arcade, a key on its terminal;
            on the bench, none: the view is left alone, and a tap anywhere gets up; but up
            close to its radio, there is) */}
        {at && (at !== "bench" || zoom === "radio") && !(at === "arcade" && atCabinet) && (
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

        {/* Tickets coming in: a counter drops down from the top left and counts up */}
        {/* The capsule machine has no card: it's worked by hand, with its counter and prize over the scene */}
        {!directoryVisible && at === "capsule" && <Capsule signedIn={signedIn} goTo={goTo} />}
        {!directoryVisible && <TicketDrop />}
        {/* The ticketmaster has a word for you as you walk up */}
        <ClerkSays arrived={!directoryVisible && at === "tickets" && atArrived && !held} />

        <Sheet sheet={directoryPaper || sheet} onClose={() => { if (directoryPaper) setDirectoryPaper(null); else closeSheet(); }} above={Boolean(playing)} />

        {directory}

        <StationPlay machine={playing} onClose={stopPlaying} onLeaderboard={() => playing && setHeld({ kind: "departures", game: playing.name })} onSignIn={() => { stopPlaying(); select("tickets"); }} />
        {transition && (
          <CrtTransition
            mode={transition.mode}
            onMidpoint={() => setPlaying(transition.mode === "on" ? transition.game : null)}
            onDone={() => setTransition(null)}
          />
        )}
        <style>{`
          @import url('${STATION_FONTS}');
          .station-ui :is(button, a, input, select, textarea):focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
          .station-ui #station-directory:focus { outline: none; }
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
          @keyframes station-sheet-down { from { transform: translateY(-100%) } to { transform: none } }
          .station-sheet.station-sheet-down { animation: station-sheet-down 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both }
          @media (prefers-reduced-motion: reduce) { .station-arrive, .station-sheet, .station-sheet.station-sheet-down, .station-card, .station-card-body { animation: none } }
        `}</style>
      </div>
    </AnimatedPage>
  );
}
