import { onRoad, roadDistance, roadPoints, roadWidth, type RoadPoint } from './roadNetwork.ts';
import { TILE, isBlocked, overlaps, tileAt, type CollisionRect, type WorldMap, type WorldProp } from './worldBuilder.ts';
import { isGroundProp, isWalkableSurface } from './walkableSurfaces.ts';

// Offline audit: flood the walkable space from the spawn with the same
// isBlocked() rule and hero radius that moveBody() uses, then check that every
// road, bridge, door and interactable sits inside that space. Never imported
// by the game; scripts/check-wayside-fury-reachability.mjs drives it.

export type IssueKind =
  | 'spawn-blocked' | 'unreachable-arrival' | 'unreachable-road' | 'bridge-end' | 'unreachable-bridge'
  | 'unreachable-door' | 'door-missing-building' | 'door-inside-building' | 'unreachable-target'
  | 'unreachable-prop' | 'structure-on-road' | 'structure-sprite-on-road' | 'structure-overlap'
  | 'prop-in-water' | 'prop-in-solid-terrain' | 'prop-in-structure' | 'prop-overlap' | 'sealed-area-open';
export interface ReachIssue {
  key: string; kind: IssueKind; severity: 'error' | 'warning';
  x: number; y: number; subject: string; detail: string; fix: string;
}
export interface AuditTarget { id: string; name: string; x: number; y: number; radius: number }
export interface AuditDoor { id: string; name: string; x: number; y: number; building?: string }
// An authored no-go zone (e.g. a fenced compound entered through its own map):
// the flood must never get inside, and its props are not reachability targets.
export interface SealedArea { id: string; name: string; rect: CollisionRect }
export interface AuditOptions {
  heroRadius?: number; grid?: number;
  doors?: AuditDoor[]; targets?: AuditTarget[]; arrivals?: AuditTarget[]; sealed?: SealedArea[];
}
export interface AuditStats { reachedArea: number; roadSamples: number; crossings: number; doors: number; targets: number; props: number }

// Buildings and large landmarks: never on a road, never inside each other.
const HOUSES = new Set<WorldProp['kind']>(['station', 'diner', 'home', 'shop', 'shed', 'water-tower', 'windmill', 'ruin-house']);
export const STRUCTURES = new Set<WorldProp['kind']>(['station', 'diner', 'home', 'shop', 'shed', 'water-tower', 'windmill', 'rocket', 'gantry', 'tank', 'control', 'locker', 'ruin-house']);
// Props the player is meant to walk up to, read, use or admire.
export const POINTS_OF_INTEREST = new Set<WorldProp['kind']>([...STRUCTURES, 'mailbox', 'sign', 'vending', 'bench', 'keeper', 'npc', 'chest', 'car', 'ambient-taxi', 'portal', 'socket', 'seal', 'lander', 'dish', 'flag', 'fountain', 'bbq']);
const SCENERY = new Set<WorldProp['kind']>(['tree', 'pine', 'bush', 'rock', 'dead-tree', 'flower', 'reeds', 'crate', 'debris', 'puddle']);
const PROP_REACH = 24;

const r1 = (n: number) => Math.round(n);
const solidRects = (p: WorldProp) => isGroundProp(p) ? [] : p.footprints ?? [];
const rectDistance = (r: CollisionRect, x: number, y: number) =>
  Math.hypot(x - Math.max(r.x, Math.min(x, r.x + r.w)), y - Math.max(r.y, Math.min(y, r.y + r.h)));
const label = (p: WorldProp) => `${p.id} (${p.kind}${p.label ? ` "${p.label}"` : ''})`;
const inBoundary = (m: WorldMap, r: CollisionRect) => r.x < 32 || r.y < 32 || r.x + r.w > m.width - 32 || r.y + r.h > m.height - 32;
function samples(r: CollisionRect, step = 4): RoadPoint[] {
  const out: RoadPoint[] = [];
  for (let y = r.y; y <= r.y + r.h; y += Math.min(step, Math.max(r.h, .01))) {
    for (let x = r.x; x <= r.x + r.w; x += Math.min(step, Math.max(r.w, .01))) out.push({ x: Math.min(x, r.x + r.w - .01), y: Math.min(y, r.y + r.h - .01) });
  }
  return out;
}

