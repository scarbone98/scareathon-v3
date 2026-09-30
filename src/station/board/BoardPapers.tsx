// The papers' content components live beside the hook that picks them; hot reload just reloads this file
/* eslint-disable react-refresh/only-export-components */
import { useState, type ReactNode } from "react";
import { BlocksRenderer } from "@strapi/blocks-react-renderer";
import type { BlocksContent } from "@strapi/blocks-react-renderer";
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
import { serif } from "../style/theme.ts";

// The station board is the home page, and its papers are the content: a welcome (your
// ticket, coins and mail), the Scareathon, this week's challenge, the latest two
// announcements, and The Scareathon Post. Each paper pinned up shows a summary; tapping
// one lifts it off the board to read in full (PaperReader).

export type Paper = {
  id: string;
  kind: string; // the small label at the top, e.g. NOTICE
  title: string; // also painted on the board's own texture, for when the paper can't be drawn crisply
  pinned: ReactNode; // on the board
  full: ReactNode; // lifted up to read
  tint: string;
};

const ink = "text-[#2a1d14]";
const quiet = "text-[#2a1d14]/70";
const action =
  "rounded-[2px] bg-[#1d2a3a] px-2.5 py-1 text-[13px] text-[#f2ead2] shadow-[1px_1px_0_rgba(0,0,0,0.4)] transition hover:bg-[#2a3b50]";
const link = "underline decoration-[#2a1d14]/40 underline-offset-4 hover:decoration-[#2a1d14]";

function Label({ children }: { children: ReactNode }) {
  return <p className={`text-[11px] font-semibold uppercase tracking-[0.25em] ${quiet}`}>{children}</p>;
}

function Headline({ children, big = false }: { children: ReactNode; big?: boolean }) {
  return (
    <h3 className={`${ink} ${big ? "text-3xl" : "text-[22px]"} mt-1 leading-tight`} style={serif}>
      {children}
    </h3>
  );
}

// Buttons on a paper act without also lifting the paper
const act = (fn: () => void) => (event: React.MouseEvent) => {
  event.stopPropagation();
  fn();
};

function Challenge({ item, signedIn, goTo, full }: { item: ContentLoopItem; signedIn: boolean; goTo: GoTo; full: boolean }) {
  const { data: reward } = useRewardStatus(item, signedIn);
  const target = challengeTarget(item);
  return (
    <>
      <Label>
        Weekly challenge{item.startsAt && item.endsAt ? ` · ${formatShortDate(item.startsAt)} – ${formatShortDate(item.endsAt)}` : ""}
      </Label>
      <Headline big={full}>{item.title}</Headline>
      {(full || !target) && item.summary && <p className={`mt-2 text-[15px] leading-snug ${quiet}`}>{item.summary}</p>}
      {target && <p className={`mt-2 text-[15px] leading-snug ${ink}`}>{target}</p>}
      <p className={`mt-2 text-[13px] ${quiet}`}>
        {item.points || 1} point{item.rewardCoins ? ` · ${item.rewardCoins.toLocaleString()} coins` : ""}
        {reward?.data?.alreadyClaimed ? <strong className="ml-2 text-emerald-800">✓ Completed</strong> : null}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.gameName && (
          <button type="button" className={action} onClick={act(() => goTo("arcade", item.gameName ?? undefined))}>
            Play {item.gameName.replace(/[‘’]/g, "'")}
          </button>
        )}
        {!signedIn && item.rewardCoins && item.isActive !== false ? (
          <button type="button" className={action} onClick={act(() => goTo("tickets"))}>
            Sign in to earn
          </button>
        ) : null}
      </div>
    </>
  );
}

