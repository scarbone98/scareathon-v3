import { TILE, tileAt, type WorldMap } from './worldBuilder.ts';
import { roadGround } from './roadNetwork.ts';

interface Point { x: number; y: number }
interface Lake { points: Point[]; x: number; y: number; w: number; h: number }
const cache = new WeakMap<WorldMap, Lake[]>();
export const isCountyWater = (world: WorldMap, col: number, row: number) =>
  col >= 0 && row >= 0 && col < world.cols && row < world.rows && roadGround(world, tileAt(world, col, row)) === 'water';

// Trace the authored water union, including the water beneath road causeways.
// The narrow rounded bank is presentation only; collision never opens a shortcut.
export function countyLakes(world: WorldMap): Lake[] {
  const saved = cache.get(world); if (saved) return saved;
  const edges = new Map<string, Point[]>();
  const key = (p: Point) => `${p.x},${p.y}`;
  const add = (a: Point, b: Point) => { const list = edges.get(key(a)) ?? []; list.push(b); edges.set(key(a), list); };
  for (let row = 0; row < world.rows; row++) for (let col = 0; col < world.cols; col++) {
    if (!isCountyWater(world, col, row)) continue;
    const x = col * TILE, y = row * TILE;
    if (!isCountyWater(world, col, row - 1)) add({x,y}, {x:x+TILE,y});
    if (!isCountyWater(world, col + 1, row)) add({x:x+TILE,y}, {x:x+TILE,y:y+TILE});
    if (!isCountyWater(world, col, row + 1)) add({x:x+TILE,y:y+TILE}, {x,y:y+TILE});
    if (!isCountyWater(world, col - 1, row)) add({x,y:y+TILE}, {x,y});
  }
  const lakes: Lake[] = [];
  while (edges.size) {
    const start = edges.keys().next().value!;
    const [x,y] = start.split(',').map(Number); const points: Point[] = [{x,y}];
    let current = start;
    do {
      const choices = edges.get(current); if (!choices?.length) break;
      const next = choices.pop()!; if (!choices.length) edges.delete(current);
      current = key(next); if (current !== start) points.push(next);
    } while (current !== start);
    // Keep only direction changes, so bank curves span entire straight runs.
    const corners = points.filter((p,i) => {
      const a = points[(i+points.length-1)%points.length], b = points[(i+1)%points.length];
      return (p.x-a.x)*(b.y-p.y) !== (p.y-a.y)*(b.x-p.x);
    });
    if (corners.length < 3) continue;
    const xs = corners.map(p=>p.x), ys = corners.map(p=>p.y);
    lakes.push({points:corners,x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)});
  }
  cache.set(world,lakes); return lakes;
}

function outline(c: CanvasRenderingContext2D, lake: Lake) {
  c.beginPath();
  lake.points.forEach((p,i) => {
    const a = lake.points[(i+lake.points.length-1)%lake.points.length], b = lake.points[(i+1)%lake.points.length];
    const trim = Math.min(12, Math.hypot(p.x-a.x,p.y-a.y)/2, Math.hypot(b.x-p.x,b.y-p.y)/2);
    const before = {x:p.x+(a.x-p.x)*trim/Math.hypot(a.x-p.x,a.y-p.y),y:p.y+(a.y-p.y)*trim/Math.hypot(a.x-p.x,a.y-p.y)};
    const after = {x:p.x+(b.x-p.x)*trim/Math.hypot(b.x-p.x,b.y-p.y),y:p.y+(b.y-p.y)*trim/Math.hypot(b.x-p.x,b.y-p.y)};
    if (i) c.lineTo(before.x,before.y); else c.moveTo(before.x,before.y);
    c.quadraticCurveTo(p.x,p.y,after.x,after.y);
  });
  c.closePath();
}

export function drawCountyWater(c: CanvasRenderingContext2D, world: WorldMap, bounds: {x:number;y:number;w:number;h:number}, time?: number) {
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  for (const lake of countyLakes(world)) {
    if (lake.x > bounds.x+bounds.w+8 || lake.x+lake.w < bounds.x-8 || lake.y > bounds.y+bounds.h+8 || lake.y+lake.h < bounds.y-8) continue;
    outline(c,lake);
    if (time === undefined) {
      c.fillStyle = '#326879'; c.fill();
      // Wet sand, shallow turquoise and a feathered depth falloff follow one
      // continuous path instead of independently beveling every water cell.
      c.strokeStyle = '#7f917b'; c.lineWidth = 5; c.stroke();
      c.save(); c.clip();
      c.strokeStyle = '#6bb0b3'; c.globalAlpha = .07;
      for (let width = 32; width >= 2; width -= 2) {
        c.lineWidth = width; c.stroke();
      }
      c.lineWidth = 1.1; c.strokeStyle = '#d1ded0'; c.globalAlpha = .65; c.stroke();
      c.restore();
    } else {
      c.save(); c.clip(); c.lineWidth = .45;
      // World-space, staggered waves: no per-tile restart or drifting banks.
      const top = Math.max(lake.y, bounds.y), bottom = Math.min(lake.y+lake.h,bounds.y+bounds.h);
      for (let y = Math.floor(top/23)*23; y < bottom; y += 23) {
        for (let x = Math.floor(Math.max(lake.x,bounds.x)/41)*41; x < Math.min(lake.x+lake.w,bounds.x+bounds.w); x += 41) {
          const phase = x*.017+y*.031+time*.7, px = x+Math.sin(y*.41)*9, py = y+Math.sin(phase)*1.2;
          c.globalAlpha = .10+(Math.sin(phase)+1)*.045; c.strokeStyle = '#b5d8d5';
          c.beginPath(); c.moveTo(px,py); c.quadraticCurveTo(px+8,py-1.3,px+17,py); c.stroke();
        }
      }
      c.restore();
    }
  }
  c.restore();
}
