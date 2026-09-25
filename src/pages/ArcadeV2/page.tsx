import AnimatedPage from "../../components/AnimatedPage";
import { Suspense, lazy, useMemo, useState } from "react";
import LoadingSpinner from "../../components/LoadingSpinner.tsx";
import ArcadePlayOverlay from "../Arcade/ArcadePlayOverlay.tsx";
import LeaderboardDialog from "../Arcade/LeaderboardDialog.tsx";
import { createArcadeGames, useIsMobileArcade, type MachineData } from "../Arcade/games.tsx";
import { useArcadeSelection } from "../Arcade/useArcadeSelection.ts";

import CrtTransition from "./CrtTransition.tsx";

const CartridgeArcade = lazy(() => import("./CartridgeArcade.tsx"));

// The cartridge arcade: one cabinet, a shelf of games. Not linked from the
// nav yet; it lives beside /arcade until it replaces it.
export default function ArcadeV2() {
  const isMobileArcade = useIsMobileArcade();
  const games = useMemo(createArcadeGames, []);
  const visibleGames = useMemo(
    () => (isMobileArcade ? games.filter((game) => game.availableOnMobile !== false) : games),
    [isMobileArcade, games]
  );
  const { initialMachineName, playingGame, selectGame, playGame, closeGame } =
    useArcadeSelection(visibleGames, isMobileArcade);
  const [leaderboardGame, setLeaderboardGame] = useState<MachineData | null>(null);
  // TV power-on into a game, power-off back out of it
  const [transition, setTransition] = useState<{ mode: "on" | "off"; game: MachineData | null } | null>(null);
  const startGame = (game: MachineData) => setTransition({ mode: "on", game });
  const leaveGame = () => setTransition({ mode: "off", game: null });

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <Suspense fallback={<LoadingSpinner />}>
        <CartridgeArcade
          games={visibleGames}
          initialGameName={initialMachineName}
          paused={Boolean(playingGame?.game)}
          onInsert={(game) => selectGame(game, { replace: true })}
          onPlay={startGame}
          onLeaderboard={setLeaderboardGame}
        />
      </Suspense>
      {leaderboardGame && (
        <LeaderboardDialog game={leaderboardGame.name} onClose={() => setLeaderboardGame(null)} />
      )}
      <ArcadePlayOverlay machine={playingGame} onClose={leaveGame} returnPath="/arcade-v2" />
      {transition && (
        <CrtTransition
          mode={transition.mode}
          onMidpoint={() => {
            if (transition.mode === "on" && transition.game) playGame(transition.game);
            else closeGame();
          }}
          onDone={() => setTransition(null)}
        />
      )}
    </AnimatedPage>
  );
}
