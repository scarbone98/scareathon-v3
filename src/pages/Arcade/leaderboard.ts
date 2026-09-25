import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";

// Leaderboard data shared by the leaderboard dialog and the /arcade-v2 info card.

export interface LeaderboardEntry {
  username: string;
  metricValue: number;
  achieved_at: string;
  isUserScore: boolean;
}

const TIME_SCORE_GAMES = new Set(["8 Bit Evil Returns"]);

// Community games say in their manifest whether their score is a time
export function markTimeScoreGame(game: string) {
  TIME_SCORE_GAMES.add(game);
}

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

export function formatLeaderboardScore(game: string, value: number) {
  if (TIME_SCORE_GAMES.has(game)) {
    return formatSecondsScore(value);
  }

  return Number(value).toLocaleString();
}

// Top 10 scores for one game. The dialog and the /arcade-v2 info card share
// the query, so opening one after the other doesn't refetch.
export function useLeaderboard(game: string | undefined, enabled = true) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", game],
    enabled: Boolean(game) && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetchWithAuth(
        `/games/getLeaderboard?game=${encodeURIComponent(game ?? "")}&metric=score&limit=10`
      );
      if (!response.ok) throw new Error(`Leaderboard request failed (${response.status})`);
      const data = await response.json();
      return data.data || [];
    },
  });
}
