import ArcadeGallery from "./ArcadeGallery.tsx";
import AnimatedPage from "../../components/AnimatedPage";
import { useState, useEffect, Suspense, lazy } from "react";
import GameRenderer from "./8BitEvilReturns/8BitEvilReturns";
// @ts-ignore
const EightBitEvil = lazy(() => import("./8BitEvil/GameRenderer.jsx"));

// Add this at the top of your file
declare global {
  interface Window {
    UnityFullyLoaded: () => void;
  }
}

export default function Arcade() {
  const [selectedMachine, setSelectedMachine] = useState<any | null>(null);

  useEffect(() => {
    window.UnityFullyLoaded = () => {
      console.log("UnityFullyLoaded");
    };
  }, []);

  const machinesData = [
    {
      name: "8 Bit Evil Returns",
      game: (
        <GameRenderer url="https://scarbone98.github.io/8BitEvilReturnsBuild/" />
      ),
    },
    {
      name: "Godot Test",
      game: (
        <GameRenderer url="https://scarbone98.github.io/godot-html-test/Godot%20Tactical%20RPG.html" />
      ),
    },
    {
      name: "8 Bit Evil",
      game: (
        <Suspense fallback={<div>Loading...</div>}>
          <EightBitEvil />
        </Suspense>
      ),
    },
  ];

  const handleMachineSelected = (machine: any) => {
    setSelectedMachine(machine);
  };

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <ArcadeGallery
        machinesData={machinesData}
        onPlay={handleMachineSelected}
      />
      {selectedMachine?.game && (
        <div className="absolute top-0 left-0 w-full h-full bg-black bg-opacity-50 flex items-center justify-center">
          {selectedMachine.game}
        </div>
      )}
    </AnimatedPage>
  );
}
