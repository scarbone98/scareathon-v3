// The flyers' faces and full sheets live beside the hook that deals them out
/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import MovieInfo from "../../pages/Home/MovieInfo";
import StreamingProviders from "../../pages/Home/StreamingProviders";
import { challengeTarget, eventState, formatShortDate, needsSignIn, useContentLoop, useRewardStatus, useTodayMovie } from "../data.ts";
import type { GoTo } from "../stops.ts";
import { useScareathonMe, useToggleWatched } from "../../scareathonSeason";
import PosterCalendar from "./PosterCalendar.tsx";
import type { SheetContent } from "../Sheet.tsx";
import { PAPER_GRAIN, sans, serif, stubButton, typewriter } from "../style/theme.ts";
import { eventBlurb, type SeasonEvent } from "../../seasonEvents";

// The events table, for the event the station is showing (the Scareathon, or the Christmathon
// in November and December): three flyers standing on it (the event, tonight's film, the rules)
// and the poster above, which is tonight's film too. Each flyer's face says what it is;
// picking one up (a Sheet) has the rest.

// A flyer on the stand. What's printed on it is the same from the table and up close (the
// camera comes up to read it, as at the bulletin board); up close it can be used and scrolled.
// A full-bleed flyer (the calendar) lays itself out edge to edge.
export type Flyer = { id: string; title: string; tint: string; ink: string; content: (zoomed: boolean) => ReactNode; fullBleed?: boolean };

const rules = (event: SeasonEvent) => [
  `Watch each night's film, then tick it off on the ${event.monthName} calendar. Every film you watch is 1 point.`,
  "Finish the week's arcade challenge for 1 more point.",
  "Finish the day's arcade challenge for a few extra tickets.",
  `${event.dressUp} for 1 more point.`,
  event.id === "scareathon" ? "Have fun, and don't get scared." : "Have fun, and stay merry.",
];

const small = "text-[12px] uppercase tracking-[0.2em] opacity-85";
// The rules' bullet: a printer's ornament, a lozenge between two dots
function Ornament() {
  return (
    <svg viewBox="0 0 24 12" className="mt-[0.35em] h-3 w-6 shrink-0 text-[#d9a441]" aria-hidden>
      <circle cx="2.5" cy="6" r="1.5" fill="currentColor" />
      <path d="M12 1 L17 6 L12 11 L7 6 Z" fill="currentColor" />
      <circle cx="21.5" cy="6" r="1.5" fill="currentColor" />
    </svg>
  );
}

// The rules' face (loaded with the station's fonts)
const decree = { fontFamily: "'UnifrakturMaguntia', 'IM Fell English', serif" };

