import { useEffect } from "react";
import Phaser from "phaser";
import Game from "./scenes/Game.js";
import Preloader from "./scenes/Preloader.js";
import Title from "./scenes/Title.js";
import { useNavigatorContext } from "../../../components/navigator/context";

function GameRenderer({ onLoad }) {
  const { height: headerHeight } = useNavigatorContext();

  const CONFIG = {
    type: Phaser.AUTO,
    parent: "phaser-game-container",
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
      width: 1280,
      height: 800,
    },
    scene: [Preloader, Title, Game],
    dom: {
      createContainer: true
    },
  };

  useEffect(() => {

    let gameInstance = null;
    const container = document.getElementById("phaser-game-container");
    // Clear any existing canvas elements
    container.innerHTML = '';
    
    gameInstance = new Phaser.Game(CONFIG);

    return onLoad(gameInstance);
  }, []);

  return (
    <div id="phaser-game-container" style={{zIndex: 50, width: '100vw', height: `calc(100vh - ${headerHeight}px)`, marginTop: `${headerHeight / 2}px`}}/>
  );
}

export default GameRenderer;