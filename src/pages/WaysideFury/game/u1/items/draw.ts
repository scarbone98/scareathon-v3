export interface ItemMarker { x: number; y: number; kind: "chip" | "relic" | "radar" | "summon"; color?: string }

export function drawWishOutfit(c: CanvasRenderingContext2D, x: number, y: number, color: string, glow: string, time: number) {
  c.save(); c.translate(x, y);
  const sway = Math.sin(time * 3) * 1.5;
  const cape = c.createLinearGradient(-7, -20, 7, 0);
  cape.addColorStop(0, glow); cape.addColorStop(.2, color); cape.addColorStop(1, "#20324c");
  c.fillStyle = cape; c.strokeStyle = glow; c.lineWidth = .6;
  c.beginPath(); c.moveTo(-5, -17); c.lineTo(5, -17); c.lineTo(9 + sway, -1);
  c.quadraticCurveTo(sway, -4, -9 + sway, -1); c.closePath(); c.fill(); c.stroke();
  for (let n = 0; n < 3; n++) {
    const angle = time * .7 + n * Math.PI * 2 / 3;
    c.globalAlpha = .5; c.fillStyle = glow;
    c.beginPath(); c.arc(Math.cos(angle) * 12, -12 + Math.sin(angle) * 4, .6, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

// Native-resolution vector details scale with the existing world camera/DPR.
// These markers have no physical footprint and never obscure solid scenery.
export function drawItemMarker(c: CanvasRenderingContext2D, item: ItemMarker, time: number, still: boolean) {
  const color = item.color ?? (item.kind === "relic" || item.kind === "summon" ? "#ffd69a" : "#8ae8f4");
  const t = still ? 0 : time, bob = Math.sin(t * 2.7 + item.x) * 1.4;
  c.save(); c.translate(item.x, item.y);
  c.fillStyle = "#101c2a55"; c.beginPath(); c.ellipse(0, 1, 8, 2.5, 0, 0, Math.PI * 2); c.fill();
  const glow = c.createRadialGradient(0, -9, 1, 0, -9, 12);
  glow.addColorStop(0, `${color}28`); glow.addColorStop(1, `${color}00`);
  c.fillStyle = glow; c.fillRect(-12, -21, 24, 24); c.translate(0, -9 + bob);
  c.lineWidth = .55; c.strokeStyle = `${color}a0`;
  if (item.kind === "chip") {
    c.fillStyle = "#173e4b"; c.fillRect(-6, -6, 12, 12); c.strokeRect(-6, -6, 12, 12);
    c.fillStyle = "#051d2a"; c.fillRect(-3, -3, 6, 6); c.strokeRect(-3, -3, 6, 6);
    for (const offset of [-4, 0, 4]) {
      c.beginPath(); c.moveTo(-8, offset); c.lineTo(-6, offset); c.moveTo(6, offset); c.lineTo(8, offset);
      c.moveTo(offset, -8); c.lineTo(offset, -6); c.moveTo(offset, 6); c.lineTo(offset, 8); c.stroke();
    }
    c.fillStyle = "#eaffff"; c.fillRect(-1, -1, 2, 2);
  } else if (item.kind === "radar") {
    c.fillStyle = "#153d42"; c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(0, 0, 4.5, -.8, .8); c.stroke();
    const angle = t * 1.6 - 1.2;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(angle) * 7, Math.sin(angle) * 7); c.stroke();
    c.fillStyle = "#e5fff3"; c.beginPath(); c.arc(3, -3, 1, 0, Math.PI * 2); c.fill();
  } else {
    c.rotate(still ? .2 : Math.sin(t * .6) * .18);
    const crystal = c.createLinearGradient(-7, -8, 7, 8);
    crystal.addColorStop(0, "#fff5dc"); crystal.addColorStop(.4, color); crystal.addColorStop(1, "#a66a71");
    c.fillStyle = crystal; c.beginPath(); c.moveTo(0, -10); c.lineTo(7, -1); c.lineTo(0, 9); c.lineTo(-7, -1); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = "#fff1d899"; c.beginPath(); c.moveTo(0, -10); c.lineTo(-2, -1); c.lineTo(0, 9); c.moveTo(-7, -1); c.lineTo(7, -1); c.stroke();
  }
  c.restore();
}
