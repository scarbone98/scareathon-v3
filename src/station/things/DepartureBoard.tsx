import { useState } from "react";
import { needsSignIn, useLooks, useScareboard, type PlayerLook } from "../data.ts";
import { DEFAULT_BANNER, bannerStyle } from "../banners.ts";
import { pixel } from "../style/theme.ts";
import { AvatarView } from "../../components/avatar/AvatarView";
import type { AvatarLook } from "../../components/avatar/types";
import type { GoTo } from "../stops.ts";
import ScareathonAdminPanel from "../../components/ScareathonAdminPanel";
import { useScareathonMe } from "../../scareathonSeason";
import { getAvatarCompositePublicUrl } from "../../components/avatar/avatarComposite";
import { useIsMobileArcade } from "../../pages/Arcade/games";
import { formatLeaderboardScore, useLeaderboard } from "../../pages/Arcade/leaderboard";

// A player's avatar in a flap of its own: drawn from their look, so it plays its idle (if
// their body has one); their saved portrait until the look comes, or if it doesn't
function Face({ userId, look, onBanner = false, small = false }: { userId?: string; look?: AvatarLook; onBanner?: boolean; small?: boolean }) {
  if (!userId) return null;
  // Phones show them at 1.5x (drawn at 2x, then scaled), so about the top seven fit on a screen
  const size = small
    ? { frame: "h-[45px] w-[48px]", shift: "origin-bottom translate-y-[8px] scale-75", img: "h-[72px] w-[48px] translate-y-[8px]" }
    : { frame: "h-[60px] w-[64px]", shift: "translate-y-[10px]", img: "h-[96px] w-[64px] translate-y-[10px]" };
  return (
    // (the empty sky over their heads and their feet trimmed off; no box of its
  // own on a banner, just them standing on it)
    <span className={`${onBanner ? "" : flap} flex ${size.frame} shrink-0 items-end justify-center overflow-hidden px-0`}>
      {look ? (
        <span className={size.shift}>
          <AvatarView look={look} height={96} label="" />
        </span>
      ) : (
        <img
          src={getAvatarCompositePublicUrl(userId)}
          alt=""
          loading="lazy"
          draggable={false}
          className={`${size.img} max-w-none object-contain [image-rendering:pixelated]`}
          onError={(event) => (event.currentTarget.style.visibility = "hidden")}
        />
      )}
    </span>
  );
}

// The scoreboard on the wall over the ticket counter: the Scareboard, with years and past
// winners, in amber split-flap rows. (The October calendar is a flyer: PosterCalendar.)

// games: the arcade games that keep scores, for their hi-score boards
type Props = { signedIn: boolean; goTo: GoTo; games?: string[] };

const AMBER = "#ffb03a";
const flap = "rounded-[2px] bg-[#111419] px-1.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),inset_0_1px_0_rgba(0,0,0,0.6)]";
// Lettering painted straight onto a banner: a dark outline keeps it legible over any picture
const ON_BANNER_TEXT = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(255,176,58,0.35)";
// A long name steps down a size before it wraps, so the whole name always shows
const nameSize = (name: string) => (name.length > 14 ? "text-[14px]" : name.length > 10 ? "text-[16px]" : "");

