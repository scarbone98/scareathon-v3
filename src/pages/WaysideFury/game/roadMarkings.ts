import { TILE, tileAt, type CollisionRect, type WorldMap } from './world.ts';

export interface RoadMark extends CollisionRect { color: string; kind: 'lane' | 'edge' }
const cache = new WeakMap<WorldMap, Map<number, RoadMark[]>>();
const pavement = (world: WorldMap, col: number, row: number) => ['road', 'bridge'].includes(tileAt(world, col, row));
const overlaps = (a: CollisionRect, b: CollisionRect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Both renderers consume the same authored road axes. A short N/S branch can
// never become E/W because a junction or parking apron is wider than it is long.
export function roadMarks(world: WorldMap, col: number, row: number): readonly RoadMark[] {
  let marks = cache.get(world);
  if (!marks) { marks = new Map(); cache.set(world, marks); }
  const key = row * world.cols + col, saved = marks.get(key);
  if (saved) return saved;
  const result: RoadMark[] = [];
  if (!pavement(world, col, row)) return result;
  const x = col * TILE, y = row * TILE, tile = { x, y, w: TILE, h: TILE };
  const clip = (rect: CollisionRect, kind: RoadMark['kind'], color: string) => {
    const left = Math.max(x, rect.x), top = Math.max(y, rect.y);
    const right = Math.min(x + TILE, rect.x + rect.w), bottom = Math.min(y + TILE, rect.y + rect.h);
    if (right > left && bottom > top) result.push({ x: left, y: top, w: right - left, h: bottom - top, color, kind });
  };
  const segments = world.roads.filter(road => overlaps(road, tile));
  for (const road of segments) {
    const horizontal = road.direction === 'horizontal';
    const axis = horizontal ? x : y, begin = horizontal ? road.x : road.y;
    const end = begin + (horizontal ? road.w : road.h);
    const center = horizontal ? road.y + road.h / 2 : road.x + road.w / 2;
    for (let start = Math.floor(axis / 32) * 32; start < axis + TILE; start += 32) {
      const from = start + 10, to = start + 22;
      if (from < begin + TILE || to > end - TILE) continue;
      const dash = horizontal ? { x: from, y: center - .5, w: 12, h: 1 } : { x: center - .5, y: from, w: 1, h: 12 };
      // Open asphalt at every crossing, T junction and elbow. Reject a whole
      // dash, before tile clipping, so corners cannot leave a sideways fragment.
      if (world.roads.some(other => other.direction !== road.direction && overlaps(dash, other))) continue;
      if (![dash.x, dash.x + dash.w - .01].every(px => [dash.y, dash.y + dash.h - .01].every(py => tileAt(world, Math.floor(px / TILE), Math.floor(py / TILE)) === 'road'))) continue;
      clip(dash, 'lane', '#c7b68c');
    }
  }
  for (const [dx, dy, rx, ry, w, h] of [[-1, 0, x, y, 1, TILE], [1, 0, x + TILE - 1, y, 1, TILE], [0, -1, x, y, TILE, 1], [0, 1, x, y + TILE - 1, TILE, 1]]) {
    const entrance = segments.some(road => road.direction === 'horizontal'
      ? dx < 0 && x === road.x && road.start === 'entrance' || dx > 0 && x + TILE === road.x + road.w && road.end === 'entrance'
      : dy < 0 && y === road.y && road.start === 'entrance' || dy > 0 && y + TILE === road.y + road.h && road.end === 'entrance');
    if (!entrance && !pavement(world, col + dx, row + dy)) clip({ x: rx, y: ry, w, h }, 'edge', '#929587');
  }
  marks.set(key, result);
  return result;
}
