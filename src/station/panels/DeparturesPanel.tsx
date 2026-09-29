import { useEffect, useRef, useState } from "react";
import { eventState, needsSignIn, useCalendar, useScareboard } from "../data.ts";
import type { GoTo } from "../stops.ts";
import { Loading, PanelHeading, Problem, SignInFirst, Tabs } from "./ui.tsx";
import { serif } from "./theme.ts";

// The departure board: the Scareboard as a split-flap board, and the October
// schedule as a timetable.

type Props = { signedIn: boolean; goTo: GoTo };

const flap = "rounded-[2px] bg-[#0a0c10] font-mono uppercase text-[#ffb03a] shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]";

function Standings({ signedIn, goTo }: Props) {
  const [year, setYear] = useState<number | null>(null);
  const { data, isLoading, isFetching, error } = useScareboard(year, signedIn);
  if (!signedIn || needsSignIn(error)) return <SignInFirst what="The Scareboard standings" onGoToKiosk={() => goTo("tickets")} />;
  if (isLoading && !data) return <Loading label="Flipping the board" />;
  if (error) return <Problem message={error.message} />;

  const meta = data?.leaderboard.meta;
  const rows = data?.leaderboard.data ?? [];
  const columns = rows[0] ? Object.keys(rows[0]).filter((key) => !["name", "rank", "total"].includes(key)) : [];
  const winsFor = (name: string) => (data?.pastWinners.data ?? []).filter((w) => w.name === name).map((w) => w.year.slice(2, 4));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-widest text-amber-200/60">
          {meta?.isLive ? "Live October standings" : meta?.isPreseason ? "Preseason — starts October 1" : "Historical standings"}
        </p>
        {(meta?.availableYears?.length ?? 0) > 1 && (
          <div className="flex flex-wrap gap-1">
            {meta!.availableYears!.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYear(y)}
                className={`${flap} px-2 py-1 text-xs ${y === meta?.year ? "ring-1 ring-[#ffb03a]" : "opacity-60 hover:opacity-100"}`}
              >
                {y}
              </button>
            ))}
            {isFetching && <span className="self-center text-xs text-amber-100/50">…</span>}
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <div className={`${flap} px-4 py-6 text-center text-sm normal-case`}>
          {meta?.isPreseason ? `${meta.year} is on the way. Standings begin October 1.` : "No scores yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-black bg-[#15181f] p-2">
          <table className="w-full border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-amber-200/50">
                <th className="px-2">#</th>
                <th className="px-2">Passenger</th>
                {columns.map((c) => (
                  <th key={c} className="hidden px-2 sm:table-cell">
                    {c}
                  </th>
                ))}
                <th className="px-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className={row.rank <= 3 ? "text-[#ffd27a]" : "text-[#ffb03a]"}>
                  <td className={`${flap} w-8 px-2 py-1.5 text-center`}>{row.rank}</td>
                  <td className={`${flap} px-2 py-1.5`}>
                    {row.name}
                    {winsFor(row.name).map((y) => (
                      <span key={y} className="ml-1.5 text-[10px] text-yellow-300" title={`Won in 20${y}`}>
                        ★{y}
                      </span>
                    ))}
                  </td>
                  {columns.map((c) => (
                    <td key={c} className={`${flap} hidden px-2 py-1.5 sm:table-cell`}>
                      {row[c]}
                    </td>
                  ))}
                  <td className={`${flap} px-2 py-1.5 text-right`}>{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Timetable({ signedIn, goTo }: Props) {
  const { data, isLoading, error } = useCalendar(signedIn);
  const { isLive, day, calendarYear } = eventState();
  const todayRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => todayRef.current?.scrollIntoView({ block: "center" }), [data]);
  if (!signedIn || needsSignIn(error)) return <SignInFirst what="The October timetable" onGoToKiosk={() => goTo("tickets")} />;
  if (isLoading) return <Loading label="Printing the timetable" />;
  if (error) return <Problem message={error.message} />;
  const days = (data?.data ?? []).slice(1, 32); // entry 0 is the sheet's header row
  const firstWeekday = new Date(calendarYear, 9, 1).getDay();

  return (
    <ol className="space-y-1.5">
      {days.map((entry, i) => {
        const date = i + 1;
        const past = isLive && date < day;
        const today = isLive && date === day;
        return (
          <li
            key={`${date}-${entry.title}`}
            ref={today ? todayRef : undefined}
            className={`flex items-center gap-3 rounded-sm p-1.5 ${today ? "bg-amber-300/15 ring-1 ring-amber-300/60" : "bg-black/25"} ${past ? "opacity-45" : ""}`}
          >
            <div className={`${flap} w-14 shrink-0 py-1 text-center`}>
              <p className="text-[9px] opacity-70">{WEEKDAYS[(firstWeekday + i) % 7]}</p>
              <p className="text-lg leading-none">{String(date).padStart(2, "0")}</p>
            </div>
            {entry.lowResUrl ? <img src={entry.lowResUrl} alt="" className="h-12 w-8 shrink-0 rounded-sm object-cover" loading="lazy" /> : null}
            <p className="min-w-0 flex-1 truncate text-sm text-stone-200" style={serif}>
              {entry.title}
            </p>
            {today && <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-amber-300">Tonight</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function DeparturesPanel({ signedIn, goTo, open }: Props & { open?: string }) {
  const [tab, setTab] = useState<"standings" | "timetable">(open === "timetable" ? "timetable" : "standings");
  return (
    <>
      <PanelHeading eyebrow="Departure board" title="Standings and timetable" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "standings", label: "Scareboard" },
          { id: "timetable", label: "October timetable" },
        ]}
      />
      {tab === "standings" ? <Standings signedIn={signedIn} goTo={goTo} /> : <Timetable signedIn={signedIn} goTo={goTo} />}
    </>
  );
}
