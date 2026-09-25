// Frog Ball's in-game screens: the HUD, stage intro, banners, the goal
// tally, pause, and the game over run (continue, initials, ranking).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BannerKind, ClearInfo, Hud, RunResult } from "../game/controller";
import { sfx } from "../game/sfx";
import { STAGES, WORLDS } from "../game/stages";
import { useMenuInput } from "./hooks";
import { Hints, MenuList, RankingTable, type MenuItem } from "./menus";
import { ArcadeText, Cursor, FrogFace, Fly } from "./pixels";
import { KEYS, pad, RAINBOW, stagesFor, WORLD_COLORS } from "./theme";
import { ordinal, type RankEntry } from "./storage";

const SEGMENTS = 12;

// Your partner in co-op, for the HUD.
export interface PartnerInfo {
  name: string;
  seat: 0 | 1;
  connected: boolean;
  rtt: number;
}
const TOP_SPEED = 110; // km/h that fills the gauge

// --- HUD -----------------------------------------------------------------------------

export function HudView({ hud, portrait, partner, onPause }: { hud: Hud; portrait: boolean; partner?: PartnerInfo; onPause: () => void }) {
  const stage = stagesFor(hud.coop)[hud.stage];
  const color = WORLD_COLORS[stage.world];
  const secs = Math.floor(hud.timeLeft);
  const hund = Math.floor((hud.timeLeft - secs) * 100);
  const low = hud.timeLeft < 10 && hud.timeLeft > 0;
  const lit = Math.round(Math.min(1, hud.speed / TOP_SPEED) * SEGMENTS);
  return (
    <div className="fb-passthru pointer-events-none absolute inset-0">
      {/* score and stage */}
      <div className="absolute left-3 top-3">
        {hud.practice ? (
          <div className="fb-o text-[8px] text-[var(--cyan)]">PRACTICE</div>
        ) : (
          <>
            <div className="fb-o text-[8px] text-[var(--pink)]">SCORE</div>
            <div className="fb-o mt-1.5 text-[16px] text-white">{pad(hud.score)}</div>
          </>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="px-1.5 py-1 text-[8px] text-[var(--ink)]" style={{ background: color, boxShadow: "0 -1px 0 #1a1033, 0 1px 0 #1a1033, -1px 0 0 #1a1033, 1px 0 0 #1a1033" }}>
            {stage.id}
          </span>
          <span className="fb-o text-[8px] text-[var(--cream)]">{stage.name.toUpperCase()}</span>
        </div>
        {partner && (
          <div className="mt-2 flex items-center gap-1.5 text-[8px]">
            <span className="h-[6px] w-[6px]" style={{ background: partner.seat === 1 ? "#ff5fa8" : "#8cff5a", boxShadow: "0 0 0 1px #1a1033" }} />
            <span className="fb-o text-white">{partner.name}</span>
            {partner.connected ? (
              <span className="fb-o" style={{ color: partner.rtt < 120 ? "#8cff5a" : partner.rtt < 250 ? "#ffd23f" : "#ff4a4a" }}>
                {partner.rtt}MS
              </span>
            ) : (
              <span className="fb-o fb-blink text-[var(--pink)]">LOST CONNECTION</span>
            )}
          </div>
        )}
      </div>

      {/* the clock */}
      <div className={`absolute left-1/2 flex -translate-x-1/2 flex-col items-center ${portrait ? "top-[62px]" : "top-2"}`}>
        <span className="fb-o text-[8px] text-[var(--yellow)]">TIME</span>
        <div className="mt-1 flex items-end">
          <span key={low ? secs : "n"} className={low ? "fb-tick" : ""}>
            <ArcadeText text={String(secs).padStart(2, "0")} size={32} face={low ? "#ff4a4a" : "#ffffff"} top={low ? "#ffa0a0" : "#ffffff"} side={low ? "#8a1020" : "#8a7ad0"} depth={3} />
          </span>
          <span className="fb-o mb-[5px] ml-0.5 text-[16px]" style={{ color: low ? "#ff4a4a" : "#fff3c4" }}>
            .{String(hund).padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* lives, flies, pause */}
      <div className="absolute right-3 top-3 flex items-start gap-3">
        <div className="flex flex-col items-end gap-2">
          {!hud.practice && (
            <div className="flex items-center gap-1.5">
              <FrogFace scale={2} />
              <span className="fb-o text-[16px] text-white">
                <span className="text-[8px]">x</span>
                {Math.max(0, hud.lives)}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Fly scale={2} />
            <span className="fb-o text-[16px] text-[var(--yellow)]">{pad(hud.flies, 3)}</span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Pause"
          onClick={onPause}
          className="fb-item pointer-events-auto flex h-[22px] w-[22px] items-center justify-center gap-[3px]"
        >
          <span className="h-[9px] w-[3px] bg-[var(--cream)] shadow-[0_0_0_1px_#1a1033]" />
          <span className="h-[9px] w-[3px] bg-[var(--cream)] shadow-[0_0_0_1px_#1a1033]" />
        </button>
      </div>

      {/* speed gauge */}
      <div className="absolute bottom-3 right-3 flex flex-col items-end">
        <div className="flex items-end gap-1">
          <span className="fb-o text-[16px] text-white">{String(hud.speed).padStart(3, " ")}</span>
          <span className="fb-o mb-px text-[8px] text-[var(--cyan)]">KM/H</span>
        </div>
        <div className="mt-1.5 flex gap-[2px] p-[2px]" style={{ background: "#1a1033" }}>
          {Array.from({ length: SEGMENTS }, (_, i) => {
            const on = i < lit;
            const c = i < 6 ? "#8cff5a" : i < 9 ? "#ffd23f" : "#ff4a4a";
            return <span key={i} className="h-[6px] w-[5px]" style={{ background: on ? c : "#3a2d6a", height: 4 + Math.round(i * 0.5) }} />;
          })}
        </div>
      </div>
    </div>
  );
}

// --- stage intro and banners -------------------------------------------------------------

export function StageIntro({ stage, coop = false }: { stage: number; coop?: boolean }) {
  const s = stagesFor(coop)[stage];
  const color = WORLD_COLORS[s.world];
  return (
    <div className="fb-passthru pointer-events-none absolute inset-x-0 top-[17%]">
      <div className="fb-band flex flex-col items-center py-2.5" style={{ background: "rgba(26,16,51,.82)", boxShadow: `0 -3px 0 ${color}, 0 3px 0 ${color}, 0 -4px 0 #1a1033, 0 4px 0 #1a1033` }}>
        <span className="fb-o text-[8px]" style={{ color }}>
          WORLD {s.world + 1} - {WORLDS[s.world].name.toUpperCase()}
        </span>
        <ArcadeText text={coop ? `CO-OP ${s.id.slice(2)}` : `STAGE ${s.id}`} size={24} face="#ffffff" side={color} depth={3} className="mt-2" />
        <span className="fb-o mt-1 text-[16px] text-[var(--yellow)]">{s.name.toUpperCase()}</span>
      </div>
    </div>
  );
}

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        dx: `${Math.round((Math.random() - 0.5) * 520)}px`,
        dy: `${Math.round(Math.random() * 260 - 140)}px`,
        r: `${Math.round(Math.random() * 720)}deg`,
        c: RAINBOW[i % RAINBOW.length][0],
        d: Math.random() * 0.25,
      })),
    []
  );
  return (
    <div className="absolute left-1/2 top-1/2">
      {bits.map((b, i) => (
        <span key={i} className="fb-confetti" style={{ background: b.c, "--dx": b.dx, "--dy": b.dy, "--r": b.r, animationDelay: `${b.d}s`, boxShadow: "0 0 0 1px #1a1033" } as CSSProperties} />
      ))}
    </div>
  );
}

