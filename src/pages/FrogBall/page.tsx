import { useCallback, useEffect, useRef, useState } from "react";
import { GameController, type BannerKind, type ClearInfo, type Hud, type RunResult } from "./game/controller";
import { setMuted, sfx, unlockAudio } from "./game/sfx";
import { STAGES } from "./game/stages";
import { Banner, ContinueScreen, FinalRanking, GameOverSplash, HudView, NameEntry, Pause, StageIntro, Tally } from "./ui/game";
import { isTouchDevice, useUiScale } from "./ui/hooks";
import { HowTo, MainMenu, Options, StageSelect, Title, type MenuChoice } from "./ui/menus";
import { addRanking, loadProgress, loadRanking, loadSettings, rankFor, saveProgress, saveSettings, type Settings } from "./ui/storage";
import "./frogball.css";

// In dev, /frog-ball?stage=7 makes GAME START begin on that stage, for testing.
function devStage() {
  if (!import.meta.env.DEV) return 0;
  const n = Number(new URLSearchParams(window.location.search).get("stage"));
  return n > 0 ? Math.min(STAGES.length, n) - 1 : 0;
}

type View = "title" | "menu" | "stages" | "options" | "howto" | "play" | "over";
type OverStep = "splash" | "name" | "continue" | "ranking";
const MENU_INDEX: Record<MenuChoice, number> = { start: 0, practice: 1, howto: 2, options: 3 };

