import { roadPoints, projectRoad } from "./roadNetwork.ts";
import { roadMask, roadInfrastructure } from './roadClearance.ts';
import { TILE, tileAt, overlaps, type WorldMap, type WorldProp, type CollisionRect } from './worldBuilder.ts';

// Check the complete authored sprite bounds as well as ground contacts.
// This also prevents a canopy from intersecting a tower or a house.
// Road-end barriers are authored infrastructure, not scenery.
export function placementRects(p: WorldProp): CollisionRect[] {
  return [{ x: p.x, y: p.y, w: p.w, h: p.h }, ...(p.footprints ?? [])];
}
export function terrainSupports(world: WorldMap, rect: CollisionRect): boolean {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > world.width || rect.y + rect.h > world.height) return false;
  for (let row = Math.floor(rect.y / TILE); row <= Math.floor((rect.y + rect.h - .001) / TILE); row++) {
    for (let col = Math.floor(rect.x / TILE); col <= Math.floor((rect.x + rect.w - .001) / TILE); col++) {
      if (['water', 'void', 'bridge'].includes(tileAt(world, col, row))) return false;
    }
  }
  return true;
}
export function propPlacementViolations(world: WorldMap): string[] {
  const errors: string[] = [], mask = roadMask(world);
  for (const [i, p] of world.props.entries()) {
    const bases = placementRects(p);
    if (bases.some(r => !terrainSupports(world, r))) errors.push(`${p.id}: invalid terrain`);
    if (!roadInfrastructure(p) && bases.some(r => mask.intersects(r, false))) errors.push(`${p.id}: road overlap`);
    for (const q of world.props.slice(i + 1)) if (bases.some(a => placementRects(q).some(b => overlaps(a, b)))) errors.push(`${p.id}/${q.id}: prop overlap`);
  }
  return errors;
}

// Reconcile after terrain/road shaping. Existing art, sizes and IDs travel
// unchanged with their bases. Decorative scatter with no valid slot is removed.
export function settleOverworldProps(world: WorldMap) {
  const mask = roadMask(world), placed: WorldProp[] = [];
  const priority = (p: WorldProp) => roadInfrastructure(p) ? 0 : ['station','home','shed','diner','water-tower','car','ambient-taxi','rocket','gantry','tank','control'].includes(p.kind) ? 1 : 2;
  for (const p of [...world.props].sort((a,b) => priority(a)-priority(b))) {
    const valid = (dx: number, dy: number) => placementRects(p).every(base => {
      const r = { ...base, x: base.x + dx, y: base.y + dy };
      return terrainSupports(world, r) && (roadInfrastructure(p) || !mask.intersects(r, false))
        && !placed.some(q => placementRects(q).some(b => overlaps(r, b)));
    });
    let offset: {dx: number; dy: number} | undefined = valid(0,0) ? {dx:0,dy:0} : undefined;
    if (!offset) for (let radius = 8; radius <= 160 && !offset; radius += 8) {
      for (let dy = -radius; dy <= radius && !offset; dy += 8) for (let dx = -radius; dx <= radius && !offset; dx += 8) {
        if (Math.max(Math.abs(dx),Math.abs(dy)) === radius && valid(dx,dy)) offset = {dx,dy};
      }
    }
    if (!offset) {
      if (priority(p) < 2 || p.interiorId) throw new Error(`${world.id}/${p.id}: no valid terrain placement`);
      continue;
    }
    p.x += offset.dx; p.y += offset.dy;
    for (const r of p.footprints ?? []) { r.x += offset.dx; r.y += offset.dy; }
    if (p.kind === 'mailbox') {
      const center = {x:p.x+p.w/2,y:p.y+p.h};
      const closest = world.roads.flatMap(r=>{const pts=roadPoints(r);return pts.slice(1).map((b,i)=>projectRoad(center,pts[i],b));}).sort((a,b)=>a.distance-b.distance)[0];
      if (closest) p.mailboxFacing = Math.atan2(closest.y-center.y,closest.x-center.x);
    }
    placed.push(p);
  }
  world.props = placed;
}
