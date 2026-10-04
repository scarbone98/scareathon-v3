import React from "react";

interface ToolbarProps {
  hasLeaderboard?: boolean;
  onLeaderboard: () => void;
  onClose: () => void;
}

// Drawn in big pixels, like the station's signs. One character per pixel.
const TROPHY = [
  "ccccccccc",
  "c.ccccc.c",
  "c.ccccc.c",
  ".ccccccc.",
  "..ccccc..",
  "...ccc...",
  "....c....",
  "..ccccc..",
];
const CROSS = [
  "cc...cc",
  "ccc.ccc",
  ".ccccc.",
  "..ccc..",
  ".ccccc.",
  "ccc.ccc",
  "cc...cc",
];

function PixelGlyph({ pixels, className }: { pixels: string[]; className?: string }) {
  return (
    <svg viewBox={`0 0 ${pixels[0].length} ${pixels.length}`} shapeRendering="crispEdges" fill="currentColor" className={className} aria-hidden>
      {pixels.map((row, y) => [...row].map((cell, x) => (cell === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />)))}
    </svg>
  );
}

const key = "flex shrink-0 items-center transition hover:bg-[#f2ead2]/10 active:bg-[#f2ead2]/20 focus:outline-none focus-visible:bg-[#f2ead2]/20";

// The strip over a game being played: a navy enamel plate with a cream rule, kept as
// thin as a thumb allows. Games are sized around it by GAME_TOOLBAR_HEIGHT (h-8).
const Toolbar: React.FC<ToolbarProps> = ({ hasLeaderboard = true, onLeaderboard, onClose }) => {
  return (
    <div className="z-40 flex h-8 w-full shrink-0 items-stretch border-b-2 border-[#f2ead2]/85 bg-[#1d2a3a] text-[#f2ead2]">
      {hasLeaderboard && (
        <button
          type="button"
          onClick={onLeaderboard}
          aria-label="Leaderboard"
          title="Leaderboard"
          className={`${key} w-11 justify-center border-r-2 border-[#f2ead2]/25`}
        >
          <PixelGlyph pixels={TROPHY} className="h-4 w-[1.125rem] text-amber-300" />
        </button>
      )}
      <span className="flex-1" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close game"
        title="Close game"
        className={`${key} w-11 justify-center border-l-2 border-[#f2ead2]/25`}
      >
        <PixelGlyph pixels={CROSS} className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default Toolbar;
