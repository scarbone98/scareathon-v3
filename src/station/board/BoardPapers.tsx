// The papers' content components live beside the hook that picks them; hot reload just reloads this file
/* eslint-disable react-refresh/only-export-components */
import Ticket from "../../components/TicketIcon";
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from "react";
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
import { createArcadeGames, normalizeMachineName } from "../../pages/Arcade/games";
import type { GoTo } from "../stops.ts";
import { AvatarView } from "../../components/avatar/AvatarView";
import { useAvatarLook } from "../things/Belongings.tsx";
import { useMyBanner } from "../things/Banners.tsx";
import { ON_BANNER_TEXT, bannerStyle } from "../banners.ts";
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
  // Read where it hangs; there's nothing more to come up close for (the welcome)
  noZoom?: boolean;
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
// (a big one, for a challenge's Play)
const bigAction = "rounded-[2px] bg-[#1d2a3a] px-7 py-2.5 text-[22px] text-[#f2ead2] shadow-[1px_1px_0_rgba(0,0,0,0.4)] transition hover:bg-[#2a3b50]";
// Links from the CMS: web pages and the site's own paths only (never javascript: and the like)
function safeHref(url: string) {
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}
const link = "underline decoration-[#2a1d14]/40 underline-offset-4 hover:decoration-[#2a1d14]";

// Buttons on a paper act without also bringing you up to it
const act = (fn: () => void) => (event: React.MouseEvent) => {
  event.stopPropagation();
  fn();
};

// A small ticket, and an envelope: the welcome's buttons, drawn rather than written
function TicketIcon() {
  return (
    <span className="text-[#efe3c8]">
      <Ticket />
    </span>
  );
}
function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden>
      <path
        fill="#efe3c8"
        fillRule="evenodd"
        d="M6.6 1h2.8l.4 1.9 1.3.6 1.7-1 2 2-1 1.7.6 1.3 1.9.4v2.8l-1.9.4-.6 1.3 1 1.7-2 2-1.7-1-1.3.6-.4 1.9H6.6l-.4-1.9-1.3-.6-1.7 1-2-2 1-1.7-.6-1.3L0 9.4V6.6l1.9-.4.6-1.3-1-1.7 2-2 1.7 1 1.3-.6zM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"
      />
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

// A button cut like a ticket: notched at both ends, with a perforated line inside
const ticketCut: CSSProperties = {
  WebkitMask:
    "radial-gradient(circle at 0 50%, transparent 7px, #000 7.5px) left / 51% 100% no-repeat, radial-gradient(circle at 100% 50%, transparent 7px, #000 7.5px) right / 51% 100% no-repeat",
  mask: "radial-gradient(circle at 0 50%, transparent 7px, #000 7.5px) left / 51% 100% no-repeat, radial-gradient(circle at 100% 50%, transparent 7px, #000 7.5px) right / 51% 100% no-repeat",
};

