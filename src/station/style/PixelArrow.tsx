// A pointed enamel sign drawn in big pixels, like the scene: the turn signs, and (smaller)
// the way back. One character per pixel: o outline, c cream, n navy, a the arrow.
const PIXELS = [
  "....ooooooooooooooo",
  "...occcccccccccccco",
  "..ocnnnnnnnnnnnnnco",
  ".ocnnnnnannnnnnnnco",
  "ocnnnnnaannnnnnnnco",
  "ocnnnnaaaaaaaaannco",
  "ocnnnnnaannnnnnnnco",
  ".ocnnnnnannnnnnnnco",
  "..ocnnnnnnnnnnnnnco",
  "...occcccccccccccco",
  "....ooooooooooooooo",
];
const COLOURS: Record<string, string> = { o: "#05070c", c: "#e8dcbc", n: "#1d2a3a", a: "#e8dcbc" };

export default function PixelArrow({ pointing = "left", className }: { pointing?: "left" | "right"; className?: string }) {
  return (
    <svg viewBox="0 0 20 12" shapeRendering="crispEdges" className={className} style={{ transform: pointing === "left" ? undefined : "scaleX(-1)" }} aria-hidden>
      {/* a hard shadow, one pixel down and right */}
      {PIXELS.map((row, y) => [...row].map((cell, x) => (cell === "." ? null : <rect key={`s${x}-${y}`} x={x + 1} y={y + 1} width={1} height={1} fill="rgba(0,0,0,0.55)" />)))}
      {PIXELS.map((row, y) => [...row].map((cell, x) => (cell === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLOURS[cell]} />)))}
    </svg>
  );
}
