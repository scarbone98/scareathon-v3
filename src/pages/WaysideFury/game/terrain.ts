import { drawOverworldBanks } from './overworldBanks.ts';
import { drawCountyWater } from './overworldWater.ts';
import { continuousBlastGround, drawBlastGround, drawWornTrails } from './roomGround.ts';
import { roadMask } from './roadClearance.ts';
import { drawRoadNetwork, roadGround, type DrawBounds } from './roadNetwork.ts';
import { roadMarks } from './roadMarkings';
import { TILE, tileAt, type TileKind, type WorldMap } from './world';

const MAX_CHUNK_TILES = 4;
const CHUNK_PIXEL_TARGET = 256;
const MAX_CACHE_PIXELS = 12_000_000;
const OVERLAY_SCALE = 2;
// Static vector art baked above the animated water. The 2D renderer supplies
// it, so this module (shared with the 3D terrain) stays free of 2D area art.
export type OverlayPainter = (c: CanvasRenderingContext2D, bounds: DrawBounds) => void;
export const MATERIALS: Record<TileKind, readonly [string, string, string]> = {
  grass: ['#385943', '#668358', '#274638'], dirt: ['#8c795a', '#c0a578', '#716149'],
  road: ['#37474d', '#627074', '#26373d'], water: ['#2c6379', '#8bb7bb', '#244a65'],
  sand: ['#af9e76', '#dfca95', '#918361'], stone: ['#636b70', '#a0a199', '#45515c'],
  ash: ['#564b53', '#928079', '#3e3d4a'], void: ['#252039', '#514161', '#191a2c'],
  bridge: ['#8b765b', '#c0a17a', '#635443'], corrupt: ['#493350', '#a36b9b', '#30283f'],
};
const hash = (x: number, y: number) => Math.abs(Math.imul(x + 11, 374761393) ^ Math.imul(y + 23, 668265263)) >>> 0;
const inside = (world: WorldMap, col: number, row: number) => col >= 0 && row >= 0 && col < world.cols && row < world.rows;
const terrainAt = (world: WorldMap, col: number, row: number): TileKind => {
  if (!inside(world,col,row)) return world.id.startsWith('realm') ? 'void' : world.id.startsWith('blast') ? 'ash' : 'grass';
  const kind=roadGround(world,tileAt(world,col,row));
  if (world.organic && /^(woods-|city-)/.test(world.id) && !world.collision[row*world.cols+col] && !['water','bridge'].includes(kind)) {
    return world.id.startsWith('woods-') ? world.id==='woods-mirror-sawmill'?'corrupt':'grass' : 'stone';
  }
  return kind;
};

