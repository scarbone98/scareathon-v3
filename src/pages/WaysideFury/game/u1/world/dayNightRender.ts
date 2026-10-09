import type { WorldMap } from "../../world.ts";
import type { DayNightSample } from "./dayNight.ts";

export interface NightLightFocus { x: number; y: number; faceX: number; faceY: number }
export interface NightGlowMonster { x: number; y: number; sprite?: string }
export interface DayNightLight {
  id: string;
  x: number; y: number; radius: number; color: string; intensity: number;
  kind: "lamp" | "portal" | "headlight" | "monster";
  angle?: number;
  spread?: number;
}
export interface LightingCamera { x: number; y: number; width: number; height: number }

/** The same world-space sources feed Canvas gradients and the 3D light layer. */
export function collectDayNightLights(world: WorldMap, sample: DayNightSample,
  focus?: NightLightFocus, monsters: ReadonlyArray<NightGlowMonster> = []): DayNightLight[] {
  if (sample.nightFactor <= 0 || world.id !== "overworld") return [];
  const lights: DayNightLight[] = [];
  for (const prop of world.props) {
    if (prop.kind === "lamp") lights.push({ id: prop.id, x: prop.x + prop.w / 2, y: prop.y + 5,
      radius: 62, color: "#ffd29b", intensity: sample.nightFactor * .72, kind: "lamp" });
    if (prop.kind === "portal") lights.push({ id: prop.id, x: prop.x + prop.w / 2, y: prop.y + prop.h * .55,
      radius: 54, color: "#b49afa", intensity: sample.nightFactor * .5, kind: "portal" });
  }
  if (focus) {
    const magnitude = Math.hypot(focus.faceX, focus.faceY);
    const fx = magnitude > .001 ? focus.faceX / magnitude : 1;
    const fy = magnitude > .001 ? focus.faceY / magnitude : 0;
    for (const side of [-1, 1]) lights.push({ id: `taxi-headlight-${side}`, x: focus.x + fx * 12 - fy * side * 5,
      y: focus.y - 3 + fy * 12 + fx * side * 5, radius: 104, color: "#fff4c8",
      intensity: sample.nightFactor * .64, kind: "headlight", angle: Math.atan2(fy, fx), spread: .43 });
  }
  for (let i = 0; i < monsters.length; i++) {
    const monster = monsters[i];
    if (monster.sprite !== "ghost" && monster.sprite !== "pumpkin") continue;
    lights.push({ id: `night-monster-${i}`, x: monster.x, y: monster.y - 8, radius: monster.sprite === "ghost" ? 27 : 21,
      color: monster.sprite === "ghost" ? "#9ee6d9" : "#ffa75a", intensity: sample.nightFactor * .32, kind: "monster" });
  }
  return lights;
}

const isVisible = (light: DayNightLight, camera: LightingCamera) =>
  light.x + light.radius >= camera.x && light.x - light.radius <= camera.x + camera.width
  && light.y + light.radius >= camera.y && light.y - light.radius <= camera.y + camera.height;

function drawLight(ctx: CanvasRenderingContext2D, light: DayNightLight) {
  ctx.save(); ctx.translate(light.x, light.y);
  if (light.kind === "headlight") ctx.rotate(light.angle ?? 0);
  ctx.globalAlpha = light.intensity;
  const gradient = ctx.createRadialGradient(0, 0, 1, 0, 0, light.radius);
  gradient.addColorStop(0, light.color); gradient.addColorStop(.12, `${light.color}d0`);
  gradient.addColorStop(.58, `${light.color}35`); gradient.addColorStop(1, `${light.color}00`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  if (light.kind === "headlight") {
    const spread = light.spread ?? .43;
    ctx.moveTo(-2, -3); ctx.lineTo(light.radius * Math.cos(spread), -light.radius * Math.sin(spread));
    ctx.arc(0, 0, light.radius, -spread, spread); ctx.lineTo(-2, 3);
  } else ctx.arc(0, 0, light.radius, 0, Math.PI * 2);
  ctx.closePath(); ctx.fill();
  // Small luminous bulbs retain crisp detail at native DPR.
  if (light.kind === "lamp" || light.kind === "monster") {
    ctx.globalAlpha = Math.min(1, light.intensity * 1.4); ctx.fillStyle = light.color;
    ctx.beginPath(); ctx.ellipse(0, 0, light.kind === "lamp" ? 2.5 : 1.8, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/**
 * Call after world actors, with the renderer's existing world transform active.
 * No low-resolution mask is allocated; smooth gradients use the native canvas.
 */
export function drawDayNightLighting(ctx: CanvasRenderingContext2D, world: WorldMap,
  camera: LightingCamera, sample: DayNightSample, focus?: NightLightFocus,
  monsters: ReadonlyArray<NightGlowMonster> = []) {
  if (world.id !== "overworld" || (sample.nightFactor <= 0 && sample.warmTint <= 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = sample.nightFactor * .6;
  ctx.fillStyle = "#2b3b66"; ctx.fillRect(camera.x, camera.y, camera.width, camera.height);
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = sample.warmTint * .2;
  ctx.fillStyle = "#e4a170"; ctx.fillRect(camera.x, camera.y, camera.width, camera.height);
  ctx.globalCompositeOperation = "screen";
  for (const light of collectDayNightLights(world, sample, focus, monsters)) if (isVisible(light, camera)) drawLight(ctx, light);
  // Sparse roadside fireflies drift gently, without hiding monsters or roads.
  for (let n = 0; n < 13; n++) {
    const x = 340 + n * 59 + Math.sin(sample.seconds * .27 + n * 2.1) * 8;
    const y = 403 + Math.sin(n * 3.6) * 15 + Math.sin(sample.seconds * .36 + n) * 3;
    if (x < camera.x || x > camera.x + camera.width || y < camera.y || y > camera.y + camera.height) continue;
    ctx.globalAlpha = sample.nightFactor * (.3 + .16 * Math.sin(sample.seconds * 1.1 + n));
    ctx.fillStyle = "#d6f0b3"; ctx.beginPath(); ctx.arc(x, y, .8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
