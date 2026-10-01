import { useState } from "react";
import { eventState, needsSignIn, useCalendar } from "../data.ts";
import type { GoTo } from "../stops.ts";
import { serif, stubButton } from "../style/theme.ts";
import { useScareathonMe, useToggleWatched } from "../../scareathonSeason";

// The October calendar flyer: the month laid out as a wall calendar, every night's film
// poster in its square. On the stand it's a picture of the month; read up close, tap a
// film to see what it is and tick it off (each tick is a point on the Scareboard).

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A smaller poster than the API's: 31 of them share one flyer
const smallPoster = (url?: string) => url?.replace("/t/p/w342/", "/t/p/w154/");

export default function PosterCalendar({ signedIn, goTo, zoomed }: { signedIn: boolean; goTo: GoTo; zoomed: boolean }) {
  const { isLive, day: today, calendarYear } = eventState();
  const { data, error } = useCalendar(signedIn);
  const { data: me } = useScareathonMe(signedIn);
  const toggle = useToggleWatched();
  const [picked, setPicked] = useState<number | null>(null);

  const films = signedIn && !needsSignIn(error) ? data?.data : undefined;
  const watched = me?.season === calendarYear ? new Set(me.watchedDays) : null;
  const firstWeekday = new Date(calendarYear, 9, 1).getDay();
  const rows = Math.ceil((firstWeekday + 31) / 7);
  const selected = picked ?? (isLive ? today : 1);
  const film = films?.[selected];

  return (
    <div className="flex h-full w-full flex-col px-3 pb-3 pt-4 text-[#f2ead2]">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-[34px] font-bold leading-none tracking-wide" style={serif}>
          OCTOBER
        </p>
        <p className="text-[13px] uppercase tracking-[0.25em] opacity-70">{calendarYear}</p>
      </div>
      <p className="mt-1 px-1 text-[12px] uppercase tracking-[0.18em] opacity-60">
        {!signedIn || needsSignIn(error)
          ? "Sign in to see the films"
          : zoomed
            ? "Tap a film to tick it off"
            : "Every night's film"}
      </p>
      <div className="mt-2 grid grid-cols-7 gap-[5px] px-px text-center text-[11px] opacity-60">
        {WEEKDAYS.map((letter, i) => (
          <span key={i}>{letter}</span>
        ))}
      </div>
      <div className="mt-1 grid min-h-0 flex-1 grid-cols-7 gap-[5px]" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: 31 }, (_, i) => {
          const date = i + 1;
          const entry = films?.[date];
          const poster = smallPoster(entry?.lowResUrl);
          const isTonight = isLive && date === today;
          const seen = watched?.has(date) ?? false;
          const faded = isLive && date < today && !seen;
          const cell = (
            <>
              {poster ? (
                <img src={poster} alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="absolute inset-0 bg-[#2b3a4e]" />
              )}
              <span className="absolute left-0 top-0 bg-black/75 px-[3px] text-[10px] leading-[14px] text-[#f2ead2]">{date}</span>
              {seen && (
                <span className="absolute bottom-0 right-0 flex h-[16px] w-[16px] items-center justify-center bg-[#2e7d4f] text-[11px] font-bold leading-none text-white">
                  ✓
                </span>
              )}
            </>
          );
          const frame = `relative overflow-hidden rounded-[2px] shadow-[1px_2px_0_rgba(0,0,0,0.5)] ${faded ? "opacity-45" : ""} ${
            isTonight ? "outline outline-2 outline-offset-1 outline-[#ffcf7a]" : ""
          } ${zoomed && selected === date ? "ring-2 ring-[#f2ead2]" : ""}`;
          return zoomed && films ? (
            <button
              key={date}
              type="button"
              className={`${frame} transition hover:brightness-110`}
              onClick={() => setPicked(date)}
              aria-label={`${date} October: ${entry?.title ?? "film"}${seen ? ", watched" : ""}`}
              aria-pressed={selected === date}
            >
              {cell}
            </button>
          ) : (
            <div key={date} className={frame}>
              {cell}
            </div>
          );
        })}
      </div>

      {zoomed && (
        <div className="mt-3 flex min-h-[64px] items-center gap-3 border-t border-[#f2ead2]/20 px-1 pt-3">
          {!films ? (
            !signedIn || needsSignIn(error) ? (
              <button type="button" className={stubButton} onClick={() => goTo("tickets")}>
                Sign in at the counter
              </button>
            ) : (
              <p className="text-[14px] italic opacity-70">{error ? error.message : "Pinning up the posters…"}</p>
            )
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.18em] opacity-60">
                  {WEEKDAY_NAMES[(firstWeekday + selected - 1) % 7]} {String(selected).padStart(2, "0")}
                  {film?.theme ? ` · ${film.theme}` : ""}
                  {isLive && selected === today ? " · Tonight" : ""}
                </p>
                <p className="truncate text-[20px] leading-tight" style={serif}>
                  {film?.title ?? ""}
                </p>
                {toggle.error && <p className="text-[12px] text-red-300">{toggle.error.message}</p>}
              </div>
              {watched && (
                <button
                  type="button"
                  className={`${stubButton} shrink-0 text-[#2a1d14]`}
                  aria-pressed={watched.has(selected)}
                  onClick={() => toggle.mutate({ day: selected, watched: !watched.has(selected) })}
                >
                  {watched.has(selected) ? "✓ Watched" : "Mark watched"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
