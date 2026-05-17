import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FaArrowRight, FaChevronLeft, FaChevronRight, FaCoins } from "react-icons/fa";
import { fetchWithAuth } from "../fetchWithAuth";
import { supabase } from "../supabaseClient";

type ContentLoopItem = {
  type: "announcement" | "weekly_challenge";
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
  image?: {
    url?: string;
    alternativeText?: string | null;
  } | null;
};

type ContentLoopResponse = {
  data?: ContentLoopItem[];
};

type ClaimResponse = {
  data?: {
    claimed: boolean;
    alreadyClaimed: boolean;
    coinBalance: number;
    rewardCoins: number;
  };
  error?: string;
};

type RewardStatusResponse = {
  data?: {
    alreadyClaimed: boolean;
    coinBalance: number | null;
  };
};

function resolveImageUrl(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${import.meta.env.VITE_STRAPI_BASE_URL}${url}`;
}

function formatDateRange(item: ContentLoopItem) {
  if (item.type !== "weekly_challenge" || !item.startsAt || !item.endsAt) {
    return item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : "Latest";
  }

  const start = new Date(item.startsAt);
  const end = new Date(item.endsAt);
  return `${start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} - ${end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function formatChallengeTarget(item: ContentLoopItem) {
  if (
    item.type !== "weekly_challenge" ||
    (item.verificationType !== "arcade_score" &&
      item.verificationType !== "game_score") ||
    !item.gameName ||
    item.targetMetricValue === null ||
    item.targetMetricValue === undefined
  ) {
    return null;
  }

  const metricName = item.metricName || "score";
  const target = item.targetMetricValue.toLocaleString();
  const operator = item.comparisonOperator || ">=";

  if (operator === ">=") {
    return `${metricName === "score" ? "Score" : `Get ${metricName}`} at least ${target} in ${item.gameName}.`;
  }

  if (operator === ">") {
    return `${metricName === "score" ? "Score" : `Get ${metricName}`} more than ${target} in ${item.gameName}.`;
  }

  if (operator === "<=") {
    return `${metricName === "score" ? "Score" : `Get ${metricName}`} ${target} or less in ${item.gameName}.`;
  }

  if (operator === "<") {
    return `${metricName === "score" ? "Score" : `Get ${metricName}`} under ${target} in ${item.gameName}.`;
  }

  return `${metricName === "score" ? "Score" : `Get ${metricName}`} exactly ${target} in ${item.gameName}.`;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data as T;
}

async function readRewardStatus(response: Response) {
  if (response.status === 401) return null;
  return readJson<RewardStatusResponse>(response);
}

export default function ContentLoop({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const [activeIndex, setActiveIndex] = useState(0);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [rotationTick, setRotationTick] = useState(0);

  const { data: isAuthenticated = false } = useQuery({
    queryKey: ["auth", "has-session"],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return Boolean(session);
    },
    staleTime: 1000 * 30,
  });

  const { data } = useQuery<ContentLoopResponse>({
    queryKey: ["content-loop"],
    queryFn: () => fetchWithAuth("/content-loop").then(readJson<ContentLoopResponse>),
    staleTime: 1000 * 60 * 5,
  });

  const items = useMemo(() => data?.data || [], [data]);
  const activeItem = items[activeIndex] || items[0] || null;
  const imageUrl = resolveImageUrl(activeItem?.image?.url);
  const shouldCheckRewardStatus =
    activeItem?.type === "weekly_challenge" && Boolean(activeItem.rewardCoins);

  const { data: rewardStatus } = useQuery<RewardStatusResponse | null>({
    queryKey: ["weekly-challenge", activeItem?.documentId, "reward-status"],
    queryFn: () =>
      fetchWithAuth(
        `/weekly-challenges/${encodeURIComponent(
          activeItem?.documentId || ""
        )}/reward-status`
      ).then(readRewardStatus),
    enabled: shouldCheckRewardStatus,
    retry: false,
    staleTime: 1000 * 60,
  });

  useEffect(() => {
    if (items.length < 2) return;

    const timeout = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % items.length);
      setClaimMessage(null);
    }, 7000);

    return () => window.clearTimeout(timeout);
  }, [items.length, activeIndex, rotationTick]);

  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, items.length]);

  const claimMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await fetchWithAuth(
        `/weekly-challenges/${encodeURIComponent(documentId)}/claim-reward`,
        { method: "POST" }
      );
      return readJson<ClaimResponse>(response);
    },
    onSuccess: (payload) => {
      const rewardCoins = payload.data?.rewardCoins || 0;
      queryClient.setQueryData<RewardStatusResponse>(
        ["weekly-challenge", activeItem?.documentId, "reward-status"],
        {
          data: {
            alreadyClaimed: true,
            coinBalance: payload.data?.coinBalance ?? null,
          },
        }
      );
      setClaimMessage(
        payload.data?.alreadyClaimed
          ? "Reward already claimed"
          : `${rewardCoins.toLocaleString()} coins added`
      );
      queryClient.invalidateQueries({ queryKey: ["home", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["user", "wallet"] });
    },
    onError: (error) => {
      setClaimMessage(
        (error as Error).message === "Unauthorized"
          ? "Sign in to claim this reward"
          : (error as Error).message
      );
    },
  });

  if (!activeItem) return null;

  const isChallenge = activeItem.type === "weekly_challenge";
  const isActiveChallenge = !isChallenge || activeItem.isActive !== false;
  const rewardCoins = activeItem.rewardCoins || 0;
  const rewardAlreadyClaimed = Boolean(rewardStatus?.data?.alreadyClaimed);
  const challengeTarget = formatChallengeTarget(activeItem);

  return (
    <section
      className={`overflow-hidden rounded-lg border border-orange-800/70 bg-gray-950/85 shadow-2xl ${
        compact ? "min-h-[29rem] md:min-h-[28.75rem]" : "min-h-[21rem]"
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeItem.id}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className={`grid h-full ${
            compact
              ? "min-h-[29rem] md:min-h-[28.75rem] md:grid-cols-[1fr]"
              : "min-h-[21rem] md:grid-cols-[minmax(0,0.9fr),minmax(0,1.1fr)]"
          }`}
        >
        {!compact && imageUrl ? (
          <div className="relative min-h-56 overflow-hidden bg-black md:min-h-[21rem]">
            <img
              src={imageUrl}
              alt={activeItem.image?.alternativeText || ""}
              className="absolute inset-0 h-full w-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-gray-950" />
          </div>
        ) : null}

        <div
          className={`flex min-h-0 flex-col p-5 md:p-6 ${
            compact ? "h-[29rem] md:h-[28.75rem]" : "h-[21rem]"
          }`}
        >
          <div className="mb-4 flex min-h-7 items-center justify-between gap-3">
            <span className="inline-flex max-w-[60%] truncate rounded border border-orange-500/30 bg-orange-950/40 px-3 py-1 text-xs uppercase tracking-widest text-orange-200">
              {isChallenge ? "Weekly Challenge" : "Announcement"}
            </span>
            <span className="truncate text-right text-xs uppercase tracking-widest text-orange-100/45">
              {formatDateRange(activeItem)}
            </span>
          </div>

          <h2 className="line-clamp-2 min-h-[4rem] text-2xl font-bold text-orange-100 md:text-3xl md:leading-tight">
            {activeItem.title}
          </h2>
          {activeItem.summary ? (
            <p className="mt-3 line-clamp-3 min-h-[5.25rem] text-base leading-7 text-orange-100/68">
              {activeItem.summary}
            </p>
          ) : (
            <div className="mt-3 min-h-[5.25rem]" />
          )}

          {isChallenge ? (
            <div className="mt-5 flex min-h-[4.75rem] flex-wrap content-start items-start gap-3 overflow-hidden text-sm">
              <span className="rounded border border-red-500/30 bg-red-950/40 px-3 py-2 uppercase tracking-widest text-red-100">
                {activeItem.points || 1} point
              </span>
              {rewardCoins > 0 ? (
                <span className="inline-flex items-center gap-2 rounded border border-amber-300/30 bg-amber-950/30 px-3 py-2 text-amber-200">
                  <FaCoins className="text-amber-300" />
                  {rewardCoins.toLocaleString()} coins
                </span>
              ) : null}
              {challengeTarget ? (
                <span className="max-w-full truncate rounded border border-orange-500/25 bg-black/30 px-3 py-2 text-orange-100/75">
                  {challengeTarget}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 min-h-[4.75rem]" />
          )}

          <div className="mt-auto flex min-h-[4.5rem] flex-col gap-3 pt-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex h-12 items-center gap-2">
              {items.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous update"
                    onClick={() => {
                      setActiveIndex((current) => (current - 1 + items.length) % items.length);
                      setClaimMessage(null);
                      setRotationTick((current) => current + 1);
                    }}
                    className="rounded border border-orange-500/30 p-3 text-orange-200 transition hover:bg-orange-950/50"
                  >
                    <FaChevronLeft />
                  </button>
                  <button
                    type="button"
                    aria-label="Next update"
                    onClick={() => {
                      setActiveIndex((current) => (current + 1) % items.length);
                      setClaimMessage(null);
                      setRotationTick((current) => current + 1);
                    }}
                    className="rounded border border-orange-500/30 p-3 text-orange-200 transition hover:bg-orange-950/50"
                  >
                    <FaChevronRight />
                  </button>
                </>
              ) : null}
            </div>

            <div className="flex min-h-12 flex-wrap items-center justify-end gap-3">
              {claimMessage ? (
                <span className="max-w-full truncate text-sm text-amber-200">
                  {claimMessage}
                </span>
              ) : null}
              {isChallenge &&
              isActiveChallenge &&
              rewardCoins > 0 &&
              !rewardAlreadyClaimed &&
              isAuthenticated ? (
                <button
                  type="button"
                  disabled={claimMutation.isPending}
                  onClick={() => claimMutation.mutate(activeItem.documentId)}
                  className="inline-flex items-center justify-center gap-2 rounded bg-amber-600 px-4 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:bg-amber-500 disabled:cursor-wait disabled:opacity-60"
                >
                  <FaCoins />
                  {claimMutation.isPending ? "Claiming" : "Claim Coins"}
                </button>
              ) : null}
              {isChallenge &&
              isActiveChallenge &&
              rewardCoins > 0 &&
              !rewardAlreadyClaimed &&
              !isAuthenticated ? (
                <Link
                  to="/authentication"
                  className="inline-flex items-center justify-center gap-2 rounded bg-amber-600 px-4 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:bg-amber-500"
                >
                  <FaCoins />
                  Sign In to Claim
                </Link>
              ) : null}
              <Link
                to={activeItem.href}
                className="inline-flex items-center justify-center gap-2 rounded border border-orange-500/30 px-4 py-3 text-sm uppercase tracking-widest text-orange-200 transition hover:bg-orange-950/50"
              >
                {isChallenge ? "Open Event" : activeItem.ctaLabel}
                <FaArrowRight />
              </Link>
            </div>
          </div>
        </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
