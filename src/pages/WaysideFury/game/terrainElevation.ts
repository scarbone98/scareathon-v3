import { TILE, tileAt, type TileKind, type WorldMap } from "./worldBuilder.ts";

interface Terrace { x0: number; y0: number; x1: number; y1: number; rise: number }
export interface OverworldElevation {
  heights: Float32Array;
  waterLevels: Float32Array;
  heightAt(x: number, y: number): number;
}
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smooth = (min: number, max: number, value: number) => {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
};
const groundHeight = (x: number) => 4 + 6 * smooth(352, 592, x) + 2 * smooth(800, 1024, x);

function materialRegions(world: WorldMap, kind: TileKind): Terrace[] {
  const visited = new Uint8Array(world.tiles.length), regions: Terrace[] = [];
  for (let index = 0; index < world.tiles.length; index++) {
    if (visited[index] || world.tiles[index] !== kind) continue;
    const queue = [index]; visited[index] = 1;
    let x0 = world.cols, y0 = world.rows, x1 = 0, y1 = 0;
    for (let next = 0; next < queue.length; next++) {
      const cell = queue[next], col = cell % world.cols, row = Math.floor(cell / world.cols);
      x0 = Math.min(x0, col); y0 = Math.min(y0, row); x1 = Math.max(x1, col + 1); y1 = Math.max(y1, row + 1);
      for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const c = col + dc, r = row + dr, neighbor = r * world.cols + c;
        if (c < 0 || c >= world.cols || r < 0 || r >= world.rows || visited[neighbor] || world.tiles[neighbor] !== kind) continue;
        visited[neighbor] = 1; queue.push(neighbor);
      }
    }
    const rise = y0 * TILE < world.height * .35 ? 22 : y0 * TILE > world.height * .65 ? 14 : 16;
    regions.push({ x0: x0 * TILE, y0: y0 * TILE, x1: x1 * TILE, y1: y1 * TILE, rise });
  }
  return regions;
}

function terraceHeight(terrace: Terrace, x: number, y: number, border = TILE) {
  return terrace.rise * smooth(terrace.x0 - border, terrace.x0, x) * (1 - smooth(terrace.x1, terrace.x1 + border, x))
    * smooth(terrace.y0 - border, terrace.y0, y) * (1 - smooth(terrace.y1, terrace.y1 + border, y));
}

// The same NE–SW diagonal is used for mesh triangles and actor footing. Bilinear
// interpolation would float actors above, or sink them through, sloping quads.
export function terrainSurfaceHeight(heights: Float32Array, cols: number, rows: number, x: number, y: number): number {
  const gx = clamp(Number.isFinite(x) ? x / TILE : 0, 0, cols), gy = clamp(Number.isFinite(y) ? y / TILE : 0, 0, rows);
  const col = Math.min(cols - 1, Math.floor(gx)), row = Math.min(rows - 1, Math.floor(gy));
  const u = gx - col, v = gy - row, index = row * (cols + 1) + col;
  const nw = heights[index], ne = heights[index + 1], sw = heights[index + cols + 1], se = heights[index + cols + 2];
  return u + v <= 1 ? nw + u * (ne - nw) + v * (sw - nw) : se + (1 - u) * (sw - se) + (1 - v) * (ne - se);
}

export function createOverworldElevation(world: WorldMap): OverworldElevation {
  const heights = new Float32Array((world.cols + 1) * (world.rows + 1));
  const waterLevels = new Float32Array(world.tiles.length); waterLevels.fill(Number.NaN);
  const terraces = materialRegions(world, 'corrupt').map(region => ({
    ...region, x0: region.x0 - TILE, x1: region.x1 + TILE, y0: region.y0 - TILE, y1: region.y1 + TILE,
  }));
  // Lakes are level, independent of their number of tiles or nearby plateau.
  for (const lake of materialRegions(world, 'water')) {
    const level = Math.round(groundHeight((lake.x0 + lake.x1) / 2) - 9);
    for (let row = lake.y0 / TILE; row < lake.y1 / TILE; row++) for (let col = lake.x0 / TILE; col < lake.x1 / TILE; col++) {
      if (tileAt(world, col, row) === 'water') waterLevels[row * world.cols + col] = level;
    }
  }
  const station = world.props.find(prop => prop.kind === 'station');
  const stationTerrace: Terrace | null = station ? {
    x0: station.x - 3 * TILE, y0: station.y - 4 * TILE, x1: station.x + station.w + TILE, y1: station.y + station.h, rise: 14,
  } : null;
  for (let row = 0; row <= world.rows; row++) for (let col = 0; col <= world.cols; col++) {
    const x = col * TILE, y = row * TILE, base = groundHeight(x);
    let elevation = base + terraces.reduce((height, terrace) => height + terraceHeight(terrace, x, y), 0);
    if (stationTerrace) elevation += terraceHeight(stationTerrace, x, y);
    // The solid outer tree ring sits on an escarpment; the playable interior is
    // unchanged. This also gives a deep, finished edge to the terrain slab.
    const edge = Math.min(x, y, world.width - x, world.height - y);
    elevation += 24 * (1 - smooth(TILE, 2 * TILE, edge));
    let road = false, lakeLevel = Number.NaN;
    for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const c = col + dc, r = row + dr, kind = tileAt(world, c, r);
      road ||= kind === 'road' || kind === 'bridge';
      if (kind === 'water') lakeLevel = waterLevels[r * world.cols + c];
    }
    if (road) {
      elevation = base;
      // Road corners are shared with their banks. Each authored approach has a
      // broad ramp, and the central east–west route stays smooth at y=480.
      if (station && x >= station.x && x <= station.x + 9 * TILE && y <= 480) {
        const lane = smooth(station.x, station.x + 2 * TILE, x) * (1 - smooth(station.x + 7 * TILE, station.x + 9 * TILE, x));
        elevation += 14 * (1 - smooth(station.y + station.h, 480, y)) * lane;
      }
      for (const terrace of terraces) {
        if (x < terrace.x0 || x > terrace.x1) continue;
        if (terrace.y0 < world.height * .35 && y <= 448) elevation += terrace.rise * (1 - smooth(terrace.y1 - TILE, 448, y));
        else if (terrace.y0 > world.height * .65 && y >= 512) elevation += terrace.rise * smooth(512, terrace.y0 + 3 * TILE, y);
        else if (terrace.y0 >= world.height * .35 && terrace.y0 <= world.height * .65 && y <= 480) {
          elevation += terrace.rise * (1 - smooth(terrace.y1 - 2 * TILE, 480, y));
        }
      }
    }
    // A causeway shares bank vertices with water. Keep its deck at road grade;
    // snapping these vertices to lake level submerged the visible middle road.
    if (Number.isFinite(lakeLevel) && !road) elevation = lakeLevel;
    heights[row * (world.cols + 1) + col] = elevation;
  }
  return { heights, waterLevels, heightAt: (x, y) => terrainSurfaceHeight(heights, world.cols, world.rows, x, y) };
}
