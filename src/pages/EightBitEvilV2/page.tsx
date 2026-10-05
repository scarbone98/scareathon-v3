import GameRenderer from "../Arcade/GameRenderer.tsx";
import { EIGHT_BIT_EVIL_RETURNS_V2_URL, sendSessionWhenReady, shareRoomLinks } from "../Arcade/games.tsx";

// /8ber?room=ABCD: an invite link from 8 Bit Evil Returns V2's co-op lobby.
// Opens the game full screen (signed in, like the arcade) and has it join the
// room straight away. Without a room it's just the game.
function roomFromLink() {
  const room = new URLSearchParams(window.location.search).get("room") ?? "";
  const code = room.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  return code.length === 4 ? code : "";
}

export default function EightBitEvilV2Page() {
  const room = roomFromLink();
  const url = room ? `${EIGHT_BIT_EVIL_RETURNS_V2_URL}&join=${room}` : EIGHT_BIT_EVIL_RETURNS_V2_URL;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <GameRenderer
        title="8 Bit Evil Returns V2"
        url={url}
        onLoad={(iframe) => {
          const stopSession = sendSessionWhenReady(iframe, url);
          const stopShare = shareRoomLinks(iframe, url);
          return () => {
            stopSession();
            stopShare();
          };
        }}
      />
    </div>
  );
}
