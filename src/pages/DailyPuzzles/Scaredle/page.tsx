// Scaredle: Wordle with a spooky word every day. Six guesses at a five-letter word;
// orange is the right letter in the right place, purple is in the word somewhere else.
//
// Every guess goes to the server, which marks it: the answer is never on the page until
// the game is over. The server keeps each player's boards, so they follow them between
// devices, and older days stay playable from the archive. It pays the tickets (100 on
// the day, 10 after) and writes the leaderboard score ((7 - guesses) x 100).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Embers } from "../../Royale/ui/parts";
import { GUESSES } from "../../../../server/shared/dailyPuzzles/guesses.js";
import { Keyboard } from "../Keyboard";
import { copyText, formatCountdown, keyFromEvent, readJSON, writeJSON } from "../daily";
import { ApiError, api, formatPuzzleDate, puzzleFromUrl, setPuzzleInUrl, streaks, useSignedIn, type Archive, type Mark, type ScaredleView } from "../api";
import { ArchiveList, Modal, SignInCard } from "../Shell";
import "../daily.css";

const LENGTH = 5;
const TRIES = 6;
const FLIP_MS = 260 * (LENGTH - 1) + 500;
const WIN_WORDS = ["Possessed!", "Frightful!", "Wicked!", "Spooky good!", "Phew!", "Close call!"];
const HELP_KEY = "scaredle:seenHelp";

let validWords: Set<string> | null = null;
function isWord(word: string) {
  if (!validWords) {
    validWords = new Set();
    for (let i = 0; i < GUESSES.length; i += LENGTH) validWords.add(GUESSES.slice(i, i + LENGTH));
  }
  return validWords.has(word.toLowerCase());
}

const RANK: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };

export default function Scaredle() {
  const signedIn = useSignedIn();
  return (
    <div className="dp-root relative flex h-[100dvh] w-full flex-col overflow-hidden">
      <Embers count={10} />
      {signedIn === false ? (
        <SignInCard title="SCAREDLE" pitch="One spooky five-letter word a day. Six guesses to find it." />
      ) : signedIn ? (
        <Game />
      ) : null}
    </div>
  );
}

