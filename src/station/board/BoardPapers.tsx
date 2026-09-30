// The papers' content components live beside the hook that picks them; hot reload just reloads this file
/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { BlocksRenderer } from "@strapi/blocks-react-renderer";
import type { BlocksContent } from "@strapi/blocks-react-renderer";
import {
  challengeTarget,
  formatShortDate,
  needsSignIn,
  strapiUrl,
  useContentLoop,
  usePosts,
  useRewardStatus,
  useSummary,
  type ContentLoopItem,
} from "../data.ts";
import { createArcadeGames, normalizeMachineName } from "../../pages/Arcade/games";
import type { GoTo } from "../stops.ts";
import { PAPER_GRAIN, pixel, serif, typewriter } from "../style/theme.ts";

// The station board is the home page, and its papers are the content. Each kind of paper
// looks like what it is, so they read at a glance from across the platform:
//   the welcome   - a railway company notice: ruled border, centred, "By order"
//   a challenge   - an arcade handbill: the game's picture and colour, a stamp, the score
//   a notice      - a newspaper cutting: dateline, headline, a column of text, a photo
//   the Post      - the Scareathon Post's front page
// Pictures are sepia, and the games' move when you're up close, like the photographs in
// a wizard's newspaper. Tap a paper to come up close and read the rest.

export type Picture = { src: string; video?: string };

export type Paper = {
  id: string;
  kind: string; // the small label painted on the board's stand-in texture, e.g. NOTICE
  title: string; // also painted on the stand-in, for when the paper can't be drawn crisply
  pinned: ReactNode; // on the board
  full: ReactNode; // up close
  tint: string;
  // How the paper itself is cut and printed; its contents bring their own padding
  sheet?: CSSProperties;
};

const SEPIA = "sepia(0.85) contrast(1.08) brightness(0.92) saturate(0.9)";

// A photograph: sepia, softly vignetted, and moving if it's a film (and `moving`)
function Photo({ picture, moving = false, className = "", fade }: { picture: Picture; moving?: boolean; className?: string; fade?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#3a2a1a] ${className}`}>
      {moving && picture.video ? (
        <video className="h-full w-full object-cover" style={{ filter: SEPIA }} src={picture.video} poster={picture.src} autoPlay muted loop playsInline />
      ) : (
        <img className="h-full w-full object-cover" style={{ filter: SEPIA }} src={picture.src} alt="" loading="lazy" draggable={false} />
      )}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_24px_rgba(40,24,8,0.7)]" />
      {fade && <div className="pointer-events-none absolute inset-0" style={{ background: fade }} />}
    </div>
  );
}

// /game-recordings/Foo.mp4 → /game-recordings/stills/Foo.jpg
function stillFor(videoUrl: string) {
  const slash = videoUrl.lastIndexOf("/");
  return `${videoUrl.slice(0, slash)}/stills/${videoUrl.slice(slash + 1).replace(/\.mp4$/i, ".jpg")}`;
}

type GameCard = { name: string; color: string; picture: Picture };

// One game from the arcade for the welcome, a different one each day
function useSpotlightGame(): GameCard | null {
  return useMemo(() => {
    const games = createArcadeGames().filter((game) => game.game && !game.special && game.videoUrl);
    const today = new Date();
    const pick = games[(today.getFullYear() * 400 + today.getMonth() * 31 + today.getDate()) % Math.max(games.length, 1)];
    return pick?.videoUrl ? { name: pick.name, color: pick.cartridge.color, picture: { src: stillFor(pick.videoUrl), video: pick.videoUrl } } : null;
  }, []);
}

function useGame(name?: string | null): GameCard | null {
  return useMemo(() => {
    if (!name) return null;
    const game = createArcadeGames().find((g) => normalizeMachineName(g.name) === normalizeMachineName(name));
    return game?.videoUrl ? { name: game.name, color: game.cartridge.color, picture: { src: stillFor(game.videoUrl), video: game.videoUrl } } : null;
  }, [name]);
}