export function Banner({ kind, text }: { kind: BannerKind; text: string }) {
  switch (kind) {
    case "ready":
      return (
        <Center top="64%">
          <ArcadeText text={text} size={40} face="#ffd23f" side="#c2560a" depth={5} anim="drop" />
        </Center>
      );
    case "go":
      return (
        <Center top="44%">
          <span className="fb-a-punch inline-block">
            <ArcadeText text={text} size={56} face="#8cff5a" side="#2f8a3c" depth={6} />
          </span>
        </Center>
      );
    case "goal":
      return (
        <Center top="30%">
          <Confetti />
          <ArcadeText text={text} size={56} colors={RAINBOW} depth={6} anim="wave" />
        </Center>
      );
    case "fall":
      return (
        <Center top="40%">
          <ArcadeText text={text} size={40} face="#ff5fa8" side="#8a1a50" depth={5} anim="fall" />
        </Center>
      );
    case "time":
      return (
        <Center top="40%">
          <span className="fb-a-shake inline-block">
            <ArcadeText text={text} size={40} face="#ff4a4a" side="#8a1020" depth={5} />
          </span>
        </Center>
      );
    case "hurry":
      return (
        <Center top="62%">
          <span className="fb-blink-fast inline-block">
            <ArcadeText text={text} size={24} face="#ff8a1f" side="#8a2a00" depth={3} />
          </span>
        </Center>
      );
    case "coop":
      return (
        <Center top="62%">
          <span className="fb-a-float inline-block" style={{ animationDuration: "1.8s" }}>
            <ArcadeText text={text} size={16} face="#45e3ff" side="#1f4fb0" depth={2} />
          </span>
        </Center>
      );
    case "oneup":
      return (
        <div className="fb-passthru pointer-events-none absolute right-10 top-14">
          <span className="fb-a-float inline-block">
            <ArcadeText text={text} size={16} face="#8cff5a" side="#2f8a3c" depth={2} />
          </span>
        </div>
      );
  }
}

