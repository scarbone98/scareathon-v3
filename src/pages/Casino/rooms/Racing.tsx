import { useEffect, useRef, useState } from "react";
import { RACE_FIELD, RACE_LAPS, racePayout } from "../../../../server/shared/casino/index.js";
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
const SPRITE_PX = 30;
// The wolf runs the track: he calls every race.
const MASCOT = "werewolf";
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

// How much of the race (0 to 1) a lane has run `seconds` in, when it finishes
// in `finish`. Each lane surges and fades a little differently, so the lead
// changes hands, but nobody goes backwards and everyone arrives on time.
function progress(lane: number, seconds: number, finish: number) {
  const u = Math.min(1, Math.max(0, seconds / finish));
  const surges = 1 + (lane % 3) * 0.5;
  return u + 0.06 * Math.sin(Math.PI * u) * Math.sin(2 * Math.PI * surges * u + lane * 1.7);
}

// Laps run so far. Over the line, a monster trots on a little and pulls up,
// the winner furthest along, so the field doesn't pile up on the finish.
function lapsRun(lane: number, clock: number, start: Start) {
  const finish = start.times[lane];
  if (clock < finish) return RACE_LAPS * progress(lane, clock, finish);
  const place = start.order.indexOf(lane);
  return RACE_LAPS + Math.min(1, (clock - finish) / 1.5) * (0.14 - place * 0.02);
}

// The track, in a 100 by 56 picture: two straights joined by half circles,
// run anticlockwise from the middle of the bottom straight. Lane 1 is inside.
const TRACK = { width: 100, height: 56, left: 28, right: 72, middle: 28, inner: 12, lane: 2.6 };
const laneRadius = (lane: number) => TRACK.inner + lane * TRACK.lane;

// Where a lane is after `laps` (any number, whole laps wrap), and whether it's
// heading left (sprites are drawn facing right).
function trackPoint(lane: number, laps: number) {
  const radius = laneRadius(lane);
  const straight = TRACK.right - TRACK.left;
  const bend = Math.PI * radius;
  const lap = 2 * straight + 2 * bend;
  let along = (((laps % 1) + 1) % 1) * lap;
  if (along < straight / 2) return { x: 50 + along, y: TRACK.middle + radius, left: false };
  along -= straight / 2;
  if (along < bend) {
    const angle = Math.PI / 2 - (along / bend) * Math.PI;
    return { x: TRACK.right + radius * Math.cos(angle), y: TRACK.middle + radius * Math.sin(angle), left: angle < 0 };
  }
  along -= bend;
  if (along < straight) return { x: TRACK.right - along, y: TRACK.middle - radius, left: true };
  along -= straight;
  if (along < bend) {
    const angle = -Math.PI / 2 - (along / bend) * Math.PI;
    return { x: TRACK.left + radius * Math.cos(angle), y: TRACK.middle + radius * Math.sin(angle), left: angle > -Math.PI };
  }
  return { x: TRACK.left + (along - bend), y: TRACK.middle + radius, left: false };
}

// The outline of the track at a given radius, for drawing its edges and lanes.
function ringPath(radius: number) {
  const { left, right, middle } = TRACK;
  return `M${left} ${middle + radius} L${right} ${middle + radius} A${radius} ${radius} 0 0 0 ${right} ${middle - radius} L${left} ${middle - radius} A${radius} ${radius} 0 0 0 ${left} ${middle + radius} Z`;
}

const TRACK_INSIDE = TRACK.inner - TRACK.lane / 2;
const TRACK_OUTSIDE = laneRadius(RACE_FIELD - 1) + TRACK.lane / 2;

