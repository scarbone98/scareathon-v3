import { useEffect, useState } from "react";
import Toolbar from "../pages/Arcade/Toolbar.tsx";
import { GUEST_SCORE_EVENT, type GuestScore, type MachineData } from "../pages/Arcade/games.tsx";
import { stubButton } from "./style/theme.ts";

// A game being played at the station: a thin bar (the scoreboard on this game, close) over
// the game frame, filling the screen. Guests who finish a run are pointed to the kiosk
// to sign in, rather than to the classic sign-in page.

type Props = { machine: MachineData | null; onClose: () => void; onLeaderboard: () => void; onSignIn: () => void };

export default function StationPlay({ machine, onClose, onLeaderboard, onSignIn }: Props) {
  const [guestScore, setGuestScore] = useState<GuestScore | null>(null);

  useEffect(() => {
    const handleGuestScore = (event: Event) => setGuestScore((event as CustomEvent<GuestScore>).detail);
    window.addEventListener(GUEST_SCORE_EVENT, handleGuestScore);
    return () => window.removeEventListener(GUEST_SCORE_EVENT, handleGuestScore);
  }, []);
  useEffect(() => {
    if (!machine) setGuestScore(null);
  }, [machine]);
  // A game can ask from its own menu to be closed (QUIT_GAME) or to show its scoreboard
  // (OPEN_LEADERBOARD), as the bar's buttons do. Only frames on this page are listened to.
  useEffect(() => {
    const handleGameMessage = (event: MessageEvent) => {
      const type = (event.data as { type?: unknown } | null)?.type;
      if (type !== "QUIT_GAME" && type !== "OPEN_LEADERBOARD") return;
      const fromGame = Array.from(document.querySelectorAll("iframe")).some((frame) => frame.contentWindow === event.source);
      if (!fromGame) return;
      if (type === "QUIT_GAME") onClose();
      else if (machine?.hasLeaderboard !== false) onLeaderboard();
    };
    window.addEventListener("message", handleGameMessage);
    return () => window.removeEventListener("message", handleGameMessage);
  }, [machine, onClose, onLeaderboard]);

  if (!machine?.game) return null;

  return (
    <div className="fixed inset-0 z-40 flex touch-manipulation select-none items-center justify-center bg-black" style={{ WebkitTouchCallout: "none" }}>
      <div className="flex h-full w-fit flex-col items-center justify-start">
        <Toolbar hasLeaderboard={machine.hasLeaderboard !== false} onLeaderboard={onLeaderboard} onClose={onClose} />
        {machine.game}
      </div>
      {guestScore && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,30rem)] -translate-x-1/2 items-center gap-3 rounded-[3px] bg-[#1d2a3a] px-4 py-3 text-sm text-[#f2ead2] shadow-2xl ring-1 ring-inset ring-[#f2ead2]/60"
        >
          <span className="flex-1">
            Nice run! <strong className="text-amber-300">{guestScore.score.toLocaleString()}</strong> points. Sign in to save your scores and earn tickets.
          </span>
          <button type="button" onClick={onSignIn} className={stubButton}>
            Kiosk
          </button>
          <button type="button" onClick={() => setGuestScore(null)} aria-label="Dismiss" className="shrink-0 px-1 text-lg leading-none text-[#f2ead2]/85 hover:text-[#f2ead2]">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