function Welcome({ signedIn, goTo, full }: { signedIn: boolean; goTo: GoTo; full: boolean }) {
  const { data: summary } = useSummary();
  return (
    <>
      <Label>Wayside Station</Label>
      <Headline big={full}>{signedIn ? `Welcome back${summary?.username ? `, ${summary.username}` : ""}.` : "Welcome, traveller."}</Headline>
      <p className={`mt-2 text-[15px] leading-snug ${quiet}`}>
        {signedIn
          ? "Your ticket's in order. Spend your coins at the kiosk, or see who's written."
          : "A horror film a night through October, and an arcade all year. Get a ticket at the kiosk to save scores and earn coins."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {signedIn ? (
          <>
            <button type="button" className={action} onClick={act(() => goTo("tickets", "shop"))}>
              {summary?.coinBalance != null ? `${summary.coinBalance.toLocaleString()} coins` : "Coins"}
            </button>
            <button type="button" className={action} onClick={act(() => goTo("tickets", "inbox"))}>
              {summary?.unreadCount ? `${summary.unreadCount} unread` : "Inbox"}
            </button>
          </>
        ) : (
          <button type="button" className={action} onClick={act(() => goTo("tickets"))}>
            Get a ticket
          </button>
        )}
      </div>
    </>
  );
}

function Scareathon({ goTo, full }: { goTo: GoTo; full: boolean }) {
  const { isLive, daysUntil, year, day } = eventState();
  return (
    <>
      <Label>Scareathon {year}</Label>
      <p className={`${ink} mt-1 text-5xl leading-none`} style={serif}>
        {isLive ? day : daysUntil}
        <span className="ml-2 align-middle text-base">{isLive ? "of 31" : daysUntil === 1 ? "day to go" : "days to go"}</span>
      </p>
      <p className={`mt-2 text-[15px] leading-snug ${quiet}`}>
        {isLive ? "One horror film a night through Halloween." : "Starts October 1: a horror film every night, weekly challenges and the Scareboard."}
        {full ? " Watch the night's film to earn a point, finish the weekly challenge for another, and wear a costume on Halloween for one more." : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={action} onClick={act(() => goTo("events", "tonight"))}>
          {isLive ? "Tonight's film" : "How it works"}
        </button>
        <button type="button" className={action} onClick={act(() => goTo("departures"))}>
          Scareboard
        </button>
      </div>
    </>
  );
}

function Announcement({ item, full }: { item: ContentLoopItem; full: boolean }) {
  const image = strapiUrl(item.image?.url);
  return (
    <>
      <Label>Notice · {formatShortDate(item.publishedAt) ?? "Latest"}</Label>
      <Headline big={full}>{item.title}</Headline>
      {full && image && <img src={image} alt={item.image?.alternativeText || ""} className="mt-3 max-h-64 w-full object-contain" />}
      {item.summary && <p className={`mt-2 text-[15px] leading-snug ${quiet} ${full ? "" : "line-clamp-4"}`}>{item.summary}</p>}
      {!full && <p className={`mt-2 text-[13px] ${link} ${ink}`}>Read the notice</p>}
    </>
  );
}

function Post({ signedIn, goTo, full }: { signedIn: boolean; goTo: GoTo; full: boolean }) {
  const { data, isLoading, error } = usePosts(signedIn);
  const [open, setOpen] = useState<number | null>(null);
  const posts = data?.data ?? [];
  const masthead = (
    <div className="border-b-2 border-double border-[#2a1d14]/60 pb-1 text-center">
      <p className={`${ink} ${full ? "text-3xl" : "text-2xl"}`} style={{ ...serif, fontVariant: "small-caps", letterSpacing: "0.04em" }}>
        The Scareathon Post
      </p>
    </div>
  );
  if (!signedIn || needsSignIn(error)) {
    return (
      <>
        {masthead}
        <p className={`mt-3 text-[15px] leading-snug ${quiet}`}>For ticket holders. Sign in at the kiosk to read the paper.</p>
        <button type="button" className={`${action} mt-3`} onClick={act(() => goTo("tickets"))}>
          Get a ticket
        </button>
      </>
    );
  }
  if (!full) {
    return (
      <>
        {masthead}
        <ul className="mt-2 space-y-1.5">
          {(isLoading ? [] : posts.slice(0, 3)).map((post) => (
            <li key={post.id} className={`${ink} text-[15px] leading-snug`} style={serif}>
              {post.Title}
            </li>
          ))}
          {isLoading && <li className={quiet}>Printing…</li>}
        </ul>
      </>
    );
  }
  return (
    <>
      {masthead}
      {posts.map((post) => {
        const expanded = open === post.id;
        const image = strapiUrl(post.Image?.[0]?.url);
        return (
          <article key={post.id} className="border-b border-[#2a1d14]/20 py-4">
            <p className={`text-[11px] uppercase tracking-widest ${quiet}`}>{new Date(post.publishedAt).toLocaleDateString()}</p>
            <h4 className={`${ink} mt-1 text-xl leading-tight`} style={serif}>
              {post.Title}
            </h4>
            {image && <img src={image} alt={post.Image?.[0]?.alternativeText || ""} className="mt-3 max-h-60 w-full object-contain" loading="lazy" />}
            {post.Content ? (
              <>
                <div className={`prose prose-sm mt-2 max-w-none text-[#2a1d14] ${expanded ? "" : "max-h-28 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"}`}>
                  <BlocksRenderer
                    content={post.Content as BlocksContent}
                    blocks={{
                      list: ({ children }) => <ul className="list-inside list-disc">{children}</ul>,
                      link: ({ children, url }) => (
                        <a href={url} className={link}>
                          {children}
                        </a>
                      ),
                    }}
                  />
                </div>
                <button type="button" onClick={() => setOpen(expanded ? null : post.id)} className={`mt-1 text-sm ${link} ${ink}`}>
                  {expanded ? "Less" : "Read on"}
                </button>
              </>
            ) : null}
          </article>
        );
      })}
    </>
  );
}

const TINTS = ["#f2ead2", "#f0c9a0", "#e8d9a8", "#e6e2d8", "#d7c9b0", "#ece4cf"];

export function useBoardPapers(signedIn: boolean, goTo: GoTo): Paper[] {
  const { data: items = [] } = useContentLoop();
  const challenge = items.find((item) => item.type === "weekly_challenge");
  const notices = items.filter((item) => item.type === "announcement").slice(0, 2);
  const { isLive, daysUntil, year } = eventState();

  const papers: Paper[] = [
    {
      id: "welcome",
      kind: "WELCOME",
      title: "WAYSIDE STATION",
      pinned: <Welcome signedIn={signedIn} goTo={goTo} full={false} />,
      full: <Welcome signedIn={signedIn} goTo={goTo} full />,
      tint: TINTS[0],
    },
    {
      id: "scareathon",
      kind: "EVENT",
      title: isLive ? `SCAREATHON ${year}` : `SCAREATHON IN ${daysUntil} DAYS`,
      pinned: <Scareathon goTo={goTo} full={false} />,
      full: <Scareathon goTo={goTo} full />,
      tint: TINTS[1],
    },
  ];
  if (challenge) {
    papers.push({
      id: challenge.id,
      kind: "CHALLENGE",
      title: challenge.title,
      pinned: <Challenge item={challenge} signedIn={signedIn} goTo={goTo} full={false} />,
      full: <Challenge item={challenge} signedIn={signedIn} goTo={goTo} full />,
      tint: TINTS[2],
    });
  }
  notices.forEach((item, i) =>
    papers.push({
      id: item.id,
      kind: "NOTICE",
      title: item.title,
      pinned: <Announcement item={item} full={false} />,
      full: <Announcement item={item} full />,
      tint: TINTS[3 + i],
    })
  );
  papers.push({
    id: "post",
    kind: "THE POST",
    title: "THE SCAREATHON POST",
    pinned: <Post signedIn={signedIn} goTo={goTo} full={false} />,
    full: <Post signedIn={signedIn} goTo={goTo} full />,
    tint: TINTS[5],
  });
  return papers.slice(0, 6);
}

// A paper as it hangs on the board. Tap it to look closer: the camera comes up to it and
// it shows everything it says (scrolling if there's more), usable where it hangs.
export function PinnedPaper({ paper, onOpen, onClose, zoomed = false }: { paper: Paper; onOpen: () => void; onClose: () => void; zoomed?: boolean }) {
  return (
    <div
      role={zoomed ? undefined : "button"}
      tabIndex={zoomed ? undefined : 0}
      aria-label={zoomed ? paper.title : `Look closer: ${paper.title}`}
      onClick={zoomed ? undefined : onOpen}
      onKeyDown={(event) => !zoomed && event.key === "Enter" && event.target === event.currentTarget && onOpen()}
      className={`relative h-full w-full overflow-hidden shadow-[3px_4px_0_rgba(0,0,0,0.45)] transition ${zoomed ? "" : "cursor-pointer hover:brightness-105"}`}
      style={{ background: paper.tint, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
    >
      <span className="absolute left-1/2 top-2 z-10 h-3 w-3 -translate-x-1/2 rounded-full bg-red-800 shadow" aria-hidden />
      {zoomed && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to the board"
          className="absolute right-1 top-0 z-10 flex h-10 w-10 items-center justify-center text-2xl leading-none text-[#2a1d14]/55 hover:text-[#2a1d14]"
        >
          ×
        </button>
      )}
      <div className={`h-full px-5 pb-4 pt-6 ${zoomed ? "overflow-y-auto overscroll-contain" : ""}`} style={{ touchAction: zoomed ? "pan-y" : undefined }}>
        {zoomed ? paper.full : paper.pinned}
      </div>
    </div>
  );
}
