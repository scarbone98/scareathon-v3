import { roadMask } from './roadClearance.ts';
import { overlaps, type WorldMap } from './worldBuilder.ts';
// Scenic miniatures at destination markers. These are presentation only: no
// collision, pickups, spawns or progression data are added to the world map.
export interface PreviewPart {
  shape: 'box' | 'cone' | 'rock'; color: string;
  x: number; y: number; z: number; groundX: number; groundZ: number; w: number; h: number; d: number;
}
export const ZONE_PREVIEWS: PreviewPart[] = [];
const part = (shape: PreviewPart['shape'], color: string, x: number, z: number, w: number, h: number, d: number, y = 0, groundX = x, groundZ = z) =>
  ZONE_PREVIEWS.push({ shape, color, x, y, z, groundX, groundZ, w, h, d });

// Hollow Woods: layered pine silhouettes, a ruined gate, pale mushrooms.
for (const [x, z, height] of [[604, 147, 31], [620, 115, 39], [643, 104, 33], [679, 111, 42], [708, 138, 34], [696, 160, 25]]) {
  part('box', '#795944', x, z, 3, height * .6, 3);
  for (let tier = 0; tier < 3; tier++) part('cone', ['#274638', '#42624c', '#668358'][tier], x, z, 24 - tier * 5, 20, 24 - tier * 5, height * .3 + tier * 7);
}
for (const x of [629, 683]) {
  part('box', '#45515c', x, 156, 7, 19, 8);
  part('box', '#a0a199', x, 156, 9, 2, 10, 19);
}
for (let k = 0; k < 9; k++) {
  const x = 608 + k * 11, z = 178 + k % 3 * 6;
  part('box', '#b9c3a3', x, z, 1, 3, 1);
  part('rock', k % 2 ? '#a36b9b' : '#dfca95', x, z, 4, 2, 3, 3);
}

// Old City: staggered rooflines, recessed windows, cornices and broken masonry.
for (const [x, z, w, h] of [[981, 537, 22, 31], [1006, 513, 19, 44], [1047, 511, 23, 37], [1074, 535, 25, 49], [1091, 564, 15, 23]]) {
  part('box', '#45515c', x, z, w + 4, 3, 18);
  part('box', '#636b70', x, z, w, h, 15, 3);
  part('box', '#a0a199', x, z, w + 2, 2, 17, h + 3);
  for (let level = 10; level + 6 < h; level += 10) for (const offset of [-w * .25, w * .25]) {
    part('box', '#252039', x + offset, z + 7.7, 4, 6, .6, level, x, z);
    part('box', '#a36b9b', x + offset, z + 8, 3, 1, .5, level + 1, x, z);
  }
}
for (let k = 0; k < 11; k++) part('rock', k % 2 ? '#636b70' : '#928079', 971 + k * 12, 580 + k % 3 * 5, 4 + k % 3, 3, 4);

// Blast Site: sparse, buried fragments follow the actual scorched depression.
for (let k = 0; k < 7; k++) {
  const angle = k * 2.39996;
  const x = 1104 + Math.cos(angle) * 69, z = 320 + Math.sin(angle) * 40;
  part('rock', k % 3 ? '#716149' : '#a28d72', x, z, 4 + k % 3 * 2, 2 + k % 2, 3);
}
for (const [x, z] of [[1014, 303], [1148, 285], [1170, 343]]) {
  part('box', '#3e3d4a', x, z, 4, 24, 4);
  part('box', '#716149', x + 3, z, 9, 3, 3, 15);
  part('rock', '#928079', x, z, 10, 3, 8);
}