function Track({ race, clock, pick }: { race: Race; clock: number; pick: number | null }) {
  const { start } = race;
  const laps = race.runners.map((_, lane) => (start ? lapsRun(lane, clock, start) : -0.012));
  const lead = Math.max(...laps);
  const lapNow = Math.min(RACE_LAPS, Math.floor(Math.max(0, lead)) + 1);
  // Who's where right now, front runner first.
  const standing = race.runners.map((_, lane) => lane).sort((a, b) => laps[b] - laps[a]);
  return (
    <div aria-hidden="true">
      <div className="relative mx-auto w-full max-w-3xl lg:max-w-[calc((100vh-23rem)*1.786)]" style={{ aspectRatio: `${TRACK.width} / ${TRACK.height}` }}>
        <svg viewBox={`0 0 ${TRACK.width} ${TRACK.height}`} className="absolute inset-0 h-full w-full">
          <rect width={TRACK.width} height={TRACK.height} rx="3" fill="#0b0617" />
          <path d={ringPath(TRACK_OUTSIDE)} fill="#4a2f1d" stroke="#e7d7b0" strokeWidth="0.5" />
          <path d={ringPath(TRACK_INSIDE)} fill="#12301f" stroke="#e7d7b0" strokeWidth="0.5" />
          {race.runners.slice(1).map((_, lane) => (
            <path key={lane} d={ringPath(laneRadius(lane) + TRACK.lane / 2)} fill="none" stroke="#e7d7b0" strokeOpacity="0.18" strokeWidth="0.2" strokeDasharray="1.2 1.2" />
          ))}
          {/* The start and finish line, chequered */}
          <line x1="50" x2="50" y1={TRACK.middle + TRACK_INSIDE} y2={TRACK.middle + TRACK_OUTSIDE} stroke="#fff" strokeWidth="1.2" strokeDasharray="1.3 1.3" />
          <line x1="50.6" x2="50.6" y1={TRACK.middle + TRACK_INSIDE + 1.3} y2={TRACK.middle + TRACK_OUTSIDE} stroke="#111" strokeWidth="1.2" strokeDasharray="1.3 1.3" strokeOpacity="0.6" />
          <text x="50" y={TRACK.middle - 1} textAnchor="middle" fontSize="4.2" fontWeight="700" fill="#e7d7b0" fillOpacity="0.85">
            {start ? (lead >= RACE_LAPS ? "FINISH" : `LAP ${lapNow} OF ${RACE_LAPS}`) : "AT THE LINE"}
          </text>
          <text x="50" y={TRACK.middle + 4.5} textAnchor="middle" fontSize="2.6" fill="#e7d7b0" fillOpacity="0.5">
            WOLF'S RUN
          </text>
        </svg>
        {race.runners.map((runner, lane) => {
          const at = trackPoint(lane, laps[lane]);
          const done = start !== null && clock >= start.times[lane] + 1.5;
          return (
            <div
              key={lane}
              className="absolute"
              style={{ left: `${at.x}%`, top: `${(at.y / TRACK.height) * 100}%`, zIndex: Math.round(at.y * 10), transform: "translate(-50%, -82%)" }}
            >
              {/* Bigger on a big screen, where the track is */}
              <div className="origin-bottom md:scale-150 [@media(min-width:1024px)_and_(min-height:900px)]:scale-[2.2]">
              <div style={{ transform: at.left ? "scaleX(-1)" : undefined }}>
                <MonsterSprite monster={runner.monster} size={SPRITE_PX} walking={start !== null && !done} />
              </div>
              </div>
              <span
                className={`absolute -top-2 left-1/2 -translate-x-1/2 rounded-full px-1 text-[0.6rem] font-bold leading-3 text-black ${pick === lane ? "ring-2 ring-white" : ""}`}
                style={{ background: LANE_COLORS[lane] }}
              >
                {lane + 1}
              </span>
            </div>
          );
        })}
      </div>
      <ol className="mt-2 flex items-center justify-center gap-1 sm:gap-2 lg:[zoom:1.4]">
        {standing.map((lane, place) => (
          <li
            key={lane}
            className={`flex items-center gap-1 rounded border px-1 py-0.5 text-[0.65rem] font-bold tabular-nums transition ${pick === lane ? "bg-white/15" : "bg-black/40"}`}
            style={{ borderColor: LANE_COLORS[lane], color: place === 0 ? "#fcd34d" : "#d8ccf0" }}
          >
            {PLACES[place]}
            <MonsterSprite monster={race.runners[lane].monster} size={20} />
          </li>
        ))}
      </ol>
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
    <section ref={track} className={`${PANEL} flex flex-col gap-3 p-3 sm:p-4 lg:min-h-[calc(100vh-12.5rem)] lg:justify-center`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <MonsterSprite monster={MASCOT} size={40} walking={phase === "running"} />
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
            "And they're off! Three laps."
          ) : phase === "result" ? (
            "Next race coming up."
          ) : (
            "Finding the next race…"
          )}
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
      {race ? <Track race={race} clock={clock} pick={myBet ? myBet.lane : pick} /> : <div className="mx-auto w-full max-w-3xl rounded-md bg-[#0b0617] lg:max-w-[calc((100vh-23rem)*1.786)]" style={{ aspectRatio: "100 / 56" }} />}
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
        The Wolf runs races around the clock, three laps each, and everyone watches the same one. Each has a new field: the favourites pay less and
        the long shots pay more. A monster that pays 4.0x turns 10 tickets into 40 if it comes first.
      </p>
      <p className="mt-2 text-xs text-purple-200/60">One bet a race, placed before the off. Only first place pays.</p>
    </>
  );

  return <RoomLayout stage={stage} controls={controls} rules={rules} />;
}
