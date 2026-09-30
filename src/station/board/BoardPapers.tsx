// The papers' content components live beside the hook that picks them; hot reload just reloads this file
/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState, type ReactNode } from "react";
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
  useTodayMovie,
  type ContentLoopItem,
} from "../data.ts";
import { createArcadeGames, normalizeMachineName } from "../../pages/Arcade/games";
import type { GoTo } from "../stops.ts";
import { paperStyle, serif } from "../style/theme.ts";

// The station board is the home page, and its papers are the content: a welcome (your
// ticket, coins and mail), the Scareathon, this week's challenge, the latest two
// announcements, and The Scareathon Post. They're flyers: each has a picture, in sepia,
// and some of them move, like the photographs in a wizard's newspaper. Pinned up, a flyer
// shows its picture and headline; tapping it brings you up close to read the rest.

export type Picture = { src: string; video?: string };

export type Paper = {
  id: string;
  kind: string; // the small label at the top, e.g. NOTICE
  title: string; // also painted on the board's own texture, for when the paper can't be drawn crisply
  pinned: ReactNode; // on the board
  full: ReactNode; // up close
  tint: string;
  picture?: Picture;
};

// A photograph printed on the flyer: sepia, softly vignetted, and moving if it's a film
function Photo({ picture, tall = false }: { picture: Picture; tall?: boolean }) {
  const sepia = { filter: "sepia(0.85) contrast(1.08) brightness(0.92) saturate(0.9)" };
  return (
    <div className={`relative w-full overflow-hidden bg-[#3a2a1a] ${tall ? "aspect-video" : "h-full"}`}>
      {picture.video ? (
        <video className="h-full w-full object-cover" style={sepia} src={picture.video} poster={picture.src} autoPlay muted loop playsInline />
      ) : (
        <img className="h-full w-full object-cover" style={sepia} src={picture.src} alt="" loading="lazy" draggable={false} />
      )}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_24px_rgba(40,24,8,0.7)]" />
    </div>
  );
}

// /game-recordings/Foo.mp4 → /game-recordings/stills/Foo.jpg
function stillFor(videoUrl: string) {
  const slash = videoUrl.lastIndexOf("/");
  return `${videoUrl.slice(0, slash)}/stills/${videoUrl.slice(slash + 1).replace(/\.mp4$/i, ".jpg")}`;
}

// One game from the arcade for the welcome flyer, a different one each day
function useSpotlightGame() {
  return useMemo(() => {
    const games = createArcadeGames().filter((game) => game.game && !game.special && game.videoUrl);
    const today = new Date();
    const pick = games[(today.getFullYear() * 400 + today.getMonth() * 31 + today.getDate()) % Math.max(games.length, 1)];
    return pick?.videoUrl ? { name: pick.name, picture: { src: stillFor(pick.videoUrl), video: pick.videoUrl } } : null;
  }, []);
}

function useGamePicture(name?: string | null): Picture | undefined {
  return useMemo(() => {
    if (!name) return undefined;
    const game = createArcadeGames().find((g) => normalizeMachineName(g.name) === normalizeMachineName(name));
    return game?.videoUrl ? { src: stillFor(game.videoUrl), video: game.videoUrl } : undefined;
  }, [name]);
}

const ink = "text-[#2a1d14]";
const quiet = "text-[#2a1d14]/70";
const action =
  "rounded-[2px] bg-[#1d2a3a] px-3 py-1.5 text-[15px] text-[#f2ead2] shadow-[1px_1px_0_rgba(0,0,0,0.4)] transition hover:bg-[#2a3b50]";
const link = "underline decoration-[#2a1d14]/40 underline-offset-4 hover:decoration-[#2a1d14]";

function Label({ children }: { children: ReactNode }) {
  return <p className={`text-[13px] font-semibold uppercase tracking-[0.18em] ${quiet}`}>{children}</p>;
}

