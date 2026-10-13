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
// plain CSS animation, which the browser keeps going by itself. Down the trap door, the
// last picture of the shaft itself is what keeps going: the page grows it towards you (see
// `station-sinking` there) as this darkens over it, so the fall carries on down into the
// black that the cellar comes up out of. At the aquarium, bubbles rise over the station's tank.
// The dark alone says nothing if the game is slow to come (a phone, a first visit): once it's
// down, a lamp swings on its flex in the black with a word under it, and a second word after
// a long while, so a wait reads as a wait.
//
// The game and the page talk in messages named for the game (`prefix`: CRYPTLINS, AQUARIUM):
//   from the game: <PREFIX>_READY (its room is drawn), <PREFIX>_USED { item } (one used up),
//                  <PREFIX>_RETURNED { item } (one taken back out: it's in stock again)
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
  onReturned: (item: string) => void;
  onReady: () => void;
  onBack: () => void;
};

function Cover({ kind, up }: { kind: Props["cover"]; up: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden transition-opacity duration-300" style={{ opacity: up ? 1 : 0 }} aria-hidden>
      {kind === "shaft" ? (
        <div className="pet-dark absolute inset-0 bg-black">
          <div className="pet-wait absolute inset-0 flex flex-col items-center justify-center gap-5">
            <div className="pet-lamp flex flex-col items-center">
              <span className="h-16 w-px bg-[#6b5a44]" />
              <span className="h-2 w-5 rounded-t-sm bg-[#3a4a44]" />
              <span className="h-4 w-4 rounded-full bg-[#ffe2a6] shadow-[0_0_18px_8px_rgba(255,196,110,0.45),0_0_60px_30px_rgba(255,170,80,0.18)]" />
            </div>
            <p className="text-sm tracking-[0.18em] text-[#e8dcc0]/80" style={{ fontFamily: "'Special Elite', 'Courier New', monospace" }}>
              Going down
              <span className="pet-dot">.</span>
              <span className="pet-dot" style={{ animationDelay: "0.25s" }}>.</span>
              <span className="pet-dot" style={{ animationDelay: "0.5s" }}>.</span>
            </p>
            <p className="pet-long text-xs tracking-[0.12em] text-[#e8dcc0]/55" style={{ fontFamily: "'Special Elite', 'Courier New', monospace" }}>
              It is a long way. Nearly there.
            </p>
          </div>
        </div>
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
        @keyframes pet-dark-in { from { opacity: 0 } to { opacity: 1 } }
        .pet-dark { animation: pet-dark-in 3.2s ease-in both; will-change: opacity }
        .pet-wait { animation: pet-dark-in 0.9s ease-out 2.6s both; will-change: opacity }
        .pet-long { animation: pet-dark-in 1.2s ease-out 14s both; will-change: opacity }
        @keyframes pet-lamp-swing { from { transform: rotate(-9deg) } to { transform: rotate(9deg) } }
        .pet-lamp { transform-origin: 50% 0; animation: pet-lamp-swing 1.9s ease-in-out infinite alternate; will-change: transform }
        @keyframes pet-dot-blink { 0%, 100% { opacity: 0.15 } 40% { opacity: 1 } }
        .pet-dot { animation: pet-dot-blink 1.2s ease-in-out infinite; will-change: opacity }
        @keyframes pet-bubble-up { from { transform: translateY(20px); opacity: 0 } 12% { opacity: 1 } to { transform: translateY(-105vh); opacity: 0.7 } }
        .pet-bubble { animation: pet-bubble-up linear infinite; will-change: transform, opacity }
        @media (prefers-reduced-motion: reduce) { .pet-dark, .pet-bubble, .pet-lamp, .pet-dot { animation: none } }
      `}</style>
    </div>
  );
}

export default function PetFrame({ title, url, prefix, cover, built, showing, stock, stockKnown, onUsed, onReturned, onReady, onBack }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const origin = new URL(url).origin;
  const latest = useRef({ onUsed, onReturned, onReady });
  latest.current = { onUsed, onReturned, onReady };
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
      else if (type === `${prefix}_RETURNED` && typeof event.data.item === "string") latest.current.onReturned(event.data.item);
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
