import { TILE, tileAt, type TileKind, type WorldMap } from './world';

const CHUNK_TILES = 8;
const CHUNK_SIZE = TILE * CHUNK_TILES;
const MATERIALS: Record<TileKind, readonly [string, string, string]> = {
  grass: ['#365541', '#45694a', '#294437'], dirt: ['#8b7958', '#a48c65', '#73674e'],
  road: ['#374448', '#485358', '#27383e'], water: ['#2a5366', '#518392', '#1f4058'],
  sand: ['#af9d70', '#ccb783', '#8b815e'], stone: ['#62666a', '#81817a', '#4c535a'],
  ash: ['#514950', '#6d5c61', '#3d3b47'], void: ['#151526', '#29233a', '#101120'],
  bridge: ['#87735a', '#a18a67', '#665a4b'], corrupt: ['#44304f', '#78466f', '#30253f'],
};
const hash = (x: number, y: number) => Math.abs(Math.imul(x + 11, 374761393) ^ Math.imul(y + 23, 668265263)) >>> 0;

// Static terrain is cached in small chunks; only the visible chunks are touched.
export class TerrainCache {
  private chunks = new Map<string, HTMLCanvasElement>();
  draw(c: CanvasRenderingContext2D, world: WorldMap, camera: { x: number; y: number }, width: number, height: number, time: number) {
    const minX = Math.max(0, Math.floor(camera.x / CHUNK_SIZE));
    const minY = Math.max(0, Math.floor(camera.y / CHUNK_SIZE));
    const maxX = Math.min(Math.ceil(world.width / CHUNK_SIZE), Math.ceil((camera.x + width) / CHUNK_SIZE));
    const maxY = Math.min(Math.ceil(world.height / CHUNK_SIZE), Math.ceil((camera.y + height) / CHUNK_SIZE));
    for (let cy = minY; cy < maxY; cy++) for (let cx = minX; cx < maxX; cx++) {
      const key = `${world.id}:${cx}:${cy}`;
      let chunk = this.chunks.get(key);
      if (!chunk) { chunk = this.makeChunk(world, cx, cy); this.chunks.set(key, chunk); }
      // Refresh insertion order so old offscreen zones do not retain canvas memory.
      this.chunks.delete(key); this.chunks.set(key, chunk);
      c.drawImage(chunk, cx * CHUNK_SIZE, cy * CHUNK_SIZE);
    }
    while (this.chunks.size > 48) this.chunks.delete(this.chunks.keys().next().value!);
    this.animate(c, world, camera, width, height, time);
  }
  clear() { this.chunks.clear(); }
  private makeChunk(world: WorldMap, cx: number, cy: number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = CHUNK_SIZE;
    const c = canvas.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    for (let ty = 0; ty < CHUNK_TILES; ty++) for (let tx = 0; tx < CHUNK_TILES; tx++) {
      const col = cx * CHUNK_TILES + tx, row = cy * CHUNK_TILES + ty;
      const kind = tileAt(world, col, row), [base, light, dark] = MATERIALS[kind];
      const x = tx * TILE, y = ty * TILE, n = hash(col, row);
      const fill = (dx: number, dy: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x + dx, y + dy, w, h); };
      fill(0, 0, TILE, TILE, base);
      // Three shades and deterministic scattered pixels keep material readable.
      for (let k = 0; k < 6; k++) fill((n >>> (k * 3)) % 14, (n >>> (k * 2 + 1)) % 14, k % 3 ? 1 : 2, 1, k % 2 ? light : dark);
      if (kind === 'grass') {
        fill(3 + n % 8, 4 + n % 7, 1, 3, light); fill(2 + n % 8, 6 + n % 7, 3, 1, light);
        if (n % 19 === 0) { fill(7, 8, 1, 2, '#d3c57d'); fill(8, 7, 1, 1, '#e7d995'); }
      }
      if (kind === 'stone' || kind === 'ash' || kind === 'void' || kind === 'corrupt') {
        fill(0, 0, TILE, 1, dark); fill(0, 0, 1, TILE, dark); fill(2, 2, 11, 1, light);
        if (n % 3 === 0) { fill(8, 9, 5, 1, dark); fill(10, 10, 1, 3, dark); }
      }
      if (kind === 'stone' && world.collision[row * world.cols + col]) {
        fill(0, 0, TILE, 3, '#8a8a7d'); fill(0, 4, TILE, 1, '#454d55');
        if (!world.collision[(row + 1) * world.cols + col]) { fill(0, 8, TILE, 8, '#48525b'); fill(1, 9, 14, 1, '#727573'); fill(0, 15, TILE, 1, '#283941'); }
      }
      if (kind === 'bridge') { fill(0, 1, TILE, 2, light); fill(0, 13, TILE, 2, dark); fill(7, 0, 1, TILE, dark); }
      if (kind === 'road') {
        const vertical = tileAt(world, col - 1, row) !== 'road' || tileAt(world, col + 1, row) !== 'road';
        if (vertical && col % 2 === 0 && row % 2 === 0) fill(7, 4, 1, 7, '#c7b68c');
        else if (!vertical && row % 2 === 0 && col % 2 === 0) fill(4, 7, 7, 1, '#c7b68c');
      }
      // Neighbor-aware banks, curbs and broken paving create joined terrain edges.
      const edges = [[0, -1, 0, 0, TILE, 2], [0, 1, 0, TILE - 2, TILE, 2], [-1, 0, 0, 0, 2, TILE], [1, 0, TILE - 2, 0, 2, TILE]];
      for (const [dx, dy, ex, ey, ew, eh] of edges) {
        const neighbor = tileAt(world, col + dx, row + dy);
        if (neighbor === kind) continue;
        if (kind === 'water') { fill(ex, ey, ew, eh, '#9d9a71'); if (dy === -1) fill(0, 2, TILE, 1, '#719393'); }
        else if (kind === 'road') { fill(ex, ey, ew, eh, '#929587'); if (dy === 1) fill(ex, ey, ew, 1, '#c2bd9e'); }
        else if (kind === 'dirt' || kind === 'sand') {
          fill(ex, ey, ew, eh, dark);
          for (let k = 0; k < 4; k++) fill(dx ? ex : k * 4, dy ? ey : k * 4, 1, 1, light);
        }
      }
      if (kind === 'corrupt') for (let k = 0; k < 4; k++) { fill((k * 5 + n) % 14, (k * 7 + n) % 14, 2, 2, '#8f5c91'); fill(k * 4, (k * 3 + n) % 16, 2, 1, '#bf74a2'); }
    }
    return canvas;
  }
  private animate(c: CanvasRenderingContext2D, world: WorldMap, camera: { x: number; y: number }, width: number, height: number, time: number) {
    const minCol = Math.max(0, Math.floor(camera.x / TILE)), minRow = Math.max(0, Math.floor(camera.y / TILE));
    const maxCol = Math.min(world.cols, Math.ceil((camera.x + width) / TILE)), maxRow = Math.min(world.rows, Math.ceil((camera.y + height) / TILE));
    for (let row = minRow; row < maxRow; row++) for (let col = minCol; col < maxCol; col++) {
      const kind = tileAt(world, col, row), n = hash(col, row), x = col * TILE, y = row * TILE;
      if (kind === 'water') {
        const phase = Math.floor(time * 3 + col * .7 + row * .4) % 4;
        c.fillStyle = phase === 0 ? '#88a9ab' : '#5a8997'; c.fillRect(x + 2 + phase, y + 5 + n % 7, 4 + n % 4, 1);
        if (n % 3 === 0) { c.fillStyle = '#386c80'; c.fillRect(x + 2, y + 12, 5, 1); }
      } else if (kind === 'corrupt' && Math.floor(time * 5 + col + row) % 7 === 0) {
        c.fillStyle = '#a263a7'; c.fillRect(x + n % 9, y + (n >>> 3) % 13, 6, 1);
      }
    }
  }
}