function TicketButton({ label, onClick, children }: { label: string; onClick: (event: React.MouseEvent) => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex-1 bg-[#1d2a3a] p-[3px] transition hover:bg-[#2a3b50]" style={ticketCut}>
      <span className="flex h-full items-center justify-center gap-1.5 border border-dashed border-[#efe3c8]/45 px-4 py-1.5 text-[18px] leading-none text-[#f2ead2]" style={pixel}>
        {children}
      </span>
    </button>
  );
}

// You on the notice: an avatar's frame is 32 wide, drawn here at five times size
const AVATAR_WIDE = 32;
const AVATAR_SCALE = 5;

function Welcome({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const { data: summary } = useSummary();
  const look = useAvatarLook(signedIn);
  // Signed in with a banner up, the notice is your banner (as your row on the scoreboard is):
  // the lettering goes straight onto it, light and outlined, in place of ink on paper
  const banner = useMyBanner(signedIn);
  const onBanner = bannerStyle(banner);
  // How much of your picture's width to show: the kid, and out as far as anything you have on
  // reaches (a pet at your heels, wings), so none of it is cut off
  const shown = (look?.outfit ?? []).reduce<[number, number]>(
    ([from, to], { item }) => item.parts.reduce<[number, number]>(([a, b], part) => [Math.max(0, Math.min(a, part.x - 1)), Math.min(AVATAR_WIDE, Math.max(b, part.x + part.w + 1))], [from, to]),
    [6, 26]
  );
  return (
    <div
      className={
        onBanner
          ? "flex h-full items-stretch gap-3 border-[3px] border-double border-[#f2ead2]/55 px-6 text-[#f2ead2]"
          : `m-1 flex h-[calc(100%-0.5rem)] items-stretch gap-3 border-[3px] border-double border-[#2a1d14]/70 px-5 ${ink}`
      }
      style={onBanner ? { ...onBanner, textShadow: ON_BANNER_TEXT } : undefined}
    >
      {/* You, as you look (moving, if your body has an idle), standing in for "your locker":
          down the notice's whole height, five times size, the empty sky over your head trimmed off */}
      {signedIn && (
        <button
          type="button"
          aria-label="Your locker"
          title="Your locker"
          onClick={act(() => goTo("lockers"))}
          className="-ml-2 flex shrink-0 items-end justify-start overflow-hidden transition hover:brightness-110 active:translate-y-px"
          style={{ width: (shown[1] - shown[0]) * AVATAR_SCALE }}
        >
          {look ? (
            <span className="shrink-0 translate-y-[10px]" style={{ marginLeft: -shown[0] * AVATAR_SCALE }}>
              <AvatarView look={look} height={240} label="You" />
            </span>
          ) : null}
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <p className="truncate text-[28px] leading-none" style={serif}>
            {signedIn ? `Welcome back${summary?.username ? `, ${summary.username}` : ""}` : "Welcome, traveller"}
          </p>
        </div>
        <div className="flex gap-2">
          {signedIn ? (
            <>
              <TicketButton label="Inbox" onClick={act(() => goTo("mail", "letters"))}>
                {summary?.unreadCount ?? 0}×<EnvelopeIcon />
              </TicketButton>
              <TicketButton label="Tickets: the item shop" onClick={act(() => goTo("tickets", "shop"))}>
                {summary?.coinBalance != null ? summary.coinBalance.toLocaleString() : "…"}×<TicketIcon />
              </TicketButton>
              <TicketButton label="Settings" onClick={act(() => goTo("mail", "register"))}>
                <GearIcon />
              </TicketButton>
            </>
          ) : (
            <TicketButton label="Sign in" onClick={act(() => goTo("tickets"))}>
              Sign in
            </TicketButton>
          )}
        </div>
      </div>
    </div>
  );
}


// ---- The arcade post: this week's challenge, and the game on tonight

function SpotlightHandbill({ spotlight, goTo, full }: { spotlight: GameCard; goTo: GoTo; full: boolean }) {
  return (
    <div className={`flex h-full flex-col ${ink}`}>
      <Photo picture={spotlight.picture} moving={full} className={full ? "aspect-video w-full" : "h-[52%] w-full shrink-0"} />
      <div className="h-2.5 shrink-0" style={{ background: spotlight.color }} />
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-2">
        <p className="text-[12px] uppercase tracking-[0.25em] opacity-70">Tonight in the arcade</p>
        <p className="mt-1 text-[22px] uppercase leading-none" style={pixel}>
          {spotlight.name.replace(/’/g, "'")}
        </p>
        <div className="mt-auto pt-2">
          <button type="button" className={action} onClick={act(() => goTo("arcade", spotlight.name))}>
            Play
          </button>
        </div>
      </div>
    </div>
  );
}

function ArcadePost({ challenge, game, spotlight, signedIn, goTo, full }: { challenge?: ContentLoopItem; game: GameCard | null; spotlight: GameCard | null; signedIn: boolean; goTo: GoTo; full: boolean }) {
  if (!challenge) return spotlight ? <SpotlightHandbill spotlight={spotlight} goTo={goTo} full={full} /> : null;
  return (
    <>
      <Challenge item={challenge} game={game} signedIn={signedIn} goTo={goTo} full={full} />
      {full && spotlight && (
        <div className="mx-4 mb-4 border-t border-[#2a1d14]/25 pt-3">
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
    </>
  );
}

// ---- The event post: the Scareathon, as a film poster

function EventPost({ goTo, full, picture }: { goTo: GoTo; full: boolean; picture: Picture }) {
  const { isLive, daysUntil, year, day } = eventState();
  const count = isLive ? `Night ${day} of 31` : `${daysUntil} ${daysUntil === 1 ? "day" : "days"} to go`;
  return (
    <div className="relative flex h-full min-h-full flex-col bg-[#1a0f08] text-[#f2e2c2]">
      <Photo picture={picture} className={full ? "aspect-[4/3] w-full" : "absolute inset-0"} fade="linear-gradient(to bottom, rgba(26,15,8,0.1) 30%, rgba(26,15,8,0.92) 78%)" />
      <div className={`${full ? "" : "absolute inset-x-0 bottom-0"} px-4 pb-3 pt-2 text-center`}>
        <p className="text-[12px] uppercase tracking-[0.4em] opacity-80">October {year}</p>
        <p className="text-[42px] uppercase leading-[0.9] text-[#ffb070] [text-shadow:0_2px_0_#000]" style={serif}>
          Scare-athon
        </p>
        <p className="mt-1 inline-block -rotate-2 border-2 border-[#ffb070] px-2 text-[14px] uppercase tracking-[0.2em] text-[#ffb070]" style={pixel}>
          {count}
        </p>
        {full && (
          <p className="mt-3 text-left text-[17px] leading-snug" style={typewriter}>
            {isLive
              ? "One horror film every night through Halloween. Watch along, finish the weekly challenges, and climb the Scareboard."
              : "Starting October 1: a horror film every night through Halloween, weekly challenges, and a Scareboard for the whole month."}{" "}
            Watch the night's film for a point, finish the week's challenge for another, and wear a costume on Halloween for one more.
          </p>
        )}
        {/* Stacked, and big enough for a thumb */}
        <div className="mx-auto mt-3 flex max-w-[16rem] flex-col gap-2">
          <button type="button" className={`${action} w-full py-3 text-[19px]`} onClick={act(() => goTo("events", "tonight"))}>
            {isLive ? "Tonight's film" : "How it works"}
          </button>
          <button type="button" className={`${action} w-full py-3 text-[19px]`} onClick={act(() => goTo("departures"))}>
            Scoreboard
          </button>
          {full && (
            <button type="button" className={action} onClick={act(() => goTo("events", "calendar"))}>
              Calendar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- A challenge: an arcade handbill

// Kept short: the game, what to do in a few words, what it pays, and a big Play button
function Challenge({ item, game, signedIn, goTo, full }: { item: ContentLoopItem; game: GameCard | null; signedIn: boolean; goTo: GoTo; full: boolean }) {
  const { data: reward } = useRewardStatus(item, signedIn);
  const target = challengeTarget(item);
  const colour = game?.color ?? "#e0433b";
  const bigNumber = item.targetMetricValue != null ? item.targetMetricValue.toLocaleString() : null;
  const task = bigNumber ? (item.verificationType === "arcade_runs" ? `Play ${bigNumber} runs` : `Score ${bigNumber}`) : null;
  return (
    <div className={`flex h-full flex-col ${ink}`}>
      <div className="relative shrink-0" style={{ height: full ? undefined : "46%" }}>
        {game ? <Photo picture={game.picture} moving={full} className={full ? "aspect-video w-full" : "h-full w-full"} /> : <div className="h-full w-full bg-[#1a1a1a]" />}
        {/* the stamp */}
        <p className="absolute right-2 top-2 rotate-[8deg] border-[4px] border-[#b3261e] bg-[#efe3c8]/95 px-2.5 py-1 text-center text-[22px] uppercase leading-[1.05] tracking-[0.12em] shadow-[2px_3px_0_rgba(0,0,0,0.35)] text-[#b3261e]" style={pixel}>
          {item.type === "daily_challenge" ? "Daily" : "Weekly"}
          <br />
          challenge
        </p>
      </div>
      <div className="h-2.5 shrink-0" style={{ background: colour }} />
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-2">
        <p className="truncate text-[26px] uppercase leading-none" style={pixel}>
          {(item.gameName ?? item.title).replace(/[‘’]/g, "'")}
        </p>
        {task && (
          <p className="mt-1.5 text-[24px] leading-none" style={serif}>
            {task}
          </p>
        )}
        <p className="mt-1.5 text-[16px] opacity-75">
          {[
            item.type === "daily_challenge" ? "Today" : item.startsAt && item.endsAt ? `${formatShortDate(item.startsAt)} – ${formatShortDate(item.endsAt)}` : null,
            // (a daily challenge isn't a Scareboard point)
            item.points ? `${item.points} point${item.points === 1 ? "" : "s"}` : null,
            item.rewardCoins ? `${item.rewardCoins.toLocaleString()} tickets` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
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
            <button type="button" className={bigAction} onClick={act(() => goTo("arcade", item.gameName ?? undefined))}>
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

// ---- Today's challenges: two to a handbill, one over the other

// One of the two: its game's picture to the left, and beside it the game, what to do, what
// it pays and Play
function DailyRow({ item, signedIn, goTo }: { item: ContentLoopItem; signedIn: boolean; goTo: GoTo }) {
  const game = useGame(item.gameName);
  const { data: reward } = useRewardStatus(item, signedIn);
  const done = Boolean(reward?.data?.alreadyClaimed);
  const runs = item.targetMetricValue != null ? item.targetMetricValue.toLocaleString() : null;
  const task = runs ? (item.verificationType === "arcade_runs" ? `Play ${runs} runs` : `Score ${runs}`) : null;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative w-[40%] shrink-0">{game ? <Photo picture={game.picture} moving={false} className="h-full w-full" /> : <div className="h-full w-full bg-[#1a1a1a]" />}</div>
      <div className="w-2 shrink-0" style={{ background: game?.color ?? "#e0433b" }} />
      <div className="flex min-w-0 flex-1 flex-col px-3 py-1.5">
        <p className="truncate text-[20px] uppercase leading-none" style={pixel}>
          {(item.gameName ?? item.title).replace(/[‘’]/g, "'")}
        </p>
        {task && (
          <p className="mt-1 text-[19px] leading-none" style={serif}>
            {task}
          </p>
        )}
        <p className="mt-1 text-[14px] leading-none opacity-75">
          {item.rewardCoins ? `${item.rewardCoins.toLocaleString()} tickets` : null}
          {done ? <strong className="ml-2 text-emerald-800">✓ Done</strong> : null}
        </p>
        <div className="mt-auto pt-1">
          {item.gameName && (
            <button type="button" className={action} onClick={act(() => goTo("arcade", item.gameName ?? undefined))}>
              Play
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DailyChallenges({ items, signedIn, goTo }: { items: ContentLoopItem[]; signedIn: boolean; goTo: GoTo }) {
  return (
    <div className={`flex h-full flex-col ${ink}`}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b-[3px] border-[#b3261e] px-3 py-1">
        <p className="text-[19px] uppercase leading-none tracking-[0.1em] text-[#b3261e]" style={pixel}>
          Daily challenges
        </p>
        {signedIn ? (
          <p className="text-[13px] uppercase tracking-[0.15em] opacity-70">Today</p>
        ) : (
          <button type="button" className="text-[13px] uppercase tracking-[0.1em] underline underline-offset-2" onClick={act(() => goTo("tickets"))}>
            Sign in to earn
          </button>
        )}
      </div>
      {items.map((item, i) => (
        <Fragment key={item.id}>
          {i > 0 && <div className="h-px shrink-0 bg-[#2a1d14]/40" />}
          <DailyRow item={item} signedIn={signedIn} goTo={goTo} />
        </Fragment>
      ))}
    </div>
  );
}

// ---- A notice: a cutting from a newspaper

function Clipping({ item, full, picture }: { item: ContentLoopItem; full: boolean; picture: Picture }) {
  const date = formatShortDate(item.publishedAt);
  return (
    <div className={`${full ? "min-h-full" : "h-full"} px-4 pb-3 pt-5 ${ink}`} style={serif}>
      <p className="border-b border-[#2a1d14]/40 pb-0.5 text-[11px] uppercase tracking-[0.3em] opacity-70">Station notices</p>
      <p className="mt-1.5 text-[23px] font-bold leading-[1.02]">{item.title}</p>
      <div className="mt-2 text-[15px] leading-snug" style={{ ...typewriter, textAlign: "justify", hyphens: "auto" }}>
        <Photo picture={picture} className="float-right mb-1 ml-2 h-[4.5rem] w-24" />
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
      <p className={`${ink} text-[27px] leading-none`} style={{ ...serif, fontVariant: "small-caps" }}>
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
  const story = full ? posts.find((post) => post.id === open) : undefined;
  // Up close it's the same front page (coming closer changes nothing on it); a headline,
  // tapped, turns to its story
  if (story) {
    const image = strapiUrl(story.Image?.[0]?.url);
    return (
      <div className={`px-4 pb-3 pt-5 ${ink}`}>
        {masthead}
        <button type="button" onClick={() => setOpen(null)} className={`mt-2 text-sm ${link}`}>
          ← The front page
        </button>
        <p className={`mt-2 text-[12px] uppercase tracking-widest ${quiet}`}>{new Date(story.publishedAt).toLocaleDateString()}</p>
        <h4 className="mt-1 text-[22px] leading-tight" style={serif}>
          {story.Title}
        </h4>
        {image && <Photo picture={{ src: image }} className="mt-3 max-h-60 w-full" />}
        {story.Content ? (
          <div className="prose prose-sm mt-2 max-w-none text-[#2a1d14]">
            <BlocksRenderer
              content={story.Content as BlocksContent}
              blocks={{
                list: ({ children }) => <ul className="list-inside list-disc">{children}</ul>,
                link: ({ children, url }) => (
                  <a href={safeHref(url)} className={link}>
                    {children}
                  </a>
                ),
              }}
            />
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className={`h-full px-4 pb-3 pt-5 ${ink}`}>
      {masthead}
      <div className="mt-2 flex gap-2">
        <Photo picture={picture} className="h-24 w-24 shrink-0" />
        <ul className="min-w-0 space-y-1.5" style={serif}>
          {(isLoading ? [] : posts.slice(0, 3)).map((post) => (
            <li key={post.id} className="line-clamp-2 border-b border-[#2a1d14]/15 pb-1 text-[16px] leading-tight">
              {full ? (
                <button type="button" onClick={() => setOpen(post.id)} className="text-left hover:underline">
                  {post.Title}
                </button>
              ) : (
                post.Title
              )}
            </li>
          ))}
          {isLoading && <li className={quiet}>Printing…</li>}
        </ul>
      </div>
    </div>
  );
}

// ---- Which papers are up

const NOTICE_PICTURES = ["/images/grave_bg.png", "/images/cave_bg.png"];

// Every paper reads the same pinned up as up close: coming closer changes nothing on it
export function useBoardPapers(signedIn: boolean, goTo: GoTo): Paper[] {
  const { data: items = [] } = useContentLoop();
  const challenge = items.find((item) => item.type === "weekly_challenge");
  // (today's challenges: two, on one paper)
  const dailies = items.filter((item) => item.type === "daily_challenge").slice(0, 2);
  const daily = dailies[0];
  const notices = items.filter((item) => item.type === "announcement").slice(0, daily ? 1 : 2);
  const challengeGame = useGame(challenge?.gameName);
  const dailyGame = useGame(daily?.gameName);
  const spotlight = useSpotlightGame();
  const { data: posts } = usePosts(signedIn);
  const postImage = strapiUrl(posts?.data?.find((post) => post.Image?.[0]?.url)?.Image?.[0]?.url);
  const postPicture: Picture = { src: postImage ?? "/images/candleskull.gif" };
  // The event's own picture, an empty cinema (tonight's film is the poster by the stand)
  const eventPicture: Picture = { src: "/images/emptyTheater.jpg" };

  const papers: Paper[] = [
    {
      id: "welcome",
      kind: "NOTICE",
      title: "WAYSIDE STATION",
      pinned: <Welcome signedIn={signedIn} goTo={goTo} />,
      full: <Welcome signedIn={signedIn} goTo={goTo} />,
      tint: "#d9cba6",
      noZoom: true,
    },
    // Top left: the week's challenge (the arcade's own post when there isn't one)
    {
      id: "arcade",
      kind: challenge ? "CHALLENGE" : "ARCADE",
      title: challenge?.title ?? spotlight?.name ?? "THE ARCADE",
      pinned: <ArcadePost challenge={challenge} game={challengeGame} spotlight={spotlight} signedIn={signedIn} goTo={goTo} full={false} />,
      full: <ArcadePost challenge={challenge} game={challengeGame} spotlight={spotlight} signedIn={signedIn} goTo={goTo} full={false} />,
      tint: "#dccd9f",
    },
    // Top right: the event's post
    {
      id: "event",
      kind: "EVENT",
      title: "SCARE-ATHON",
      pinned: <EventPost goTo={goTo} full={false} picture={eventPicture} />,
      full: <EventPost goTo={goTo} full={false} picture={eventPicture} />,
      tint: "#1a0f08",
      sheet: { backgroundImage: "none" },
    },
  ];
  // Bottom left: today's challenges (both on the one paper; a lone one has it to itself)
  if (daily) {
    const sheet = dailies.length > 1 ? <DailyChallenges items={dailies} signedIn={signedIn} goTo={goTo} /> : <Challenge item={daily} game={dailyGame} signedIn={signedIn} goTo={goTo} full={false} />;
    papers.push({
      id: "daily",
      kind: "CHALLENGE",
      title: dailies.length > 1 ? "Daily challenges" : daily.title,
      pinned: sheet,
      full: sheet,
      tint: "#d8ccab",
    });
  }
  // Then the latest notice (the Post when there's none)
  notices.forEach((item, i) => {
    const picture = { src: strapiUrl(item.image?.url) ?? NOTICE_PICTURES[i] };
    papers.push({
      id: item.id,
      kind: "NOTICE",
      title: item.title,
      pinned: <Clipping item={item} full={false} picture={picture} />,
      full: <Clipping item={item} full={false} picture={picture} />,
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
    // (up close its headlines can be tapped, to turn to the story)
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
      role={zoomed || paper.noZoom ? undefined : "button"}
      tabIndex={zoomed || paper.noZoom ? undefined : 0}
      aria-label={zoomed ? paper.title : `Look closer: ${paper.title}`}
      onClick={zoomed || paper.noZoom ? undefined : onOpen}
      onKeyDown={(event) => !zoomed && event.key === "Enter" && event.target === event.currentTarget && onOpen()}
      className={`relative h-full w-full overflow-hidden shadow-[3px_4px_0_rgba(0,0,0,0.45)] transition ${zoomed || paper.noZoom ? "" : "cursor-pointer hover:brightness-105"}`}
      style={{ backgroundColor: paper.tint, backgroundImage: PAPER_GRAIN, ...typewriter, ...paper.sheet }}
    >
      {paper.noZoom ? (
        <>
          <span className="absolute left-2 top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full bg-red-800 shadow" aria-hidden />
          <span className="absolute right-2 top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full bg-red-800 shadow" aria-hidden />
        </>
      ) : (
        <span className="absolute left-1/2 top-1.5 z-10 h-3 w-3 -translate-x-1/2 rounded-full bg-red-800 shadow" aria-hidden />
      )}
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
