import { useEffect, useState } from "react";
import type { MachineData } from "../Arcade/games.tsx";
import { stillUrlFor } from "./cartridge.ts";

// Every cartridge at once, as a green-screen directory listing: a grid of the
// games' stills and names, with a search prompt along the bottom that filters
// by name or genre. Picking one jumps the shelf to it.

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

  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  // Keep each game's place in the full list: that's what onPick takes
  const shown = games
    .map((game, index) => ({ game, index }))
    .filter(({ game }) => !needle || `${game.name} ${game.cartridge.about.genre}`.toLowerCase().includes(needle));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="All games"
      className="fixed inset-0 z-40 flex flex-col p-2 sm:p-6 md:pt-24"
      style={{ background: "rgba(0, 0, 0, 0.7)" }}
      onClick={onClose}
    >
      {/* The terminal's glass, filling the screen (below the site nav on wide screens, which sits over everything) */}
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
          <span className="truncate">{needle ? `> ${shown.length} OF ${games.length} CARTS` : `> INDEX · ${games.length} CARTS`}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 whitespace-nowrap px-1.5 leading-6 focus:outline-none focus-visible:bg-[#39ff6a] focus-visible:text-[#021407] [@media(hover:hover)]:hover:bg-[#39ff6a] [@media(hover:hover)]:hover:text-[#021407]"
          >
            [ X ]
          </button>
        </div>
        <ul className="grid min-h-0 flex-1 grid-cols-3 content-start gap-2 overflow-y-auto p-3 sm:gap-3 sm:p-4 md:grid-cols-4">
          {shown.length === 0 && <li className="col-span-full py-6 text-xl">NO CARTRIDGE MATCHES "{query.toUpperCase()}"</li>}
          {shown.map(({ game, index }) => (
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
                  className="truncate px-1.5 py-0.5 text-base leading-5 sm:px-2 sm:py-1 sm:text-lg"
                  style={{ color: PHOSPHOR, textShadow: GLOW, background: index === current ? "rgba(57, 255, 106, 0.15)" : undefined }}
                >
                  {index === current ? "> " : ""}
                  {game.name.replace(/[‘’]/g, "'").toUpperCase()}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {/* The search prompt */}
        <label className="flex items-center gap-2 border-t-2 border-[#39ff6a]/30 px-4 py-2 text-2xl leading-none">
          <span aria-hidden="true">{"> SEARCH:"}</span>
          <input
            type="text"
            enterKeyHint="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter picks the first match
              if (event.key === "Enter" && shown.length > 0) onPick(shown[0].index);
            }}
            aria-label="Search games"
            placeholder="_"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent uppercase caret-[#39ff6a] outline-none placeholder:text-[#39ff6a]/50"
            style={{ color: PHOSPHOR, fontFamily: TERMINAL_FAMILY, textShadow: GLOW }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="shrink-0 px-1.5 leading-6 focus:outline-none focus-visible:bg-[#39ff6a] focus-visible:text-[#021407] [@media(hover:hover)]:hover:bg-[#39ff6a] [@media(hover:hover)]:hover:text-[#021407]"
            >
              [ CLR ]
            </button>
          )}
        </label>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0.22) 0 1px, transparent 1px 3px)" }}
        />
      </div>
    </div>
  );
}