function Game() {
  const [archive, setArchive] = useState<Archive | null>(null);
  const [view, setView] = useState<ScaredleView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typing, setTyping] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  // The row whose tiles are flipping over right now (only a fresh guess, not a reload)
  const [fresh, setFresh] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"help" | "stats" | "archive" | null>(readJSON<boolean>(HELP_KEY) ? null : "help");
  const [countdown, setCountdown] = useState(0);
  const toastTimer = useRef(0);

  const flash = useCallback((text: string, ms = 1400) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  const refreshArchive = useCallback(async () => {
    const a = await api<Archive>("scaredle");
    setArchive(a);
    setCountdown(a.nextInMs);
    return a;
  }, []);

  const open = useCallback(
    async (n: number, today: number) => {
      setLoadError(null);
      setTyping("");
      setFresh(-1);
      try {
        const v = await api<ScaredleView>(`scaredle/${n}`);
        setView(v);
        setPuzzleInUrl(n, today);
      } catch (error) {
        setLoadError(error instanceof ApiError ? error.message : "Couldn't load the puzzle");
      }
    },
    [],
  );

  useEffect(() => {
    refreshArchive()
      .then((a) => open(Math.min(puzzleFromUrl() ?? a.today, a.today), a.today))
      .catch(() => setLoadError("Couldn't reach the crypt. Try again?"));
  }, [refreshArchive, open]);

  // Counts down to the next word, then fetches it
  useEffect(() => {
    const t = window.setInterval(() => {
      setCountdown((ms) => {
        if (ms > 0 && ms <= 1000) refreshArchive().catch(() => {});
        return Math.max(0, ms - 1000);
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [refreshArchive]);

  const done = Boolean(view?.done);

  // Key colours wait for the flip to finish, so they don't give the row away
  const keyStates = useMemo(() => {
    const states: Record<string, Mark> = {};
    view?.guesses.forEach((g, r) => {
      if (r === fresh && busy) return;
      [...g].forEach((ch, i) => {
        const s = view.marks[r][i];
        if (!states[ch] || RANK[s] > RANK[states[ch]]) states[ch] = s;
      });
    });
    return states;
  }, [view, fresh, busy]);

  const submit = useCallback(async () => {
    if (!view) return;
    if (typing.length < LENGTH) {
      setShake(true);
      return flash("Not enough letters");
    }
    if (!isWord(typing)) {
      setShake(true);
      return flash("Not in the word list");
    }
    setBusy(true);
    let next: ScaredleView;
    try {
      next = await api<ScaredleView>(`scaredle/${view.puzzle}/guess`, { method: "POST", body: { guess: typing } });
    } catch (error) {
      setBusy(false);
      setShake(true);
      return flash(error instanceof ApiError ? error.message : "Couldn't send that. Try again?", 2000);
    }
    setView(next);
    setTyping("");
    setFresh(next.guesses.length - 1);
    window.setTimeout(() => {
      setBusy(false);
      if (!next.done) return;
      const paid = next.reward?.tickets ? `  +${next.reward.tickets} tickets` : "";
      flash(next.won ? `${WIN_WORDS[next.guesses.length - 1]}${paid}` : (next.answer ?? ""), next.won ? 2200 : 4000);
      refreshArchive().catch(() => {});
      window.setTimeout(() => setModal("stats"), 2400);
    }, FLIP_MS);
  }, [view, typing, flash, refreshArchive]);

  const onKey = useCallback(
    (key: string) => {
      if (!view || done || busy || modal) return;
      if (key === "ENTER") submit();
      else if (key === "BACK") setTyping((t) => t.slice(0, -1));
      else if (/^[A-Z]$/.test(key)) setTyping((t) => (t.length < LENGTH ? t + key : t));
    },
    [view, done, busy, modal, submit],
  );

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setModal(null);
      const key = keyFromEvent(e);
      if (!key) return;
      e.preventDefault();
      onKey(key);
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [onKey]);

  useEffect(() => {
    if (!shake) return;
    const t = window.setTimeout(() => setShake(false), 450);
    return () => window.clearTimeout(t);
  }, [shake]);

  const closeModal = () => {
    writeJSON(HELP_KEY, true);
    setModal(null);
  };

  const share = async () => {
    if (!view) return;
    const grid = view.marks.map((r) => r.map((s) => (s === "correct" ? "🟧" : s === "present" ? "🟪" : "⬛")).join("")).join("\n");
    const text = `Scaredle #${view.puzzle} ${view.won ? view.guesses.length : "X"}/${TRIES}\n\n${grid}`;
    flash((await copyText(text)) ? "Copied to clipboard" : "Couldn't copy");
  };

  const pick = (n: number) => {
    if (!archive) return;
    setModal(null);
    open(n, archive.today);
  };

  const isToday = view && archive && view.puzzle === archive.today;
  const typingRow = view?.guesses.length ?? 0;

  return (
    <>
      <header className="dp-header relative z-10">
        <div className="flex gap-2">
          <button type="button" className="dp-icon-btn" aria-label="How to play" onClick={() => setModal("help")}>?</button>
          <button type="button" className="dp-icon-btn" aria-label="Archive" onClick={() => setModal("archive")}>☰</button>
        </div>
        <div className="text-center">
          <div className="dp-title cc-outline" style={{ color: "#ff8a1f" }}>SCAREDLE</div>
          <div className="dp-sub">{view ? `#${view.puzzle} · ${isToday ? "TODAY" : formatPuzzleDate(view.date).toUpperCase()}` : " "}</div>
        </div>
        <button type="button" className="dp-icon-btn" aria-label="Stats" onClick={() => setModal("stats")}>▤</button>
      </header>

      {loadError && !view && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p>{loadError}</p>
          <Button color="orange" onClick={() => window.location.reload()}>Try again</Button>
        </div>
      )}

      {view && (
        <>
          <main className="relative z-10 flex min-h-0 flex-1 items-center justify-center p-3">
            <div className="sd-board" style={{ width: "min(330px, 92vw, calc((100dvh - 300px) * 0.83))" }}>
              {Array.from({ length: TRIES }, (_, r) => {
                const word = r < view.guesses.length ? view.guesses[r] : r === typingRow && !done ? typing : "";
                const marks = view.marks[r];
                const won = view.won && r === view.guesses.length - 1;
                return (
                  <div key={r} className={`sd-row ${shake && r === typingRow ? "sd-shake" : ""} ${won && r === fresh ? "sd-win" : ""}`}>
                    {Array.from({ length: LENGTH }, (_, i) => {
                      const ch = word[i] ?? "";
                      const cls = marks ? `dp-${marks[i]} ${r === fresh ? "sd-flip" : ""}` : ch ? "sd-typed" : "";
                      return (
                        <div key={i} className={`sd-tile ${cls}`} style={{ "--i": i } as React.CSSProperties}>
                          {ch}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </main>

          <div className="relative z-10">
            {done && !busy ? (
              <div className="flex flex-col items-center gap-2 px-4 pb-6 pt-2 text-center">
                <div className="text-lg">
                  {view.won ? "You found it: " : "The word was "}
                  <b style={{ color: "#ff8a1f" }}>{view.answer}</b>
                  {view.tickets ? <span className="text-[#ffcf4a]"> · +{view.tickets} tickets</span> : null}
                </div>
                <div className="text-sm text-[#a993c0]">Next word in {formatCountdown(countdown)}</div>
                <div className="flex gap-2">
                  <Button color="orange" onClick={share}>Share</Button>
                  <Button color="purple" onClick={() => setModal("archive")}>Archive</Button>
                </div>
              </div>
            ) : (
              <Keyboard onKey={onKey} states={keyStates} />
            )}
          </div>
        </>
      )}

      {toast && <div className="dp-toast">{toast}</div>}

      {modal && (
        <Modal onClose={closeModal}>
          {modal === "help" && <Help />}
          {modal === "stats" && <StatsView archive={archive} view={view} countdown={countdown} onShare={share} />}
          {modal === "archive" && archive && (
            <ArchiveList
              today={archive.today}
              plays={archive.plays}
              current={view?.puzzle ?? archive.today}
              onPick={pick}
              describe={(p) => (p.won ? `Solved ${p.tries}/6` : "Lost")}
            />
          )}
        </Modal>
      )}
    </>
  );
}

function Example({ word, at, state }: { word: string; at: number; state: Mark }) {
  return (
    <div className="my-2 grid w-[190px] grid-cols-5 gap-1">
      {[...word].map((ch, i) => (
        <div key={i} className={`sd-tile ${i === at ? `dp-${state}` : ""}`} style={{ fontSize: 20 }}>
          {ch}
        </div>
      ))}
    </div>
  );
}

function Help() {
  return (
    <div className="text-[15px] leading-snug">
      <div className="mb-2 text-xl font-bold text-[#ffcf4a]">How to play</div>
      <p>Guess the spooky word in 6 tries. Every guess has to be a real five-letter word.</p>
      <Example word="GHOUL" at={0} state="correct" />
      <p><b>G</b> is in the word, in the right spot.</p>
      <Example word="BROOM" at={2} state="present" />
      <p><b>O</b> is in the word, but somewhere else.</p>
      <Example word="SLIME" at={3} state="absent" />
      <p><b>M</b> isn't in the word at all.</p>
      <p className="mt-3 text-[#a993c0]">A new word rises every midnight (US Eastern). Solve it that day for 100 tickets, or catch up from the archive (☰) for 10.</p>
    </div>
  );
}

function StatsView({ archive, view, countdown, onShare }: { archive: Archive | null; view: ScaredleView | null; countdown: number; onShare: () => void }) {
  const plays = archive?.plays.filter((p) => p.done) ?? [];
  const wins = plays.filter((p) => p.won);
  const dist = [0, 0, 0, 0, 0, 0];
  wins.forEach((p) => p.tries >= 1 && p.tries <= 6 && dist[p.tries - 1]++);
  const most = Math.max(1, ...dist);
  const winPct = plays.length ? Math.round((wins.length / plays.length) * 100) : 0;
  const { current, best } = streaks(archive?.plays ?? [], archive?.today ?? 0);
  return (
    <div>
      <div className="mb-3 text-xl font-bold text-[#ffcf4a]">Statistics</div>
      <div className="mb-4 flex justify-between">
        <div className="dp-stat"><b>{plays.length}</b><span>Played</span></div>
        <div className="dp-stat"><b>{winPct}</b><span>Win %</span></div>
        <div className="dp-stat"><b>{current}</b><span>Streak</span></div>
        <div className="dp-stat"><b>{best}</b><span>Best</span></div>
      </div>
      <div className="mb-1 font-bold">Guesses</div>
      <div className="flex flex-col gap-1">
        {dist.map((count, i) => {
          const hit = view?.won && view.guesses.length === i + 1;
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-3">{i + 1}</span>
              <div className={`dp-bar ${hit ? "dp-bar-hit" : ""}`} style={{ width: `${Math.max(7, (count / most) * 100)}%` }}>{count}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-[#a993c0]">Streaks count words solved on their own day.</p>
      {view?.done && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[#a993c0]">NEXT WORD</div>
            <div className="text-2xl" style={{ fontFamily: "CCDigits, Pixelify, monospace" }}>{formatCountdown(countdown)}</div>
          </div>
          <Button color="orange" onClick={onShare}>Share</Button>
        </div>
      )}
    </div>
  );
}