// Frog Ball: Monkey Ball with a frog. Tip the world to roll the ball to the
// goal through floating dreamscapes.
export default function FrogBall() {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctrlRef = useRef<GameController | null>(null);
  const ui = useUiScale(rootRef);
  const [touch] = useState(isTouchDevice);

  const [view, setView] = useState<View>("title");
  const [menuAt, setMenuAt] = useState(0);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [progress, setProgress] = useState(loadProgress);
  const [ranking, setRanking] = useState(loadRanking);

  const [hud, setHud] = useState<Hud | null>(null);
  const [stage, setStage] = useState(0);
  const [intro, setIntro] = useState(0); // key of the stage intro showing, 0 for none
  const [banner, setBanner] = useState<{ kind: BannerKind; text: string; key: number } | null>(null);
  const [oneUp, setOneUp] = useState(0);
  const [clear, setClear] = useState<ClearInfo | null>(null);
  const [paused, setPaused] = useState(false);
  const [practice, setPractice] = useState(false);

  const [result, setResult] = useState<RunResult | null>(null);
  const [overStep, setOverStep] = useState<OverStep>("splash");
  const [rank, setRank] = useState(-1);
  const [highlight, setHighlight] = useState(-1);

  // Callbacks from the controller see the latest state through refs.
  const viewRef = useRef(view);
  viewRef.current = view;
  const practiceRef = useRef(practice);
  practiceRef.current = practice;
  const stageRef = useRef(stage);

  const updateProgress = useCallback((f: (p: ReturnType<typeof loadProgress>) => ReturnType<typeof loadProgress>) => {
    setProgress((p) => {
      const n = f(p);
      saveProgress(n);
      return n;
    });
  }, []);

  useEffect(() => setMuted(!settings.sound), [settings.sound]);

  useEffect(() => {
    const ctrl = new GameController(hostRef.current!, canvasRef.current!, {
      onHud: setHud,
      onStage: (i) => {
        stageRef.current = i;
        setStage(i);
        setClear(null);
        setIntro((k) => k + 1);
        updateProgress((p) => ({ ...p, reached: Math.max(p.reached, i) }));
      },
      onBanner: (text, kind) => {
        if (kind === "oneup") setOneUp((k) => k + 1);
        else setBanner({ text, kind, key: Date.now() + Math.random() });
      },
      onClear: (info) => {
        setClear(info);
        const s = STAGES[stageRef.current];
        const time = +(s.time - info.timeBonus / 100).toFixed(2);
        updateProgress((p) => ({ ...p, best: { ...p.best, [s.id]: Math.min(p.best[s.id] ?? Infinity, time) } }));
      },
      onPauseKey: () => {
        if (viewRef.current === "play") setPaused(true);
      },
      onOver: (run) => {
        setResult(run);
        setClear(null);
        setBanner(null);
        setHighlight(-1);
        if (!practiceRef.current) {
          // Inside the arcade cabinet, the arcade saves the score to the leaderboard
          if (window.parent !== window) {
            window.parent.postMessage({ type: "PLAYER_DIED", score: run.score }, window.location.origin);
          }
          updateProgress((p) => ({ ...p, lastScore: run.score }));
          setRank(rankFor(run.score));
        } else {
          setRank(-1);
        }
        setOverStep("splash");
        setView("over");
        // The attract demo plays behind the game over screens.
        ctrlRef.current?.start("demo");
      },
    });
    ctrlRef.current = ctrl;
    ctrl.start("demo");
    // For poking at the game from the console (and recording the cabinet video) in dev.
    if (import.meta.env.DEV) (window as unknown as { frogBall?: GameController }).frogBall = ctrl;
    return () => {
      ctrl.dispose();
      ctrlRef.current = null;
    };
  }, [updateProgress]);

  useEffect(() => {
    ctrlRef.current?.setPaused(paused);
  }, [paused]);

  // Banners clear themselves; the stage intro band too.
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => setBanner(null), banner.kind === "goal" ? 2600 : banner.kind === "fall" ? 2200 : 1300);
    return () => window.clearTimeout(t);
  }, [banner]);
  useEffect(() => {
    if (!intro) return;
    const t = window.setTimeout(() => setIntro(0), 2300);
    return () => window.clearTimeout(t);
  }, [intro]);

  // Leaving the tab pauses a run in progress.
  useEffect(() => {
    if (view !== "play") return;
    const onHidden = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [view]);

  const changeSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
    setMuted(!s.sound);
  };

  const resetPlayUi = () => {
    setHud(null);
    setClear(null);
    setBanner(null);
    setIntro(0);
    setPaused(false);
  };

  const toTitle = () => {
    resetPlayUi();
    setView("title");
    setRanking(loadRanking());
    ctrlRef.current?.start("demo");
  };

  // Back to the mode select; the demo keeps playing unless a stage preview replaced it.
  const toMenu = (at: number, restartDemo = false) => {
    setMenuAt(at);
    setView("menu");
    if (restartDemo) ctrlRef.current?.start("demo", 1);
  };

  const begin = (mode: "run" | "practice", at: number) => {
    unlockAudio();
    sfx.ribbit();
    setPractice(mode === "practice");
    resetPlayUi();
    setResult(null);
    setView("play");
    ctrlRef.current?.start(mode, at);
  };

  const pickMenu = (c: MenuChoice) => {
    setMenuAt(MENU_INDEX[c]);
    if (c === "start") begin("run", devStage());
    else if (c === "practice") setView("stages");
    else setView(c);
  };

  const previewStage = useCallback((i: number) => ctrlRef.current?.preview(i), []);

  // The game over run: splash, initials if you made the table, continue, ranking.
  const afterSplash = () => {
    if (!result) return;
    const canContinue = !practice && !result.cleared;
    if (!practice && rank >= 0) setOverStep("name");
    else if (canContinue) setOverStep("continue");
    else if (!practice) setOverStep("ranking");
    else toTitle();
  };

  const nameDone = (name: string) => {
    if (!result) return;
    const entry = { name, score: result.score, stage: STAGES[result.stage].id };
    setHighlight(addRanking(entry));
    setRanking(loadRanking());
    changeSettings({ ...settings, lastName: name });
    setOverStep(result.cleared ? "ranking" : "continue");
  };

  const continueRun = () => {
    resetPlayUi();
    setView("play");
    if (result) ctrlRef.current?.continueRun(result.stage);
  };

  return (
    <div ref={rootRef} className="fb-root fixed inset-0 z-50 overflow-hidden bg-[#1a1033] text-white">
      <div ref={hostRef} className="fb-canvas absolute inset-0 touch-none">
        <canvas ref={canvasRef} />
      </div>
      <div className="fb-ui" style={{ width: ui.w, height: ui.h, transform: `scale(${ui.s})` }}>
        {view === "title" && (
          <Title
            lastScore={progress.lastScore}
            ranking={ranking}
            touch={touch}
            onStart={() => {
              unlockAudio();
              sfx.coin();
              toMenu(0);
            }}
          />
        )}
        {view === "menu" && <MainMenu key={menuAt} touch={touch} initial={menuAt} onPick={pickMenu} onBack={() => (sfx.back(), toTitle())} />}
        {view === "stages" && (
          <StageSelect
            reached={progress.reached}
            best={progress.best}
            touch={touch}
            initial={Math.min(stage, progress.reached)}
            onFocus={previewStage}
            onPick={(i) => begin("practice", i)}
            onBack={() => (sfx.back(), toMenu(1, true))}
          />
        )}
        {view === "options" && (
          <Options
            settings={settings}
            touch={touch}
            onChange={changeSettings}
            onBack={() => (sfx.back(), setView("menu"))}
          />
        )}
        {view === "howto" && <HowTo touch={touch} onBack={() => (sfx.back(), setView("menu"))} />}

        {view === "play" && hud && <HudView hud={hud} portrait={ui.h > ui.w} onPause={() => setPaused(true)} />}
        {view === "play" && intro > 0 && !paused && <StageIntro key={intro} stage={stage} />}
        {view === "play" && banner && !paused && <Banner key={banner.key} kind={banner.kind} text={banner.text} />}
        {view === "play" && oneUp > 0 && <Banner key={`1up${oneUp}`} kind="oneup" text="1UP!" />}
        {view === "play" && clear && !paused && <Tally info={clear} practice={practice} stageTime={STAGES[stage].time} touch={touch} onSkip={() => ctrlRef.current?.skip()} />}
        {view === "play" && paused && (
          <Pause
            practice={practice}
            lives={hud?.lives ?? 0}
            touch={touch}
            sound={settings.sound}
            onResume={() => setPaused(false)}
            onRetry={() => {
              if (ctrlRef.current?.retry()) {
                resetPlayUi();
              }
            }}
            onSound={() => changeSettings({ ...settings, sound: !settings.sound })}
            onQuit={toTitle}
          />
        )}

        {view === "over" && result && overStep === "splash" && <GameOverSplash result={result} touch={touch} onNext={afterSplash} />}
        {view === "over" && result && overStep === "name" && <NameEntry score={result.score} rank={rank} initial={settings.lastName} touch={touch} onDone={nameDone} />}
        {view === "over" && result && overStep === "continue" && <ContinueScreen stage={result.stage} touch={touch} onYes={continueRun} onNo={() => setOverStep("ranking")} />}
        {view === "over" && overStep === "ranking" && <FinalRanking ranking={ranking} highlight={highlight} touch={touch} onDone={toTitle} />}
      </div>
    </div>
  );
}
