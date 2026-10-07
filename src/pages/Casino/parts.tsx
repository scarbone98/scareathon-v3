import type { CSSProperties, ReactNode } from "react";
import { FaTicketAlt } from "react-icons/fa";
import { getMonster } from "../../../server/shared/monster-bash/index.js";
import { PANEL, formatTickets, goSignIn, maxStake, type RoomProps, type Wallet } from "./wallet";

// A monster off its sprite sheet, drawn crisp at pixel scale. `walking` runs
// its walk cycle (see casino.css).
export function MonsterSprite({
  monster: id,
  size = 48,
  walking = false,
  className = "",
}: {
  monster: string;
  size?: number;
  walking?: boolean;
  className?: string;
}) {
  const { url, frameWidth, frameHeight, frames } = getMonster(id).sprite;
  const scale = size / Math.max(frameWidth, frameHeight);
  const style = {
    width: frameWidth * scale,
    height: frameHeight * scale,
    backgroundImage: `url(${url})`,
    backgroundSize: `${frameWidth * frames * scale}px ${frameHeight * scale}px`,
    imageRendering: "pixelated",
    "--casino-frames": frames,
    "--casino-sheet": `${-frameWidth * frames * scale}px`,
  } as CSSProperties;
  return (
    <div className={`flex shrink-0 items-end justify-center ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <div className={walking ? "casino-walk" : ""} style={style} />
    </div>
  );
}

export function Balance({ wallet }: { wallet: Wallet }) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-amber-200 tabular-nums">
      <FaTicketAlt aria-hidden="true" /> {formatTickets(wallet.balance)}
      <span className="sr-only"> tickets</span>
    </span>
  );
}

// Stands in for a game's controls until the player is signed in and their
// tickets have loaded.
export function PlayGate({
  signedIn,
  wallet,
  walletFailed,
  retryWallet,
  children,
}: Pick<RoomProps, "signedIn" | "wallet" | "walletFailed" | "retryWallet"> & { children: (wallet: Wallet) => ReactNode }) {
  if (!signedIn) {
    return (
      <button
        type="button"
        onClick={goSignIn}
        className="block w-full rounded-md border border-purple-700 bg-purple-950/50 px-4 py-2.5 text-center font-bold text-orange-50 hover:border-purple-400"
      >
        Sign in to play for tickets
      </button>
    );
  }
  if (!wallet) {
    return walletFailed ? (
      <p className="text-sm text-red-300" role="alert">
        Couldn't load your tickets.{" "}
        <button type="button" onClick={retryWallet} className="font-bold underline">
          Try again
        </button>
      </p>
    ) : (
      <p className="text-sm text-purple-200/70">Loading your tickets…</p>
    );
  }
  return <>{children(wallet)}</>;
}

const QUICK_STAKES = [1, 5, 10, 25, 50];

export function StakePicker({
  wallet,
  stake,
  onChange,
  disabled = false,
}: {
  wallet: Wallet;
  stake: number;
  onChange: (stake: number) => void;
  disabled?: boolean;
}) {
  const max = maxStake(wallet);
  const options = [...QUICK_STAKES.filter((amount) => amount < wallet.limits.maxBet), wallet.limits.maxBet];
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Bet in tickets">
        {options.map((amount) => (
          <button
            key={amount}
            type="button"
            role="radio"
            aria-checked={stake === amount}
            disabled={disabled || amount > max}
            onClick={() => onChange(amount)}
            className={`min-w-[2.75rem] rounded-md border px-2 py-1.5 text-sm font-bold tabular-nums transition disabled:opacity-40 ${
              stake === amount ? "border-amber-400 bg-amber-400/15 text-amber-100" : "border-purple-800 text-orange-100 hover:border-purple-500"
            }`}
          >
            {amount}
          </button>
        ))}
      </div>
      {wallet.balance < wallet.limits.minBet && <p className="mt-2 text-sm text-purple-200/80">You're out of tickets. Play the arcade to earn more.</p>}
    </div>
  );
}

export function PlayButton({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-md bg-red-700 px-4 py-2.5 font-bold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-purple-950 disabled:text-purple-300/60"
    >
      {children}
    </button>
  );
}

// The line under a game that says how the last round went.
export function Outcome({ payout, stake, children }: { payout: number; stake: number; children?: ReactNode }) {
  const won = payout > stake;
  return (
    <p className={`text-base ${won ? "font-bold text-amber-300" : "text-orange-100/90"}`} role="status">
      {children}{" "}
      {payout === 0
        ? `You lost ${formatTickets(stake)} tickets.`
        : won
          ? `You won ${formatTickets(payout)} tickets!`
          : `You got ${formatTickets(payout)} tickets back.`}
    </p>
  );
}

// A house game's page: the game itself, with its controls and rules beside it
// (underneath on a phone).
export function RoomLayout({ stage, controls, rules }: { stage: ReactNode; controls: ReactNode; rules: ReactNode }) {
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr),340px] lg:gap-4">
      <div className="min-w-0">{stage}</div>
      <aside className="flex min-w-0 flex-col gap-3 lg:gap-4">
        <section className={`${PANEL} flex flex-col gap-3 p-4`}>{controls}</section>
        <section className={`${PANEL} p-4`}>{rules}</section>
      </aside>
    </div>
  );
}

export function PanelHeading({ children, wallet }: { children: ReactNode; wallet: Wallet | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-lg font-bold text-orange-50">{children}</h2>
      {wallet && <Balance wallet={wallet} />}
    </div>
  );
}

// One frame (or, `playing`, the whole run) of any sprite sheet laid out in a
// grid: the pinball's ball, Tlaloc, the Merchant and his hands.
export function Sheet({
  url,
  frameWidth,
  frameHeight,
  frames,
  rows = 1,
  row = 0,
  frame = 0,
  height,
  playing = false,
  fps = 8,
  className = "",
  style,
}: {
  url: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  rows?: number;
  row?: number;
  frame?: number;
  height: number;
  playing?: boolean;
  fps?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const scale = height / frameHeight;
  return (
    <div
      aria-hidden="true"
      className={`${playing ? "casino-walk" : ""} ${className}`}
      style={
        {
          width: frameWidth * scale,
          height,
          backgroundImage: `url(${url})`,
          backgroundSize: `${frameWidth * frames * scale}px ${frameHeight * rows * scale}px`,
          backgroundPosition: `${-frame * frameWidth * scale}px ${-row * frameHeight * scale}px`,
          imageRendering: "pixelated",
          "--casino-frames": frames,
          "--casino-sheet": `${-frameWidth * frames * scale}px`,
          "--casino-ms": `${Math.round((frames / fps) * 1000)}ms`,
          ...style,
        } as CSSProperties
      }
    />
  );
}
