import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button, Embers, Panel } from "../Royale/ui/parts";
import { ORANGE } from "../Royale/ui/theme";
import { GameController, type Dialogue, type Hud, type StageResult, type StoryHooks } from "./game/controller";
import { defaultMoves, ITEMS, MOVES, PROLOGUE_STAGE, type ItemId } from "./game/data";
import { addPartner, applyReport, hasFlag, progressScore, startingRoster, withFlags, type RosterEntry, type Save } from "./game/save";
import { CAMP_MAP, CEMETERY_MAP, CHAPTERS, isVeteran, nextChapter, PARTNER_KIND, PARTNER_NAME, SCRIPTS, smallTalk, type Chapter, type Step } from "./game/story";
import { SaveStore } from "./store";
import Camp, { type Tab } from "./ui/camp";
import { Bar, Candy, ItemIcon, MoveIcon, UnitSprite } from "./ui/parts";
import Result from "./ui/result";
import { DialogueBox, Fade, StoryCard } from "./ui/story";
import "./mystery.css";

// In dev, ?autoplay lets the bot play and ?floor=N starts deeper, for testing.
function devOptions() {
  if (!import.meta.env.DEV) return { floor: undefined, autoplay: false };
  const params = new URLSearchParams(window.location.search);
  return { floor: Number(params.get("floor")) || undefined, autoplay: params.has("autoplay") };
}