function Headline({ children, big = false }: { children: ReactNode; big?: boolean }) {
  return (
    <h3 className={`${ink} ${big ? "text-[34px]" : "text-[26px]"} mt-1 leading-[1.05]`} style={serif}>
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
      {full && item.summary && <p className={`mt-2 text-[17px] leading-snug ${quiet}`}>{item.summary}</p>}
      {full && target && <p className={`mt-2 text-[17px] leading-snug ${ink}`}>{target}</p>}
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
  const spotlight = useSpotlightGame();
  return (
    <>
      <Label>Wayside Station</Label>
      <Headline big={full}>{signedIn ? `Welcome back${summary?.username ? `, ${summary.username}` : ""}.` : "Welcome, traveller."}</Headline>
      <p className={`mt-2 text-[17px] leading-snug ${quiet} ${full ? "" : "line-clamp-2"}`}>
        {signedIn
          ? "Your ticket's in order. Spend your coins at the kiosk, or see who's written."
          : "A horror film a night through October, and an arcade all year. Get a ticket at the kiosk to save scores and earn coins."}
      </p>
      {full && spotlight && (
        <p className={`mt-2 text-[15px] italic ${quiet}`}>
          Pictured: {spotlight.name.replace(/’/g, "'")}, tonight in the arcade.{" "}
          <button type="button" className={link} onClick={act(() => goTo("arcade", spotlight.name))}>
            Play it
          </button>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {signedIn ? (
          <>
            <button type="button" className={action} onClick={act(() => goTo("tickets", "shop"))}>
              {summary?.coinBalance != null ? `${summary.coinBalance.toLocaleString()} coins` : "Coins"}
            </button>
            <button type="button" className={action} onClick={act(() => goTo("mail", "letters"))}>
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
      <p className={`${ink} mt-1 ${full ? "text-5xl" : "text-3xl"} leading-none`} style={serif}>
        {isLive ? day : daysUntil}
        <span className="ml-2 align-middle text-base">{isLive ? "of 31" : daysUntil === 1 ? "day to go" : "days to go"}</span>
      </p>
      <p className={`mt-2 text-[17px] leading-snug ${quiet} ${full ? "" : "line-clamp-2"}`}>
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
  return (
    <>
      <Label>Notice · {formatShortDate(item.publishedAt) ?? "Latest"}</Label>
      <Headline big={full}>{item.title}</Headline>
      {item.summary && <p className={`mt-2 text-[17px] leading-snug ${quiet} ${full ? "" : "line-clamp-2"}`}>{item.summary}</p>}
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
        <p className={`mt-3 text-[17px] leading-snug ${quiet}`}>For ticket holders. Sign in at the kiosk to read the paper.</p>
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
          {(isLoading ? [] : posts.slice(0, 2)).map((post) => (
            <li key={post.id} className={`${ink} line-clamp-1 text-[17px] leading-snug`} style={serif}>
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
  const spotlight = useSpotlightGame();
  const challengePicture = useGamePicture(challenge?.gameName);
  const { data: movie } = useTodayMovie(isLive && signedIn);
  const { data: posts } = usePosts(signedIn);
  const postImage = strapiUrl(posts?.data?.find((post) => post.Image?.[0]?.url)?.Image?.[0]?.url);
  const NOTICE_PICTURES = ["/images/grave_bg.png", "/images/cave_bg.png"];

  const papers: Paper[] = [
    {
      id: "welcome",
      kind: "WELCOME",
      title: "WAYSIDE STATION",
      pinned: <Welcome signedIn={signedIn} goTo={goTo} full={false} />,
      full: <Welcome signedIn={signedIn} goTo={goTo} full />,
      tint: TINTS[0],
      picture: spotlight?.picture ?? { src: "/images/home_bg.png" },
    },
    {
      id: "scareathon",
      kind: "EVENT",
      title: isLive ? `SCAREATHON ${year}` : `SCAREATHON IN ${daysUntil} DAYS`,
      pinned: <Scareathon goTo={goTo} full={false} />,
      full: <Scareathon goTo={goTo} full />,
      tint: TINTS[1],
      picture: movie?.data?.lowResUrl ? { src: movie.data.lowResUrl } : { src: "/images/emptyTheater.jpg" },
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
      picture: challengePicture,
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
      picture: { src: strapiUrl(item.image?.url) ?? NOTICE_PICTURES[i] },
    })
  );
  papers.push({
    id: "post",
    kind: "THE POST",
    title: "THE SCAREATHON POST",
    pinned: <Post signedIn={signedIn} goTo={goTo} full={false} />,
    full: <Post signedIn={signedIn} goTo={goTo} full />,
    tint: TINTS[5],
    picture: { src: postImage ?? "/images/candleskull.gif" },
  });
  return papers.slice(0, 6);
}

// A paper as it hangs on the board. Tap it to look closer: the camera comes up to it and
// it shows everything it says (scrolling if there's more), usable where it hangs.
export function PinnedPaper({ paper, onOpen, onClose, zoomed = false }: { paper: Paper; onOpen: () => void; onClose: () => void; zoomed?: boolean }) {
  const picture = paper.picture;
  return (
    <div
      role={zoomed ? undefined : "button"}
      tabIndex={zoomed ? undefined : 0}
      aria-label={zoomed ? paper.title : `Look closer: ${paper.title}`}
      onClick={zoomed ? undefined : onOpen}
      onKeyDown={(event) => !zoomed && event.key === "Enter" && event.target === event.currentTarget && onOpen()}
      className={`relative h-full w-full overflow-hidden shadow-[3px_4px_0_rgba(0,0,0,0.45)] transition ${zoomed ? "" : "cursor-pointer hover:brightness-105"}`}
      style={paperStyle(paper.tint)}
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
      <div className={`flex h-full flex-col px-4 pb-3 pt-6 ${zoomed ? "overflow-y-auto overscroll-contain" : ""}`} style={{ touchAction: zoomed ? "pan-y" : undefined }}>
        {picture && (zoomed ? <div className="mb-3 shrink-0"><Photo picture={picture} tall /></div> : <div className="mb-2 h-[42%] shrink-0"><Photo picture={{ src: picture.src }} /></div>)}
        <div className={zoomed ? "" : "min-h-0 flex-1 overflow-hidden"}>{zoomed ? paper.full : paper.pinned}</div>
      </div>
    </div>
  );
}
