import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, m as motion, useMotionValue, useReducedMotion } from "framer-motion";
import { useDrag } from "@use-gesture/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  FaArrowRight,
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
  FaCoins,
  FaEnvelope,
  FaFilm,
  FaListOl,
  FaPlay,
} from "react-icons/fa";
import AnimatedPage from "../../components/AnimatedPage";
import { wideSiteContainerClassName } from "../../components/PageContainer";
import { fetchWithAuth } from "../../fetchWithAuth";
import { supabase } from "../../supabaseClient";
import { createArcadeGames, useIsMobileArcade } from "../Arcade/games";

// The redesigned landing page, shown at /?v2 while we try it out. Three calm
// sections: what's coming (the October event), the arcade shelf, and the news.
// Game colours only show up as small accents so the page stays easy on the eyes.

type ContentLoopItem = {
  type: "announcement" | "weekly_challenge";
  id: string;
  title: string;
  summary?: string | null;
  publishedAt?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  rewardCoins?: number;
  href: string;
};

type Summary = {
  isAuthenticated: boolean;
  username?: string | null;
  coinBalance?: number | null;
  unreadCount?: number;
};

type ShowcaseGame = {
  name: string;
  tagline: string;
  color: string;
  still?: string;
  video?: string;
  href: string;
};

const EVENT_MONTH = 9; // October

function scareathonState(now = new Date()) {
  const year = now.getFullYear();
  const isOctober = now.getMonth() === EVENT_MONTH;
  const start = new Date(year, EVENT_MONTH, 1);
  const nextStart = now > new Date(year, EVENT_MONTH + 1, 0, 23, 59, 59) ? new Date(year + 1, EVENT_MONTH, 1) : start;
  const daysUntil = Math.max(0, Math.ceil((nextStart.getTime() - now.getTime()) / 86_400_000));
  return { isOctober, daysUntil, year: nextStart.getFullYear(), day: now.getDate() };
}

// /game-recordings/Foo.mp4 → /game-recordings/stills/Foo.jpg (see ArcadeV2/cartridge.ts;
// copied here so the home page doesn't pull in three.js)
function stillFor(videoUrl?: string) {
  if (!videoUrl) return undefined;
  const slash = videoUrl.lastIndexOf("/");
  return `${videoUrl.slice(0, slash)}/stills/${videoUrl.slice(slash + 1).replace(/\.mp4$/i, ".jpg")}`;
}

const gamePath = (name: string) => `/arcade?game=${encodeURIComponent(name)}`;

// Every game in the arcade catalog, so new games show up here without
// touching this page. Phones only get the ones that work by touch.
function useShowcaseGames() {
  const isMobile = useIsMobileArcade();
  return useMemo<ShowcaseGame[]>(
    () =>
      createArcadeGames()
        .filter((game) => !isMobile || game.availableOnMobile !== false)
        .map((game) => ({
          name: game.name,
          tagline: game.cartridge.tagline,
          color: game.cartridge.color,
          still: stillFor(game.videoUrl),
          video: game.videoUrl,
          href: gamePath(game.name),
        })),
    [isMobile]
  );
}

