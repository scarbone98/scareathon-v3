import { useEffect, useRef, useState } from "react";
import PixelArrow from "./style/PixelArrow.tsx";

// One of the station's two creatures, kept in a game of its own: the cryptlin in the cellar
// under the trap door, the aquarium on top of the lockers. The game is a web build in a
// frame, started once the camera has gone into its place (`showing`, then `built`) and
// brought in over the scene when the game says its first picture is drawn, so that the one
// hands over to the other with no loading screen between.
//
// Starting the game holds the page up for some seconds (the station's own picture can't move
// while it does), so the wait is covered by something that moves without the page's help:
// plain CSS animation, which the browser keeps going by itself. Down the trap door, bricks
// go by in the dark; at the aquarium, bubbles rise over the station's tank.
//
// The game and the page talk in messages named for the game (`prefix`: CRYPTLINS, AQUARIUM):
//   from the game: <PREFIX>_READY (its room is drawn), <PREFIX>_USED { item } (one used up)
//   to the game:   <PREFIX>_STOCK { items: { id: how many, or -1 for kept } }
//                  <PREFIX>_SHOW and <PREFIX>_HIDE (in front; covered or left: it rests)

type Props = {
  title: string;
  url: string;
  prefix: "CRYPTLINS" | "AQUARIUM";
  cover: "shaft" | "water"; // what the wait looks like
  built: boolean; // the frame exists, starting or started
  showing: boolean; // the camera's there: cover the scene, and bring the game in as soon as it's ready
  stock: Record<string, number>;
  stockKnown: boolean; // (signed in: once the account's been read)
  onUsed: (item: string) => void;
  onReady: () => void;
  onBack: () => void;
};

// Bricks for the shaft's wall, as a tile: the station's own brick, two courses
const BRICKS = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='120'><rect width='240' height='120' fill='#0c0908'/>" +
    "<rect x='3' y='3' width='114' height='54' fill='#3a2419'/><rect x='123' y='3' width='114' height='54' fill='#33201a'/>" +
    "<rect x='-57' y='63' width='114' height='54' fill='#2f1d16'/><rect x='63' y='63' width='114' height='54' fill='#3d271c'/><rect x='183' y='63' width='114' height='54' fill='#352118'/></svg>"
)}")`;

function Cover({ kind, up }: { kind: Props["cover"]; up: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden transition-opacity duration-300" style={{ opacity: up ? 1 : 0 }} aria-hidden>
      {kind === "shaft" ? (
        <>
          <div className="absolute inset-0 bg-black" />
          <div className="pet-shaft absolute inset-x-0 top-0 h-[calc(100%+240px)]" style={{ backgroundImage: BRICKS, backgroundSize: "240px 120px" }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.82) 62%, #000 100%)" }} />
        </>
      ) : (
        [8, 21, 33, 47, 58, 71, 84, 93].map((left, i) => (
          <span
            key={left}
            className="pet-bubble absolute bottom-0 rounded-full border border-[#d8f6ff]/70 bg-[#d8f6ff]/15"
            style={{ left: `${left}%`, width: 6 + (i % 3) * 5, height: 6 + (i % 3) * 5, animationDuration: `${3.2 + (i % 4) * 0.9}s`, animationDelay: `${-i * 0.7}s` }}
          />
        ))
      )}
      <style>{`
        @keyframes pet-shaft-by { from { transform: translateY(-240px) } to { transform: none } }
        .pet-shaft { animation: pet-shaft-by 0.42s linear infinite; will-change: transform }
        @keyframes pet-bubble-up { from { transform: translateY(20px); opacity: 0 } 12% { opacity: 1 } to { transform: translateY(-105vh); opacity: 0.7 } }
        .pet-bubble { animation: pet-bubble-up linear infinite; will-change: transform, opacity }
        @media (prefers-reduced-motion: reduce) { .pet-shaft, .pet-bubble { animation: none } }
      `}</style>
    </div>
  );
}

export default function PetFrame({ title, url, prefix, cover, built, showing, stock, stockKnown, onUsed, onReady, onBack }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const origin = new URL(url).origin;
  const latest = useRef({ onUsed, onReady });
  latest.current = { onUsed, onReady };
  const tell = (message: Record<string, unknown>) => frame.current?.contentWindow?.postMessage(message, origin);

  useEffect(() => {
    if (!built) {
      setReady(false);
      return;
    }
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      const type = (event.data as { type?: unknown } | null)?.type;
      if (type === `${prefix}_READY`) {
        setReady(true);
        latest.current.onReady();
      } else if (type === `${prefix}_USED` && typeof event.data.item === "string") latest.current.onUsed(event.data.item);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [built, origin, prefix]);

  // What it has, whenever that changes, and whether it's in front
  const visible = built && ready && showing;
  useEffect(() => {
    if (ready && stockKnown) tell({ type: `${prefix}_STOCK`, items: stock });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stockKnown, stock, prefix]);
  useEffect(() => {
    if (ready) tell({ type: visible ? `${prefix}_SHOW` : `${prefix}_HIDE` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, visible, prefix]);

  return (
    <>
      {showing && <Cover kind={cover} up={!visible} />}
      {built && (
        <div
          className="absolute inset-0 z-30 bg-black transition-opacity duration-700 ease-out"
          // (out of sight it's see-through, not hidden: a hidden frame's game may never draw
          // its first picture, and so never say it's ready)
          style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
          aria-hidden={!visible}
        >
          <iframe ref={frame} title={title} src={url} allow="autoplay" tabIndex={visible ? 0 : -1} className="absolute inset-0 h-full w-full border-0" />
          {visible && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to the station"
              title="Back"
              className="absolute left-2 z-10 flex min-h-11 items-center p-1 opacity-80 transition hover:opacity-100 active:translate-y-px md:left-3"
              style={{ top: "max(0.5rem, env(safe-area-inset-top))" }}
            >
              <PixelArrow className="h-8 w-[3.3rem]" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
