import { useEffect, useRef, useState } from "react";
import {
  ROULETTE_BETS,
  ROULETTE_MAX_BETS,
  ROULETTE_WHEEL,
  rouletteBetKey,
  rouletteColor,
  rouletteLabel,
  type RouletteBet,
  type RouletteBetType,
  type RouletteColor,
} from "../../../../server/shared/casino/index.js";
import { Outcome, PanelHeading, PlayButton, PlayGate, RoomLayout, Sheet } from "../parts";
import { TLALOC, TLALOC_BALL } from "../sprites";
import { type RoomProps, casinoPost, errorMessage, formatTickets, maxStake, prefersReducedMotion, sleep } from "../wallet";

type Spin = { number: number; color: RouletteColor; bets: (RouletteBet & { payout: number })[]; stake: number; payout: number; balance: number };
type Spot = Pick<RouletteBet, "type" | "value">;

// Tlaloc's wheel, from Tlaloc's Curse (the pinball table in the arcade): the
// rain god's stone face in the middle, the pinball for a ball, and the table's
// stone, jade and gold.
const CHIPS = [1, 5, 10, 25];
const SPIN_MS = 7500;
// The ball rolls the rim for this share of the spin, then drops into its pocket
// and rides the wheel round until it stops.
const ROLL_SHARE = 0.72;
const WHEEL_TURNS = 2.5;
const BALL_TURNS = 6;
const POCKET_DEG = 360 / ROULETTE_WHEEL.length;
// Distances from the wheel's centre, as a share of its width.
const RIM_RADIUS = 46.3;
const POCKET_RADIUS = 33.4;
// (blue: Tlaloc's own pockets, which take every bet on the table)
const COLOR_FILL: Record<RouletteColor, string> = { green: "#1f8a5b", red: "#a3322b", black: "#1a2036", blue: "#1479a8" };
const COLOR_CLASS: Record<RouletteColor, string> = { green: "bg-[#1f8a5b]", red: "bg-[#a3322b]", black: "bg-[#1a2036]", blue: "bg-[#1479a8]" };
const COLOR_NAMES: Record<RouletteColor, string> = { green: "Jade", red: "Red", black: "Black", blue: "Tlaloc's pocket" };
const STONE = "bg-[#22304f]";
const AZTEC_BORDER = {
  backgroundImage: "url(/sprites/casino/aztec_border.png)",
  backgroundSize: "24px 30px",
  backgroundRepeat: "repeat-x",
  imageRendering: "pixelated",
} as const;

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

const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
const easeOutQuad = (u: number) => 1 - (1 - u) ** 2;

// Where the wheel and the ball are `ms` into a spin that began with the wheel
// at `from` degrees and ends with the ball in pocket `index`.
function spinFrame(ms: number, from: number, index: number) {
  const u = Math.min(1, ms / SPIN_MS);
  const wheelAt = (share: number) => from + WHEEL_TURNS * 360 * easeOutCubic(share);
  const wheel = wheelAt(u);
  const pocket = index * POCKET_DEG;
  if (u >= ROLL_SHARE) return { wheel, ball: wheel + pocket, radius: POCKET_RADIUS, rolling: false };
  // Against the wheel's turn, slowing, to meet its pocket as the roll runs out.
  const roll = u / ROLL_SHARE;
  const ball = wheelAt(ROLL_SHARE) + pocket + BALL_TURNS * 360 * (1 - easeOutQuad(roll));
  // It leaves the rim for the last of the roll, with a hop off the pocket's lip.
  const fall = Math.max(0, (roll - 0.78) / 0.22);
  const hop = Math.sin(fall * Math.PI * 2) * 1.6 * (1 - fall);
  return { wheel, ball, radius: RIM_RADIUS + (POCKET_RADIUS - RIM_RADIUS) * fall * fall + hop, rolling: true };
}

