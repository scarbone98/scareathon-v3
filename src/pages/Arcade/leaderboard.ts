import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";

// Leaderboard data shared by the leaderboard dialog and the /arcade-v2 info card.

export interface LeaderboardEntry {
  username: string;
  metricValue: number;
  achieved_at: string;
  isUserScore: boolean;
  // Whose score it is (for their banner and avatar on the station's scoreboard)
  userId?: string;
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

export function formatLeaderboardScore(game: string, value: number) {
  if (TIME_SCORE_GAMES.has(game)) {
    return formatSecondsScore(value);
  }

  return Number(value).toLocaleString();
}

// The same score in five characters or fewer, for narrow columns (the station's scoreboard
// on phones): 950 / 9.8K / 96.3K / 101K / 2.5M, and times as 4:05 / 59:59 / 1H23M / 12.5H
export function formatCompactLeaderboardScore(game: string, value: number) {
  const n = Math.max(0, Number(value) || 0);
  if (TIME_SCORE_GAMES.has(game)) {
    const totalSeconds = Math.floor(n);
    if (totalSeconds < 3600) return formatSecondsScore(totalSeconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours < 10) return `${hours}H${String(minutes).padStart(2, "0")}M`;
    // (tenths of an hour, rounded down, until there's no room for them)
    return hours < 100 ? `${Math.floor(totalSeconds / 360) / 10}H` : `${hours}H`;
  }
  for (const [size, suffix] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]] as const) {
    if (n >= size) {
      // One decimal at most (none from 100 up), rounded down so a score never reads higher than it is
      const scaled = n / size;
      const places = scaled >= 100 ? 0 : 1;
      const shown = Math.floor(scaled * 10 ** places) / 10 ** places;
      return `${Number(shown.toFixed(places))}${suffix}`;
    }
  }
  return Math.floor(n).toLocaleString();
}

// One player's best in each game they've a score in, and their place among everyone's bests
export interface PlayerBest {
  game: string;
  metricValue: number;
  place: number;
}

export function usePlayerBests(userId: string | undefined) {
  return useQuery<PlayerBest[]>({
    queryKey: ["leaderboard", "player-bests", userId],
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: async () => {
      const response = await fetchWithAuth(`/games/playerBests?userId=${encodeURIComponent(userId ?? "")}`);
      if (!response.ok) throw new Error(`Scores request failed (${response.status})`);
      const data = await response.json();
      return data.data || [];
    },
  });
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
