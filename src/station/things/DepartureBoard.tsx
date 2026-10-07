import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { needsSignIn, useLooks, useScareboard, type PlayerLook } from "../data.ts";
import { DEFAULT_BANNER, ON_BANNER_TEXT, bannerStyle } from "../banners.ts";
import NewsDot from "../../components/NewsDot";
import { notePlaces, placesSeen } from "../seen.ts";
import { pixel } from "../style/theme.ts";
import { AvatarView } from "../../components/avatar/AvatarView";
import type { GoTo } from "../stops.ts";
import ScareathonAdminPanel from "../../components/ScareathonAdminPanel";
import { useScareathonMe } from "../../scareathonSeason";
import { getAvatarCompositePublicUrl } from "../../components/avatar/avatarComposite";
import { useIsMobileArcade } from "../../pages/Arcade/games";
import { formatCompactLeaderboardScore, formatLeaderboardScore, useLeaderboard, usePlayerBests } from "../../pages/Arcade/leaderboard";

// A stand-in while a player's look is on its way: a faint figure, the kid's outline in the
// avatar's own 32x48 frame, so the avatar takes its place without anything moving
const STAND_IN = [
  "..............####..............",
  "............########............",
  "...........##########...........",
  "...........##########...........",
  "...........##########...........",
  "...........##########...........",
  "...........##########...........",
  "...........##########...........",
  "............########............",
  "..............###...............",
  ".............#####..............",
  "............#######.............",
  "............#######.............",
  "............#######.............",
  "............#######.............",
  "............#######.............",
  ".............#####..............",
  ".............##.##..............",
  ".............##.##..............",
  ".............##.##..............",
  "............###.###.............",
];
function StandIn() {
  return (
    <svg viewBox="0 0 32 48" width={64} height={96} shapeRendering="crispEdges" className="block animate-pulse" aria-hidden>
      {STAND_IN.flatMap((row, y) =>
        [...row].map((cell, x) => (cell === "#" ? <rect key={`${x}-${y}`} x={x} y={24 + y} width={1} height={1} fill="rgba(255,255,255,0.2)" /> : null))
      )}
    </svg>
  );
}

// Whose profile card is up (a tap on an avatar in a row puts theirs up: see ProfileCard)
type Viewed = { userId: string; name: string; look?: PlayerLook };
const OpenProfile = createContext<((player: Viewed) => void) | null>(null);

