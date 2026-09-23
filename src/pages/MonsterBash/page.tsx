import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getMonster,
  type Monster,
  type MonsterMove,
} from "../../../shared/monster-bash/index.js";
import AnimatedPage from "../../components/AnimatedPage";
import { SiteContainer } from "../../components/PageContainer";
import Arena from "./arena/Arena";
import { connectLocalFeed } from "./feed/localFeed";
import { connectSocketFeed } from "./feed/socketFeed";
import FighterPortrait from "./FighterPortrait";
import { MatchStore, type LiveMatch, type MatchPhase } from "./matchStore";
import OddsChart from "./OddsChart";
import { SIDE_COLORS, formatPercent } from "./theme";

const CLOCK_INTERVAL_MS = 250;

// Re-renders the page a few times a second so the chart follows the arena.
function usePlaybackClock(store: MatchStore) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
  return { tick: store.playbackTick(now), phase: store.phase(now) };
}

const PHASE_LABELS: Record<MatchPhase, string> = {
  waiting: "Warming up",
  intro: "Up next",
  fighting: "Live",
  result: "Final",
};

function currentOdds(match: LiveMatch, tick: number) {
  let latest = match.odds[0];
  for (const point of match.odds) {
    if (point.t <= Math.max(0, tick)) latest = point;
  }
  return latest?.p ?? 0.5;
}

function Matchup({ match, tick, phase }: { match: LiveMatch; tick: number; phase: MatchPhase }) {
  const p = currentOdds(match, tick);
  const monsters = match.fighters.map(getMonster);
  const winner = phase === "result" ? match.result?.winner : undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1fr),auto,minmax(0,1fr)] items-center gap-2 rounded-lg border border-purple-900/60 bg-black/60 px-3 py-3 sm:gap-3 sm:px-5">
      {monsters.map((monster, side) => {
        const chance = side === 0 ? p : 1 - p;
        const card = (
          <div
            key={monster.id}
            className={`flex min-w-0 items-center gap-2 sm:gap-3 ${side === 1 ? "flex-row-reverse text-right" : ""} ${
              winner !== undefined && winner !== side ? "opacity-50" : ""
            }`}
          >
            <div className="shrink-0">
              <FighterPortrait monster={monster} size={40} flip={side === 1} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-base font-bold text-orange-50 sm:text-xl" style={{ flexDirection: side === 1 ? "row-reverse" : "row" }}>
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SIDE_COLORS[side] }} />
                <span className="truncate">{monster.name}</span>
              </div>
              <div className="hidden truncate text-sm text-purple-200/70 sm:block">{monster.title}</div>
              <div className="text-sm text-orange-100/90">
                <strong className="text-base text-orange-50">{formatPercent(chance)}</strong> to win
                {winner === side && <span className="ml-2 font-bold text-amber-300">Winner</span>}
              </div>
            </div>
          </div>
        );
        return side === 0 ? card : [<div key="vs" className="font-zombie text-2xl text-red-500 sm:text-3xl">VS</div>, card];
      })}
    </div>
  );
}

function moveKindLabel(move: MonsterMove) {
  return move.kind === "projectile" ? "Ranged" : move.kind === "dash" ? "Rush" : "Melee";
}

function StatRow({ label, values }: { label: string; values: [string, string] }) {
  return (
    <div className="grid grid-cols-[1fr,auto,1fr] gap-2 border-b border-purple-900/40 py-1.5 text-sm last:border-0">
      <span className="font-semibold text-orange-50 tabular-nums">{values[0]}</span>
      <span className="text-center text-xs uppercase tracking-wider text-purple-200/60">{label}</span>
      <span className="text-right font-semibold text-orange-50 tabular-nums">{values[1]}</span>
    </div>
  );
}

