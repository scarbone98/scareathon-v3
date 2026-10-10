import { clipRoadEnds, drawRoadEndings } from './roadEndings.ts';
import { countyRoadPaint } from './countyRoadPaint.ts';
// One polyline network supplies pavement, junction paint and exact ribbon queries.
// Crossings in current content are at grade; a water causeway is not an overpass.
import type { RoadSegment, WorldMap } from './worldBuilder.ts';
export interface RoadPoint { x: number; y: number }
const authoredPoints = (r: RoadSegment): RoadPoint[] => r.curve ?? (r.direction === 'horizontal'
  ? [{x:r.x,y:r.y+r.h/2},{x:r.x+r.w,y:r.y+r.h/2}]
  : [{x:r.x+r.w/2,y:r.y},{x:r.x+r.w/2,y:r.y+r.h}]);
// Small tangent fillets preserve authored road routes while rounding bends.
// All paint, collision queries and the terrain decal use this cached centerline.
const centerlines = new WeakMap<RoadSegment, RoadPoint[]>();
export function roadPoints(r: RoadSegment): RoadPoint[] {
  const saved = centerlines.get(r); if (saved) return saved;
  const source = authoredPoints(r), result = [source[0]];
  for (let i = 1; i < source.length - 1; i++) {
    const a = source[i-1], b = source[i], c = source[i+1];
    const incoming = Math.hypot(b.x-a.x,b.y-a.y), outgoing = Math.hypot(c.x-b.x,c.y-b.y);
    if (!incoming || !outgoing) continue;
    const cut = Math.min(18, incoming/4, outgoing/4);
    const start = {x:b.x+(a.x-b.x)*cut/incoming,y:b.y+(a.y-b.y)*cut/incoming};
    const end = {x:b.x+(c.x-b.x)*cut/outgoing,y:b.y+(c.y-b.y)*cut/outgoing};
    result.push(start);
    for (let n=1;n<=8;n++) { const t=n/8,u=1-t;
      result.push({x:u*u*start.x+2*u*t*b.x+t*t*end.x,y:u*u*start.y+2*u*t*b.y+t*t*end.y});
    }
  }
  result.push(source[source.length-1]); centerlines.set(r,result); return result;
}
export const roadWidth = (r: RoadSegment) => r.curveWidth ?? (r.direction==='horizontal'?r.h:r.w);
export function projectRoad(p: RoadPoint, a: RoadPoint, b: RoadPoint) {
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  const x=a.x+t*dx,y=a.y+t*dy;
  return {x,y,distance:Math.hypot(p.x-x,p.y-y)};
}
export function roadDistance(r: RoadSegment, x: number, y: number) {
  const points=roadPoints(r);let nearest=Infinity;
  // Taxi collision runs several times per fixed tick. Avoid transient arrays
  // and projection objects on this hot path, particularly on phones.
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
    const px=x-a.x-t*dx,py=y-a.y-t*dy;
    nearest=Math.min(nearest,px*px+py*py);
  }
  return Math.sqrt(nearest);
}
// Centerline bounds let point queries skip roads that are plainly too far away.
const bounds = new WeakMap<RoadPoint[], {left:number;right:number;top:number;bottom:number}>();
export function roadBounds(r: RoadSegment) {
  const points=roadPoints(r);let box=bounds.get(points);
  if(!box){box={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};for(const p of points){box.left=Math.min(box.left,p.x);box.right=Math.max(box.right,p.x);box.top=Math.min(box.top,p.y);box.bottom=Math.max(box.bottom,p.y);}bounds.set(points,box);}
  return box;
}
const within = (r: RoadSegment, x: number, y: number, reach: number) => {
  const box=roadBounds(r);
  return x>=box.left-reach && x<=box.right+reach && y>=box.top-reach && y<=box.bottom+reach;
};
export const onRoad = (world: WorldMap,x:number,y:number,margin=0) => world.roads.some(r=>{const reach=roadWidth(r)/2+margin;return within(r,x,y,reach)&&roadDistance(r,x,y)<=reach;});
export const junctionAt = (world:WorldMap,r:RoadSegment,x:number,y:number,margin=12) => world.roads.some(other=>{const reach=roadWidth(other)/2+margin;return other!==r&&within(other,x,y,reach)&&roadDistance(other,x,y)<reach;});
export interface RoadPaint { a: RoadPoint; b: RoadPoint; points?: RoadPoint[]; width: number; kind: 'lane' | 'stop' }
export function networkPaint(world:WorldMap):RoadPaint[] {
  if(world.id==='overworld')return countyRoadPaint(world);
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
      for(let d=0;d<length;) {
        const phase=(run+d)%36, step=Math.min(length-d, phase<14?14-phase:36-phase);
        if(step<.00001){d+=.00001;continue;}
        const p=at(d),q=at(d+step);
        if(phase<14 && run+d>=44 && !(i===points.length-1 && d+step>length-44)
          && ![p,q,at(d+step/2)].some(p=>junctionAt(world,r,p.x,p.y)))
          result.push({a:p,b:q,width:1.2,kind:'lane'});
        d+=step;
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
export const isRoadScene = (world: WorldMap) => ['overworld','hub','city-boulevard','city-market','city-clockroof'].includes(world.id);
const paintCache=new WeakMap<WorldMap,RoadPaint[]>();
export interface DrawBounds { x: number; y: number; w: number; h: number }
// Bounds let cached terrain chunks skip geometry that cannot reach their pixels.
const touches = (bounds: DrawBounds | undefined, left: number, top: number, right: number, bottom: number, pad = 0) =>
  !bounds || right + pad >= bounds.x && left - pad <= bounds.x + bounds.w && bottom + pad >= bounds.y && top - pad <= bounds.y + bounds.h;
export function drawRoadNetwork(c:CanvasRenderingContext2D,world:WorldMap,bounds?:DrawBounds) {
  if(!world.roads.length || world.id && !isRoadScene(world))return;
  c.save();c.lineJoin='round';c.lineCap='round';
  for(const p of world.props??[]) if(['barrier','bridge-rail','gate-wall','portal'].includes(p.kind)) for(const r of p.footprints??[]) {
    if(!touches(bounds,r.x,r.y,r.x+r.w,r.y+r.h,2))continue;
    c.beginPath();c.rect(-20000,-20000,40000,40000);c.rect(r.x,r.y,r.w,r.h);c.clip('evenodd');
  }
  // Union in two passes: every curb first, then every asphalt ribbon. No road
  // can leave its curb inside another road, including T/X/Y joins and bends.
  const layers: readonly (readonly [string,number])[] = world.id==='overworld' ? [['#63735d',-6],['#a1a392',0],['#3b4f55',3]] : [['#a1a392',0],['#3b4f55',3]];
  for(const [color,inset] of layers) {
    c.strokeStyle=color;
    for(const r of world.roads) {
      // Non-overworld roads are stretched to the room edge below. Long county
      // roads span most chunks' boxes, so cull by segment; a touching road is
      // still stroked whole so its joins match the uncached network.
      if(world.id==='overworld' && bounds) {
        const points=roadPoints(r),pad=roadWidth(r)/2+8;
        if(!points.slice(1).some((b,i)=>{const a=points[i];return touches(bounds,Math.min(a.x,b.x),Math.min(a.y,b.y),Math.max(a.x,b.x),Math.max(a.y,b.y),pad);}))continue;
      }
      c.save();clipRoadEnds(c,r,world);
      c.lineWidth=roadWidth(r)-inset;c.beginPath();const points=roadPoints(r).map(p=>({...p}));
      if(world.id!=='overworld') {
        if(r.direction==='horizontal'){points[0].x=0;points[points.length-1].x=world.width;}
        else {points[0].y=0;points[points.length-1].y=world.height;}
        c.lineCap='butt';
      }
      points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();c.restore();
    }
    c.fillStyle=color;
    for(const {corner,a,b} of curbCorners(world,inset)) {
      if(!touches(bounds,Math.min(corner.x,a.x,b.x),Math.min(corner.y,a.y,b.y),Math.max(corner.x,a.x,b.x),Math.max(corner.y,a.y,b.y),2))continue;
      c.beginPath();c.moveTo(corner.x,corner.y);c.lineTo(a.x,a.y);
      c.quadraticCurveTo(corner.x,corner.y,b.x,b.y);c.closePath();c.fill();
    }
  }
  drawRoadEndings(c,world,bounds);
  let marks=paintCache.get(world);if(!marks){marks=networkPaint(world);paintCache.set(world,marks);}
  c.lineCap='round';
  for(const mark of marks) {
    if(bounds){const points=mark.points??[mark.a,mark.b];if(!touches(bounds,Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y)),Math.max(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y)),mark.width+2))continue;}
    c.strokeStyle=mark.kind==='lane'?'#c6b991':'#e0ded0';c.lineWidth=mark.width;c.beginPath();c.moveTo(mark.a.x,mark.a.y);for(const p of mark.points?.slice(1)??[mark.b])c.lineTo(p.x,p.y);c.stroke();}
  c.restore();
}
// Road tiles remain a coarse material/navigation index, never visible asphalt.
export function roadGround(world:WorldMap,kind:import('./worldBuilder.ts').TileKind) {
  if(!isRoadScene(world) && kind==='road')return world.id.startsWith('woods-')?'dirt':'stone';
  return world.roads.length&&(kind==='road'||kind==='bridge'&&world.id==='overworld') ? kind==='bridge'?'water':world.id.startsWith('city-')?'stone':world.id.startsWith('blast-')?'ash':'grass' : kind;
}
