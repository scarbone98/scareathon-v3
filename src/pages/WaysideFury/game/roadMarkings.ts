import { TILE, tileAt, type WorldMap } from './world';

export interface RoadMark { x: number; y: number; w: number; h: number; color: string }
const cache = new WeakMap<WorldMap, Map<number, RoadMark[]>>();
const pavement = (world: WorldMap, col: number, row: number) => col >= 0 && row >= 0 && col < world.cols && row < world.rows && ['road', 'bridge'].includes(tileAt(world, col, row));

// Measure entire road cross-sections, never tile parity. World-space rectangles
// are clipped to each tile, so a centerline on a tile/chunk boundary stays whole.
export function roadMarks(world: WorldMap, col: number, row: number): readonly RoadMark[] {
  let marks = cache.get(world);
  if (!marks) { marks = new Map(); cache.set(world, marks); }
  const key = row * world.cols + col;
  const saved = marks.get(key);
  if (saved) return saved;
  const result: RoadMark[] = [];
  if (!pavement(world, col, row)) return result;
  const x = col * TILE, y = row * TILE;
  const clip = (rx: number, ry: number, w: number, h: number, color: string) => {
    const left = Math.max(x, rx), top = Math.max(y, ry);
    const right = Math.min(x + TILE, rx + w), bottom = Math.min(y + TILE, ry + h);
    if (right > left && bottom > top) result.push({ x: left, y: top, w: right - left, h: bottom - top, color });
  };
  let left = col, right = col, top = row, bottom = row;
  while (pavement(world, left - 1, row)) left--;
  while (pavement(world, right + 1, row)) right++;
  while (pavement(world, col, top - 1)) top--;
  while (pavement(world, col, bottom + 1)) bottom++;
  const width = right - left + 1, height = bottom - top + 1;
  // Junctions are open asphalt; the four-tile county roads get a single
  // centered dash sequence, 12 units painted / 20 units clear on both axes.
  if (height <= 6 && width > height) {
    const center = (top + bottom + 1) * TILE / 2;
    for (let start = Math.floor(x / 32) * 32; start < x + TILE; start += 32) {
      const from = start + 10, to = start + 22;
      const columns = [Math.floor(from / TILE), Math.floor((to - .01) / TILE)];
      // Do not leave half a dash where its other tile enters a junction.
      if (from >= (left + 1) * TILE && to <= right * TILE && columns.every(c =>
        !pavement(world, c, top - 1) && !pavement(world, c, bottom + 1) && pavement(world, c, top) && pavement(world, c, bottom)))
        clip(from, center - .5, 12, 1, '#c7b68c');
    }
  } else if (width <= 6 && height > width) {
    const center = (left + right + 1) * TILE / 2;
    for (let start = Math.floor(y / 32) * 32; start < y + TILE; start += 32) {
      const from = start + 10, to = start + 22;
      const rows = [Math.floor(from / TILE), Math.floor((to - .01) / TILE)];
      if (from >= (top + 1) * TILE && to <= bottom * TILE && rows.every(r =>
        !pavement(world, left - 1, r) && !pavement(world, right + 1, r) && pavement(world, left, r) && pavement(world, right, r)))
        clip(center - .5, from, 1, 12, '#c7b68c');
    }
  }
  for (const [dx, dy, rx, ry, w, h] of [[-1, 0, x, y, 1, TILE], [1, 0, x + TILE - 1, y, 1, TILE], [0, -1, x, y, TILE, 1], [0, 1, x, y + TILE - 1, TILE, 1]]) {
    if (!pavement(world, col + dx, row + dy)) clip(rx, ry, w, h, '#929587');
  }
  marks.set(key, result);
  return result;
}
