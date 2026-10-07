import { useRef, useState } from "react";
import {
  ROULETTE_BETS,
  ROULETTE_MAX_BETS,
  ROULETTE_WHEEL,
  rouletteBetKey,
  rouletteColor,
  type RouletteBet,
  type RouletteBetType,
  type RouletteColor,
} from "../../../../server/shared/casino/index.js";
import { Outcome, PanelHeading, PlayButton, PlayGate, RoomLayout } from "../parts";
import { type RoomProps, casinoPost, errorMessage, formatTickets, maxStake, PANEL, prefersReducedMotion, sleep } from "../wallet";

type Spin = { number: number; color: RouletteColor; bets: (RouletteBet & { payout: number })[]; stake: number; payout: number; balance: number };
type Spot = Pick<RouletteBet, "type" | "value">;

const CHIPS = [1, 5, 10, 25];
const SPIN_MS = 4200;
const POCKET_DEG = 360 / ROULETTE_WHEEL.length;
const COLOR_FILL: Record<RouletteColor, string> = { green: "#15803d", red: "#b91c1c", black: "#18181b" };
const COLOR_CLASS: Record<RouletteColor, string> = { green: "bg-green-700", red: "bg-red-700", black: "bg-zinc-900" };

const OUTSIDE: { type: RouletteBetType; label: string }[] = [
  { type: "low", label: "1 to 18" },
  { type: "even", label: "Even" },
  { type: "red", label: "Red" },
  { type: "black", label: "Black" },
  { type: "odd", label: "Odd" },
  { type: "high", label: "19 to 36" },
];
const DOZENS = ["1 to 12", "13 to 24", "25 to 36"];

function spotLabel(spot: Spot) {
  if (spot.type === "straight") return String(spot.value);
  if (spot.type === "dozen") return DOZENS[spot.value ?? 0];
  if (spot.type === "column") return `Column ${(spot.value ?? 0) + 1}`;
  return OUTSIDE.find((bet) => bet.type === spot.type)?.label ?? spot.type;
}

// A point on the wheel's face, `deg` clockwise from the top.
function onWheel(deg: number, radius: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [50 + radius * Math.cos(rad), 50 + radius * Math.sin(rad)];
}

function Wheel({ turns, spinning }: { turns: number; spinning: boolean }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[22rem]" aria-hidden="true">
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full"
        style={{ transform: `rotate(${turns}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.15, 1)` : "none" }}
      >
        <circle cx="50" cy="50" r="50" fill="#78350f" />
        {ROULETTE_WHEEL.map((number, index) => {
          const from = (index - 0.5) * POCKET_DEG;
          const [x1, y1] = onWheel(from, 47);
          const [x2, y2] = onWheel(from + POCKET_DEG, 47);
          const [tx, ty] = onWheel(index * POCKET_DEG, 40.5);
          return (
            <g key={number}>
              <path d={`M50 50 L${x1} ${y1} A47 47 0 0 1 ${x2} ${y2} Z`} fill={COLOR_FILL[rouletteColor(number)]} stroke="#fde68a" strokeWidth="0.15" />
              <text x={tx} y={ty} fontSize="4.2" fontWeight="700" fill="#fff7ed" textAnchor="middle" dominantBaseline="central" transform={`rotate(${index * POCKET_DEG} ${tx} ${ty})`}>
                {number}
              </text>
            </g>
          );
        })}
        <circle cx="50" cy="50" r="33" fill="#1c0f2e" stroke="#fde68a" strokeWidth="0.4" />
        <circle cx="50" cy="50" r="6" fill="#b45309" />
      </svg>
      {/* The ball rests at the top; the wheel turns the winning pocket under it. */}
      <div className="absolute left-1/2 top-[1.5%] h-[5%] w-[5%] -translate-x-1/2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
    </div>
  );
}