function Center({ top, children }: { top: string; children: ReactNode }) {
  return (
    <div className="fb-passthru pointer-events-none absolute inset-x-0 flex justify-center" style={{ top, transform: "translateY(-50%)" }}>
      {children}
    </div>
  );
}

// --- goal tally --------------------------------------------------------------------------

// Counts the bonuses up one after another, arcade style.
export function Tally({ info, practice, stageTime, touch, onSkip }: { info: ClearInfo; practice: boolean; stageTime: number; touch: boolean; onSkip: () => void }) {
  const [t, setT] = useState(0);
  const lastTick = useRef(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      const e = now - t0;
      setT(e);
      if (e < 3200) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const k = (from: number, dur: number) => Math.max(0, Math.min(1, (t - from) / dur));
  const timeK = k(700, 700);
  const flyK = k(1500, 450);
  const showTotal = t > 2100;
  const counting = (timeK > 0 && timeK < 1) || (flyK > 0 && flyK < 1);
  useEffect(() => {
    if (counting && t - lastTick.current > 45) {
      lastTick.current = t;
      sfx.tally();
    }
  }, [t, counting]);
  useMenuInput(true, { ok: onSkip });

  const cleared = stageTime - info.timeBonus / 100;
  const Row = ({ label, value, color, dim }: { label: string; value: string; color: string; dim?: boolean }) => (
    <div className={`flex justify-between gap-6 text-[8px] ${dim ? "opacity-0" : ""}`}>
      <span className="fb-o text-[var(--cream)]">{label}</span>
      <span className="fb-o" style={{ color }}>
        {value}
      </span>
    </div>
  );
  return (
    <div className="fb-passthru pointer-events-none absolute inset-x-0 top-[50%] flex justify-center">
      <div onClick={onSkip} className="fb-panel fb-rise pointer-events-auto w-[236px] px-4 pb-3 pt-3" style={{ animationDelay: "0.5s" }}>
        <div className="mb-2.5 text-center">
          <span className="fb-o text-[8px] text-[var(--cyan)]">CLEAR TIME {cleared.toFixed(2)}</span>
        </div>
        <div className="flex flex-col gap-2">
          <Row label="TIME BONUS" value={pad(info.timeBonus * timeK, 5)} color="#ffffff" dim={t < 700} />
          <Row label="FLY BONUS" value={pad(info.flyBonus * flyK, 5)} color="#ffd23f" dim={t < 1500} />
          {info.fast && (
            <div className={`text-center text-[8px] ${t < 1950 ? "opacity-0" : ""}`}>
              <span className="fb-o fb-rainbow">SPEEDY! SCORE X2</span>
            </div>
          )}
        </div>
        {!practice && (
          <div className={`mt-2.5 flex items-center justify-between border-t-2 border-[#43308f] pt-2.5 ${showTotal ? "fb-pop" : "opacity-0"}`}>
            <span className="fb-o text-[8px] text-[var(--pink)]">STAGE</span>
            <span className="fb-o text-[16px] text-white">{pad(info.total, 6)}</span>
          </div>
        )}
        <div className="mt-2.5 text-center text-[8px]">
          <span className="fb-o fb-blink text-[var(--cream)]">{touch ? "TAP TO SKIP" : "ENTER TO SKIP"}</span>
        </div>
      </div>
    </div>
  );
}

// --- pause ----------------------------------------------------------------------------------

export function Pause({
  practice,
  coop = false,
  lives,
  touch,
  sound,
  onResume,
  onRetry,
  onSound,
  onQuit,
}: {
  practice: boolean;
  coop?: boolean;
  lives: number;
  touch: boolean;
  sound: boolean;
  onResume: () => void;
  onRetry: () => void;
  onSound: () => void;
  onQuit: () => void;
}) {
  // A co-op world can't stop for one player, so there's no retry either.
  const rows: (MenuItem & { act: () => void })[] = coop
    ? [{ label: "CONTINUE", act: onResume }]
    : [
        { label: "CONTINUE", act: onResume },
        { label: "RETRY", note: practice ? undefined : "-1 LIFE", disabled: !practice && lives <= 0, act: onRetry },
      ];
  rows.push({ label: "SOUND", value: sound ? "ON" : "OFF", act: onSound });
  rows.push({ label: coop ? "LEAVE ROOM" : "QUIT", act: onQuit });
  const [sel, setSel] = useState(0);
  const pick = (i: number) => {
    const r = rows[i];
    if (r.disabled) {
      sfx.denied();
      return;
    }
    sfx.select();
    r.act();
  };
  const move = (d: number) => {
    setSel((s) => (s + d + rows.length) % rows.length);
    sfx.move();
  };
  useMenuInput(true, {
    up: () => move(-1),
    down: () => move(1),
    left: () => rows[sel].value && pick(sel),
    right: () => rows[sel].value && pick(sel),
    ok: () => pick(sel),
    back: () => (sfx.back(), onResume()),
  });
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1033]/70">
      <ArcadeText text={coop ? "MENU" : "PAUSE"} size={40} face="#ffd23f" side="#c2560a" depth={5} anim="drop" />
      {coop && <span className="fb-o fb-blink mt-3 text-[8px] text-[var(--pink)]">THE GAME KEEPS GOING!</span>}
      <div className="mt-6">
        <MenuList width={220} items={rows} sel={sel} onHover={setSel} onPick={(i) => (setSel(i), pick(i))} />
      </div>
      {!touch && (
        <div className="absolute inset-x-0 bottom-3">
          <Hints items={[[KEYS.updown, "SELECT"], [KEYS.ok, "OK"], [KEYS.back, "RESUME"]]} />
        </div>
      )}
    </div>
  );
}

