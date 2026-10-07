import { useLayoutEffect, useState } from "react";
import { SLOT_REELS, SLOT_SYMBOLS, type SlotLine } from "../../../../server/shared/casino/index.js";
import { getMonster } from "../../../../server/shared/monster-bash/index.js";
import { MonsterSprite, Outcome, PanelHeading, PlayButton, PlayGate, RoomLayout, StakePicker } from "../parts";
import { type RoomProps, casinoPost, errorMessage, maxStake, PANEL, prefersReducedMotion, sleep } from "../wallet";

type Spin = { reels: string[]; line: SlotLine; multiplier: number; stake: number; payout: number; balance: number };

const CELL_PX = 84;
// How many symbols roll past before a reel stops; later reels roll longer.
const ROLL_CELLS = [14, 20, 26];
const ROLL_MS = [1100, 1600, 2100];

const anySymbol = () => SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)].id;

// One reel: a strip with the symbol it lands on at the top and the one it
// started on at the bottom, slid down into view.
function Reel({ strip, spinId, ms, lit }: { strip: string[]; spinId: number; ms: number; lit: boolean }) {
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
      className={`overflow-hidden rounded-md border-2 bg-[#0b0617] ${lit ? "casino-win border-amber-400" : "border-purple-800"}`}
      style={{ width: CELL_PX, height: CELL_PX }}
    >
      <div
        style={{
          transform: `translateY(${rolled ? 0 : -(strip.length - 1) * CELL_PX}px)`,
          transition: rolled && spinId > 0 ? `transform ${ms}ms cubic-bezier(0.12, 0.8, 0.25, 1)` : "none",
        }}
      >
        {strip.map((symbol, index) => (
          <div key={index} className="flex items-center justify-center" style={{ width: CELL_PX - 4, height: CELL_PX }}>
            <MonsterSprite monster={symbol} size={56} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Slots({ signedIn, wallet, walletFailed, retryWallet, setBalance }: RoomProps) {
  const [stake, setStake] = useState(5);
  const [strips, setStrips] = useState<string[][]>(() => Array.from({ length: SLOT_REELS }, () => [anySymbol()]));
  const [spinId, setSpinId] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Spin | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spin = async () => {
    setSpinning(true);
    setError(null);
    setResult(null);
    try {
      const spun = await casinoPost<Spin>("/slots/spin", { amount: stake });
      // The stake is gone now; the winnings land when the reels stop.
      setBalance(spun.balance - spun.payout);
      const still = prefersReducedMotion();
      setStrips((current) =>
        spun.reels.map((symbol, reel) =>
          still ? [symbol] : [symbol, ...Array.from({ length: ROLL_CELLS[reel] }, anySymbol), current[reel][0]]
        )
      );
      setSpinId((id) => id + 1);
      if (!still) await sleep(ROLL_MS[SLOT_REELS - 1] + 150);
      setBalance(spun.balance);
      setResult(spun);
    } catch (reason) {
      setError(errorMessage(reason, "Could not spin. Try again."));
    } finally {
      setSpinning(false);
    }
  };

  const litReels = result?.line === "three" ? SLOT_REELS : result?.line === "pair" ? 2 : 0;

  const stage = (
    <section className={`${PANEL} flex flex-col items-center gap-4 px-3 py-6 sm:py-10`}>
      <div className="flex gap-2 rounded-xl border-4 border-amber-700/80 bg-gradient-to-b from-red-950 to-purple-950 p-3 shadow-2xl sm:gap-3 sm:p-4" aria-hidden="true">
        {strips.map((strip, reel) => (
          <Reel key={reel} strip={strip} spinId={spinId} ms={ROLL_MS[reel]} lit={reel < litReels} />
        ))}
      </div>
      <div className="min-h-[1.75rem] text-center">
        {result ? (
          <Outcome payout={result.payout} stake={result.stake}>
            {result.reels.map((symbol) => getMonster(symbol).name).join(", ")}.
            {result.line && ` Pays ${result.multiplier}x.`}
          </Outcome>
        ) : (
          <p className="text-sm text-purple-200/70">{spinning ? "Spinning…" : "Match the first two reels, or all three."}</p>
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
            <PlayButton disabled={spinning || stake > maxStake(ready)} onClick={spin}>
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
      <p className="mt-2 text-xs text-purple-200/60">A win pays your bet times the number shown. Rarer monsters pay more.</p>
    </>
  );

  return <RoomLayout stage={stage} controls={controls} rules={rules} />;
}
