import ArcadeGallery from "./ArcadeGallery.tsx";
import AnimatedPage from "../../components/AnimatedPage";
import { useState, useEffect, Suspense, lazy } from "react";
import GameRenderer from "./8BitEvilReturns/8BitEvilReturns";
import GodotTest from "./GodotTest/GodotTest";
const AgeOfWeenGame = lazy(() => import("./AgeOfWeen/AgeOfWeenGame.tsx"));

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
      description: "Description 3",
      image: "image3.jpg",
      game: <GameRenderer />,
    },
    {
      name: "Godot Test",
      description: "Description 2",
      image: "image2.jpg",
      game: <GodotTest />,
    },
    {
      name: "Age of Ween",
      description: "Description 2",
      image: "image2.jpg",
      game: (
        <Suspense fallback={<div>Loading...</div>}>
          <AgeOfWeenGame />
        </Suspense>
      ),
    }
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
