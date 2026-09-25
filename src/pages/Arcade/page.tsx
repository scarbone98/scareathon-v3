import AnimatedPage from "../../components/AnimatedPage";
import { Suspense, lazy, useMemo } from "react";
import LoadingSpinner from "../../components/LoadingSpinner.tsx";
import ArcadePlayOverlay from "./ArcadePlayOverlay.tsx";
import { createArcadeGames, useIsMobileArcade } from "./games.tsx";
import { useArcadeSelection } from "./useArcadeSelection.ts";

const ArcadeGallery = lazy(() => import("./ArcadeGallery.tsx"));

export default function Arcade() {
  const isMobileArcade = useIsMobileArcade();
  const machinesData = useMemo(createArcadeGames, []);

  const visibleMachinesData = useMemo(
    () =>
      isMobileArcade
        ? machinesData.filter((machine) => machine.availableOnMobile !== false)
        : machinesData,
    [isMobileArcade, machinesData]
  );

  const { initialMachineName, playingGame, selectGame, playGame, closeGame } =
    useArcadeSelection(visibleMachinesData, isMobileArcade);

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <Suspense fallback={<LoadingSpinner />}>
        <ArcadeGallery
          initialMachineName={initialMachineName}
          machinesData={visibleMachinesData}
          onPlay={(machine) => {
            selectGame(machine);
            playGame(machine);
          }}
          paused={Boolean(playingGame?.game)}
        />
      </Suspense>
      <ArcadePlayOverlay machine={playingGame} onClose={closeGame} returnPath="/arcade" />
    </AnimatedPage>
  );
}