// A player's avatar in a flap of its own: drawn from their look, so it plays its idle (if
// their body has one); their saved portrait if the look doesn't come. (Not while it's on its
// way: the portrait is a close-up, so swapping it for the whole avatar looked like a shrink.
// A stand-in figure holds the place instead)
function Face({ userId, name, look, pending = false, onBanner = false, small = false }: { userId?: string; name?: string; look?: PlayerLook; pending?: boolean; onBanner?: boolean; small?: boolean }) {
  const open = useContext(OpenProfile);
  if (!userId) return null;
  // Phones show them at 1.5x (drawn at 2x, then scaled), so about the top seven fit on a screen
  const size = small
    ? { frame: "h-[51px] w-[48px]", shift: "origin-bottom scale-75", img: "h-[72px] w-[48px]" }
    : { frame: "h-[68px] w-[64px]", shift: "", img: "h-[96px] w-[64px]" };
  return (
    // (the empty sky over their heads trimmed off, but not their feet, nor a companion at
  // their heels or over their shoulder; no box of its own on a banner, just them standing on it)
    <span
      className={`${onBanner ? "" : flap} flex ${size.frame} shrink-0 items-end justify-center overflow-hidden px-0 ${open ? "cursor-pointer transition hover:brightness-125" : ""}`}
      // (a tap on them: their profile card)
      role={open ? "button" : undefined}
      tabIndex={open ? 0 : undefined}
      aria-label={open && name ? `${name}'s profile` : undefined}
      onClick={open ? () => open({ userId, name: name ?? "", look }) : undefined}
      onKeyDown={open ? (event) => (event.key === "Enter" || event.key === " ") && open({ userId, name: name ?? "", look }) : undefined}
    >
      {look ? (
        <span className={size.shift}>
          <AvatarView look={look} height={96} label="" />
        </span>
      ) : pending ? (
        <span className={size.shift}>
          <StandIn />
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
type Props = { signedIn: boolean; goTo: GoTo; games?: string[]; game?: string };

const AMBER = "#ffb03a";
const flap = "rounded-[2px] bg-[#111419] px-1.5 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06),inset_0_1px_0_rgba(0,0,0,0.6)]";
// A long name steps down a size before it wraps, so the whole name always shows
const nameSize = (name: string) => (name.length > 14 ? "text-[14px]" : name.length > 10 ? "text-[16px]" : "");

// On phones a name is as big as its row has room for: from 17px down a pixel at a time to
// 11px, and only past that does it wrap
function FitName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [size, setSize] = useState(17);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      let px = 17;
      el.style.whiteSpace = "nowrap";
      el.style.fontSize = `${px}px`;
      while (px > 11 && el.scrollWidth > el.clientWidth) el.style.fontSize = `${--px}px`;
      el.style.whiteSpace = "";
      setSize(px);
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(el.parentElement ?? el);
    return () => resize.disconnect();
  }, [name]);
  return (
    <span ref={ref} className="block break-words leading-tight" style={{ fontSize: size }}>
      {name}
    </span>
  );
}

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

function Line({ children, dim = false, bright = false, banner, tight = false }: { children: React.ReactNode; dim?: boolean; bright?: boolean; banner?: string; tight?: boolean }) {
  // (a player's row sits on their banner, if they've put one up: see banners.ts)
  const style = bannerStyle(banner);
  return (
    <div
      className={`flex items-center ${tight ? "gap-1" : "gap-2"} text-[19px] leading-none ${style ? "my-1 rounded-[2px] px-1.5 py-1" : "py-[3px]"} ${dim ? "opacity-40" : ""} ${bright ? "text-[#ffd27a]" : ""}`}
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
function PlayerRow({ rank, userId, name, look, lookPending = false, small, bright, under, score, moved }: {
  // (their place has changed since you last looked at this board: from this one)
  moved?: number;
  rank: number;
  userId?: string;
  name: string;
  look?: PlayerLook;
  lookPending?: boolean;
  small: boolean;
  bright: boolean;
  under?: React.ReactNode;
  score: React.ReactNode;
}) {
  const box = userId ? "px-0.5" : flap;
  return (
    // (on phones, tighter: a narrower rank, smaller gaps and score, so the name gets the room)
    <Line bright={bright} banner={userId ? look?.banner ?? DEFAULT_BANNER : undefined} tight={small}>
      <span className={`${box} ${small ? "w-7 text-[16px]" : "w-9"} relative shrink-0 text-center`}>
        {rank}
        {moved !== undefined && <NewsDot className="absolute left-0 -top-1.5 !h-3.5 !w-3.5 !text-[11px]" label={moved > rank ? `Up from ${moved}` : `Down from ${moved}`} />}
      </span>
      <Face userId={userId} name={name} look={look} pending={lookPending} onBanner={Boolean(userId)} small={small} />
      <span className={`${box} min-w-0 flex-1 py-0.5`}>
        {small ? <FitName name={name.toUpperCase()} /> : <span className={`block break-words leading-tight ${nameSize(name)}`}>{name.toUpperCase()}</span>}
        {under}
      </span>
      <span className={`${box} ${small ? "min-w-14 text-[17px]" : "min-w-16"} shrink-0 whitespace-nowrap text-right`}>{score}</span>
    </Line>
  );
}

// Places that have moved since you last looked at a year's standings wear the "!" dot (which
// says where from). What you last saw is read once per board, when its standings first come
// in, and what's there now is kept for next time; the dots stay for as long as it's open.
function usePlacesMoved(year: number | undefined, rows: { name: string; rank: number }[]) {
  const seen = useRef<Record<string, Record<string, number> | null>>({});
  const board = `scareboard:${year ?? ""}`;
  const ready = year !== undefined && rows.length > 0;
  if (ready && !(board in seen.current)) seen.current[board] = placesSeen(board);
  const now = rows.map((row) => `${row.name}=${row.rank}`).join("|");
  useEffect(() => {
    if (ready) notePlaces(board, Object.fromEntries(rows.map((row) => [row.name, row.rank])));
    // (rows is new every render; `now` says whether what's in it has changed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, ready, now]);
  const before = seen.current[board];
  return (name: string, rank: number) => (before && name in before && before[name] !== rank ? before[name] : undefined);
}

function Standings({ signedIn }: { signedIn: boolean }) {
  const [year, setYear] = useState<number | null>(null);
  const { data, isLoading, error } = useScareboard(year, signedIn);
  const before = usePlacesMoved(data?.leaderboard.meta?.year, data?.leaderboard.data ?? []);
  const { data: me } = useScareathonMe(signedIn);
  const compact = useIsMobileArcade();
  const { data: looks, isPending: looksPending } = useLooks((data?.leaderboard.data ?? []).flatMap((row) => (row.userId ? [row.userId] : [])));
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
        {/* (over the totals down the right) */}
        <span className="ml-auto pr-1.5">POINTS</span>
      </div>
      {rows.length === 0 && <Line>{meta?.isPreseason ? `${meta.year} ON THE WAY - STANDINGS FROM OCT 01` : "NO SCORES YET"}</Line>}
      {rows.map((row) => {
        const wins = winsFor(row.name);
        return (
          <PlayerRow
            key={row.name}
            rank={row.rank}
            moved={before(row.name, row.rank)}
            userId={row.userId}
            name={row.name}
            look={row.userId ? looks?.[row.userId] : undefined}
            lookPending={looksPending}
            small={compact}
            bright={row.rank <= 3}
            score={row.total}
            under={
              <>
                {wins.length > 0 && <span className="mt-0.5 block text-[13px] leading-none text-yellow-300">{wins.map((y) => `★${y}`).join(" ")}</span>}
                <span className="mt-1 block text-[12px] leading-none opacity-80">
                  {POINT_COLUMNS.map(([key, label], i) => (
                    // (each label with its number, so a narrow row wraps between them)
                    <span key={key} className="whitespace-nowrap">
                      {i > 0 && " · "}
                      {label} {row[key] ?? "-"}
                    </span>
                  ))}
                </span>
              </>
            }
          />
        );
      })}
      {me?.isAdmin && <ScareathonAdminPanel className="mt-4" />}
    </>
  );
}

// A little amber chevron, in the board's pixels
function Chevron({ pointing }: { pointing: "left" | "right" }) {
  const cells = [[2, 0], [1, 1], [2, 1], [0, 2], [1, 2], [0, 3], [1, 3], [0, 4], [1, 4], [1, 5], [2, 5], [2, 6]];
  return (
    <svg viewBox="0 0 3 7" shapeRendering="crispEdges" className="h-[14px] w-[6px]" style={{ transform: pointing === "left" ? undefined : "scaleX(-1)" }} aria-hidden>
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={AMBER} />
      ))}
    </svg>
  );
}

// A key for each game that keeps scores, in a strip that scrolls sideways (only the strip:
// the board itself never does); arrows at either end say there's more that way, and move it
function GameStrip({ games, game, onGame }: { games: string[]; game: string | undefined; onGame: (game: string) => void }) {
  const strip = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    setMore({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    measure();
    const el = strip.current;
    if (!el) return;
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => resize.disconnect();
  }, [measure, games]);
  // Opened on a game further along: its key brought into view
  useEffect(() => {
    const el = strip.current;
    const key = el?.children[games.indexOf(game ?? "")] as HTMLElement | undefined;
    if (el && key) el.scrollLeft = key.offsetLeft - (el.clientWidth - key.offsetWidth) / 2;
    measure();
    // Only on opening; picking a key yourself leaves the strip where you put it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const nudge = (by: -1 | 1) => strip.current?.scrollBy({ left: by * strip.current.clientWidth * 0.7, behavior: "smooth" });
  const arrow = (side: "left" | "right") =>
    more[side] && (
      <button
        type="button"
        aria-label={side === "left" ? "Earlier games" : "More games"}
        onClick={() => nudge(side === "left" ? -1 : 1)}
        className={`absolute inset-y-0 z-10 flex w-8 items-center ${side === "left" ? "left-0 justify-start bg-gradient-to-r" : "right-0 justify-end bg-gradient-to-l"} from-[#0a0c10] via-[#0a0c10]/90 to-transparent px-0.5`}
      >
        <Chevron pointing={side} />
      </button>
    );
  return (
    <div className="relative mb-1">
      {arrow("left")}
      <div ref={strip} onScroll={measure} className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {games.map((name) => (
          <span key={name} className="shrink-0 whitespace-nowrap">
            <Key active={name === game} onClick={() => onGame(name)}>
              {name.replace(/[‘’]/g, "'").toUpperCase()}
            </Key>
          </span>
        ))}
      </div>
      {arrow("right")}
    </div>
  );
}

// The arcade's hi-scores, a game at a time, on the same banners as the Scareboard
function ArcadeScores({ games, start }: { games: string[]; start?: string }) {
  const [game, setGame] = useState(start && games.includes(start) ? start : games[0]);
  const { data: entries, isLoading, isError } = useLeaderboard(game);
  const compact = useIsMobileArcade();
  const { data: looks, isPending: looksPending } = useLooks((entries ?? []).flatMap((entry) => (entry.userId ? [entry.userId] : [])));
  // The table lists every run, so you can be on it more than once: only the highest is your best
  const best = entries?.findIndex((entry) => entry.isUserScore) ?? -1;
  return (
    <>
      <GameStrip games={games} game={game} onGame={setGame} />
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
            lookPending={looksPending}
            small={compact}
            bright={index < 3 || index === best}
            under={index === best ? <span className="mt-0.5 block text-[13px] leading-none text-yellow-300">YOUR BEST</span> : undefined}
            // (on phones, shortened to fit the column: the full score on a long press)
            score={
              compact ? (
                <span title={formatLeaderboardScore(game, entry.metricValue)}>{formatCompactLeaderboardScore(game, entry.metricValue)}</span>
              ) : (
                formatLeaderboardScore(game, entry.metricValue)
              )
            }
          />
        ))}
    </>
  );
}

