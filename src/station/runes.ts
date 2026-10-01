// The rune tablet over the track-side arch: a weathered stone carved with the day's code
// in Elder Futhark runes (one for each letter, as usually transliterated).
// Decoded and typed into WaysideOS, the code pays out tickets.

// Each rune as straight strokes in a box 0.6 wide by 1 tall (x right, y down)
type Stroke = [number, number, number, number];
const RUNES: Record<string, Stroke[]> = {
  A: [[0.1, 0, 0.1, 1], [0.1, 0, 0.5, 0.25], [0.1, 0.3, 0.5, 0.55]],
  B: [[0.1, 0, 0.1, 1], [0.1, 0, 0.5, 0.25], [0.5, 0.25, 0.1, 0.5], [0.1, 0.5, 0.5, 0.75], [0.5, 0.75, 0.1, 1]],
  D: [[0.05, 0, 0.05, 1], [0.55, 0, 0.55, 1], [0.05, 0, 0.55, 1], [0.55, 0, 0.05, 1]],
  E: [[0.05, 0, 0.05, 1], [0.55, 0, 0.55, 1], [0.05, 0, 0.3, 0.3], [0.3, 0.3, 0.55, 0]],
  F: [[0.1, 0, 0.1, 1], [0.1, 0.3, 0.5, 0.05], [0.1, 0.55, 0.5, 0.3]],
  G: [[0.05, 0, 0.55, 1], [0.55, 0, 0.05, 1]],
  H: [[0.1, 0, 0.1, 1], [0.5, 0, 0.5, 1], [0.1, 0.35, 0.5, 0.65]],
  I: [[0.3, 0, 0.3, 1]],
  J: [[0.25, 0.05, 0.05, 0.3], [0.05, 0.3, 0.25, 0.55], [0.35, 0.45, 0.55, 0.7], [0.55, 0.7, 0.35, 0.95]],
  K: [[0.5, 0.1, 0.1, 0.4], [0.1, 0.4, 0.5, 0.7]],
  L: [[0.15, 0, 0.15, 1], [0.15, 0, 0.5, 0.3]],
  M: [[0.05, 0, 0.05, 1], [0.55, 0, 0.55, 1], [0.05, 0, 0.55, 0.45], [0.55, 0, 0.05, 0.45]],
  N: [[0.3, 0, 0.3, 1], [0.1, 0.35, 0.5, 0.6]],
  O: [[0.3, 0, 0.55, 0.35], [0.3, 0, 0.05, 0.35], [0.55, 0.35, 0.05, 1], [0.05, 0.35, 0.55, 1]],
  P: [[0.1, 0, 0.1, 1], [0.1, 0, 0.35, 0.2], [0.35, 0.2, 0.55, 0.05], [0.1, 1, 0.35, 0.8], [0.35, 0.8, 0.55, 0.95]],
  R: [[0.1, 0, 0.1, 1], [0.1, 0, 0.5, 0.22], [0.5, 0.22, 0.1, 0.45], [0.1, 0.45, 0.5, 1]],
  S: [[0.45, 0.05, 0.1, 0.4], [0.1, 0.4, 0.5, 0.6], [0.5, 0.6, 0.15, 0.95]],
  T: [[0.3, 0, 0.3, 1], [0.3, 0, 0.05, 0.3], [0.3, 0, 0.55, 0.3]],
  U: [[0.1, 1, 0.1, 0], [0.1, 0, 0.5, 0.3], [0.5, 0.3, 0.5, 1]],
  W: [[0.1, 0, 0.1, 1], [0.1, 0, 0.45, 0.2], [0.45, 0.2, 0.1, 0.4]],
  Z: [[0.3, 0, 0.3, 1], [0.3, 0.4, 0.05, 0.05], [0.3, 0.4, 0.55, 0.05]],
};

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
  const letters = code.toUpperCase().split("").filter((letter) => RUNES[letter]);
  const glyphH = h * 0.56;
  const glyphW = glyphH * 0.6;
  const gap = glyphH * 0.35;
  const total = letters.length * glyphW + (letters.length - 1) * gap;
  const x0 = (w - total) / 2;
  const y0 = (h - glyphH) / 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Each stroke cut into the stone: a pale lip where the light catches its lower edge, then
  // the groove itself, dark
  [
    { colour: "rgba(205,195,175,0.55)", width: glyphH * 0.1, dy: glyphH * 0.025 },
    { colour: "#1e1914", width: glyphH * 0.085, dy: 0 },
  ].forEach(({ colour, width, dy }) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    letters.forEach((letter, i) => {
      const x = x0 + i * (glyphW + gap);
      ctx.beginPath();
      RUNES[letter].forEach(([ax, ay, bx, by]) => {
        ctx.moveTo(x + (ax / 0.6) * glyphW, y0 + ay * glyphH + dy);
        ctx.lineTo(x + (bx / 0.6) * glyphW, y0 + by * glyphH + dy);
      });
      ctx.stroke();
    });
  });
}
