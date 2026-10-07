// Cross Bones: a daily themed crossword. Each night has a theme and a grid of about a
// dozen of its words, the same for everyone.
//
// The page only ever has the grid's shape and clues. Letters are saved to the server as
// they're typed; it says when the grid is right, and Check and Reveal ask it too. It
// keeps each player's grid and clock (from when they first opened the puzzle), pays the
// tickets (100 on the day, 10 after) and writes the leaderboard score: 1000, less a
// point every 2 seconds, 25 a Check and 40 a revealed letter, never under 50.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Embers } from "../../Royale/ui/parts";
import { Keyboard } from "../Keyboard";
import { copyText, formatCountdown, keyFromEvent, readJSON, writeJSON } from "../daily";
import { ApiError, api, formatPuzzleDate, puzzleFromUrl, setPuzzleInUrl, streaks, useSignedIn, type Archive, type CrossBonesView, type Entry } from "../api";
import { ArchiveList, Modal, SignInCard } from "../Shell";
import "../daily.css";

type Dir = Entry["dir"];
const HELP_KEY = "crossbones:seenHelp";
const SAVE_AFTER_MS = 600;

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function useCoarse() {
  const [coarse, setCoarse] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  useEffect(() => {
    const q = window.matchMedia("(pointer: coarse)");
    const on = () => setCoarse(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return coarse;
}

export default function CrossBones() {
  const signedIn = useSignedIn();
  return (
    <div className="dp-root relative flex h-[100dvh] w-full flex-col overflow-hidden">
      <Embers count={8} />
      {signedIn === false ? (
        <SignInCard title="CROSS BONES" pitch="A haunted crossword every midnight, with a new theme each night." />
      ) : signedIn ? (
        <Game />
      ) : null}
    </div>
  );
}

function Game() {
  const [archive, setArchive] = useState<Archive | null>(null);
  const [view, setView] = useState<CrossBonesView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modal, setModal] = useState<"help" | "done" | "archive" | null>(readJSON<boolean>(HELP_KEY) ? null : "help");
  const [countdown, setCountdown] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);

  const flash = useCallback((text: string, ms = 1800) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const refreshArchive = useCallback(async () => {
    const a = await api<Archive>("cross-bones");
    setArchive(a);
    setCountdown(a.nextInMs);
    return a;
  }, []);

  const open = useCallback(async (n: number, today: number) => {
    setLoadError(null);
    try {
      const v = await api<CrossBonesView>(`cross-bones/${n}`);
      setView(v);
      setPuzzleInUrl(n, today);
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : "Couldn't load the puzzle");
    }
  }, []);

  useEffect(() => {
    refreshArchive()
      .then((a) => open(Math.min(puzzleFromUrl() ?? a.today, a.today), a.today))
      .catch(() => setLoadError("Couldn't reach the crypt. Try again?"));
  }, [refreshArchive, open]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setCountdown((ms) => {
        if (ms > 0 && ms <= 1000) refreshArchive().catch(() => {});
        return Math.max(0, ms - 1000);
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [refreshArchive]);

  const closeModal = () => {
    writeJSON(HELP_KEY, true);
    setModal(null);
  };

  const pick = (n: number) => {
    if (!archive) return;
    setModal(null);
    setView(null);
    open(n, archive.today);
  };

  const isToday = view && archive && view.puzzle === archive.today;

  return (
    <>
      <header className="dp-header relative z-10">
        <div className="flex gap-2">
          <button type="button" className="dp-icon-btn" aria-label="How to play" onClick={() => setModal("help")}>?</button>
          <button type="button" className="dp-icon-btn" aria-label="Archive" onClick={() => setModal("archive")}>☰</button>
        </div>
        <div className="min-w-0 text-center">
          <div className="dp-title cc-outline" style={{ color: "#f1e6d0" }}>CROSS BONES</div>
          <div className="dp-sub truncate">
            {view ? `#${view.puzzle} · ${isToday ? "TODAY" : formatPuzzleDate(view.date).toUpperCase()} · ${view.layout.theme.toUpperCase()}` : " "}
          </div>
        </div>
        <Clock view={view} />
      </header>

      {loadError && !view && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p>{loadError}</p>
          <Button color="orange" onClick={() => window.location.reload()}>Try again</Button>
        </div>
      )}

      {view && (
        <Board
          key={view.puzzle}
          initial={view}
          paused={modal !== null}
          countdown={countdown}
          flash={flash}
          onChange={setView}
          onSolved={() => {
            refreshArchive().catch(() => {});
            window.setTimeout(() => setModal("done"), 1300);
          }}
        />
      )}

      {toast && <div className="dp-toast">{toast}</div>}

      {modal && (
        <Modal onClose={closeModal}>
          {modal === "help" && (
            <div className="text-[15px] leading-snug">
              <div className="mb-2 text-xl font-bold text-[#ffcf4a]">How to play</div>
              <p className="mb-2">A new themed crossword every midnight (US Eastern). Fill every square to solve it.</p>
              <ul className="mb-2 list-disc pl-5">
                <li>Tap a square to pick it. Tap it again to switch between across and down.</li>
                <li>Type to fill it in. The cursor moves on by itself.</li>
                <li>On a keyboard: arrows move, Tab goes to the next clue, Space turns.</li>
              </ul>
              <p className="mb-2">Your score starts at 1000 and loses a point every 2 seconds from when you open the puzzle. <b>Check</b> costs 25 and each <b>revealed</b> letter costs 40.</p>
              <p className="text-[#a993c0]">Solve it that day for 100 tickets, or catch up from the archive (☰) for 10. A grid more than half revealed pays nothing.</p>
            </div>
          )}
          {modal === "done" && view && <DoneView view={view} archive={archive} countdown={countdown} flash={flash} />}
          {modal === "archive" && archive && (
            <ArchiveList
              today={archive.today}
              plays={archive.plays}
              current={view?.puzzle ?? archive.today}
              onPick={pick}
              describe={(p) => `Solved · ${p.score}`}
            />
          )}
        </Modal>
      )}
    </>
  );
}

// Runs from the server's count, ticking on locally; stops when it's solved
function Clock({ view }: { view: CrossBonesView | null }) {
  const [now, setNow] = useState(() => performance.now());
  const base = useRef({ at: performance.now(), elapsed: 0 });
  useEffect(() => {
    base.current = { at: performance.now(), elapsed: view?.elapsed ?? 0 };
  }, [view?.elapsed, view?.puzzle]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!view) return <div className="dp-icon-btn" style={{ width: "auto" }} />;
  const ms = view.done ? view.elapsed : base.current.elapsed + (now - base.current.at);
  return (
    <div className="dp-icon-btn px-2 text-sm" style={{ width: "auto", fontFamily: "CCDigits, Pixelify, monospace" }} aria-label="Time">
      {clock(ms)}
    </div>
  );
}

function cellsOf(e: Entry, cols: number): number[] {
  return Array.from({ length: e.length }, (_, i) => (e.dir === "across" ? e.row * cols + e.col + i : (e.row + i) * cols + e.col));
}

function Board({ initial, paused, countdown, flash, onChange, onSolved }: {
  initial: CrossBonesView;
  paused: boolean;
  countdown: number;
  flash: (text: string, ms?: number) => void;
  onChange: (v: CrossBonesView) => void;
  onSolved: () => void;
}) {
  const { rows, cols, mask, entries } = initial.layout;
  const [fill, setFill] = useState(initial.fill);
  const [revealed, setRevealed] = useState<number[]>(initial.revealed);
  const [done, setDone] = useState(initial.done);
  const [justSolved, setJustSolved] = useState(false);
  const [wrong, setWrong] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState(() => entries[0].row * cols + entries[0].col);
  const [dir, setDir] = useState<Dir>(entries[0].dir);
  const [revealMenu, setRevealMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const coarse = useCoarse();
  const fillRef = useRef(fill);
  fillRef.current = fill;
  const saveTimer = useRef(0);
  const sentFill = useRef(initial.fill);

  const nums = useMemo(() => {
    const m = new Map<number, number>();
    entries.forEach((e) => m.set(e.row * cols + e.col, e.num));
    return m;
  }, [entries, cols]);

  // Each square's across and down entry
  const owners = useMemo(() => {
    const map = new Map<number, Partial<Record<Dir, Entry>>>();
    for (const e of entries) for (const i of cellsOf(e, cols)) map.set(i, { ...map.get(i), [e.dir]: e });
    return map;
  }, [entries, cols]);

  const entry = owners.get(sel)?.[dir] ?? owners.get(sel)?.[dir === "across" ? "down" : "across"] ?? entries[0];
  const entryCells = useMemo(() => cellsOf(entry, cols), [entry, cols]);
  const cross = owners.get(sel)?.[entry.dir === "across" ? "down" : "across"];

  // Whatever the server said, for the parent's clock and the done card
  const settle = useCallback(
    (v: CrossBonesView) => {
      onChange(v);
      setRevealed(v.revealed);
      if (v.done && !done) {
        setDone(true);
        setJustSolved(true);
        setFill(v.fill);
        const paid = v.reward?.tickets ? `  +${v.reward.tickets} tickets` : "";
        flash(`Laid to rest!${paid}`, 2200);
        onSolved();
      } else if (v.fullButWrong) {
        flash("Not quite... something's buried wrong");
      }
    },
    [onChange, done, flash, onSolved],
  );

  const save = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const now = fillRef.current;
    if (now === sentFill.current) return;
    sentFill.current = now;
    try {
      settle(await api<CrossBonesView>(`cross-bones/${initial.puzzle}`, { method: "PUT", body: { fill: now } }));
    } catch {
      sentFill.current = "";
      flash("Couldn't save. Still trying...", 2000);
      saveTimer.current = window.setTimeout(save, 3000);
    }
  }, [initial.puzzle, settle, flash]);

  // Saved a moment after typing stops, or straight away once every square has a letter
  const setLetters = useCallback(
    (next: string) => {
      setFill(next);
      fillRef.current = next;
      window.clearTimeout(saveTimer.current);
      if (!next.includes(" ")) save();
      else saveTimer.current = window.setTimeout(save, SAVE_AFTER_MS);
    },
    [save],
  );

  useEffect(() => {
    const flush = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      save();
    };
  }, [save]);

  const select = useCallback((i: number, d?: Dir) => {
    setSel(i);
    if (d) setDir(d);
  }, []);

  const firstEmpty = useCallback((e: Entry) => cellsOf(e, cols).find((i) => fillRef.current[i] === " "), [cols]);

  const gotoEntry = useCallback((e: Entry) => select(firstEmpty(e) ?? e.row * cols + e.col, e.dir), [select, firstEmpty, cols]);

  const stepEntry = useCallback(
    (by: 1 | -1) => {
      const i = entries.indexOf(entry);
      gotoEntry(entries[(i + by + entries.length) % entries.length]);
    },
    [entries, entry, gotoEntry],
  );

  const type = useCallback(
    (ch: string) => {
      if (!revealed.includes(sel)) {
        const next = fillRef.current.slice(0, sel) + ch + fillRef.current.slice(sel + 1);
        setWrong((w) => (w.has(sel) ? new Set([...w].filter((k) => k !== sel)) : w));
        setLetters(next);
      }
      // Square by square to the end of the word (over letters already in, so a word can be
      // retyped), then back to any gap it still has, then on to the next word with one
      const i = entryCells.indexOf(sel);
      if (i < entryCells.length - 1) return select(entryCells[i + 1]);
      const gap = entryCells.find((k) => fillRef.current[k] === " ");
      if (gap !== undefined) return select(gap);
      const start = entries.indexOf(entry);
      for (let k = 1; k <= entries.length; k++) {
        const e = entries[(start + k) % entries.length];
        const g = firstEmpty(e);
        if (g !== undefined) return select(g, e.dir);
      }
    },
    [sel, revealed, entryCells, entries, entry, setLetters, select, firstEmpty],
  );

  const back = useCallback(() => {
    const clear = (k: number) => {
      if (revealed.includes(k)) return;
      setLetters(fillRef.current.slice(0, k) + " " + fillRef.current.slice(k + 1));
    };
    if (fillRef.current[sel] !== " " && !revealed.includes(sel)) return clear(sel);
    const i = entryCells.indexOf(sel);
    if (i > 0) {
      select(entryCells[i - 1]);
      clear(entryCells[i - 1]);
    }
  }, [sel, revealed, entryCells, setLetters, select]);

  const move = useCallback(
    (dr: number, dc: number) => {
      const want: Dir = dc ? "across" : "down";
      if (dir !== want && owners.get(sel)?.[want]) return setDir(want);
      let r = Math.floor(sel / cols);
      let c = sel % cols;
      for (;;) {
        r += dr;
        c += dc;
        if (r < 0 || c < 0 || r >= rows || c >= cols) return;
        const k = r * cols + c;
        if (mask[k] !== "#") return select(k, owners.get(k)?.[want] ? want : undefined);
      }
    },
    [dir, owners, sel, rows, cols, mask, select],
  );

  const onKey = useCallback(
    (key: string) => {
      if (done || paused || busy) return;
      if (key === "ENTER") stepEntry(1);
      else if (key === "BACK") back();
      else if (/^[A-Z]$/.test(key)) type(key);
    },
    [done, paused, busy, stepEntry, back, type],
  );

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setRevealMenu(false);
      if (done || paused) return;
      const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (arrows[e.key]) {
        e.preventDefault();
        return move(...arrows[e.key]);
      }
      if (e.key === "Tab") {
        e.preventDefault();
        return stepEntry(e.shiftKey ? -1 : 1);
      }
      if (e.key === " ") {
        e.preventDefault();
        if (cross) setDir(cross.dir);
        return;
      }
      const key = keyFromEvent(e);
      if (!key) return;
      e.preventDefault();
      onKey(key);
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [done, paused, move, stepEntry, cross, onKey]);

  const clickCell = (k: number) => {
    if (done) return;
    const o = owners.get(k);
    if (sel === k) {
      const other: Dir = dir === "across" ? "down" : "across";
      if (o?.[other]) setDir(other);
      return;
    }
    select(k, o?.[dir] ? dir : dir === "across" ? "down" : "across");
  };

  const check = async () => {
    window.clearTimeout(saveTimer.current);
    setBusy(true);
    try {
      const v = await api<CrossBonesView>(`cross-bones/${initial.puzzle}/check`, { method: "POST", body: { fill: fillRef.current } });
      sentFill.current = fillRef.current;
      const bad = v.wrong ?? [];
      setWrong(new Set(bad));
      settle(v);
      flash(bad.length ? `${bad.length} letter${bad.length === 1 ? "" : "s"} wrong (−25)` : "So far so good (−25)");
    } catch (error) {
      flash(error instanceof ApiError ? error.message : "Couldn't check. Try again?");
    } finally {
      setBusy(false);
    }
  };

  const reveal = async (cells: number[]) => {
    setRevealMenu(false);
    window.clearTimeout(saveTimer.current);
    setBusy(true);
    try {
      const v = await api<CrossBonesView>(`cross-bones/${initial.puzzle}/reveal`, { method: "POST", body: { fill: fillRef.current, cells } });
      // Only the revealed squares change: anything typed meanwhile stays
      let next = fillRef.current;
      for (const k of v.revealed) next = next.slice(0, k) + v.fill[k] + next.slice(k + 1);
      setFill(next);
      fillRef.current = next;
      sentFill.current = v.fill;
      setWrong((w) => new Set([...w].filter((k) => !cells.includes(k))));
      settle(v);
      if (next !== v.fill && !v.done) save();
    } catch (error) {
      flash(error instanceof ApiError ? error.message : "Couldn't reveal. Try again?");
    } finally {
      setBusy(false);
    }
  };

  // Cells size to the space left for the grid
  const boxRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(32);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setCell(Math.max(18, Math.floor(Math.min(el.clientWidth / cols, el.clientHeight / rows, 48))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows, cols]);

  const filledEntry = (e: Entry) => cellsOf(e, cols).every((k) => fill[k] !== " ");
  const cluePane = (title: string, list: Entry[]) => (
    <div className="min-w-0">
      <div className="mb-1 border-b border-[#3a2550] pb-1 text-sm font-bold uppercase tracking-widest text-[#ffcf4a]">{title}</div>
      {list.map((e) => (
        <div
          key={`${e.num}${e.dir}`}
          className={`cb-clue ${e === entry && !done ? "cb-clue-sel" : e === cross && !done ? "cb-clue-cross" : ""} ${filledEntry(e) ? "cb-clue-done" : ""}`}
          onClick={() => !done && gotoEntry(e)}
        >
          <b>{e.num}</b>
          <span>{e.clue}</span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-2 p-2 md:flex-row md:gap-4 md:p-4">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div ref={boxRef} className="flex min-h-0 flex-1 items-center justify-center">
            <div
              className={`cb-grid ${done && justSolved ? "cb-solved" : ""}`}
              style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, ["--cb-font" as string]: `${Math.round(cell * 0.58)}px`, ["--cb-num" as string]: `${Math.max(7, Math.round(cell * 0.27))}px` }}
            >
              {[...mask].map((m, k) => {
                if (m === "#") return <div key={k} className="cb-cell cb-block" />;
                const cls = [
                  !done && sel === k ? "cb-sel" : !done && entryCells.includes(k) ? "cb-word" : "",
                  wrong.has(k) ? "cb-wrong" : "",
                  revealed.includes(k) ? "cb-revealed" : "",
                ].join(" ");
                return (
                  <div key={k} className={`cb-cell ${cls}`} style={{ ["--d" as string]: Math.floor(k / cols) + (k % cols) }} onClick={() => clickCell(k)}>
                    {nums.has(k) && <span className="cb-num">{nums.get(k)}</span>}
                    {fill[k].trim()}
                  </div>
                );
              })}
            </div>
          </div>

          {!done ? (
            <>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button color="stone" className="!px-3 !py-1 text-sm" disabled={busy} onClick={check}>Check</Button>
                <div className="relative">
                  <Button color="stone" className="!px-3 !py-1 text-sm" disabled={busy} onClick={() => setRevealMenu((m) => !m)}>Reveal ▾</Button>
                  {revealMenu && (
                    <div className="absolute bottom-full left-1/2 z-20 mb-1 flex -translate-x-1/2 flex-col gap-1 rounded-md border-2 border-[#3a2550] bg-[#1d1129] p-1">
                      <button type="button" className="whitespace-nowrap rounded px-3 py-1 text-left hover:bg-[#2c1a3d]" onClick={() => reveal([sel])}>Letter (−40)</button>
                      <button type="button" className="whitespace-nowrap rounded px-3 py-1 text-left hover:bg-[#2c1a3d]" onClick={() => reveal(entryCells)}>Word (−40 a letter)</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="md:hidden">
                <div className="cb-cluebar">
                  <button type="button" className="px-1 text-xl text-[#a993c0]" aria-label="Previous clue" onClick={() => stepEntry(-1)}>‹</button>
                  <div className="flex-1 text-[15px] leading-tight" onClick={() => cross && setDir(cross.dir)}>
                    <b>{entry.num}{entry.dir === "across" ? "A" : "D"}</b> {entry.clue}
                  </div>
                  <button type="button" className="px-1 text-xl text-[#a993c0]" aria-label="Next clue" onClick={() => stepEntry(1)}>›</button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1 pb-2 text-center">
              <div className="text-lg">
                Solved in <b>{clock(initial.elapsed)}</b> · score <b style={{ color: "#ff8a1f" }}>{initial.score}</b>
                {initial.tickets ? <span className="text-[#ffcf4a]"> · +{initial.tickets} tickets</span> : null}
              </div>
              <div className="text-sm text-[#a993c0]">Next crossword in {formatCountdown(countdown)}</div>
            </div>
          )}
        </div>

        <div className="hidden w-[min(380px,40%)] shrink-0 grid-cols-1 gap-4 overflow-y-auto pr-1 md:grid md:content-start">
          {cluePane("Across", entries.filter((e) => e.dir === "across"))}
          {cluePane("Down", entries.filter((e) => e.dir === "down"))}
        </div>
      </div>

      {coarse && !done && (
        <div className="relative z-10">
          <Keyboard onKey={onKey} enterLabel="Next" />
        </div>
      )}
    </>
  );
}

function DoneView({ view, archive, countdown, flash }: { view: CrossBonesView; archive: Archive | null; countdown: number; flash: (t: string) => void }) {
  const { current, best } = streaks(archive?.plays ?? [], archive?.today ?? 0);
  const share = async () => {
    const helped = view.revealed.length ? `, ${view.revealed.length} revealed` : "";
    const text = `Cross Bones #${view.puzzle}: ${view.layout.theme}\n🦴 Solved in ${clock(view.elapsed)}${helped}\nScore ${view.score}`;
    flash((await copyText(text)) ? "Copied to clipboard" : "Couldn't copy");
  };
  return (
    <div>
      <div className="mb-1 text-xl font-bold text-[#ffcf4a]">Laid to rest!</div>
      <div className="mb-3 text-sm text-[#a993c0]">
        {view.layout.theme}
        {view.tickets ? ` · +${view.tickets} tickets` : ""}
      </div>
      <div className="mb-4 flex justify-between">
        <div className="dp-stat"><b>{clock(view.elapsed)}</b><span>Time</span></div>
        <div className="dp-stat"><b>{view.score}</b><span>Score</span></div>
        <div className="dp-stat"><b>{current}</b><span>Streak</span></div>
        <div className="dp-stat"><b>{best}</b><span>Best</span></div>
      </div>
      <div className="mb-3 text-sm text-[#a993c0]">
        1000 − {Math.floor(view.elapsed / 2000)} time{view.checks ? ` − ${view.checks * 25} checks` : ""}
        {view.revealed.length ? ` − ${view.revealed.length * 40} reveals` : ""}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-[#a993c0]">NEXT CROSSWORD</div>
          <div className="text-2xl" style={{ fontFamily: "CCDigits, Pixelify, monospace" }}>{formatCountdown(countdown)}</div>
        </div>
        <Button color="orange" onClick={share}>Share</Button>
      </div>
    </div>
  );
}
