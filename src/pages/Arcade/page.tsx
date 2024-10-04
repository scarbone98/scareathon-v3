import ArcadeGallery from "./ArcadeGallery.tsx";
import AnimatedPage from "../../components/AnimatedPage";
import { useState, Suspense, lazy } from "react";
import { supabase } from "../../supabaseClient";
import GameRenderer from "./8BitEvilReturns/8BitEvilReturns";
// @ts-ignore
const EightBitEvil = lazy(() => import("./8BitEvil/GameRenderer.jsx"));

export default function Arcade() {
  const [selectedMachine, setSelectedMachine] = useState<any | null>(null);

  const machinesData = [
    {
      name: "8 Bit Evil Returns",
      videoUrl: "/game-recordings/8BitEvilReturnsMenu.mp4",
      game: (
        <GameRenderer
          url="https://scarbone98.github.io/8BitEvilReturnsBuild/"
          onLoad={(iframe) => {
            window.onmessage = async (e) => {
              if (e.data.type === "unityReady") {
                const { data } = await supabase.auth.getUser();
                if (data) {
                  iframe.contentWindow?.postMessage(
                    { type: "authDetails", userId: data?.user?.id },
                    "*"
                  );
                }
              }
            };

            return () => {
              window.onmessage = null;
            };
          }}
        />
      ),
    },
    {
      name: "Hemlock's Tower",
      videoUrl: "/game-recordings/Ascension.mp4",
      game: (
        <GameRenderer url="https://sclondon.github.io/Ascension/build/AscensionOutFromTheDeep.html" />
      ),
    },
    // {
    //   name: "Ooidash",
    //   videoUrl: "/game-recordings/Ascension.mp4",
    //   game: (
    //     <GameRenderer url="https://scarbone98.github.io/Ooidash-web-remake/build/Ooidash.html" />
    //   ),
    // },
    {
      name: "8 Bit Evil",
      videoUrl: "/game-recordings/8BitEvil.mp4",
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
