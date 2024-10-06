import ArcadeGallery from "./ArcadeGallery.tsx";
import AnimatedPage from "../../components/AnimatedPage";
import { useState, Suspense, lazy } from "react";
import { supabase } from "../../supabaseClient";
import GameRenderer from "./GameRenderer.tsx";
import LoadingSpinner from "../../components/LoadingSpinner.tsx";
import Toolbar from "./Toolbar.tsx";
import { fetchWithAuth } from "../../fetchWithAuth.ts";
// @ts-ignore
const EightBitEvil = lazy(() => import("./8BitEvil/GameRenderer.jsx"));

interface CustomWindow extends Window {
  customFunctions?: {
    onDeath?: (score: number) => void;
  };
}

export default function Arcade() {
  const [selectedMachine, setSelectedMachine] = useState<any | null>(null);

  const machinesData = [
    {
      name: "8 Bit Evil Returns",
      videoUrl: "/game-recordings/8BitEvilReturnsMenu.mp4",
      game: (
        <GameRenderer
          title="8 Bit Evil Returns"
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
        <GameRenderer
          title="Hemlock's Tower"
          url="https://sclondon.github.io/Ascension/build/AscensionOutFromTheDeep.html"
        />
      ),
    },
    {
      name: "Ooidash",
      videoUrl: "/game-recordings/Ascension.mp4",
      game: (
        <GameRenderer
          title="Ooidash"
          url="https://scarbone98.github.io/Ooidash-web-remake/build/Ooidash.html"
          onLoad={() => {
            window.onmessage = async (e) => {
              if (e.data.type === "PLAYER_DIED") {
                await fetchWithAuth("/games/submitScore", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    game: "Ooidash",
                    metricName: "score",
                    metricValue: e.data.score,
                  }),
                }).then((res) => res.json());
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
      name: "8 Bit Evil",
      videoUrl: "/game-recordings/8BitEvil.mp4",
      game: (
        <Suspense fallback={<LoadingSpinner />}>
          <EightBitEvil
            onLoad={(gameInstance: any) => {
              if (!(window as CustomWindow).customFunctions) {
                (window as CustomWindow).customFunctions = {};
              }

              if ((window as CustomWindow).customFunctions) {
                ((window as CustomWindow).customFunctions ??= {}).onDeath =
                  async (score: number) => {
                    await fetchWithAuth("/games/submitScore", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        game: "8 Bit Evil",
                        metricName: "score",
                        metricValue: score,
                      }),
                    }).then((res) => res.json());
                  };
              }

              return () => {
                gameInstance?.destroy(true);
                (window as CustomWindow).customFunctions = {};
              };
            }}
          />
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
          <div className="relative h-fit w-fit flex justify-center items-center">
            {selectedMachine.game}
            <Toolbar currentGame={selectedMachine?.name} />
          </div>
        </div>
      )}
    </AnimatedPage>
  );
}
