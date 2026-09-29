import { useState } from "react";
import { BlocksRenderer } from "@strapi/blocks-react-renderer";
import type { BlocksContent } from "@strapi/blocks-react-renderer";
import { challengeTarget, formatShortDate, needsSignIn, strapiUrl, useContentLoop, usePosts, useRewardStatus, type ContentLoopItem } from "../data.ts";
import type { StopId } from "../stops.ts";
import { Loading, PanelHeading, Paper, Problem, SignInFirst, Tabs } from "./ui.tsx";
import { serif } from "./theme.ts";

// The notice board: what's pinned up (announcements and the weekly challenge, open to
// everyone) and the full posts (The Scareathon Post, for signed-in visitors).

type Props = { signedIn: boolean; goTo: (id: StopId) => void };

function Notice({ item, signedIn, goTo, tilt, onReadPost }: { item: ContentLoopItem; signedIn: boolean; goTo: Props["goTo"]; tilt: number; onReadPost: () => void }) {
  const isChallenge = item.type === "weekly_challenge";
  const { data: reward } = useRewardStatus(item, signedIn);
  const claimed = Boolean(reward?.data?.alreadyClaimed);
  const target = challengeTarget(item);
  const dates = isChallenge && item.startsAt && item.endsAt ? `${formatShortDate(item.startsAt)} – ${formatShortDate(item.endsAt)}` : formatShortDate(item.publishedAt);

  return (
    <Paper tilt={tilt} className="pt-6">
      <div className="flex items-baseline justify-between gap-3 text-[11px] uppercase tracking-widest text-stone-600">
        <span>{isChallenge ? "Weekly challenge" : "Announcement"}</span>
        {dates && <span>{dates}</span>}
      </div>
      <h3 className="mt-2 text-lg leading-snug" style={serif}>
        {item.title}
      </h3>
      {item.summary && <p className="mt-2 text-sm leading-relaxed text-stone-700">{item.summary}</p>}
      {isChallenge && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-sm border border-stone-800/30 px-2 py-1">{item.points || 1} point</span>
          {item.rewardCoins ? <span className="rounded-sm border border-amber-800/40 bg-amber-200/60 px-2 py-1">{item.rewardCoins.toLocaleString()} coins</span> : null}
          {target && <span className="rounded-sm border border-stone-800/20 px-2 py-1 text-stone-700">{target}</span>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {isChallenge && claimed && <span className="font-semibold text-emerald-800">✓ Completed</span>}
        {isChallenge && !signedIn && item.isActive !== false && item.rewardCoins ? (
          <button type="button" onClick={() => goTo("tickets")} className="rounded-sm bg-stone-900 px-3 py-1 text-amber-100 hover:bg-stone-700">
            Sign in to earn
          </button>
        ) : null}
        {isChallenge ? (
          item.gameName && (
            <button type="button" onClick={() => goTo("arcade")} className="underline decoration-stone-500 underline-offset-4">
              Go to the arcade
            </button>
          )
        ) : (
          <button type="button" onClick={onReadPost} className="underline decoration-stone-500 underline-offset-4">
            Read the full post
          </button>
        )}
      </div>
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
          <article key={post.id} className="rounded border border-amber-200/15 bg-black/30 p-4">
            <p className="text-[11px] uppercase tracking-widest text-amber-200/50">{new Date(post.publishedAt).toLocaleDateString()}</p>
            <h3 className="mt-1 text-lg text-amber-100" style={serif}>
              {post.Title}
            </h3>
            {image && <img src={image} alt={post.Image?.[0]?.alternativeText || ""} className="mt-3 max-h-56 w-full rounded object-contain bg-black" loading="lazy" />}
            {post.Content ? (
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
            ) : null}
            {post.Content ? (
              <button type="button" onClick={() => setOpen(expanded ? null : post.id)} className="mt-2 text-sm text-amber-300 hover:text-amber-200">
                {expanded ? "Show less" : "Read more"}
              </button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export default function NoticePanel({ signedIn, goTo }: Props) {
  const [tab, setTab] = useState<"pinned" | "posts">("pinned");
  const { data: items = [], isLoading, error } = useContentLoop();

  return (
    <>
      <PanelHeading eyebrow="Notice board" title="What's pinned up" />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "pinned", label: "Pinned" },
          { id: "posts", label: "The Scareathon Post" },
        ]}
      />
      {tab === "posts" ? (
        <Posts signedIn={signedIn} goTo={goTo} />
      ) : isLoading ? (
        <Loading label="Reading the notices" />
      ) : error ? (
        <Problem message={error.message} />
      ) : items.length ? (
        <div className="space-y-5 px-1">
          {items.map((item, i) => (
            <Notice key={item.id} item={item} signedIn={signedIn} goTo={goTo} tilt={[-0.8, 0.6, -0.4, 0.9][i % 4]} onReadPost={() => setTab("posts")} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-400">The board is bare tonight.</p>
      )}
    </>
  );
}
