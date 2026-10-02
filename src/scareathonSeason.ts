import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "./fetchWithAuth";

// The signed-in player's Scareathon season: the calendar days they've marked watched,
// their points, and whether they can award points. Shared by the classic pages and the station.

export type ScareathonMe = {
  season: number;
  watchedDays: number[];
  points: { movies: number; weekly: number; bonus: number; total: number };
  isAdmin: boolean;
};

export type PointCategory = "movies" | "weekly" | "bonus";

export type PointEntry = {
  id: number;
  username: string;
  category: PointCategory;
  points: number;
  reason: string;
  automatic: boolean;
  awardedBy: string | null;
  createdAt: string;
};

async function readData<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || fallback);
  return payload.data as T;
}

const ME_KEY = ["scareathon", "me"];

export function useScareathonMe(enabled: boolean) {
  return useQuery<ScareathonMe>({
    queryKey: ME_KEY,
    queryFn: () => fetchWithAuth("/scareathon/me").then((r) => readData<ScareathonMe>(r, "Could not load your season")),
    enabled,
    retry: false,
    staleTime: 1000 * 60,
  });
}

// Mark or unmark a calendar day; the tick shows at once, the Scareboard catches up after
export function useToggleWatched() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ day, watched }: { day: number; watched: boolean }) =>
      fetchWithAuth(`/scareathon/watches/${day}`, { method: watched ? "PUT" : "DELETE" }).then((r) =>
        readData<Omit<ScareathonMe, "isAdmin">>(r, "Could not save that")
      ),
    onMutate: async ({ day, watched }) => {
      await queryClient.cancelQueries({ queryKey: ME_KEY });
      const previous = queryClient.getQueryData<ScareathonMe>(ME_KEY);
      if (previous) {
        const days = new Set(previous.watchedDays);
        if (watched) days.add(day);
        else days.delete(day);
        queryClient.setQueryData<ScareathonMe>(ME_KEY, { ...previous, watchedDays: [...days].sort((a, b) => a - b) });
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(ME_KEY, context.previous);
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ScareathonMe>(ME_KEY, (old) => (old ? { ...old, ...data } : old));
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

export function usePointLedger(enabled: boolean) {
  return useQuery<PointEntry[]>({
    queryKey: ["scareathon", "admin", "points"],
    queryFn: () => fetchWithAuth("/scareathon/admin/points").then((r) => readData<PointEntry[]>(r, "Could not load the ledger")),
    enabled,
  });
}

function useAdminWrite<V>(request: (vars: V) => Promise<Response>, fallback: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => request(vars).then((r) => readData<unknown>(r, fallback)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scareathon"] });
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}

export function useAwardPoints() {
  return useAdminWrite(
    (award: { username: string; category: PointCategory; points: number; reason: string }) =>
      fetchWithAuth("/scareathon/admin/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(award),
      }),
    "Could not award those points"
  );
}

export function useRemovePoints() {
  return useAdminWrite((id: number) => fetchWithAuth(`/scareathon/admin/points/${id}`, { method: "DELETE" }), "Could not remove that");
}

export function useRefreshCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchWithAuth("/scareathon/admin/refresh-calendar", { method: "POST" }).then((r) => readData<unknown>(r, "Could not refresh the calendar")),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

export function useImportHistory() {
  return useAdminWrite(() => fetchWithAuth("/scareathon/admin/import-history", { method: "POST" }), "Could not import the history");
}
