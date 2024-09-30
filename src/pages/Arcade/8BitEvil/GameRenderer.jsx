import { useState, useEffect, useRef } from "react";
import Phaser from "phaser";
import Game from "./scenes/Game.js";
import Preloader from "./scenes/Preloader.js";
import Title from "./scenes/Title.js";
import LeaderBoardModal from "./leaderboard/LeaderBoardModal.jsx";

let instance = null;

function GameRenderer() {
  const [modalState, setModalState] = useState({
    visible: false,
    playAgainCallback: () => {},
    score: 0,
  });
  const modalTriggeredRef = useRef(false);

  useEffect(() => {
    if (!window.customFunctions) {
      window.customFunctions = {};
    }
    window.customFunctions.triggerLeaderBoardModal = (
      score,
      playAgainCallback
    ) => triggerModal(score, playAgainCallback);

    return () => {
      modalTriggeredRef.current = false;
    };
  }, []);

  function triggerModal(score, playAgainCallback) {
    if (!modalTriggeredRef.current) {
      setModalState({ visible: true, playAgainCallback, score });
      modalTriggeredRef.current = true;
    }
  }

  const CONFIG = {
    width: "100%",
    height: "100%",
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
    if (instance) {
      return;
    }

    let gameInstance = null;
    const container = document.getElementById("phaser-game-container");
    if (container) {
      // Clear any existing canvas elements
      container.innerHTML = '';
      
      gameInstance = new Phaser.Game(CONFIG);
      instance = gameInstance;
      if (!window.customFunctions) {
        window.customFunctions = {};
      }
      window.customFunctions.destroyGame = () => {
        gameInstance?.destroy(true);
        instance = null;
      };
    }
    return () => {
      gameInstance?.destroy(true);
      instance = null;
    };
  }, []);

  return (
    <>
      <div id="phaser-game-container" style={{ position: 'absolute', top: 100, left: 0, width: '100%', height: 'calc(100vh - 100px)', zIndex: 1 }} />
      {modalState.visible && (
        <LeaderBoardModal 
          playAgainCallback={() => {
            modalState.playAgainCallback();
            setModalState({ ...modalState, visible: false });
            modalTriggeredRef.current = false;
          }} 
          score={modalState.score} 
        />
      )}
    </>
  );
}

export default GameRenderer;