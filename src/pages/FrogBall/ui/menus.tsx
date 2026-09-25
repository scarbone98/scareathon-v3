// Frog Ball's front end: title (cycling with the ranking, like an arcade
// attract loop), mode select, stage select, options and how to play.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { sfx } from "../game/sfx";
import { STAGES, WORLDS } from "../game/stages";
import { useMenuInput } from "./hooks";
import { ArcadeText, Cursor, CursorDown, FrogBallSprite, FrogFace, Fly, GoalSprite, Lock, Pix } from "./pixels";
import { KEYS, pad, RAINBOW, WORLD_COLORS } from "./theme";
import { ordinal, type RankEntry, type Settings } from "./storage";

export function Hints({ items }: { items: [ReactNode, string][] }) {
  return (
    <div className="flex items-center justify-center gap-4 text-[8px] text-[var(--cream)]">
      {items.map(([k, label], i) => (
        <span key={i} className="fb-o flex items-center gap-1.5">
          {k}
          {label}
        </span>
      ))}
    </div>
  );
}

const Tri = ({ dir }: { dir: "up" | "down" | "left" | "right" }) => <span className={`fb-tri fb-tri-${dir}`} />;

// A vertical list of big menu bars with a bouncing cursor.
export interface MenuItem {
  label: string;
  value?: string; // a setting you change with left/right
  note?: string; // small print on the right
  disabled?: boolean;
}