export default function Roulette({ signedIn, wallet, walletFailed, retryWallet, setBalance }: RoomProps) {
  const [chip, setChip] = useState(5);
  const [bets, setBets] = useState<Map<string, RouletteBet>>(() => new Map());
  const [turns, setTurns] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Spin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wheel = useRef<HTMLDivElement>(null);

  const total = [...bets.values()].reduce((sum, bet) => sum + bet.amount, 0);
  const room = wallet ? maxStake(wallet) - total : 0;

  const place = (spot: Spot) => {
    if (spinning || !wallet) return;
    const key = rouletteBetKey(spot);
    if (chip > room) {
      setError(room <= 0 ? `That's the most you can bet on one spin.` : `You only have room for ${room} more.`);
      return;
    }
    if (!bets.has(key) && bets.size >= ROULETTE_MAX_BETS) {
      setError(`You can cover ${ROULETTE_MAX_BETS} spots at most.`);
      return;
    }
    setError(null);
    setResult(null);
    setBets((current) => {
      const next = new Map(current);
      next.set(key, { ...spot, amount: (current.get(key)?.amount ?? 0) + chip });
      return next;
    });
  };

  const clear = () => {
    setBets(new Map());
    setResult(null);
    setError(null);
  };

  const spin = async () => {
    setSpinning(true);
    setError(null);
    setResult(null);
    try {
      const spun = await casinoPost<Spin>("/roulette/spin", { bets: [...bets.values()] });
      setBalance(spun.balance - spun.payout);
      // On a phone the spin button is below the table, a screen away from the wheel.
      wheel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      // Turn at least five times round, stopping with the number under the ball.
      const target = -ROULETTE_WHEEL.indexOf(spun.number) * POCKET_DEG;
      setTurns((current) => {
        const from = Math.floor(current / 360) * 360;
        return from - 360 * 5 + target;
      });
      if (!prefersReducedMotion()) await sleep(SPIN_MS + 200);
      setBalance(spun.balance);
      setResult(spun);
    } catch (reason) {
      setError(errorMessage(reason, "Could not spin. Try again."));
    } finally {
      setSpinning(false);
    }
  };

  // A spot on the table: shows the chips on it, and lights up if it won.
  const spot = (target: Spot, label: string, className: string, style?: React.CSSProperties) => {
    const key = rouletteBetKey(target);
    const amount = bets.get(key)?.amount ?? 0;
    const won = result !== null && ROULETTE_BETS[target.type].wins(result.number, target.value);
    return (
      <button
        key={key}
        type="button"
        disabled={spinning || !wallet}
        onClick={() => place(target)}
        aria-label={`${spotLabel(target)}${amount ? `, ${amount} tickets on it` : ""}`}
        className={`relative flex min-h-[2rem] items-center justify-center border border-amber-200/25 px-1 text-sm font-bold text-orange-50 transition hover:brightness-125 disabled:cursor-default ${className} ${
          won ? "casino-win z-10 outline outline-2 outline-amber-300" : ""
        }`}
        style={style}
      >
        {label}
        {amount > 0 && (
          <span className="absolute -right-1 -top-1 z-10 min-w-[1.25rem] rounded-full border border-amber-200 bg-amber-500 px-1 text-[0.65rem] leading-4 text-black tabular-nums">
            {amount}
          </span>
        )}
      </button>
    );
  };

  const table = (
    <div className="mx-auto grid w-full max-w-[22rem] grid-cols-[repeat(3,minmax(0,1fr)),minmax(0,1.1fr),minmax(0,1.3fr)] overflow-visible rounded-md bg-green-950/70 p-1">
      {spot({ type: "straight", value: 0 }, "0", COLOR_CLASS.green, { gridColumn: "1 / 4" })}
      <div style={{ gridColumn: "4 / 6" }} />
      {Array.from({ length: 36 }, (_, i) => i + 1).map((number) => spot({ type: "straight", value: number }, String(number), COLOR_CLASS[rouletteColor(number)]))}
      {DOZENS.map((label, dozen) =>
        spot({ type: "dozen", value: dozen }, label, "bg-green-900/60 text-xs", { gridColumn: 4, gridRow: `${2 + dozen * 4} / span 4` })
      )}
      {OUTSIDE.map((bet, index) =>
        spot(
          { type: bet.type, value: null },
          bet.label,
          `text-xs ${bet.type === "red" ? COLOR_CLASS.red : bet.type === "black" ? COLOR_CLASS.black : "bg-green-900/60"}`,
          { gridColumn: 5, gridRow: `${2 + index * 2} / span 2` }
        )
      )}
      {[0, 1, 2].map((column) => spot({ type: "column", value: column }, "2 to 1", "bg-green-900/60 text-xs", { gridRow: 14 }))}
    </div>
  );

  const stage = (
    <section className={`${PANEL} grid items-center gap-4 p-3 sm:p-5 md:grid-cols-2`}>
      <div ref={wheel} className="flex flex-col items-center gap-3">
        <Wheel turns={turns} spinning={spinning && !prefersReducedMotion()} />
        <div className="min-h-[3.5rem] text-center">
          {result ? (
            <>
              <p className="text-2xl font-bold text-orange-50">
                <span className={`mr-2 inline-block rounded px-2 ${COLOR_CLASS[result.color]}`}>{result.number}</span>
                <span className="text-base capitalize text-purple-200/80">{result.color}</span>
              </p>
              <Outcome payout={result.payout} stake={result.stake} />
            </>
          ) : (
            <p className="text-sm text-purple-200/70">{spinning ? "No more bets…" : "Tap the table to place chips, then spin."}</p>
          )}
        </div>
      </div>
      {table}
    </section>
  );

  const controls = (
    <>
      <PanelHeading wallet={wallet}>Chips</PanelHeading>
      <PlayGate signedIn={signedIn} wallet={wallet} walletFailed={walletFailed} retryWallet={retryWallet}>
        {(ready) => (
          <>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Chip size in tickets">
              {CHIPS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  role="radio"
                  aria-checked={chip === amount}
                  disabled={spinning}
                  onClick={() => setChip(amount)}
                  className={`h-11 w-11 rounded-full border-2 border-dashed text-sm font-bold tabular-nums transition disabled:opacity-40 ${
                    chip === amount ? "border-amber-300 bg-amber-500 text-black" : "border-purple-500 bg-purple-950 text-orange-100 hover:border-purple-300"
                  }`}
                >
                  {amount}
                </button>
              ))}
            </div>
            <p className="text-sm text-purple-200/80">
              <strong className="text-orange-50 tabular-nums">{formatTickets(total)}</strong> on the table
              <span className="text-purple-200/60"> (up to {formatTickets(ready.limits.maxBet)} a spin)</span>
            </p>
            <div className="flex gap-2">
              <PlayButton disabled={spinning || total === 0 || total > ready.balance} onClick={spin}>
                {spinning ? "Spinning…" : total === 0 ? "Place a bet" : total > ready.balance ? "Not enough tickets" : `Spin for ${formatTickets(total)}`}
              </PlayButton>
              <button
                type="button"
                disabled={spinning || total === 0}
                onClick={clear}
                className="rounded-md border border-purple-800 px-3 text-sm font-bold text-orange-100 hover:border-purple-500 disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          </>
        )}
      </PlayGate>
      {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
    </>
  );

  const rules = (
    <>
      <h2 className="text-lg font-bold text-orange-50">Payouts</h2>
      <ul className="mt-2 space-y-1 text-sm text-orange-100/90">
        <li className="flex justify-between gap-2"><span>A single number</span><strong className="text-orange-50">35 to 1</strong></li>
        <li className="flex justify-between gap-2"><span>A dozen, or a column</span><strong className="text-orange-50">2 to 1</strong></li>
        <li className="flex justify-between gap-2"><span>Red or black, odd or even, high or low</span><strong className="text-orange-50">1 to 1</strong></li>
      </ul>
      <p className="mt-2 text-xs text-purple-200/60">
        Winners get their bet back as well. Zero is green: it only pays a bet on 0 itself. Your chips stay on the table for the next spin.
      </p>
    </>
  );

  return <RoomLayout stage={stage} controls={controls} rules={rules} />;
}