function Wheel({ spin, cursed }: { spin: { id: number; number: number } | null; cursed: boolean }) {
  const face = useRef<SVGSVGElement>(null);
  const ball = useRef<HTMLDivElement>(null);
  const [rolling, setRolling] = useState(false);
  // Where the wheel stopped last, so the next spin carries on from there.
  const rest = useRef({ wheel: 0, ball: 0, radius: RIM_RADIUS });

  useEffect(() => {
    const place = (frame: { wheel: number; ball: number; radius: number }) => {
      if (face.current) face.current.style.transform = `rotate(${frame.wheel}deg)`;
      const [x, y] = onWheel(frame.ball, frame.radius);
      if (ball.current) {
        ball.current.style.left = `${x}%`;
        ball.current.style.top = `${y}%`;
      }
    };
    if (!spin) {
      place(rest.current);
      return;
    }
    const from = rest.current.wheel % 360;
    const index = ROULETTE_WHEEL.indexOf(spin.number);
    const end = spinFrame(SPIN_MS, from, index);
    rest.current = end;
    if (prefersReducedMotion()) {
      place(end);
      return;
    }
    const began = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const frame = spinFrame(now - began, from, index);
      place(frame);
      setRolling(frame.rolling);
      if (now - began < SPIN_MS) raf = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(raf);
      setRolling(false);
      place(end);
    };
  }, [spin]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[22rem]" aria-hidden="true">
      <svg ref={face} viewBox="0 0 100 100" className="h-full w-full">
        <circle cx="50" cy="50" r="50" fill="#2b3a5e" />
        <circle cx="50" cy="50" r="49" fill="none" stroke="#d9a520" strokeWidth="0.5" />
        {/* The sandstone rim the ball rolls round */}
        <circle cx="50" cy="50" r="46.3" fill="none" stroke="#cdb98a" strokeWidth="4.6" />
        <circle cx="50" cy="50" r="46.3" fill="none" stroke="#a8946a" strokeWidth="4.6" strokeDasharray="0.5 7.6" />
        {ROULETTE_WHEEL.map((number, index) => {
          const from = (index - 0.5) * POCKET_DEG;
          const [x1, y1] = onWheel(from, 44);
          const [x2, y2] = onWheel(from + POCKET_DEG, 44);
          const [tx, ty] = onWheel(index * POCKET_DEG, 40.3);
          return (
            <g key={number}>
              <path d={`M50 50 L${x1} ${y1} A44 44 0 0 1 ${x2} ${y2} Z`} fill={COLOR_FILL[rouletteColor(number)]} stroke="#d9a520" strokeWidth="0.2" />
              <text x={tx} y={ty} fontSize="4" fontWeight="700" fill="#fff3d6" textAnchor="middle" dominantBaseline="central" transform={`rotate(${index * POCKET_DEG} ${tx} ${ty})`}>
                {rouletteLabel(number)}
              </text>
            </g>
          );
        })}
        <circle cx="50" cy="50" r="36.6" fill="none" stroke="#d9a520" strokeWidth="0.25" strokeOpacity="0.7" />
        <circle cx="50" cy="50" r="29.5" fill="#101a30" stroke="#d9a520" strokeWidth="0.6" />
      </svg>
      {/* Tlaloc keeps still while his wheel turns; his eyes go red when the curse is on */}
      <div className="absolute left-1/2 top-1/2 w-[56%] -translate-x-1/2 -translate-y-1/2">
        <div
          className="aspect-square w-full"
          style={{
            backgroundImage: `url(${TLALOC.url})`,
            backgroundSize: "200% 100%",
            backgroundPosition: cursed ? "100% 0" : "0 0",
            imageRendering: "pixelated",
          }}
        />
      </div>
      <div ref={ball} className="absolute -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_0_3px_rgba(255,243,214,0.9)]" style={{ left: "50%", top: `${50 - RIM_RADIUS}%` }}>
        <Sheet {...TLALOC_BALL} height={22} playing={rolling} fps={32} />
      </div>
    </div>
  );
}

