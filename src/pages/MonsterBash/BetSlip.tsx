import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { FaCoins } from "react-icons/fa";
import { getMonster, type FighterSide } from "../../../server/shared/monster-bash/index.js";
import { placeBet, type PlayerAccount } from "./account";
import type { BetPools, LiveMatch, MatchPhase } from "./matchStore";
import { SIDE_COLORS } from "./theme";

const QUICK_AMOUNTS = [10, 50, 100];
const EMPTY_POOLS: BetPools = { amounts: [0, 0], bettors: [0, 0] };

const formatCoins = (coins: number) => coins.toLocaleString("en-US");

// Everything staked on a side: players' coins plus the house's seed.
function sideTotal(pools: BetPools, side: number) {
  return pools.amounts[side] + (pools.house?.[side] ?? 0);
}

// Parimutuel payout for `stake` on `side` if it were added to the pools now.
function estimatePayout(pools: BetPools, side: FighterSide, stake: number, alreadyIn = false) {
  const added = alreadyIn ? 0 : stake;
  const total = sideTotal(pools, 0) + sideTotal(pools, 1) + added;
  const sidePool = sideTotal(pools, side) + added;
  return sidePool > 0 ? Math.floor((stake * total) / sidePool) : stake;
}

function PoolBar({ match, pools }: { match: LiveMatch; pools: BetPools }) {
  const sides = [sideTotal(pools, 0), sideTotal(pools, 1)];
  const total = sides[0] + sides[1];
  const houseTotal = (pools.house?.[0] ?? 0) + (pools.house?.[1] ?? 0);
  const names = match.fighters.map((id) => getMonster(id).name);
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-purple-950/60" aria-hidden="true">
        {total > 0 &&
          [0, 1].map((side) => (
            <div
              key={side}
              style={{ width: `${(sides[side] / total) * 100}%`, background: SIDE_COLORS[side] }}
              className={side === 0 ? "border-r-2 border-[#0b0617]" : ""}
            />
          ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-purple-200/70 tabular-nums">
        {[0, 1].map((side) => (
          <span key={side} className={side === 1 ? "text-right" : ""}>
            <strong className="text-orange-50">{formatCoins(sides[side])}</strong> on {names[side]}
            <br />
            {pools.bettors[side]} {pools.bettors[side] === 1 ? "bettor" : "bettors"}
          </span>
        ))}
      </div>
      {houseTotal > 0 && (
        <p className="mt-1 text-xs text-purple-200/60">Includes {formatCoins(houseTotal)} coins from the house, split by win chance.</p>
      )}
    </div>
  );
}

type BetSlipProps = {
  match: LiveMatch;
  phase: MatchPhase;
  secondsToClose: number;
  signedIn: boolean;
  account: PlayerAccount | null;
  accountFailed: boolean;
  onRetry: () => void;
  onBetPlaced: (account: PlayerAccount) => void;
};

export default function BetSlip({ match, phase, secondsToClose, signedIn, account, accountFailed, onRetry, onBetPlaced }: BetSlipProps) {
  const [side, setSide] = useState<FighterSide | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const pools = match.pools ?? EMPTY_POOLS;
  const names = match.fighters.map((id) => getMonster(id).name) as [string, string];
  const bettingOpen = phase === "intro" && secondsToClose > 0;
  const bet = account && account.matchId === match.id ? account.bet : null;
  const stake = Number.parseInt(amount, 10);
  const maxBet = Math.min(account?.limits.maxBet ?? 0, account?.balance ?? 0);
  const validStake = Number.isInteger(stake) && stake >= (account?.limits.minBet ?? 1) && stake <= maxBet;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (side === null || !validStake || !account) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await placeBet({ matchId: match.id, side, amount: stake });
      onBetPlaced({ ...account, balance: result.balance, matchId: match.id, bet: result.bet });
      setAmount("");
      setSide(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not place your bet.");
    } finally {
      setSubmitting(false);
    }
  };

  let body: React.ReactNode;
  if (!signedIn) {
    body = (
      <Link
        to="/authentication"
        state={{ from: "/monster-bash" }}
        className="block rounded-md border border-purple-700 bg-purple-950/50 px-4 py-2.5 text-center font-bold text-orange-50 hover:border-purple-400"
      >
        Sign in to bet coins
      </Link>
    );
  } else if (!account) {
    body = accountFailed ? (
      <p className="text-sm text-red-300" role="alert">
        Couldn't load your coins.{" "}
        <button type="button" onClick={onRetry} className="font-bold underline">
          Try again
        </button>
      </p>
    ) : (
      <p className="text-sm text-purple-200/70">Loading your coins…</p>
    );
  } else if (bet) {
    const pick = names[bet.side];
    if (bet.status === "won") {
      body = <p className="text-lg font-bold text-amber-300">{pick} won! You got {formatCoins(bet.payout ?? 0)} coins.</p>;
    } else if (bet.status === "lost") {
      body = <p className="text-orange-100/90">{pick} lost your {formatCoins(bet.amount)} coins. Better luck next bout.</p>;
    } else if (bet.status === "refunded") {
      body = <p className="text-orange-100/90">Your {formatCoins(bet.amount)} coins were refunded.</p>;
    } else {
      const unopposed = sideTotal(pools, 1 - bet.side) === 0;
      body = (
        <p className="text-orange-100/90">
          You bet <strong className="text-orange-50">{formatCoins(bet.amount)}</strong> on{" "}
          <strong style={{ color: SIDE_COLORS[bet.side] }}>{pick}</strong>.{" "}
          {unopposed ? (
            "No one has bet against you yet. If it stays that way, you get your coins back."
          ) : (
            <>
              Pays about{" "}
              <strong className="text-orange-50">{formatCoins(estimatePayout(pools, bet.side, bet.amount, true))}</strong> if{" "}
              {pick} wins.
            </>
          )}
        </p>
      );
    }
  } else if (!bettingOpen) {
    body = <p className="text-sm text-purple-200/70">Betting is closed for this bout. It opens again when the next one is announced.</p>;
  } else if (account.balance < account.limits.minBet) {
    body = (
      <p className="text-sm text-purple-200/80">
        You're out of coins.{" "}
        <Link to="/arcade" className="font-bold text-orange-50 underline">
          Play the arcade
        </Link>{" "}
        to earn more.
      </p>
    );
  } else {
    body = (
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-xs text-purple-200/70">
          Winners split the whole pot. Payouts start near the odds and shift as the crowd bets.
        </p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pick a monster">
          {[0, 1].map((option) => {
            const choice = option as FighterSide;
            const selected = side === choice;
            const multiplier = estimatePayout(pools, choice, 100) / 100;
            // Winnings come out of the other side's pool; if it's empty, a
            // win would only return the stake.
            const nothingAgainst = sideTotal(pools, 1 - choice) === 0;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSide(choice)}
                className={`rounded-md border-2 px-2 py-2 text-left transition ${
                  selected ? "bg-white/10" : "border-purple-900/70 hover:border-purple-500"
                }`}
                style={selected ? { borderColor: SIDE_COLORS[option] } : undefined}
              >
                <span className="block truncate font-bold text-orange-50">{names[option]}</span>
                <span className="text-xs text-purple-200/70 tabular-nums">
                  {nothingAgainst ? "No bets against yet" : `Pays ${multiplier.toFixed(2)}x`}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={account?.limits.minBet ?? 1}
            max={maxBet}
            placeholder="Coins"
            aria-label="Bet amount in coins"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-full min-w-0 rounded-md border border-purple-800 bg-black/60 px-3 py-2 text-orange-50 tabular-nums"
          />
          {QUICK_AMOUNTS.map((quick) => (
            <button
              key={quick}
              type="button"
              disabled={quick > maxBet}
              onClick={() => setAmount(String(quick))}
              className="rounded-md border border-purple-800 px-2 text-sm text-orange-100 hover:border-purple-500 disabled:opacity-40"
            >
              {quick}
            </button>
          ))}
          <button
            type="button"
            disabled={maxBet < 1}
            onClick={() => setAmount(String(maxBet))}
            className="rounded-md border border-purple-800 px-2 text-sm text-orange-100 hover:border-purple-500 disabled:opacity-40"
          >
            Max
          </button>
        </div>
        <button
          type="submit"
          disabled={side === null || !validStake || submitting}
          className="rounded-md bg-red-700 px-4 py-2.5 font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-purple-950 disabled:text-purple-300/60"
        >
          {side === null
            ? "Pick a monster"
            : validStake
              ? sideTotal(pools, 1 - side) === 0
                ? `Bet ${formatCoins(stake)} on ${names[side]}`
                : `Bet ${formatCoins(stake)} on ${names[side]} (pays ~${formatCoins(estimatePayout(pools, side, stake))})`
              : `Enter 1 to ${formatCoins(maxBet)} coins`}
        </button>
        {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
      </form>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-purple-900/60 bg-black/60 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-orange-50">Bets</h2>
        {signedIn && account && (
          <span className="flex items-center gap-1.5 text-sm text-amber-200 tabular-nums">
            <FaCoins aria-hidden="true" /> {formatCoins(account.balance)}
          </span>
        )}
      </div>
      {bettingOpen && (
        <p className="text-sm text-purple-200/80">
          Betting closes in <strong className="text-orange-50 tabular-nums">{secondsToClose}s</strong>
        </p>
      )}
      <PoolBar match={match} pools={pools} />
      {body}
    </section>
  );
}
