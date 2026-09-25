import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import LoadingSpinner from "../../components/LoadingSpinner";

interface LeaderboardEntry {
  username: string;
  metricValue: number;
  achieved_at: string;
  isUserScore: boolean;
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

// Top 10 scores for one game, in a modal. Mount it to show it.
export default function LeaderboardDialog({ game, onClose }: { game: string; onClose: () => void }) {
  const { data: leaderboardData, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", game],
    queryFn: async () => {
      try {
        const response = await fetchWithAuth(
          `/games/getLeaderboard?game=${encodeURIComponent(game)}&metric=score&limit=10`
        );
        const data = await response.json();
        return data.data || [];
      } catch (error) {
        console.error("Error fetching leaderboard data:", error);
        return [];
      }
    },
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
      <div className="bg-gray-800 rounded-lg p-4 w-full max-w-md max-h-[70vh] flex flex-col">
        <h2 className="text-2xl font-bold text-white mb-4">
          Leaderboard: {game}
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
                    {formatLeaderboardScore(game, entry.metricValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={onClose}
          className="mt-4 bg-red-500 text-white rounded px-4 py-2 w-full"
        >
          Close
        </button>
      </div>
    </div>
  );
}
