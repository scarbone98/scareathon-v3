import type { GameState } from './sim.ts';
import { TILE, type WorldMap } from './worldBuilder.ts';
import { roadPoints, roadWidth } from './roadNetwork.ts';
import { drawCountyWater } from './overworldWater.ts';
import { MATERIALS } from './terrain.ts';
import { LOCATIONS } from './content.ts';
import type { MapObjective } from './minimap.ts';
const cache = new WeakMap<WorldMap, HTMLCanvasElement>();
const colors: Record<string, string> = Object.fromEntries(Object.entries(MATERIALS).map(([kind,palette])=>[kind,palette[0]]));
export function bakeMinimap(map: WorldMap) {
  const existing = cache.get(map); if (existing) return existing;
  const canvas = document.createElement('canvas'); canvas.width = map.width; canvas.height = map.height;
  const c = canvas.getContext('2d')!;
  c.fillStyle = colors.grass; c.fillRect(0,0,map.width,map.height);
  for (let row=0;row<map.rows;row++) for(let col=0;col<map.cols;col++) {
    const i=row*map.cols+col, tile=map.tiles[i];
    // Curved road ribbons supersede their legacy rectangular tile paint.
    c.fillStyle=tile==='road'&&map.roads.length ? colors.grass : colors[tile] ?? '#a9b19a';
    c.fillRect(col*TILE,row*TILE,TILE,TILE);
    if(map.collision[i] && tile!=='water' && tile!=='grass') { c.fillStyle='#142f3860'; c.fillRect(col*TILE,row*TILE,TILE,TILE); }
  }
  c.lineJoin='round'; c.lineCap='round';
  if(map.id==='overworld')drawCountyWater(c,map,{x:0,y:0,w:map.width,h:map.height});
  for(const land of map.organic?.landforms ?? []) {c.beginPath();land.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle=land.kind==='water'?colors.water:'#52636b';c.fill();c.strokeStyle='#172f38';c.lineWidth=4;c.stroke();}
  for(const trail of map.organic?.trails ?? []) {c.beginPath();trail.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.strokeStyle=colors[trail.tile] ?? colors.dirt;c.lineWidth=trail.width;c.stroke();}
  for(const r of map.roads) {const points=roadPoints(r); c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.strokeStyle='#c1bba2';c.lineWidth=roadWidth(r);c.stroke();c.strokeStyle='#8e9485';c.lineWidth=Math.max(2,roadWidth(r)-8);c.stroke();}
  for(const p of map.props) {
    if(['tree','pine','flower','bush','reeds','npc','keeper','lamp','sign'].includes(p.kind)) continue;
    if(['station','home','shop','diner','shed','control','rocket','gantry','tank','ruin-house'].includes(p.kind)) { c.fillStyle='#adc6b6';c.fillRect(p.x,p.y,p.w,p.h);c.strokeStyle='#182f3c';c.lineWidth=3;c.strokeRect(p.x,p.y,p.w,p.h); }

  }
  c.fillStyle='#8bdec7'; for(const e of map.exits)c.fillRect(e.x,e.y,e.w,e.h);
  if(map.id==='overworld') for(const l of LOCATIONS) {c.beginPath();c.arc(l.x,l.y,14,0,Math.PI*2);c.fill();}
  cache.set(map,canvas); return canvas;
}
export function drawMinimap(canvas: HTMLCanvasElement, map: WorldMap, s: GameState, objective: MapObjective, full: boolean, rotate: boolean, time: number) {
  const width=canvas.clientWidth,height=canvas.clientHeight,dpr=window.devicePixelRatio||1;
  if(!width||!height)return;
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)) {canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  const c=canvas.getContext('2d')!; c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);c.fillStyle='#142f38';c.fillRect(0,0,width,height);
  const scale=full?Math.min((width-32)/map.width,(height-32)/map.height):width/640;
  const cx=full?map.width/2:s.x,cy=full?map.height/2:s.y;
  const angle=!full&&rotate?-Math.atan2(s.faceY,s.faceX)-Math.PI/2:0;
  const project=(x:number,y:number)=>({x:width/2+((x-cx)*Math.cos(angle)-(y-cy)*Math.sin(angle))*scale,y:height/2+((x-cx)*Math.sin(angle)+(y-cy)*Math.cos(angle))*scale});
  c.save();c.translate(width/2,height/2);c.rotate(angle);c.scale(scale,scale);c.drawImage(bakeMinimap(map),-cx,-cy);c.restore();
  const player=project(s.x,s.y);c.save();c.translate(player.x,player.y);c.rotate(Math.atan2(s.faceY,s.faceX)+angle+Math.PI/2);c.beginPath();c.moveTo(0,-8);c.lineTo(6,6);c.lineTo(0,3);c.lineTo(-6,6);c.closePath();c.fillStyle='#effffc';c.strokeStyle='#133b46';c.lineWidth=2;c.fill();c.stroke();c.restore();
  const point=project(objective.x,objective.y),margin=14;
  const dx=point.x-width/2,dy=point.y-height/2,ratio=Math.min(1,(width/2-margin)/Math.max(1,Math.abs(dx)),(height/2-margin)/Math.max(1,Math.abs(dy)));
  const x=width/2+dx*ratio,y=height/2+dy*ratio;
  c.save();c.translate(x,y);c.strokeStyle='#172f38';c.lineWidth=2;c.fillStyle='#ffda7b';
  if(ratio<1) {c.rotate(Math.atan2(dy,dx));c.beginPath();c.moveTo(8,0);c.lineTo(-5,-5);c.lineTo(-5,5);c.closePath();}
  else {const pulse=matchMedia('(prefers-reduced-motion: reduce)').matches?7:7+Math.sin(time/240)*1.5;c.beginPath();c.moveTo(0,-pulse);c.lineTo(pulse,0);c.lineTo(0,pulse);c.lineTo(-pulse,0);c.closePath();}
  c.fill();c.stroke();c.restore();
  c.font='bold 11px system-ui';c.fillStyle='#effffc';c.fillText(rotate&&!full?'↑ Heading':'N ↑',8,16);
  if(ratio<1) {c.fillStyle='#142f38e8';c.fillRect(0,height-21,width,21);c.fillStyle='#ffda7b';c.fillText(`${Math.round(Math.hypot(objective.x-s.x,objective.y-s.y)/10)} m`,7,height-7);}
}