export interface WalkField {
  grid: number; cols: number; rows: number; reached: Uint8Array; start: RoadPoint | null;
  // Distance from (x, y) to the closest flooded node, or Infinity beyond maxRange.
  nearest(x: number, y: number, maxRange: number): number;
  // Distance from the rectangle to the closest flooded node, or Infinity beyond maxRange.
  nearestRect(r: CollisionRect, maxRange: number): number;
}
// 4-connected flood on a fine grid. An edge is open when both nodes and its
// midpoint are clear: moveBody() takes axis-separated steps of at most 4px.
export function walkField(world: WorldMap, from: RoadPoint, radius = 10, grid = 4): WalkField {
  const cols = Math.floor(world.width / grid) + 1, rows = Math.floor(world.height / grid) + 1;
  const state = new Uint8Array(cols * rows), reached = new Uint8Array(cols * rows);
  const open = (i: number) => {
    if (!state[i]) state[i] = isBlocked(world, (i % cols) * grid, Math.floor(i / cols) * grid, radius) ? 1 : 2;
    return state[i] === 2;
  };
  let start: RoadPoint | null = null;
  const sx = Math.round(from.x / grid), sy = Math.round(from.y / grid);
  // Snap to the nearest clear node in case the authored spawn sits on a boundary.
  search: for (let ring = 0; ring <= 8; ring++) for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
    const x = sx + dx, y = sy + dy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring || x < 0 || y < 0 || x >= cols || y >= rows || !open(y * cols + x)) continue;
    start = { x: x * grid, y: y * grid }; break search;
  }
  if (start) {
    const queue = new Int32Array(cols * rows); let head = 0, tail = 0;
    const first = Math.round(start.y / grid) * cols + Math.round(start.x / grid);
    reached[first] = 1; queue[tail++] = first;
    while (head < tail) {
      const i = queue[head++], x = i % cols, y = Math.floor(i / cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy, j = ny * cols + nx;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || reached[j] || !open(j)) continue;
        if (isBlocked(world, (x + dx / 2) * grid, (y + dy / 2) * grid, radius)) continue;
        reached[j] = 1; queue[tail++] = j;
      }
    }
  }
  const nearestRect = (r: CollisionRect, maxRange: number) => {
    let best = Infinity;
    const x0 = Math.max(0, Math.floor((r.x - maxRange) / grid)), x1 = Math.min(cols - 1, Math.ceil((r.x + r.w + maxRange) / grid));
    const y0 = Math.max(0, Math.floor((r.y - maxRange) / grid)), y1 = Math.min(rows - 1, Math.ceil((r.y + r.h + maxRange) / grid));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!reached[y * cols + x]) continue;
      const d = rectDistance(r, x * grid, y * grid);
      if (d < best) best = d;
    }
    return best <= maxRange ? best : Infinity;
  };
  return { grid, cols, rows, reached, start, nearestRect, nearest: (x, y, maxRange) => nearestRect({ x, y, w: 0, h: 0 }, maxRange) };
}

// Human-readable reasons a hero circle cannot stand at (x, y).
export function blockersAt(world: WorldMap, x: number, y: number, radius = 10): string[] {
  const out = new Set<string>();
  for (let row = Math.floor((y - radius) / TILE); row <= Math.floor((y + radius) / TILE); row++) {
    for (let col = Math.floor((x - radius) / TILE); col <= Math.floor((x + radius) / TILE); col++) {
      const tile = tileAt(world, col, row);
      if (world.collision[row * world.cols + col] || tile === 'void') out.add(`solid ${tile} tile ${col},${row}`);
      else if (tile === 'bridge') out.add(`bridge tile ${col},${row} outside the road ribbon`);
    }
  }
  for (const p of world.props) if ((p.footprints ?? []).some(r => rectDistance(r, x, y) < radius)) out.add(label(p));
  return [...out];
}
const why = (world: WorldMap, x: number, y: number, radius: number) => {
  const list = blockersAt(world, x, y, radius);
  return list.length ? `blocked by ${list.slice(0, 4).join(', ')}${list.length > 4 ? ` +${list.length - 4} more` : ''}` : 'clear here but enclosed: no walkable route from the spawn';
};

