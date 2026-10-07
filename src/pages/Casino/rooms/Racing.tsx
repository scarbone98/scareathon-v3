import { useEffect, useRef, useState } from "react";
import { makeRaceCard, racePayout } from "../../../../server/shared/casino/index.js";
import { getMonster } from "../../../../server/shared/monster-bash/index.js";
import { MonsterSprite, Outcome, PanelHeading, PlayButton, PlayGate, RoomLayout, StakePicker } from "../parts";
import { type RoomProps, CasinoError, casinoGet, casinoPost, errorMessage, formatCoins, maxStake, PANEL, prefersReducedMotion } from "../wallet";

type Card = { id: string; runners: { monster: string; odds: number }[] };
type Race = { order: number[]; winner: number; times: number[]; lane: number; stake: number; payout: number; balance: number; next: Card };

const LANE_COLORS = ["#d95926", "#3987e5", "#3fa34d", "#c9a227", "#b04fc4", "#d9d9d9"];
const PLACES = ["1st", "2nd", "3rd", "4th", "5th", "6th"];
const SPRITE_PX = 40;
// How long the finish stays on screen before the result is called.
const LINGER_SECONDS = 0.4;

// Something for guests to look at: the real card comes from the server.
const sampleCard = (): Card => ({ id: "sample", runners: makeRaceCard(Math.random).map(({ monster, odds }) => ({ monster, odds })) });

// How far down the track (0 to 1) a lane is `seconds` into a race it finishes
// in `finish`. Each lane surges and fades a little differently, but never
// goes backwards and always arrives on time.
function progress(lane: number, seconds: number, finish: number) {
  const u = Math.min(1, Math.max(0, seconds / finish));
  const surges = 1 + (lane % 3) * 0.5;
  return u + 0.05 * Math.sin(Math.PI * u) * Math.sin(2 * Math.PI * surges * u + lane * 1.7);
}

function Track({ card, race, clock, pick }: { card: Card; race: Race | null; clock: number; pick: number | null }) {
  const running = race !== null && clock < Math.max(...race.times);
  return (
    <div className="flex flex-col gap-1 rounded-md bg-[#0b0617] p-2" aria-hidden="true">
      {card.runners.map((runner, lane) => {
        const at = race ? progress(lane, clock, race.times[lane]) : 0;
        const place = race && clock >= race.times[lane] ? race.order.indexOf(lane) : -1;
        return (
          <div key={lane} className={`flex items-center gap-2 rounded ${pick === lane ? "bg-white/10" : ""}`}>
            <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums" style={{ color: LANE_COLORS[lane] }}>
              {lane + 1}
            </span>
            <div className="relative h-11 min-w-0 flex-1 border-b border-dashed border-purple-900/70">
              {/* The finish line, a sprite's width in from the end */}
              <div className="absolute inset-y-0 w-1 bg-[repeating-linear-gradient(0deg,#fff_0_4px,#000_4px_8px)] opacity-70" style={{ right: SPRITE_PX }} />
              <div className="absolute bottom-0" style={{ left: `calc((100% - ${SPRITE_PX * 2}px) * ${at})` }}>
                <MonsterSprite monster={runner.monster} size={SPRITE_PX} walking={running && place < 0} />
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
  const [sample] = useState(sampleCard);
  const [card, setCard] = useState<Card | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [stake, setStake] = useState(5);
  const [race, setRace] = useState<Race | null>(null);
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef(0);
  const track = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    casinoGet<Card>("/racing/card")
      .then((next) => active && setCard(next))
      .catch((reason) => active && setError(errorMessage(reason, "Could not load the next race.")));
    return () => {
      active = false;
    };
  }, [signedIn]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const start = async () => {
    if (!card || pick === null) return;
    setBusy(true);
    setError(null);
    try {
      const ran = await casinoPost<Race>("/racing/bet", { cardId: card.id, lane: pick, amount: stake });
      setBalance(ran.balance - ran.payout);
      setRace(ran);
      track.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const length = Math.max(...ran.times) + LINGER_SECONDS;
      const finish = () => {
        setClock(length);
        setBalance(ran.balance);
        setFinished(true);
        setBusy(false);
      };
      if (prefersReducedMotion()) return finish();
      const began = performance.now();
      const step = (now: number) => {
        const seconds = (now - began) / 1000;
        if (seconds >= length) return finish();
        setClock(seconds);
        frame.current = requestAnimationFrame(step);
      };
      setClock(0);
      frame.current = requestAnimationFrame(step);
    } catch (reason) {
      // Another tab already ran this race: the server sends the next card along.
      if (reason instanceof CasinoError && reason.code === "race_changed" && reason.body.card) {
        setCard(reason.body.card as Card);
        setPick(null);
      }
      setError(errorMessage(reason, "Could not start the race. Try again."));
      setBusy(false);
    }
  };

  const nextRace = () => {
    if (!race) return;
    setCard(race.next);
    setRace(null);
    setFinished(false);
    setPick(null);
    setClock(0);
  };

  const shown = card ?? sample;
  const name = (lane: number) => getMonster(shown.runners[lane].monster).name;

  const stage = (
    <section ref={track} className={`${PANEL} flex flex-col gap-3 p-3 sm:p-4`}>
      <Track card={shown} race={race} clock={clock} pick={race ? race.lane : pick} />
      <div className="min-h-[1.75rem]">
        {race && finished ? (
          <Outcome payout={race.payout} stake={race.stake}>
            {name(race.winner)} wins{race.winner === race.lane ? "!" : `. ${name(race.lane)} came in ${PLACES[race.order.indexOf(race.lane)]}.`}
          </Outcome>
        ) : (
          <p className="text-sm text-purple-200/70">{race ? "And they're off…" : "Six monsters, one sprint. Back the winner."}</p>
        )}
      </div>
    </section>
  );

  const controls = (
    <>
      <PanelHeading wallet={wallet}>{race ? "Your bet" : "Pick a monster"}</PanelHeading>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pick a monster">
        {shown.runners.map((runner, lane) => {
          const selected = (race ? race.lane : pick) === lane;
          return (
            <button
              key={lane}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!card || race !== null || busy}
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
                <span className="text-xs text-purple-200/70 tabular-nums">Pays {runner.odds.toFixed(1)}x</span>
              </span>
            </button>
          );
        })}
      </div>
      <PlayGate signedIn={signedIn} wallet={wallet} walletFailed={walletFailed} retryWallet={retryWallet}>
        {(ready) =>
          race ? (
            <PlayButton disabled={!finished} onClick={nextRace}>
              {finished ? "Next race" : "Racing…"}
            </PlayButton>
          ) : (
            <>
              <StakePicker wallet={ready} stake={stake} onChange={setStake} disabled={busy} />
              <PlayButton disabled={busy || !card || pick === null || stake > maxStake(ready)} onClick={start}>
                {pick === null
                  ? "Pick a monster"
                  : `Bet ${stake} on ${name(pick)} (pays ${formatCoins(racePayout(stake, shown.runners[pick].odds))})`}
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
        Every race has a new field. The favourites pay less and the long shots pay more: a monster that pays 4.0x turns 10 coins into 40 if it
        comes first.
      </p>
      <p className="mt-2 text-xs text-purple-200/60">Only first place pays. The race is run the moment you bet, then shown.</p>
    </>
  );

  return <RoomLayout stage={stage} controls={controls} rules={rules} />;
}
