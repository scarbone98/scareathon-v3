import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AnimatedPage from "../components/AnimatedPage";
import LoadingSpinner from "../components/LoadingSpinner";
import { eventState, useContentLoop, useScareboard, useSession, useTodayMovie } from "./data.ts";
import { HEADINGS, isHeading, isStopId, STOPS, STOP_IDS, VIEWS, type Heading, type StopId } from "./stops.ts";
import type { Boards } from "./StationScene.tsx";

const StationScene = lazy(() => import("./StationScene.tsx"));
const NoticePanel = lazy(() => import("./panels/NoticePanel.tsx"));
const EventsPanel = lazy(() => import("./panels/EventsPanel.tsx"));
const DeparturesPanel = lazy(() => import("./panels/DeparturesPanel.tsx"));
const KioskPanel = lazy(() => import("./panels/KioskPanel.tsx"));

// Wayside Station: a 3D train platform whose objects open the site's pages.
// Lives at /station; the classic site is untouched. Where the visitor is lives in the
// URL (?at= for an object, ?face= for which way they face on the platform), so the
// browser's Back button walks them back. Walking up to an object opens its panel, which
// does what the matching classic page does, with the same data.

// Paint the boards in the scene from live data: headlines on the notices, and the
// Scareboard, tonight's film or the countdown on the departure board
function useBoards(signedIn: boolean): Boards {
  const { isLive, daysUntil } = eventState();
  const { data: items = [] } = useContentLoop();
  const { data: scoreboard } = useScareboard(null, signedIn);
  const { data: movie } = useTodayMovie(isLive && signedIn);
  return useMemo(() => {
    const notices = items.slice(0, 6).map((item) => ({ kind: item.type === "weekly_challenge" ? "CHALLENGE" : "NOTICE", title: item.title }));
    const lines: string[] = [];
    if (movie?.data?.title) lines.push(`TONIGHT  ${movie.data.title}`);
    (scoreboard?.leaderboard.data ?? []).slice(0, 3 - lines.length).forEach((row) => lines.push(`${String(row.rank).padStart(2)}  ${row.name}  ${row.total ?? ""}`));
    if (!isLive) lines.push(`SCAREATHON  OCT 01  IN ${daysUntil} ${daysUntil === 1 ? "DAY" : "DAYS"}`);
    const challenge = items.find((item) => item.type === "weekly_challenge");
    if (challenge?.gameName) lines.push(`CHALLENGE  ${challenge.gameName}`);
    lines.push("ARCADE  ALL NIGHT  BOARDING");
    return { notices, departures: lines.slice(0, 3) };
  }, [items, scoreboard, movie, isLive, daysUntil]);
}

