import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import MainScene from "./scenes/MainScene";
import PreloadScene from "./scenes/PreloadScene";
import { GameConfig } from "./config/GameConfig";

const AgeOfWeenGame: React.FC = () => {
  const gameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gameRef.current) {
      const config: Phaser.Types.Core.GameConfig = {
        ...GameConfig,
        parent: gameRef.current,
        scene: [PreloadScene, MainScene],
      };

      const game = new Phaser.Game(config);

      return () => {
        game.destroy(true);
      };
    }
  }, []);

  return <div ref={gameRef} />;
};

export default AgeOfWeenGame;