function polyline(points: RoadPoint[], step: number): (RoadPoint & { d: number })[] {
  const out: (RoadPoint & { d: number })[] = []; let run = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = i === 1 ? 0 : step - (run % step || step); d < length; d += step) out.push({ x: a.x + (b.x - a.x) * d / length, y: a.y + (b.y - a.y) * d / length, d: run + d });
    run += length;
  }
  const last = points[points.length - 1]; out.push({ ...last, d: run });
  return out;
}

// Exact road ribbon; entrance and barrier caps stop at their end plane, the way
// roadClearance() treats a road that ends at a facade or gate.
export function onRibbon(world: WorldMap, x: number, y: number): boolean {
  return world.roads.some(r => {
    const points = roadPoints(r);
    for (const [index, next, kind] of [[0, 1, r.start], [points.length - 1, points.length - 2, r.end]] as const) {
      if (kind === 'junction') continue;
      const p = points[index], q = points[next];
      const dx = r.direction === 'horizontal' ? Math.sign(q.x - p.x) : 0, dy = r.direction === 'vertical' ? Math.sign(q.y - p.y) : 0;
      if ((x - p.x) * dx + (y - p.y) * dy < 0) return false;
    }
    return roadDistance(r, x, y) <= roadWidth(r) / 2;
  });
}

