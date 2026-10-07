import { useEffect, useRef, useState } from "react";
import { racePayout } from "../../../../server/shared/casino/index.js";
import { getMonster } from "../../../../server/shared/monster-bash/index.js";
import { MonsterSprite, Outcome, PanelHeading, PlayButton, PlayGate, RoomLayout, StakePicker } from "../parts";
import { type RoomProps, casinoGet, casinoPost, errorMessage, formatTickets, maxStake, PANEL } from "../wallet";

type Start = { order: number[]; winner: number; times: number[]; startedAt: number };
type Race = {
  id: string;
  runners: { monster: string; odds: number }[];
  bettingClosesAt: number;
  // How many players have backed each lane.
  counts: number[];
  // Set once betting closes: the race is run then, and shown from `startedAt`.
  start: Start | null;
  settled: boolean;
};
type Bet = { raceId: string; lane: number; amount: number; odds: number };
type FeedMessage =
  | { type: "race"; race: Race; now: number }
  | ({ type: "start"; id: string; now: number } & Start)
  | { type: "bets"; id: string; counts: number[] }
  | { type: "finished"; id: string }
  | { type: "viewers"; count: number };
type Phase = "waiting" | "betting" | "running" | "result";

const LANE_COLORS = ["#d95926", "#3987e5", "#3fa34d", "#c9a227", "#b04fc4", "#d9d9d9"];
const PLACES = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
const SPRITE_PX = 40;
// How long the finish stays on screen before the result is called.
const LINGER_SECONDS = 0.4;
const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 15000;
const PHASE_LABELS: Record<Phase, string> = { waiting: "Warming up", betting: "Bets open", running: "Live", result: "Final" };

