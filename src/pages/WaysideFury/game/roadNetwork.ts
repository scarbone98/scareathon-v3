import { clipRoadEnds, drawRoadEndings } from './roadEndings.ts';
// One polyline network supplies pavement, junction paint and exact ribbon queries.
// Crossings in current content are at grade; a water causeway is not an overpass.
import type { RoadSegment, WorldMap } from './worldBuilder.ts';
export interface RoadPoint { x: number; y: number }
export const roadPoints = (r: RoadSegment): RoadPoint[] => r.curve ?? (r.direction === 'horizontal'
  ? [{x:r.x,y:r.y+r.h/2},{x:r.x+r.w,y:r.y+r.h/2}]
  : [{x:r.x+r.w/2,y:r.y},{x:r.x+r.w/2,y:r.y+r.h}]);
export const roadWidth = (r: RoadSegment) => r.curveWidth ?? (r.direction==='horizontal'?r.h:r.w);
export function projectRoad(p: RoadPoint, a: RoadPoint, b: RoadPoint) {
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  const x=a.x+t*dx,y=a.y+t*dy;
  return {x,y,distance:Math.hypot(p.x-x,p.y-y)};
}
export function roadDistance(r: RoadSegment, x: number, y: number) {
  const points=roadPoints(r);
  return Math.min(...points.slice(1).map((b,i)=>projectRoad({x,y},points[i],b).distance));
}
export const onRoad = (world: WorldMap,x:number,y:number,margin=0) => world.roads.some(r=>roadDistance(r,x,y)<=roadWidth(r)/2+margin);
export const junctionAt = (world:WorldMap,r:RoadSegment,x:number,y:number,margin=12) => world.roads.some(other=>other!==r&&roadDistance(other,x,y)<roadWidth(other)/2+margin);
export interface RoadPaint { a: RoadPoint; b: RoadPoint; width: number; kind: 'lane' | 'stop' }
export function networkPaint(world:WorldMap):RoadPaint[] {
  const result:RoadPaint[]=[];
  for(const r of world.roads) {
    const points=roadPoints(r);let run=0;
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y);if(!length)continue;
      const dx=(b.x-a.x)/length,dy=(b.y-a.y)/length;
      const at=(d:number)=>({x:a.x+dx*d,y:a.y+dy*d});
      for(let d=0;d<length;d+=2) {
        const p=at(d),next=at(Math.min(length,d+2));
        // Stop bars sit before the open junction, perpendicular to each approach.
        if(junctionAt(world,r,p.x,p.y)!==junctionAt(world,r,next.x,next.y)) {
          if(i===1 && r.start!=='junction' && d<44 || i===points.length-1 && r.end!=='junction' && d>length-44)continue;
          const half=roadWidth(r)/2-7;
          result.push({a:{x:p.x-dy*half,y:p.y+dx*half},b:{x:p.x+dy*half,y:p.y-dx*half},width:1.8,kind:'stop'});
        }
      }
      for(let d=(10-run%36+36)%36;d+14<length;d+=36) {
        const p=at(d),q=at(d+14);
        if(i===1&&d<44||i===points.length-1&&d+14>length-44)continue;
        if([p,q,at(d+7)].some(p=>junctionAt(world,r,p.x,p.y)))continue;
        result.push({a:p,b:q,width:1.2,kind:'lane'});
      }
      run+=length;
    }
  }
  return result;
}
interface CurbCorner { corner:RoadPoint; a:RoadPoint; b:RoadPoint }
const cross=(a:RoadPoint,b:RoadPoint)=>a.x*b.y-a.y*b.x;
const subtract=(a:RoadPoint,b:RoadPoint)=>({x:a.x-b.x,y:a.y-b.y});
const cornerCache=new WeakMap<WorldMap,CurbCorner[][]>();
// Tangent fillets round the concave grass corners of arbitrary T/X/Y junctions.
function curbCorners(world:WorldMap,inset:number):CurbCorner[] {
  let cached=cornerCache.get(world);if(!cached){cached=[];cornerCache.set(world,cached);}
  if(cached[inset])return cached[inset];
  const centers:RoadPoint[]=[];
  for(let i=0;i<world.roads.length;i++)for(let j=i+1;j<world.roads.length;j++) {
    const a=roadPoints(world.roads[i]),b=roadPoints(world.roads[j]);
    for(let ai=1;ai<a.length;ai++)for(let bi=1;bi<b.length;bi++) {
      const u=subtract(a[ai],a[ai-1]),v=subtract(b[bi],b[bi-1]),den=cross(u,v);if(Math.abs(den)<.001)continue;
      const delta=subtract(b[bi-1],a[ai-1]),t=cross(delta,v)/den,q=cross(delta,u)/den;
      if(t<0||t>1||q<0||q>1)continue;
      const p={x:a[ai-1].x+u.x*t,y:a[ai-1].y+u.y*t};
      if(!centers.some(other=>Math.hypot(other.x-p.x,other.y-p.y)<1))centers.push(p);
    }
  }
  const result:CurbCorner[]=[];
  for(const center of centers) {
    const rays:{u:RoadPoint;half:number;angle:number}[]=[];
    for(const road of world.roads) {
      const points=roadPoints(road);
      for(let i=1;i<points.length;i++) {
        if(projectRoad(center,points[i-1],points[i]).distance>.1)continue;
        for(const p of [points[i-1],points[i]]) {
          const length=Math.hypot(p.x-center.x,p.y-center.y);if(length<1)continue;
          const u={x:(p.x-center.x)/length,y:(p.y-center.y)/length},angle=Math.atan2(u.y,u.x);
          if(!rays.some(ray=>Math.abs(cross(ray.u,u))<.01&&ray.u.x*u.x+ray.u.y*u.y>0))rays.push({u,half:(roadWidth(road)-inset)/2,angle});
        }
      }
    }
    rays.sort((a,b)=>a.angle-b.angle);
    for(let i=0;i<rays.length;i++) {
      const first=rays[i],second=rays[(i+1)%rays.length],u=first.u,v=second.u;
      const angle=(second.angle-first.angle+Math.PI*2)%(Math.PI*2),den=cross(u,v);
      if(angle<.35||angle>Math.PI-.1)continue;
      const a={x:center.x-u.y*first.half,y:center.y+u.x*first.half};
      const b={x:center.x+v.y*second.half,y:center.y-v.x*second.half};
      const t=cross(subtract(b,a),v)/den,corner={x:a.x+u.x*t,y:a.y+u.y*t};
      if(Math.hypot(corner.x-center.x,corner.y-center.y)>128)continue;
      result.push({corner,a:{x:corner.x+u.x*12,y:corner.y+u.y*12},b:{x:corner.x+v.x*12,y:corner.y+v.y*12}});
    }
  }
  cached[inset]=result;return result;
}
const paintCache=new WeakMap<WorldMap,RoadPaint[]>();
export function drawRoadNetwork(c:CanvasRenderingContext2D,world:WorldMap) {
  if(!world.roads.length)return;
  c.save();c.lineJoin='round';c.lineCap='round';
  for(const p of world.props??[]) if(['barrier','bridge-rail','gate-wall','portal'].includes(p.kind)) for(const r of p.footprints??[]) {
    c.beginPath();c.rect(-20000,-20000,40000,40000);c.rect(r.x,r.y,r.w,r.h);c.clip('evenodd');
  }
  // Union in two passes: every curb first, then every asphalt ribbon. No road
  // can leave its curb inside another road, including T/X/Y joins and bends.
  for(const [color,inset] of [['#a1a392',0],['#3b4f55',3]] as const) {
    c.strokeStyle=color;
    for(const r of world.roads) {
      c.save();clipRoadEnds(c,r,world);
      c.lineWidth=roadWidth(r)-inset;c.beginPath();roadPoints(r).forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();c.restore();
    }
    c.fillStyle=color;
    for(const {corner,a,b} of curbCorners(world,inset)) {
      c.beginPath();c.moveTo(corner.x,corner.y);c.lineTo(a.x,a.y);
      c.quadraticCurveTo(corner.x,corner.y,b.x,b.y);c.closePath();c.fill();
    }
  }
  drawRoadEndings(c,world);
  let marks=paintCache.get(world);if(!marks){marks=networkPaint(world);paintCache.set(world,marks);}
  c.lineCap='butt';
  for(const mark of marks) {c.strokeStyle=mark.kind==='lane'?'#c6b991':'#e0ded0';c.lineWidth=mark.width;c.beginPath();c.moveTo(mark.a.x,mark.a.y);c.lineTo(mark.b.x,mark.b.y);c.stroke();}
  c.restore();
}
// Road tiles remain a coarse material/navigation index, never visible asphalt.
export function roadGround(world:WorldMap,kind:import('./worldBuilder.ts').TileKind) {
  return world.roads.length&&(kind==='road'||kind==='bridge'&&world.id==='overworld') ? kind==='bridge'?'water':world.id.startsWith('city-')?'stone':world.id.startsWith('blast-')?'ash':'grass' : kind;
}
