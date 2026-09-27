import { useEffect } from "react";
import type { MachineData } from "../Arcade/games.tsx";
import { stillUrlFor } from "./cartridge.ts";

// Every cartridge at once, as a green-screen directory listing: a grid of the
// games' stills and names. Picking one jumps the shelf to it.

const PHOSPHOR = "#39ff6a";
const TERMINAL_FAMILY = `"VT323", ui-monospace, Menlo, Consolas, monospace`;
const GLOW = "0 0 6px rgba(57, 255, 106, 0.65), 0 0 1px rgba(57, 255, 106, 0.9)";

type Props = {
  games: MachineData[];
  current: number;
  onPick: (index: number) => void;
  onClose: () => void;
};

export default function CartridgeIndex({ games, current, onPick, onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="All games"
      className="fixed inset-0 z-40 flex flex-col p-2 sm:p-6"
      style={{ background: "rgba(0, 0, 0, 0.7)" }}
      onClick={onClose}
    >
      {/* The terminal's glass, filling the screen */}
      <div
        className="relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-2xl border-[10px] border-[#b9ab8e]"
        style={{
          background: "radial-gradient(ellipse at center, #06260f 0%, #021407 70%, #010a04 100%)",
          boxShadow: "inset 0 0 30px rgba(0,0,0,0.9), 0 10px 40px rgba(0,0,0,0.7)",
          color: PHOSPHOR,
          fontFamily: TERMINAL_FAMILY,
          textShadow: GLOW,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pb-1 pt-3 text-2xl leading-none">
          <span className="truncate">{`> INDEX · ${games.length} CARTS`}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 whitespace-nowrap px-1.5 leading-6 focus:outline-none focus-visible:bg-[#39ff6a] focus-visible:text-[#021407] [@media(hover:hover)]:hover:bg-[#39ff6a] [@media(hover:hover)]:hover:text-[#021407]"
          >
            [ X ]
          </button>
        </div>
        <ul className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-4 sm:grid-cols-3 md:grid-cols-4">
          {games.map((game, index) => (
            <li key={game.name}>
              <button
                type="button"
                onClick={() => onPick(index)}
                aria-current={index === current || undefined}
                className="group flex w-full flex-col overflow-hidden rounded-md border-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39ff6a]"
                style={{ borderColor: index === current ? PHOSPHOR : "rgba(57, 255, 106, 0.25)", textShadow: "none" }}
              >
                <div className="h-1.5" style={{ background: game.cartridge.color }} />
                <div className="relative aspect-video w-full bg-black">
                  {game.videoUrl && (
                    <img
                      src={stillUrlFor(game.videoUrl)}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover opacity-85 transition-opacity [@media(hover:hover)]:group-hover:opacity-100"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{ background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0.3) 0 1px, transparent 1px 3px)" }}
                  />
                </div>
                <span
                  className="truncate px-2 py-1 text-lg leading-5"
                  style={{ color: PHOSPHOR, textShadow: GLOW, background: index === current ? "rgba(57, 255, 106, 0.15)" : undefined }}
                >
                  {index === current ? "> " : ""}
                  {game.name.replace(/[‘’]/g, "'").toUpperCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0.22) 0 1px, transparent 1px 3px)" }}
        />
      </div>
    </div>
  );
}
