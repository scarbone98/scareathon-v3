// The flyers' faces and full sheets live beside the hook that deals them out
/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import MovieInfo from "../../pages/Home/MovieInfo";
import StreamingProviders from "../../pages/Home/StreamingProviders";
import { challengeTarget, eventState, formatShortDate, needsSignIn, useContentLoop, useRewardStatus, useTodayMovie } from "../data.ts";
import type { GoTo } from "../stops.ts";
import { CalendarBoard } from "./DepartureBoard.tsx";
import type { SheetContent } from "../Sheet.tsx";
import { PAPER_GRAIN, serif, stubButton, typewriter } from "../style/theme.ts";

// The events table: three flyers standing on it (the event, tonight's film, the rules)
// and the poster above, which is tonight's film too. Each flyer's face says what it is;
// picking one up (a Sheet) has the rest.

export type Flyer = { id: string; title: string; tint: string; ink: string; face: ReactNode; sheet: SheetContent };

const RULES = [
  "Every night, watch the film on the day it's scheduled: 1 point.",
  "Every week, finish the themed weekly challenge by Sunday's film: 1 point.",
  "On Halloween, wear a costume: 1 point.",
];

const small = "text-[12px] uppercase tracking-[0.2em] opacity-70";

function Face({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col p-4">
      <p className={small}>{label}</p>
      <p className="mt-1 text-[30px] font-bold leading-[1.05]" style={serif}>
        {title}
      </p>
      <div className="mt-2 text-[15px] leading-snug opacity-85">{children}</div>
      <p className="mt-auto text-[12px] italic opacity-60" style={serif}>
        Take one
      </p>
    </div>
  );
}

function EventSheet({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const { isLive, daysUntil, year, day } = eventState();
  const { data: items = [] } = useContentLoop();
  const challenge = items.find((item) => item.type === "weekly_challenge");
  const { data: reward } = useRewardStatus(challenge, signedIn);
  const target = challenge ? challengeTarget(challenge) : null;
  return (
    <div className="text-[#2a1d14]">
      <p className={small}>Scareathon {year}</p>
      <p className="mt-1 text-4xl" style={serif}>
        {isLive ? `Night ${day} of 31` : `${daysUntil} ${daysUntil === 1 ? "day" : "days"} to go`}
      </p>
      <p className="mt-3 text-[15px] leading-relaxed">
        {isLive
          ? "A horror film every night through Halloween. Watch along, finish the weekly challenges, and climb the Scareboard."
          : "Starting October 1: a horror film every night through Halloween, weekly challenges, and a Scareboard for the whole month."}
      </p>
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
            {challenge.points || 1} point{challenge.rewardCoins ? ` · ${challenge.rewardCoins.toLocaleString()} coins` : ""}
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
          The Scareboard
        </button>
        <button type="button" className={stubButton} onClick={() => goTo("events", "calendar")}>
          October calendar
        </button>
      </div>
    </div>
  );
}

function TonightSheet({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const { isLive } = eventState();
  const { data, isLoading, error } = useTodayMovie(isLive && signedIn);
  const heading = (
    <p className="text-xs uppercase tracking-[0.3em] text-[#f2ead2]/60">Tonight's film</p>
  );
  if (!isLive)
    return (
      <>
        {heading}
        <p className="mt-2 text-2xl text-[#f2ead2]" style={serif}>
          The projector is dark until October 1.
        </p>
        <p className="mt-2 text-sm text-stone-400">The first film of the Scareathon is shown that night, and one every night after.</p>
      </>
    );
  if (!signedIn || needsSignIn(error))
    return (
      <>
        {heading}
        <p className="mt-2 text-lg text-[#f2ead2]" style={serif}>
          Tonight's film is for ticket holders.
        </p>
        <button type="button" className={`${stubButton} mt-3`} onClick={() => goTo("tickets")}>
          Get a ticket
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
    </div>
  );
}

export function useEventThings(signedIn: boolean, goTo: GoTo) {
  const { isLive, daysUntil, year, day } = eventState();
  const { data: movie } = useTodayMovie(isLive && signedIn);
  const tonight: SheetContent = { id: "tonight", title: "Tonight's film", tone: "ledger", body: <TonightSheet signedIn={signedIn} goTo={goTo} /> };
  const flyers: Flyer[] = [
    {
      id: "event",
      title: "Scareathon",
      tint: "#ff7a1a",
      ink: "#1a0d05",
      face: (
        <Face label={`October ${year}`} title="SCARE-ATHON">
          {isLive ? `Night ${day} of 31.` : `Starts in ${daysUntil} ${daysUntil === 1 ? "day" : "days"}.`} A horror film every night, weekly challenges, and the Scareboard.
        </Face>
      ),
      sheet: { id: "event", title: `Scareathon ${year}`, tint: "#f0c9a0", body: <EventSheet signedIn={signedIn} goTo={goTo} /> },
    },
    {
      id: "tonight",
      title: "Tonight's film",
      tint: "#2a2f3a",
      ink: "#e6e2d8",
      face: (
        <Face label="Showing tonight" title={isLive ? movie?.data?.title ?? "Tonight's film" : "Dark until Oct 1"}>
          {isLive ? "Where to watch it, and how long it runs." : "The projector's first reel is October 1."}
        </Face>
      ),
      sheet: tonight,
    },
    {
      id: "rules",
      title: "The rules",
      tint: "#efe3c8",
      ink: "#2a1d14",
      face: (
        <Face label="How to score" title="THE RULES">
          Three ways to earn points in October.
        </Face>
      ),
      sheet: {
        id: "rules",
        title: "The rules",
        body: (
          <div className="text-[#2a1d14]">
            <p className={small}>Scareathon</p>
            <p className="mt-1 text-3xl" style={serif}>
              The rules
            </p>
            <ol className="mt-4 space-y-3">
              {RULES.map((rule, i) => (
                <li key={rule} className="flex gap-3 text-[16px] leading-relaxed">
                  <span className="opacity-60" style={serif}>
                    {i + 1}.
                  </span>
                  <span>{rule}</span>
                </li>
              ))}
            </ol>
          </div>
        ),
      },
    },
    {
      id: "calendar",
      title: "The October calendar",
      tint: "#1d2a3a",
      ink: "#f2ead2",
      face: (
        <Face label="Every night's film" title="OCTOBER">
          The whole month's films, night by night.
        </Face>
      ),
      sheet: { id: "calendar", title: "The October calendar", tone: "board", body: <CalendarBoard signedIn={signedIn} goTo={goTo} /> },
    },
  ];
  return { flyers, tonight };
}

// A flyer standing on the table: tap it (standing at the table) to pick it up
export function FlyerFace({ flyer, onOpen, held = false }: { flyer: Flyer; onOpen: () => void; held?: boolean }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Pick up: ${flyer.title}`}
      onClick={onOpen}
      onKeyDown={(event) => event.key === "Enter" && onOpen()}
      className={`h-full w-full cursor-pointer overflow-hidden shadow-[3px_4px_0_rgba(0,0,0,0.45)] transition hover:brightness-110${held ? " outline outline-[6px] outline-offset-4 outline-[#ffcf7a] shadow-[0_0_40px_rgba(255,190,90,0.7)]" : ""}`}
      style={{ backgroundColor: flyer.tint, backgroundImage: PAPER_GRAIN, color: flyer.ink, ...typewriter }}
    >
      {flyer.face}
    </div>
  );
}
