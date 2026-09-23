import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { MatchStore } from "../matchStore";
import { ARENA_VIEW_HEIGHT, ARENA_VIEW_WIDTH, ArenaScene } from "./ArenaScene";

export default function Arena({ store }: { store: MatchStore }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let game: Phaser.Game | null = null;
    let cancelled = false;

    // Banners use the site's Zombie font; make sure it's ready before Phaser
    // rasterises any text with it.
    document.fonts
      .load("32px Zombie")
      .catch(() => undefined)
      .finally(() => {
        if (cancelled || !containerRef.current) return;
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: containerRef.current,
          width: ARENA_VIEW_WIDTH,
          height: ARENA_VIEW_HEIGHT,
          backgroundColor: "#0b0617",
          pixelArt: true,
          audio: { noAudio: true },
          banner: false,
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          scene: new ArenaScene(store),
        });
      });

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, [store]);

  return (
    <div
      ref={containerRef}
      className="aspect-video w-full overflow-hidden rounded-lg border border-purple-900/70 bg-[#0b0617] shadow-2xl"
      role="img"
      aria-label="Live Monster Bash arena"
    />
  );
}
