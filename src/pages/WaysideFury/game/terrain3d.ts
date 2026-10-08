import { roadGround } from './roadNetwork.ts';
import { buildRoadSurface } from './roadSurface3d.ts';
// Presentation-only height data. The simulation keeps its original flat map.
import { roadMarks } from './roadMarkings';
import * as THREE from 'three';
import { MATERIALS } from './terrain';
import { TILE, tileAt, type TileKind, type WorldMap } from './world';

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
const hash = (x: number, y: number) => (Math.imul(x + 11, 374761393) ^ Math.imul(y + 23, 668265263)) >>> 0;
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
    if (Number.isFinite(lakeLevel)) elevation = lakeLevel;
    heights[row * (world.cols + 1) + col] = elevation;
  }
  return { heights, waterLevels, heightAt: (x, y) => terrainSurfaceHeight(heights, world.cols, world.rows, x, y) };
}

interface Batch { positions: number[]; uvs: number[]; colors: number[] }
const batch = (): Batch => ({ positions: [], uvs: [], colors: [] });
type Vertex = readonly [number, number, number];
function quad(target: Batch, nw: Vertex, ne: Vertex, sw: Vertex, se: Vertex, color: THREE.Color, rotation = 0, uvRect: readonly [number,number,number] = [0,0,1]) {
  for (const [vertex, u, v] of [[nw, 0, 1], [sw, 0, 0], [ne, 1, 1], [ne, 1, 1], [sw, 0, 0], [se, 1, 0]] as const) {
    target.positions.push(...vertex);
    const tu=uvRect[0]+u*uvRect[2],tv=1-uvRect[1]-(1-v)*uvRect[2];
    target.uvs.push(rotation ? tv : tu, rotation ? 1-tu : tv);
    target.colors.push(color.r, color.g, color.b);
  }
}
function geometry(data: Batch, heightAt?: (x: number, y: number) => number) {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  result.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
  result.computeVertexNormals();
  if (heightAt) {
    // Shared world-space normals remove triangle seams on continuous ground.
    // Cliff skirts keep their face normals; elevation and collision stay intact.
    const normals = result.getAttribute('normal'), normal = new THREE.Vector3();
    for (let i = 0; i < normals.count; i++) {
      const x = data.positions[i * 3], z = data.positions[i * 3 + 2];
      normal.set(heightAt(x - .5, z) - heightAt(x + .5, z), 1, heightAt(x, z - .5) - heightAt(x, z + .5)).normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
    }
  }
  result.computeBoundingSphere();
  return result;
}

