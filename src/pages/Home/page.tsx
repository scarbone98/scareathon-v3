import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  FaArrowRight,
  FaCoins,
  FaEnvelope,
  FaGamepad,
  FaListOl,
  FaShoppingBag,
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
  const latestPostDateLabel = latestPostDate
    ? new Date(latestPostDate).toLocaleDateString()
    : "Latest";
  const unreadCount = summary?.data?.inbox?.unreadCount || 0;
  const coinBalance = summary?.data?.wallet?.coinBalance;
  const leaderLabel = leader
    ? `${leader.name} - ${leader.total ?? 0}`
    : "Scores loading";

  const cabinets = [
    "8 Bit Evil Returns",
    "Tlaloc's Curse",
    "Ooidash",
  ];

  const quickActions = [
    {
      label: "Shop",
      to: "/profile/shop",
      icon: <FaShoppingBag />,
    },
    {
      label: "Avatar",
      to: "/profile/avatar",
      icon: <FaUserAlt />,
    },
    {
      label: "Inbox",
      to: "/profile/inbox",
      icon: <FaEnvelope />,
      badge: unreadCount,
    },
  ];

  return (
    <AnimatedPage className="flex flex-col items-center justify-start bg-cover bg-center home-background py-4 md:py-6">
      <div className="home-gradient" />
      <SiteContainer
        as="main"
        className="relative z-10 flex flex-1 flex-col gap-6 pt-3 md:pt-14"
      >
        <section className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-12">
            <h1 className="max-w-4xl text-4xl font-bold text-orange-100 md:text-6xl">
              Arcade runs, avatar loot, and a Scareboard worth haunting.
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-orange-100/75 md:text-xl">
              Pick a cabinet, earn coins, tune your look, and keep your name in
              the glow.
            </p>
          </div>

          <Link
            to="/arcade"
            className="group relative flex min-h-[24rem] overflow-hidden rounded-lg border border-red-950/70 bg-gray-950/80 shadow-2xl transition hover:border-red-500 lg:col-span-8"
          >
            <video
              className="absolute inset-0 h-full w-full object-cover opacity-45 transition duration-700 group-hover:scale-105 group-hover:opacity-60"
              src="/game-recordings/8BitEvilReturnsMenu.mp4"
              autoPlay
              muted
              loop
              playsInline
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-gray-950/70 to-black/20" />
            <div className="relative z-10 flex w-full flex-col justify-end gap-5 p-6 md:p-8">
              <div>
                <span className="inline-flex rounded border border-red-500/40 bg-red-950/70 px-3 py-1 text-xs uppercase tracking-widest text-red-200">
                  Featured Cabinet
                </span>
                <h2 className="mt-3 text-4xl font-bold text-orange-100 md:text-5xl">
                  8 Bit Evil Returns
                </h2>
                <p className="mt-3 max-w-xl text-lg text-orange-100/75">
                  The arcade is open year-round. Chase a clean run, post the
                  score, and turn survival into coins.
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-center gap-3 rounded border border-amber-300/30 bg-black/50 px-4 py-3 text-amber-200">
                  <FaTrophy />
                  <span>{leaderLabel}</span>
                </div>
                <span className="inline-flex items-center justify-center gap-2 rounded bg-red-700 px-5 py-3 text-lg font-bold text-white transition group-hover:bg-red-600">
                  Play Now
                  <FaArrowRight />
                </span>
              </div>
            </div>
          </Link>

          <aside className="flex rounded-lg border border-purple-900/70 bg-gray-950/80 p-5 shadow-2xl lg:col-span-4 md:p-6">
            <div className="flex w-full flex-col justify-between gap-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded border border-purple-400/50 bg-purple-950/40 text-3xl text-purple-200">
                    <FaUserAlt />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-orange-100">
                      Your haunt
                    </h2>
                    <p className="text-sm uppercase tracking-widest text-orange-100/55">
                      Avatar, shop, inbox
                    </p>
                  </div>
                </div>
                <div className="rounded border border-amber-300/30 bg-amber-950/20 px-3 py-2 text-right text-amber-200">
                  <div className="flex items-center justify-end gap-2 text-xl font-bold">
                    <FaCoins className="text-amber-300" />
                    {coinBalance?.toLocaleString() ?? "..."}
                  </div>
                  <p className="text-xs uppercase tracking-widest text-amber-100/60">
                    Coins
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {quickActions.map((action) => (
                  <Link
                    key={action.label}
                    to={action.to}
                    className="relative flex min-h-24 flex-col items-center justify-center gap-2 rounded border border-purple-300/20 bg-black/40 px-3 py-4 text-purple-100 transition hover:border-purple-400 hover:bg-purple-950/50"
                  >
                    <span className="text-2xl">{action.icon}</span>
                    <span className="text-sm uppercase tracking-widest">
                      {action.label}
                    </span>
                    {action.badge ? (
                      <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-black">
                        +{action.badge}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>

              <Link
                to="/profile/avatar"
                className="inline-flex items-center justify-between rounded border border-purple-400/30 bg-purple-950/30 px-4 py-3 text-purple-100 transition hover:border-purple-400 hover:bg-purple-900/40"
              >
                Customize your arcade identity
                <FaArrowRight />
              </Link>
            </div>
          </aside>
        </section>

        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <div className="flex min-h-72 flex-col rounded-lg border border-red-950/70 bg-gray-950/80 p-5 transition hover:border-red-600 md:p-6">
            <div className="mb-5 flex items-center gap-3 text-red-500">
              <FaGamepad className="text-3xl" />
              <h2 className="text-2xl font-bold uppercase tracking-wide text-orange-100">
                Open Cabinets
              </h2>
            </div>
            <div className="grid flex-1 gap-3">
              {cabinets.map((cabinet) => (
                <Link
                  key={cabinet}
                  to="/arcade"
                  className="group flex items-center justify-between rounded border border-red-950/60 bg-black/35 px-4 py-3 text-orange-100/80 transition hover:border-red-500 hover:bg-red-950/35 hover:text-orange-100"
                >
                  <span>{cabinet}</span>
                  <FaArrowRight className="opacity-0 transition group-hover:opacity-100" />
                </Link>
              ))}
            </div>
            <Link
              to="/arcade"
              className="mt-5 inline-flex items-center justify-center gap-2 rounded border border-red-500/30 px-4 py-3 text-sm uppercase tracking-widest text-red-200 transition hover:bg-red-950/50"
            >
              Explore Arcade
              <FaArrowRight />
            </Link>
          </div>

          <Link
            to="/scareathon/scareboard"
            className="flex min-h-72 flex-col rounded-lg border border-red-950/70 bg-gray-950/80 p-5 transition hover:border-red-600 hover:bg-red-950/30 md:p-6"
          >
            <div className="mb-5 flex items-center gap-3 text-red-500">
              <FaListOl className="text-3xl" />
              <h2 className="text-2xl font-bold uppercase tracking-wide text-orange-100">
                Scareboard
              </h2>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-4">
              <p className="text-base uppercase tracking-widest text-orange-100/55">
                {leaderboard?.meta?.year
                  ? `${leaderboard.meta.year} ${leaderboard.meta.isLive ? "live" : "historical"} standings`
                  : "Latest standings"}
              </p>
              <div className="rounded border border-amber-300/30 bg-amber-950/20 px-4 py-4 text-amber-200">
                <div className="flex items-center gap-3 text-xl">
                  <FaTrophy />
                  <span>{leaderLabel}</span>
                </div>
              </div>
              <p className="text-base text-orange-100/65">
                Track the top totals and see who is setting the pace.
              </p>
            </div>
            <span className="mt-5 inline-flex items-center gap-2 text-sm uppercase tracking-widest text-red-200">
              View Full Board
              <FaArrowRight />
            </span>
          </Link>

          <Link
            to="/announcements"
            className="group flex min-h-72 flex-col overflow-hidden rounded-lg border border-orange-800/70 bg-gray-950/80 transition hover:border-orange-500 hover:bg-orange-950/30"
          >
            <div className="relative h-32 overflow-hidden bg-black">
              <img
                src="/images/home_bg.png"
                alt=""
                className="h-full w-full object-cover opacity-55 transition duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950 to-transparent" />
            </div>
            <div className="flex flex-1 flex-col p-5 md:p-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="inline-flex rounded border border-orange-500/30 bg-orange-950/40 px-3 py-1 text-xs uppercase tracking-widest text-orange-200">
                  Latest News
                </span>
                <span className="text-xs uppercase tracking-widest text-orange-100/45">
                  {latestPostDateLabel}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-orange-100">
                {latestPostTitle}
              </h2>
              <p className="mt-3 flex-1 text-base text-orange-100/65">
                Event updates, arcade notes, and house announcements.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm uppercase tracking-widest text-orange-200">
                Read Posts
                <FaArrowRight />
              </span>
            </div>
          </Link>
        </section>
      </SiteContainer>
    </AnimatedPage>
  );
}
