import { addEnemy, type GameState, type Enemy } from "../../sim.ts";
import { getWorld, isBlocked, TILE } from "../../world.ts";
import { obstacleBlocks, worldSave } from "./obstacles.ts";
import { advanceDayNightSeconds, MAX_NIGHT_MONSTERS, planNightEncounter, sampleDayNight, sanitizeDayNightSeconds } from "./dayNight.ts";

export interface NightWorldRuntime { window: string | null }
export type NightAmbientEnemy = Enemy & { nightAmbient?: boolean };

/** Guests render the host clock; their own persisted clock is untouched. */
export function worldCycleSeconds(s: GameState): number {
  return sanitizeDayNightSeconds(s.coop?.role === "guest" ? s.coop.worldCycleSeconds ?? worldSave(s).cycleSeconds : worldSave(s).cycleSeconds);
}

export function advanceWorldClock(s: GameState, elapsedSeconds: number): void {
  if (s.coop?.role === "guest") return;
  const save = worldSave(s);
  save.cycleSeconds = advanceDayNightSeconds(save.cycleSeconds, elapsedSeconds);
  if (s.coop?.role === "host") s.coop.worldCycleSeconds = save.cycleSeconds;
}

export function resetNightEncounter(s: GameState): void {
  s.nightWorld = { window: null };
}

function nightPassable(s: GameState, x: number, y: number, radius: number): boolean {
  const world = getWorld("overworld", 0);
  if (isBlocked(world, x, y, radius) || obstacleBlocks(s, x, y, radius)) return false;
  // Keep creatures on shoulders, including their feet, so traffic stays clear.
  for (const [dx, dy] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]]) {
    const tile = world.tiles[Math.floor((y + dy) / TILE) * world.cols + Math.floor((x + dx) / TILE)];
    if (tile !== "grass") return false;
  }
  return true;
}

/** Ambient creatures never attack, block exits, award drops or consume combat RNG while wandering. */
export function updateNightOverworld(s: GameState, dt: number): void {
  if (s.coop?.role === "guest") return;
  s.nightWorld ??= { window: null };
  if (s.scene !== "overworld") { s.nightWorld.window = null; return; }
  const seconds = worldCycleSeconds(s);
  if (!sampleDayNight(seconds).isNight) {
    s.enemies = s.enemies.filter(enemy => !(enemy as NightAmbientEnemy).nightAmbient);
    s.nightWorld.window = null;
    return;
  }
  const cars = [{ x: s.x, y: s.y, radius: 24 }, ...(s.coop?.remoteHeroes ?? [])
    .filter(peer => peer.scene === "overworld").map(peer => ({ x: peer.x, y: peer.y, radius: 24 }))];
  let population = s.enemies.filter(enemy => (enemy as NightAmbientEnemy).nightAmbient && enemy.hp > 0).length;
  const plan = planNightEncounter(seconds, s.nightWorld.window, getWorld("overworld", 0), {
    authority: s.coop?.role ?? "solo", occupied: [...cars, ...s.enemies],
  });
  s.nightWorld.window = plan.window;
  for (const spawn of plan.spawns) {
    if (population >= MAX_NIGHT_MONSTERS) break;
    const offsets = [[0, 0], [-16, 0], [16, 0], [0, -16], [0, 16], [-32, 0], [32, 0], [0, -32], [0, 32]];
    const position = offsets.map(([dx, dy]) => ({ x: spawn.x + dx, y: spawn.y + dy }))
      .find(point => nightPassable(s, point.x, point.y, 7) && [...cars, ...s.enemies]
        .every(body => Math.hypot(point.x - body.x, point.y - body.y) > body.radius + 12));
    if (!position) continue;
    const enemy = addEnemy(s, "grunt", position.x, position.y) as NightAmbientEnemy;
    enemy.sprite = spawn.sprite ?? "ghost"; enemy.nightAmbient = true;
    enemy.speed = enemy.sprite === "ghost" ? 11 : 9;
    enemy.cooldown = 1_000_000; population++;
  }
  const step = Number.isFinite(dt) ? Math.min(.05, Math.max(0, dt)) : 0;
  if (step <= 0) return;
  for (const enemy of s.enemies as NightAmbientEnemy[]) {
    if (!enemy.nightAmbient || enemy.hp <= 0) continue;
    const angle = seconds * .14 + enemy.id * 2.399963;
    let dx = Math.cos(angle) * .45, dy = Math.sin(angle) * .45;
    for (const car of cars) {
      const awayX = enemy.x - car.x, awayY = enemy.y - car.y, distance = Math.hypot(awayX, awayY);
      if (distance >= 96) continue;
      const strength = (1 - distance / 96) * 2.4;
      dx += (distance > .001 ? awayX / distance : Math.cos(angle)) * strength;
      dy += (distance > .001 ? awayY / distance : Math.sin(angle)) * strength;
    }
    const speed = enemy.speed * Math.min(2.5, Math.hypot(dx, dy));
    const length = Math.hypot(dx, dy) || 1;
    const moveX = dx / length * speed * step, moveY = dy / length * speed * step;
    if (nightPassable(s, enemy.x + moveX, enemy.y, enemy.radius)) enemy.x += moveX;
    if (nightPassable(s, enemy.x, enemy.y + moveY, enemy.radius)) enemy.y += moveY;
    enemy.kx = 0; enemy.ky = 0;
  }
}
