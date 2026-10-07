import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { fetchWithAuth } from "../fetchWithAuth";
import { supabase } from "../supabaseClient";
import type { AvatarLook } from "../components/avatar/types";

// The station's data. Same endpoints, and the same query keys and cached shapes, as the
// classic pages, so both share one cache and nothing is fetched twice.

export type ContentLoopItem = {
  type: "announcement" | "weekly_challenge" | "daily_challenge";
  id: string;
  documentId: string;
  title: string;
  summary?: string | null;
  publishedAt?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  points?: number;
  rewardCoins?: number;
  verificationType?: string | null;
  gameName?: string | null;
  metricName?: string | null;
  targetMetricValue?: number | null;
  comparisonOperator?: string | null;
  href: string;
  ctaLabel: string;
  image?: { url?: string; alternativeText?: string | null } | null;
};

export type Post = {
  id: number;
  documentId: string;
  Title: string;
  Content?: unknown;
  publishedAt: string;
  Image?: { url: string; alternativeText?: string | null }[] | null;
};

export type LeaderboardUser = {
  name: string;
  rank: number;
  userId?: string; // account seasons only: whose avatar to show
  total?: string | number;
  [key: string]: string | number | undefined;
};

export type ScareboardData = {
  leaderboard: {
    data: LeaderboardUser[];
    meta?: { year?: number; isLive?: boolean; isPreseason?: boolean; availableYears?: number[] };
  };
  pastWinners: { data: { year: string; name: string }[] };
};

export type CalendarDay = { title: string; lowResUrl?: string; theme?: string };

export type Movie = {
  title: string;
  lowResUrl?: string;
  runtime: number | null;
  year: number | null;
  rating: number | null;
  genres?: { id: number; name: string }[];
  watchProviders: {
    link?: string;
    flatrate?: { logo_path: string; provider_name: string; provider_id: number }[];
    rent?: { logo_path: string; provider_name: string; provider_id: number }[];
    buy?: { logo_path: string; provider_name: string; provider_id: number }[];
  } | null;
};

export type Summary = {
  isAuthenticated: boolean;
  username?: string | null;
  coinBalance?: number | null;
  unreadCount?: number;
};

// A failed request carries its status, so panels can tell "sign in first" from "broken"
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readJson<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  let payload: { error?: string } | null = null;
  try {
    payload = text.trim() ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) throw new ApiError(payload?.error || `${label} request failed`, response.status);
  if (!payload) throw new ApiError(`${label} returned an empty response`, response.status);
  return payload as T;
}

export const needsSignIn = (error: unknown) => error instanceof ApiError && error.status === 401;

// The Scareathon runs through October, by the viewer's own clock: tonight's film is tonight's
// wherever they are, until their own midnight. (Watches are on the honor system, any day.)
export const EVENT_MONTH = 9;
export function eventState(now = new Date()) {
  const year = now.getFullYear();
  const isLive = now.getMonth() === EVENT_MONTH;
  const nextStart = now > new Date(year, EVENT_MONTH + 1, 0, 23, 59, 59) ? new Date(year + 1, EVENT_MONTH, 1) : new Date(year, EVENT_MONTH, 1);
  const daysUntil = Math.max(0, Math.ceil((nextStart.getTime() - now.getTime()) / 86_400_000));
  return { isLive, daysUntil, year: nextStart.getFullYear(), day: now.getDate(), calendarYear: year };
}

// The signed-in session, kept current; every query is refetched when it changes
export function useSession() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => active && setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void queryClient.invalidateQueries();
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);
  return session;
}

export function useContentLoop() {
  return useQuery<{ data?: ContentLoopItem[] }, Error, ContentLoopItem[]>({
    queryKey: ["content-loop"],
    queryFn: () => fetchWithAuth("/content-loop").then((r) => readJson<{ data?: ContentLoopItem[] }>(r, "News")),
    select: (payload) => payload?.data ?? [],
    staleTime: 1000 * 60 * 5,
  });
}

export function useRewardStatus(item: ContentLoopItem | undefined, signedIn: boolean) {
  return useQuery<{ data?: { alreadyClaimed: boolean; coinBalance: number | null } } | null>({
    queryKey: ["weekly-challenge", item?.documentId, "reward-status"],
    queryFn: () =>
      fetchWithAuth(`/weekly-challenges/${encodeURIComponent(item?.documentId || "")}/reward-status`).then((r) =>
        r.status === 401 ? null : readJson(r, "Reward status")
      ),
    enabled: Boolean(signedIn && (item?.type === "weekly_challenge" || item?.type === "daily_challenge") && item.rewardCoins),
    retry: false,
    staleTime: 1000 * 60,
  });
}

export function usePosts(enabled: boolean) {
  return useQuery<{ data?: Post[] }>({
    queryKey: ["posts"],
    queryFn: () => fetchWithAuth("/posts").then((r) => readJson(r, "Posts")),
    enabled,
    retry: (count, error) => !needsSignIn(error) && count < 2,
    staleTime: 1000 * 60 * 60,
  });
}

