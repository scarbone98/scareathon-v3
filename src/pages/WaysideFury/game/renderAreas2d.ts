import { drawRoadNetwork } from './roadNetwork.ts';
import { INTERIORS, interiorDefinition } from './interiors.ts';
import type { WorldMap } from './worldBuilder.ts';
import type { GameState } from './sim.ts';
const walkablePaths = new WeakMap<WorldMap, Path2D>();
const THEMES:Record<string,[string,string,string]>={station:['#485b60','#d5ba82','#294449'],diner:['#846857','#efc69b','#853e43'],farm:['#766047','#ddc49a','#567257'],office:['#4a616b','#bee0db','#35545e'],shed:['#685953','#b6a086','#4c5756'],warehouse:['#68656a','#ccb794','#595066'],cabin:['#6b624b','#dfc78c','#3e6659'],archive:['#5b5664','#c9ad91','#635278'],cafe:['#6e585f','#f0c4a6','#547568']};
export function drawAreaGround(c:CanvasRenderingContext2D, world:WorldMap) {
  if(!world.organic) return;
  c.save();c.lineCap='round';c.lineJoin='round';
  let passable=walkablePaths.get(world);
  if(!passable){passable=new Path2D();for(let i=0;i<world.tiles.length;i++)if(!world.collision[i])passable.rect(i%world.cols*16,Math.floor(i/world.cols)*16,16,16);walkablePaths.set(world,passable);}
  c.save();c.clip(passable);
  for(const trail of world.organic.trails) {
    if(trail.tile==='road')continue;
    // Native vector borders soften tile contours without changing collision.
    c.beginPath();trail.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));
    c.strokeStyle=trail.tile==='stone'?'#646b6b':'#857153';c.lineWidth=trail.width-12;c.stroke();
    c.strokeStyle=trail.tile==='stone'?'#777c75':'#9c8662';c.lineWidth=trail.width-20;c.stroke();
  }
  c.restore();
  drawRoadNetwork(c,world);
  for(const form of world.organic.landforms) {
    const path=()=>{c.beginPath();form.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();};
    if(form.kind==='cliff') {
      c.save();c.translate(0,10);path();c.fillStyle='#3d4547';c.fill();c.strokeStyle='#343e40';c.lineWidth=3;c.stroke();c.restore();
      path();c.fillStyle=form.color;c.fill();c.strokeStyle='#acac8c';c.lineWidth=2;c.stroke();
      for(const p of form.points) {c.strokeStyle='#88907c';c.lineWidth=1;c.beginPath();c.moveTo(p.x,p.y+2);c.lineTo(p.x+3,p.y+8);c.stroke();}
    } else {
      path();c.fillStyle=form.color;c.fill();c.strokeStyle='#98b8aa';c.lineWidth=2;c.stroke();
      c.save();path();c.clip();for(let n=0;n<12;n++){const p=form.points[n%form.points.length];c.strokeStyle='#74a3a7';c.globalAlpha=.35;c.beginPath();c.ellipse(p.x+20,p.y+12,24+n%3*8,3,0,0,Math.PI);c.stroke();}c.restore();
    }
  }
  for(const p of world.organic.stairs) {
    c.fillStyle='#515b5d';c.fillRect(p.x-24,p.y-24,48,40);
    for(let i=0;i<5;i++){c.fillStyle=i%2?'#8f9487':'#a6a798';c.fillRect(p.x-24,p.y-24+i*8,48,2);}
  }
  c.restore();
}
export function drawInteriorGround(c:CanvasRenderingContext2D, world:WorldMap) {
  const room=interiorDefinition(world.id);if(!room)return;
  const [floor,light,accent]=THEMES[room.theme];c.save();
  c.fillStyle='#18262d';c.fillRect(-2048,-2048,4096,4096);
  c.fillStyle=floor;c.fillRect(32,48,world.width-64,world.height-80);
  // Fine floorboards, grouted cafe tiles and numbered warehouse aisles.
  const tiled=room.theme==='diner'||room.theme==='cafe'||room.theme==='office';
  for(let y=48;y<world.height-32;y+=tiled?24:12) {
    c.strokeStyle='rgba(20,28,34,.18)';c.lineWidth=.8;c.beginPath();c.moveTo(32,y);c.lineTo(world.width-32,y);c.stroke();
    for(let x=32;x<world.width-32;x+=tiled?24:80){c.beginPath();c.moveTo(x+(tiled?0:y%24?32:0),y);c.lineTo(x+(tiled?0:y%24?32:0),y+(tiled?24:12));c.stroke();}
  }
  c.fillStyle=accent;c.fillRect(32,16,world.width-64,32);c.fillStyle=light;c.fillRect(32,46,world.width-64,2);
  c.fillStyle='#2c3f49';c.fillRect(56,20,72,22);c.fillRect(320,20,72,22);
  c.fillStyle='#a9d3ce';c.fillRect(60,24,64,14);c.fillRect(324,24,64,14);
  c.strokeStyle=light;c.lineWidth=2;for(const x of [92,356]){c.beginPath();c.moveTo(x,22);c.lineTo(x,42);c.stroke();}
  c.globalAlpha=.12;c.fillStyle=light;c.beginPath();c.moveTo(60,48);c.lineTo(128,48);c.lineTo(200,256);c.lineTo(92,256);c.fill();c.globalAlpha=1;
  c.fillStyle=accent;c.beginPath();c.roundRect(152,180,144,76,12);c.fill();c.strokeStyle=light;c.lineWidth=1;c.stroke();
  c.globalAlpha=.3;for(let n=0;n<4;n++){c.strokeRect(160+n*4,188+n*4,128-n*8,60-n*8);}c.globalAlpha=1;
  // An obvious exit mat, distant from every furniture footprint.
  c.fillStyle='#bdad87';c.fillRect(200,288,48,32);c.strokeStyle='#5c6158';c.strokeRect(203,291,42,26);
  if(room.theme==='archive'||room.theme==='cabin'||room.theme==='station') {
    for(let x=144;x<288;x+=12){c.fillStyle=x%24?'#ba8464':'#849a8c';c.fillRect(x,26,8,16);}
  }
  c.restore();
}
export function drawBuildingDoors(c:CanvasRenderingContext2D,s:GameState) {
  c.save();
  for(const room of INTERIORS) if(room.parent===s.mapId) {
    c.fillStyle='#23383d';c.beginPath();c.roundRect(room.x-11,room.y-26,22,26,3);c.fill();
    c.strokeStyle='#e2c58e';c.lineWidth=1.5;c.stroke();c.fillStyle='#efcf95';c.beginPath();c.arc(room.x+5,room.y-12,1.5,0,Math.PI*2);c.fill();
    c.fillStyle='rgba(225,202,146,.14)';c.beginPath();c.ellipse(room.x,room.y+8,18,7,0,0,Math.PI*2);c.fill();
  }
  c.restore();
}
