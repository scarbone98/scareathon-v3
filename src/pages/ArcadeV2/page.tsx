import AnimatedPage from "../../components/AnimatedPage";
import { Suspense, lazy, useMemo, useState } from "react";
import LoadingSpinner from "../../components/LoadingSpinner.tsx";
import ArcadePlayOverlay from "../Arcade/ArcadePlayOverlay.tsx";
import LeaderboardDialog from "../Arcade/LeaderboardDialog.tsx";
import { createArcadeGames, useIsMobileArcade, type MachineData } from "../Arcade/games.tsx";
import { useArcadeSelection } from "../Arcade/useArcadeSelection.ts";
import { communityGameToMachine, useCommunityGames } from "../Arcade/communityGames.tsx";
import { Link, useSearchParams } from "react-router-dom";
import { FaPlus } from "react-icons/fa";
import { useNavigatorContext } from "../../components/navigator/context.tsx";

const CartridgeArcade = lazy(() => import("./CartridgeArcade.tsx"));

type Section = "arcade" | "community";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "arcade", label: "Arcade" },
  { key: "community", label: "Community" },
];

// Phones only get the games that work by touch
const forDevice = (games: MachineData[], isMobile: boolean) =>
  isMobile ? games.filter((game) => game.availableOnMobile !== false) : games;

// The cartridge arcade: one cabinet, a shelf of games. Served at /arcade; the
// old ring-of-cabinets page (pages/Arcade/page.tsx) is kept, unrouted, in
// case we swap back.
//
// Two sections share the cabinet: the house games, and games players made
// (?shelf=community). Each gets the whole shelf, so the community section can
// grow without shrinking the house games' cartridges.
export default function ArcadeV2() {
  const isMobileArcade = useIsMobileArcade();
  const houseGames = useMemo(createArcadeGames, []);
  const community = useCommunityGames();
  const communityGames = useMemo(
    () => (community.data ?? []).map((game) => communityGameToMachine(game)),
    [community.data]
  );
  const { height: headerHeight } = useNavigatorContext();
  const visibleHouse = useMemo(() => forDevice(houseGames, isMobileArcade), [houseGames, isMobileArcade]);
  const visibleCommunity = useMemo(() => forDevice(communityGames, isMobileArcade), [communityGames, isMobileArcade]);
  const allVisible = useMemo(() => [...visibleHouse, ...visibleCommunity], [visibleHouse, visibleCommunity]);
  const { initialMachineName, playingGame, selectGame, playGame, closeGame } =
    useArcadeSelection(allVisible, isMobileArcade);
  const [leaderboardGame, setLeaderboardGame] = useState<MachineData | null>(null);

  // The section in the URL, or else the one holding the game a link points at
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("shelf");
  const section: Section =
    requestedSection === "community" || requestedSection === "arcade"
      ? requestedSection
      : visibleCommunity.some((game) => game.name === initialMachineName)
        ? "community"
        : "arcade";
  const shelfGames = section === "community" ? visibleCommunity : visibleHouse;
  const showSection = (next: Section) =>
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.set("shelf", next);
        return params;
      },
      { replace: true }
    );

  let shelf;
  if (community.isPending) {
    // Wait for the community games (or their failure) so a link to one lands on it
    shelf = <LoadingSpinner />;
  } else if (shelfGames.length === 0) {
    shelf = (
      <div className="flex h-screen w-screen items-center justify-center bg-black px-6">
        <div className="max-w-sm rounded-2xl border border-orange-500/40 bg-[#0b0710]/90 p-6 text-center text-orange-50">
          <h2 className="mb-2 text-xl font-bold text-orange-300">No community games yet</h2>
          <p className="mb-4 text-sm text-orange-100/75">
            {community.isError
              ? "Couldn't load the community games. Try again in a bit."
              : isMobileArcade && communityGames.length > 0
                ? "The community games so far need a keyboard. Try them on a computer."
                : "Players make these games themselves, with a little help from their AI. Yours could be the first."}
          </p>
          <Link
            to="/profile/developer"
            className="inline-block rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-black transition hover:bg-orange-400"
          >
            Make a game
          </Link>
        </div>
      </div>
    );
  } else {
    // A fresh shelf per section (key), so each section's cartridges drop in
    shelf = (
      <CartridgeArcade
        key={section}
        games={shelfGames}
        initialGameName={initialMachineName}
        paused={Boolean(playingGame?.game)}
        onInsert={(game) => selectGame(game, { replace: true })}
        onPlay={playGame}
        onLeaderboard={setLeaderboardGame}
      />
    );
  }

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <Suspense fallback={<LoadingSpinner />}>{shelf}</Suspense>
      {!playingGame && (
        <>
          <div
            role="tablist"
            aria-label="Game shelves"
            className="absolute left-1/2 z-10 flex -translate-x-1/2 rounded-full border border-orange-500/40 bg-black/70 p-1 backdrop-blur-sm"
            style={{ top: headerHeight + 12 }}
          >
            {SECTIONS.map(({ key, label }) => {
              const count = key === "community" ? visibleCommunity.length : visibleHouse.length;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={section === key}
                  onClick={() => showSection(key)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    section === key ? "bg-orange-500 text-black" : "text-orange-100/80 hover:text-orange-50"
                  }`}
                >
                  {label}
                  {!community.isPending && <span className="ml-1.5 font-mono text-xs opacity-70">{count}</span>}
                </button>
              );
            })}
          </div>
          {section === "community" && shelfGames.length > 0 && (
            // Just a "+" on phones, where the section switcher needs the room
            <Link
              to="/profile/developer"
              aria-label="Make a game"
              className="absolute right-3 z-10 flex h-9 min-w-9 items-center justify-center rounded-full border border-orange-500/40 bg-black/60 px-3 text-xs font-semibold text-orange-100/80 backdrop-blur-sm transition hover:border-orange-300 hover:text-orange-50"
              style={{ top: headerHeight + 12 }}
            >
              <span className="hidden sm:inline">Make a game</span>
              <FaPlus aria-hidden="true" className="sm:hidden" />
            </Link>
          )}
        </>
      )}
      {leaderboardGame && (
        <LeaderboardDialog
          game={leaderboardGame.name}
          accent={leaderboardGame.cartridge.color}
          onClose={() => setLeaderboardGame(null)}
        />
      )}
      <ArcadePlayOverlay machine={playingGame} onClose={closeGame} returnPath="/arcade" />
    </AnimatedPage>
  );
}