export function auditWorld(world: WorldMap, options: AuditOptions = {}): { issues: ReachIssue[]; field: WalkField; stats: AuditStats } {
  const radius = options.heroRadius ?? 10, issues: ReachIssue[] = [];
  const stats: AuditStats = { reachedArea: 0, roadSamples: 0, crossings: 0, doors: options.doors?.length ?? 0, targets: (options.targets?.length ?? 0) + (options.arrivals?.length ?? 0), props: 0 };
  const sealed = options.sealed ?? [];
  const sealedProp = (p: WorldProp) => sealed.some(a => overlaps(a.rect, { x: p.x, y: p.y + p.h - 1, w: p.w, h: 1 }));
  // Builder IDs carry a list index that shifts whenever content is added, so
  // baseline keys name such props by kind and tile instead.
  const byId = new Map(world.props.map(p => [p.id, p]));
  const stable = (text: string) => text.replace(/[\w-]+-\d+\b/g, id => {
    const p = byId.get(id);
    return p && id === `${world.id}-${p.kind}-${id.split('-').at(-1)}` ? `${p.kind}@${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)}` : id;
  });
  const add = (issue: Omit<ReachIssue, 'key' | 'x' | 'y'> & { x: number; y: number; key?: string }) =>
    issues.push({ ...issue, x: r1(issue.x), y: r1(issue.y), key: `${world.id}:${issue.kind}:${stable(issue.key ?? issue.subject)}` });
  const field = walkField(world, world.spawn, radius, options.grid ?? 4);
  if (!field.start) {
    add({ kind: 'spawn-blocked', severity: 'error', x: world.spawn.x, y: world.spawn.y, subject: 'spawn', detail: `spawn is ${why(world, world.spawn.x, world.spawn.y, radius)}`, fix: 'Move the spawn onto open ground.' });
    return { issues, field, stats };
  }
  stats.reachedArea = field.reached.reduce((sum, n) => sum + n, 0) * field.grid ** 2;
  for (const area of sealed) {
    const inner = { x: area.rect.x + 12, y: area.rect.y + 12, w: area.rect.w - 24, h: area.rect.h - 24 };
    let leak: RoadPoint | null = null;
    for (let y = Math.ceil(inner.y / field.grid); !leak && y * field.grid <= inner.y + inner.h; y++) for (let x = Math.ceil(inner.x / field.grid); x * field.grid <= inner.x + inner.w; x++) {
      if (field.reached[y * field.cols + x]) { leak = { x: x * field.grid, y: y * field.grid }; break; }
    }
    if (leak) add({ kind: 'sealed-area-open', severity: 'error', x: leak.x, y: leak.y, subject: area.id,
      detail: `${area.name} (${area.rect.x},${area.rect.y} ${area.rect.w}x${area.rect.h}) should be closed off but the hero can walk inside (first reached at ${r1(leak.x)},${r1(leak.y)})`,
      fix: 'Restore the missing wall/fence segment so the only way in is the authored gate.' });
  }
  const barriers = world.props.filter(p => p.kind === 'barrier').flatMap(p => p.footprints ?? []);
  const nearBarrier = (x: number, y: number) => barriers.some(r => rectDistance(r, x, y) < 16 + radius);

  for (const a of options.arrivals ?? []) if (field.nearest(a.x, a.y, a.radius) === Infinity) {
    add({ kind: 'unreachable-arrival', severity: 'error', x: a.x, y: a.y, subject: a.id, detail: `${a.name}: the hero arrives at ${r1(a.x)},${r1(a.y)} but that point is not connected to the spawn; ${why(world, a.x, a.y, radius)}`, fix: 'Move the entry point onto the connected road or clear the path to it.' });
  }

  // Roads: every centerline stretch must have a flooded node on the asphalt.
  for (const road of world.roads) {
    const reach = Math.max(4, roadWidth(road) / 2 - radius);
    let runStart: (RoadPoint & { d: number }) | null = null, runEnd: (RoadPoint & { d: number }) | null = null;
    const flush = () => {
      if (!runStart || !runEnd) return;
      const mid = { x: (runStart.x + runEnd.x) / 2, y: (runStart.y + runEnd.y) / 2 };
      add({ kind: 'unreachable-road', severity: 'error', x: mid.x, y: mid.y, subject: road.id, key: `${road.id}@${Math.round(runStart.d / 64)}`,
        detail: `road "${road.id}" from ${r1(runStart.x)},${r1(runStart.y)} to ${r1(runEnd.x)},${r1(runEnd.y)} (${r1(runEnd.d - runStart.d)}px) cannot be walked; ${why(world, runStart.x, runStart.y, radius)}`,
        fix: 'Clear the props or solid tiles on this stretch, or connect it to the rest of the network.' });
      runStart = runEnd = null;
    };
    for (const p of polyline(roadPoints(road), 8)) {
      stats.roadSamples++;
      if (nearBarrier(p.x, p.y) || p.x < 32 || p.y < 32 || p.x > world.width - 32 || p.y > world.height - 32) { flush(); continue; }
      if (field.nearest(p.x, p.y, reach) === Infinity) { runStart ??= p; runEnd = p; } else flush();
    }
    flush();
  }

  // Bridges: wherever a centerline crosses water, both banks must be dry,
  // walkable road, and the deck itself must be walkable end to end.
  for (const road of world.roads) {
    const line = polyline(roadPoints(road), 2), wet = (p: RoadPoint) => ['water', 'bridge'].includes(tileAt(world, Math.floor(p.x / TILE), Math.floor(p.y / TILE)));
    const reach = Math.max(4, roadWidth(road) / 2 - radius);
    for (let i = 0; i < line.length; i++) {
      if (!wet(line[i])) continue;
      let j = i; while (j + 1 < line.length && wet(line[j + 1])) j++;
      stats.crossings++;
      const a = line[i], b = line[j], name = `${road.id} bridge ${r1(a.x)},${r1(a.y)}→${r1(b.x)},${r1(b.y)}`;
      for (const [end, at, beyond] of [['start', a, line[Math.max(0, i - 6)]], ['end', b, line[Math.min(line.length - 1, j + 6)]]] as const) {
        const landed = beyond !== at && !wet(beyond) && onRoad(world, beyond.x, beyond.y);
        if (!landed) add({ kind: 'bridge-end', severity: 'error', x: at.x, y: at.y, subject: `${name} ${end}`, key: `${road.id}@${r1(a.x / 32)},${r1(a.y / 32)}:${end}`,
          detail: `${name}: the ${end} of the crossing does not land on dry road (${beyond === at ? 'the road ends over water' : `${tileAt(world, Math.floor(beyond.x / TILE), Math.floor(beyond.y / TILE))} at ${r1(beyond.x)},${r1(beyond.y)}`})`,
          fix: 'Extend the road past the water so the deck lands on a bank, or end it at a junction on land.' });
        else if (field.nearest(beyond.x, beyond.y, reach) === Infinity) add({ kind: 'bridge-end', severity: 'error', x: beyond.x, y: beyond.y, subject: `${name} ${end}`, key: `${road.id}@${r1(a.x / 32)},${r1(a.y / 32)}:${end}`,
          detail: `${name}: the ${end} bank at ${r1(beyond.x)},${r1(beyond.y)} is dry road but cannot be walked; ${why(world, beyond.x, beyond.y, radius)}`,
          fix: 'Clear the bank approach.' });
      }
      const gap = line.slice(i, j + 1).find(p => field.nearest(p.x, p.y, reach) === Infinity);
      if (gap) add({ kind: 'unreachable-bridge', severity: 'error', x: gap.x, y: gap.y, subject: name, key: `${road.id}@${r1(a.x / 32)},${r1(a.y / 32)}`,
        detail: `${name} (${r1(b.d - a.d)}px over water, deck ${roadWidth(road)}px) is not walkable at ${r1(gap.x)},${r1(gap.y)}; ${why(world, gap.x, gap.y, radius)}`,
        fix: 'Widen the ribbon over the water or remove the obstruction on the deck.' });
      i = j;
    }
  }
  // Deck props (bridge, boardwalk, dock): both short ends must touch walkable ground.
  for (const p of world.props.filter(p => isWalkableSurface(p) && ['bridge', 'broken-bridge', 'boardwalk', 'catwalk', 'dock'].includes(p.kind))) {
    const horizontal = (p.surface?.direction ?? (p.w >= p.h ? 'horizontal' : 'vertical')) === 'horizontal';
    const ends = horizontal ? [{ x: p.x - 8, y: p.y + p.h / 2 }, { x: p.x + p.w + 8, y: p.y + p.h / 2 }] : [{ x: p.x + p.w / 2, y: p.y - 8 }, { x: p.x + p.w / 2, y: p.y + p.h + 8 }];
    ends.forEach((e, n) => {
      if (field.nearest(e.x, e.y, 16) === Infinity) add({ kind: 'bridge-end', severity: 'error', x: e.x, y: e.y, subject: `${label(p)} ${n ? 'far' : 'near'} end`,
        detail: `${label(p)}: the ${n ? 'far' : 'near'} end at ${r1(e.x)},${r1(e.y)} has no walkable landing; ${why(world, e.x, e.y, radius)}`, fix: 'Land the deck on a road or bank and clear its approach.' });
    });
  }

  // Doors: reachable within the overworld interaction radius, outside the facade.
  for (const door of options.doors ?? []) {
    // Same match as attachInteriorDoors(): an untagged building of the right kind counts.
    const building = world.props.find(p => p.interiorId === door.id)
      ?? world.props.find(p => p.kind === door.building && Math.abs(p.x + p.w / 2 - door.x) < 60 && Math.abs(p.y + p.h - door.y) < 80);
    if (!building) add({ kind: 'door-missing-building', severity: 'warning', x: door.x, y: door.y, subject: door.id,
      detail: `${door.name}: door prompt at ${door.x},${door.y} has no ${door.building ?? 'building'} prop on this map`, fix: 'Attach the interior to a building on this map, or hide the door prompt here.' });
    else if ((building.footprints ?? []).some(r => rectDistance(r, door.x, door.y) === 0)) add({ kind: 'door-inside-building', severity: 'error', x: door.x, y: door.y, subject: door.id,
      detail: `${door.name}: door anchor sits inside the solid base of ${label(building)}`, fix: 'Move the door anchor just below the building base.' });
    const gap = field.nearest(door.x, door.y, 46);
    if (gap === Infinity) add({ kind: 'unreachable-door', severity: building ? 'error' : 'warning', x: door.x, y: door.y, subject: door.id,
      detail: `${door.name}: no walkable spot within the 46px door radius of ${door.x},${door.y}; ${why(world, door.x, door.y + 16, radius)}`, fix: 'Clear the apron in front of the door or move the building next to a path.' });
  }
  for (const t of options.targets ?? []) if (field.nearest(t.x, t.y, t.radius) === Infinity) {
    add({ kind: 'unreachable-target', severity: 'error', x: t.x, y: t.y, subject: t.id,
      detail: `${t.name}: no walkable spot within its ${t.radius}px interaction radius; ${why(world, t.x, t.y, radius)}`, fix: 'Move the anchor next to a path or clear what encloses it.' });
  }
  for (const p of world.props) {
    if (!POINTS_OF_INTEREST.has(p.kind) || p.kind === 'portal' && !p.footprints?.length || sealedProp(p)) continue;
    stats.props++;
    const rects = solidRects(p).length ? solidRects(p) : [{ x: p.x, y: p.y + p.h - 2, w: p.w, h: 2 }];
    if (rects.every(r => inBoundary(world, r))) continue;
    if (Math.min(...rects.map(r => field.nearestRect(r, PROP_REACH))) === Infinity) {
      const c = { x: p.x + p.w / 2, y: p.y + p.h + radius + 2 };
      add({ kind: 'unreachable-prop', severity: 'error', x: p.x + p.w / 2, y: p.y + p.h, subject: p.id,
        detail: `${label(p)} at ${r1(p.x)},${r1(p.y)}: the hero cannot get within ${PROP_REACH}px of it; ${why(world, c.x, c.y, radius)}`, fix: 'Move it beside a road or path, or clear the scenery around it.' });
    }
  }

  // Overlaps.
  const structures = world.props.filter(p => STRUCTURES.has(p.kind));
  for (const s of structures) {
    const hit = solidRects(s).flatMap(r => samples(r)).find(q => onRibbon(world, q.x, q.y));
    if (hit) add({ kind: 'structure-on-road', severity: 'error', x: hit.x, y: hit.y, subject: s.id,
      detail: `${label(s)}: solid base overlaps the road ribbon at ${r1(hit.x)},${r1(hit.y)}`, fix: 'Shift the building off the road (keep its door apron on the verge).' });
    else {
      const lower = { x: s.x, y: s.y + s.h / 2, w: s.w, h: s.h / 2 };
      const spill = samples(lower).find(q => onRibbon(world, q.x, q.y));
      if (spill) add({ kind: 'structure-sprite-on-road', severity: 'warning', x: spill.x, y: spill.y, subject: s.id,
        detail: `${label(s)}: lower half of the sprite (${r1(s.x)},${r1(s.y)} ${s.w}x${s.h}) is drawn over the road at ${r1(spill.x)},${r1(spill.y)}`, fix: 'Nudge the building away from the road so its facade sits on the verge.' });
    }
  }
  for (let i = 0; i < structures.length; i++) for (let j = i + 1; j < structures.length; j++) {
    const a = structures[i], b = structures[j];
    const solid = solidRects(a).some(r => solidRects(b).some(q => overlaps(r, q)));
    if (solid || HOUSES.has(a.kind) && HOUSES.has(b.kind) && overlaps({ x: a.x, y: a.y + a.h / 2, w: a.w, h: a.h / 2 }, { x: b.x, y: b.y + b.h / 2, w: b.w, h: b.h / 2 })) add({ kind: 'structure-overlap', severity: solid ? 'error' : 'warning', x: (a.x + b.x + (a.w + b.w) / 2) / 2, y: (a.y + b.y + (a.h + b.h) / 2) / 2, subject: `${a.id}+${b.id}`,
      detail: `${label(a)} and ${label(b)} ${solid ? 'have overlapping solid bases' : 'have overlapping lower sprites'}`, fix: 'Move one of the buildings apart.' });
  }
  for (const p of world.props) {
    const rects = solidRects(p);
    if (!rects.length || rects.every(r => inBoundary(world, r)) || p.kind === 'barrier') continue;
    let water: RoadPoint | undefined, solid: RoadPoint | undefined;
    for (const q of rects.flatMap(r => samples(r))) {
      const col = Math.floor(q.x / TILE), row = Math.floor(q.y / TILE), tile = tileAt(world, col, row);
      if (tile === 'water' || tile === 'bridge') water ??= q;
      else if (world.collision[row * world.cols + col]) solid ??= q;
    }
    if (water) add({ kind: 'prop-in-water', severity: POINTS_OF_INTEREST.has(p.kind) ? 'error' : 'warning', x: water.x, y: water.y, subject: p.id,
      detail: `${label(p)}: solid base stands in water at ${r1(water.x)},${r1(water.y)}`, fix: 'Move it onto the bank.' });
    else if (solid) add({ kind: 'prop-in-solid-terrain', severity: POINTS_OF_INTEREST.has(p.kind) ? 'error' : 'warning', x: solid.x, y: solid.y, subject: p.id,
      detail: `${label(p)}: solid base stands in solid ${tileAt(world, Math.floor(solid.x / TILE), Math.floor(solid.y / TILE))} terrain at ${r1(solid.x)},${r1(solid.y)}`, fix: 'Move it onto open ground.' });
  }
  for (const p of world.props) {
    if (STRUCTURES.has(p.kind) || isGroundProp(p) || p.kind === 'barrier') continue;
    const rects = solidRects(p).length ? solidRects(p) : [{ x: p.x, y: p.y + p.h - 4, w: p.w, h: 4 }];
    for (const s of structures) {
      const wall = solidRects(s).some(w => rects.some(r => overlaps(r, w)));
      // Drawn behind or into the facade: base inside the building's lower sprite.
      const facade = !wall && rects.some(r => overlaps(r, { x: s.x + 2, y: s.y + s.h / 2, w: s.w - 4, h: s.h / 2 - 1 }));
      if ((wall || facade) && !(SCENERY.has(p.kind) && facade)) add({ kind: 'prop-in-structure', severity: wall && solidRects(p).length ? 'error' : 'warning', x: p.x + p.w / 2, y: p.y + p.h, subject: `${p.id}@${s.id}`,
        detail: `${label(p)} ${wall ? 'is inside the solid wall of' : 'is drawn inside the facade of'} ${label(s)}`, fix: `Move the ${p.kind} out in front of or beside the building.` });
    }
  }
  const poi = world.props.filter(p => !STRUCTURES.has(p.kind) && POINTS_OF_INTEREST.has(p.kind) && solidRects(p).length);
  for (const p of poi) for (const q of world.props) {
    if (q === p || STRUCTURES.has(q.kind) || q.kind === 'barrier' || POINTS_OF_INTEREST.has(q.kind) && q.id < p.id) continue;
    if (solidRects(p).some(r => solidRects(q).some(o => overlaps(r, o)))) add({ kind: 'prop-overlap', severity: 'warning', x: p.x + p.w / 2, y: p.y + p.h, subject: `${p.id}+${q.id}`,
      detail: `${label(p)} overlaps ${label(q)}`, fix: `Separate the ${p.kind} from the ${q.kind}.` });
  }
  return { issues, field, stats };
}
