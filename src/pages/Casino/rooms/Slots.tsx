import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { SLOT_REELS, SLOT_SYMBOLS, type SlotLine } from "../../../../server/shared/casino/index.js";
import { getMonster } from "../../../../server/shared/monster-bash/index.js";
import { MonsterSprite, Outcome, PanelHeading, PlayButton, PlayGate, RoomLayout, StakePicker } from "../parts";
import { type RoomProps, casinoPost, errorMessage, formatTickets, maxStake, PANEL, prefersReducedMotion, sleep } from "../wallet";

type Spin = { reels: string[]; line: SlotLine; multiplier: number; stake: number; payout: number; balance: number };
// What the machine is up to, which sets its lights: waiting, reels rolling, the
// last reel held back because the first two match, and how the spin came out.
type Mood = "idle" | "spinning" | "tease" | "lose" | "win" | "jackpot";

// The rat runs this machine: he scurries while it spins and jumps when it pays.
const MASCOT = "rat";
const CELL_PX = 72;
// Each reel shows the row above and below the payline too.
const ROWS = 3;
// When each reel stops (ms), and how long the last is held when the first two match.
const STOP_MS = [3200, 4900, 6600];
const TEASE_MS = 9600;
const CELLS_PER_SECOND = 13;
const BULBS = 12;
const COUNT_MS = 1400;

const anySymbol = () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)].id;
const anyRows = () => Array.from({ length: ROWS }, anySymbol);

// One reel: a strip with the rows it lands on at the top and the ones it
// started on at the bottom, slid down into view.
function Reel({ strip, spinId, ms, stopped, lit }: { strip: string[]; spinId: number; ms: number; stopped: boolean; lit: boolean }) {
  const [rolled, setRolled] = useState(true);
  useLayoutEffect(() => {
    if (spinId === 0) return;
    setRolled(false);
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setRolled(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [spinId]);

  return (
    <div
      className={`relative overflow-hidden rounded-md border-2 bg-gradient-to-b from-[#05020b] via-[#170d2c] to-[#05020b] ${
        lit ? "border-amber-300 shadow-[0_0_14px_#fbbf24]" : "border-purple-800"
      } ${stopped && spinId > 0 ? "slot-thunk" : ""}`}
      style={{ width: CELL_PX, height: CELL_PX * ROWS }}
    >
      <div
        style={{
          transform: `translateY(${rolled ? 0 : -(strip.length - ROWS) * CELL_PX}px)`,
          // Full speed nearly to the end, then a quick stop.
          transition: rolled && spinId > 0 ? `transform ${ms}ms cubic-bezier(0.33, 0.33, 0.2, 1)` : "none",
        }}
      >
        {strip.map((symbol, index) => (
          <div
            key={index}
            className={`flex items-center justify-center ${lit && stopped && index === 1 ? "casino-win" : ""}`}
            style={{ width: CELL_PX - 4, height: CELL_PX }}
          >
            <MonsterSprite monster={symbol} size={50} />
          </div>
        ))}
      </div>
      {/* The rows off the payline sit in shadow */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.7)_0%,transparent_32%,transparent_68%,rgba(0,0,0,0.7)_100%)]" />
    </div>
  );
}

function Bulbs({ offset = 0 }: { offset?: number }) {
  return (
    <div className="flex justify-between px-1" aria-hidden="true">
      {Array.from({ length: BULBS }, (_, i) => (
        <span key={i} className="slot-bulb" style={{ animationDelay: `${-((i + offset) % 4) * 0.25}s` }} />
      ))}
    </div>
  );
}

// Tickets raining down the machine after a win.
function TicketRain({ count }: { count: number }) {
  const drops = useMemo(
    () => Array.from({ length: count }, () => ({ left: Math.random() * 96, delay: Math.random() * 0.9, seconds: 1.3 + Math.random() * 1.2, turn: Math.random() * 360 })),
    [count]
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {drops.map((drop, i) => (
        <span
          key={i}
          className="slot-ticket"
          style={{ left: `${drop.left}%`, animationDelay: `${drop.delay}s`, animationDuration: `${drop.seconds}s`, rotate: `${drop.turn}deg` }}
        />
      ))}
    </div>
  );
}