function TaleOfTheTape({ match }: { match: LiveMatch }) {
  const [a, b] = match.fighters.map(getMonster) as [Monster, Monster];
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const both = (pick: (monster: Monster) => string): [string, string] => [pick(a), pick(b)];

  return (
    <section className="rounded-lg border border-purple-900/60 bg-black/60 p-4">
      <h2 className="text-lg font-bold text-orange-50">Tale of the tape</h2>
      <div className="mt-2">
        <StatRow label="Health" values={both((m) => String(m.stats.maxHp))} />
        <StatRow label="Speed" values={both((m) => m.stats.walkSpeed.toFixed(1))} />
        <StatRow label="Armor" values={both((m) => pct(m.stats.armor))} />
        <StatRow label="Dodge" values={both((m) => pct(m.stats.evasion))} />
        <StatRow label="Poise" values={both((m) => pct(m.stats.poise))} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[a, b].map((monster, side) => (
          <div key={monster.id} className={side === 1 ? "text-right" : ""}>
            <h3 className="mb-1 text-xs uppercase tracking-wider text-purple-200/60">{monster.name} moves</h3>
            <ul className="space-y-1 text-sm text-orange-100/90">
              {monster.moves.map((move) => (
                <li key={move.id}>
                  {move.name} <span className="text-xs text-purple-200/60">{moveKindLabel(move)}</span>
                </li>
              ))}
              <li className="font-semibold text-amber-300">{monster.special.name}</li>
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecentResults({ history }: { history: { id: string; fighters: [string, string]; winner: 0 | 1 }[] }) {
  return (
    <section className="rounded-lg border border-purple-900/60 bg-black/60 p-4">
      <h2 className="text-lg font-bold text-orange-50">Recent bouts</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-purple-200/70">Results show up here after each bout.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {history.map((bout) => {
            const [a, b] = bout.fighters.map((id) => getMonster(id).name);
            return (
              <li key={bout.id} className="flex justify-between gap-2 text-orange-100/90">
                <span className={bout.winner === 0 ? "font-bold text-orange-50" : "text-purple-200/60"}>{a}</span>
                <span className="text-xs text-purple-200/50">vs</span>
                <span className={bout.winner === 1 ? "font-bold text-orange-50" : "text-purple-200/60"}>{b}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function MonsterBash() {
  const [store] = useState(() => new MatchStore());
  const { match, history, viewers, connection } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { tick, phase } = usePlaybackClock(store);
  // `?preview=local` runs bouts in the browser, for working on the page offline.
  const [localPreview] = useState(() => new URLSearchParams(window.location.search).get("preview") === "local");

  useEffect(
    () => (localPreview ? connectLocalFeed(store) : connectSocketFeed(store)),
    [store, localPreview]
  );
  const reconnecting = connection === "reconnecting";

  return (
    <AnimatedPage className="bg-[#07030c]">
      <SiteContainer as="main" className="relative z-10 flex flex-col gap-4 pb-8 pt-4 md:pt-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-zombie text-3xl tracking-wide text-red-500 md:text-4xl">Monster Bash</p>
            <p className="text-sm text-purple-200/70">
              Monsters fight it out around the clock. Watch the odds swing live.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {viewers !== null && (
              <span className="text-sm text-purple-200/70">
                <strong className="text-orange-50">{viewers}</strong> watching
              </span>
            )}
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                reconnecting
                  ? "border-amber-600 bg-amber-950/40 text-amber-200"
                  : phase === "fighting"
                    ? "border-red-500 bg-red-950/60 text-red-300"
                    : "border-purple-700 bg-purple-950/40 text-purple-200"
              }`}
            >
              {phase === "fighting" && !reconnecting && (
                <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
              )}
              {reconnecting ? "Reconnecting" : PHASE_LABELS[phase]}
            </span>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),320px]">
          <div className="flex min-w-0 flex-col gap-4">
            {match && <Matchup match={match} tick={tick} phase={phase} />}
            <Arena store={store} />
            {match && <OddsChart match={match} playbackTick={tick} />}
          </div>
          <aside className="flex flex-col gap-4">
            {match && <TaleOfTheTape match={match} />}
            <RecentResults history={history} />
            {localPreview && (
              <p className="text-xs text-purple-200/50">
                Local preview: bouts are simulated in your browser, not the live arena.
              </p>
            )}
          </aside>
        </div>
      </SiteContainer>
    </AnimatedPage>
  );
}
