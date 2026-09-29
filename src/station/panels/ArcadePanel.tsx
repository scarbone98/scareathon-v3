import { useMemo, useState } from "react";
import LeaderboardDialog from "../../pages/Arcade/LeaderboardDialog";
import { createArcadeGames, normalizeMachineName, useIsMobileArcade, type MachineData } from "../../pages/Arcade/games";
import { PanelHeading, PlainButton } from "./ui.tsx";
import { serif, stubButton } from "./theme.ts";

// The arcade cabinet: every cartridge on the shelf, with its details, a leaderboard,
// and Play, which powers the game on right here at the station (see StationPlay).

type Props = { open?: string; onPlay: (game: MachineData) => void };

function stillFor(videoUrl?: string) {
  if (!videoUrl) return undefined;
  const slash = videoUrl.lastIndexOf("/");
  return `${videoUrl.slice(0, slash)}/stills/${videoUrl.slice(slash + 1).replace(/\.mp4$/i, ".jpg")}`;
}

export default function ArcadePanel({ open, onPlay }: Props) {
  const isMobile = useIsMobileArcade();
  const games = useMemo(() => createArcadeGames().filter((game) => !isMobile || game.availableOnMobile !== false), [isMobile]);
  const [chosen, setChosen] = useState(() => {
    const wanted = open ? normalizeMachineName(open) : null;
    return games.find((game) => normalizeMachineName(game.name) === wanted)?.name ?? games.find((game) => game.game)?.name ?? games[0]?.name;
  });
  const [leaderboard, setLeaderboard] = useState<MachineData | null>(null);
  const game = games.find((g) => g.name === chosen) ?? games[0];
  if (!game) return null;
  const playable = Boolean(game.game) || game.special === "shuffle";
  const about = game.cartridge.about;

  return (
    <>
      <PanelHeading eyebrow="Arcade cabinet" title="Insert a cartridge" />

      <div className="overflow-hidden rounded-[3px] ring-1 ring-[#f2ead2]/20">
        <div className="relative aspect-video bg-black">
          {game.videoUrl ? (
            <video key={game.name} className="h-full w-full object-cover" src={game.videoUrl} poster={stillFor(game.videoUrl)} autoPlay muted loop playsInline />
          ) : (
            <div className="flex h-full items-center justify-center" style={{ background: `radial-gradient(circle at 30% 20%, ${game.cartridge.color}55, #0b1017 70%)` }}>
              <span className="text-3xl text-[#f2ead2]/80" style={serif}>
                {game.name}
              </span>
            </div>
          )}
        </div>
        <div className="border-t-4 p-4" style={{ borderColor: game.cartridge.color }}>
          <h3 className="text-xl text-[#f2ead2]" style={serif}>
            {game.name.replace(/’/g, "'")}
          </h3>
          <p className="mt-1 text-sm text-stone-300">{game.cartridge.tagline}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-stone-400">
            <div><dt className="inline text-stone-500">Released </dt><dd className="inline">{about.released}</dd></div>
            <div><dt className="inline text-stone-500">Players </dt><dd className="inline">{about.players}</dd></div>
            <div><dt className="inline text-stone-500">Genre </dt><dd className="inline">{about.genre}</dd></div>
            <div><dt className="inline text-stone-500">By </dt><dd className="inline">{about.developer}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {playable ? (
              <button type="button" onClick={() => onPlay(game)} className={stubButton}>
                {game.special === "shuffle" ? "Play something" : "Play"}
              </button>
            ) : (
              <span className="text-sm italic text-stone-400" style={serif}>
                {game.special === "mystery" ? "Nobody knows what this one does." : "Coming soon."}
              </span>
            )}
            {game.game && game.hasLeaderboard !== false && <PlainButton onClick={() => setLeaderboard(game)}>Leaderboard</PlainButton>}
          </div>
        </div>
      </div>

      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-[#f2ead2]/70">The shelf</h3>
      <ul className="grid grid-cols-2 gap-2">
        {games.map((g) => (
          <li key={g.name}>
            <button
              type="button"
              onClick={() => setChosen(g.name)}
              aria-pressed={g.name === game.name}
              className={`flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-sm transition ${
                g.name === game.name ? "bg-[#efe3c8] text-[#1d2a3a]" : "text-[#f2ead2]/85 ring-1 ring-[#f2ead2]/15 hover:bg-[#f2ead2]/5"
              }`}
            >
              <span className="h-5 w-1.5 shrink-0 rounded-sm" style={{ background: g.cartridge.color }} />
              <span className="truncate" style={serif}>
                {g.name.replace(/’/g, "'")}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {leaderboard && <LeaderboardDialog game={leaderboard.name} accent={leaderboard.cartridge.color} onClose={() => setLeaderboard(null)} />}
    </>
  );
}