function Key({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${flap} py-0.5 text-[12px] transition ${active ? "text-[#0a0c10]" : "opacity-60 hover:opacity-100"}`}
      style={{ background: active ? AMBER : undefined }}
    >
      {children}
    </button>
  );
}

function Line({ children, dim = false, bright = false, banner }: { children: React.ReactNode; dim?: boolean; bright?: boolean; banner?: string }) {
  // (a player's row sits on their banner, if they've put one up: see banners.ts)
  const style = bannerStyle(banner);
  return (
    <div
      className={`flex items-center gap-2 text-[19px] leading-none ${style ? "my-1 rounded-[2px] px-1.5 py-1" : "py-[3px]"} ${dim ? "opacity-40" : ""} ${bright ? "text-[#ffd27a]" : ""}`}
      style={style ? { ...style, textShadow: ON_BANNER_TEXT } : undefined}
    >
      {children}
    </div>
  );
}

// The points behind a total: films watched, arcade challenges, and anything else
const POINT_COLUMNS: [string, string][] = [
  ["movies", "MOVIES"],
  ["weekly", "ARCADE"],
  ["bonus", "BONUS"],
];

// One player's row, on their banner (a player with an account always has one: the empty
// one, if they've put none up). On a banner the lettering goes straight onto it, without
// flaps; whatever's said under the name (wins, points) goes there so the name keeps the width
function PlayerRow({ rank, userId, name, look, small, bright, under, score }: {
  rank: number;
  userId?: string;
  name: string;
  look?: PlayerLook;
  small: boolean;
  bright: boolean;
  under?: React.ReactNode;
  score: React.ReactNode;
}) {
  const box = userId ? "px-0.5" : flap;
  return (
    <Line bright={bright} banner={userId ? look?.banner ?? DEFAULT_BANNER : undefined}>
      <span className={`${box} w-9 shrink-0 text-center`}>{rank}</span>
      <Face userId={userId} look={look} onBanner={Boolean(userId)} small={small} />
      <span className={`${box} min-w-0 flex-1 py-0.5`}>
        <span className={`block break-words leading-tight ${nameSize(name)}`}>{name.toUpperCase()}</span>
        {under}
      </span>
      <span className={`${box} w-16 shrink-0 text-right`}>{score}</span>
    </Line>
  );
}

function Standings({ signedIn }: { signedIn: boolean }) {
  const [year, setYear] = useState<number | null>(null);
  // Just the totals, unless the passenger asks for the points behind them
  const [breakdown, setBreakdown] = useState(false);
  const { data, isLoading, error } = useScareboard(year, signedIn);
  const { data: me } = useScareathonMe(signedIn);
  const compact = useIsMobileArcade();
  const { data: looks } = useLooks((data?.leaderboard.data ?? []).flatMap((row) => (row.userId ? [row.userId] : [])));
  if (!signedIn || needsSignIn(error)) return null;
  if (isLoading && !data) return <Line>FLIPPING...</Line>;
  if (error) return <Line>BOARD FAULT: {error.message.toUpperCase()}</Line>;
  const meta = data?.leaderboard.meta;
  const rows = data?.leaderboard.data ?? [];
  const winsFor = (name: string) => (data?.pastWinners.data ?? []).filter((w) => w.name === name).map((w) => w.year.slice(2, 4));
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[13px] opacity-80">
        <span className="mr-1">{meta?.isLive ? "LIVE STANDINGS" : meta?.isPreseason ? "PRESEASON - STARTS OCT 01" : "HISTORICAL"}</span>
        {(meta?.availableYears ?? []).map((y) => (
          <Key key={y} active={y === meta?.year} onClick={() => setYear(y)}>
            {String(y)}
          </Key>
        ))}
        <span className="ml-auto" />
        <Key active={breakdown} onClick={() => setBreakdown((on) => !on)}>
          POINTS
        </Key>
      </div>
      {rows.length === 0 && <Line>{meta?.isPreseason ? `${meta.year} ON THE WAY - STANDINGS FROM OCT 01` : "NO SCORES YET"}</Line>}
      {rows.map((row) => {
        const wins = winsFor(row.name);
        return (
          <PlayerRow
            key={row.name}
            rank={row.rank}
            userId={row.userId}
            name={row.name}
            look={row.userId ? looks?.[row.userId] : undefined}
            small={compact}
            bright={row.rank <= 3}
            score={row.total}
            under={
              <>
                {wins.length > 0 && <span className="mt-0.5 block text-[13px] leading-none text-yellow-300">{wins.map((y) => `★${y}`).join(" ")}</span>}
                {breakdown && (
                  <span className="mt-1 block text-[12px] leading-none opacity-80">
                    {POINT_COLUMNS.map(([key, label], i) => (
                      // (each label with its number, so a narrow row wraps between them)
                      <span key={key} className="whitespace-nowrap">
                        {i > 0 && " · "}
                        {label} {row[key] ?? "-"}
                      </span>
                    ))}
                  </span>
                )}
              </>
            }
          />
        );
      })}
      {me?.isAdmin && <ScareathonAdminPanel className="mt-4" />}
    </>
  );
}

// The arcade's hi-scores, a game at a time, on the same banners as the Scareboard
function ArcadeScores({ games }: { games: string[] }) {
  const [game, setGame] = useState(games[0]);
  const { data: entries, isLoading, isError } = useLeaderboard(game);
  const compact = useIsMobileArcade();
  const { data: looks } = useLooks((entries ?? []).flatMap((entry) => (entry.userId ? [entry.userId] : [])));
  return (
    <>
      {/* A key for each game that keeps scores, scrolled sideways on a phone */}
      <div className="-mx-1 mb-1 flex gap-1.5 overflow-x-auto px-1 pb-1.5 [scrollbar-width:none]">
        {games.map((name) => (
          <span key={name} className="shrink-0 whitespace-nowrap">
            <Key active={name === game} onClick={() => setGame(name)}>
              {name.replace(/[‘’]/g, "'").toUpperCase()}
            </Key>
          </span>
        ))}
      </div>
      {isLoading && <Line>FLIPPING...</Line>}
      {isError && <Line>BOARD FAULT: SCORES LOST IN THE FOG</Line>}
      {entries?.length === 0 && <Line>NO SCORES YET. THE TOP SPOT IS YOURS.</Line>}
      {game &&
        entries?.map((entry, index) => (
          <PlayerRow
            key={`${entry.username}-${index}`}
            rank={index + 1}
            userId={entry.userId}
            name={entry.username}
            look={entry.userId ? looks?.[entry.userId] : undefined}
            small={compact}
            bright={index < 3 || entry.isUserScore}
            under={entry.isUserScore ? <span className="mt-0.5 block text-[13px] leading-none text-yellow-300">YOUR BEST</span> : undefined}
            score={formatLeaderboardScore(game, entry.metricValue)}
          />
        ))}
    </>
  );
}

// The board on the wall: the Scareboard, and the arcade's hi-scores
export default function DepartureBoard({ signedIn, goTo, games = [] }: Props) {
  const [board, setBoard] = useState<"scareathon" | "arcade">("scareathon");
  return (
    <div className="flex h-full w-full flex-col bg-[#0a0c10] px-4 py-3" style={{ ...pixel, fontFamily: `CCDigits, ${pixel.fontFamily}`, color: AMBER, textShadow: "0 0 6px rgba(255,176,58,0.45)" }}>
      <div className="mb-2 border-b border-[#ffb03a]/25 pb-2 pr-10">
        <span className="text-[26px] font-bold tracking-wide">SCOREBOARD</span>
      </div>
      {games.length > 0 && (
        <div className="mb-2 flex gap-1.5">
          <Key active={board === "scareathon"} onClick={() => setBoard("scareathon")}>
            SCAREATHON
          </Key>
          <Key active={board === "arcade"} onClick={() => setBoard("arcade")}>
            ARCADE
          </Key>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-color:#ffb03a55_transparent] [scrollbar-width:thin]">
        {board === "arcade" ? (
          <ArcadeScores games={games} />
        ) : signedIn ? (
          <Standings signedIn={signedIn} />
        ) : (
          <>
            <Line>STANDINGS ......... SIGNED-IN PASSENGERS</Line>
            <Line dim>ARCADE ............ BOARDING ALL NIGHT</Line>
            <button type="button" onClick={() => goTo("tickets")} className={`${flap} mt-3 py-1 text-[17px] hover:text-[#ffd27a]`}>
              ▸ SIGN IN AT THE COUNTER
            </button>
          </>
        )}
      </div>
    </div>
  );
}