// A handful of games with video for the spotlight, shuffled fresh each day so
// every game (new ones included) gets its turn without anyone picking them
function pickSpotlight(games: ShowcaseGame[], count = 6) {
  const today = new Date();
  let seed = today.getFullYear() * 1000 + today.getMonth() * 40 + today.getDate();
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const pool = games.filter((game) => game.video);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

async function fetchSummary(): Promise<Summary> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { isAuthenticated: false };

  const [summary, user] = await Promise.all([
    fetchWithAuth("/home/summary").then((r) => (r.ok ? r.json() : null)),
    fetchWithAuth("/user").then((r) => (r.ok ? r.json() : null)),
  ]);
  return {
    isAuthenticated: true,
    username: user?.data?.username || user?.data?.email?.split("@")[0] || null,
    coinBalance: summary?.data?.wallet?.coinBalance ?? null,
    unreadCount: summary?.data?.inbox?.unreadCount ?? 0,
  };
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/60">{eyebrow}</p>
        <h2 className="mt-1 font-scooby text-2xl font-semibold text-stone-100 md:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Hero({ summary, spotlight }: { summary?: Summary; spotlight: ShowcaseGame[] }) {
  const { isOctober, daysUntil, year, day } = scareathonState();
  const signedIn = summary?.isAuthenticated;

  return (
    <section className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/15 bg-amber-100/5 px-3 py-1 text-xs font-medium text-amber-100/80">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />
          {isOctober
            ? `Scareathon ${year} · Day ${day} of 31`
            : daysUntil <= 1
              ? `Scareathon ${year} starts tomorrow`
              : `Scareathon ${year} starts in ${daysUntil} days`}
        </span>
        <h1 className="mt-5 font-scooby text-4xl font-semibold leading-tight tracking-tight text-stone-50 md:text-5xl lg:text-6xl">
          A horror movie a day.
          <br />
          <span className="text-amber-200/90">An arcade all year.</span>
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-stone-300/80 md:text-lg">
          Watch along through October, play spooky little games any time, and earn coins to dress up your avatar.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/arcade"
            className="inline-flex items-center gap-2 rounded-full bg-amber-200 px-6 py-3 font-semibold text-stone-900 transition hover:bg-amber-100"
          >
            <FaPlay className="text-sm" />
            Play the arcade
          </Link>
          <Link
            to={isOctober ? "/scareathon/today" : "/scareathon"}
            className="inline-flex items-center gap-2 rounded-full border border-stone-100/15 px-6 py-3 font-medium text-stone-200 transition hover:border-stone-100/30 hover:bg-white/5"
          >
            {isOctober ? "Today's movie" : "How Scareathon works"}
          </Link>
        </div>

        {signedIn ? (
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-stone-400">
            <span className="text-stone-300">Welcome back{summary?.username ? `, ${summary.username}` : ""}</span>
            <Link to="/profile/shop" className="inline-flex items-center gap-1.5 transition hover:text-stone-200">
              <FaCoins className="text-amber-300/70" />
              {summary?.coinBalance?.toLocaleString() ?? "–"} coins
            </Link>
            <Link to="/profile/inbox" className="inline-flex items-center gap-1.5 transition hover:text-stone-200">
              <FaEnvelope className="text-stone-500" />
              {summary?.unreadCount ? `${summary.unreadCount} unread` : "Inbox"}
            </Link>
          </div>
        ) : summary ? (
          <p className="mt-8 text-sm text-stone-400">
            <Link to="/authentication" className="text-stone-200 underline decoration-stone-500 underline-offset-4 hover:decoration-stone-300">
              Sign in
            </Link>{" "}
            to save your scores and earn coins.
          </p>
        ) : null}
      </div>

      <Spotlight games={spotlight} />
    </section>
  );
}

// Past this many pixels (or a quick flick), a drag changes the game
const SWIPE_DISTANCE = 60;

