import type { GameState } from "../../sim.ts";
import { TRAINING_BOARD } from "./training.ts";

// World-space vector art inherits the renderer's native-DPR transform.
export function renderTrainingGrounds(c: CanvasRenderingContext2D, s: GameState, motionTime = s.time): void {
  if (s.scene !== "hub") return;
  c.save();
  const bx = TRAINING_BOARD.x, by = TRAINING_BOARD.y;
  c.shadowColor = "rgba(111,236,226,.55)"; c.shadowBlur = 9;
  const board = c.createLinearGradient(bx - 14, by - 26, bx + 14, by - 6);
  board.addColorStop(0, "#1d555a"); board.addColorStop(1, "#132c3d");
  c.fillStyle = board; c.strokeStyle = "#83ddd4"; c.lineWidth = 1.2;
  c.beginPath(); c.roundRect(bx - 14, by - 26, 28, 20, 3); c.fill(); c.stroke();
  c.shadowBlur = 0; c.strokeStyle = "#d5fff1"; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(bx - 6, by - 19); c.lineTo(bx - 2, by - 14); c.lineTo(bx + 7, by - 23); c.stroke();
  c.fillStyle = "#83ddd4"; c.fillRect(bx - 1, by - 6, 2, 6);
  c.font = "600 7px system-ui, sans-serif"; c.textAlign = "center"; c.fillStyle = "#dcf7e9";
  c.fillText("TRAINING", bx, by + 10);
  const t = s.training;
  if (!t) { c.restore(); return; }
  if (t.kind === "time-trial") {
    c.setLineDash([3, 4]); c.strokeStyle = "rgba(255,221,123,.3)"; c.lineWidth = 1;
    c.beginPath(); t.rings.forEach((ring, i) => i ? c.lineTo(ring.x, ring.y) : c.moveTo(ring.x, ring.y)); c.stroke(); c.setLineDash([]);
    t.rings.forEach((ring, i) => {
      const active = i === t.ringIndex, passed = i < t.ringIndex, pulse = active ? 1 + Math.sin(motionTime * 5) * .06 : 1;
      c.globalAlpha = passed ? .2 : active ? 1 : .45;
      c.strokeStyle = passed ? "#83e5ad" : "#ffdc78"; c.lineWidth = active ? 2.5 : 1.5;
      c.shadowColor = "#ffcb65"; c.shadowBlur = active ? 9 : 0;
      c.beginPath(); c.ellipse(ring.x, ring.y, ring.radius * pulse, ring.radius * pulse, 0, 0, Math.PI * 2); c.stroke();
      c.shadowBlur = 0; c.font = "700 8px system-ui, sans-serif"; c.fillStyle = "#fff0b2";
      c.fillText(`${i + 1}`, ring.x, ring.y + 3);
    });
  }
  c.globalAlpha = 1;
  for (const target of t.targets) {
    c.save(); c.translate(target.x, target.y);
    c.globalAlpha = target.broken ? .2 : 1;
    c.fillStyle = "rgba(13,31,35,.35)"; c.beginPath(); c.ellipse(0, 13, 12, 5, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#4e6b71"; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 12); c.lineTo(0, 2); c.stroke();
    const face = c.createRadialGradient(-3, -5, 1, 0, 0, target.radius + 3);
    face.addColorStop(0, target.hitFlash > 0 ? "#fffdd7" : "#e5be6f"); face.addColorStop(1, "#815b40");
    c.fillStyle = face; c.strokeStyle = "#f4d38c"; c.lineWidth = 1.3;
    c.beginPath(); c.arc(0, 0, target.radius, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = target.broken ? "#9de2b8" : "#a34240"; c.lineWidth = 1.5;
    c.beginPath(); c.arc(0, 0, target.radius * .58, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "#fae8a1"; c.beginPath(); c.arc(0, 0, 2, 0, Math.PI * 2); c.fill();
    if (target.broken) { c.strokeStyle = "#c4ffe1"; c.beginPath(); c.moveTo(-5, -1); c.lineTo(-1, 3); c.lineTo(6, -5); c.stroke(); }
    c.restore();
  }
  c.restore();
}
