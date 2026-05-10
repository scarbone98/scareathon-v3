import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  FaCoins,
  FaGamepad,
  FaListOl,
  FaNewspaper,
  FaTrophy,
  FaUserAlt,
} from "react-icons/fa";
import AnimatedPage from "../../components/AnimatedPage";
import { SiteContainer } from "../../components/PageContainer";
import { fetchWithAuth } from "../../fetchWithAuth";

type LeaderboardUser = {
  name: string;
  total?: string | number;
};

type HomeSummary = {
  data?: {
    leaderboard?: {
      leader?: LeaderboardUser | null;
      meta?: {
        year?: number;
        isLive?: boolean;
      } | null;
    } | null;
    latestPost?: Post | null;
    wallet?: {
      coinBalance: number;
    } | null;
    inbox?: {
      unreadCount: number;
    } | null;
  };
};

type LeaderboardResponse = {
  data?: LeaderboardUser[];
  leader?: LeaderboardUser | null;
  meta?: {
    year?: number;
    isLive?: boolean;
  } | null;
};

type Post = {
  id?: string | number;
  documentId?: string;
  Title?: string;
  title?: string;
  publishedAt?: string;
  createdAt?: string;
};

type WalletData = {
  data?: {
    coinBalance: number;
  };
};

type InboxSummary = {
  data?: Array<{
    unreadCount?: number;
  }>;
};

async function readJsonIfOk<T>(response: Response): Promise<T | null> {
  if (!response.ok) return Promise.resolve(null);
  return response.json() as Promise<T>;
}

async function fetchHomeSummary(): Promise<HomeSummary | null> {
  const summaryResponse = await fetchWithAuth("/home/summary");
  if (summaryResponse.ok) {
    return summaryResponse.json() as Promise<HomeSummary>;
  }

  const [leaderboard, posts, wallet, inbox] = await Promise.all([
    fetchWithAuth("/leaderboard").then((response) =>
      readJsonIfOk<LeaderboardResponse>(response)
    ),
    fetchWithAuth("/posts").then((response) =>
      readJsonIfOk<{ data?: Post[] }>(response)
    ),
    fetchWithAuth("/user/wallet?limit=1").then((response) =>
      readJsonIfOk<WalletData>(response)
    ),
    fetchWithAuth("/inbox/conversations?limit=25").then((response) =>
      readJsonIfOk<InboxSummary>(response)
    ),
  ]);

  return {
    data: {
      leaderboard: {
        leader: leaderboard?.data?.[0] || leaderboard?.leader || null,
        meta: leaderboard?.meta || null,
      },
      latestPost: posts?.data?.[0] || null,
      wallet: wallet?.data
        ? {
            coinBalance: wallet.data.coinBalance,
          }
        : null,
      inbox: {
        unreadCount:
          inbox?.data?.reduce(
            (total, conversation) => total + (conversation.unreadCount || 0),
            0
          ) || 0,
      },
    },
  };
}

