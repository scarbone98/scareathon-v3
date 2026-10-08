import type { GameState } from "../../sim";
import { localFusion } from "./fusion";
const COLORS = { you: "#b0f3d1", joe: "#79ebff", matt: "#ffd06f", alex: "#bada86", jon: "#c39beb" };

/** Native-resolution contours complement the existing hero art. */
export function drawFusionForm(c: CanvasRenderingContext2D, s: GameState, seat: number, front: boolean, reducedMotion: boolean) {
  const form = localFusion(s, seat);
  if (!form) return;
  const time = reducedMotion ? 0 : s.time, [a, b] = form.heroes.map(hero => COLORS[hero]);
  c.save(); c.translate(s.x, s.y - 12);
  if (!front) {
    const glow = c.createRadialGradient(0, 0, 4, 0, 0, 29);
    glow.addColorStop(0, `${a}70`); glow.addColorStop(.65, `${b}35`); glow.addColorStop(1, `${b}00`);
    c.fillStyle = glow; c.fillRect(-29, -29, 58, 58);
    c.lineWidth = 1.1;
    for (let ring = 0; ring < 2; ring++) {
      c.strokeStyle = ring ? b : a; c.globalAlpha = .6;
      c.beginPath(); c.ellipse(0, 1, 15 + ring * 3, 23 + ring * 2, Math.sin(time * 2 + ring) * .25, time * (ring ? -2 : 2), time * (ring ? -2 : 2) + Math.PI * 1.6); c.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const phase = (time * .65 + i / 10) % 1, angle = i * 2.4 + time * .5;
      c.globalAlpha = Math.sin(phase * Math.PI) * .75;
      c.fillStyle = i % 2 ? a : b;
      c.beginPath(); c.arc(Math.cos(angle) * (15 + phase * 8), 12 - phase * 43, .55 + phase, 0, Math.PI * 2); c.fill();
    }
  } else {
    // A two-color shoulder mantle, belt, and crest define the combined form.
    c.globalAlpha = .94; c.strokeStyle = "#172031"; c.lineWidth = .7;
    c.fillStyle = a; c.beginPath(); c.moveTo(-8, -8); c.lineTo(-3, -10); c.lineTo(-1, 0); c.lineTo(-7, -1); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = b; c.beginPath(); c.moveTo(8, -8); c.lineTo(3, -10); c.lineTo(1, 0); c.lineTo(7, -1); c.closePath(); c.fill(); c.stroke();
    const belt = c.createLinearGradient(-6, 0, 6, 0); belt.addColorStop(0, a); belt.addColorStop(1, b);
    c.fillStyle = belt; c.fillRect(-5, 4, 10, 2);
    c.fillStyle = "#fff7d5"; c.beginPath(); c.moveTo(0, -17); c.lineTo(2, -14); c.lineTo(0, -11); c.lineTo(-2, -14); c.closePath(); c.fill();
  }
  c.restore();
}
