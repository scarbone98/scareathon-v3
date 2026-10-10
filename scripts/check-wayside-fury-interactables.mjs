// Every overworld interactable must be reachable by the taxi from spawn: some
// drivable point at the movement radius lies inside the target's interaction
// radius. Progression locks are gates, not layout, so they are ignored here.
import assert from 'node:assert/strict';
import { OVERWORLD, COOP_OVERWORLD, isBlocked } from '../src/pages/WaysideFury/game/world.ts';
import { LOCATIONS } from '../src/pages/WaysideFury/game/content.ts';
import { COUNTY_STOPS } from '../src/pages/WaysideFury/game/county.ts';
import { INTERIORS } from '../server/shared/waysideFury/interiors.js';
import { HIDDEN_PICKUPS } from '../server/shared/waysideFury/collectibles.js';
import { HOUSE_KINDS, houseStyle } from '../src/pages/WaysideFury/game/houseVariants.ts';
import { houseDoor } from '../src/pages/WaysideFury/game/town.ts';

// Radii mirror interactTarget in sim.ts; the taxi moves with radius 7.
const MOVE_RADIUS = 7, STOP_RADIUS = 72, PROP_RADIUS = 46, DOOR_RADIUS = 46, PICKUP_RADIUS = 28, SPACING = 4;

function reachable(world) {
  const cols = Math.ceil(world.width / SPACING), rows = Math.ceil(world.height / SPACING), seen = new Uint8Array(cols * rows);
  const start = { c: Math.round(world.spawn.x / SPACING), r: Math.round(world.spawn.y / SPACING) };
  assert.equal(isBlocked(world, start.c * SPACING, start.r * SPACING, MOVE_RADIUS), false, `${world.id}: spawn is drivable`);
  const queue = [start]; seen[start.r * cols + start.c] = 1;
  for (let i = 0; i < queue.length; i++) {
    const { c, r } = queue[i];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, key = nr * cols + nc;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows || seen[key] || isBlocked(world, nc * SPACING, nr * SPACING, MOVE_RADIUS)) continue;
      seen[key] = 1; queue.push({ c: nc, r: nr });
    }
  }
  return { cols, rows, seen, count: queue.length };
}

function assertReachable(world, field, target, radius) {
  // Leave a little slack inside the radius so a target is never pixel-perfect.
  const reach = radius - 4;
  for (let r = Math.max(0, Math.floor((target.y - reach) / SPACING)); r <= Math.min(field.rows - 1, Math.ceil((target.y + reach) / SPACING)); r++)
    for (let c = Math.max(0, Math.floor((target.x - reach) / SPACING)); c <= Math.min(field.cols - 1, Math.ceil((target.x + reach) / SPACING)); c++)
      if (field.seen[r * field.cols + c] && Math.hypot(c * SPACING - target.x, r * SPACING - target.y) <= reach) return;
  assert.fail(`${world === OVERWORLD ? 'solo' : 'co-op'}: ${target.id} at ${target.x},${target.y} is not reachable from spawn within ${reach}`);
}

for (const world of [OVERWORLD, COOP_OVERWORLD]) {
  const solo = world === OVERWORLD, field = reachable(world), targets = [];
  for (const location of LOCATIONS) targets.push([location, STOP_RADIUS]);
  // County stops, interior doors and the lore sign exist only in the solo county.
  if (solo) {
    for (const stop of COUNTY_STOPS) targets.push([stop, PROP_RADIUS]);
    for (const room of INTERIORS.filter(room => room.parent === 'overworld')) targets.push([{ id: `${room.id}-door`, x: room.x, y: room.y }, DOOR_RADIUS]);
  }
  // Every drawn house door (the facade's door, mirrored for mirrored variants),
  // whether or not the house has an interior yet.
  for (const house of world.props.filter(p => HOUSE_KINDS.has(p.kind) && p.house)) targets.push([{ id: `${house.id}-front-door`, ...houseDoor(house, houseStyle(house).door) }, DOOR_RADIUS]);
  const sign = world.props.find(p => p.id === 'roadside-lore-sign');
  if (sign) targets.push([{ id: sign.id, x: sign.x + sign.w / 2, y: sign.y + sign.h }, PROP_RADIUS]);
  for (const pickup of HIDDEN_PICKUPS.filter(p => p.scene === 'overworld' && (solo || p.x < world.width && p.y < world.height))) targets.push([pickup, PICKUP_RADIUS]);
  for (const [target, radius] of targets) assertReachable(world, field, target, radius);
  console.log(`${solo ? 'solo' : 'co-op'}: ${targets.length} interactables reachable by taxi from spawn (${field.count} drivable samples)`);
}
