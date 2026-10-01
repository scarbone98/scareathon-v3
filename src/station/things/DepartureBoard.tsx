import { useEffect, useRef, useState } from "react";
import { eventState, needsSignIn, useCalendar, useScareboard } from "../data.ts";
import type { GoTo } from "../stops.ts";
import ScareathonAdminPanel from "../../components/ScareathonAdminPanel";
import { useScareathonMe, useToggleWatched } from "../../scareathonSeason";

// The scoreboard on the wall over the ticket counter (the Scareboard, with years and past
// winners), and the October calendar, which lives at the flyer stand: amber split-flap
// rows, both. On the calendar a passenger ticks off the films they've watched; each tick
// is a point on the Scareboard.

type Props = { signedIn: boolean; goTo: GoTo };

const AMBER = "#ffb03a";
const flap = "rounded-[2px] bg-[#111419] px-1.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),inset_0_1px_0_rgba(0,0,0,0.6)]";
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function Key({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${flap} py-0.5 text-[15px] transition ${active ? "text-[#0a0c10]" : "opacity-60 hover:opacity-100"}`}
      style={{ background: active ? AMBER : undefined }}
    >
      {children}
    </button>
  );
}

function Line({ children, dim = false, bright = false }: { children: React.ReactNode; dim?: boolean; bright?: boolean }) {
  return <div className={`flex items-center gap-2 py-[3px] text-[19px] leading-none ${dim ? "opacity-40" : ""} ${bright ? "text-[#ffd27a]" : ""}`}>{children}</div>;
}

function Standings({ signedIn }: { signedIn: boolean }) {
  const [year, setYear] = useState<number | null>(null);
  const { data, isLoading, error } = useScareboard(year, signedIn);
  const { data: me } = useScareathonMe(signedIn);
  if (!signedIn || needsSignIn(error)) return null;
  if (isLoading && !data) return <Line>FLIPPING...</Line>;
  if (error) return <Line>BOARD FAULT: {error.message.toUpperCase()}</Line>;
  const meta = data?.leaderboard.meta;
  const rows = data?.leaderboard.data ?? [];
  const winsFor = (name: string) => (data?.pastWinners.data ?? []).filter((w) => w.name === name).map((w) => w.year.slice(2, 4));
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[13px] opacity-80">
        <span className="mr-1">{meta?.isLive ? "LIVE STANDINGS" : meta?.isPreseason ? "PRESEASON - STARTS OCT 01" : "HISTORICAL"}</span>
        {(meta?.availableYears ?? []).map((y) => (
          <Key key={y} active={y === meta?.year} onClick={() => setYear(y)}>
            {String(y)}
          </Key>
        ))}
      </div>
      {rows.length === 0 && <Line>{meta?.isPreseason ? `${meta.year} ON THE WAY - STANDINGS FROM OCT 01` : "NO SCORES YET"}</Line>}
      {rows.map((row) => (
        <Line key={row.name} bright={row.rank <= 3}>
          <span className={`${flap} w-9 text-center`}>{row.rank}</span>
          <span className={`${flap} min-w-0 flex-1 truncate`}>
            {row.name.toUpperCase()}
            {winsFor(row.name).map((y) => (
              <span key={y} className="ml-2 text-[13px] text-yellow-300">
                ★{y}
              </span>
            ))}
          </span>
          <span className={`${flap} w-16 text-right`}>{row.total}</span>
        </Line>
      ))}
      {me?.isAdmin && <ScareathonAdminPanel className="mt-4" />}
    </>
  );
}

function Timetable({ signedIn }: { signedIn: boolean }) {
  const { data, isLoading, error } = useCalendar(signedIn);
  const { isLive, day, calendarYear } = eventState();
  const { data: me } = useScareathonMe(signedIn);
  const toggle = useToggleWatched();
  const watchedDays = me?.season === calendarYear ? new Set(me.watchedDays) : null;
  const tonight = useRef<HTMLDivElement | null>(null);
  // Braces matter: newer browsers return a Promise from scrollIntoView, and React would
  // take a returned value for the effect's cleanup and crash calling it on close
  useEffect(() => {
    tonight.current?.scrollIntoView({ block: "center" });
  }, [data]);
  if (!signedIn || needsSignIn(error)) return null;
  if (isLoading) return <Line>PRINTING...</Line>;
  if (error) return <Line>BOARD FAULT: {error.message.toUpperCase()}</Line>;
  const firstWeekday = new Date(calendarYear, 9, 1).getDay();
  return (
    <>
      {watchedDays && <Line dim>TICK THE FILMS YOU'VE WATCHED: 1 POINT EACH</Line>}
      {toggle.error && <Line>NOT SAVED: {toggle.error.message.toUpperCase()}</Line>}
      {(data?.data ?? []).slice(1, 32).map((entry, i) => {
        const date = i + 1;
        const isTonight = isLive && date === day;
        return (
          <div key={`${date}-${entry.title}`} ref={isTonight ? tonight : undefined}>
            <Line dim={isLive && date < day && !watchedDays?.has(date)} bright={isTonight}>
              <span className={`${flap} w-12 text-center`}>{WEEKDAYS[(firstWeekday + i) % 7]}</span>
              <span className={`${flap} w-9 text-center`}>{String(date).padStart(2, "0")}</span>
              <span className={`${flap} min-w-0 flex-1 truncate`}>{entry.title.toUpperCase()}</span>
              {isTonight && <span className="text-[15px]">◂ TONIGHT</span>}
              {watchedDays && (
                <button
                  type="button"
                  aria-pressed={watchedDays.has(date)}
                  aria-label={`${watchedDays.has(date) ? "Unmark" : "Mark"} ${entry.title} watched`}
                  onClick={() => toggle.mutate({ day: date, watched: !watchedDays.has(date) })}
                  className={`${flap} w-9 shrink-0 text-center hover:text-[#ffd27a]`}
                  style={watchedDays.has(date) ? { background: AMBER, color: "#0a0c10", textShadow: "none" } : undefined}
                >
                  {watchedDays.has(date) ? "✓" : "·"}
                </button>
              )}
            </Line>
          </div>
        );
      })}
    </>
  );
}