export default function Roulette({ signedIn, wallet, walletFailed, retryWallet, setBalance }: RoomProps) {
  const [chip, setChip] = useState(5);
  const [bets, setBets] = useState<Map<string, RouletteBet>>(() => new Map());
  const [spun, setSpun] = useState<{ id: number; number: number } | null>(null);
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
      const landed = await casinoPost<Spin>("/roulette/spin", { bets: [...bets.values()] });
      setBalance(landed.balance - landed.payout);
      // On a phone the spin button is below the table, a screen away from the wheel.
      wheel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setSpun((last) => ({ id: (last?.id ?? 0) + 1, number: landed.number }));
      if (!prefersReducedMotion()) await sleep(SPIN_MS + 300);
      setBalance(landed.balance);
      setResult(landed);
    } catch (reason) {
      setError(errorMessage(reason, "Could not spin. Try again."));
    } finally {
      setSpinning(false);
    }
  };

  // A spot on the table: shows the gold on it, and lights up if it won.
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
        className={`relative flex min-h-[2rem] items-center justify-center border border-[#d9a520]/40 px-1 text-sm font-bold text-[#fff3d6] transition hover:brightness-125 disabled:cursor-default ${className} ${
          won ? "casino-win z-10 outline outline-2 outline-[#ffd75e]" : ""
        }`}
        style={style}
      >
        {label}
        {amount > 0 && (
          <span className="absolute -right-1 -top-1 z-10 min-w-[1.25rem] rounded-full border border-[#7a5200] bg-[radial-gradient(circle_at_35%_30%,#fff1a8,#f5b800_55%,#b97f00)] px-1 text-[0.65rem] leading-4 text-black tabular-nums shadow">
            {amount}
          </span>
        )}
      </button>
    );
  };

  const table = (
    <div className="mx-auto grid w-full max-w-[22rem] grid-cols-[repeat(3,minmax(0,1fr)),minmax(0,1.1fr),minmax(0,1.3fr)] overflow-visible rounded-md border-2 border-[#d9a520]/60 bg-[#101a30] p-1">
      {spot({ type: "straight", value: 0 }, "0", COLOR_CLASS.green, { gridColumn: "1 / 4" })}
      <div style={{ gridColumn: "4 / 6" }} />
      {Array.from({ length: 36 }, (_, i) => i + 1).map((number) => spot({ type: "straight", value: number }, String(number), COLOR_CLASS[rouletteColor(number)]))}
      {DOZENS.map((label, dozen) =>
        spot({ type: "dozen", value: dozen }, label, `${STONE} text-xs`, { gridColumn: 4, gridRow: `${2 + dozen * 4} / span 4` })
      )}
      {OUTSIDE.map((bet, index) =>
        spot(
          { type: bet.type, value: null },
          bet.label,
          `text-xs ${bet.type === "red" ? COLOR_CLASS.red : bet.type === "black" ? COLOR_CLASS.black : STONE}`,
          { gridColumn: 5, gridRow: `${2 + index * 2} / span 2` }
        )
      )}
      {[0, 1, 2].map((column) => spot({ type: "column", value: column }, "2 to 1", `${STONE} text-xs`, { gridRow: 14 }))}
    </div>
  );

  const lost = result !== null && result.payout === 0;
  const stage = (
    <section className="overflow-hidden rounded-lg border border-[#d9a520]/50 bg-[radial-gradient(ellipse_at_top,#17324a,#0a1322_70%)]">
      <div className="h-[30px]" style={AZTEC_BORDER} />
      <div className="flex items-center justify-center gap-2 px-3 pt-3">
        <Sheet {...TLALOC} height={40} frame={spinning || lost ? 1 : 0} />
        <div>
          <h2 className="font-zombie text-2xl tracking-wide text-[#ffd75e]">Tlaloc's Wheel</h2>
          <p className="text-xs text-[#9fc3d9]">
            {spinning ? "The rain god turns the wheel…" : lost ? "Tlaloc keeps your offering." : result ? "Tlaloc is pleased. For now." : "Leave an offering on the stone, then spin."}
          </p>
        </div>
      </div>
      <div className="grid items-center gap-4 p-3 sm:p-5 md:grid-cols-2">
        <div ref={wheel} className="flex flex-col items-center gap-3">
          <Wheel spin={spun} cursed={spinning || lost} />
          <div className="min-h-[3.5rem] text-center">
            {result ? (
              <>
                <p className="text-2xl font-bold text-[#fff3d6]">
                  <span className={`mr-2 inline-block rounded border border-[#d9a520] px-2 ${COLOR_CLASS[result.color]}`}>{rouletteLabel(result.number)}</span>
                  <span className="text-base text-[#9fc3d9]">{COLOR_NAMES[result.color]}</span>
                </p>
                <Outcome payout={result.payout} stake={result.stake} />
              </>
            ) : (
              <p className="text-sm text-[#9fc3d9]">{spinning ? "No more bets…" : "Tap the table to place your gold."}</p>
            )}
          </div>
        </div>
        {table}
      </div>
      <div className="h-[30px] rotate-180" style={AZTEC_BORDER} />
    </section>
  );

  const controls = (
    <>
      <PanelHeading wallet={wallet}>Gold pieces</PanelHeading>
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
                  className={`h-11 w-11 rounded-full border-2 bg-[radial-gradient(circle_at_35%_30%,#fff1a8,#f5b800_55%,#b97f00)] text-sm font-bold text-black tabular-nums transition disabled:opacity-40 ${
                    chip === amount ? "scale-110 border-white shadow-[0_0_10px_#ffd75e]" : "border-[#7a5200] opacity-70 hover:opacity-100"
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
        Winners get their bet back as well. Zero is jade: it only pays a bet on 0 itself. The three blue pockets marked T are Tlaloc's: land there
        and he takes every bet on the table. Your gold stays on the table for the next spin.
      </p>
    </>
  );

  return <RoomLayout stage={stage} controls={controls} rules={rules} />;
}
