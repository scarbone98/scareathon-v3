import { useMemo, useState } from "react";
import { BlocksRenderer } from "@strapi/blocks-react-renderer";
import type { BlocksContent } from "@strapi/blocks-react-renderer";
import { createArcadeGames, useIsMobileArcade } from "../../pages/Arcade/games";
import {
  challengeTarget,
  eventState,
  formatShortDate,
  needsSignIn,
  strapiUrl,
  useContentLoop,
  usePosts,
  useRewardStatus,
  useSummary,
  type ContentLoopItem,
} from "../data.ts";
import type { GoTo } from "../stops.ts";
import { Loading, PanelHeading, Paper, PlainButton, Problem, SectionTitle, SignInFirst } from "./ui.tsx";
import { serif, stubButton } from "./theme.ts";

// The station board is the home page: a welcome (with your coins and mail), what's on,
// the arcade's shelf, and the news: what's pinned up, and The Scareathon Post.

type Props = { signedIn: boolean; goTo: GoTo };

// /game-recordings/Foo.mp4 → /game-recordings/stills/Foo.jpg (as the home page does)
function stillFor(videoUrl?: string) {
  if (!videoUrl) return undefined;
  const slash = videoUrl.lastIndexOf("/");
  return `${videoUrl.slice(0, slash)}/stills/${videoUrl.slice(slash + 1).replace(/\.mp4$/i, ".jpg")}`;
}