export function drawPreviewPart(c: CanvasRenderingContext2D, p: PreviewPart) {
  const embedded=p.shape==='rock' && p.y===0;
  const x = p.x - p.w / 2, base = p.z - p.y + (embedded?p.h*.32:0), top = base - p.h;
  c.fillStyle = '#17282e'; c.globalAlpha = .22;
  c.beginPath(); c.ellipse(p.x + (embedded?0:2), p.z + (embedded?0:2), p.w * .6, p.d * (embedded?.2:.3), 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
  c.fillStyle = p.color; c.strokeStyle = '#26373d'; c.lineWidth = .8;
  c.beginPath();
  if (p.shape === 'cone') { c.moveTo(p.x, top); c.lineTo(x + p.w, base); c.lineTo(x, base); }
  else if (p.shape === 'rock') { c.moveTo(x, base - p.h * .4); c.lineTo(x + p.w * .3, top); c.lineTo(x + p.w * .8, top + 1); c.lineTo(x + p.w, base); c.lineTo(x + 2, base + 1); }
  else c.rect(x, top, p.w, p.h);
  c.closePath(); c.fill(); c.stroke();
  if(embedded){c.fillStyle='#6e705580';for(let n=0;n<6;n++)c.fillRect(x+n*p.w/6,p.z-.5,p.w/5,.8);}
  if (p.shape === 'box' && p.d > 2) {
    c.fillStyle = '#ffffff'; c.globalAlpha = .12; c.fillRect(x + 1, top + .5, Math.max(0, p.w - 2), 1);
    c.fillStyle = '#17282e'; c.globalAlpha = .2; c.fillRect(x + p.w * .7, top + 1, p.w * .3, p.h - 1); c.globalAlpha = 1;
  }
}

// Keep each miniature's trunk/roof/windows together; presentation cannot leave
// flowers on a plaza or a building base on the road after its curve changes.
const clearPreviews = new WeakMap<WorldMap, PreviewPart[]>();
export function zonePreviews(world: WorldMap): PreviewPart[] {
  let result=clearPreviews.get(world);if(result)return result;
  result=[];
  const groups=new Map<string,PreviewPart[]>(),mask=roadMask(world);
  for(const p of ZONE_PREVIEWS){const key=`${p.groundX},${p.groundZ}`;const parts=groups.get(key)??[];parts.push(p);groups.set(key,parts);}
  const bases=[...groups.values()].map(parts=>({parts,x:parts[0].groundX-Math.max(...parts.map(p=>p.w))/2,y:parts[0].groundZ-Math.max(...parts.map(p=>p.d))/2,w:Math.max(...parts.map(p=>p.w)),h:Math.max(...parts.map(p=>p.d))}));
  for(const [index,parts] of [...groups.values()].entries()) {
    const root=parts[0],w=Math.max(...parts.map(p=>p.w)),h=Math.max(...parts.map(p=>p.d));
    const rect={x:root.groundX-w/2,y:root.groundZ-h/2,w,h};
    let dx=0,dy=0;
    if(mask.intersects(rect)) {
      if(Math.max(...parts.map(p=>p.h+p.y))<=6)continue;
      const candidates:{dx:number;dy:number;distance:number}[]=[];
      for(let y=-128;y<=128;y+=4)for(let x=-128;x<=128;x+=4)candidates.push({dx:x,dy:y,distance:x*x+y*y});
      candidates.sort((a,b)=>a.distance-b.distance);
      const spot=candidates.find(p=>!mask.intersects({...rect,x:rect.x+p.dx,y:rect.y+p.dy})
        && !bases.some((base,i)=>i!==index && overlaps({...rect,x:rect.x+p.dx,y:rect.y+p.dy},base))
        && !world.props.some(prop=>(prop.footprints??[]).some(base=>overlaps({...rect,x:rect.x+p.dx,y:rect.y+p.dy},base))));
      if(!spot)throw new Error(`${world.id}: no roadside miniature placement at ${root.groundX},${root.groundZ}`);
      dx=spot.dx;dy=spot.dy;
    }
    bases[index].x+=dx;bases[index].y+=dy;
    result.push(...parts.map(p=>({...p,x:p.x+dx,z:p.z+dy,groundX:p.groundX+dx,groundZ:p.groundZ+dy})));
  }
  clearPreviews.set(world,result);return result;
}
