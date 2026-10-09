import type { CollisionRect } from "../world.ts";
import type { HeroObstacle } from "./obstacles.ts";

const HERO_COLOR = { you: "#b0f3d1", joe: "#79ebff", matt: "#ffd06f", alex: "#bada86", jon: "#c39beb" };
const speck = (seed: number) => ((Math.imul(seed + 17, 374761393) ^ 668265263) >>> 0) / 4294967296;

function stoneWall(ctx: CanvasRenderingContext2D, rect: CollisionRect) {
  const { x, y, w, h } = rect, height = 11;
  ctx.fillStyle = "#12201866";
  ctx.fillRect(x + 2, y + 2, w + 2, h + 2);
  const face = ctx.createLinearGradient(0, y - height, 0, y + h);
  face.addColorStop(0, "#9d9e80"); face.addColorStop(.4, "#6d7965"); face.addColorStop(1, "#374d43");
  ctx.fillStyle = face; ctx.fillRect(x, y - height, w, h + height);
  ctx.fillStyle = "#b4b399"; ctx.fillRect(x, y - height, w, 2);
  ctx.fillStyle = "#283e36"; ctx.fillRect(x, y + h - 2, w, 2);
  ctx.lineWidth = .8; ctx.strokeStyle = "#344b3e";
  if (w >= h) {
    for (let offset = 0; offset < w; offset += 13) {
      ctx.beginPath(); ctx.moveTo(x + offset, y - height + 2); ctx.lineTo(x + offset + 2, y + h - 2); ctx.stroke();
      ctx.fillStyle = "#b3b29466"; ctx.fillRect(x + offset + 3, y - height + 4, Math.min(7, w - offset - 3), 1);
    }
  } else {
    for (let offset = 0; offset < h; offset += 13) {
      ctx.beginPath(); ctx.moveTo(x, y + offset - height / 2); ctx.lineTo(x + w, y + offset - height / 2 + 2); ctx.stroke();
    }
  }
  ctx.fillStyle = "#7b98626b";
  for (let n = 0; n < Math.ceil((w + h) / 7); n++) {
    const px = x + speck(n + x) * Math.max(1, w - 3), py = y - height + speck(n + y + 51) * (h + height - 3);
    ctx.fillRect(px, py, 2, 1);
  }
}

function boulder(ctx: CanvasRenderingContext2D, obstacle: HeroObstacle) {
  const { x, y, w, h } = obstacle, top = y - 21;
  const shade = ctx.createLinearGradient(x, top, x + w, y + h);
  shade.addColorStop(0, "#c0b5a5"); shade.addColorStop(.36, "#939281"); shade.addColorStop(.72, "#69766c"); shade.addColorStop(1, "#3e514b");
  ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y - 2); ctx.lineTo(x + w * .17, top + 5);
  ctx.lineTo(x + w * .47, top); ctx.lineTo(x + w * .81, top + 4); ctx.lineTo(x + w, y - 1);
  ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fillStyle = shade; ctx.fill();
  ctx.strokeStyle = "#283a35"; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.fillStyle = "#d5c8b46b"; ctx.beginPath(); ctx.moveTo(x + 3, y - 3);
  ctx.lineTo(x + w * .23, top + 6); ctx.lineTo(x + w * .45, top + 3); ctx.lineTo(x + w * .28, y); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#293e39"; ctx.beginPath();
  ctx.moveTo(x + w * .56, top + 1); ctx.lineTo(x + w * .41, y - 7); ctx.lineTo(x + w * .61, y - 2);
  ctx.lineTo(x + w * .4, y + h); ctx.moveTo(x + w * .41, y - 7); ctx.lineTo(x + w * .2, y - 9);
  ctx.moveTo(x + w * .61, y - 2); ctx.lineTo(x + w * .82, y + 1); ctx.stroke();
  ctx.strokeStyle = "#dbd5b8"; ctx.lineWidth = .6; ctx.stroke();
  for (let n = 0; n < 13; n++) {
    ctx.fillStyle = n % 3 ? "#c6c0a650" : "#304b4370";
    ctx.fillRect(x + 3 + speck(n + 31) * (w - 6), y - 15 + speck(n + 77) * (h + 12), 1.6, .8);
  }
}