// --- game over -------------------------------------------------------------------------------

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.- ";

export function NameEntry({ score, rank, initial, touch, onDone }: { score: number; rank: number; initial: string; touch: boolean; onDone: (name: string) => void }) {
  const [name, setName] = useState(() => (initial + "AAA").slice(0, 3).toUpperCase().split(""));
  const [slot, setSlot] = useState(0);
  const change = (i: number, d: number) => {
    setName((n) => {
      const next = [...n];
      const at = CHARS.indexOf(next[i]);
      next[i] = CHARS[(Math.max(0, at) + d + CHARS.length) % CHARS.length];
      return next;
    });
    sfx.letter();
  };
  const ok = () => {
    if (slot < 2) {
      setSlot(slot + 1);
      sfx.move();
    } else {
      sfx.select();
      onDone(name.join("").trimEnd() || "???");
    }
  };
  useMenuInput(true, {
    up: () => change(slot, 1),
    down: () => change(slot, -1),
    left: () => setSlot((s) => Math.max(0, s - 1)),
    right: () => setSlot((s) => Math.min(2, s + 1)),
    ok,
    back: () => setSlot((s) => Math.max(0, s - 1)),
  });
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1033]/75">
      <ArcadeText text="NEW RECORD!" size={24} colors={RAINBOW} anim="wave" />
      <div className="fb-o mt-4 text-[8px] text-[var(--cream)]">
        YOU ARE <span className="text-[var(--yellow)]">{ordinal(rank + 1)}</span> WITH <span className="text-white">{pad(score)}</span>
      </div>
      <div className="fb-o mt-2 text-[8px] text-[var(--cyan)]">ENTER YOUR INITIALS</div>
      <div className="mt-5 flex gap-4">
        {name.map((ch, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <button type="button" className="fb-o p-1 text-white" onClick={() => (setSlot(i), change(i, 1))} aria-label="Next letter">
              <span className="fb-tri fb-tri-up" style={{ borderWidth: "0 6px 7px 6px" }} />
            </button>
            <div className={`fb-item flex h-[40px] w-[36px] items-center justify-center ${i === slot ? "is-sel" : ""}`} onClick={() => setSlot(i)}>
              <span className={`text-[24px] ${i === slot ? "" : "fb-o"}`}>{ch === " " ? "_" : ch}</span>
              {i === slot && <span className="fb-blink absolute inset-x-[7px] bottom-[5px] h-[2px] bg-[var(--ink)]" />}
            </div>
            <button type="button" className="fb-o p-1 text-white" onClick={() => (setSlot(i), change(i, -1))} aria-label="Previous letter">
              <span className="fb-tri fb-tri-down" style={{ borderWidth: "7px 6px 0 6px" }} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => (sfx.select(), onDone(name.join("").trimEnd() || "???"))} className="fb-item ml-2 self-center px-3 py-3 text-[8px]">
          END
        </button>
      </div>
      {!touch && (
        <div className="absolute inset-x-0 bottom-3">
          <Hints items={[[KEYS.updown, "LETTER"], [KEYS.leftright, "MOVE"], [KEYS.ok, "OK"]]} />
        </div>
      )}
    </div>
  );
}

