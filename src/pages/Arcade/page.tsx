import ArcadeGallery from "./ArcadeGallery.tsx";
import AnimatedPage from "../../components/AnimatedPage";
import { useState, useEffect } from "react";
import GameRenderer from "./8BitEvilReturns/8BitEvilReturns";
import GodotTest from "./GodotTest/GodotTest";

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
      videoUrl: "/game-recordings/8BitEvilReturnsMenu.mp4",
      game: (
        <GameRenderer url="https://scarbone98.github.io/8BitEvilReturnsBuild/" />
      ),
    },
    {
      name: "Ascension",
      videoUrl: "/game-recordings/Ascension.mp4",
      game: (
        <GameRenderer url="https://sclondon.github.io/Ascension/build/AscensionOutFromTheDeep.html" />
      ),
    },
    {
      name: "Godot Test 1",
      // videoUrl: "/game-recordings/8BitEvilReturnsMenu.mp4", // Update this path if you have a specific video for Godot Test
      game: <GodotTest />,
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