// The big picture beside the headline: cycles through a few games, a few
// seconds each. Swipe or drag it sideways to flip through them. Holds still on
// hover, while dragging, and for people who've asked for less motion.
function Spotlight({ games }: { games: ShowcaseGame[] }) {
  const [index, setIndex] = useState(0);
  // Which way the last change went, so the next game slides in from that side
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const reduceMotion = useReducedMotion();
  const dragX = useMotionValue(0);
  // A drag ends with a click on the card; this stops it opening the game
  const swiped = useRef(false);
  const count = Math.max(games.length, 1);
  const current = index % count;
  const game = games[current];

  const go = (step: number) => {
    setDirection(step > 0 ? 1 : -1);
    setIndex((i) => (((i % count) + step) % count + count) % count);
  };
  const show = (target: number) => {
    if (target === current) return;
    setDirection(target > current ? 1 : -1);
    setIndex(target);
  };

  const bind = useDrag(
    ({ first, last, movement: [mx], swipe: [swipeX], tap }) => {
      if (tap || games.length < 2) return;
      if (first) {
        setDragging(true);
        swiped.current = false;
      }
      if (Math.abs(mx) > 8) swiped.current = true;
      // The card follows the finger, with a little resistance
      dragX.set(mx * 0.4);
      if (!last) return;
      setDragging(false);
      animate(dragX, 0, { type: "spring", stiffness: 400, damping: 35 });
      if (swipeX) go(-swipeX);
      else if (Math.abs(mx) > SWIPE_DISTANCE) go(mx < 0 ? 1 : -1);
    },
    { axis: "x", filterTaps: true, pointer: { capture: false } }
  );

  useEffect(() => {
    if (paused || dragging || reduceMotion || games.length < 2) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % games.length), 7000);
    return () => window.clearTimeout(timer);
  }, [index, paused, dragging, reduceMotion, games.length]);

  if (!game) {
    return <div className="aspect-[4/3] animate-pulse rounded-3xl border border-white/10 bg-white/[0.03] sm:aspect-video lg:aspect-[4/3]" />;
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Link
        {...bind()}
        to={game.href}
        draggable={false}
        onClickCapture={(event) => {
          if (swiped.current) event.preventDefault();
          swiped.current = false;
        }}
        className="group relative block aspect-[4/3] touch-pan-y select-none overflow-hidden rounded-3xl border border-white/10 bg-stone-900 shadow-2xl shadow-black/40 sm:aspect-video lg:aspect-[4/3]"
      >
        <motion.div className="absolute inset-0" style={{ x: dragX }}>
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={game.name}
            className="absolute inset-0"
            custom={direction}
            variants={{
              enter: (dir: number) => ({ opacity: 0, x: reduceMotion ? 0 : dir * 60 }),
              center: { opacity: 1, x: 0 },
              exit: (dir: number) => ({ opacity: 0, x: reduceMotion ? 0 : dir * -60 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {game.video ? (
              <video
                className="h-full w-full object-cover opacity-85 transition duration-700 group-hover:scale-[1.03] group-hover:opacity-100"
                src={game.video}
                poster={game.still}
                autoPlay
                muted
                loop
                playsInline
              />
            ) : game.still ? (
              <img src={game.still} alt="" draggable={false} className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center pb-16"
                style={{ background: `radial-gradient(circle at 30% 20%, ${game.color}55, #16121a 70%)` }}
              >
                <span className="px-6 text-center font-scooby text-5xl text-stone-100/80 md:text-6xl">{game.name}</span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0c10] via-[#0f0c10]/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 md:p-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-300/70">
              In the arcade
            </p>
            <p className="mt-1 truncate text-2xl font-semibold text-stone-50">{game.name.replace(/’/g, "'")}</p>
            <p className="truncate text-sm text-stone-300/80">{game.tagline}</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/90 text-stone-900 transition group-hover:scale-105">
            <FaPlay className="ml-0.5 text-sm" />
          </span>
        </div>
      </Link>
      {games.length > 1 && (
        <div className="mt-4 flex justify-center gap-1.5">
          {games.map((g, i) => (
            <button
              key={g.name}
              type="button"
              aria-label={`Show ${g.name}`}
              aria-current={i === current}
              onClick={() => show(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === current ? "w-6 bg-stone-200" : "w-1.5 bg-stone-600 hover:bg-stone-400"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GameTile({ game }: { game: ShowcaseGame }) {
  return (
    <Link
      to={game.href}
      className="group w-[15rem] shrink-0 snap-start sm:w-auto"
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-stone-900">
        {game.still ? (
          <img
            src={game.still}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: `radial-gradient(circle at 30% 20%, ${game.color}55, #16121a 70%)` }}
          >
            <span className="px-4 text-center font-scooby text-2xl text-stone-100/80">{game.name}</span>
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-stone-900">
            <FaPlay className="ml-0.5 text-xs" />
          </span>
        </span>
      </div>
      <div className="mt-3 flex items-start gap-2.5 px-0.5">
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full opacity-80" style={{ background: game.color }} />
        <div className="min-w-0">
          <p className="truncate font-medium text-stone-100">{game.name.replace(/’/g, "'")}</p>
          <p className="truncate text-sm text-stone-400">{game.tagline}</p>
        </div>
      </div>
    </Link>
  );
}

function ArcadeShowcase({ games }: { games: ShowcaseGame[] }) {
  const scroller = useRef<HTMLDivElement | null>(null);

  const scrollBy = (direction: number) =>
    scroller.current?.scrollBy({ left: direction * scroller.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <section>
      <SectionHeading
        eyebrow="The arcade"
        title={`${games.length} games, free to play`}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Scroll games left"
              onClick={() => scrollBy(-1)}
              className="hidden h-9 w-9 items-center justify-center rounded-full border border-white/10 text-stone-400 transition hover:border-white/25 hover:text-stone-100 md:flex"
            >
              <FaChevronLeft className="text-xs" />
            </button>
            <button
              type="button"
              aria-label="Scroll games right"
              onClick={() => scrollBy(1)}
              className="hidden h-9 w-9 items-center justify-center rounded-full border border-white/10 text-stone-400 transition hover:border-white/25 hover:text-stone-100 md:flex"
            >
              <FaChevronRight className="text-xs" />
            </button>
            <Link to="/arcade" className="ml-1 inline-flex items-center gap-1.5 text-sm text-stone-300 transition hover:text-stone-50">
              See all <FaArrowRight className="text-xs" />
            </Link>
          </div>
        }
      />
      <div
        ref={scroller}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-flow-col sm:auto-cols-[calc((100%-2rem)/3)] sm:px-0 lg:auto-cols-[calc((100%-3rem)/4)] xl:auto-cols-[calc((100%-4rem)/5)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {games.map((game) => (
          <GameTile key={game.name} game={game} />
        ))}
      </div>

    </section>
  );
}

function ComingUp() {
  const { isOctober, year } = scareathonState();
  const steps = [
    {
      icon: <FaFilm />,
      title: isOctober ? "Today's movie is up" : "October 1 — the watch begins",
      body: "One horror pick every day through Halloween, with where to stream it.",
      to: isOctober ? "/scareathon/today" : "/scareathon",
    },
    {
      icon: <FaCalendarAlt />,
      title: "Weekly challenges",
      body: "A new goal each week — beat a score, watch a pick — for bonus points and coins.",
      to: "/scareathon/rules",
    },
    {
      icon: <FaListOl />,
      title: `The ${year} Scareboard`,
      body: "Every movie and challenge adds up. See who's leading the pack.",
      to: "/scareathon/scareboard",
    },
  ];

  return (
    <section>
      <SectionHeading eyebrow={isOctober ? "Happening now" : "Coming up"} title={`Scareathon ${year}`} />
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((step) => (
          <Link
            key={step.title}
            to={step.to}
            className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05] md:p-6"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-200/10 text-amber-200/80">
              {step.icon}
            </span>
            <p className="mt-4 font-medium text-stone-100">{step.title}</p>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-stone-400">{step.body}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm text-stone-400 transition group-hover:text-stone-200">
              Learn more <FaArrowRight className="text-xs transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function News() {
  const { data, isLoading } = useQuery<ContentLoopItem[]>({
    queryKey: ["content-loop"],
    queryFn: async () => {
      const response = await fetchWithAuth("/content-loop");
      if (!response.ok) throw new Error("Couldn't load news");
      return (await response.json()).data ?? [];
    },
    select: (payload: unknown) =>
      // Shares the cache with ContentLoop, which stores the whole response
      Array.isArray(payload) ? payload : ((payload as { data?: ContentLoopItem[] })?.data ?? []),
    staleTime: 1000 * 60 * 5,
  });
  const items = (data ?? []).slice(0, 3);

  if (!isLoading && items.length === 0) return null;

  return (
    <section>
      <SectionHeading
        eyebrow="News"
        title="From the crypt"
        action={
          <Link to="/announcements" className="inline-flex items-center gap-1.5 text-sm text-stone-300 transition hover:text-stone-50">
            All news <FaArrowRight className="text-xs" />
          </Link>
        }
      />
      <div className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {isLoading
          ? [0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2 p-5">
                <span className="h-3 w-20 animate-pulse rounded bg-white/10" />
                <span className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
              </div>
            ))
          : items.map((item) => {
              const isChallenge = item.type === "weekly_challenge";
              const date = isChallenge
                ? item.startsAt && item.endsAt
                  ? `${formatDate(item.startsAt)} – ${formatDate(item.endsAt)}`
                  : null
                : formatDate(item.publishedAt);
              return (
                <Link
                  key={`${item.type}-${item.id}`}
                  to={item.href}
                  className="group flex items-center gap-4 p-5 transition hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          isChallenge ? "bg-emerald-200/10 text-emerald-200/80" : "bg-white/10 text-stone-300"
                        }`}
                      >
                        {isChallenge ? "Weekly challenge" : "Announcement"}
                      </span>
                      {date && <span>{date}</span>}
                      {isChallenge && item.rewardCoins ? (
                        <span className="inline-flex items-center gap-1 text-amber-200/70">
                          <FaCoins /> {item.rewardCoins}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 truncate font-medium text-stone-100">{item.title}</p>
                    {item.summary && <p className="mt-1 line-clamp-1 text-sm text-stone-400">{item.summary}</p>}
                  </div>
                  <FaArrowRight className="shrink-0 text-xs text-stone-500 transition group-hover:translate-x-0.5 group-hover:text-stone-200" />
                </Link>
              );
            })}
      </div>
    </section>
  );
}

export default function HomeV2() {
  const { data: summary } = useQuery({
    queryKey: ["home-v2", "summary"],
    queryFn: fetchSummary,
    staleTime: 1000 * 30,
  });

  const games = useShowcaseGames();
  const spotlight = useMemo(() => pickSpotlight(games), [games]);

  return (
    <AnimatedPage className="bg-[#0f0c10] font-sans">
      {/* Two soft glows so the page isn't flat black */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-amber-500/[0.07] blur-3xl" />
        <div className="absolute right-[-10rem] top-[40rem] h-[30rem] w-[30rem] rounded-full bg-violet-500/[0.05] blur-3xl" />
      </div>
      <main className={`${wideSiteContainerClassName} relative flex flex-col gap-16 pb-20 pt-8 md:gap-24 md:pt-14`}>
        <Hero summary={summary} spotlight={spotlight} />
        <ArcadeShowcase games={games} />
        <ComingUp />
        <News />
      </main>
    </AnimatedPage>
  );
}