// The board on the wall: the Scareboard
export default function DepartureBoard({ signedIn, goTo }: Props) {
  return (
    <div className="flex h-full w-full flex-col bg-[#0a0c10] px-4 py-3 font-mono" style={{ color: AMBER, textShadow: "0 0 6px rgba(255,176,58,0.45)" }}>
      <div className="mb-2 border-b border-[#ffb03a]/25 pb-2">
        <span className="text-[26px] font-bold tracking-wide">SCOREBOARD</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:#ffb03a55_transparent] [scrollbar-width:thin]">
        {signedIn ? (
          <Standings signedIn={signedIn} />
        ) : (
          <>
            <Line>STANDINGS ......... SIGNED-IN PASSENGERS</Line>
            <Line dim>ARCADE ............ BOARDING ALL NIGHT</Line>
            <button type="button" onClick={() => goTo("tickets")} className={`${flap} mt-3 py-1 text-[17px] hover:text-[#ffd27a]`}>
              ▸ SIGN IN AT THE COUNTER
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// The October calendar, on its own card at the flyer stand: the same split-flap rows
export function CalendarBoard({ signedIn, goTo }: Props) {
  return (
    <div className="flex h-full w-full flex-col bg-[#0a0c10] px-4 py-3 font-mono" style={{ color: AMBER, textShadow: "0 0 6px rgba(255,176,58,0.45)" }}>
      <div className="mb-2 border-b border-[#ffb03a]/25 pb-2">
        <span className="text-[26px] font-bold tracking-wide">OCTOBER</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:#ffb03a55_transparent] [scrollbar-width:thin]">
        {signedIn ? (
          <Timetable signedIn={signedIn} />
        ) : (
          <>
            <Line>THE CALENDAR IS FOR SIGNED-IN PASSENGERS</Line>
            <button type="button" onClick={() => goTo("tickets")} className={`${flap} mt-3 py-1 text-[17px] hover:text-[#ffd27a]`}>
              ▸ SIGN IN AT THE COUNTER
            </button>
          </>
        )}
      </div>
    </div>
  );
}
