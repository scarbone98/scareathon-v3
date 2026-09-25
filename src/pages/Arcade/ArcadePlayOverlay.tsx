import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Toolbar from "./Toolbar.tsx";
import { GUEST_SCORE_EVENT, type GuestScore, type MachineData } from "./games.tsx";
import { useNavigatorContext } from "../../components/navigator/context.tsx";

type ArcadePlayOverlayProps = {
  machine: MachineData | null;
  onClose: () => void;
  // Where sign-in sends a guest back to, e.g. "/arcade"
  returnPath: string;
};

// The open game: toolbar (close, leaderboard) over the game frame, plus the
// "sign in to save your score" prompt for guests.
export default function ArcadePlayOverlay({ machine, onClose, returnPath }: ArcadePlayOverlayProps) {
  const { height: headerHeight, setHideMobileNav } = useNavigatorContext();
  const [guestScore, setGuestScore] = useState<GuestScore | null>(null);
  const isPlaying = Boolean(machine?.game);

  // The phone menu button sits over the game's controls; hide it while playing
  useEffect(() => {
    if (!isPlaying) return;
    setHideMobileNav(true);
    return () => setHideMobileNav(false);
  }, [isPlaying, setHideMobileNav]);

  useEffect(() => {
    const handleGuestScore = (event: Event) =>
      setGuestScore((event as CustomEvent<GuestScore>).detail);
    window.addEventListener(GUEST_SCORE_EVENT, handleGuestScore);
    return () => window.removeEventListener(GUEST_SCORE_EVENT, handleGuestScore);
  }, []);
  useEffect(() => {
    if (!machine) setGuestScore(null);
  }, [machine]);

  if (!machine?.game) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center bg-black bg-opacity-50"
      style={{ top: headerHeight }}
    >
      <div className="flex h-full w-fit flex-col items-center justify-start">
        <Toolbar
          currentGame={machine.name}
          hasLeaderboard={machine.hasLeaderboard !== false}
          onClose={onClose}
        />
        {machine.game}
      </div>
      {guestScore && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,30rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-400/60 bg-black/90 px-4 py-3 text-sm text-amber-100 shadow-2xl"
        >
          <span className="flex-1">
            Nice run! <strong className="text-amber-300">{guestScore.score.toLocaleString()}</strong>{" "}
            points. Sign in to save your scores and earn coins.
          </span>
          <Link
            to="/authentication"
            state={{ from: `${returnPath}?game=${encodeURIComponent(guestScore.game)}` }}
            className="shrink-0 rounded bg-amber-500 px-3 py-2 font-bold text-black transition hover:bg-amber-400"
          >
            Sign in
          </Link>
          <button
            type="button"
            onClick={() => setGuestScore(null)}
            aria-label="Dismiss"
            className="shrink-0 px-1 text-lg leading-none text-amber-200/70 transition hover:text-amber-100"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
