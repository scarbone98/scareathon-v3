import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Embers, Panel, Sprite } from "../Royale/ui/parts";
import { ORANGE, PURPLE, SPRITES } from "../Royale/ui/theme";
import {
  BUY_MODES, INVESTOR_SCALE, PORTFOLIO_STEPS, ROUNDS, SEANCES, UPGRADES, VENTURES,
  buy, buyQuote, buySeance, buyUpgrade, catchUp, claimableInvestors, haunt, hireManager,
  incomePerSec, investorBonus, investorsFor, lifetimeFor, minOwned, newState, nextPortfolio, roundAfter,
  start, tick, ventureStats, type BuyMode, type State,
} from "./game/economy";
import { formatDuration, formatMoney, formatNumber, formatShort } from "./game/format";
import { SaveStore, readLocal } from "./store";
import "./scare.css";

const MUTE_KEY = "scare-capitalist-muted";
// The leaderboard holds a plain number, so the score stops at 10^15 investors
const SCORE_CAP = 1e15;

const sheet = (url: string, frameWidth: number, frameHeight: number, frames: number) => ({ url, frameWidth, frameHeight, frames, height: 1 });
const ART: Record<string, ReturnType<typeof sheet>> = {
  candycorn: sheet("/sprites/candycornsprite.png", 24, 24, 6),
  gum: sheet("/sprites/bubblegumsprite.png", 24, 24, 6),
  rat: sheet("/sprites/rat.png", 16, 16, 6),
  pumpkin: sheet("/sprites/pumpkin.png", 16, 16, 6),
  candle: sheet("/sprites/candle.png", 32, 32, 6),
  imp: sheet("/sprites/imp.png", 16, 16, 4),
  ghost: sheet("/sprites/ghost.png", 16, 32, 6),
  zombie: sheet("/sprites/zombiesprite-1.png", 16, 24, 6),
  werewolf: sheet("/sprites/werewolfsprite.png", 30, 26, 7),
  ufo: sheet("/sprites/ufo.png", 32, 26, 6),
  scarecrow: sheet("/sprites/scarecrow.png", 24, 48, 6),
  shadowbeast: sheet("/sprites/shadowbeast.png", 32, 32, 6),
  swampthing: sheet("/sprites/swampthing.png", 34, 58, 6),
  candybar: sheet("/sprites/candybarsprite.png", 24, 24, 5),
  crow: sheet("/royale/crowFlap.png", 32, 32, 4),
  comet: sheet("/royale/comet.png", 32, 32, 1),
  joe: SPRITES.joe,
  matt: SPRITES.matt,
  alex: SPRITES.alex,
  jon: SPRITES.jon,
  skull: SPRITES.skull,
};

// A little cash-register blip, synthesized so there's nothing to load
let audio: AudioContext | null = null;
function blip(freq: number, muted: boolean, length = 0.08) {
  if (muted) return;
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + length);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + length);
  } catch {
    // No audio; fine.
  }
}

type Tab = "ventures" | "managers" | "sheets" | "investors" | "rounds";
const TABS: { id: Tab; label: string; sprite: string }[] = [
  { id: "ventures", label: "Ventures", sprite: "candycorn" },
  { id: "managers", label: "Managers", sprite: "joe" },
  { id: "sheets", label: "Upgrades", sprite: "candybar" },
  { id: "rounds", label: "Rounds", sprite: "candle" },
  { id: "investors", label: "Investors", sprite: "ghost" },
];

type Pop = { id: number; i: number; amount: number };

