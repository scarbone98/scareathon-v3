import type { GameState } from "../../game/sim";

const NPC_COLORS = ["#db947d", "#b09ccb", "#79aaa9", "#d7b46d", "#81a2c7"];
export function drawQuestNpc(c: CanvasRenderingContext2D, id: string, x: number, y: number, time: number): void {
  const seed = [...id].reduce((n, char) => n + char.charCodeAt(0), 0), color = NPC_COLORS[seed % NPC_COLORS.length];
  const bob = Math.sin(time * 2 + seed) * .45;
  c.save(); c.translate(x, y - bob);
  c.fillStyle = "#10223255"; c.beginPath(); c.ellipse(0, 0, 8, 3, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#243442"; c.fillRect(-5, -8, 4, 8); c.fillRect(1, -8, 4, 8);
  const coat = c.createLinearGradient(-7, -18, 6, -6); coat.addColorStop(0, color); coat.addColorStop(1, "#39475b");
  c.fillStyle = coat; c.beginPath(); c.roundRect(-7, -19, 14, 13, 3); c.fill();
  c.fillStyle = "#efd1b0"; c.beginPath(); c.ellipse(0, -24, 5, 6, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#4e3d42"; c.beginPath(); c.ellipse(0, -28, 5.5, 3.5, 0, Math.PI, Math.PI * 2); c.fill();
  c.fillStyle = "#273340"; c.fillRect(-3, -25, 1.2, 1.2); c.fillRect(2, -25, 1.2, 1.2);
  c.fillStyle = "#e0bb96"; c.fillRect(-8, -14, 3, 6); c.fillRect(5, -14, 3, 6);
  c.strokeStyle = "#ffffff50"; c.lineWidth = .6; c.beginPath(); c.moveTo(-4, -17); c.lineTo(-4, -8); c.stroke();
  c.restore();
}
// Called inside the hero's existing pose transform so the cloth follows motion.
export function drawQuestCosmetic(c: CanvasRenderingContext2D, s: GameState): void {
  if (!s.hubCosmetic) return;
  c.save();
  if (s.hubCosmetic === "bbq-apron") {
    const cloth = c.createLinearGradient(-5, -17, 6, -4); cloth.addColorStop(0, "#fff0cd"); cloth.addColorStop(1, "#caab7f");
    c.fillStyle = cloth; c.beginPath(); c.moveTo(-3, -18); c.lineTo(3, -18); c.lineTo(6, -6); c.lineTo(-6, -6); c.closePath(); c.fill();
    c.strokeStyle = "#80664d"; c.lineWidth = .6; c.strokeRect(-3, -11, 6, 3);
    c.fillStyle = "#ce7569"; c.beginPath(); c.arc(0, -15, 1.3, 0, Math.PI * 2); c.fill();
  } else if (s.hubCosmetic === "station-scarf") {
    c.fillStyle = "#79c4d5"; c.beginPath(); c.roundRect(-6, -22, 12, 3.5, 1.5); c.fill();
    c.fillStyle = "#50849f"; c.beginPath(); c.moveTo(3, -20); c.lineTo(6, -20); c.lineTo(8 + Math.sin(s.time * 5) * .7, -9); c.lineTo(4, -10); c.closePath(); c.fill();
    c.strokeStyle = "#c9f1e1"; c.lineWidth = .5; c.beginPath(); c.moveTo(-5, -21); c.lineTo(5, -21); c.stroke();
  }
  c.restore();
}
