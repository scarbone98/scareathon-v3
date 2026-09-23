import React, { useState } from "react";
import { fetchWithAuth } from "../../fetchWithAuth";
import { useQuery } from "@tanstack/react-query";
import LoadingSpinner from "../../components/LoadingSpinner";
import { FaTimes, FaTrophy } from "react-icons/fa";

interface LeaderboardEntry {
  username: string;
  metricValue: number;
  achieved_at: string;
  isUserScore: boolean;
}

interface ToolbarProps {
  currentGame: string;
  onClose: () => void;
}

const TIME_SCORE_GAMES = new Set(["8 Bit Evil Returns"]);

function formatSecondsScore(value: number) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

function formatLeaderboardScore(game: string, value: number) {
  if (TIME_SCORE_GAMES.has(game)) {
    return formatSecondsScore(value);
  }

  return value;
}

const Toolbar: React.FC<ToolbarProps> = ({ currentGame, onClose }) => {
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  const fetchLeaderboardData = async () => {
    try {
      const response = await fetchWithAuth(
        `/games/getLeaderboard?game=${encodeURIComponent(
          currentGame
        )}&metric=score&limit=10`
      );
      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error("Error fetching leaderboard data:", error);
    }
  };

  const { data: leaderboardData, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", currentGame],
    queryFn: fetchLeaderboardData,
    enabled: showLeaderboard,
  });

  const toggleLeaderboard = () => {
    setShowLeaderboard(!showLeaderboard);
  };

  return (
    <>
      <div
        className="z-40 flex h-12 w-full items-center justify-between gap-3 border border-red-900/70 bg-black/90 px-3 text-red-100 shadow-lg"
      >
        <button
          type="button"
          onClick={toggleLeaderboard}
          className="flex h-9 items-center gap-2 rounded border border-red-700/70 bg-red-950/70 px-3 text-sm font-semibold text-red-50 transition hover:border-red-300 hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-300"
        >
          <FaTrophy aria-hidden="true" />
          Leaderboard
        </button>
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
      {isLoading && <LoadingSpinner />}
      {showLeaderboard && !isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
          <div className="bg-gray-800 rounded-lg p-4 w-full max-w-md max-h-[70vh] flex flex-col">
            <h2 className="text-2xl font-bold text-white mb-4">
              Leaderboard: {currentGame}
            </h2>
            <div className="overflow-y-auto flex-grow">
              <table className="w-full text-white">
                <thead>
                  <tr>
                    <th className="sticky top-0 bg-gray-800 text-center">
                      Rank
                    </th>
                    <th className="sticky top-0 bg-gray-800 text-center">
                      Player
                    </th>
                    <th className="sticky top-0 bg-gray-800 text-center">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardData?.map((entry, index) => (
                    <tr
                      key={index}
                      className={`${
                        entry.isUserScore ? "text-yellow-500" : ""
                      }`}
                    >
                      <td className="py-2 text-center">{index + 1}</td>
                      <td className="py-2 text-center">{entry.username}</td>
                      <td className="py-2 text-center">
                        {formatLeaderboardScore(currentGame, entry.metricValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={toggleLeaderboard}
              className="mt-4 bg-red-500 text-white rounded px-4 py-2 w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Toolbar;