export default function StationPage() {
  const [params, setParams] = useSearchParams();
  const atParam = params.get("at");
  const faceParam = params.get("face");
  const at: StopId | null = isStopId(atParam) ? atParam : null;
  const heading: Heading = at ? STOPS[at].heading : isHeading(faceParam) ? faceParam : "front";
  const view = VIEWS[heading];
  const session = useSession();
  const signedIn = Boolean(session);
  const boards = useBoards(signedIn);

  const faceParams = (face: Heading): Record<string, string> => (face === "front" ? {} : { face });
  const select = (id: StopId | null) => setParams(id ? { at: id } : faceParams(heading));
  const turn = (direction: 1 | -1) => {
    const next = HEADINGS[(HEADINGS.indexOf(heading) + direction + HEADINGS.length) % HEADINGS.length];
    setParams(faceParams(next), { replace: true });
  };

  // Keyboard: arrows turn, Up or Enter walks to what's ahead, Down or Esc steps back
  const keys = useRef({ at, view, select, turn });
  keys.current = { at, view, select, turn };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      const inPanel = Boolean(target?.closest("[data-station-panel]"));
      // A focused button or link keeps Enter for itself
      if (event.key === "Enter" && ["BUTTON", "A"].includes(target?.tagName ?? "")) return;
      const { at: current, view: ahead, select: go, turn: face } = keys.current;
      if (!current && event.key === "ArrowLeft") face(-1);
      else if (!current && event.key === "ArrowRight") face(1);
      else if (!current && (event.key === "ArrowUp" || event.key === "Enter") && ahead.focus) go(ahead.focus);
      else if (current && (event.key === "Escape" || (event.key === "ArrowDown" && !inPanel))) go(null);
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

  // The panel covers part of the screen; the scene shifts so the object stays in view beside it
  const panelRef = useRef<HTMLElement | null>(null);
  const [inset, setInset] = useState({ right: 0, bottom: 0 });
  const hasPanel = at !== null && at !== "arcade";
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
  }, [hasPanel]);

  const stop = at ? STOPS[at] : null;
  const panelProps = { signedIn, goTo: (id: StopId) => select(id) };
  const chevron =
    "pointer-events-auto flex h-14 w-10 items-center justify-center rounded-md bg-black/40 text-2xl text-amber-100/70 ring-1 ring-amber-200/15 backdrop-blur-sm transition hover:bg-black/60 hover:text-amber-100";

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <div className="fixed inset-0 bg-black">
        <Suspense fallback={<LoadingSpinner />}>
          <StationScene at={at} heading={heading} onSelect={select} onTurn={turn} boards={boards} inset={inset} />
        </Suspense>

        <div className="pointer-events-none absolute inset-x-0 top-[88px] flex items-start justify-between px-4">
          {at ? (
            <button
              type="button"
              onClick={() => select(null)}
              className="pointer-events-auto rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-amber-100 ring-1 ring-amber-200/30 backdrop-blur"
            >
              ← Step back
            </button>
          ) : (
            <span />
          )}
          {!hasPanel && (
            <Link
              to="/"
              className="pointer-events-auto rounded-full bg-black/70 px-4 py-2 text-sm text-amber-100/80 ring-1 ring-amber-200/20 backdrop-blur"
            >
              Plain site
            </Link>
          )}
        </div>

        {/* Turning, like Inscryption's edge arrows */}
        {!at && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-2">
            <button type="button" aria-label="Turn left" onClick={() => turn(-1)} className={chevron}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" aria-label="Turn right" onClick={() => turn(1)} className={chevron}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}

        {hasPanel ? (
          <aside
            ref={panelRef}
            data-station-panel
            aria-label={stop?.label}
            className="absolute inset-x-0 bottom-0 h-[64%] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-amber-200/20 bg-[#120d08]/95 px-5 pb-28 pt-5 text-stone-200 shadow-[0_-10px_40px_rgba(0,0,0,0.6)] backdrop-blur md:inset-x-auto md:bottom-0 md:right-0 md:top-[72px] md:h-auto md:w-[min(32rem,46vw)] md:rounded-none md:rounded-tl-2xl md:border-l md:border-t md:pb-8"
            style={{ touchAction: "pan-y", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
          >
            <Suspense fallback={<LoadingSpinner />}>
              {at === "bulletin" && <NoticePanel {...panelProps} />}
              {at === "events" && <EventsPanel {...panelProps} />}
              {at === "departures" && <DeparturesPanel {...panelProps} />}
              {at === "tickets" && <KioskPanel signedIn={session === undefined ? undefined : signedIn} />}
            </Suspense>
          </aside>
        ) : (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div className="pointer-events-auto mb-16 w-full max-w-md rounded-2xl bg-black/75 p-4 text-amber-50 ring-1 ring-amber-200/25 backdrop-blur md:mb-0">
              <h1 className="text-lg font-semibold">{stop ? stop.label : view.title}</h1>
              <p className="mt-1 text-sm text-amber-100/80">{stop ? stop.blurb : view.blurb}</p>
              {stop ? (
                <Link to={stop.href} className="mt-3 inline-block rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-black">
                  {stop.cta}
                </Link>
              ) : (
                view.focus && (
                  <button
                    type="button"
                    onClick={() => view.focus && select(view.focus)}
                    className="mt-3 inline-block rounded-full bg-amber-400/90 px-5 py-2 text-sm font-semibold text-black"
                  >
                    Go closer
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Real controls for keyboard and screen-reader users: the canvas is only a picture */}
        <nav className="sr-only" aria-label="Station objects">
          {STOP_IDS.map((id) => (
            <button key={id} type="button" onClick={() => select(id)}>
              {STOPS[id].label}
            </button>
          ))}
        </nav>
      </div>
    </AnimatedPage>
  );
}