const ink = "text-[#2a1d14]";
const quiet = "text-[#2a1d14]/70";
const action =
  "rounded-[2px] bg-[#1d2a3a] px-3 py-1.5 text-[15px] text-[#f2ead2] shadow-[1px_1px_0_rgba(0,0,0,0.4)] transition hover:bg-[#2a3b50]";
const link = "underline decoration-[#2a1d14]/40 underline-offset-4 hover:decoration-[#2a1d14]";

// Buttons on a paper act without also bringing you up to it
const act = (fn: () => void) => (event: React.MouseEvent) => {
  event.stopPropagation();
  fn();
};

// A small ticket, and an envelope: the welcome's buttons, drawn rather than written
function TicketIcon() {
  return (
    <svg viewBox="0 0 24 16" className="h-5 w-7" aria-hidden>
      <path d="M1 3h22v3.2a1.8 1.8 0 0 0 0 3.6V13H1V9.8a1.8 1.8 0 0 0 0-3.6z" fill="#efe3c8" stroke="#efe3c8" strokeWidth="1" />
      <path d="M8 3.5v9" stroke="#1d2a3a" strokeWidth="1.2" strokeDasharray="1.4 1.2" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden>
      <circle cx="8" cy="4.5" r="3.2" fill="#efe3c8" />
      <path d="M2 15.5c0-3.6 2.7-6 6-6s6 2.4 6 6z" fill="#efe3c8" />
    </svg>
  );
}
function EnvelopeIcon() {
  return (
    <svg viewBox="0 0 24 16" className="h-5 w-7" aria-hidden>
      <rect x="1.5" y="2" width="21" height="12" fill="#efe3c8" />
      <path d="M2 2.5l10 7 10-7" fill="none" stroke="#1d2a3a" strokeWidth="1.4" />
    </svg>
  );
}

// ---- The welcome: a long railway company notice across the top of the board

