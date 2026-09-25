import React, { useState } from "react";
import LeaderboardDialog from "./LeaderboardDialog.tsx";
import { FaTimes, FaTrophy } from "react-icons/fa";

interface ToolbarProps {
  currentGame: string;
  hasLeaderboard?: boolean;
  onClose: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ currentGame, hasLeaderboard = true, onClose }) => {
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const toggleLeaderboard = () => {
    setShowLeaderboard(!showLeaderboard);
  };

  return (
    <>
      <div
        className="z-40 flex h-12 w-full items-center justify-between gap-3 border border-red-900/70 bg-black/90 px-3 text-red-100 shadow-lg"
      >
        {hasLeaderboard ? (
          <button
            type="button"
            onClick={toggleLeaderboard}
            className="flex h-9 items-center gap-2 rounded border border-red-700/70 bg-red-950/70 px-3 text-sm font-semibold text-red-50 transition hover:border-red-300 hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-300"
          >
            <FaTrophy aria-hidden="true" />
            Leaderboard
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close game"
          title="Close game"
          className="flex h-9 w-9 items-center justify-center rounded border border-red-700/70 bg-red-950/70 text-red-50 transition hover:border-red-300 hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-300"
        >
          <FaTimes aria-hidden="true" />
        </button>
      </div>
      {showLeaderboard && (
        <LeaderboardDialog game={currentGame} onClose={toggleLeaderboard} />
      )}
    </>
  );
};

export default Toolbar;
