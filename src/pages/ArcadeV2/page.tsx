import AnimatedPage from "../../components/AnimatedPage";
import { Suspense, lazy, useMemo, useState } from "react";
import LoadingSpinner from "../../components/LoadingSpinner.tsx";
import ArcadePlayOverlay from "../Arcade/ArcadePlayOverlay.tsx";
import LeaderboardDialog from "../Arcade/LeaderboardDialog.tsx";
import { createArcadeGames, useIsMobileArcade, type MachineData } from "../Arcade/games.tsx";
import { useArcadeSelection } from "../Arcade/useArcadeSelection.ts";
import { communityGameToMachine, useCommunityGames } from "../Arcade/communityGames.tsx";
import { Link } from "react-router-dom";
import { useNavigatorContext } from "../../components/navigator/context.tsx";

const CartridgeArcade = lazy(() => import("./CartridgeArcade.tsx"));

// The cartridge arcade: one cabinet, a shelf of games. Served at /arcade; the
// old ring-of-cabinets page (pages/Arcade/page.tsx) is kept, unrouted, in
// case we swap back.
export default function ArcadeV2() {
  const isMobileArcade = useIsMobileArcade();
  const houseGames = useMemo(createArcadeGames, []);
  const community = useCommunityGames();
  // Community games go on the shelf after the house games
  const games = useMemo(
    () => [...houseGames, ...(community.data ?? []).map((game) => communityGameToMachine(game))],
    [houseGames, community.data]
  );
  const { height: headerHeight } = useNavigatorContext();
  const visibleGames = useMemo(
    () => (isMobileArcade ? games.filter((game) => game.availableOnMobile !== false) : games),
    [isMobileArcade, games]
  );
  const { initialMachineName, playingGame, selectGame, playGame, closeGame } =
    useArcadeSelection(visibleGames, isMobileArcade);
  const [leaderboardGame, setLeaderboardGame] = useState<MachineData | null>(null);

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <Suspense fallback={<LoadingSpinner />}>
        {/* The shelf is built once per game list, so wait for the community
            games (or their failure) rather than rebuilding it when they land */}
        {community.isPending ? <LoadingSpinner /> : <CartridgeArcade
          games={visibleGames}
          initialGameName={initialMachineName}
          paused={Boolean(playingGame?.game)}
          onInsert={(game) => selectGame(game, { replace: true })}
          onPlay={playGame}
          onLeaderboard={setLeaderboardGame}
        />}
      </Suspense>
      {!playingGame && (
        <Link
          to="/profile/developer"
          className="absolute right-3 z-10 rounded-full border border-orange-500/40 bg-black/60 px-3 py-1.5 text-xs font-semibold text-orange-100/80 backdrop-blur-sm transition hover:border-orange-300 hover:text-orange-50"
          style={{ top: headerHeight + 12 }}
        >
          Make a game
        </Link>
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
