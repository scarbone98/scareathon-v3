import { TILE, tileAt, type TileKind, type WorldMap } from './world';

const MAX_CHUNK_TILES = 4;
const CHUNK_PIXEL_TARGET = 256;
const MAX_CACHE_PIXELS = 12_000_000;
const MATERIALS: Record<TileKind, readonly [string, string, string]> = {
  grass: ['#385943', '#668358', '#274638'], dirt: ['#8c795a', '#c0a578', '#716149'],
  road: ['#37474d', '#627074', '#26373d'], water: ['#2c6379', '#8bb7bb', '#244a65'],
  sand: ['#af9e76', '#dfca95', '#918361'], stone: ['#636b70', '#a0a199', '#45515c'],
  ash: ['#564b53', '#928079', '#3e3d4a'], void: ['#252039', '#514161', '#191a2c'],
  bridge: ['#8b765b', '#c0a17a', '#635443'], corrupt: ['#493350', '#a36b9b', '#30283f'],
};
const hash = (x: number, y: number) => Math.abs(Math.imul(x + 11, 374761393) ^ Math.imul(y + 23, 668265263)) >>> 0;
const inside = (world: WorldMap, col: number, row: number) => col >= 0 && row >= 0 && col < world.cols && row < world.rows;
const terrainAt = (world: WorldMap, col: number, row: number): TileKind => inside(world, col, row)
  ? tileAt(world, col, row)
  : world.id.startsWith('realm') ? 'void' : world.id.startsWith('blast') ? 'ash' : 'grass';

