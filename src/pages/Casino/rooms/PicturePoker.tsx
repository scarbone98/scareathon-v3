import { useEffect, useState } from "react";
import { POKER_HANDS, POKER_HAND_SIZE, evaluateHand, type PokerHandId, type PokerOutcome } from "../../../../server/shared/casino/index.js";
import { getMonster } from "../../../../server/shared/monster-bash/index.js";
import { MonsterSprite, Outcome, PanelHeading, PlayButton, PlayGate, RoomLayout, StakePicker } from "../parts";
import { type RoomProps, casinoGet, casinoPost, errorMessage, maxStake, PANEL, prefersReducedMotion, sleep } from "../wallet";

type Round = { id: string; stake: number; cards: string[] };
type Draw = {
  cards: string[];
  hand: PokerHandId;
  dealer: { dealt: string[]; holds: boolean[]; cards: string[]; hand: PokerHandId };
  outcome: PokerOutcome;
  stake: number;
  payout: number;
  balance: number;
};
// How much of a finished hand is on show: the player's new cards, then the
// dealer's hand, then the dealer's swaps and the result.
type Reveal = "player" | "dealer" | "result";

const DEALER = "scarecrow";
const CARD_COLORS: Record<string, string> = {
  candle: "#f59e0b",
  rat: "#a8a29e",
  pumpkin: "#f97316",
  ghost: "#e5e7eb",
  skull: "#c4b5fd",
  werewolf: "#60a5fa",
};
const NO_SWAPS = Array.from({ length: POKER_HAND_SIZE }, () => false);
const handName = (id: PokerHandId) => POKER_HANDS.find((hand) => hand.id === id)?.name ?? id;

function Card({ symbol, marked = false, dim = false, onClick }: { symbol: string | null; marked?: boolean; dim?: boolean; onClick?: () => void }) {
  const face = symbol ? (
    <>
      <MonsterSprite monster={symbol} size={36} />
      <span className="hidden w-full truncate px-0.5 text-center text-[0.65rem] font-bold text-orange-50 sm:block">{getMonster(symbol).name}</span>
    </>
  ) : (
    <span className="font-zombie text-2xl text-purple-400/70">?</span>
  );
  const className = `casino-card-in flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-md border-2 transition ${
    symbol ? "bg-[#1c1230]" : "border-purple-800 bg-[repeating-linear-gradient(45deg,#2a1747_0_6px,#1c1230_6px_12px)]"
  } ${marked ? "-translate-y-2 opacity-60" : ""} ${dim ? "opacity-50" : ""}`;
  const style = symbol ? { borderColor: CARD_COLORS[symbol] } : undefined;
  if (!onClick) return <div className={className} style={style}>{face}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={marked}
      aria-label={`${symbol ? getMonster(symbol).name : "Card"}${marked ? ", will be swapped" : ", keeping"}`}
      className={`${className} hover:brightness-125`}
      style={style}
    >
      {face}
    </button>
  );
}

function Hand({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-xs uppercase tracking-wider text-purple-200/60">{label}</h3>
        {note && <span className="text-sm font-bold text-orange-50">{note}</span>}
      </div>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">{children}</div>
    </div>
  );
}

