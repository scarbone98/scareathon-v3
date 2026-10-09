import ReportsQueue from "../station/things/ReportsQueue";
import { useState } from "react";
import {
  type PointCategory,
  useAwardPoints,
  useImportHistory,
  useRefreshCalendar,
  usePointLedger,
  useRemovePoints,
} from "../scareathonSeason";

// Admins only: give or take Scareboard points (movies, weekly challenges, bonus), see and
// undo every entry this season, and copy the old sheet's seasons in.
// Shown under the Scareboard on the classic page and on the station's scoreboard.

const CATEGORIES: { value: PointCategory; label: string }[] = [
  { value: "bonus", label: "Bonus" },
  { value: "weekly", label: "Weekly challenge" },
  { value: "movies", label: "Movies" },
];

type ImportResult = { seasons: Record<string, number>; winners: number; skipped: string[] };

export default function ScareathonAdminPanel({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [category, setCategory] = useState<PointCategory>("bonus");
  const [points, setPoints] = useState("1");
  const [reason, setReason] = useState("");
  const ledger = usePointLedger(open);
  const award = useAwardPoints();
  const remove = useRemovePoints();
  const importHistory = useImportHistory();
  const refreshCalendar = useRefreshCalendar();
  const imported = importHistory.data as ImportResult | undefined;

  const field = "rounded border border-white/20 bg-black/60 px-2 py-1.5 text-base text-white";
  const button = "rounded border border-orange-500/70 bg-orange-900/60 px-3 py-1.5 text-base text-orange-50 hover:bg-orange-800 disabled:opacity-50";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    award.mutate(
      { username: username.trim(), category, points: Number(points), reason: reason.trim() },
      { onSuccess: () => setReason("") }
    );
  };

  return (
    <section className={`rounded-lg border border-orange-800/60 bg-gray-950/85 p-4 text-left font-sans tracking-normal text-orange-50 [text-shadow:none] ${className}`}>
      <button type="button" className="text-lg font-bold text-orange-300" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? "▾" : "▸"} Admin: award points
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <ReportsQueue />
          <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_auto_5rem]">
            <input className={field} placeholder="Player's username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <select className={field} value={category} onChange={(e) => setCategory(e.target.value as PointCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input className={field} type="number" step={1} value={points} onChange={(e) => setPoints(e.target.value)} aria-label="Points (negative takes away)" required />
            <input className={`${field} sm:col-span-2`} placeholder="Why (e.g. Halloween costume)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
            <button type="submit" className={button} disabled={award.isPending || !username.trim() || !Number(points)}>
              {Number(points) < 0 ? "Take away" : "Award"}
            </button>
          </form>
          {award.error && <p className="text-sm text-red-400">{award.error.message}</p>}
          {award.isSuccess && <p className="text-sm text-green-400">Saved. The Scareboard is updated.</p>}

          <div>
            <h3 className="mb-1 text-sm uppercase tracking-widest text-orange-300/80">This season's points</h3>
            {ledger.isLoading && <p className="text-sm text-orange-100/60">Loading…</p>}
            {ledger.error && <p className="text-sm text-red-400">{ledger.error.message}</p>}
            {ledger.data?.length === 0 && <p className="text-sm text-orange-100/60">No points given yet. (Watched movies are counted from the calendar.)</p>}
            <ul className="max-h-64 divide-y divide-white/10 overflow-y-auto text-sm">
              {ledger.data?.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2 py-1.5">
                  <span className={`w-10 shrink-0 text-right font-bold ${entry.points < 0 ? "text-red-400" : "text-green-400"}`}>
                    {entry.points > 0 ? `+${entry.points}` : entry.points}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{entry.username}</span> · {entry.category}
                    {entry.reason && <> · {entry.reason}</>}
                    <span className="block text-xs text-orange-100/50">
                      {entry.automatic ? "automatic" : `by ${entry.awardedBy ?? "an admin"}`} · {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded px-2 py-1 text-orange-100/60 hover:bg-red-900/60 hover:text-white disabled:opacity-40"
                    onClick={() => remove.mutate(entry.id)}
                    disabled={remove.isPending}
                    aria-label={`Remove ${entry.points} ${entry.category} from ${entry.username}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            {remove.error && <p className="text-sm text-red-400">{remove.error.message}</p>}
          </div>

          <div className="border-t border-white/10 pt-3">
            <button type="button" className={button} onClick={() => refreshCalendar.mutate()} disabled={refreshCalendar.isPending}>
              {refreshCalendar.isPending ? "Refreshing…" : refreshCalendar.isSuccess ? "Calendar refreshed" : "Refresh the calendar from the Google sheet"}
            </button>
            <p className="mt-1 text-xs text-orange-100/50">After changing the Calendar-YYYY tab, so the site shows it now.</p>
            {refreshCalendar.error && <p className="text-sm text-red-400">{refreshCalendar.error.message}</p>}
          </div>

          <div className="border-t border-white/10 pt-3">
            <button type="button" className={button} onClick={() => importHistory.mutate(undefined)} disabled={importHistory.isPending}>
              {importHistory.isPending ? "Importing…" : "Import past seasons from the Google sheet"}
            </button>
            <p className="mt-1 text-xs text-orange-100/50">Copies the Users-YYYY and Winners tabs (before 2026). Safe to run again.</p>
            {importHistory.error && <p className="text-sm text-red-400">{importHistory.error.message}</p>}
            {imported && (
              <p className="mt-1 text-sm text-green-400">
                Imported{" "}
                {Object.entries(imported.seasons)
                  .map(([season, count]) => `${season}: ${count} players`)
                  .join(", ") || "no seasons"}
                ; {imported.winners} winners.
                {imported.skipped.length > 0 && <span className="block text-orange-300">Skipped: {imported.skipped.join("; ")}</span>}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