// Native-resolution chunks are keyed by their render scale. Out-of-bounds chunks
// use the room's surroundings, so a centered small room never reveals black bars.
export class TerrainCache {
  private chunks = new Map<string, HTMLCanvasElement>();
  private cachePixels = 0;
  private cacheBudgetPixels = MAX_CACHE_PIXELS;
  draw(c: CanvasRenderingContext2D, world: WorldMap, camera: { x: number; y: number }, width: number, height: number, time: number, pixelScale = 1, dpr = 1) {
    // Smaller chunks at high DPR limit the memory spent just outside the view.
    const chunkTiles = Math.max(1, Math.min(MAX_CHUNK_TILES, Math.floor(CHUNK_PIXEL_TARGET / (TILE * pixelScale))));
    const chunkSize = TILE * chunkTiles, chunkPixels = (chunkSize * pixelScale) ** 2;
    const minX = Math.floor(camera.x / chunkSize), minY = Math.floor(camera.y / chunkSize);
    const maxX = Math.ceil((camera.x + width) / chunkSize), maxY = Math.ceil((camera.y + height) / chunkSize);
    const visible = new Set<string>();
    const keyFor = (cx: number, cy: number) => `${world.id}:${pixelScale}:${dpr}:${chunkTiles}:${cx}:${cy}`;
    for (let cy = minY; cy < maxY; cy++) for (let cx = minX; cx < maxX; cx++) visible.add(keyFor(cx, cy));
    // The budget is bounded by 12M pixels or one complete visible working set,
    // whichever is larger. A large screen must retain its own native surface;
    // evicting visible chunks would rerasterize static terrain every frame.
    this.cacheBudgetPixels = Math.max(MAX_CACHE_PIXELS, visible.size * chunkPixels);
    this.trim(this.cacheBudgetPixels, visible);
    for (let cy = minY; cy < maxY; cy++) for (let cx = minX; cx < maxX; cx++) {
      const key = keyFor(cx, cy);
      let chunk = this.chunks.get(key);
      if (!chunk) {
        // Release old offscreen canvases before allocating their replacements.
        this.trim(this.cacheBudgetPixels - chunkPixels, visible);
        chunk = this.makeChunk(world, cx, cy, pixelScale, chunkTiles);
        this.cachePixels += chunk.width * chunk.height;
      }
      this.chunks.delete(key); this.chunks.set(key, chunk);
      c.drawImage(chunk, cx * chunkSize, cy * chunkSize, chunkSize, chunkSize);
    }
    this.animate(c, world, camera, width, height, time);
  }
  private trim(budget: number, visible: Set<string>) {
    if (this.cachePixels <= budget) return;
    for (const [key, chunk] of this.chunks) {
      if (visible.has(key)) continue;
      this.cachePixels -= chunk.width * chunk.height; this.chunks.delete(key);
      if (this.cachePixels <= budget) break;
    }
  }
  clear() { this.chunks.clear(); this.cachePixels = 0; this.cacheBudgetPixels = MAX_CACHE_PIXELS; }
  private makeChunk(world: WorldMap, cx: number, cy: number, pixelScale: number, chunkTiles: number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE * chunkTiles * pixelScale;
    const c = canvas.getContext('2d')!;
    c.scale(pixelScale, pixelScale); c.imageSmoothingEnabled = false;
    for (let ty = 0; ty < chunkTiles; ty++) for (let tx = 0; tx < chunkTiles; tx++) {
      const col = cx * chunkTiles + tx, row = cy * chunkTiles + ty;
      const kind = terrainAt(world, col, row), [base, light, dark] = MATERIALS[kind];
      const x = tx * TILE, y = ty * TILE, n = hash(col, row);
      const fill = (dx: number, dy: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x + dx, y + dy, w, h); };
      fill(0, 0, TILE, TILE, base);
      const lightFall = c.createLinearGradient(x, y, x + TILE, y + TILE);
      lightFall.addColorStop(0, n % 2 ? '#ffffff0b' : '#ffe9c008'); lightFall.addColorStop(1, '#111c2711');
      c.fillStyle = lightFall; c.fillRect(x, y, TILE, TILE);
      for (let k = 0; k < 13; k++) {
        const px = (n >>> (k % 7 * 3)) % 30 / 2, py = (n >>> (k % 8 * 2 + 1)) % 30 / 2;
        fill(px, py, k % 4 ? .5 : 1.5, .5, k % 2 ? light : dark);
      }
      if (kind === 'grass') {
        for (let k = 0; k < 3; k++) {
          const px = 2 + (n + k * 5) % 11, py = 3 + (n + k * 7) % 10;
          fill(px, py, .5, 2, light); fill(px - .5, py + 1.5, 2, .5, light);
          fill(px + 1, py + 2, .5, 1, '#82945f');
        }
        if (n % 19 === 0) { fill(7, 8, .5, 2, '#d7c78a'); fill(7.5, 7.5, 1, 1, '#f0df9b'); }
      }
      if (kind === 'stone' || kind === 'ash' || kind === 'void' || kind === 'corrupt') {
        fill(0, 0, TILE, .5, dark); fill(0, 0, .5, TILE, dark); fill(1, 1, 13, .5, light);
        if (n % 3 === 0) { fill(8, 9, 4, .5, dark); fill(10, 9.5, .5, 3, dark); fill(11, 10, 2, .5, dark); }
      }
      if (kind === 'stone' && inside(world, col, row) && world.collision[row * world.cols + col]) {
        fill(0, 0, TILE, 3, '#979b91'); fill(0, 3, TILE, .5, '#bbc0aa'); fill(0, 4, TILE, 1, '#454d55');
        if (!world.collision[(row + 1) * world.cols + col]) {
          fill(0, 8, TILE, 8, '#48525b'); fill(1, 9, 14, .5, '#818782'); fill(0, 15, TILE, 1, '#283941');
          fill(0, 13, TILE, 2, '#364552');
        }
      }
      if (kind === 'bridge') {
        for (let py = 0; py < TILE; py += 4) {
          fill(0, py, TILE, .5, dark); fill(0, py + .5, TILE, .5, light);
          fill(2 + n % 4, py + 2, 7, .5, '#ad9170');
        }
        for (const px of [2, 13]) { fill(px, 1, .5, .5, '#514e46'); fill(px, 13, .5, .5, '#514e46'); }
      }
      if (kind === 'road') {
        const vertical = terrainAt(world, col - 1, row) !== 'road' || terrainAt(world, col + 1, row) !== 'road';
        if (vertical && col % 2 === 0 && row % 2 === 0) fill(7, 4, 1, 7, '#c7b68c');
        else if (!vertical && row % 2 === 0 && col % 2 === 0) fill(4, 7, 7, 1, '#c7b68c');
      }
      const edges = [[0, -1, 0, 0, TILE, 2], [0, 1, 0, TILE - 2, TILE, 2], [-1, 0, 0, 0, 2, TILE], [1, 0, TILE - 2, 0, 2, TILE]];
      for (const [dx, dy, ex, ey, ew, eh] of edges) {
        const neighbor = terrainAt(world, col + dx, row + dy);
        if (neighbor === kind) continue;
        if (kind === 'water') {
          fill(ex, ey, ew, eh, '#9d9a71'); fill(ex + (dx === -1 ? 1.5 : 0), ey + (dy === -1 ? 1.5 : 0), dx ? .5 : ew, dy ? .5 : eh, '#cad0a2');
        } else if (kind === 'road') { fill(ex, ey, ew, eh, '#929587'); if (dy === 1) fill(ex, ey, ew, .5, '#d4caae'); }
        else if (kind === 'dirt' || kind === 'sand') {
          fill(ex, ey, ew, eh, dark);
          for (let k = 0; k < 8; k++) fill(dx ? ex : k * 2, dy ? ey : k * 2, .5, .5, light);
        } else if (kind === 'grass') {
          for (let k = 0; k < 8; k++) fill(dx ? ex + k % 2 : k * 2, dy ? ey + k % 2 : k * 2, 1, 1, k % 3 ? dark : light);
        }
        // A soft bank shadow joins materials without enlarging the collision map.
        const shade = c.createLinearGradient(x + ex, y + ey, x + ex + (dx ? ew : 0), y + ey + (dy ? eh : 0));
        shade.addColorStop(0, dx === 1 || dy === 1 ? '#0b192400' : '#0b192435');
        shade.addColorStop(1, dx === 1 || dy === 1 ? '#0b192435' : '#0b192400');
        c.fillStyle = shade; c.fillRect(x + ex, y + ey, ew, eh);
      }
      if (kind === 'corrupt') for (let k = 0; k < 4; k++) {
        fill((k * 5 + n) % 14, (k * 7 + n) % 14, 1.5, .5, '#b779aa');
        fill(k * 4, (k * 3 + n) % 16, 2, .5, '#d68cb7');
      }
    }
    return canvas;
  }
  private animate(c: CanvasRenderingContext2D, world: WorldMap, camera: { x: number; y: number }, width: number, height: number, time: number) {
    const minCol = Math.max(0, Math.floor(camera.x / TILE)), minRow = Math.max(0, Math.floor(camera.y / TILE));
    const maxCol = Math.min(world.cols, Math.ceil((camera.x + width) / TILE)), maxRow = Math.min(world.rows, Math.ceil((camera.y + height) / TILE));
    c.save(); c.lineWidth = .35; c.lineCap = 'round';
    for (let row = minRow; row < maxRow; row++) for (let col = minCol; col < maxCol; col++) {
      const kind = tileAt(world, col, row), n = hash(col, row), x = col * TILE, y = row * TILE;
      if (kind === 'water') {
        const phase = time * 1.5 + col * .7 + row * .4;
        c.strokeStyle = '#96c4c7'; c.globalAlpha = .25 + Math.sin(phase) * .12;
        c.beginPath(); c.moveTo(x + 2, y + 6 + n % 5);
        c.quadraticCurveTo(x + 7, y + 5 + n % 5 + Math.sin(phase), x + 12, y + 6 + n % 5); c.stroke();
      } else if (kind === 'corrupt') {
        c.fillStyle = '#bc7bc1'; c.globalAlpha = Math.max(0, Math.sin(time * 2 + col + row)) * .35;
        c.fillRect(x + n % 9, y + (n >>> 3) % 13, 4, .4);
      }
    }
    c.restore();
  }
}