// ---- The podium: everyone in the standings, stood on a stepped pyramid seen from one corner.
// First place has the top to themselves; each step down runs round the two near sides and
// holds four more than the one above (1, 5, 9, 13...), so five steps take 45 and it grows a
// step whenever it has to. On a step, the better places are nearer the front corner.

// A cell is 44 across and 22 deep on screen (two across to one down). A step is 30 high, so
// with the 22 it comes forward each one stands a kid's height (48) below the last, and
// nobody's head is in front of the face behind. Avatars are drawn at twice their pixels,
// 64 by 96, their feet 4 up from the bottom
const POD = { tw: 44, th: 22, step: 30 };
const MEDALS = ["#ffd24a", "#cfd6e0", "#d08a4a"];

// How many steps below the top one it takes to stand this many
function podiumSteps(count: number) {
  let steps = 0;
  while ((2 * steps + 1) * (steps + 1) < count) steps += 1;
  return steps;
}

function Podium({ signedIn }: { signedIn: boolean }) {
  const { data, isLoading, error } = useScareboard(null, signedIn);
  const rows = data?.leaderboard.data ?? [];
  const { data: looks, isPending: looksPending } = useLooks(rows.flatMap((row) => (row.userId ? [row.userId] : [])));
  const open = useContext(OpenProfile);
  // Whoever's pointed at (or, with no card of their own to open, tapped): said along the top
  const [named, setNamed] = useState<number | null>(null);
  // As big as the board has room for (down to a size you can still make people out at, then it scrolls)
  // (the box isn't there until the standings are, so it's kept in state: the effect runs when it arrives)
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = box;
    if (!el) return;
    const measure = () => setRoom({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    return () => resize.disconnect();
  }, [box]);

  if (!signedIn || needsSignIn(error)) return null;
  if (isLoading && !data) return <Line>FLIPPING...</Line>;
  if (error) return <Line>BOARD FAULT: {error.message.toUpperCase()}</Line>;
  if (rows.length === 0) return <Line>NOBODY ON THE PODIUM YET</Line>;

  const steps = podiumSteps(rows.length);
  const side = 2 * steps + 1;
  const { tw, th, step } = POD;
  const width = side * tw;
  // (room over the top block for whoever's on it, and their name)
  const headroom = Math.max(8, 88 - (side * th) / 2);
  const baseline = headroom + (steps + 1) * step;
  const height = baseline + side * th + 4;
  // The floor runs x to the lower right and y to the lower left; z is up
  const at = (x: number, y: number, z: number): [number, number] => [((x - y) * tw) / 2 + width / 2, ((x + y) * th) / 2 - z + baseline];
  const points = (...corners: [number, number][]) => corners.map(([x, y]) => `${x},${y}`).join(" ");

  // Where each place stands: the step (0 is the top), and the cell on it
  const standers = rows.map((row, index) => {
    let ring = 0;
    let first = 0;
    while (index >= first + 4 * ring + 1) {
      first += 4 * ring + 1;
      ring += 1;
    }
    const along = index - first; // 0 is the front corner, then left, right, left, right... away from it
    const out = Math.ceil(along / 2);
    const left = along % 2 === 1;
    const corner = steps + ring;
    const cx = left ? corner - out : corner;
    const cy = left || along === 0 ? corner : corner - out;
    const z = (steps - ring + 1) * step;
    return { row, index, ring, cx, cy, z, left: left || along === 0, feet: at(cx + 0.5, cy + 0.5, z) };
  });

  const scale = room.width ? Math.min(3, room.width / width, Math.max(room.height / height, Math.min(0.85, room.width / width))) : 1;
  const said = named !== null ? standers[named] : null;
  return (
    <div className="flex h-full min-h-[16rem] flex-col">
      <p className="mb-1 min-h-[1.2em] text-[13px] opacity-80" aria-live="polite">
        {said ? `#${said.row.rank} ${said.row.name.toUpperCase()} · ${said.row.total} POINTS` : `${rows.length} ON THE PODIUM · ${data?.leaderboard.meta?.year ?? ""} STANDINGS`}
      </p>
      <div ref={setBox} className="min-h-0 flex-1">
        <div className="relative mx-auto" style={{ width: width * scale, height: height * scale }}>
          <div className="absolute left-0 top-0" style={{ width, height, transform: `scale(${scale})`, transformOrigin: "0 0", textShadow: "none" }}>
            <svg width={width} height={height} className="absolute inset-0" aria-hidden>
              {/* The blocks, the widest and lowest first, each rising out of the one before */}
              {Array.from({ length: steps + 1 }, (_, n) => steps - n).map((ring) => {
                const near = steps + ring + 1;
                const far = steps - ring;
                const z = (steps - ring + 1) * step;
                return (
                  <g key={ring} stroke="rgba(255,176,58,0.3)" strokeWidth={0.75} strokeLinejoin="round">
                    <polygon points={points(at(far, far, z), at(near, far, z), at(near, near, z), at(far, near, z))} fill="#1c222d" />
                    <polygon points={points(at(far, near, z), at(near, near, z), at(near, near, z - step), at(far, near, z - step))} fill="#131820" />
                    <polygon points={points(at(near, far, z), at(near, near, z), at(near, near, z - step), at(near, far, z - step))} fill="#0c0f15" />
                  </g>
                );
              })}
              {/* Each place's own square of its step (gold, silver and bronze for the first three), and its number on the riser under it */}
              {standers.map(({ row, index, cx, cy, z, left }) => {
                const [nx, ny] = left ? at(cx + 0.5, cy + 1, z - step / 2) : at(cx + 1, cy + 0.5, z - step / 2);
                return (
                  <g key={index}>
                    <polygon
                      points={points(at(cx, cy, z), at(cx + 1, cy, z), at(cx + 1, cy + 1, z), at(cx, cy + 1, z))}
                      fill={MEDALS[index] ?? "transparent"}
                      fillOpacity={0.45}
                      stroke="rgba(255,176,58,0.14)"
                      strokeWidth={0.5}
                    />
                    <text x={nx} y={ny + 3} textAnchor="middle" fontSize={9} fill={MEDALS[index] ?? AMBER} fillOpacity={index < 3 ? 1 : 0.75}>
                      {row.rank}
                    </text>
                  </g>
                );
              })}
            </svg>
            {standers.map(({ row, index, cx, cy, feet }) => {
              const look = row.userId ? looks?.[row.userId] : undefined;
              const profile = open && row.userId ? () => open({ userId: row.userId as string, name: row.name, look }) : undefined;
              return (
                // (those nearer the front corner are drawn over those behind)
                <div key={index} className="pointer-events-none absolute" style={{ left: feet[0] - 32, top: feet[1] - 92, width: 64, height: 96, zIndex: cx + cy + 1 }}>
                  {look ? (
                    <AvatarView look={look} height={96} label="" />
                  ) : row.userId && !looksPending ? (
                    <img
                      src={getAvatarCompositePublicUrl(row.userId)}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      className="h-[96px] w-[64px] max-w-none object-contain [image-rendering:pixelated]"
                      onError={(event) => (event.currentTarget.style.visibility = "hidden")}
                    />
                  ) : (
                    // (no avatar: on their way, or a name off the sheet with no account)
                    <StandIn />
                  )}
                  {/* (the part of the frame they stand in takes the pointer, not all of it: the frames overlap) */}
                  <button
                    type="button"
                    aria-label={`Place ${row.rank}: ${row.name}, ${row.total} points`}
                    className="pointer-events-auto absolute bottom-0 left-4 h-14 w-8 cursor-pointer"
                    onPointerEnter={() => setNamed(index)}
                    onPointerLeave={() => setNamed((now) => (now === index ? null : now))}
                    onFocus={() => setNamed(index)}
                    onClick={() => {
                      setNamed(index);
                      profile?.();
                    }}
                  />
                  {index === 0 && (
                    <span className="absolute left-1/2 top-[26px] -translate-x-1/2 whitespace-nowrap text-[11px] leading-none text-[#ffd24a]" style={{ textShadow: ON_BANNER_TEXT }}>
                      {row.name.toUpperCase()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// A player's profile card, in the board's place (not laid over it: anything positioned
// here would cover the sheet's own close button): them close up in front of their banner, their
// name, and their best in each game with where it stands (their highest places first)
function ProfileCard({ player, games, onClose }: { player: Viewed; games: string[]; onClose: () => void }) {
  const { data: bests, isLoading, isError } = usePlayerBests(player.userId);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  const banner = player.look?.banner ?? DEFAULT_BANNER;
  // (only the games the arcade has out; all of theirs, if the board wasn't told which)
  const shown = (bests ?? []).filter((best) => games.length === 0 || games.includes(best.game)).slice(0, 8);
  return (
    <div className="flex min-h-0 flex-1 flex-col" role="dialog" aria-label={`${player.name}'s profile`}>
      <div className="mb-2 flex items-center gap-2 border-b border-[#ffb03a]/25 pb-2 pr-10">
        <Key active={false} onClick={onClose}>
          ◂ BACK
        </Key>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [scrollbar-color:#ffb03a55_transparent] [scrollbar-width:thin]">
        <div
          className="flex h-[216px] items-end justify-center overflow-hidden rounded-[2px] bg-gradient-to-b from-[#2a2238] to-[#0b1017] shadow-[inset_0_0_0_1px_rgba(255,176,58,0.25)]"
          // (the whole banner, as it runs along a scoreboard row, just taller: not the close-up
          // slice of it that stands behind you in the shop)
          style={{ ...bannerStyle(banner), backgroundPosition: "center" }}
        >
          {player.look ? (
            <AvatarView look={player.look} height={192} label={player.name} />
          ) : (
            <img
              src={getAvatarCompositePublicUrl(player.userId)}
              alt=""
              draggable={false}
              className="h-[192px] w-[128px] max-w-none object-contain [image-rendering:pixelated]"
              onError={(event) => (event.currentTarget.style.visibility = "hidden")}
            />
          )}
        </div>
        <p className="mt-2 break-words text-[24px] leading-tight text-[#ffd27a]">{player.name.toUpperCase()}</p>
        <p className="mb-1 mt-3 text-[13px] opacity-80">TOP SCORES</p>
        {isLoading && <Line>FLIPPING...</Line>}
        {isError && <Line>BOARD FAULT: SCORES LOST IN THE FOG</Line>}
        {bests && shown.length === 0 && <Line dim>NO SCORES ON THE BOARD YET</Line>}
        {shown.map((best) => (
          <Line key={best.game} bright={best.place <= 3}>
            <span className={`${flap} w-12 shrink-0 text-center text-[16px]`}>#{best.place}</span>
            <span className={`${flap} min-w-0 flex-1 truncate py-0.5 text-[15px]`}>{best.game.replace(/[‘’]/g, "'").toUpperCase()}</span>
            <span className={`${flap} shrink-0 whitespace-nowrap text-right text-[16px]`}>{formatLeaderboardScore(best.game, best.metricValue)}</span>
          </Line>
        ))}
      </div>
    </div>
  );
}

// The board on the wall: the Scareboard, and the arcade's hi-scores (straight to one game's,
// with `game`: the arcade's leaderboard key)
export default function DepartureBoard({ signedIn, goTo, games = [], game }: Props) {
  const [board, setBoard] = useState<"scareathon" | "podium" | "arcade">(game && games.includes(game) ? "arcade" : "scareathon");
  const [viewing, setViewing] = useState<Viewed | null>(null);
  const closeProfile = useCallback(() => setViewing(null), []);
  return (
    <OpenProfile.Provider value={setViewing}>
    <div className="flex h-full w-full flex-col bg-[#0a0c10] px-4 py-3" style={{ ...pixel, fontFamily: `CCDigits, ${pixel.fontFamily}`, color: AMBER, textShadow: "0 0 6px rgba(255,176,58,0.45)" }}>
      {/* (kept, hidden, under a profile card: the game you were on is still up when you come back) */}
      <div className={viewing ? "hidden" : "contents"}>
      <div className="mb-2 border-b border-[#ffb03a]/25 pb-2 pr-10">
        <span className="text-[26px] font-bold tracking-wide">SCOREBOARD</span>
      </div>
      <div className="mb-2 flex gap-1.5">
        <Key active={board === "scareathon"} onClick={() => setBoard("scareathon")}>
          SCAREATHON
        </Key>
        {/* (the same standings, everyone stood on a podium) */}
        <Key active={board === "podium"} onClick={() => setBoard("podium")}>
          PODIUM
        </Key>
        {games.length > 0 && (
          <Key active={board === "arcade"} onClick={() => setBoard("arcade")}>
            ARCADE
          </Key>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-1 [scrollbar-color:#ffb03a55_transparent] [scrollbar-width:thin]">
        {board === "arcade" ? (
          <ArcadeScores games={games} start={game} />
        ) : signedIn ? (
          board === "podium" ? <Podium signedIn={signedIn} /> : <Standings signedIn={signedIn} />
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
      {viewing && <ProfileCard player={viewing} games={games} onClose={closeProfile} />}
    </div>
    </OpenProfile.Provider>
  );
}