function tileTexture(kind: TileKind | 'cliff') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = TILE * 16;
  const context = canvas.getContext('2d')!; context.scale(4, 4);
  const [base, light, dark] = MATERIALS[kind === 'cliff' ? 'stone' : kind];
  const fill = (x: number, y: number, w: number, h: number, color: string) => {
    context.fillStyle = color; context.fillRect(x, y, w, h);
  };
  fill(0, 0, 64, 64, base);
  context.globalAlpha = .26;
  for (let n = 0; n < 440; n++) {
    const seed = hash(n, kind.length);
    fill(seed % 64, (seed >>> 8) % 64, n % 5 ? .3 : .8, .3, n % 3 ? dark : light);
  }
  context.globalAlpha = .65;
  if (kind === 'grass') for (let n = 0; n < 12; n++) {
    const seed = hash(n + 9, 8), x = 3 + seed % 55, y = 5 + (seed >>> 6) % 53;
    context.lineWidth = .55; context.lineCap = 'round';
    context.strokeStyle = n % 3 ? '#80977790' : '#192f3580';
    context.beginPath(); context.moveTo(x, y + 3);
    context.quadraticCurveTo(x + 1.2, y, x - 1, y - 2); context.stroke();
    context.beginPath(); context.moveTo(x, y + 3);
    context.quadraticCurveTo(x + 2.5, y + .5, x + 3, y); context.stroke();
  }
  if (kind === 'water') for (let y = 10; y < 64; y += 19) {
    fill(y % 11 + 5, y, 30, 1, light); fill(y % 11 + 16, y + 2, 23, 1, '#427f92');
  }
  if (kind === 'bridge') for (let y = 0; y < 64; y += 16) {
    fill(0, y, 64, 2, dark); fill(0, y + 2, 64, 1, light);
  }
  if (kind === 'stone' || kind === 'ash' || kind === 'corrupt' || kind === 'cliff') {
    for (let y = 0; y < 64; y += kind === 'cliff' ? 8 : 32) {
      fill(0, y, 64, 2, dark); fill(2, y + 2, 54, 1, light);
      if (kind === 'cliff') fill((y * 7) % 48, y + 3, 2, 5, dark);
    }
  }
  if (kind === 'corrupt') for (let n = 0; n < 6; n++) {
    fill((n * 19) % 60, (n * 29) % 60, 8, 2, '#a36b9b');
    fill((n * 19 + 7) % 60, (n * 29 + 2) % 60, 2, 6, '#b779aa');
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.generateMipmaps = true; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function buildOverworldTerrain(world: WorldMap): { group: THREE.Group; heightAt(x: number, y: number): number; water: THREE.Mesh[]; dispose(): void } {
  const elevation = createOverworldElevation(world), group = new THREE.Group(), water: THREE.Mesh[] = [];
  const originalHeightAt=elevation.heightAt;
  const craters=world.props.filter(p=>p.kind==='crater'||p.kind==='impact'||p.kind==='ember-vent');
  const radiusAt=(p:typeof craters[number],x:number,z:number)=>Math.hypot((x-p.x-p.w/2)/(p.w*.48),(z-p.y-p.h/2)/(p.h*.46));
  // Fine ground quads below share the exact same bowl/rim function as footing.
  const bowlHeightAt=(x:number,z:number)=>originalHeightAt(x,z)+craters.reduce((offset,p)=>{
    const r=radiusAt(p,x,z);if(r>=1.16)return offset;
    const bowl=-Math.min(p.w,p.h)*.09*Math.pow(Math.max(0,1-r*r),2);
    const rim=Math.min(p.w,p.h)*.024*Math.exp(-Math.pow((r-.87)/.13,2));
    return offset+bowl+rim;
  },0);
  const nearCraterTile=(x:number,z:number)=>craters.some(p=>x+TILE>p.x-p.w*.1&&x<p.x+p.w*1.1&&z+TILE>p.y-p.h*.1&&z<p.y+p.h*1.1);
  elevation.heightAt=(x,z)=>{
    if(!nearCraterTile(Math.floor(x/TILE)*TILE,Math.floor(z/TILE)*TILE))return originalHeightAt(x,z);
    const px=Math.floor(x/4)*4,pz=Math.floor(z/4)*4,u=(x-px)/4,v=(z-pz)/4;
    const nw=bowlHeightAt(px,pz),ne=bowlHeightAt(px+4,pz),sw=bowlHeightAt(px,pz+4),se=bowlHeightAt(px+4,pz+4);
    return u+v<=1?nw+u*(ne-nw)+v*(sw-nw):se+(1-u)*(sw-se)+(1-v)*(ne-se);
  };
  group.name = 'overworld-terrain';
  const batches = new Map<TileKind | 'cliff', Batch>(), shoreline = batch(), markings = batch(), skirts = batch();
  const shade = new THREE.Color();
  const point = (x: number, y: number, lift = 0): Vertex => [x, elevation.heightAt(x, y) + lift, y];
  for (let row = 0; row < world.rows; row++) for (let col = 0; col < world.cols; col++) {
    const x = col * TILE, y = row * TILE, kind = roadGround(world, tileAt(world, col, row));
    const nw = point(x, y), ne = point(x + TILE, y), sw = point(x, y + TILE), se = point(x + TILE, y + TILE);
    const heights = [nw[1], ne[1], sw[1], se[1]], slope = Math.max(...heights) - Math.min(...heights);
    const atWater = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dc, dr]) => tileAt(world, col + dc, row + dr) === 'water');
    const material = slope >= 9 && kind !== 'road' && kind !== 'water' && kind !== 'bridge' ? atWater ? 'sand' : 'cliff' : kind;
    let target = batches.get(material);
    if (!target) { target = batch(); batches.set(material, target); }
    shade.setRGB(1, 1, 1).multiplyScalar(.995 + hash(col, row) % 11 / 1000);
    const nearCrater=nearCraterTile(x,y);
    const step=4;
    if(!nearCrater)quad(target,nw,ne,sw,se,shade,kind!=='road'&&kind!=='water'?hash(col,row)%2:0);
    else for(let dz=0;dz<TILE;dz+=step)for(let dx=0;dx<TILE;dx+=step){
      const px=x+dx,pz=y+dz;
      shade.setRGB(1,1,1).multiplyScalar(.995+hash(col,row)%11/1000);
      for(const p of craters){
        const r=radiusAt(p,px+step/2,pz+step/2);
        if(r<1.08)shade.lerp(new THREE.Color(r<.72?'#403435':'#9b8265'),(1-smooth(.9,1.08,r))*.8);
      }
      quad(target,point(px,pz),point(px+step,pz),point(px,pz+step),point(px+step,pz+step),shade,kind!=='road'&&kind!=='water'?hash(col,row)%2:0,[dx/TILE,dz/TILE,step/TILE]);
    }
    if (kind === 'water') {
      shade.set('#d6d4ae');
      // Thin pale edges sit on the lake surface beside the sloping shore bank.
      if (tileAt(world, col, row - 1) !== 'water') quad(shoreline, point(x, y, .12), point(x + TILE, y, .12), point(x, y + .7, .12), point(x + TILE, y + .7, .12), shade);
      if (tileAt(world, col, row + 1) !== 'water') quad(shoreline, point(x, y + TILE - .7, .12), point(x + TILE, y + TILE - .7, .12), point(x, y + TILE, .12), point(x + TILE, y + TILE, .12), shade);
      if (tileAt(world, col - 1, row) !== 'water') quad(shoreline, point(x, y, .12), point(x + .7, y, .12), point(x, y + TILE, .12), point(x + .7, y + TILE, .12), shade);
      if (tileAt(world, col + 1, row) !== 'water') quad(shoreline, point(x + TILE - .7, y, .12), point(x + TILE, y, .12), point(x + TILE - .7, y + TILE, .12), point(x + TILE, y + TILE, .12), shade);
    }
    if (kind === 'road') for (const mark of roadMarks(world, col, row)) {
      const { x: rx, y: ry, w: rw, h: rh } = mark;
      shade.set(mark.color);
      quad(markings, point(rx, ry, .15), point(rx + rw, ry, .15), point(rx, ry + rh, .15), point(rx + rw, ry + rh, .15), shade);
    }
  }
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], textures: THREE.Texture[] = [];
  for (const [kind, data] of batches) {
    const texture = tileTexture(kind); textures.push(texture);
    const material = new THREE.MeshStandardMaterial({
      map: texture, vertexColors: true, roughness: kind === 'water' ? .3 : 1,
      metalness: kind === 'water' ? .12 : 0,
      transparent: kind === 'water', opacity: kind === 'water' ? .92 : 1,
    });
    const shape = geometry(data, kind === 'cliff' ? undefined : elevation.heightAt), mesh = new THREE.Mesh(shape, material);
    mesh.name = `terrain-${kind}`; mesh.receiveShadow = true;
    geometries.push(shape); materials.push(material); group.add(mesh);
    if (kind === 'water') water.push(mesh);
  }
  const overlay = (data: Batch, name: string, opacity: number) => {
    if (!data.positions.length) return;
    const shape = geometry(data), material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
    const mesh = new THREE.Mesh(shape, material); mesh.name = name;
    geometries.push(shape); materials.push(material); group.add(mesh);
  };
  overlay(shoreline, 'shore-foam', .55); overlay(markings, 'road-markings', 1);
  // Extrusion closes the outer cutaway without adding thousands of tile boxes.
  shade.set(MATERIALS.stone[2]);
  for (let col = 0; col < world.cols; col++) {
    const x = col * TILE;
    quad(skirts, point(x + TILE, 0), point(x, 0), [x + TILE, -20, 0], [x, -20, 0], shade);
    quad(skirts, point(x, world.height), point(x + TILE, world.height), [x, -20, world.height], [x + TILE, -20, world.height], shade);
  }
  for (let row = 0; row < world.rows; row++) {
    const y = row * TILE;
    quad(skirts, point(0, y), point(0, y + TILE), [0, -20, y], [0, -20, y + TILE], shade);
    quad(skirts, point(world.width, y + TILE), point(world.width, y), [world.width, -20, y + TILE], [world.width, -20, y], shade);
  }
  const skirtShape = geometry(skirts), skirtMaterial = new THREE.MeshStandardMaterial({ color: '#45515c', vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const skirtMesh = new THREE.Mesh(skirtShape, skirtMaterial); skirtMesh.name = 'terrain-cutaway'; skirtMesh.receiveShadow = true;
  geometries.push(skirtShape); materials.push(skirtMaterial); group.add(skirtMesh);
  const roads = buildRoadSurface(world, elevation.heightAt); group.add(roads.group);
  return { group, heightAt: elevation.heightAt, water, dispose: () => {
    roads.dispose();
    for (const shape of geometries) shape.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) texture.dispose();
    group.clear();
  } };
}