function EventSheet({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const { event, isLive, isOver, daysUntil, year, day } = eventState();
  const { data: items = [] } = useContentLoop();
  const challenge = items.find((item) => item.type === "weekly_challenge");
  const { data: reward } = useRewardStatus(challenge, signedIn);
  const target = challenge ? challengeTarget(challenge) : null;
  return (
    <div className="text-[#2a1d14]">
      <p className={small}>
        {event.name} {year}
      </p>
      <p className="mt-1 text-4xl" style={serif}>
        {isOver ? "See you next year" : isLive ? `Night ${day} of ${event.lastDay}` : `${daysUntil} ${daysUntil === 1 ? "day" : "days"} to go`}
      </p>
      <p className="mt-3 text-[15px] leading-relaxed">{eventBlurb(event, isLive, isOver)}</p>
      {challenge && (
        <div className="mt-5 border-t border-[#2a1d14]/20 pt-4">
          <p className={small}>
            This week's challenge{challenge.startsAt && challenge.endsAt ? ` · ${formatShortDate(challenge.startsAt)} – ${formatShortDate(challenge.endsAt)}` : ""}
          </p>
          <p className="mt-1 text-xl" style={serif}>
            {challenge.title}
          </p>
          {target && <p className="mt-1 text-[15px]">{target}</p>}
          <p className="mt-1 text-[13px] opacity-75">
            {challenge.points || 1} point{challenge.rewardCoins ? ` · ${challenge.rewardCoins.toLocaleString()} tickets` : ""}
            {reward?.data?.alreadyClaimed ? <strong className="ml-2 text-emerald-800">✓ Completed</strong> : null}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {challenge.gameName && (
              <button type="button" className={stubButton} onClick={() => goTo("arcade", challenge.gameName ?? undefined)}>
                Play {challenge.gameName.replace(/[‘’]/g, "'")}
              </button>
            )}
            {!signedIn && challenge.rewardCoins ? (
              <button type="button" className={stubButton} onClick={() => goTo("tickets")}>
                Sign in to earn
              </button>
            ) : null}
          </div>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-[#2a1d14]/20 pt-4">
        <button type="button" className={stubButton} onClick={() => goTo("departures")}>
          {event.board[4].toUpperCase()}{event.board.slice(5)}
        </button>
      </div>
    </div>
  );
}

function TonightSheet({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const { event, isLive, isOver, day, calendarYear } = eventState();
  const { data, isLoading, error } = useTodayMovie(isLive && signedIn);
  const { data: me } = useScareathonMe(isLive && signedIn, event);
  const toggle = useToggleWatched(event);
  const watched = me?.season === calendarYear ? me.watchedDays.includes(day) : null;
  const heading = (
    <p className="text-xs uppercase tracking-[0.3em] text-[#f2ead2]/85">Tonight's film</p>
  );
  if (!isLive)
    return (
      <>
        {heading}
        <p className="mt-2 text-2xl text-[#f2ead2]" style={serif}>
          {isOver ? `The ${event.name} is over for this year.` : `The projector is dark until ${event.monthName} 1.`}
        </p>
        <p className="mt-2 text-sm text-stone-400">
          {isOver ? "Every night's film is still on the calendar." : `The first film of the ${event.name} is shown that night, and one every night after.`}
        </p>
      </>
    );
  if (!signedIn || needsSignIn(error))
    return (
      <>
        {heading}
        <p className="mt-2 text-lg text-[#f2ead2]" style={serif}>
          Tonight's film is for passengers.
        </p>
        <button type="button" className={`${stubButton} mt-3`} onClick={() => goTo("tickets")}>
          Sign in
        </button>
      </>
    );
  if (isLoading) return <p className="text-sm italic text-stone-400">Threading the projector…</p>;
  const movie = data?.data;
  if (error || !movie) return <p className="text-sm text-stone-400">{error?.message ?? "No film is listed for tonight."}</p>;
  return (
    <div className="text-center text-orange-200">
      {heading}
      {movie.lowResUrl && <img src={movie.lowResUrl} alt={movie.title} className="mx-auto mt-3 h-72 rounded-[2px] shadow-[4px_5px_0_rgba(0,0,0,0.5)]" />}
      <p className="mt-4 text-3xl text-[#f2ead2]" style={serif}>
        {movie.title}
      </p>
      <MovieInfo runtime={movie.runtime} year={movie.year} rating={movie.rating} genres={movie.genres || []} />
      <StreamingProviders watchProviders={movie.watchProviders} movieTitle={movie.title} />
      {watched !== null && (
        <button type="button" className={`${stubButton} mt-4`} aria-pressed={watched} onClick={() => toggle.mutate({ day, watched: !watched })}>
          {watched ? "✓ Watched (1 point)" : "I watched it"}
        </button>
      )}
      {toggle.error && <p className="mt-2 text-sm text-red-300">{toggle.error.message}</p>}
    </div>
  );
}

export function useEventThings(signedIn: boolean, goTo: GoTo) {
  const { event } = eventState();
  const tonight: SheetContent = { id: "tonight", title: "Tonight's film", tone: "ledger", body: <TonightSheet signedIn={signedIn} goTo={goTo} /> };
  const flyers: Flyer[] = [
    {
      id: "event",
      title: event.name,
      tint: event.id === "scareathon" ? "#ff7a1a" : "#b3262e",
      ink: event.id === "scareathon" ? "#1a0d05" : "#fbf3e4", content: () => <EventSheet signedIn={signedIn} goTo={goTo} /> },
    // Tonight's film is the poster over the table (see PosterSheet), not a flyer on the stand
    { id: "tonight", title: "Tonight's film", tint: "#0d131b", ink: "#e6e2d8", content: () => tonight.body },
    {
      id: "rules",
      title: "The rules",
      tint: "#0e0c0b",
      ink: "#f2ece0",
      content: () => (
        // Set like a posted decree: a blackletter heading over old italic print, white on black
        <div className="text-center text-[#f2ece0]">
          <p className={small}>The {event.name}</p>
          <p className="mt-1 text-[46px] leading-none" style={decree}>
            The Rules
          </p>
          <p className="mx-auto mt-2 w-16 border-t-2 border-[#f2ece0]/40" />
          <ol className="mt-4 space-y-3 text-left">
            {rules(event).map((rule) => (
              <li key={rule} className="flex gap-3 text-[18px] italic leading-snug" style={serif}>
                <Ornament />
                <span>{rule}</span>
              </li>
            ))}
          </ol>
        </div>
      ),
    },
    {
      id: "calendar",
      title: `The ${event.monthName} calendar`,
      tint: "#1d2a3a",
      ink: "#f2ead2",
      content: (zoomed) => <PosterCalendar signedIn={signedIn} goTo={goTo} zoomed={zoomed} />,
      fullBleed: true,
    },
  ];
  // Tonight's film is the poster on the wall; the stand holds the rest, left to right
  const order = ["tonight", "rules", "event", "calendar"];
  const ordered = [...flyers].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return { flyers: ordered, tonight };
}

// Read up close, a flyer (or the poster) scrolls if its sheet is longer than it is. Touch
// scrolling is done by hand: the surface is drawn smaller than its HTML
function ReadingArea({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`h-full overflow-y-auto overscroll-contain ${className}`}
      style={{ touchAction: "none" }}
      onTouchStart={(event) => {
        (event.currentTarget as HTMLElement).dataset.touchY = String(event.touches[0].clientY);
      }}
      onTouchMove={(event) => {
        const el = event.currentTarget as HTMLElement;
        const last = Number(el.dataset.touchY ?? event.touches[0].clientY);
        const y = event.touches[0].clientY;
        const scale = el.getBoundingClientRect().height / el.offsetHeight || 1;
        el.scrollTop += (last - y) / scale;
        el.dataset.touchY = String(y);
      }}
    >
      {children}
    </div>
  );
}

// A flyer standing on the table: tap it to come up close and read it where it stands. It
// looks the same either way; only up close can its buttons be pressed and its text scrolled
export function FlyerFace({ flyer, onOpen, zoomed = false }: { flyer: Flyer; onOpen: () => void; zoomed?: boolean }) {
  const content = flyer.content(zoomed);
  return (
    <div
      role={zoomed ? undefined : "button"}
      tabIndex={zoomed ? undefined : 0}
      aria-label={zoomed ? flyer.title : `Read: ${flyer.title}`}
      onClick={zoomed ? undefined : onOpen}
      onKeyDown={(event) => !zoomed && event.key === "Enter" && onOpen()}
      className={`h-full w-full overflow-hidden shadow-[3px_4px_0_rgba(0,0,0,0.45)] transition ${zoomed ? "" : "cursor-pointer hover:brightness-110"}`}
      style={{ backgroundColor: flyer.tint, backgroundImage: PAPER_GRAIN, color: flyer.ink, ...typewriter }}
    >
      <div className="h-full" style={{ pointerEvents: zoomed ? "auto" : "none" }}>
        {flyer.fullBleed ? content : zoomed ? <ReadingArea className="p-6">{content}</ReadingArea> : <div className="h-full overflow-hidden p-6">{content}</div>}
      </div>
    </div>
  );
}

// Tonight's film, on the poster over the table, read up close
export function PosterSheet({ sheet }: { sheet: SheetContent }) {
  return (
    <div className="h-full w-full bg-[#0d131b] text-stone-200 shadow-[3px_4px_0_rgba(0,0,0,0.45)]" style={sans}>
      <ReadingArea className="p-6">{sheet.body}</ReadingArea>
    </div>
  );
}