export default function ScareCapitalist() {
  const stateRef = useRef<State>(readLocal() ?? newState());
  // Saves here and to the account; null until it has looked for the account copy
  const storeRef = useRef<SaveStore | null>(null);
  const save = useCallback((now = false) => storeRef.current?.save(now), []);
  const [, setFrame] = useState(0);
  const [tab, setTab] = useState<Tab>("ventures");
  const [mode, setMode] = useState<BuyMode>(1);
  const [welcome, setWelcome] = useState<{ away: number; earned: number } | null>(null);
  const [confirmHaunt, setConfirmHaunt] = useState(false);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pops, setPops] = useState<Pop[]>([]);
  const popId = useRef(0);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const s = stateRef.current;
  const rerender = useCallback(() => setFrame((f) => f + 1), []);

  // Money made while the page was closed
  useEffect(() => {
    const back = catchUp(stateRef.current);
    if (back.away > 60 && back.earned > 0) setWelcome(back);
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(window.location.search);
      const cash = Number(params.get("cash"));
      if (cash > 0) stateRef.current.cash = cash;
      (window as unknown as { __scare: unknown }).__scare = { get state() { return stateRef.current; }, set state(v: State) { stateRef.current = v; }, tick: (dt: number) => tick(stateRef.current, dt) };
    }
    // The account's copy, if it's further along, takes over (with its own time away)
    let cancelled = false;
    void SaveStore.open(
      () => stateRef.current,
      (remote) => {
        stateRef.current = remote;
        const back = catchUp(remote);
        if (back.away > 60 && back.earned > 0) setWelcome(back);
        setFrame((f) => f + 1);
      },
    ).then((store) => {
      if (cancelled) return;
      storeRef.current = store;
      store.save();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The clock: rAF for smooth bars, re-rendering ~20 times a second
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let sinceRender = 0;
    const loop = (now: number) => {
      const dt = Math.min(OFFLINE_FRAME_CAP, (now - last) / 1000);
      last = now;
      const paid = tick(stateRef.current, dt);
      const fresh: Pop[] = [];
      paid.forEach((amount, i) => {
        if (amount > 0 && ventureStats(stateRef.current, i).time >= 0.6) fresh.push({ id: ++popId.current, i, amount });
      });
      if (fresh.length) {
        setPops((p) => [...p.slice(-12), ...fresh]);
        if (fresh.some((p) => !stateRef.current.ventures[p.i].managed)) blip(880, mutedRef.current, 0.06);
      }
      sinceRender += dt;
      if (sinceRender > 0.05) {
        sinceRender = 0;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const autosave = window.setInterval(() => save(), 5000);
    const onHide = () => {
      if (document.visibilityState === "hidden") save(true);
      // Back from a hidden tab: rAF was paused, so pay out the gap like a return visit
      else catchUp(stateRef.current);
    };
    const onUnload = () => save(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onUnload);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(autosave);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onUnload);
      save(true);
    };
  }, [save]);

  // Pops clear themselves once their animation is done
  useEffect(() => {
    if (!pops.length) return;
    const t = window.setTimeout(() => setPops((p) => p.slice(1)), 900);
    return () => window.clearTimeout(t);
  }, [pops]);

  const act = (fn: () => boolean, freq = 660) => {
    if (fn()) {
      blip(freq, muted);
      rerender();
    }
  };

  const doHaunt = () => {
    const before = stateRef.current.investorsClaimed;
    const next = haunt(stateRef.current);
    stateRef.current = next;
    save(true);
    setConfirmHaunt(false);
    setTab("ventures");
    blip(220, muted, 0.5);
    const score = Math.min(SCORE_CAP, next.investorsClaimed);
    // Only a haunt that adds 10% counts, so tiny back-to-back haunts can't farm tickets
    const counts = next.investorsClaimed - before >= before * 0.1;
    if (window.parent !== window && score > 0 && counts) window.parent.postMessage({ type: "PLAYER_DIED", score }, window.location.origin);
    rerender();
  };

  const toggleMute = () => {
    setMuted((m) => {
      try {
        localStorage.setItem(MUTE_KEY, m ? "0" : "1");
      } catch {
        // Not remembered.
      }
      return !m;
    });
  };

  const income = incomePerSec(s);
  const bonus = investorBonus(s);
  const claim = claimableInvestors(s);
  const managersAffordable = s.ventures.filter((v, i) => !v.managed && v.owned > 0 && s.cash >= VENTURES[i].manager.cost).length;
  const upgradesAffordable = UPGRADES.filter((u) => !s.upgrades.includes(u.id) && s.cash >= u.cost).length;

  return (
    <div className="cc-root sc-root sc-bg fixed inset-0 flex flex-col overflow-hidden text-[#ffe9c4]">
      <Embers count={10} />
      <Header s={s} income={income} bonus={bonus.mult} muted={muted} onMute={toggleMute} />
      <div className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-2">
        <div className={`mx-auto w-full ${tab === "ventures" ? "max-w-xl lg:max-w-5xl" : "max-w-xl"}`}>
          {tab === "ventures" && <Ventures s={s} mode={mode} setMode={setMode} pops={pops} act={act} />}
          {tab === "managers" && <Managers s={s} act={act} />}
          {tab === "sheets" && <Sheets s={s} act={act} />}
          {tab === "rounds" && <Rounds s={s} />}
          {tab === "investors" && <Investors s={s} claim={claim} onHaunt={() => setConfirmHaunt(true)} act={act} />}
        </div>
      </div>
      <nav className="relative flex shrink-0 justify-center">
        {TABS.map((t) => {
          const badge = t.id === "managers" ? managersAffordable : t.id === "sheets" ? upgradesAffordable : t.id === "investors" && claim > s.investors && claim > 0 ? 1 : 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`sc-tab ${tab === t.id ? "sc-tab-on" : ""} relative flex max-w-[120px] flex-1 flex-col items-center gap-0.5 pb-2 pt-1.5`}
            >
              <div className="flex h-7 items-center">
                <Sprite sprite={ART[t.sprite]} size={26} animate={tab === t.id} />
              </div>
              <span className="cc-outline-sm text-[11px] uppercase tracking-wide">{t.label}</span>
              {badge > 0 && (
                <span className="sc-badge cc-outline-sm absolute right-[18%] top-0.5 min-w-[18px] px-1 text-[10px] leading-[14px] text-white">
                  {t.id === "investors" ? "!" : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      {welcome && (
        <Modal>
          <div className="flex justify-center gap-2">
            <Sprite sprite={ART.ghost} size={44} />
            <Sprite sprite={ART.joe} size={40} />
          </div>
          <div className="cc-outline mt-2 text-center text-lg text-[#ffcf4a]">Welcome back!</div>
          <p className="cc-outline-sm mt-2 text-center text-sm">
            While you were out for {formatDuration(welcome.away)}, your managers made
          </p>
          <div className="cc-outline mt-1 text-center text-2xl text-[#8ef08a]">{formatMoney(welcome.earned)}</div>
          <Button color="green" className="mt-4 w-full py-1 text-lg" onClick={() => setWelcome(null)}>
            Collect
          </Button>
        </Modal>
      )}
      {confirmHaunt && (
        <Modal>
          <div className="cc-outline text-center text-xl" style={{ color: PURPLE }}>Haunt the market?</div>
          <p className="cc-outline-sm mt-2 text-center text-sm leading-snug">
            You lose your cash, ventures, managers and upgrades. You keep your séances, and{" "}
            <span className="text-[#c88cff]">{formatNumber(claim)}</span> new Phantom Investors join you, which brings your bonus from{" "}
            <span className="text-[#ffcf4a]">×{formatShort(bonus.mult)}</span> to{" "}
            <span className="text-[#8ef08a]">×{formatShort(1 + (s.investors + claim) * bonus.per)}</span>.
          </p>
          <div className="mt-4 flex gap-2">
            <Button color="stone" className="flex-1 py-1" onClick={() => setConfirmHaunt(false)}>
              Not yet
            </Button>
            <Button color="purple" className="flex-1 py-1" onClick={doHaunt}>
              Haunt
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// A hidden tab's rAF stops; when it resumes, catchUp pays the gap, so a frame never
// covers more than this
const OFFLINE_FRAME_CAP = 1;

function Modal({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b0712]/75 px-6">
      <Panel gold className="cc-pop w-full max-w-xs">
        {children}
      </Panel>
    </div>
  );
}

function Header({ s, income, bonus, muted, onMute }: { s: State; income: number; bonus: number; muted: boolean; onMute: () => void }) {
  return (
    <header className="relative shrink-0 border-b-[3px] border-[#140a1c] bg-[#1a0e24]/95 px-3 pb-2 pt-2">
      <div className="mx-auto flex max-w-xl items-start gap-2 lg:max-w-5xl">
        <div className="min-w-0 flex-1">
          <div className="cc-title text-[22px]" style={{ color: ORANGE, textShadow: "0 2px 0 #8a3a00, 0 4px 0 #140a1c" }}>
            SCARE <span style={{ color: "#c88cff", textShadow: "0 2px 0 #4a1a7a, 0 4px 0 #140a1c" }}>CAPITALIST</span>
          </div>
          <div className="cc-outline mt-1 truncate text-[26px] leading-tight text-white">{formatMoney(s.cash)}</div>
          <div className="cc-outline-sm text-sm text-[#8ef08a]">{formatMoney(income)}/s</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button type="button" onClick={onMute} aria-label={muted ? "Unmute" : "Mute"} className="cc-sbtn cc-sbtn-stone px-0 text-[10px]">
            <span>{muted ? "SND OFF" : "SND ON"}</span>
          </button>
          <div className="sc-chip cc-outline-sm flex items-center gap-1 px-1.5 py-0.5 text-xs">
            <Sprite sprite={ART.ghost} size={16} />
            <span className="text-[#c88cff]">{formatShort(s.investors)}</span>
            <span className="text-[#ffcf4a]">×{formatShort(bonus)}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function modeLabel(m: BuyMode) {
  return m === "next" ? "NEXT" : m === "max" ? "MAX" : `x${m}`;
}

function Ventures({ s, mode, setMode, pops, act }: { s: State; mode: BuyMode; setMode: (m: BuyMode) => void; pops: Pop[]; act: (fn: () => boolean, f?: number) => void }) {
  // Only the next venture to unlock shows; the rest stay a mystery
  const shown = Math.min(VENTURES.length, s.ventures.findIndex((v) => v.owned === 0) + 1 || VENTURES.length);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="cc-outline-sm text-xs uppercase tracking-widest text-[#c8b0dc]">Buy</span>
        <div className="flex gap-1">
          {BUY_MODES.map((m) => (
            <button
              key={String(m)}
              type="button"
              onClick={() => setMode(m)}
              className={`sc-chip cc-outline-sm px-2 py-0.5 text-xs ${mode === m ? "text-white" : "text-[#ffe9c4]"}`}
              style={mode === m ? { background: ORANGE } : undefined}
            >
              {modeLabel(m)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {VENTURES.slice(0, shown).map((def, i) =>
          s.ventures[i].owned === 0 ? (
            <LockedRow key={def.id} s={s} i={i} act={act} />
          ) : (
            <VentureRow key={def.id} s={s} i={i} mode={mode} pops={pops.filter((p) => p.i === i)} act={act} />
          ),
        )}
      </div>
      {shown < VENTURES.length && (
        <div className="cc-outline-sm py-2 text-center text-xs text-[#8a7a9c]">{VENTURES.length - shown} more ventures lurk in the dark…</div>
      )}
    </div>
  );
}

function LockedRow({ s, i, act }: { s: State; i: number; act: (fn: () => boolean, f?: number) => void }) {
  const def = VENTURES[i];
  const can = s.cash >= def.cost0;
  return (
    <div className="sc-row sc-row-locked flex items-center gap-3 p-2">
      <div className="sc-icon flex h-16 w-16 shrink-0 items-center justify-center">
        <Sprite sprite={ART[def.sprite]} size={40} animate={false} style={{ filter: can ? "brightness(0.8)" : "brightness(0) opacity(0.5)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="cc-outline-sm truncate text-base text-[#c8b0dc]">{can ? def.name : "???"}</div>
        <Button color={can ? "orange" : "stone"} disabled={!can} className="mt-1 w-full py-0 text-sm" onClick={() => act(() => buy(s, i, 1), 520)}>
          Unlock {formatMoney(def.cost0)}
        </Button>
      </div>
    </div>
  );
}

function VentureRow({ s, i, mode, pops, act }: { s: State; i: number; mode: BuyMode; pops: Pop[]; act: (fn: () => boolean, f?: number) => void }) {
  const def = VENTURES[i];
  const v = s.ventures[i];
  const st = ventureStats(s, i);
  const quote = buyQuote(s, i, mode);
  const can = quote.cost <= s.cash && Number.isFinite(quote.cost);
  const next = roundAfter(v.owned);
  const prevAt = [...ROUNDS].reverse().find((r) => r.at <= v.owned)?.at ?? 0;
  const roundFrac = next ? (v.owned - prevAt) / (next.at - prevAt) : 1;
  const blur = st.time < 0.25 && v.running;
  const idle = !v.running && !v.managed;
  const remaining = v.running ? (1 - v.progress) * st.time : st.time;
  return (
    <div className="sc-row flex items-center gap-2 p-2">
      <button type="button" onClick={() => act(() => start(s, i), 440)} className="relative flex w-[68px] shrink-0 flex-col items-center" aria-label={`Run ${def.name}`}>
        <div className={`sc-icon flex h-16 w-16 items-center justify-center ${idle ? "sc-icon-idle" : ""}`}>
          <Sprite sprite={ART[def.sprite]} size={40} animate={v.running} />
        </div>
        <div className="sc-bar -mt-2 h-[14px] w-[64px]">
          <div className="sc-round-fill" style={{ width: `${roundFrac * 100}%` }} />
          <span className="cc-outline-sm absolute inset-0 text-center text-[10px] leading-[11px] text-white">{formatNumber(v.owned)}</span>
        </div>
        {pops.map((p) => (
          <span key={p.id} className="sc-rise cc-outline-sm pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap text-xs text-[#8ef08a]">
            +{formatShort(p.amount)}
          </span>
        ))}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="cc-outline-sm truncate text-[13px] text-[#ffcf4a]">{def.name}</span>
          {v.managed ? (
            <span className="cc-outline-sm shrink-0 text-[10px] uppercase text-[#8ef08a]">{def.manager.name}</span>
          ) : (
            idle && <span className="cc-outline-sm shrink-0 text-[10px] uppercase text-[#ffcf4a]">Tap!</span>
          )}
        </div>
        <div className="sc-bar mt-0.5 h-6">
          <div className={`sc-bar-fill ${blur ? "sc-bar-blur" : ""}`} style={{ width: `${blur ? 100 : v.progress * 100}%` }} />
          <span className="cc-outline-sm absolute inset-0 flex items-center justify-center text-[13px] text-white">
            {blur ? `${formatMoney(st.perSec)}/s` : formatMoney(st.payout)}
          </span>
        </div>
        <div className="mt-1 flex items-stretch gap-1">
          <Button color={can ? "orange" : "stone"} disabled={!can} className="min-w-0 flex-1 px-0 py-0 text-[11px]" onClick={() => act(() => buy(s, i, mode))}>
            <span className="truncate">
              x{formatShort(quote.k)} · {formatMoney(quote.cost)}
            </span>
          </Button>
          <div className="sc-chip cc-outline-sm flex w-[62px] shrink-0 items-center justify-center text-[11px] text-[#c8b0dc]">
            {blur ? "—" : formatDuration(remaining)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Managers({ s, act }: { s: State; act: (fn: () => boolean, f?: number) => void }) {
  return (
    <div className="space-y-2">
      <Blurb>Managers run a venture on their own, forever, even while you're away.</Blurb>
      {VENTURES.map((def, i) => {
        const v = s.ventures[i];
        if (v.owned === 0 && !v.managed) return <Hidden key={def.id} text="??? (unlock their venture first)" />;
        const can = !v.managed && s.cash >= def.manager.cost;
        return (
          <div key={def.id} className="sc-row flex items-center gap-3 p-2">
            <div className="sc-icon flex h-14 w-14 shrink-0 items-center justify-center">
              <Sprite sprite={ART[def.manager.sprite]} size={36} animate={v.managed} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="cc-outline-sm text-sm text-[#ffcf4a]">{def.manager.name}</div>
              <div className="cc-outline-sm truncate text-xs text-[#c8b0dc]">Runs {def.name}</div>
            </div>
            {v.managed ? (
              <span className="cc-outline-sm px-2 text-xs uppercase text-[#8ef08a]">Hired</span>
            ) : (
              <Button color={can ? "green" : "stone"} disabled={!can} className="w-[132px] shrink-0 px-0 py-0 text-[11px]" onClick={() => act(() => hireManager(s, i), 780)}>
                {formatMoney(def.manager.cost)}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Sheets({ s, act }: { s: State; act: (fn: () => boolean, f?: number) => void }) {
  const open = UPGRADES.filter((u) => !s.upgrades.includes(u.id));
  const affordable = open.filter((u) => u.cost <= s.cash);
  const buyAll = () => {
    let any = false;
    for (const u of open) if (buyUpgrade(s, u.id)) any = true;
    return any;
  };
  return (
    <div className="space-y-2">
      <Blurb>Each upgrade doubles a venture's profit, or everything's. {s.upgrades.length} of {UPGRADES.length} signed.</Blurb>
      {affordable.length > 1 && (
        <Button color="green" className="w-full py-0 text-sm" onClick={() => act(buyAll, 780)}>
          Sign all {affordable.length} you can afford
        </Button>
      )}
      {open.slice(0, 12).map((u) => {
        const can = u.cost <= s.cash;
        const sprite = u.target === "all" ? "skull" : VENTURES[u.target].sprite;
        return (
          <div key={u.id} className="sc-row flex items-center gap-3 p-2">
            <div className="sc-icon flex h-12 w-12 shrink-0 items-center justify-center">
              <Sprite sprite={ART[sprite]} size={30} animate={can} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="cc-outline-sm text-[13px] leading-tight text-[#ffcf4a]">{u.name}</div>
              <div className="cc-outline-sm text-xs text-[#8ef08a]">{u.target === "all" ? "Everything" : "Profit"} ×{u.x}</div>
            </div>
            <Button color={can ? "orange" : "stone"} disabled={!can} className="w-[132px] shrink-0 px-0 py-0 text-[11px]" onClick={() => act(() => buyUpgrade(s, u.id), 780)}>
              {formatMoney(u.cost)}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function Rounds({ s }: { s: State }) {
  const low = minOwned(s);
  const nextPort = nextPortfolio(low);
  return (
    <div className="space-y-2">
      <Blurb>Own enough of a venture and it closes a funding round: a faster cycle or a bigger payout.</Blurb>
      <Panel className="text-sm">
        <div className="cc-outline-sm text-[#ffcf4a]">Portfolio round</div>
        <div className="cc-outline-sm text-xs leading-snug">
          {nextPort
            ? `Own at least ${nextPort} of every venture: ${nextPort <= 100 ? "all ventures twice as fast" : "all profits ×2"}. Your smallest holding: ${low}.`
            : "Every portfolio round closed."}
        </div>
        <div className="sc-bar mt-1 h-3">
          <div className="sc-round-fill" style={{ width: `${nextPort ? (low / nextPort) * 100 : 100}%` }} />
        </div>
        <div className="cc-outline-sm mt-1 text-[10px] text-[#8a7a9c]">Steps: {PORTFOLIO_STEPS.join(", ")}</div>
      </Panel>
      {VENTURES.map((def, i) => {
        const v = s.ventures[i];
        if (v.owned === 0) return null;
        const r = roundAfter(v.owned);
        const st = ventureStats(s, i);
        return (
          <div key={def.id} className="sc-row flex items-center gap-3 p-2">
            <div className="sc-icon flex h-12 w-12 shrink-0 items-center justify-center">
              <Sprite sprite={ART[def.sprite]} size={30} animate={false} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="cc-outline-sm truncate text-[13px] text-[#ffcf4a]">{def.name}</div>
              <div className="cc-outline-sm text-xs">
                {r ? (
                  <>
                    {r.name} at <span className="text-white">{r.at}</span> ({r.at - v.owned} to go):{" "}
                    <span className="text-[#8ef08a]">{r.speed > 1 ? `speed ×${r.speed}` : `profit ×${r.profit}`}</span>
                  </>
                ) : (
                  "Every round closed"
                )}
              </div>
              <div className="cc-outline-sm text-[10px] text-[#8a7a9c]">
                Now: speed ×{formatShort(st.speedMult)}, cycle {formatDuration(st.time)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Investors({ s, claim, onHaunt, act }: { s: State; claim: number; onHaunt: () => void; act: (fn: () => boolean, f?: number) => void }) {
  const bonus = investorBonus(s);
  const total = investorsFor(s.lifetime);
  const nextAt = lifetimeFor(total + 1);
  const worth = claim > 0 && claim >= Math.max(1, s.investors);
  const shownSeances = useMemo(() => SEANCES, []);
  return (
    <div className="space-y-2">
      <Panel gold className="text-center">
        <div className="flex justify-center gap-1">
          <Sprite sprite={ART.ghost} size={40} />
          <Sprite sprite={ART.ghost} size={30} style={{ opacity: 0.7 }} />
        </div>
        <div className="cc-outline-sm mt-1 text-xs uppercase tracking-widest">Phantom Investors</div>
        <div className="cc-outline text-3xl text-[#c88cff]">{formatNumber(s.investors)}</div>
        <div className="cc-outline-sm text-sm">
          each +{Math.round(bonus.per * 100)}% profit · total <span className="text-[#ffcf4a]">×{formatShort(bonus.mult)}</span>
        </div>
      </Panel>
      <Panel className="text-sm">
        <div className="cc-outline-sm leading-snug">
          The ghosts of failed founders back you in proportion to the cube root of every dollar you've ever made:
        </div>
        <div className="cc-outline-sm my-1 text-center text-[#ffcf4a]">investors = {INVESTOR_SCALE} × ∛(lifetime ÷ $10 Trillion)</div>
        <div className="cc-outline-sm text-xs leading-snug text-[#c8b0dc]">
          Lifetime: {formatMoney(s.lifetime)} · earned in all: {formatNumber(total)}
          <br />
          Next investor at {formatMoney(nextAt)} lifetime
        </div>
        <div className="cc-outline mt-2 text-center text-xl">
          +{formatNumber(claim)} <span className="text-sm text-[#c8b0dc]">on haunting</span>
        </div>
        <Button color={claim > 0 ? "purple" : "stone"} disabled={claim === 0} className={`relative mt-2 w-full overflow-hidden py-1 text-lg ${worth ? "cc-shine" : ""}`} onClick={onHaunt}>
          Haunt the market
        </Button>
        <div className="cc-outline-sm mt-1 text-center text-[11px] text-[#8a7a9c]">
          {worth ? "Worth it: this at least doubles your investors." : "Tip: haunt once it would at least double your investors."}
        </div>
      </Panel>
      <div className="cc-outline-sm pt-1 text-center text-xs uppercase tracking-widest text-[#ffcf4a]">Séances</div>
      <Blurb>Spend investors on permanent boons. They stay through every haunt, but spent investors stop counting toward your bonus.</Blurb>
      {shownSeances.map((se) => {
        const owned = s.seances.includes(se.id);
        const can = !owned && s.investors >= se.cost;
        const effect = se.kind === "profit" ? `All profit ×${se.x}` : se.kind === "bonus" ? `+${Math.round(se.x * 100)}% per investor` : se.x === 1 ? "Start each run with Joe hired" : "Start each run with $1 Million";
        return (
          <div key={se.id} className="sc-row flex items-center gap-3 p-2">
            <div className="sc-icon flex h-12 w-12 shrink-0 items-center justify-center">
              <Sprite sprite={ART.candle} size={30} animate={owned} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="cc-outline-sm truncate text-[13px] text-[#ffcf4a]">{se.name}</div>
              <div className="cc-outline-sm text-xs text-[#8ef08a]">{effect}</div>
            </div>
            {owned ? (
              <span className="cc-outline-sm px-2 text-xs uppercase text-[#8ef08a]">Done</span>
            ) : (
              <Button color={can ? "purple" : "stone"} disabled={!can} className="w-[120px] shrink-0 px-0 py-0 text-[11px]" onClick={() => act(() => buySeance(s, se.id), 330)}>
                {formatShort(se.cost)}
                <Sprite sprite={ART.ghost} size={14} animate={false} />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Blurb({ children }: { children: ReactNode }) {
  return <p className="cc-outline-sm px-1 text-xs leading-snug text-[#c8b0dc]">{children}</p>;
}

function Hidden({ text }: { text: string }) {
  return <div className="sc-row sc-row-locked cc-outline-sm p-3 text-center text-xs text-[#6a5a7c]">{text}</div>;
}