function raceSocketUrl() {
  const base = import.meta.env.VITE_BASE_URL || window.location.origin;
  const url = new URL("casino/racing/ws", base.endsWith("/") ? base : `${base}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

// Connects to the live races, reconnecting with backoff. Every (re)connect
// starts with the race that's on, so a dropped connection just picks it back
// up. Returns a disconnect function.
function connectRaceFeed(onMessage: (message: FeedMessage) => void, onLive: (live: boolean) => void) {
  let socket: WebSocket | null = null;
  let retryMs = MIN_RETRY_MS;
  let retryTimer: number | undefined;
  let closed = false;

  const connect = () => {
    socket = new WebSocket(raceSocketUrl());
    socket.onopen = () => {
      retryMs = MIN_RETRY_MS;
      onLive(true);
    };
    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data) as FeedMessage);
      } catch (error) {
        console.error("Bad race message", error);
      }
    };
    socket.onclose = () => {
      if (closed) return;
      onLive(false);
      retryTimer = window.setTimeout(connect, retryMs);
      retryMs = Math.min(MAX_RETRY_MS, retryMs * 2);
    };
  };

  // Browsers throttle background tabs; reconnect straight away on return
  // instead of waiting out a long backoff.
  const onVisible = () => {
    if (document.visibilityState !== "visible" || socket?.readyState !== WebSocket.CLOSED) return;
    window.clearTimeout(retryTimer);
    retryMs = MIN_RETRY_MS;
    connect();
  };

  connect();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    closed = true;
    window.clearTimeout(retryTimer);
    document.removeEventListener("visibilitychange", onVisible);
    socket?.close();
  };
}

// How far down the track (0 to 1) a lane is `seconds` into a race it finishes
// in `finish`. Each lane surges and fades a little differently, but never
// goes backwards and always arrives on time.
function progress(lane: number, seconds: number, finish: number) {
  const u = Math.min(1, Math.max(0, seconds / finish));
  const surges = 1 + (lane % 3) * 0.5;
  return u + 0.05 * Math.sin(Math.PI * u) * Math.sin(2 * Math.PI * surges * u + lane * 1.7);
}

function Track({ race, clock, pick }: { race: Race; clock: number; pick: number | null }) {
  const { start } = race;
  return (
    <div className="flex flex-col gap-1 rounded-md bg-[#0b0617] p-2" aria-hidden="true">
      {race.runners.map((runner, lane) => {
        const at = start ? progress(lane, clock, start.times[lane]) : 0;
        const place = start && clock >= start.times[lane] ? start.order.indexOf(lane) : -1;
        return (
          <div key={lane} className={`flex items-center gap-2 rounded ${pick === lane ? "bg-white/10" : ""}`}>
            <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums" style={{ color: LANE_COLORS[lane] }}>
              {lane + 1}
            </span>
            <div className="relative h-11 min-w-0 flex-1 border-b border-dashed border-purple-900/70">
              {/* The finish line, a sprite's width in from the end */}
              <div className="absolute inset-y-0 w-1 bg-[repeating-linear-gradient(0deg,#fff_0_4px,#000_4px_8px)] opacity-70" style={{ right: SPRITE_PX }} />
              <div className="absolute bottom-0" style={{ left: `calc((100% - ${SPRITE_PX * 2}px) * ${at})` }}>
                <MonsterSprite monster={runner.monster} size={SPRITE_PX} walking={start !== null && place < 0} />
              </div>
              {place >= 0 && (
                <span className={`absolute right-0 top-1/2 -translate-y-1/2 text-xs font-bold ${place === 0 ? "text-amber-300" : "text-purple-200/70"}`}>
                  {PLACES[place]}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Racing({ signedIn, wallet, walletFailed, retryWallet, setBalance }: RoomProps) {
  const [race, setRace] = useState<Race | null>(null);
  const [live, setLive] = useState(true);
  const [viewers, setViewers] = useState<number | null>(null);
  const [bet, setBet] = useState<Bet | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [stake, setStake] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // The server's clock minus this one's, so countdowns and the race line up for everyone.
  const clockOffset = useRef(0);
  const track = useRef<HTMLElement>(null);

  useEffect(
    () =>
      connectRaceFeed((message) => {
        if (message.type === "race") {
          clockOffset.current = message.now - Date.now();
          setRace(message.race);
        } else if (message.type === "start") {
          clockOffset.current = message.now - Date.now();
          const { order, winner, times, startedAt } = message;
          setRace((current) => (current?.id === message.id ? { ...current, start: { order, winner, times, startedAt } } : current));
        } else if (message.type === "bets") {
          setRace((current) => (current?.id === message.id ? { ...current, counts: message.counts } : current));
        } else if (message.type === "finished") {
          setRace((current) => (current?.id === message.id ? { ...current, settled: true } : current));
        } else if (message.type === "viewers") {
          setViewers(message.count);
        }
      }, setLive),
    []
  );

  // A new race: the last one's pick and complaints don't carry over.
  const raceId = race?.id ?? null;
  useEffect(() => {
    setPick(null);
    setError(null);
  }, [raceId]);

  // A bet placed before a reload (or in another tab) on the race that's on.
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    casinoGet<{ bet: Bet | null }>("/racing/bet")
      .then((saved) => active && saved.bet && setBet((current) => current ?? saved.bet))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [signedIn]);

  // Winnings are paid when the race has been shown: pick up the new balance.
  const myBet = bet && race && bet.raceId === race.id ? bet : null;
  const paid = Boolean(myBet && race?.settled);
  useEffect(() => {
    if (paid) retryWallet();
  }, [paid, retryWallet]);

  // Every frame while they're running, a few times a second for the countdown.
  const racing = Boolean(race?.start);
  useEffect(() => {
    if (!racing) {
      const id = window.setInterval(() => setNow(Date.now()), 250);
      return () => window.clearInterval(id);
    }
    let frame = requestAnimationFrame(function step() {
      setNow(Date.now());
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [racing]);

  const serverNow = now + clockOffset.current;
  const clock = race?.start ? (serverNow - race.start.startedAt) / 1000 : 0;
  const secondsToClose = race ? Math.max(0, Math.ceil((race.bettingClosesAt - serverNow) / 1000)) : 0;
  const phase: Phase = !race ? "waiting" : !race.start ? "betting" : clock < Math.max(...race.start.times) + LINGER_SECONDS ? "running" : "result";
  const bettingOpen = phase === "betting" && secondsToClose > 0;
  const name = (lane: number) => (race ? getMonster(race.runners[lane].monster).name : "");

  const placeBet = async () => {
    if (!race || pick === null) return;
    setBusy(true);
    setError(null);
    try {
      const placed = await casinoPost<{ bet: Bet; balance: number }>("/racing/bet", { raceId: race.id, lane: pick, amount: stake });
      setBalance(placed.balance);
      setBet(placed.bet);
      track.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (reason) {
      setError(errorMessage(reason, "Could not place your bet. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const finish = race?.start && phase === "result" ? race.start : null;
  const stage = (
    <section ref={track} className={`${PANEL} flex flex-col gap-3 p-3 sm:p-4`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-purple-200/80">
          {phase === "betting" ? (
            bettingOpen ? (
              <>
                They're off in <strong className="text-orange-50 tabular-nums">{secondsToClose}s</strong>
              </>
            ) : (
              "No more bets…"
            )
          ) : phase === "running" ? (
            "And they're off…"
          ) : phase === "result" ? (
            "Next race coming up."
          ) : (
            "Finding the next race…"
          )}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          {viewers !== null && (
            <span className="text-sm text-purple-200/70">
              <strong className="text-orange-50">{viewers}</strong> watching
            </span>
          )}
          <span
            className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest ${
              !live
                ? "border-amber-600 bg-amber-950/40 text-amber-200"
                : phase === "running"
                  ? "border-red-500 bg-red-950/60 text-red-300"
                  : "border-purple-700 bg-purple-950/40 text-purple-200"
            }`}
          >
            {phase === "running" && live && <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />}
            {live ? PHASE_LABELS[phase] : "Reconnecting"}
          </span>
        </div>
      </div>
      {race ? <Track race={race} clock={clock} pick={myBet ? myBet.lane : pick} /> : <div className="h-[19rem] rounded-md bg-[#0b0617]" />}
      <div className="min-h-[1.75rem]">
        {race &&
          finish &&
          (myBet ? (
            <Outcome payout={finish.winner === myBet.lane ? racePayout(myBet.amount, myBet.odds) : 0} stake={myBet.amount}>
              {name(finish.winner)} wins{finish.winner === myBet.lane ? "!" : `. ${name(myBet.lane)} came in ${PLACES[finish.order.indexOf(myBet.lane)]}.`}
            </Outcome>
          ) : (
            <p className="text-base text-orange-100/90" role="status">
              {name(finish.winner)} wins, paying {race.runners[finish.winner].odds.toFixed(1)}x.
            </p>
          ))}
      </div>
    </section>
  );

  const shownPick = myBet ? myBet.lane : pick;
  const controls = (
    <>
      <PanelHeading wallet={wallet}>{myBet ? "Your bet" : "Pick a monster"}</PanelHeading>
      {race && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pick a monster">
          {race.runners.map((runner, lane) => {
            const selected = shownPick === lane;
            return (
              <button
                key={lane}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!bettingOpen || myBet !== null || busy}
                onClick={() => setPick(lane)}
                className={`flex items-center gap-2 rounded-md border-2 px-2 py-1.5 text-left transition disabled:cursor-default ${
                  selected ? "bg-white/10" : "border-purple-900/70 enabled:hover:border-purple-500"
                }`}
                style={selected ? { borderColor: LANE_COLORS[lane] } : undefined}
              >
                <MonsterSprite monster={runner.monster} size={32} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-orange-50">
                    <span style={{ color: LANE_COLORS[lane] }}>{lane + 1}</span> {getMonster(runner.monster).name}
                  </span>
                  <span className="block text-xs text-purple-200/70 tabular-nums">
                    Pays {runner.odds.toFixed(1)}x
                    {race.counts[lane] > 0 && ` · ${race.counts[lane]} ${race.counts[lane] === 1 ? "bet" : "bets"}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <PlayGate signedIn={signedIn} wallet={wallet} walletFailed={walletFailed} retryWallet={retryWallet}>
        {(ready) =>
          race && myBet ? (
            <p className="text-orange-100/90">
              You bet <strong className="text-orange-50">{formatTickets(myBet.amount)}</strong> on{" "}
              <strong style={{ color: LANE_COLORS[myBet.lane] }}>{name(myBet.lane)}</strong>. Pays{" "}
              <strong className="text-orange-50">{formatTickets(racePayout(myBet.amount, myBet.odds))}</strong> if it comes first.
            </p>
          ) : !race || !bettingOpen ? (
            <p className="text-sm text-purple-200/70">
              {phase === "waiting" ? "Waiting for the next race." : "Betting is closed for this race. It opens again when the next one is announced."}
            </p>
          ) : (
            <>
              <StakePicker wallet={ready} stake={stake} onChange={setStake} disabled={busy} />
              <PlayButton disabled={busy || pick === null || stake > maxStake(ready)} onClick={placeBet}>
                {pick === null
                  ? "Pick a monster"
                  : `Bet ${stake} on ${name(pick)} (pays ${formatTickets(racePayout(stake, race.runners[pick].odds))})`}
              </PlayButton>
            </>
          )
        }
      </PlayGate>
      {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
    </>
  );

  const rules = (
    <>
      <h2 className="text-lg font-bold text-orange-50">How it works</h2>
      <p className="mt-2 text-sm text-orange-100/90">
        Races run around the clock, one after another, and everyone watches the same one. Each has a new field: the favourites pay less and
        the long shots pay more. A monster that pays 4.0x turns 10 tickets into 40 if it comes first.
      </p>
      <p className="mt-2 text-xs text-purple-200/60">One bet a race, placed before the off. Only first place pays.</p>
    </>
  );

  return <RoomLayout stage={stage} controls={controls} rules={rules} />;
}