export function ContinueScreen({ stage, touch, onYes, onNo }: { stage: number; touch: boolean; onYes: () => void; onNo: () => void }) {
  const [n, setN] = useState(9);
  const done = useRef(false);
  const finish = (yes: boolean) => {
    if (done.current) return;
    done.current = true;
    if (yes) {
      sfx.coin();
      onYes();
    } else {
      sfx.back();
      onNo();
    }
  };
  useEffect(() => {
    if (n < 0) {
      finish(false);
      return;
    }
    if (n < 9) sfx.tick();
    const t = window.setTimeout(() => setN((x) => x - 1), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  useMenuInput(true, { ok: () => finish(true), back: () => finish(false) });
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1033]/80">
      <ArcadeText text="CONTINUE?" size={32} face="#45e3ff" side="#1f4fb0" depth={4} anim="drop" />
      <div key={n} className="fb-pop mt-4">
        <ArcadeText text={String(Math.max(0, n))} size={64} face={n <= 3 ? "#ff4a4a" : "#ffd23f"} side={n <= 3 ? "#8a1020" : "#c2560a"} depth={7} />
      </div>
      <div className="fb-o mt-4 text-center text-[8px] leading-[12px] text-[var(--cream)]">
        PICK UP FROM STAGE {STAGES[stage].id}
        <br />
        <span className="text-[var(--pink)]">SCORE STARTS AGAIN FROM 0</span>
      </div>
      <div className="mt-5 flex gap-4">
        <button type="button" className="fb-item is-sel px-4 py-2.5 text-[16px]" onClick={() => finish(true)}>
          YES
        </button>
        <button type="button" className="fb-item px-4 py-2.5 text-[16px]" onClick={() => finish(false)}>
          <span className="fb-o">NO</span>
        </button>
      </div>
      {!touch && (
        <div className="absolute inset-x-0 bottom-3">
          <Hints items={[[KEYS.ok, "CONTINUE"], [KEYS.back, "GIVE UP"]]} />
        </div>
      )}
    </div>
  );
}

// Calls cb at most once, from a timer or a press, whichever comes first.
function useOnce(cb: () => void, ms: number) {
  const ref = useRef(cb);
  ref.current = cb;
  const done = useRef(false);
  const fire = () => {
    if (done.current) return;
    done.current = true;
    ref.current();
  };
  const fireRef = useRef(fire);
  useEffect(() => {
    const t = window.setTimeout(() => fireRef.current(), ms);
    return () => window.clearTimeout(t);
  }, [ms]);
  return fire;
}

export function GameOverSplash({ result, touch, coop = false, onNext }: { result: RunResult; touch: boolean; coop?: boolean; onNext: () => void }) {
  const next = useOnce(onNext, result.cleared ? 5000 : 3500);
  useMenuInput(true, { ok: next, back: next });
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1033]/65" onClick={next}>
      {result.cleared ? (
        <>
          <Confetti />
          <ArcadeText text="ALL CLEAR!" size={40} colors={RAINBOW} depth={5} anim="wave" />
          <div className="fb-o mt-3 text-[8px] text-[var(--cream)]">{coop ? "SWEET DREAMS, LITTLE FROGS" : "SWEET DREAMS, LITTLE FROG"}</div>
        </>
      ) : (
        <ArcadeText text="GAME OVER" size={40} face="#ff5fa8" side="#8a1a50" depth={5} anim="drop" />
      )}
      <div className="fb-panel fb-pop mt-6 flex gap-6 px-5 py-3 text-[8px]" style={{ animationDelay: "0.6s" }}>
        <div className="flex flex-col items-center gap-1.5">
          <span className="fb-o text-[var(--pink)]">SCORE</span>
          <span className="fb-o text-[16px] text-white">{pad(result.score)}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="fb-o text-[var(--cyan)]">STAGE</span>
          <span className="fb-o text-[16px] text-white">{stagesFor(coop)[result.stage].id}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="fb-o text-[var(--yellow)]">FLIES</span>
          <span className="fb-o text-[16px] text-white">{pad(result.flies, 3)}</span>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-2 text-[8px]">
        <Cursor />
        <span className="fb-o fb-blink text-white">{touch ? "TAP" : "PRESS ENTER"}</span>
      </div>
    </div>
  );
}

export function FinalRanking({ ranking, highlight, touch, onDone }: { ranking: RankEntry[]; highlight: number; touch: boolean; onDone: () => void }) {
  const done = useOnce(onDone, 9000);
  useMenuInput(true, { ok: done, back: done });
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1033]/75" onClick={done}>
      <RankingTable ranking={ranking} highlight={highlight} />
      <div className="fb-o fb-blink mt-5 text-[8px] text-white">{touch ? "TAP TO CONTINUE" : "PRESS ENTER"}</div>
    </div>
  );
}