// Native-resolution chunks are keyed by their render scale. Out-of-bounds chunks
// use the room's surroundings, so a centered small room never reveals black bars.
export class TerrainCache {
  private chunks = new Map<string, HTMLCanvasElement>();
  private cachePixels = 0;
  private cacheBudgetPixels = MAX_CACHE_PIXELS;
  constructor(private overlayPainter: (world: WorldMap) => OverlayPainter | null = () => null) {}
  draw(c: CanvasRenderingContext2D, world: WorldMap, camera: { x: number; y: number }, width: number, height: number, time: number, pixelScale = 1, dpr = 1) {
    // Smaller chunks at high DPR limit the memory spent just outside the view.
    const chunkTiles = Math.max(1, Math.min(MAX_CHUNK_TILES, Math.floor(CHUNK_PIXEL_TARGET / (TILE * pixelScale))));
    const ground = this.layer('ground', world, camera, width, height, pixelScale, dpr, chunkTiles);
    // Roads, trails and landforms are static vector art above the water ripples.
    // Larger transparent chunks amortize the network walk across fewer bakes.
    const paint = this.overlayPainter(world);
    const overlay = paint ? this.layer('overlay', world, camera, width, height, pixelScale, dpr, chunkTiles * OVERLAY_SCALE) : null;
    const visible = new Set([...ground.keys, ...overlay?.keys ?? []]);
    // The budget is bounded by 12M pixels or one complete visible working set,
    // whichever is larger. A large screen must retain its own native surface;
    // evicting visible chunks would rerasterize static terrain every frame.
    this.cacheBudgetPixels = Math.max(MAX_CACHE_PIXELS, ground.keys.length * ground.chunkPixels + (overlay ? overlay.keys.length * overlay.chunkPixels : 0));
    this.trim(this.cacheBudgetPixels, visible);
    this.blit(c, ground, visible, (cx, cy) => this.makeChunk(world, cx, cy, pixelScale, chunkTiles));
    this.animate(c, world, camera, width, height, time);
    if (overlay && paint) this.blit(c, overlay, visible, (cx, cy) => this.makeOverlay(paint, cx, cy, pixelScale, overlay.chunkSize));
  }
  private layer(name: string, world: WorldMap, camera: { x: number; y: number }, width: number, height: number, pixelScale: number, dpr: number, chunkTiles: number) {
    const chunkSize = TILE * chunkTiles, chunkPixels = (chunkSize * pixelScale) ** 2;
    const minX = Math.floor(camera.x / chunkSize), minY = Math.floor(camera.y / chunkSize);
    const maxX = Math.ceil((camera.x + width) / chunkSize), maxY = Math.ceil((camera.y + height) / chunkSize);
    const keys: string[] = [];
    for (let cy = minY; cy < maxY; cy++) for (let cx = minX; cx < maxX; cx++) keys.push(`${name}:${world.id}:${pixelScale}:${dpr}:${chunkTiles}:${cx}:${cy}`);
    return { keys, chunkSize, chunkPixels, minX, minY, maxX };
  }
  private blit(c: CanvasRenderingContext2D, layer: ReturnType<TerrainCache['layer']>, visible: Set<string>, make: (cx: number, cy: number) => HTMLCanvasElement) {
    // Adjacent cached images share exact physical-pixel edges even as the
    // camera eases. Actors retain their independent subpixel interpolation.
    c.save();
    const transform = c.getTransform();
    c.setTransform(transform.a, transform.b, transform.c, transform.d, Math.round(transform.e), Math.round(transform.f));
    const columns = layer.maxX - layer.minX;
    for (const [i, key] of layer.keys.entries()) {
      const cx = layer.minX + i % columns, cy = layer.minY + Math.floor(i / columns);
      let chunk = this.chunks.get(key);
      if (!chunk) {
        // Release old offscreen canvases before allocating their replacements.
        this.trim(this.cacheBudgetPixels - layer.chunkPixels, visible);
        chunk = make(cx, cy);
        this.cachePixels += chunk.width * chunk.height;
      }
      this.chunks.delete(key); this.chunks.set(key, chunk);
      if (chunk.width) c.drawImage(chunk, cx * layer.chunkSize, cy * layer.chunkSize, layer.chunkSize, layer.chunkSize);
    }
    c.restore();
  }
  private makeOverlay(paint: OverlayPainter, cx: number, cy: number, pixelScale: number, chunkSize: number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = chunkSize * pixelScale;
    const c = canvas.getContext('2d')!;
    c.scale(pixelScale, pixelScale); c.imageSmoothingEnabled = false; c.translate(-cx * chunkSize, -cy * chunkSize);
    // Most overlay chunks are open grass. One that paints nothing keeps a
    // zero-size canvas: no memory and no per-frame blit.
    let painted = false;
    for (const name of ['fill', 'stroke', 'fillRect', 'strokeRect', 'drawImage', 'fillText'] as const) {
      const draw = c[name] as (...args: unknown[]) => void;
      Object.defineProperty(c, name, { value: (...args: unknown[]) => { painted = true; return draw.apply(c, args); } });
    }
    paint(c, { x: cx * chunkSize, y: cy * chunkSize, w: chunkSize, h: chunkSize });
    if (!painted) canvas.width = canvas.height = 0;
    return canvas;
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
    if (continuousBlastGround(world)) {
      c.translate(-cx * TILE * chunkTiles, -cy * TILE * chunkTiles);
      drawBlastGround(c, world, {x:cx*TILE*chunkTiles,y:cy*TILE*chunkTiles,w:TILE*chunkTiles,h:TILE*chunkTiles}); drawWornTrails(c, world);
      return canvas;
    }
    for (let ty = 0; ty < chunkTiles; ty++) for (let tx = 0; tx < chunkTiles; tx++) {
      const col = cx * chunkTiles + tx, row = cy * chunkTiles + ty;
      const kind = terrainAt(world, col, row), [base, light, dark] = MATERIALS[kind];
      const x = tx * TILE, y = ty * TILE, n = hash(col, row);
      const fill = (dx: number, dy: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x + dx, y + dy, w, h); };
      fill(0, 0, TILE, TILE, world.id==='overworld' && kind==='water' ? MATERIALS.sand[0] : base);
      // Low-contrast fine grain replaces the alternating tile-sized bevels.
      // Seed in world space so chunks meet without lighting seams.
      c.save(); c.globalAlpha = world.id==='overworld' && kind==='water' ? 0 : .22;
      for (let k = 0; k < 56; k++) {
        const grain = hash(col * 61 + k, row * 73 + k * 7);
        const px = (grain % 157) / 10, py = ((grain >>> 9) % 157) / 10;
        fill(px, py, k % 5 ? .18 : .5, .16, k % 2 ? light : dark);
      }
      c.restore();
      if (kind === 'grass') {
        c.save(); c.lineWidth = .16; c.lineCap = 'round';
        for (let k = 0; k < 9; k++) {
          const blade = hash(col * 31 + k, row * 43 + k);
          const px = 1 + blade % 135 / 10, py = 2 + (blade >>> 8) % 120 / 10;
          if (roadMask(world).intersects({x:col*TILE+px-1,y:row*TILE+py-1,w:3,h:3})) continue;
          c.strokeStyle = k % 3 ? '#80977770' : '#192f3570';
          c.beginPath(); c.moveTo(x + px, y + py + 1);
          c.quadraticCurveTo(x + px + .4, y + py, x + px - .35, y + py - .6); c.stroke();
          c.beginPath(); c.moveTo(x + px, y + py + 1);
          c.quadraticCurveTo(x + px + .8, y + py + .2, x + px + 1, y + py); c.stroke();
        }
        c.restore();
        if (n % 19 === 0 && !roadMask(world).contains(col*TILE+7,row*TILE+8)) { fill(7, 8, .15, 1.5, '#b5b88b'); fill(7, 7.8, .4, .4, '#e4d7a0'); }
      }
      if (world.id !== 'overworld' && !world.organic && (kind === 'stone' || kind === 'ash' || kind === 'void' || kind === 'corrupt')) {
        c.save(); c.globalAlpha = .45;
        fill(0, 0, TILE, .18, dark); fill(0, 0, .18, TILE, dark); fill(1, .3, 13, .15, light);
        c.restore();
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
      if (kind === 'road') for (const mark of roadMarks(world, col, row)) {
        fill(mark.x - col * TILE, mark.y - row * TILE, mark.w, mark.h, mark.color);
      }
      const edges = [[0, -1, 0, 0, TILE, 2], [0, 1, 0, TILE - 2, TILE, 2], [-1, 0, 0, 0, 2, TILE], [1, 0, TILE - 2, 0, 2, TILE]];
      for (const [dx, dy, ex, ey, ew, eh] of edges) {
        const neighbor = terrainAt(world, col + dx, row + dy);
        if (neighbor === kind || kind === 'road') continue;
        if (kind === 'water' && world.id==='overworld') continue;
        if (kind === 'water') {
          fill(ex, ey, ew, eh, '#9d9a71'); fill(ex + (dx === -1 ? 1.5 : 0), ey + (dy === -1 ? 1.5 : 0), dx ? .5 : ew, dy ? .5 : eh, '#cad0a2');
        } else if (kind === 'dirt' || kind === 'sand') {
          // Irregular fine gravel scallops replace ruler-straight tile borders.
          c.fillStyle=dark;c.globalAlpha=.32;
          c.beginPath();
          for(let k=0;k<=8;k++) {
            const along=k*2,inset=.5+(hash(col*17+k,row*19+k)%23)/10;
            const px=dx===-1?inset:dx===1?TILE-inset:along;
            const py=dy===-1?inset:dy===1?TILE-inset:along;
            if(k===0)c.moveTo(x+px,y+py);else c.lineTo(x+px,y+py);
          }
          c.lineWidth=2.4;c.lineJoin='round';c.strokeStyle=dark;c.stroke();c.globalAlpha=1;
          for (let k = 0; k < 8; k++) fill(dx ? ex+(n+k)%3*.4 : k * 2, dy ? ey+(n+k)%3*.4 : k * 2, .4, .4, light);
        } else if (kind === 'grass') {
          for (let k = 0; k < 8; k++) {
            const px=dx ? ex+k%2 : k*2, py=dy ? ey+k%2 : k*2;
            if(!roadMask(world).contains(col*TILE+px,row*TILE+py))fill(px,py,1,1,k%3 ? dark : light);
          }
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
    c.save(); c.translate(-cx * TILE * chunkTiles, -cy * TILE * chunkTiles);
    drawOverworldBanks(c, world, {x:cx*TILE*chunkTiles,y:cy*TILE*chunkTiles,w:TILE*chunkTiles,h:TILE*chunkTiles});
    if(world.id==='overworld')drawCountyWater(c,world,{x:cx*TILE*chunkTiles,y:cy*TILE*chunkTiles,w:TILE*chunkTiles,h:TILE*chunkTiles});
    if(!world.organic && world.id!=='overworld') drawRoadNetwork(c, world); c.restore();
    return canvas;
  }
  private animate(c: CanvasRenderingContext2D, world: WorldMap, camera: { x: number; y: number }, width: number, height: number, time: number) {
    if(world.id==='overworld') {
      drawCountyWater(c,world,{x:camera.x,y:camera.y,w:width,h:height},time);
      // Road artwork is drawn later in the area's ground pass, above ripples.
    }
    const minCol = Math.max(0, Math.floor(camera.x / TILE)), minRow = Math.max(0, Math.floor(camera.y / TILE));
    const maxCol = Math.min(world.cols, Math.ceil((camera.x + width) / TILE)), maxRow = Math.min(world.rows, Math.ceil((camera.y + height) / TILE));
    c.save(); c.lineWidth = .35; c.lineCap = 'round';
    for (let row = minRow; row < maxRow; row++) for (let col = minCol; col < maxCol; col++) {
      const kind = tileAt(world, col, row), n = hash(col, row), x = col * TILE, y = row * TILE;
      if (kind === 'water' && world.id!=='overworld') {
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
