import type { GameState } from "../../game/sim";
// Drawn in world coordinates at the renderer's native backing resolution.
export function drawArenaFloor(c: CanvasRenderingContext2D, s: GameState): void {
  if (s.scene !== "arena") return;
  c.save();
  const glow = c.createRadialGradient(320, 224, 40, 320, 224, 280);
  glow.addColorStop(0, "#e7c78218"); glow.addColorStop(.7, "#53b7d30c"); glow.addColorStop(1, "#09132160");
  c.fillStyle = glow; c.fillRect(32, 32, 576, 384);
  c.strokeStyle = "#d6ad6770"; c.lineWidth = 2; c.strokeRect(126, 94, 388, 260);
  c.strokeStyle = "#ebdbac30"; c.lineWidth = .6; c.strokeRect(132, 100, 376, 248);
  c.beginPath(); c.ellipse(320, 224, 74, 56, 0, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(306, 224); c.lineTo(320, 206); c.lineTo(334, 224); c.lineTo(320, 242); c.closePath(); c.stroke();
  for (const x of [112, 528]) for (const y of [80, 368]) {
    c.fillStyle = "#e9c67e"; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#edd19c20"; c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}