export function MenuList({ items, sel, onHover, onPick, width = 240 }: { items: MenuItem[]; sel: number; onHover: (i: number) => void; onPick: (i: number) => void; width?: number }) {
  return (
    <div className="flex flex-col gap-2.5" style={{ width }}>
      {items.map((it, i) => (
        <button
          key={it.label}
          type="button"
          className={`fb-item flex h-[26px] items-center px-4 text-[8px] ${i === sel ? "is-sel" : ""} ${it.disabled ? "is-off" : ""}`}
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(i)}
        >
          {i === sel && <Cursor scale={2} className="fb-nudge absolute -left-[18px]" />}
          <span className={`text-[16px] ${i === sel ? "" : "fb-o"}`}>{it.label}</span>
          {it.note && <span className={`ml-auto text-[8px] ${i === sel ? "" : "fb-o text-[var(--pink)]"}`}>{it.note}</span>}
          {it.value && (
            <span className={`ml-auto flex items-center gap-2 text-[8px] ${i === sel ? "" : "fb-o text-[var(--cyan)]"}`}>
              <Tri dir="left" />
              {it.value}
              <Tri dir="right" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// Moves a selection through items, skipping nothing (disabled items can be
// selected, they just refuse to be picked).
function useCursor(count: number, start = 0) {
  const [sel, setSel] = useState(start);
  const move = (d: number) => {
    setSel((s) => (s + d + count) % count);
    sfx.move();
  };
  return { sel, setSel, move };
}

function Frame({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`fb-panel fb-pop relative px-6 pb-5 pt-7 ${className ?? ""}`}>
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <div className="fb-stripes px-3 py-1.5" style={{ "--c1": "#ff5fa8", "--c2": "#e0408c", boxShadow: "0 -1px 0 #1a1033, 0 1px 0 #1a1033, -1px 0 0 #1a1033, 1px 0 0 #1a1033" } as CSSProperties}>
          <span className="fb-o text-[8px] text-white">{title}</span>
        </div>
      </div>
      {children}
    </div>
  );
}

// --- title ---------------------------------------------------------------------

export function TopBar({ lastScore, hiScore }: { lastScore: number; hiScore: number }) {
  return (
    <div className="absolute inset-x-0 top-0 flex justify-between px-4 pt-3 text-[8px]">
      <div>
        <div className="fb-o text-[var(--pink)]">1UP</div>
        <div className="fb-o mt-1.5 text-white">{pad(lastScore)}</div>
      </div>
      <div className="text-center">
        <div className="fb-o text-[var(--yellow)]">HI-SCORE</div>
        <div className="fb-o mt-1.5 text-white">{pad(hiScore)}</div>
      </div>
      <div className="text-right">
        <div className="fb-o text-[var(--cyan)]">FREE</div>
        <div className="fb-o mt-1.5 text-[var(--cyan)]">PLAY</div>
      </div>
    </div>
  );
}

export function Logo({ small = false }: { small?: boolean }) {
  const k = small ? 0.5 : 1;
  return (
    <div className="flex flex-col items-center">
      <ArcadeText text="FROG" size={40 * k} face="#8cff5a" top="#d8ffc0" side="#2f8a3c" depth={small ? 3 : 5} anim="title" />
      <ArcadeText text="BALL" size={48 * k} face="#ffd23f" top="#fff3a0" side="#d0520a" depth={small ? 3 : 6} anim="title" className="-mt-1" />
    </div>
  );
}

export function Title({ lastScore, ranking, touch, onStart }: { lastScore: number; ranking: RankEntry[]; touch: boolean; onStart: () => void }) {
  const [phase, setPhase] = useState<"logo" | "ranking">("logo");
  useEffect(() => {
    const t = window.setTimeout(() => setPhase((p) => (p === "logo" ? "ranking" : "logo")), phase === "logo" ? 10000 : 7000);
    return () => window.clearTimeout(t);
  }, [phase]);
  useMenuInput(true, { ok: onStart });
  return (
    <div className="absolute inset-0 cursor-pointer" onClick={onStart}>
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(26,16,51,.55) 100%)" }} />
      <TopBar lastScore={lastScore} hiScore={ranking[0]?.score ?? 0} />
      {phase === "logo" ? (
        <div key="logo" className="absolute inset-0 flex flex-col items-center justify-center pb-6">
          <FrogBallSprite scale={3} className="fb-bob mb-3" />
          <Logo />
          <div className="fb-o mt-4 text-[8px] text-[var(--cyan)]">15 STAGES - 5 DREAM WORLDS</div>
        </div>
      ) : (
        <div key="rank" className="absolute inset-0 flex flex-col items-center justify-center pb-4 pt-10">
          <RankingTable ranking={ranking} />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-9 text-center">
        <span className="fb-o fb-blink text-[16px] text-white">{touch ? "TAP TO START" : "PRESS START"}</span>
      </div>
      <div className="fb-o absolute inset-x-0 bottom-3 text-center text-[8px] text-[var(--cream)] opacity-80">(C) 2026 SCAREATHON ARCADE</div>
    </div>
  );
}

const ROW_COLORS = ["#ffd23f", "#ff5fa8", "#45e3ff", "#8cff5a", "#b58cff"];

export function RankingTable({ ranking, highlight = -1 }: { ranking: RankEntry[]; highlight?: number }) {
  return (
    <div className="flex flex-col items-center">
      <ArcadeText text="BEST FROGS" size={24} colors={RAINBOW} anim="drop" />
      <div className="mt-4 grid grid-cols-[auto_auto_auto_auto] gap-x-5 gap-y-[7px] text-[8px]">
        <span className="fb-o text-[var(--cream)]">RANK</span>
        <span className="fb-o text-right text-[var(--cream)]">SCORE</span>
        <span className="fb-o text-[var(--cream)]">NAME</span>
        <span className="fb-o text-[var(--cream)]">STAGE</span>
        {ranking.map((e, i) => {
          const c = ROW_COLORS[i % ROW_COLORS.length];
          const cls = `fb-o ${i === highlight ? "fb-blink-fast" : ""}`;
          return [
            <span key={`r${i}`} className={cls} style={{ color: c }}>
              {ordinal(i + 1)}
            </span>,
            <span key={`s${i}`} className={`${cls} text-right`} style={{ color: c }}>
              {pad(e.score)}
            </span>,
            <span key={`n${i}`} className={cls} style={{ color: c }}>
              {e.name}
            </span>,
            <span key={`t${i}`} className={cls} style={{ color: c }}>
              {e.stage}
            </span>,
          ];
        })}
      </div>
    </div>
  );
}

// --- mode select ------------------------------------------------------------------

export type MenuChoice = "start" | "coop" | "practice" | "howto" | "options";

export function MainMenu({ touch, onPick, onBack, initial = 0 }: { touch: boolean; onPick: (c: MenuChoice) => void; onBack: () => void; initial?: number }) {
  const choices: [MenuChoice, string, string][] = [
    ["start", "GAME START", "ROLL THROUGH ALL 15 STAGES. 3 LIVES."],
    ["coop", "CO-OP", "TWO PLAYERS ONLINE, CHAINED TOGETHER."],
    ["practice", "PRACTICE", "PLAY ANY STAGE YOU HAVE REACHED."],
    ["howto", "HOW TO PLAY", "STEERING, GOALS AND FLIES."],
    ["options", "OPTIONS", "SOUND."],
  ];
  const c = useCursor(choices.length, initial);
  const pick = (i: number) => {
    sfx.select();
    onPick(choices[i][0]);
  };
  useMenuInput(true, { up: () => c.move(-1), down: () => c.move(1), ok: () => pick(c.sel), back: onBack });
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <div className="pointer-events-none absolute inset-0 bg-[#1a1033]/40" />
      <div className="relative mb-6">
        <Logo small />
      </div>
      <Frame title="SELECT MODE" className="relative">
        <MenuList items={choices.map(([, l]) => ({ label: l }))} sel={c.sel} onHover={c.setSel} onPick={(i) => (c.setSel(i), pick(i))} />
      </Frame>
      <div className="fb-o relative mt-5 h-3 text-center text-[8px] text-[var(--cyan)]">{choices[c.sel][2]}</div>
      {!touch && (
        <div className="absolute inset-x-0 bottom-3">
          <Hints items={[[KEYS.updown, "SELECT"], [KEYS.ok, "OK"], [KEYS.back, "BACK"]]} />
        </div>
      )}
    </div>
  );
}

// --- stage select ------------------------------------------------------------------

const fmtTime = (s: number) => s.toFixed(2).padStart(5, "0");

export function StageSelect({
  reached,
  best,
  touch,
  initial,
  onFocus,
  onPick,
  onBack,
}: {
  reached: number;
  best: Record<string, number>;
  touch: boolean;
  initial: number;
  onFocus: (i: number) => void;
  onPick: (i: number) => void;
  onBack: () => void;
}) {
  const [sel, setSel] = useState(initial);
  const world = STAGES[sel].world;
  const inWorld = STAGES.map((s, i) => ({ s, i })).filter((x) => x.s.world === world);

  useEffect(() => onFocus(sel), [sel, onFocus]);

  const go = (i: number) => {
    const n = (i + STAGES.length) % STAGES.length;
    if (n !== sel) sfx.move();
    setSel(n);
  };
  const worldStep = (d: number) => {
    const w = (world + d + WORLDS.length) % WORLDS.length;
    const slot = inWorld.findIndex((x) => x.i === sel);
    const list = STAGES.map((s, i) => ({ s, i })).filter((x) => x.s.world === w);
    go(list[Math.min(slot, list.length - 1)].i);
  };
  const pick = (i: number) => {
    if (i > reached) {
      sfx.denied();
      return;
    }
    sfx.select();
    onPick(i);
  };
  useMenuInput(true, { left: () => go(sel - 1), right: () => go(sel + 1), up: () => worldStep(-1), down: () => worldStep(1), ok: () => pick(sel), back: onBack });

  const color = WORLD_COLORS[world];
  return (
    <div className="absolute inset-0">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#1a1033]/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#1a1033]/85 to-transparent" />
      <div className="absolute inset-x-0 top-3 flex flex-col items-center">
        <span className="fb-o text-[8px] text-[var(--cream)]">PRACTICE</span>
        <div className="mt-2 flex items-center gap-4">
          <button type="button" className="fb-o p-1 text-[16px] text-white" onClick={() => worldStep(-1)} aria-label="Previous world">
            <span className="fb-tri fb-tri-left" style={{ borderWidth: "6px 8px 6px 0" }} />
          </button>
          <ArcadeText key={world} text={`WORLD ${world + 1}`} size={24} face={color} side="#1a1033" depth={3} anim="drop" />
          <button type="button" className="fb-o p-1 text-[16px] text-white" onClick={() => worldStep(1)} aria-label="Next world">
            <span className="fb-tri fb-tri-right" style={{ borderWidth: "6px 0 6px 8px" }} />
          </button>
        </div>
        <span className="fb-o mt-1 text-[8px]" style={{ color }}>
          {WORLDS[world].name.toUpperCase()}
        </span>
        <div className="mt-2 flex gap-1.5">
          {WORLDS.map((_, w) => (
            <span key={w} className="h-1.5 w-1.5" style={{ background: w === world ? color : "#ffffff55", boxShadow: "0 0 0 1px #1a1033" }} />
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-10 flex justify-center gap-3">
        {inWorld.map(({ s, i }) => {
          const locked = i > reached;
          const on = i === sel;
          const t = best[s.id];
          return (
            <button
              key={s.id}
              type="button"
              onMouseEnter={() => go(i)}
              onClick={() => (i === sel || touch ? pick(i) : go(i))}
              className={`fb-item flex h-[74px] w-[104px] flex-col items-center justify-between px-1 py-2 ${on ? "is-sel -translate-y-1" : ""}`}
            >
              {on && (
                <span className="fb-bob absolute -top-[18px] left-1/2 -ml-[7px]">
                  <CursorDown scale={2} />
                </span>
              )}
              <span className={`text-[16px] ${on ? "" : "fb-o"}`}>{s.id}</span>
              {locked ? (
                <span className="flex flex-col items-center gap-1">
                  <Lock scale={1} />
                  <span className={`text-[8px] ${on ? "" : "fb-o"}`}>LOCKED</span>
                </span>
              ) : (
                <>
                  <span className={`px-0.5 text-center text-[8px] leading-[10px] ${on ? "" : "fb-o"}`}>{s.name.toUpperCase()}</span>
                  <span className={`text-[8px] ${on ? "text-[#7a3a00]" : "fb-o text-[var(--cyan)]"}`}>{t ? fmtTime(t) : "--.--"}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {!touch && (
        <div className="absolute inset-x-0 bottom-3">
          <Hints items={[[KEYS.leftright, "STAGE"], [KEYS.updown, "WORLD"], [KEYS.ok, "PLAY"], [KEYS.back, "BACK"]]} />
        </div>
      )}
      {touch && (
        <button type="button" onClick={onBack} className="fb-item !absolute left-3 top-3 px-2 py-1.5 text-[8px]">
          BACK
        </button>
      )}
    </div>
  );
}

// --- options ------------------------------------------------------------------------

export function Options({ settings, touch, onChange, onBack }: { settings: Settings; touch: boolean; onChange: (s: Settings) => void; onBack: () => void }) {
  type Row = { label: string; value?: string; note?: string; step?: (d: number) => void; act?: () => void };
  const rows: Row[] = [];
  rows.push({ label: "SOUND", value: settings.sound ? "ON" : "OFF", step: () => onChange({ ...settings, sound: !settings.sound }) });
  rows.push({ label: "BACK", act: onBack });
  const c = useCursor(rows.length);
  const row = rows[Math.min(c.sel, rows.length - 1)];
  const step = (d: number) => {
    if (!row.step) return;
    row.step(d);
    sfx.move();
  };
  const ok = (i = c.sel) => {
    const r = rows[i];
    if (r.act) {
      sfx.select();
      r.act();
    } else step(1);
  };
  useMenuInput(true, { up: () => c.move(-1), down: () => c.move(1), left: () => step(-1), right: () => step(1), ok: () => ok(), back: () => (sfx.back(), onBack()) });
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1033]/55">
      <Frame title="OPTIONS">
        <MenuList width={280} items={rows.map((r) => ({ label: r.label, value: r.value, note: r.note }))} sel={c.sel} onHover={c.setSel} onPick={(i) => (c.setSel(i), ok(i))} />
        <p className="fb-o mt-5 text-center text-[8px] leading-[12px] text-[var(--cyan)]">
          {touch ? (
            <>
              STEER WITH THE JOYSTICK.
              <br />
              TOUCH ANYWHERE TO GRAB IT.
            </>
          ) : (
            <>
              STEER WITH ARROWS, WASD
              <br />
              OR A GAMEPAD STICK
            </>
          )}
        </p>
      </Frame>
      {!touch && (
        <div className="absolute inset-x-0 bottom-3">
          <Hints items={[[KEYS.updown, "SELECT"], [KEYS.leftright, "CHANGE"], [KEYS.back, "BACK"]]} />
        </div>
      )}
    </div>
  );
}

// --- how to play ---------------------------------------------------------------------

function TiltIcon({ touch }: { touch: boolean }) {
  if (touch)
    return (
      <Pix
        scale={2}
        palette={{ o: "#1a1033", b: "#43308f", y: "#ffd23f", Y: "#d98a00", w: "#fff3c4" }}
        rows={[
          ".....oooooo.....",
          "...oobbbbbboo...",
          "..obbbooooobbo..",
          ".obbboyyyyobbbo.",
          ".obbowyyyyyobbo.",
          "obbboyyyyyyobbbo",
          "obbboYYYYYYobbbo",
          ".obboYYYYYYobbo.",
          ".obbbooooooobbo.",
          "..obbbbbbbbbbo..",
          "...oobbbbbboo...",
          ".....oooooo.....",
        ]}
      />
    );
  return (
    <div className="grid grid-cols-3 gap-[2px] text-[8px]">
      <span />
      <span className="fb-key !min-w-[12px]">W</span>
      <span />
      <span className="fb-key !min-w-[12px]">A</span>
      <span className="fb-key !min-w-[12px]">S</span>
      <span className="fb-key !min-w-[12px]">D</span>
    </div>
  );
}

export function HowTo({ touch, onBack }: { touch: boolean; onBack: () => void }) {
  useMenuInput(true, { ok: onBack, back: onBack });
  const cards: [ReactNode, string, string][] = [
    [<TiltIcon touch={touch} key="t" />, "TILT", touch ? "PUSH THE JOYSTICK TO TIP THE WORLD. THE BALL ROLLS DOWNHILL." : "TIP THE WORLD WITH ARROWS OR WASD. THE BALL ROLLS DOWNHILL."],
    [<GoalSprite key="g" scale={2} />, "GOAL", "ROLL THROUGH THE GOAL BEFORE THE TIME RUNS OUT. DON'T FALL OFF!"],
    [<Fly scale={4} key="f" />, "FLIES", "100 PTS EACH. 50 FLIES = 1UP. FINISH IN HALF THE TIME FOR X2."],
  ];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1033]/60" onClick={onBack}>
      <ArcadeText text="HOW TO PLAY" size={24} face="#45e3ff" side="#1f4fb0" anim="drop" />
      <div className="mt-6 flex flex-wrap justify-center gap-4 px-4">
        {cards.map(([icon, title, text], i) => (
          <div key={title} className="fb-panel fb-pop flex w-[170px] flex-col items-center px-3 pb-3 pt-3" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
            <div className="flex h-[32px] items-center">{icon}</div>
            <div className="fb-o mt-2 text-[16px]" style={{ color: ROW_COLORS[i] }}>
              {title}
            </div>
            <p className="fb-o mt-2 text-center text-[8px] leading-[12px] text-[var(--cream)]">{text}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-2 text-[8px]">
        <FrogFace scale={1} />
        <span className="fb-o fb-blink text-white">{touch ? "TAP TO GO BACK" : "PRESS ENTER"}</span>
      </div>
    </div>
  );
}