function Welcome({ signedIn, goTo }: Props) {
  const { data: summary } = useSummary();
  const { isLive, daysUntil, year, day } = eventState();
  return (
    <div className="space-y-3">
      <p className="text-lg leading-snug text-[#f2ead2]" style={serif}>
        {isLive ? `Scareathon ${year}: night ${day} of 31.` : `Scareathon ${year} begins in ${daysUntil} ${daysUntil === 1 ? "day" : "days"}.`}{" "}
        <span className="text-stone-400">A horror film a night through October, and an arcade all year.</span>
      </p>
      {signedIn ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-1 text-stone-300">Welcome back{summary?.username ? `, ${summary.username}` : ""}.</span>
          <PlainButton onClick={() => goTo("tickets", "shop")}>{summary?.coinBalance != null ? `${summary.coinBalance.toLocaleString()} coins` : "Coins"}</PlainButton>
          <PlainButton onClick={() => goTo("tickets", "inbox")}>{summary?.unreadCount ? `${summary.unreadCount} unread` : "Inbox"}</PlainButton>
        </div>
      ) : (
        <button type="button" onClick={() => goTo("tickets")} className={stubButton}>
          Get a ticket: save scores, earn coins
        </button>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <PlainButton onClick={() => goTo("events", "tonight")}>{isLive ? "Tonight's film" : "How Scareathon works"}</PlainButton>
        <PlainButton onClick={() => goTo("departures")}>Scareboard</PlainButton>
        <PlainButton onClick={() => goTo("events", "rules")}>Rules</PlainButton>
      </div>
    </div>
  );
}

function Shelf({ goTo }: Props) {
  const isMobile = useIsMobileArcade();
  const games = useMemo(
    () => createArcadeGames().filter((game) => game.game && !game.special && (!isMobile || game.availableOnMobile !== false)),
    [isMobile]
  );
  return (
    <>
      <SectionTitle action={<PlainButton onClick={() => goTo("arcade")}>All {games.length}</PlainButton>}>In the arcade</SectionTitle>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {games.map((game) => (
          <button key={game.name} type="button" onClick={() => goTo("arcade", game.name)} className="w-36 shrink-0 snap-start text-left">
            <div className="aspect-video overflow-hidden rounded-[3px] bg-black ring-1 ring-[#f2ead2]/20">
              {stillFor(game.videoUrl) ? (
                <img src={stillFor(game.videoUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-stone-300" style={{ background: `${game.cartridge.color}33` }}>
                  {game.name}
                </div>
              )}
            </div>
            <p className="mt-1.5 truncate text-sm text-[#f2ead2]" style={serif}>
              {game.name.replace(/’/g, "'")}
            </p>
            <p className="truncate text-xs text-stone-400">{game.cartridge.tagline}</p>
          </button>
        ))}
      </div>
    </>
  );
}

function Notice({ item, signedIn, goTo, tilt }: { item: ContentLoopItem; tilt: number } & Props) {
  const isChallenge = item.type === "weekly_challenge";
  const { data: reward } = useRewardStatus(item, signedIn);
  const target = challengeTarget(item);
  const dates = isChallenge && item.startsAt && item.endsAt ? `${formatShortDate(item.startsAt)} – ${formatShortDate(item.endsAt)}` : formatShortDate(item.publishedAt);

  return (
    <Paper tilt={tilt} className="pt-6">
      <div className="flex items-baseline justify-between gap-3 text-[11px] uppercase tracking-widest text-stone-600">
        <span>{isChallenge ? "Weekly challenge" : "Announcement"}</span>
        {dates && <span>{dates}</span>}
      </div>
      <h4 className="mt-2 text-lg leading-snug" style={serif}>
        {item.title}
      </h4>
      {item.summary && <p className="mt-2 text-sm leading-relaxed text-stone-700">{item.summary}</p>}
      {isChallenge && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-sm border border-stone-800/30 px-2 py-1">{item.points || 1} point</span>
          {item.rewardCoins ? <span className="rounded-sm border border-amber-800/40 bg-amber-200/60 px-2 py-1">{item.rewardCoins.toLocaleString()} coins</span> : null}
          {target && <span className="rounded-sm border border-stone-800/20 px-2 py-1 text-stone-700">{target}</span>}
        </div>
      )}
      {isChallenge && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {reward?.data?.alreadyClaimed && <span className="font-semibold text-emerald-800">✓ Completed</span>}
          {!signedIn && item.isActive !== false && item.rewardCoins ? (
            <button type="button" onClick={() => goTo("tickets")} className="rounded-sm bg-[#1d2a3a] px-3 py-1 text-[#f2ead2] hover:bg-[#2a3b50]">
              Sign in to earn
            </button>
          ) : null}
          {item.gameName && (
            <button type="button" onClick={() => goTo("arcade", item.gameName ?? undefined)} className="underline decoration-stone-500 underline-offset-4">
              Play {item.gameName.replace(/[‘’]/g, "'")}
            </button>
          )}
        </div>
      )}
    </Paper>
  );
}

function Posts({ signedIn, goTo }: Props) {
  const { data, isLoading, error } = usePosts(signedIn);
  const [open, setOpen] = useState<number | null>(null);
  if (!signedIn || needsSignIn(error)) return <SignInFirst what="Full posts" onGoToKiosk={() => goTo("tickets")} />;
  if (isLoading) return <Loading label="Fetching the post" />;
  if (error) return <Problem message={error.message} />;
  const posts = data?.data ?? [];
  if (!posts.length) return <p className="text-sm text-stone-400">Nothing posted yet.</p>;
  return (
    <div className="space-y-4">
      {posts.map((post) => {
        const expanded = open === post.id;
        const image = strapiUrl(post.Image?.[0]?.url);
        return (
          <article key={post.id} className="rounded-[3px] border border-[#f2ead2]/15 bg-black/30 p-4">
            <p className="text-[11px] uppercase tracking-widest text-[#f2ead2]/50">{new Date(post.publishedAt).toLocaleDateString()}</p>
            <h4 className="mt-1 text-lg text-[#f2ead2]" style={serif}>
              {post.Title}
            </h4>
            {image && <img src={image} alt={post.Image?.[0]?.alternativeText || ""} className="mt-3 max-h-56 w-full rounded-[3px] bg-black object-contain" loading="lazy" />}
            {post.Content ? (
              <>
                <div className={`prose prose-invert prose-sm mt-3 max-w-none text-stone-300 ${expanded ? "" : "max-h-32 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"}`}>
                  <BlocksRenderer
                    content={post.Content as BlocksContent}
                    blocks={{
                      list: ({ children }) => <ul className="list-inside list-disc">{children}</ul>,
                      link: ({ children, url }) => (
                        <a href={url} className="text-amber-300 hover:text-amber-200">
                          {children}
                        </a>
                      ),
                    }}
                  />
                </div>
                <button type="button" onClick={() => setOpen(expanded ? null : post.id)} className="mt-2 text-sm text-amber-300 hover:text-amber-200">
                  {expanded ? "Show less" : "Read more"}
                </button>
              </>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export default function HomePanel(props: Props) {
  const { data: items = [], isLoading, error } = useContentLoop();
  return (
    <>
      <PanelHeading eyebrow="Station board" title="Wayside Station" />
      <Welcome {...props} />
      <Shelf {...props} />
      <SectionTitle>News</SectionTitle>
      {isLoading ? (
        <Loading label="Reading the notices" />
      ) : error ? (
        <Problem message={error.message} />
      ) : items.length ? (
        <div className="space-y-5 px-1">
          {items.map((item, i) => (
            <Notice key={item.id} item={item} tilt={[-0.8, 0.6, -0.4, 0.9][i % 4]} {...props} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-400">The board is bare tonight.</p>
      )}
      <SectionTitle>The Scareathon Post</SectionTitle>
      <Posts {...props} />
    </>
  );
}
