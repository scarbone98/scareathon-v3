import { useEffect, useRef } from "react";
import Phaser from "phaser";
import Game from "./scenes/Game.js";
import Preloader from "./scenes/Preloader.js";
import Title from "./scenes/Title.js";
import { isTouchDevice, worldSizeFor } from "./world.js";

function GameRenderer({ onLoad }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    // Clear any existing canvas elements
    container.innerHTML = '';

    // With a mouse the field is the 1280x800 it was drawn for; on a touch screen it takes
    // the shape of the screen (see world.js)
    const touch = isTouchDevice();

    const gameInstance = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      pixelArt: true,
      physics: {
        default: "arcade",
        arcade: { debug: false },
      },
      fps: {
        target: 60,
        forceSetTimeOut: true,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        ...worldSizeFor(container, touch),
      },
      // both thumbs, and a finger to spare
      input: { activePointers: 3 },
      scene: [Preloader, Title, Game],
      dom: {
        createContainer: true
      },
      callbacks: {
        preBoot: (game) => game.registry.set("touch", touch),
      },
    });

    // The phone is turned, or the browser's bars slide away
    const resizeObserver = new ResizeObserver(() => {
      if (!gameInstance.isBooted) return;
      gameInstance.scale.refresh();
      if (gameInstance.scene.isActive("title")) gameInstance.scene.getScene("title").refit();
    });
    resizeObserver.observe(container);

    const cleanup = onLoad(gameInstance);
    return () => {
      resizeObserver.disconnect();
      cleanup?.();
    };
  }, []);

  // Fills what the toolbar over it leaves. No scrolling, zooming or text selection under a tapping finger.
  return (
    <div
      ref={containerRef}
      id="phaser-game-container"
      style={{ zIndex: 50, width: '100vw', flex: '1 1 0', minHeight: 0, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
    />
  );
}

export default GameRenderer;