function vent(ctx: CanvasRenderingContext2D, obstacle: HeroObstacle, time: number) {
  const { x, y, w, h } = obstacle, top = y - 17;
  ctx.fillStyle = "#45545a"; ctx.fillRect(x, top, w, h + 17);
  ctx.fillStyle = "#102831"; ctx.fillRect(x + 3, top + 3, w - 6, h + 11);
  const metal = ctx.createLinearGradient(x, top, x + w, y + h);
  metal.addColorStop(0, "#c9d8cf"); metal.addColorStop(.5, "#839b9b"); metal.addColorStop(1, "#3e5961");
  ctx.fillStyle = metal;
  for (let offset = 5; offset < w - 3; offset += 5) {
    ctx.fillRect(x + offset, top + 3, 1.5, h + 11);
    ctx.fillStyle = "#dce8d380"; ctx.fillRect(x + offset, top + 4, .6, 9); ctx.fillStyle = metal;
  }
  for (let offset = 8; offset < h + 14; offset += 6) ctx.fillRect(x + 3, top + offset, w - 6, 1.2);
  ctx.strokeStyle = "#b5c0b0"; ctx.lineWidth = 1; ctx.strokeRect(x + .5, top + .5, w - 1, h + 16);
  for (const px of [x + 2, x + w - 2]) for (const py of [top + 2, y + h - 2]) {
    ctx.fillStyle = "#203b43"; ctx.beginPath(); ctx.arc(px, py, .9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = "#bce5e344"; ctx.lineWidth = .8;
  for (let n = 0; n < 3; n++) {
    const drift = ((time * 4 + n * 7) % 22) / 22;
    ctx.globalAlpha = Math.sin(drift * Math.PI) * .5;
    ctx.beginPath(); ctx.moveTo(x + w * .5 + n * 3 - 3, top - drift * 8);
    ctx.quadraticCurveTo(x + w * .5 - 4 + n * 3, top - drift * 8 - 3, x + w * .5 + n * 3, top - drift * 8 - 5); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function terminal(ctx: CanvasRenderingContext2D, obstacle: HeroObstacle, time: number) {
  const { x, y, w, h } = obstacle, top = y - 25;
  ctx.fillStyle = "#233b45"; ctx.fillRect(x, top, 5, h + 25); ctx.fillRect(x + w - 5, top, 5, h + 25);
  ctx.fillStyle = "#8da6a0"; ctx.fillRect(x + 1, top, 2, h + 24); ctx.fillRect(x + w - 4, top, 2, h + 24);
  ctx.fillStyle = "#0f232b"; ctx.fillRect(x - 1, top + 4, 10, 14);
  ctx.fillStyle = "#bada86"; ctx.fillRect(x + 1, top + 6, 6, 6);
  ctx.fillStyle = "#375e52"; ctx.fillRect(x + 2, top + 8, 4, .8); ctx.fillRect(x + 2, top + 10, 2, .8);
  ctx.fillStyle = "#e0d09a"; ctx.fillRect(x + 1, top + 15, 2, 1); ctx.fillRect(x + 5, top + 15, 2, 1);
  const pulse = .7 + .3 * Math.sin(time * 3);
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = "#5fd5c35e"; ctx.lineWidth = 4;
  for (let n = 0; n < 3; n++) {
    const py = top + 7 + n * 8;
    ctx.beginPath(); ctx.moveTo(x + 5, py); ctx.lineTo(x + w - 5, py); ctx.stroke();
  }
  ctx.strokeStyle = "#c2fff0"; ctx.lineWidth = .8;
  for (let n = 0; n < 3; n++) {
    ctx.beginPath(); ctx.moveTo(x + 5, top + 7 + n * 8); ctx.lineTo(x + w - 5, top + 7 + n * 8); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#607966"; ctx.fillRect(x + 5, y + h - 2, w - 10, 2);
}

function vines(ctx: CanvasRenderingContext2D, obstacle: HeroObstacle, time: number) {
  const { x, y, w, h } = obstacle, top = y - 19;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  for (let n = 0; n < 6; n++) {
    const startX = x + 2 + n * (w - 4) / 5, sway = Math.sin(time * 1.4 + n) * .8;
    const endX = x + w - 2 - n * (w - 4) / 5;
    ctx.beginPath(); ctx.moveTo(startX, y + h); ctx.bezierCurveTo(startX - 7, y - 6, endX + 6 + sway, top + 2, endX, top);
    ctx.strokeStyle = "#2c4e39"; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = n % 2 ? "#829759" : "#607b45"; ctx.lineWidth = 1.6; ctx.stroke();
    for (let leaf = 0; leaf < 3; leaf++) {
      const px = x + 4 + speck(n * 7 + leaf) * (w - 8), py = top + 3 + speck(n * 11 + leaf + 31) * (h + 14);
      ctx.fillStyle = n % 2 ? "#a3a568" : "#63864d";
      ctx.beginPath(); ctx.ellipse(px, py, 3.7, 1.6, n + leaf * .8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#d4bb85"; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 2, py - 3.5); ctx.lineTo(px + 1.2, py + .4); ctx.closePath(); ctx.fill();
    }
  }
  ctx.fillStyle = "#f0a46c";
  for (let n = 0; n < 4; n++) {
    ctx.beginPath(); ctx.arc(x + 5 + n * (w - 10) / 3, top + 7 + (n % 2) * 9, 1.4, 0, Math.PI * 2); ctx.fill();
  }
}

/** World-coordinate artwork; the caller owns viewport transforms and sorting. */
export function drawHeroObstacle(ctx: CanvasRenderingContext2D, obstacle: HeroObstacle, cleared: boolean, time: number, progress = 1): void {
  ctx.save();
  for (const wall of obstacle.walls) stoneWall(ctx, wall);
  const { x, y, w, h } = obstacle;
  ctx.fillStyle = cleared ? "#c6c8a225" : "#10251c60";
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2 + 2, w / 2 + 3, h / 2 + 3, 0, 0, Math.PI * 2); ctx.fill();
  if (cleared) {
    // Debris stays at the edges, leaving the walkable opening visibly clear.
    ctx.fillStyle = obstacle.kind === "vines" ? "#526641" : "#879283";
    for (const px of [x - 1, x + w - 1]) { ctx.fillRect(px, y + h - 2, 2, 2); ctx.fillRect(px + 1, y + h - 4, 1, 1); }
    if (progress >= 1) { ctx.restore(); return; }
    ctx.globalAlpha = 1-progress;
    ctx.translate(x+w/2,y+h/2); ctx.scale(1-progress*.7,1-progress*.7); ctx.translate(-x-w/2,-y-h/2);
  }
  if (obstacle.kind === "boulder") boulder(ctx, obstacle);
  else if (obstacle.kind === "vent") vent(ctx, obstacle, time);
  else if (obstacle.kind === "terminal") terminal(ctx, obstacle, time);
  else vines(ctx, obstacle, time);
  if (obstacle.requirement.kind === 'level') {
    // A diegetic warning plate remains readable at native canvas resolution.
    ctx.fillStyle='#302c25';ctx.fillRect(x+11,y-24,w-22,12);
    ctx.strokeStyle='#e5bd72';ctx.lineWidth=.7;ctx.strokeRect(x+11,y-24,w-22,12);
    ctx.fillStyle='#ffe1a0';ctx.font='bold 7px sans-serif';ctx.textAlign='center';ctx.fillText(`Lv ${obstacle.requirement.level}+`,x+w/2,y-15);
  }
  // A small hero-colored inset marks the gate without another text prompt.
  const badgeY = y - (obstacle.requirement.kind === "level" ? 33 : obstacle.kind === "terminal" ? 28 : 23), color = HERO_COLOR[obstacle.hero];
  ctx.fillStyle = "#10222d"; ctx.beginPath(); ctx.arc(x + w / 2, badgeY, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = .9; ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x + w / 2, badgeY - 1.8); ctx.lineTo(x + w / 2 + 1.7, badgeY);
  ctx.lineTo(x + w / 2, badgeY + 1.8); ctx.lineTo(x + w / 2 - 1.7, badgeY); ctx.closePath(); ctx.fill();
  ctx.restore();
}
