import ArcadeGallery from "./ArcadeGallery.tsx";
import AnimatedPage from "../../components/AnimatedPage";
import { useState, useEffect } from "react";
import GameRenderer from "./8BitEvilReturns/8BitEvilReturns";

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
      name: "Machine 1",
      description: "Description 1",
      image: "image1.jpg",
      game: null,
    },
    {
      name: "Machine 2",
      description: "Description 2",
      image: "image2.jpg",
      game: null,
    },
    {
      name: "Machine 3",
      description: "Description 3",
      image: "image3.jpg",
      game: <GameRenderer />,
    },
    {
      name: "Machine 4",
      description: "Description 4",
      image: "image4.jpg",
      game: null,
    },
    {
      name: "Machine 5",
      description: "Description 5",
      image: "image5.jpg",
      game: null,
    },
  ];

  const handleMachineSelected = (machine: any) => {
    setSelectedMachine(machine);
  };

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <ArcadeGallery
        machinesData={machinesData}
        onMachineSelected={handleMachineSelected}
      />
      {selectedMachine?.game && (
        <div className="absolute top-0 left-0 w-full h-full bg-black bg-opacity-50 flex items-center justify-center">
          {selectedMachine.game}
        </div>
      )}
    </AnimatedPage>
  );
}
