// Scareathon arcade hookup for community games. Load it from your game page:
//   <script src="https://www.scareathon.rip/arcade-sdk.js"></script>
// then call ScareathonArcade.ready() once the game is playable and
// ScareathonArcade.gameOver(score) once per run. Spec:
// https://www.scareathon.rip/arcade/create
(function () {
  var inArcade = window.parent !== window;
  function send(message) {
    if (inArcade) window.parent.postMessage(message, "*");
  }
  window.ScareathonArcade = {
    specVersion: 1,
    inArcade: inArcade,
    ready: function () {
      send({ type: "ARCADE_READY", specVersion: 1 });
    },
    gameOver: function (score) {
      send({ type: "PLAYER_DIED", score: Math.max(0, Math.floor(Number(score) || 0)) });
    },
  };
})();