export default function PicturePoker({ signedIn, wallet, walletFailed, retryWallet, setBalance }: RoomProps) {
  const [stake, setStake] = useState(5);
  const [round, setRound] = useState<Round | null>(null);
  const [swaps, setSwaps] = useState(NO_SWAPS);
  const [draw, setDraw] = useState<Draw | null>(null);
  const [reveal, setReveal] = useState<Reveal>("player");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick up a hand left unfinished (a closed tab, a dropped connection).
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    casinoGet<{ round: Round | null }>("/poker")
      .then((saved) => active && saved.round && setRound((current) => current ?? saved.round))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [signedIn]);

  const deal = async () => {
    setBusy(true);
    setError(null);
    try {
      const dealt = await casinoPost<{ round: Round; balance: number }>("/poker/deal", { amount: stake });
      setBalance(dealt.balance);
      setDraw(null);
      setSwaps(NO_SWAPS);
      setRound(dealt.round);
    } catch (reason) {
      setError(errorMessage(reason, "Could not deal. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const swap = async () => {
    setBusy(true);
    setError(null);
    try {
      const drawn = await casinoPost<Draw>("/poker/draw", { holds: swaps.map((swapped) => !swapped) });
      setBalance(drawn.balance - drawn.payout);
      setReveal("player");
      setDraw(drawn);
      if (!prefersReducedMotion()) {
        await sleep(700);
        setReveal("dealer");
        await sleep(900);
      }
      setReveal("result");
      setBalance(drawn.balance);
    } catch (reason) {
      setError(errorMessage(reason, "Could not swap your cards. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const choosing = round !== null && draw === null;
  const swapCount = swaps.filter(Boolean).length;
  const playerCards = draw?.cards ?? round?.cards ?? null;
  const dealerCards = !draw || reveal === "player" ? null : reveal === "dealer" ? draw.dealer.dealt : draw.dealer.cards;
  const done = draw !== null && reveal === "result";

  const stage = (
    <section className={`${PANEL} mx-auto flex w-full max-w-xl flex-col gap-4 p-3 sm:p-5`}>
      <div className="flex items-center gap-2">
        <MonsterSprite monster={DEALER} size={36} />
        <p className="text-sm text-purple-200/80">
          {done
            ? draw.outcome === "win"
              ? "The Scarecrow tips its hat. You win."
              : "The Scarecrow takes it."
            : choosing
              ? "Tap the cards you want to swap."
              : draw
                ? "The Scarecrow shows its hand…"
                : "The Scarecrow deals five cards each. Beat its hand."}
        </p>
      </div>
      <Hand label="Dealer" note={done ? handName(draw.dealer.hand) : undefined}>
        {Array.from({ length: POKER_HAND_SIZE }, (_, i) => (
          // The key changes when a card does, so only new cards turn over.
          <Card key={`${round?.id}-${i}-${!dealerCards ? "back" : reveal === "result" && !draw?.dealer.holds[i] ? "new" : "dealt"}`} symbol={dealerCards?.[i] ?? null} dim={done && draw.outcome === "win"} />
        ))}
      </Hand>
      <Hand label="You" note={playerCards ? (draw ? handName(draw.hand) : evaluateHand(playerCards).name) : undefined}>
        {Array.from({ length: POKER_HAND_SIZE }, (_, i) => (
          <Card
            key={`${round?.id}-${i}-${draw && swaps[i] ? "new" : "dealt"}`}
            symbol={playerCards?.[i] ?? null}
            marked={choosing && swaps[i]}
            dim={done && draw.outcome === "lose"}
            onClick={choosing && !busy ? () => setSwaps((current) => current.map((swapped, card) => (card === i ? !swapped : swapped))) : undefined}
          />
        ))}
      </Hand>
      <div className="min-h-[1.75rem]">
        {done && (
          <Outcome payout={draw.payout} stake={draw.stake}>
            {handName(draw.hand)} against {handName(draw.dealer.hand).toLowerCase()}.
          </Outcome>
        )}
      </div>
    </section>
  );

  const controls = (
    <>
      <PanelHeading wallet={wallet}>{choosing ? `Betting ${round.stake}` : "Bet"}</PanelHeading>
      <PlayGate signedIn={signedIn} wallet={wallet} walletFailed={walletFailed} retryWallet={retryWallet}>
        {(ready) =>
          choosing ? (
            <PlayButton disabled={busy} onClick={swap}>
              {busy ? "Swapping…" : swapCount === 0 ? "Keep all five" : `Swap ${swapCount} ${swapCount === 1 ? "card" : "cards"}`}
            </PlayButton>
          ) : (
            <>
              <StakePicker wallet={ready} stake={stake} onChange={setStake} disabled={busy} />
              <PlayButton disabled={busy || stake > maxStake(ready)} onClick={deal}>
                {busy ? "Dealing…" : draw ? `Deal again for ${stake}` : `Deal for ${stake}`}
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
      <h2 className="text-lg font-bold text-orange-50">Hands</h2>
      <ol className="mt-2 space-y-1 text-sm text-orange-100/90">
        {[...POKER_HANDS].reverse().map((hand) => (
          <li key={hand.id} className="flex justify-between gap-2">
            <span>{hand.name}</span>
            <strong className="text-orange-50 tabular-nums">{hand.multiplier > 0 ? `${hand.multiplier}x` : "never wins"}</strong>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-purple-200/60">
        Best hand at the top. Only matching pictures count. Beat the dealer's hand with a better one and your bet is multiplied; if you both have
        the same kind of hand, the dealer takes it. You get one swap, and so does the dealer.
      </p>
    </>
  );

  return <RoomLayout stage={stage} controls={controls} rules={rules} />;
}
