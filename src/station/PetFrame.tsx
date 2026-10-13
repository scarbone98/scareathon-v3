import { useEffect, useRef, useState } from "react";
import PixelArrow from "./style/PixelArrow.tsx";

// One of the station's two creatures, kept in a game of its own: the cryptlin in the cellar
// under the trap door, the aquarium on top of the lockers. The game is a web build in a
// frame, loaded out of sight ahead of time (`built`) and brought in over the scene once the
// camera has gone into its place (`showing`) and the game says its first picture is drawn, so
// that the one hands over to the other with no loading screen between.
//
// The game and the page talk in messages named for the game (`prefix`: CRYPTLINS, AQUARIUM):
//   from the game: <PREFIX>_READY (its room is drawn), <PREFIX>_USED { item } (one used up)
//   to the game:   <PREFIX>_STOCK { items: { id: how many, or -1 for kept } }
//                  <PREFIX>_SHOW and <PREFIX>_HIDE (in front; covered or left: it rests)

type Props = {
  title: string;
  url: string;
  prefix: "CRYPTLINS" | "AQUARIUM";
  built: boolean; // the frame exists, loading or loaded
  showing: boolean; // the camera's there: bring the game in as soon as it's ready
  stock: Record<string, number>;
  stockKnown: boolean; // (signed in: once the account's been read)
  onUsed: (item: string) => void;
  onReady: () => void;
  onBack: () => void;
};

export default function PetFrame({ title, url, prefix, built, showing, stock, stockKnown, onUsed, onReady, onBack }: Props) {
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

  if (!built) return null;
  return (
    <div
      className="absolute inset-0 z-30 bg-black transition-opacity duration-700 ease-out"
      // (out of sight it's see-through, not hidden: a hidden frame's game may never draw its
      // first picture, and so never say it's ready)
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
  );
}
