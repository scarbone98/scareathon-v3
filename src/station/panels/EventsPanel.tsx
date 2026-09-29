import { useState } from "react";
import MovieInfo from "../../pages/Home/MovieInfo";
import StreamingProviders from "../../pages/Home/StreamingProviders";
import { challengeTarget, eventState, formatShortDate, needsSignIn, useContentLoop, useRewardStatus, useTodayMovie } from "../data.ts";
import type { StopId } from "../stops.ts";
import { Loading, PanelHeading, Paper, Problem, SignInFirst, Tabs } from "./ui.tsx";
import { serif } from "./theme.ts";

// The events table: the Scareathon flyer (where it stands, this week's challenge),
// tonight's film, and the rules. Scareathon is the only event for now.

type Props = { signedIn: boolean; goTo: (id: StopId) => void };
type Tab = "event" | "tonight" | "rules";

const RULES = [
  "Every day, watch the movie on the day it is scheduled to earn 1 point.",
  "Every week, complete the themed weekly challenge by Sunday's film to earn 1 point.",
  "Wear a costume on Halloween to earn 1 point.",
];

function Overview({ signedIn, goTo, showTab }: Props & { showTab: (tab: Tab) => void }) {
  const { isLive, daysUntil, year, day } = eventState();
  const { data: items = [] } = useContentLoop();
  const challenge = items.find((item) => item.type === "weekly_challenge");
  const { data: reward } = useRewardStatus(challenge, signedIn);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded border border-orange-500/30 bg-orange-950/20 p-4">
        <div className="min-w-[5.5rem] rounded-sm bg-orange-500 px-3 py-2 text-center text-stone-950 shadow-[3px_3px_0_rgba(0,0,0,0.5)]">
          <p className="text-[10px] font-bold uppercase tracking-widest">{isLive ? "Day" : "Starts in"}</p>
          <p className="text-3xl font-bold leading-none" style={serif}>
            {isLive ? day : daysUntil}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest">{isLive ? "of 31" : daysUntil === 1 ? "day" : "days"}</p>
        </div>
        <p className="text-sm leading-relaxed text-stone-300">
          {isLive
            ? `Scareathon ${year} is running. One horror film a night through Halloween: watch along, finish the weekly challenges, and climb the Scareboard.`
            : `Scareathon ${year} starts October 1. A horror film every night through Halloween, weekly challenges, and a Scareboard for the whole month.`}
        </p>
      </div>

      {challenge && (
        <Paper tilt={-0.6} className="pt-6">
          <p className="text-[11px] uppercase tracking-widest text-stone-600">
            This week's challenge
            {challenge.startsAt && challenge.endsAt ? ` · ${formatShortDate(challenge.startsAt)} – ${formatShortDate(challenge.endsAt)}` : ""}
          </p>
          <h3 className="mt-2 text-lg leading-snug" style={serif}>
            {challenge.title}
          </h3>
          {challengeTarget(challenge) && <p className="mt-2 text-sm text-stone-700">{challengeTarget(challenge)}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-sm border border-stone-800/30 px-2 py-1">{challenge.points || 1} point</span>
            {challenge.rewardCoins ? <span className="rounded-sm border border-amber-800/40 bg-amber-200/60 px-2 py-1">{challenge.rewardCoins.toLocaleString()} coins</span> : null}
            {reward?.data?.alreadyClaimed && <span className="font-semibold text-emerald-800">✓ Completed</span>}
          </div>
          <div className="mt-3 flex gap-3 text-sm">
            {!signedIn && challenge.rewardCoins ? (
              <button type="button" onClick={() => goTo("tickets")} className="rounded-sm bg-stone-900 px-3 py-1 text-amber-100 hover:bg-stone-700">
                Sign in to earn
              </button>
            ) : null}
            {challenge.gameName && (
              <button type="button" onClick={() => goTo("arcade")} className="underline decoration-stone-500 underline-offset-4">
                Go to the arcade
              </button>
            )}
          </div>
        </Paper>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm">
        {[
          { label: "Tonight's film", action: () => showTab("tonight") },
          { label: "Rules", action: () => showTab("rules") },
          { label: "Scareboard", action: () => goTo("departures") },
          { label: "October calendar", action: () => goTo("departures") },
        ].map((link) => (
          <button
            key={link.label}
            type="button"
            onClick={link.action}
            className="rounded-sm px-3 py-2 text-left text-amber-100/90 ring-1 ring-amber-200/15 transition hover:bg-amber-100/5"
            style={serif}
          >
            {link.label} →
          </button>
        ))}
      </div>
    </div>
  );
}

function Tonight({ signedIn, goTo }: Props) {
  const { isLive } = eventState();
  const { data, isLoading, error } = useTodayMovie(isLive && signedIn);
  if (!isLive) return <p className="text-sm leading-relaxed text-stone-300">The projector is dark until October 1, when the first film of the Scareathon is shown.</p>;
  if (!signedIn || needsSignIn(error)) return <SignInFirst what="Tonight's film and where to watch it" onGoToKiosk={() => goTo("tickets")} />;
  if (isLoading) return <Loading label="Threading the projector" />;
  if (error) return <Problem message={error.message} />;
  const movie = data?.data;
  if (!movie) return <p className="text-sm text-stone-400">No film is listed for tonight.</p>;
  return (
    <div className="text-center text-orange-200">
      {movie.lowResUrl ? (
        <img src={movie.lowResUrl} alt={movie.title} className="mx-auto h-72 rounded shadow-[4px_5px_0_rgba(0,0,0,0.5)]" />
      ) : null}
      <p className="mt-4 text-2xl text-amber-100" style={serif}>
        {movie.title}
      </p>
      <MovieInfo runtime={movie.runtime} year={movie.year} rating={movie.rating} genres={movie.genres || []} />
      <StreamingProviders watchProviders={movie.watchProviders} movieTitle={movie.title} />
    </div>
  );
}

export default function EventsPanel({ signedIn, goTo }: Props) {
  const [tab, setTab] = useState<Tab>("event");
  const { year } = eventState();
  return (
    <>
      <PanelHeading eyebrow="Events table" title={`Scareathon ${year}`} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "event", label: "The event" },
          { id: "tonight", label: "Tonight's film" },
          { id: "rules", label: "Rules" },
        ]}
      />
      {tab === "event" && <Overview signedIn={signedIn} goTo={goTo} showTab={setTab} />}
      {tab === "tonight" && <Tonight signedIn={signedIn} goTo={goTo} />}
      {tab === "rules" && (
        <ol className="space-y-3">
          {RULES.map((rule, i) => (
            <li key={rule} className="flex gap-3 text-sm leading-relaxed text-stone-200">
              <span className="text-amber-300" style={serif}>
                {i + 1}.
              </span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