function HudBar({ hud, onPause }: { hud: Hud; onPause: () => void }) {
  const low = hud.hp < hud.maxHp * 0.3;
  return (
    <div className="pointer-events-none px-3 pt-2">
      <div className="flex items-center gap-2">
        <div className="cc-outline-sm shrink-0 rounded border-2 border-[#140a1c] bg-[#2a1638]/90 px-1.5 text-sm text-[#c88cff]">
          B{hud.floor}F<span className="text-[#ffe9c4]/60">/{hud.floors}</span>
        </div>
        <div className="cc-outline-sm min-w-0 flex-1 truncate text-sm text-[#ffe9c4]">{hud.stageName}</div>
        <Candy amount={hud.candy} className="cc-outline-sm text-sm" />
        <button type="button" onClick={onPause} aria-label="Pause" className="cc-sbtn cc-sbtn-stone pointer-events-auto px-0 text-xs">
          <span>II</span>
        </button>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="cc-outline-sm shrink-0 text-xs text-[#ffe9c4]">Lv {hud.level}</span>
        <span className={`cc-outline-sm text-xs ${low ? "text-[#ff5a6a]" : "text-[#7dffb0]"}`}>HP</span>
        <Bar value={hud.hp} max={hud.maxHp} from={low ? "#ff2d55" : "#3ad07a"} to={low ? "#ff8a1f" : "#7dffb0"} />
        <span className="cc-outline-sm w-14 text-right text-xs text-white">
          {hud.hp}/{hud.maxHp}
        </span>
      </div>
      <div className="mt-1 flex gap-1">
        {hud.party
          .filter((m) => !m.leader)
          .map((m) => (
            <div key={m.id} className="flex items-center gap-1 rounded border-2 border-[#140a1c] bg-[#1c1128]/85 px-1">
              <UnitSprite kind={m.kind} size={18} />
              <div className="flex flex-col">
                <span className="cc-outline-sm text-[9px] leading-none text-white">Lv{m.level}</span>
                <div className="mt-0.5 h-1 w-7 overflow-hidden rounded-sm bg-[#140a1c]">
                  <div className="h-full bg-[#ff9ad5]" style={{ width: `${(m.hp / m.maxHp) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
      </div>
      {hud.boss && (
        <div className="mx-auto mt-1.5 w-[85%]">
          <div className="cc-outline-sm text-center text-xs text-[#ff5a6a]">{hud.boss.name}</div>
          <Bar value={hud.boss.hp} max={hud.boss.maxHp} from="#ff2d55" to="#ff8a1f" className="h-2.5" />
        </div>
      )}
    </div>
  );
}

const SHORT = "[@media(max-height:640px)]";

function PadButton({ children, onDown, onUp, className = "", label, color = "stone" }: { children: ReactNode; onDown: () => void; onUp?: () => void; className?: string; label: string; color?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`cc-sbtn cc-sbtn-${color} cc-outline-sm flex items-center justify-center p-0 ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="flex items-center justify-center">{children}</span>
    </button>
  );
}

function Controls({ ctrl, hud, onBag }: { ctrl: GameController | null; hud: Hud; onBag: () => void }) {
  const hold = (dx: number, dy: number) => () => ctrl?.hold({ dx, dy });
  const release = () => ctrl?.hold(null);
  const pad = `h-11 w-11 text-base ${SHORT}:h-10 ${SHORT}:w-10`;
  return (
    <div className={`flex items-end justify-between gap-2 px-3 pb-3 pt-1 ${SHORT}:pb-2`}>
      <div className="grid shrink-0 grid-cols-3 grid-rows-3 gap-1">
        <span />
        <PadButton label="Up" className={pad} onDown={hold(0, -1)} onUp={release}>
          ▲
        </PadButton>
        <span />
        <PadButton label="Left" className={pad} onDown={hold(-1, 0)} onUp={release}>
          ◀
        </PadButton>
        <PadButton label="Hit" color="orange" className={`${pad} text-xs`} onDown={() => ctrl?.press({ type: "attack" })}>
          Hit
        </PadButton>
        <PadButton label="Right" className={pad} onDown={hold(1, 0)} onUp={release}>
          ▶
        </PadButton>
        <span />
        <PadButton label="Down" className={pad} onDown={hold(0, 1)} onUp={release}>
          ▼
        </PadButton>
        <span />
      </div>
      <div className="flex min-w-0 max-w-[190px] flex-1 flex-col gap-1">
        <div className="grid grid-cols-2 gap-1">
          {Array.from({ length: 4 }, (_, i) => hud.moves[i]).map((m, i) =>
            m ? (
              <PadButton key={i} label={MOVES[m.id].name} color="purple" className={`h-12 w-full px-1 ${SHORT}:h-11`} onDown={() => ctrl?.press({ type: "skill", slot: i })}>
                <MoveIcon move={m.id} size={28} dim={m.pp === 0} />
                <span className={`ml-1.5 text-xs ${m.pp === 0 ? "text-[#ff9a8a]" : "text-[#ffe9c4]"}`}>
                  {m.pp}
                  <span className="text-[10px] opacity-60">/{m.max}</span>
                </span>
              </PadButton>
            ) : (
              <div key={i} className={`h-12 rounded border-2 border-dashed border-[#ffe9c4]/15 ${SHORT}:h-11`} />
            )
          )}
        </div>
        <div className="grid grid-cols-2 gap-1">
          <Button color="green" onClick={onBag} className="py-0 text-sm">
            Bag {hud.bag.length}
          </Button>
          <PadButton label="Wait a turn" className="h-full text-sm" onDown={() => ctrl?.press({ type: "wait" })}>
            Wait
          </PadButton>
        </div>
      </div>
    </div>
  );
}

function Messages({ messages }: { messages: { id: number; text: string; color?: string }[] }) {
  return (
    <div className="pointer-events-none flex flex-col gap-0.5 px-3">
      {messages.map((m) => (
        <div key={m.id} className="cc-outline-sm mc-msg w-fit max-w-full rounded bg-[#0b0712]/75 px-2 py-0.5 text-[12px] leading-tight" style={{ color: m.color ?? "#ffe9c4" }}>
          {m.text}
        </div>
      ))}
    </div>
  );
}

function BagPanel({ bag, onUse, onClose }: { bag: ItemId[]; onUse: (slot: number) => void; onClose: () => void }) {
  const kinds = (Object.keys(ITEMS) as ItemId[]).filter((k) => bag.includes(k));
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b0712]/75 px-5 py-4" onClick={onClose}>
      <Panel className="cc-pop max-h-full w-full max-w-sm overflow-y-auto">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="cc-outline mb-2 text-center text-2xl text-[#ffcf4a]">Bag</div>
          {kinds.length === 0 && <p className="cc-outline-sm py-4 text-center text-[#ffe9c4]">Empty. Look for items on the floor, or buy some at camp.</p>}
          <ul className="space-y-2">
            {kinds.map((k) => (
              <li key={k} className="flex items-center gap-2 rounded border-2 border-[#140a1c] bg-[#1c1128]/80 p-2">
                <ItemIcon item={k} />
                <div className="min-w-0 flex-1">
                  <div className="cc-outline-sm text-white">
                    {ITEMS[k].name} <span className="text-[#ffcf4a]">×{bag.filter((b) => b === k).length}</span>
                  </div>
                  <div className="cc-outline-sm text-xs leading-tight text-[#ffe9c4]/80">{ITEMS[k].about}</div>
                </div>
                <Button color={k === "candycorn" ? "orange" : "green"} onClick={() => onUse(bag.indexOf(k))} className="shrink-0 px-3 py-0 text-base">
                  {k === "candycorn" ? "Throw" : "Use"}
                </Button>
              </li>
            ))}
          </ul>
          <Button color="stone" onClick={onClose} className="mt-3 w-full py-0 text-base">
            Close
          </Button>
        </div>
      </Panel>
    </div>
  );
}


function CampHud({ save, onMenu }: { save: Save; onMenu: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 pt-2">
      <div className="cc-title leading-none" style={{ fontSize: 24, color: ORANGE, textShadow: "0 2px 0 #8a3a00, 0 4px 0 #140a1c" }}>
        Camp
      </div>
      <div className="flex-1" />
      <Candy amount={save.candy} className="cc-outline-sm text-sm" />
      <Button color="purple" onClick={onMenu} className="px-2 py-0 text-sm">
        Menu
      </Button>
    </div>
  );
}

function CampControls({ ctrl, onPanel }: { ctrl: GameController | null; onPanel: (tab: Tab) => void }) {
  const hold = (dx: number, dy: number) => () => ctrl?.hold({ dx, dy });
  const release = () => ctrl?.hold(null);
  const pad = `h-11 w-11 text-base ${SHORT}:h-10 ${SHORT}:w-10`;
  return (
    <div className={`flex items-end justify-between gap-2 px-3 pb-3 pt-1 ${SHORT}:pb-2`}>
      <div className="grid shrink-0 grid-cols-3 grid-rows-3 gap-1">
        <span />
        <PadButton label="Up" className={pad} onDown={hold(0, -1)} onUp={release}>
          ▲
        </PadButton>
        <span />
        <PadButton label="Left" className={pad} onDown={hold(-1, 0)} onUp={release}>
          ◀
        </PadButton>
        <PadButton label="Talk" color="orange" className={`${pad} text-[10px]`} onDown={() => ctrl?.press({ type: "attack" })}>
          Talk
        </PadButton>
        <PadButton label="Right" className={pad} onDown={hold(1, 0)} onUp={release}>
          ▶
        </PadButton>
        <span />
        <PadButton label="Down" className={pad} onDown={hold(0, 1)} onUp={release}>
          ▼
        </PadButton>
        <span />
      </div>
      <div className="flex max-w-[170px] flex-1 flex-col gap-1">
        <Button color="orange" onClick={() => onPanel("stages")} className="py-1 text-base">
          Crypt map
        </Button>
        <div className="grid grid-cols-2 gap-1">
          <Button color="purple" onClick={() => onPanel("team")} className="py-0 text-sm">
            Team
          </Button>
          <Button color="green" onClick={() => onPanel("shop")} className="py-0 text-sm">
            Shop
          </Button>
        </div>
      </div>
    </div>
  );
}

function VeteranPrompt({ onPlay, onSkip }: { onPlay: () => void; onSkip: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0b0712]/80 px-6 text-center">
      <div className="cc-pop cc-title" style={{ fontSize: 40, color: "#ffcf4a", textShadow: "0 4px 0 #8a5a00, 0 8px 0 #140a1c" }}>
        Story mode!
      </div>
      <p className="cc-outline-sm mt-3 max-w-xs text-[#ffe9c4]">
        Mystery Crypt has a story now. Your team and levels are safe. Play the prologue to see how Alex ended up down here, or skip straight to camp.
      </p>
      <Button color="orange" onClick={onPlay} className="mt-5 w-full max-w-xs py-1 text-xl">
        Play the prologue
      </Button>
      <Button color="stone" onClick={onSkip} className="mt-2 w-full max-w-xs py-0 text-base">
        Skip to camp
      </Button>
    </div>
  );
}

type View = "loading" | "map" | "playing" | "result";
type Message = { id: number; text: string; color?: string; at: number };
// What the stage being played is for.
type Run = { kind: "free" } | { kind: "tutorial" } | { kind: "chapter"; chapter: Chapter };

const PARTNER_START_LEVEL = 2;

function partnerEntry(level = PARTNER_START_LEVEL): RosterEntry {
  return { uid: null, kind: PARTNER_KIND, name: PARTNER_NAME, level, xp: 0, moves: defaultMoves(PARTNER_KIND, level) };
}

// Mystery Crypt: a Mystery Dungeon-style story. Alex falls into the crypt
// under the cemetery with the Scareathon trophy, meets Wick, and works with
// the monsters at camp to find the others and a way out. Stages are played
// one step at a time; beaten monsters may join you.
export default function MysteryCrypt() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const storeRef = useRef<SaveStore | null>(null);
  const ctrlRef = useRef<GameController | null>(null);
  const [ctrl, setCtrl] = useState<GameController | null>(null);
  const [view, setView] = useState<View>("loading");
  const [save, setSave] = useState<Save | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [paused, setPaused] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [panel, setPanel] = useState<Tab | null>(null);
  const [prompt, setPrompt] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [banner, setBanner] = useState<{ text: string; key: number; color: string } | null>(null);
  const [result, setResult] = useState<{ result: StageResult; before: Save; after: Save } | null>(null);
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [card, setCard] = useState<{ title: string; sub?: string } | null>(null);
  const [dark, setDark] = useState(false);
  const [scene, setScene] = useState(false);
  const runRef = useRef<Run>({ kind: "free" });
  const stageRef = useRef(0);
  const msgId = useRef(0);
  const advanceKey = useRef<(() => void) | null>(null);

  const addMessage = useCallback((text: string, color?: string) => {
    const id = ++msgId.current;
    setMessages((list) => [...list, { id, text, color, at: Date.now() }].slice(-3));
  }, []);

  const persist = useCallback((next: Save) => {
    setSave(next);
    storeRef.current?.persist(next);
  }, []);

  const current = () => storeRef.current!.save;

  // ---------- where you can be ----------

  // Camp, playing whichever story scene is due there.
  const goCamp = useCallback(async () => {
    const c = ctrlRef.current;
    if (!c) return;
    let s = current();
    setPanel(null);
    setPaused(false);
    setBagOpen(false);
    setResult(null);
    setMessages([]);
    setBanner(null);
    setView("map");
    let steps: Step[] | null = null;
    let flag = "";
    if (!hasFlag(s, "seen-arrival")) {
      steps = hasFlag(s, "veteran") ? [...SCRIPTS.veteranArrival, ...SCRIPTS.campArrival.slice(1)] : SCRIPTS.campArrival;
      flag = "seen-arrival";
    } else {
      const done = CHAPTERS.find((ch) => hasFlag(s, ch.flag) && !hasFlag(s, `after-${ch.flag}`));
      if (done) {
        steps = SCRIPTS[done.after];
        flag = `after-${done.flag}`;
      }
    }
    // Story scenes are Alex's, whoever's picked.
    await c.startMap(CAMP_MAP, startingRoster(s, !!steps));
    setDark(false);
    if (steps) {
      c.runScript(steps, () => {
        s = withFlags(current(), flag);
        persist(s);
      });
    }
  }, [persist]);

  const startTutorial = useCallback(async () => {
    const c = ctrlRef.current;
    if (!c) return;
    const s = current();
    runRef.current = { kind: "tutorial" };
    stageRef.current = PROLOGUE_STAGE;
    setResult(null);
    setMessages([]);
    setView("playing");
    setDark(true);
    const hero = s.heroes.alex;
    const roster: RosterEntry[] = [{ uid: null, kind: "alex", level: hero.level, xp: hero.xp, moves: [...hero.moves] }, partnerEntry()];
    const hooks: StoryHooks = { start: SCRIPTS.prologueWake, enemy: SCRIPTS.tutorialEnemy, stairs: SCRIPTS.tutorialStairs, floor2: SCRIPTS.tutorialFloor2 };
    await c.start({ stage: PROLOGUE_STAGE, roster, bag: ["heart"] }, devOptions().autoplay, hooks);
    c.setPartnerApart();
  }, []);

  const startPrologue = useCallback(async () => {
    const c = ctrlRef.current;
    if (!c) return;
    const s = current();
    setPrompt(false);
    setView("map");
    setDark(false);
    const roster = (["alex", "joe", "matt", "jon"] as const).map((kind) => ({ uid: null, kind, level: s.heroes[kind].level, xp: 0, moves: [] }));
    await c.startMap(CEMETERY_MAP, roster);
    c.runScript(SCRIPTS.prologueCemetery, () => void startTutorial());
  }, [startTutorial]);

  // Players from before the story skip up top and meet Wick at camp.
  const skipPrologue = useCallback(() => {
    setPrompt(false);
    const s = current();
    const level = Math.max(PARTNER_START_LEVEL, ...s.monsters.map((m) => m.level));
    persist(withFlags(addPartner(s, partnerEntry(level)), "prologue", "veteran"));
    void goCamp();
  }, [goCamp, persist]);

  const enter = (stage: number) => {
    const s = current();
    const c = ctrlRef.current;
    if (!c) return;
    const chapter = nextChapter(s);
    const story = chapter?.stage === stage ? chapter : null;
    runRef.current = story ? { kind: "chapter", chapter: story } : { kind: "free" };
    stageRef.current = stage;
    // Items go into the stage with you (and come back in the report).
    persist({ ...s, bag: [] });
    setPanel(null);
    setResult(null);
    setHud(null);
    setPaused(false);
    setBagOpen(false);
    setMessages([]);
    setView("playing");
    const { floor, autoplay } = devOptions();
    const hooks: StoryHooks = story ? { boss: SCRIPTS[story.boss] } : {};
    void c.start({ stage, roster: startingRoster(s, !!story), bag: s.bag, floor }, autoplay, hooks);
  };

  // A finished (or abandoned) stage goes into the save, and a better
  // progress score goes to the arcade's leaderboard.
  const finishStage = useCallback(
    (run: StageResult) => {
      const before = current();
      let after = applyReport(before, run.report);
      const kind = runRef.current;
      if (kind.kind === "tutorial") {
        if (run.report.cleared) {
          // Wick joins for good, and on to camp.
          after = withFlags(addPartner(after, run.report.roster[1] ?? partnerEntry()), "prologue");
          persist(after);
          setDark(true);
          window.setTimeout(() => void goCamp(), 700);
          return;
        }
      } else if (kind.kind === "chapter" && run.report.cleared) {
        after = withFlags(after, kind.chapter.flag);
      }
      const score = progressScore(after);
      if (score > after.submitted) {
        // Inside the arcade cabinet, the arcade saves the score to the leaderboard
        if (window.parent !== window) window.parent.postMessage({ type: "PLAYER_DIED", score }, window.location.origin);
        after = { ...after, submitted: score };
      }
      persist(after);
      setResult({ result: run, before, after });
      setView("result");
    },
    [persist, goCamp]
  );

  const onTalk = useCallback(
    (who: string) => {
      const c = ctrlRef.current;
      const s = storeRef.current?.save;
      if (!c || !s || c.inScene) return;
      const open: Record<string, Tab | null> = { snail: "stages", merchant: "shop", owl: null, box: "team" };
      const then = open[who] ?? null;
      if (who === "box") {
        setPanel("team");
        return;
      }
      c.runScript([{ say: who, text: smallTalk(s, who) }], () => then && setPanel(then));
    },
    []
  );

  // Messages fade after a few seconds.
  useEffect(() => {
    if (!messages.length) return;
    const timer = window.setTimeout(() => setMessages((list) => list.filter((m) => Date.now() - m.at < 3800)), 1000);
    return () => window.clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 1500);
    return () => window.clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    const c = new GameController(hostRef.current!, canvasRef.current!, {
      onHud: setHud,
      onMessage: addMessage,
      onFloor: (floor, boss) => setBanner({ text: boss ? "BOSS FLOOR" : `B${floor}F`, key: Date.now(), color: boss ? "#ff5a6a" : "#c88cff" }),
      onOver: finishStage,
      onDialogue: setDialogue,
      onCard: setCard,
      onFade: (f) => setDark(f === "out"),
      onScene: setScene,
      onTalk,
      onAdvanceKey: () => advanceKey.current?.(),
    });
    ctrlRef.current = c;
    setCtrl(c);
    void c.start(null);
    let cancelled = false;
    void SaveStore.open((replaced) => setSave(replaced)).then((store) => {
      if (cancelled) return;
      storeRef.current = store;
      setSave(store.save);
      const s = store.save;
      if (hasFlag(s, "prologue")) void goCamp();
      else if (isVeteran(s)) {
        setView("map");
        setPrompt(true);
      } else void startPrologue();
    });
    return () => {
      cancelled = true;
      c.dispose();
    };
    // Set up once; the callbacks only read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the leader centred between the HUD and the controls.
  const hudShown = hud !== null;
  useLayoutEffect(() => {
    if (!ctrl) return;
    const update = () => ctrl.setInsets(topRef.current?.offsetHeight ?? 0, bottomRef.current?.offsetHeight ?? 0);
    update();
    const observer = new ResizeObserver(update);
    if (topRef.current) observer.observe(topRef.current);
    if (bottomRef.current) observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [ctrl, view, hudShown, scene]);

  useEffect(() => {
    ctrl?.setPaused(paused || bagOpen || !!panel);
  }, [ctrl, paused, bagOpen, panel]);

  // Leaving the tab pauses a stage in progress.
  useEffect(() => {
    if (view !== "playing") return;
    const onHidden = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [view]);

  const retreat = () => {
    setPaused(false);
    const run = ctrl?.retreat();
    if (run) finishStage(run);
  };

  const takeItem = (slot: number) => {
    setBagOpen(false);
    ctrl?.setPaused(false);
    ctrl?.press({ type: "use", slot });
  };

  const afterResult = () => {
    if (!result) return;
    const { report } = result.result;
    if (runRef.current.kind === "tutorial") return void startTutorial();
    // A story chapter just finished: its ending plays at camp.
    if (runRef.current.kind === "chapter" && report.cleared) return void goCamp();
    enter(report.cleared && report.stage + 1 === result.after.cleared ? result.after.cleared : stageRef.current);
  };

  const chapter = save ? nextChapter(save) : null;
  const storyMark = chapter ? { stage: chapter.stage, title: chapter.title, number: CHAPTERS.indexOf(chapter) + 1 } : null;
  const modal = paused || bagOpen;
  const inCamp = view === "map" && hud?.mode === "hub" && !scene && !prompt;
  return (
    <div className="cc-root fixed inset-0 z-50 flex justify-center bg-[#0b0712] text-white select-none" style={{ fontVariantLigatures: "none" }}>
      <div className="relative h-full w-full overflow-hidden" style={{ maxWidth: "min(100vw, calc(100dvh * 0.62))" }}>
        <div ref={hostRef} className="absolute inset-0 touch-none" style={view === "loading" || prompt ? { filter: "brightness(0.4) saturate(1.1) blur(1.5px)" } : undefined}>
          <canvas ref={canvasRef} className="block" />
        </div>
        {view === "loading" && (
          <>
            <Embers count={8} />
            <p className="cc-outline-sm absolute inset-x-0 top-1/2 text-center text-[#ffe9c4]">Loading your crypt…</p>
          </>
        )}
        {inCamp && save && (
          <>
            <div ref={topRef} className="absolute inset-x-0 top-0">
              <CampHud save={save} onMenu={() => setPanel("stages")} />
            </div>
            <div ref={bottomRef} className="absolute inset-x-0 bottom-0">
              {hud?.onStairs && (
                <div className="flex justify-center pb-1.5">
                  <Button color="green" onClick={() => setPanel("stages")} className="cc-pop px-5 py-0.5 text-lg">
                    Into the crypt ▼
                  </Button>
                </div>
              )}
              <Messages messages={messages} />
              <div className="mt-1 bg-gradient-to-t from-[#0b0712] via-[#0b0712]/90 to-transparent">
                <CampControls ctrl={ctrl} onPanel={setPanel} />
              </div>
            </div>
          </>
        )}
        {view === "playing" && hud && !scene && (
          <>
            <div ref={topRef} className="absolute inset-x-0 top-0">
              <HudBar hud={hud} onPause={() => setPaused(true)} />
            </div>
            <div ref={bottomRef} className="absolute inset-x-0 bottom-0">
              {hud.onStairs && !modal && (
                <div className="flex justify-center pb-1.5">
                  <Button color="green" onClick={() => ctrl?.press({ type: "descend" })} className="cc-pop px-5 py-0.5 text-lg">
                    {hud.floor === hud.floors ? "Climb out ▲" : "Go down the stairs ▼"}
                  </Button>
                </div>
              )}
              <Messages messages={messages} />
              <div className="mt-1 bg-gradient-to-t from-[#0b0712] via-[#0b0712]/90 to-transparent">
                <Controls ctrl={ctrl} hud={hud} onBag={() => setBagOpen(true)} />
              </div>
            </div>
          </>
        )}
        {view === "playing" && banner && !scene && (
          <div key={banner.key} className="pointer-events-none absolute inset-x-0 top-[28%] flex justify-center">
            <div className="cc-count cc-title" style={{ fontSize: 54, color: banner.color, textShadow: "0 4px 0 #140a1c, 0 0 24px currentColor" }}>
              {banner.text}
            </div>
          </div>
        )}
        <Fade dark={dark} />
        {card && <StoryCard title={card.title} sub={card.sub} />}
        {dialogue && <DialogueBox dialogue={dialogue} onNext={() => ctrl?.advance()} keyRef={advanceKey} />}
        {view === "playing" && bagOpen && hud && <BagPanel bag={hud.bag} onUse={takeItem} onClose={() => setBagOpen(false)} />}
        {view === "playing" && paused && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0b0712]/75 px-6">
            <div className="cc-title" style={{ fontSize: 56, color: ORANGE, textShadow: "0 4px 0 #8a3a00, 0 8px 0 #140a1c" }}>
              PAUSED
            </div>
            <Button color="green" onClick={() => setPaused(false)} className="mt-6 w-full max-w-xs py-1 text-2xl">
              Resume
            </Button>
            <Button color="stone" onClick={retreat} className="mt-3 w-full max-w-xs py-0 text-base">
              Retreat to camp
            </Button>
            <p className="cc-outline-sm mt-2 max-w-xs text-center text-xs text-[#ffe9c4]/70">Retreating counts as fainting: you keep levels and recruits, but lose what you found.</p>
          </div>
        )}
        {panel && save && (
          <Camp key={panel} save={save} signedIn={!!storeRef.current?.signedIn} initialTab={panel} story={storyMark} onChange={persist} onEnter={enter} onClose={() => setPanel(null)} />
        )}
        {view === "result" && result && (
          <Result {...result} onCamp={() => void goCamp()} onNext={runRef.current.kind === "chapter" && result.result.report.cleared ? undefined : afterResult} />
        )}
        {prompt && <VeteranPrompt onPlay={() => void startPrologue()} onSkip={skipPrologue} />}
      </div>
    </div>
  );
}