export default function Home() {
  const { data: summary } = useQuery<HomeSummary | null>({
    queryKey: ["home", "summary"],
    queryFn: fetchHomeSummary,
    staleTime: 1000 * 30,
  });

  const leaderboard: LeaderboardResponse | null =
    summary?.data?.leaderboard || null;
  const leader = leaderboard?.leader;
  const latestPost = summary?.data?.latestPost;
  const latestPostTitle =
    latestPost?.Title || latestPost?.title || "Latest announcements";
  const latestPostDate = latestPost?.publishedAt || latestPost?.createdAt;
  const unreadCount = summary?.data?.inbox?.unreadCount || 0;

  return (
    <AnimatedPage className="flex flex-col items-center justify-start bg-cover bg-center home-background py-4 md:py-6">
      <div className="home-gradient" />
      <SiteContainer
        as="main"
        className="relative z-10 flex flex-1 flex-col gap-6"
      >
        <section className="max-w-3xl">
          <h1 className="text-4xl font-bold text-orange-100 md:text-6xl">
            Arcade, avatars, standings, and news.
          </h1>
        </section>

        <section className="grid flex-1 gap-5 md:grid-cols-2 md:grid-rows-2">
          <Link
            to="/arcade"
            className="flex min-h-64 flex-col justify-between rounded-lg border border-red-950/70 bg-gray-950/75 p-6 transition hover:border-red-600 hover:bg-red-950/50 md:p-8 lg:min-h-72 lg:p-10"
          >
            <div className="grid gap-4 md:gap-6">
              <div className="flex items-center gap-3 text-4xl text-red-500 md:gap-5 md:text-5xl">
                <FaGamepad />
                <h2 className="text-3xl font-bold text-orange-100 md:text-4xl">
                  Arcade
                </h2>
              </div>
              <p className="max-w-xl text-lg text-orange-100/75 md:text-xl">
                Five cabinets are open year-round.
              </p>
              <p className="text-base text-orange-100/60 md:text-lg">
                Chase scores, earn coins, and warm up between movie nights.
              </p>
            </div>
            <span className="text-sm uppercase tracking-widest text-red-300 md:text-base">
              Play now
            </span>
          </Link>

          <Link
            to="/scareathon/scareboard"
            className="flex min-h-64 flex-col justify-between rounded-lg border border-red-950/70 bg-gray-950/75 p-6 transition hover:border-red-600 hover:bg-red-950/50 md:p-8 lg:min-h-72 lg:p-10"
          >
            <div className="grid gap-4 md:gap-6">
              <div className="flex items-center gap-3 text-3xl text-red-500 md:gap-5 md:text-5xl">
                <FaListOl />
                <h2 className="text-2xl font-bold text-orange-100 md:text-4xl">
                  Scareboard
                </h2>
              </div>
              <p className="text-base text-orange-100/75 md:text-xl">
                {leaderboard?.meta?.year
                  ? `${leaderboard.meta.year} ${leaderboard.meta.isLive ? "live" : "historical"} standings`
                  : "Latest standings"}
              </p>
              <p className="text-base text-orange-100/60 md:text-lg">
                Track the top totals and see who is setting the pace.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-3 text-lg text-amber-200 md:text-xl">
              <FaTrophy />
              <span>{leader ? `${leader.name} - ${leader.total}` : "Loading"}</span>
            </div>
          </Link>

          <Link
            to="/announcements"
            className="flex min-h-64 flex-col justify-between rounded-lg border border-orange-800/70 bg-gray-950/75 p-6 transition hover:border-orange-500 hover:bg-orange-950/40 md:p-8 lg:min-h-72 lg:p-10"
          >
            <div className="grid gap-4 md:gap-6">
              <div className="flex items-center gap-3 text-3xl text-orange-500 md:gap-5 md:text-5xl">
                <FaNewspaper />
                <h2 className="text-2xl font-bold text-orange-100 md:text-4xl">
                  News
                </h2>
              </div>
              <p className="text-base text-orange-100/75 md:text-xl">
                {latestPostTitle}
              </p>
              <p className="text-base text-orange-100/60 md:text-lg">
                New posts, event updates, and house announcements.
              </p>
            </div>
            <span className="text-sm uppercase tracking-widest text-orange-300 md:text-base">
              {latestPostDate
                ? new Date(latestPostDate).toLocaleDateString()
                : "Read posts"}
            </span>
          </Link>

          <Link
            to="/profile"
            className="flex min-h-64 flex-col justify-between rounded-lg border border-purple-900/70 bg-gray-950/75 p-6 transition hover:border-purple-500 hover:bg-purple-950/40 md:p-8 lg:min-h-72 lg:p-10"
          >
            <div className="grid gap-4 md:gap-6">
              <div className="flex items-center gap-3 text-3xl text-purple-400 md:gap-5 md:text-5xl">
                <FaUserAlt />
                <h2 className="text-2xl font-bold text-orange-100 md:text-4xl">
                  Profile
                </h2>
              </div>
              <p className="text-base text-orange-100/75 md:text-xl">
                Customize your avatar and manage your inbox.
              </p>
              <div className="flex flex-wrap gap-3 text-base text-orange-100/75 md:text-lg">
                <span className="inline-flex items-center gap-2 rounded border border-amber-300/30 bg-amber-950/20 px-3 py-2">
                  <FaCoins className="text-amber-300" />
                  {summary?.data?.wallet?.coinBalance?.toLocaleString() ?? "..."}
                </span>
                <span className="inline-flex items-center rounded border border-purple-300/30 bg-purple-950/20 px-3 py-2">
                  Inbox {unreadCount > 0 ? `+${unreadCount}` : "clear"}
                </span>
              </div>
            </div>
            <span className="text-sm uppercase tracking-widest text-purple-300 md:text-base">
              Avatar, shop, inbox
            </span>
          </Link>
        </section>
      </SiteContainer>
    </AnimatedPage>
  );
}