// When the newest item came into the shop (ms; 0 if unknown), for the dot on the way in. The
// shop's own "just in" shelf asks the same thing, under the same key.
export function useNewestShopItem(enabled: boolean) {
  const { data } = useQuery<{ data?: { createdAt?: string | null }[] }>({
    queryKey: ["marketplace", "shop", "new"],
    queryFn: () => fetchWithAuth("/marketplace/shop/new").then((r) => readJson(r, "New items")),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return Math.max(0, ...(data?.data ?? []).map((item) => (item.createdAt ? Date.parse(item.createdAt) || 0 : 0)));
}

// Players' looks (what they wear and their colouring), to draw them moving
// (and the scoreboard banner each has up)
export type PlayerLook = AvatarLook & { banner?: string };

export function useLooks(userIds: string[]) {
  const ids = [...new Set(userIds)].sort().join(",");
  return useQuery<Record<string, PlayerLook>>({
    queryKey: ["looks", ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchWithAuth(`/user/looks?ids=${ids}`).then((r) => readJson<{ data: Record<string, PlayerLook> }>(r, "Looks")).then((body) => body.data ?? {}),
  });
}

export function useScareboard(year: number | null, enabled: boolean) {
  return useQuery<ScareboardData>({
    queryKey: ["leaderboard", "by-year", year],
    queryFn: async () => {
      const [leaderboard, pastWinners] = await Promise.all([
        fetchWithAuth(year ? `/leaderboard?year=${year}` : "/leaderboard", { cache: "no-store" }).then((r) =>
          readJson<ScareboardData["leaderboard"]>(r, "Scareboard")
        ),
        fetchWithAuth("/past-winners", { cache: "no-store" }).then((r) => readJson<ScareboardData["pastWinners"]>(r, "Past winners")),
      ]);
      return { leaderboard, pastWinners };
    },
    enabled,
    retry: (count, error) => !needsSignIn(error) && count < 2,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCalendar(enabled: boolean) {
  const { calendarYear } = eventState();
  return useQuery<{ data: CalendarDay[] }>({
    queryKey: ["calendar", calendarYear],
    queryFn: () => fetchWithAuth("/calendar", { headers: { "Content-Type": "application/json" } }).then((r) => readJson(r, "Calendar")),
    enabled,
    retry: (count, error) => !needsSignIn(error) && count < 2,
    staleTime: 1000 * 60 * 60,
  });
}

export function useTodayMovie(enabled: boolean) {
  const { calendarYear, day } = eventState();
  return useQuery<{ data?: Movie }>({
    queryKey: ["calendar", calendarYear, "day", day],
    queryFn: () => fetchWithAuth(`/calendar/${day}`, { headers: { "Content-Type": "application/json" } }).then((r) => readJson(r, "Today's movie")),
    enabled,
    retry: (count, error) => !needsSignIn(error) && count < 2,
    staleTime: 1000 * 60 * 30,
  });
}

// The day's code for the rune tablet (anyone can see it; it changes at midnight Eastern)
export function useDailyRune() {
  return useQuery<{ data?: { code?: string } }, Error, string | null>({
    queryKey: ["wayside", "rune"],
    queryFn: () => fetchWithAuth("/wayside/rune").then((r) => readJson<{ data?: { code?: string } }>(r, "Rune")),
    select: (payload) => payload?.data?.code ?? null,
    staleTime: 1000 * 60 * 10,
    refetchInterval: 1000 * 60 * 30,
  });
}

// Coins, unread mail and a name for the greeting (the classic home page's summary)
export function useSummary() {
  return useQuery<Summary>({
    queryKey: ["home-v2", "summary"],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return { isAuthenticated: false };
      const [summary, user] = await Promise.all([
        // (never the browser's kept copy: the ticket count has to be the one right now)
        fetchWithAuth("/home/summary", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
        fetchWithAuth("/user").then((r) => (r.ok ? r.json() : null)),
      ]);
      return {
        isAuthenticated: true,
        username: user?.data?.username || user?.data?.email?.split("@")[0] || null,
        coinBalance: summary?.data?.wallet?.coinBalance ?? null,
        unreadCount: summary?.data?.inbox?.unreadCount ?? 0,
      };
    },
    staleTime: 1000 * 30,
  });
}

export function strapiUrl(url?: string | null) {
  if (!url) return null;
  return url.startsWith("http") ? url : `${import.meta.env.VITE_STRAPI_BASE_URL}${url}`;
}

export function formatShortDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
}

export function challengeTarget(item: ContentLoopItem) {
  if ((item.type !== "weekly_challenge" && item.type !== "daily_challenge") || !item.gameName) return null;
  const game = item.gameName.replace(/[‘’]/g, "'");
  if (item.verificationType === "arcade_runs" && item.targetMetricValue) {
    return `Finish ${item.targetMetricValue} runs of ${game} while signed in.`;
  }
  if ((item.verificationType !== "arcade_score" && item.verificationType !== "game_score") || item.targetMetricValue == null) return null;
  const verb = (item.metricName || "score") === "score" ? "Score" : `Get ${item.metricName}`;
  const target = item.targetMetricValue.toLocaleString();
  const phrase: Record<string, string> = {
    ">=": `at least ${target}`,
    ">": `more than ${target}`,
    "<=": `${target} or less`,
    "<": `under ${target}`,
  };
  return `${verb} ${phrase[item.comparisonOperator || ">="] ?? `exactly ${target}`} in ${game}.`;
}