// Counts up to the winnings while the lights go.
function CountUp({ to }: { to: number }) {
  const [shown, setShown] = useState(prefersReducedMotion() ? to : 0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const began = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const u = Math.min(1, (now - began) / COUNT_MS);
      setShown(Math.round(to * u));
      if (u < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{formatTickets(shown)}</>;
}

export default function Slots({ signedIn, wallet, walletFailed, retryWallet, setBalance }: RoomProps) {
  const [stake, setStake] = useState(5);
  const [strips, setStrips] = useState<string[][]>(() => Array.from({ length: SLOT_REELS }, anyRows));
  const [durations, setDurations] = useState(STOP_MS);
  const [spinId, setSpinId] = useState(0);
  const [stopped, setStopped] = useState(SLOT_REELS);
  const [mood, setMood] = useState<Mood>("idle");
  const [result, setResult] = useState<Spin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const spinning = mood === "spinning" || mood === "tease";
  const canSpin = Boolean(wallet) && !spinning && stake <= (wallet ? maxStake(wallet) : 0);

  const spin = async () => {
    if (!canSpin) return;
    setMood("spinning");
    setError(null);
    setResult(null);
    try {
      const spun = await casinoPost<Spin>("/slots/spin", { amount: stake });
      // The stake is gone now; the winnings land when the reels stop.
      setBalance(spun.balance - spun.payout);
      const still = prefersReducedMotion();
      // Two the same and the last reel is held back, to make them sweat.
      const tease = spun.reels[0] === spun.reels[1];
      const stops = tease ? [STOP_MS[0], STOP_MS[1], TEASE_MS] : STOP_MS;
      setDurations(stops);
      setStrips((current) =>
        spun.reels.map((symbol, reel) => {
          const landing = [anySymbol(), symbol, anySymbol()];
          if (still) return landing;
          const rolling = Array.from({ length: Math.round((stops[reel] / 1000) * CELLS_PER_SECOND) }, anySymbol);
          return [...landing, ...rolling, ...current[reel].slice(0, ROWS)];
        })
      );
      setStopped(still ? SLOT_REELS : 0);
      setSpinId((id) => id + 1);
      if (!still) {
        let clock = 0;
        for (let reel = 0; reel < SLOT_REELS; reel++) {
          await sleep(stops[reel] - clock);
          clock = stops[reel];
          setStopped(reel + 1);
          if (reel === 1 && tease) setMood("tease");
        }
        await sleep(250);
      }
      setBalance(spun.balance);
      setResult(spun);
      setMood(spun.line === "three" ? "jackpot" : spun.line === "pair" ? "win" : "lose");
    } catch (reason) {
      setError(errorMessage(reason, "Could not spin. Try again."));
      setMood("idle");
    }
  };

  const litReels = result?.line === "three" ? SLOT_REELS : result?.line === "pair" ? 2 : 0;
  const won = mood === "win" || mood === "jackpot";

  const stage = (
    <section className={`${PANEL} relative flex flex-col items-center gap-4 overflow-hidden px-3 py-6 sm:py-8`}>
      <div className={`slot-machine relative ${mood === "jackpot" ? "slot-shake" : ""}`} data-mood={mood}>
        {/* The rat, up on the machine */}
        <div className={`absolute -top-9 left-6 z-10 ${spinning ? "slot-scurry" : won ? "slot-hop" : ""}`} aria-hidden="true">
          <MonsterSprite monster={MASCOT} size={44} walking={spinning || won} />
        </div>
        <div className="rounded-t-2xl border-4 border-b-0 border-amber-600 bg-gradient-to-b from-red-800 to-red-950 px-3 pb-2 pt-2">
          <Bulbs />
          <p className="slot-marquee py-1 text-center font-zombie text-2xl tracking-widest">Lucky Rat</p>
          <Bulbs offset={2} />
        </div>
        <div className="flex items-stretch">
          <div className="relative rounded-bl-2xl border-4 border-amber-600 bg-gradient-to-b from-purple-950 to-[#12081f] p-3">
            <div className="relative flex gap-1.5" aria-hidden="true">
              {strips.map((strip, reel) => (
                <Reel key={reel} strip={strip} spinId={spinId} ms={durations[reel]} stopped={stopped > reel} lit={reel < litReels} />
              ))}
              {/* The payline */}
              <div className="slot-payline pointer-events-none absolute inset-x-[-10px] top-1/2 h-0.5 -translate-y-1/2" />
              {won && result && (
                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
                  <span className="slot-banner font-zombie text-4xl tracking-wider">{mood === "jackpot" ? "Jackpot!" : "Winner!"}</span>
                  <span className="slot-banner rounded bg-black/70 px-2 text-2xl font-bold text-amber-200 tabular-nums">
                    +<CountUp to={result.payout} />
                  </span>
                </div>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between rounded bg-black/60 px-2 py-1 text-xs font-bold uppercase tracking-widest text-amber-200/90">
              <span>Bet {stake}</span>
              <span className={mood === "tease" ? "animate-pulse text-red-400" : ""}>
                {mood === "tease" ? "Two the same…" : spinning ? "Rolling" : won ? `Pays ${result?.multiplier}x` : "Pull the lever"}
              </span>
            </div>
          </div>
          {/* The lever: pulling it spins too */}
          <button
            type="button"
            onClick={spin}
            disabled={!canSpin}
            aria-label="Pull the lever"
            className="relative w-11 rounded-br-2xl border-4 border-l-0 border-amber-600 bg-gradient-to-b from-red-900 to-red-950 disabled:cursor-default"
          >
            <span key={spinId} className={`slot-lever ${spinId > 0 ? "slot-lever-pull" : ""}`}>
              <span className="slot-lever-knob" />
            </span>
          </button>
        </div>
        {won && <TicketRain key={spinId} count={mood === "jackpot" ? 60 : 24} />}
      </div>
      <div className="min-h-[1.75rem] text-center">
        {result ? (
          <Outcome payout={result.payout} stake={result.stake}>
            {result.reels.map((symbol) => getMonster(symbol).name).join(", ")}.
            {result.line && ` Pays ${result.multiplier}x.`}
          </Outcome>
        ) : (
          <p className="text-sm text-purple-200/70">
            {mood === "tease" ? "The rat holds his breath…" : spinning ? "Round and round they go…" : "Match the first two reels on the line, or all three."}
          </p>
        )}
      </div>
    </section>
  );

  const controls = (
    <>
      <PanelHeading wallet={wallet}>Bet</PanelHeading>
      <PlayGate signedIn={signedIn} wallet={wallet} walletFailed={walletFailed} retryWallet={retryWallet}>
        {(ready) => (
          <>
            <StakePicker wallet={ready} stake={stake} onChange={setStake} disabled={spinning} />
            <PlayButton disabled={!canSpin} onClick={spin}>
              {spinning ? "Spinning…" : `Spin for ${stake}`}
            </PlayButton>
          </>
        )}
      </PlayGate>
      {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
    </>
  );

  const rules = (
    <>
      <h2 className="text-lg font-bold text-orange-50">Payouts</h2>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-purple-200/60">
            <th className="pb-1 text-left font-normal">Monster</th>
            <th className="pb-1 text-right font-normal">First two</th>
            <th className="pb-1 text-right font-normal">All three</th>
          </tr>
        </thead>
        <tbody>
          {[...SLOT_SYMBOLS].reverse().map((symbol) => (
            <tr key={symbol.id} className="border-t border-purple-900/40">
              <td className="py-1">
                <span className="flex items-center gap-2 text-orange-100/90">
                  <MonsterSprite monster={symbol.monster} size={24} />
                  {getMonster(symbol.monster).name}
                </span>
              </td>
              <td className="py-1 text-right font-semibold text-orange-50 tabular-nums">{symbol.pair}x</td>
              <td className="py-1 text-right font-semibold text-orange-50 tabular-nums">{symbol.three}x</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-purple-200/60">
        Only the middle row counts. A win pays your bet times the number shown. Rarer monsters pay more.
      </p>
    </>
  );

  return <RoomLayout stage={stage} controls={controls} rules={rules} />;
}
