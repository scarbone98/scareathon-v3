import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getMonster,
  type Monster,
  type MonsterMove,
} from "../../../server/shared/monster-bash/index.js";
import Arena from "./arena/Arena";
import { connectLocalFeed } from "./feed/localFeed";
import { connectSocketFeed } from "./feed/socketFeed";
import { usePlayerAccount, useSession } from "./account";
import BetSlip from "./BetSlip";
import Chat from "./Chat";
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

function TaleOfTheTape({ match, className = "" }: { match: LiveMatch; className?: string }) {
  const [a, b] = match.fighters.map(getMonster) as [Monster, Monster];
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const both = (pick: (monster: Monster) => string): [string, string] => [pick(a), pick(b)];

  return (
    <section className={`rounded-lg border border-purple-900/60 bg-black/60 p-4 ${className}`}>
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

function RecentResults({ history, className = "" }: { history: { id: string; fighters: [string, string]; winner: 0 | 1 }[]; className?: string }) {
  return (
    <section className={`rounded-lg border border-purple-900/60 bg-black/60 p-4 ${className}`}>
      <h2 className="text-lg font-bold text-orange-50">Recent bouts</h2>
      {history.length === 0 ? (
        <p className="mt-2 text-sm text-purple-200/70">Results show up here after each bout.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {history.map((bout) => {
            const [a, b] = bout.fighters.map((id) => getMonster(id).name);
            return (
              // Fixed columns keep every "vs" in one line regardless of name length.
              <li key={bout.id} className="grid grid-cols-[minmax(0,1fr),auto,minmax(0,1fr)] items-baseline gap-3">
                <span className={`truncate ${bout.winner === 0 ? "font-bold text-orange-50" : "text-purple-200/60"}`}>
                  {a}
                  {bout.winner === 0 && <span className="sr-only"> (winner)</span>}
                </span>
                <span className="text-xs text-purple-200/50">vs</span>
                <span className={`truncate text-right ${bout.winner === 1 ? "font-bold text-orange-50" : "text-purple-200/60"}`}>
                  {b}
                  {bout.winner === 1 && <span className="sr-only"> (winner)</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

type Layout = "phone" | "desktop" | "wide";

function useLayout(): Layout {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const wide = useMediaQuery("(min-width: 1536px)");
  return wide ? "wide" : desktop ? "desktop" : "phone";
}

// The arena is 16:9; cap its width so the whole thing fits on screen under
// the casino's header, this room's and the matchup bar instead of pushing past
// the fold.
const ARENA_FIT_STYLE = { maxWidth: "calc((100vh - 20rem) * 16 / 9)" };

type PanelTab = "bet" | "stats" | "odds" | "chat" | "results";

const PANEL_TAB_LABELS: Record<PanelTab, string> = {
  bet: "Bet",
  stats: "Stats",
  odds: "Odds",
  chat: "Chat",
  results: "Results",
};

// On phones the panels share one spot under the arena, so the bet slip and
// the stats are both a tap away without scrolling past the chat.
function PanelTabs({ tabs, panels }: { tabs: PanelTab[]; panels: Partial<Record<PanelTab, React.ReactNode>> }) {
  const [active, setActive] = useState<PanelTab>(tabs[0]);
  const current = tabs.includes(active) ? active : tabs[0];
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Monster Bash panels" className="grid gap-1 rounded-lg border border-purple-900/60 bg-black/60 p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`mb-tab-${tab}`}
            aria-selected={tab === current}
            aria-controls={`mb-panel-${tab}`}
            onClick={() => setActive(tab)}
            className={`rounded-md px-1 py-2 text-sm font-bold transition ${
              tab === current ? "bg-purple-800 text-white" : "text-purple-200/70 hover:text-orange-50"
            }`}
          >
            {PANEL_TAB_LABELS[tab]}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`mb-panel-${current}`} aria-labelledby={`mb-tab-${current}`}>
        {panels[current]}
      </div>
    </div>
  );
}

// The casino's fight room (Casino/page.tsx is the page around it).
export default function MonsterBash() {
  const [store] = useState(() => new MatchStore());
  const { match, history, viewers, connection, chat, settledMatchId } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot
  );
  const { tick, phase } = usePlaybackClock(store);
  const layout = useLayout();
  // `?preview=local` runs bouts in the browser, for working on the page offline.
  const [localPreview] = useState(() => new URLSearchParams(window.location.search).get("preview") === "local");
  const session = useSession();
  const signedIn = Boolean(session);
  const { account, setAccount, failed: accountFailed, refresh: refreshAccount } = usePlayerAccount(signedIn && !localPreview, match?.id ?? null, settledMatchId);

  useEffect(
    () => (localPreview ? connectLocalFeed(store) : connectSocketFeed(store)),
    [store, localPreview]
  );
  const reconnecting = connection === "reconnecting";
  const secondsToClose = match?.bettingClosesAt
    ? Math.max(0, Math.ceil((match.bettingClosesAt - (Date.now() + store.clockOffsetMs)) / 1000))
    : 0;

  const betSlip = match && !localPreview && (
    <BetSlip
      match={match}
      phase={phase}
      secondsToClose={secondsToClose}
      signedIn={signedIn}
      account={account}
      accountFailed={accountFailed}
      onRetry={refreshAccount}
      onBetPlaced={setAccount}
    />
  );
  const chatPanel = (className: string) => !localPreview && <Chat messages={chat} signedIn={signedIn} className={className} />;
  const matchup = match && <Matchup match={match} tick={tick} phase={phase} />;
  const oddsChart = match && <OddsChart match={match} playbackTick={tick} />;
  const tape = match && <TaleOfTheTape match={match} />;
  const arena = (
    <div className="mx-auto w-full" style={layout === "phone" ? undefined : ARENA_FIT_STYLE}>
      <Arena store={store} />
    </div>
  );

  let body: React.ReactNode;
  if (layout === "wide") {
    // Stats on the left, the fight in the middle, betting and chat on the right.
    body = (
      <div className="grid grid-cols-[300px,minmax(0,1fr),360px] items-start gap-4">
        <aside className="flex flex-col gap-4">
          {tape}
          <RecentResults history={history} />
        </aside>
        <div className="flex min-w-0 flex-col gap-4">
          {matchup}
          {arena}
          {oddsChart}
        </div>
        <aside className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col gap-4">
          {betSlip}
          {chatPanel("min-h-[16rem] flex-1")}
        </aside>
      </div>
    );
  } else if (layout === "desktop") {
    body = (
      <div className="grid grid-cols-[minmax(0,1fr),340px] items-start gap-4">
        <div className="flex min-w-0 flex-col gap-4">
          {matchup}
          {arena}
          {oddsChart}
          <div className="grid grid-cols-2 gap-4">
            {tape}
            <RecentResults history={history} />
          </div>
        </div>
        <aside className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col gap-4">
          {betSlip}
          {chatPanel("min-h-[16rem] flex-1")}
        </aside>
      </div>
    );
  } else {
    const tabs: PanelTab[] = localPreview ? ["stats", "odds", "results"] : ["bet", "stats", "odds", "chat", "results"];
    body = (
      <div className="flex flex-col gap-3">
        {matchup}
        {arena}
        <PanelTabs
          tabs={tabs}
          panels={{
            bet: betSlip,
            stats: tape,
            odds: oddsChart,
            chat: chatPanel("h-96"),
            results: <RecentResults history={history} />,
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-zombie text-2xl tracking-wide text-red-500 md:text-3xl">Monster Bash</h2>
          <p className="hidden text-sm text-purple-200/70 sm:block">
            Monsters fight it out around the clock. Bet your coins and watch the odds swing live.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
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

      {body}
      {localPreview && (
        <p className="text-xs text-purple-200/50">
          Local preview: bouts are simulated in your browser, not the live arena. Betting and chat are off.
        </p>
      )}
    </div>
  );
}
