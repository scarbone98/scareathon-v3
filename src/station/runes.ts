// The rune tablet over the track-side arch: a weathered stone with the day's code carved
// in it, in plain letters cut in an old, rune-like face. Typed into WaysideOS, the code
// pays out tickets.

// The face the letters are cut in (loaded with the station's fonts, STATION_FONTS)
export const RUNE_FONT_FAMILY = "Metamorphous";

// The tablet: stone, chipped at the edges, and (once the day's code is in) its runes
export function drawRuneTablet(ctx: CanvasRenderingContext2D, w: number, h: number, code: string | null) {
  ctx.fillStyle = "#6d665c";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 3000; i += 1) {
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(40,34,28,0.18)" : "rgba(190,180,160,0.12)";
    ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2);
  }
  // Moss creeping up from the bottom, and a darker rim
  const moss = ctx.createLinearGradient(0, h, 0, h * 0.55);
  moss.addColorStop(0, "rgba(40,60,30,0.55)");
  moss.addColorStop(1, "rgba(40,60,30,0)");
  ctx.fillStyle = moss;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(25,20,16,0.6)";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  if (!code) return;
  // A clear margin all round: the letters keep well in from the rim
  const room = w * 0.78;
  let size = Math.round(h * 0.42);
  const text = code.toUpperCase().split("").join(" ");
  const face = (px: number) => `${px}px "${RUNE_FONT_FAMILY}", Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = face(size);
  // (shrunk to fit rather than squeezed, so the letters keep their shapes)
  const measured = ctx.measureText(text).width;
  if (measured > room) {
    size = Math.floor((size * room) / measured);
    ctx.font = face(size);
  }
  // Cut into the stone: a pale lip where the light catches the lower edge, then the groove
  ctx.fillStyle = "rgba(205,195,175,0.55)";
  ctx.fillText(text, w / 2, h / 2 + size * 0.05);
  ctx.fillStyle = "#1e1914";
  ctx.fillText(text, w / 2, h / 2);
}