function Welcome({ signedIn, goTo, full }: { signedIn: boolean; goTo: GoTo; full: boolean }) {
  const { data: summary } = useSummary();
  const spotlight = useSpotlightGame();
  const button =
    "flex flex-1 items-center justify-center gap-2 rounded-[2px] bg-[#1d2a3a] px-3 py-2 text-[18px] leading-none text-[#f2ead2] shadow-[1px_1px_0_rgba(0,0,0,0.4)] transition hover:bg-[#2a3b50]";
  return (
    <div className={`m-1.5 border-[3px] border-double border-[#2a1d14]/70 px-4 py-2 ${ink} ${full ? "" : "h-[calc(100%-0.75rem)]"}`}>
      <p className="text-[12px] uppercase tracking-[0.35em]" style={serif}>
        Wayside Station <span className="opacity-60">· passenger notice</span>
      </p>
      <p className={`mt-0.5 truncate leading-none ${full ? "text-[38px]" : "text-[32px]"}`} style={serif}>
        {signedIn ? `Welcome back${summary?.username ? `, ${summary.username}` : ""}` : "Welcome, traveller"}
      </p>
      <div className="mt-2 flex gap-2">
        {signedIn ? (
          <>
            <button type="button" className={button} aria-label="Tickets: the item shop" title="Tickets" onClick={act(() => goTo("tickets", "shop"))}>
              <TicketIcon />
              {summary?.coinBalance != null ? summary.coinBalance.toLocaleString() : "…"}
            </button>
            <button type="button" className={button} aria-label="Inbox" title="Inbox" onClick={act(() => goTo("mail", "letters"))}>
              <EnvelopeIcon />
              {summary?.unreadCount ?? 0}
            </button>
            <button type="button" className={button} aria-label="Your locker" title="Your locker" onClick={act(() => goTo("lockers"))}>
              <PersonIcon />
            </button>
          </>
        ) : (
          <>
            <p className={`flex-1 self-center text-[15px] leading-snug ${quiet}`}>A horror film a night through October, and an arcade all year.</p>
            <button type="button" className={`${button} flex-none`} onClick={act(() => goTo("tickets"))}>
              Sign in
            </button>
          </>
        )}
      </div>
      {full && spotlight && (
        <div className="mt-3 border-t border-[#2a1d14]/25 pt-3">
          <p className="text-[12px] uppercase tracking-[0.25em] opacity-60">Tonight in the arcade</p>
          <Photo picture={spotlight.picture} moving className="mt-2 aspect-video w-full" />
          <p className="mt-2 text-[16px]">
            {spotlight.name.replace(/’/g, "'")}.{" "}
            <button type="button" className={link} onClick={act(() => goTo("arcade", spotlight.name))}>
              Play it
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

// ---- A challenge: an arcade handbill

function Challenge({ item, game, signedIn, goTo, full }: { item: ContentLoopItem; game: GameCard | null; signedIn: boolean; goTo: GoTo; full: boolean }) {
  const { data: reward } = useRewardStatus(item, signedIn);
  const target = challengeTarget(item);
  const colour = game?.color ?? "#e0433b";
  const bigNumber = item.targetMetricValue != null ? item.targetMetricValue.toLocaleString() : null;
  return (
    <div className={`flex h-full flex-col ${ink}`}>
      <div className="relative shrink-0" style={{ height: full ? undefined : "46%" }}>
        {game ? <Photo picture={game.picture} moving={full} className={full ? "aspect-video w-full" : "h-full w-full"} /> : <div className="h-full w-full bg-[#1a1a1a]" />}
        {/* the stamp */}
        <p className="absolute right-2 top-2 rotate-[8deg] border-[3px] border-[#b3261e] bg-[#efe3c8]/85 px-1.5 text-[12px] uppercase leading-tight tracking-[0.15em] text-[#b3261e]" style={pixel}>
          Weekly
          <br />
          challenge
        </p>
      </div>
      <div className="h-2.5 shrink-0" style={{ background: colour }} />
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[20px] uppercase leading-none" style={pixel}>
            {(item.gameName ?? item.title).replace(/[‘’]/g, "'")}
          </p>
          {bigNumber && (
            <p className="shrink-0 text-[13px] uppercase" style={pixel}>
              score <span className="text-[26px] leading-none" style={{ color: colour }}>{bigNumber}</span>
            </p>
          )}
        </div>
        <p className="mt-1 text-[13px] opacity-70">
          {item.startsAt && item.endsAt ? `${formatShortDate(item.startsAt)} – ${formatShortDate(item.endsAt)} · ` : ""}
          {item.points || 1} point{item.rewardCoins ? ` · ${item.rewardCoins.toLocaleString()} tickets` : ""}
          {reward?.data?.alreadyClaimed ? <strong className="ml-2 text-emerald-800">✓ Done</strong> : null}
        </p>
        {full && (
          <>
            <p className="mt-3 text-[20px] leading-tight" style={serif}>
              {item.title}
            </p>
            {item.summary && <p className={`mt-2 text-[17px] leading-snug ${quiet}`}>{item.summary}</p>}
            {target && <p className="mt-2 text-[17px] leading-snug">{target}</p>}
          </>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {item.gameName && (
            <button type="button" className={action} onClick={act(() => goTo("arcade", item.gameName ?? undefined))}>
              Play
            </button>
          )}
          {!signedIn && item.rewardCoins && item.isActive !== false ? (
            <button type="button" className={action} onClick={act(() => goTo("tickets"))}>
              Sign in to earn
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---- A notice: a cutting from a newspaper

function Clipping({ item, full, picture }: { item: ContentLoopItem; full: boolean; picture: Picture }) {
  const date = formatShortDate(item.publishedAt);
  return (
    <div className={`h-full px-4 pb-3 pt-5 ${ink}`} style={serif}>
      <p className="border-b border-[#2a1d14]/40 pb-0.5 text-[11px] uppercase tracking-[0.3em] opacity-70">Station notices</p>
      <p className={`mt-1.5 font-bold leading-[1.02] ${full ? "text-[30px]" : "text-[23px]"}`}>{item.title}</p>
      <div className="mt-2 text-[15px] leading-snug" style={{ ...typewriter, textAlign: "justify", hyphens: "auto" }}>
        <Photo picture={picture} className={`float-right mb-1 ml-2 ${full ? "h-32 w-40" : "h-[4.5rem] w-24"}`} />
        <span className="font-bold uppercase">Wayside{date ? `, ${date}` : ""}. — </span>
        <span className={full ? "" : "line-clamp-4"}>{item.summary}</span>
      </div>
    </div>
  );
}

// ---- The Post: its front page

function Post({ signedIn, goTo, full, picture }: { signedIn: boolean; goTo: GoTo; full: boolean; picture: Picture }) {
  const { data, isLoading, error } = usePosts(signedIn);
  const [open, setOpen] = useState<number | null>(null);
  const posts = data?.data ?? [];
  const masthead = (
    <div className="border-b-[3px] border-double border-[#2a1d14]/70 pb-1 text-center">
      <p className="text-[10px] uppercase tracking-[0.3em] opacity-60">Est. 2023 · One penny</p>
      <p className={`${ink} ${full ? "text-[34px]" : "text-[27px]"} leading-none`} style={{ ...serif, fontVariant: "small-caps" }}>
        The Scareathon Post
      </p>
    </div>
  );
  if (!signedIn || needsSignIn(error)) {
    return (
      <div className={`h-full px-4 pb-3 pt-5 ${ink}`}>
        {masthead}
        <Photo picture={picture} className="mt-2 h-24 w-full" />
        <p className={`mt-2 text-[16px] leading-snug ${quiet}`}>For passengers. Sign in at the counter to read the paper.</p>
        <button type="button" className={`${action} mt-2`} onClick={act(() => goTo("tickets"))}>
          Sign in
        </button>
      </div>
    );
  }
  if (!full) {
    return (
      <div className={`h-full px-4 pb-3 pt-5 ${ink}`}>
        {masthead}
        <div className="mt-2 flex gap-2">
          <Photo picture={picture} className="h-24 w-24 shrink-0" />
          <ul className="min-w-0 space-y-1.5" style={serif}>
            {(isLoading ? [] : posts.slice(0, 3)).map((post) => (
              <li key={post.id} className="line-clamp-2 border-b border-[#2a1d14]/15 pb-1 text-[16px] leading-tight">
                {post.Title}
              </li>
            ))}
            {isLoading && <li className={quiet}>Printing…</li>}
          </ul>
        </div>
      </div>
    );
  }
  return (
    <div className={`px-4 pb-3 pt-5 ${ink}`}>
      {masthead}
      {posts.map((post) => {
        const expanded = open === post.id;
        const image = strapiUrl(post.Image?.[0]?.url);
        return (
          <article key={post.id} className="border-b border-[#2a1d14]/20 py-4">
            <p className={`text-[12px] uppercase tracking-widest ${quiet}`}>{new Date(post.publishedAt).toLocaleDateString()}</p>
            <h4 className="mt-1 text-[22px] leading-tight" style={serif}>
              {post.Title}
            </h4>
            {image && <Photo picture={{ src: image }} className="mt-3 max-h-60 w-full" />}
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
                <button type="button" onClick={() => setOpen(expanded ? null : post.id)} className={`mt-1 text-sm ${link}`}>
                  {expanded ? "Less" : "Read on"}
                </button>
              </>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

// ---- Which papers are up

const NOTICE_PICTURES = ["/images/grave_bg.png", "/images/cave_bg.png"];

export function useBoardPapers(signedIn: boolean, goTo: GoTo): Paper[] {
  const { data: items = [] } = useContentLoop();
  const challenge = items.find((item) => item.type === "weekly_challenge");
  const notices = items.filter((item) => item.type === "announcement").slice(0, 2);
  const challengeGame = useGame(challenge?.gameName);
  const { data: posts } = usePosts(signedIn);
  const postImage = strapiUrl(posts?.data?.find((post) => post.Image?.[0]?.url)?.Image?.[0]?.url);
  const postPicture: Picture = { src: postImage ?? "/images/candleskull.gif" };

  const papers: Paper[] = [
    {
      id: "welcome",
      kind: "NOTICE",
      title: "WAYSIDE STATION",
      pinned: <Welcome signedIn={signedIn} goTo={goTo} full={false} />,
      full: <Welcome signedIn={signedIn} goTo={goTo} full />,
      tint: "#d9cba6",
    },
  ];
  if (challenge) {
    papers.push({
      id: challenge.id,
      kind: "CHALLENGE",
      title: challenge.title,
      pinned: <Challenge item={challenge} game={challengeGame} signedIn={signedIn} goTo={goTo} full={false} />,
      full: <Challenge item={challenge} game={challengeGame} signedIn={signedIn} goTo={goTo} full />,
      tint: "#dccd9f",
    });
  }
  notices.forEach((item, i) => {
    const picture = { src: strapiUrl(item.image?.url) ?? NOTICE_PICTURES[i] };
    papers.push({
      id: item.id,
      kind: "NOTICE",
      title: item.title,
      pinned: <Clipping item={item} full={false} picture={picture} />,
      full: <Clipping item={item} full picture={picture} />,
      tint: "#cfc3a4",
      // Cut out of a newspaper, not quite straight
      sheet: { clipPath: "polygon(0 1%, 3% 0, 97% 1.5%, 100% 0, 99% 98%, 96% 100%, 4% 99%, 0 100%)" },
    });
  });
  papers.push({
    id: "post",
    kind: "THE POST",
    title: "THE SCAREATHON POST",
    pinned: <Post signedIn={signedIn} goTo={goTo} full={false} picture={postPicture} />,
    full: <Post signedIn={signedIn} goTo={goTo} full picture={postPicture} />,
    tint: "#d6c9a8",
  });
  return papers.slice(0, 5);
}

// A paper as it hangs on the board. Tap it to look closer: the camera comes up to it and
// it shows everything it says (scrolling if there's more), usable where it hangs.
export function PinnedPaper({ paper, onOpen, zoomed = false }: { paper: Paper; onOpen: () => void; zoomed?: boolean }) {
  return (
    <div
      role={zoomed ? undefined : "button"}
      tabIndex={zoomed ? undefined : 0}
      aria-label={zoomed ? paper.title : `Look closer: ${paper.title}`}
      onClick={zoomed ? undefined : onOpen}
      onKeyDown={(event) => !zoomed && event.key === "Enter" && event.target === event.currentTarget && onOpen()}
      className={`relative h-full w-full overflow-hidden shadow-[3px_4px_0_rgba(0,0,0,0.45)] transition ${zoomed ? "" : "cursor-pointer hover:brightness-105"}`}
      style={{ backgroundColor: paper.tint, backgroundImage: PAPER_GRAIN, ...typewriter, ...paper.sheet }}
    >
      <span className="absolute left-1/2 top-1.5 z-10 h-3 w-3 -translate-x-1/2 rounded-full bg-red-800 shadow" aria-hidden />
      <div
        className={`h-full ${zoomed ? "overflow-y-auto overscroll-contain" : ""}`}
        style={{ touchAction: zoomed ? "none" : undefined }}
        onTouchStart={(event) => {
          if (zoomed) (event.currentTarget as HTMLElement).dataset.touchY = String(event.touches[0].clientY);
        }}
        onTouchMove={(event) => {
          if (!zoomed) return;
          const el = event.currentTarget as HTMLElement;
          const last = Number(el.dataset.touchY ?? event.touches[0].clientY);
          const y = event.touches[0].clientY;
          // The paper is drawn smaller than its HTML; scroll by the drawn distance
          const scale = el.getBoundingClientRect().height / el.offsetHeight || 1;
          el.scrollTop += (last - y) / scale;
          el.dataset.touchY = String(y);
        }}
      >
        {zoomed ? paper.full : paper.pinned}
      </div>
    </div>
  );
}
