import React, { useState } from "react";
import { useNavigatorContext } from "../../components/navigator/context";
import { fetchWithAuth } from "../../fetchWithAuth";
import { useQuery } from "@tanstack/react-query";
import LoadingSpinner from "../../components/LoadingSpinner";

interface LeaderboardEntry {
  username: string;
  metric_value: number;
  achieved_at: string;
}

interface ToolbarProps {
  currentGame: string;
}

const Toolbar: React.FC<ToolbarProps> = ({ currentGame }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const { height: headerHeight } = useNavigatorContext();

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
    setIsOpen(false);
  };

  return (
    <>
      <div
        className={`
          absolute bg-red-500 bg-opacity-70 rounded-lg flex items-center
          transition-all duration-300 ease-in-out select-none z-40
          h-10 overflow-hidden
        `}
        style={{ top: `${8 + headerHeight / 2}px`, left: "-8px" }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="bg-transparent border-none text-white text-base cursor-pointer p-2 rounded hover:bg-white hover:bg-opacity-10 h-full"
        >
          {isOpen ? "◀" : "▶"}
        </button>
        <div
          className={`
            flex items-center transition-all duration-300 ease-in-out h-full
            ${isOpen ? "w-fit opacity-100 ml-1" : "w-0 opacity-0"}
          `}
        >
          <button
            onClick={toggleLeaderboard}
            className="bg-transparent border-none text-white text-base cursor-pointer p-2 rounded hover:bg-white hover:bg-opacity-10 whitespace-nowrap"
          >
            Leaderboard
          </button>
        </div>
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
                    <th className="text-left sticky top-0 bg-gray-800">Rank</th>
                    <th className="text-left sticky top-0 bg-gray-800">
                      Player
                    </th>
                    <th className="text-right sticky top-0 bg-gray-800">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardData?.map((entry, index) => (
                    <tr key={index} className="border-t border-gray-700">
                      <td className="py-2">{index + 1}</td>
                      <td className="py-2">{entry.username}</td>
                      <td className="py-2 text-right pr-4">
                        {entry.metric_value}
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
