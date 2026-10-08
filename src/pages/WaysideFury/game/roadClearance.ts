import { roadDistance, roadPoints, roadWidth, projectRoad, type RoadPoint } from './roadNetwork.ts';
import { TILE, overlaps, tileAt, type CollisionRect, type WorldMap, type WorldProp } from './worldBuilder.ts';

function segmentDistance(a:RoadPoint,b:RoadPoint,p:RoadPoint,q:RoadPoint) {
  const cross=(u:RoadPoint,v:RoadPoint,w:RoadPoint)=>(v.x-u.x)*(w.y-u.y)-(v.y-u.y)*(w.x-u.x);
  if(cross(a,b,p)*cross(a,b,q)<=0 && cross(p,q,a)*cross(p,q,b)<=0
    && Math.max(a.x,b.x)>=Math.min(p.x,q.x) && Math.max(p.x,q.x)>=Math.min(a.x,b.x)
    && Math.max(a.y,b.y)>=Math.min(p.y,q.y) && Math.max(p.y,q.y)>=Math.min(a.y,b.y))return 0;
  return Math.min(projectRoad(a,p,q).distance,projectRoad(b,p,q).distance,projectRoad(p,a,b).distance,projectRoad(q,a,b).distance);
}

export const ROAD_SHOULDER = TILE / 2;
export const groundScatter = (p: WorldProp) => ['flower', 'reeds', 'puddle', 'debris', 'ash-tuft', 'blast-scrap', 'bank-stones', 'plaza-fragment'].includes(p.kind);
// Gates, bridge rails and boundary barriers are the road infrastructure itself.
export const roadInfrastructure = (p: WorldProp) => ['barrier', 'bridge-rail', 'gate-wall', 'portal'].includes(p.kind);

// One world-space mask, built only after roads have their final curved geometry.
// Pavement includes traversable tile plazas and the vector sidewalk connectors.
// Solid furnishing/parking bases are authored pockets in plazas, not footways.
export function roadClearance(world: WorldMap) {
  const ribbons = world.roads.map(r => {
    const points=roadPoints(r),radius=roadWidth(r)/2+ROAD_SHOULDER;
    return {r,points,radius,left:Math.min(...points.map(p=>p.x))-radius,right:Math.max(...points.map(p=>p.x))+radius,top:Math.min(...points.map(p=>p.y))-radius,bottom:Math.max(...points.map(p=>p.y))+radius};
  });
  const sidewalks=world.organic?.trails.filter(t=>t.tile==='stone')??[];
  const pockets=new Map<number,CollisionRect[]>();
  for(const p of world.props)if(!['tree','pine','bush','rock','dead-tree'].includes(p.kind))for(const r of p.footprints??[]) {
    for(let row=Math.floor((r.y-4)/TILE);row<=Math.floor((r.y+r.h+4)/TILE);row++)for(let col=Math.floor((r.x-4)/TILE);col<=Math.floor((r.x+r.w+4)/TILE);col++) {
      const key=row*world.cols+col,list=pockets.get(key)??[];list.push(r);pockets.set(key,list);
    }
  }
  const onRibbon = (x: number, y: number, margin = 0) => ribbons.some(({r, points, radius}) => {
    // Entrance caps stop at their facade/gate plane rather than going under it.
    for (const [index, next, kind] of [[0, 1, r.start], [points.length - 1, points.length - 2, r.end]] as const) {
      if (kind === 'junction') continue;
      const p = points[index], q = points[next], dx = r.direction==='horizontal' ? Math.sign(q.x-p.x) : 0, dy = r.direction==='vertical' ? Math.sign(q.y-p.y) : 0;
      if ((x-p.x)*dx+(y-p.y)*dy < -margin*Math.hypot(dx,dy)) return false;
    }
    return roadDistance(r,x,y) < radius+margin;
  });
  const paved = (x: number, y: number) => {
    if (!world.roads.length) return false;
    const col=Math.floor(x/TILE),row=Math.floor(y/TILE);
    const isPaved=tileAt(world,col,row)==='stone' && !world.collision[row*world.cols+col]
      || (sidewalks.some(t=>t.points.slice(1).some((b,i)=>{
        const a=t.points[i],dx=b.x-a.x,dy=b.y-a.y,u=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
        return Math.hypot(x-a.x-u*dx,y-a.y-u*dy)<t.width/2;
      })) ?? false);
    if(!isPaved)return false;
    return !(pockets.get(row*world.cols+col)??[]).some(r=>x>=r.x-4 && x<=r.x+r.w+4 && y>=r.y-4 && y<=r.y+r.h+4);
  };
  const contains = (x: number, y: number) => onRibbon(x,y) || paved(x,y);
  const intersects = (rect: CollisionRect, includePaving = true) => {
    if(ribbons.some(({r,points,radius,left,right,top,bottom})=>{
      if(right<=rect.x || left>=rect.x+rect.w || bottom<=rect.y || top>=rect.y+rect.h)return false;
      let polygon:RoadPoint[]=[{x:rect.x,y:rect.y},{x:rect.x+rect.w,y:rect.y},{x:rect.x+rect.w,y:rect.y+rect.h},{x:rect.x,y:rect.y+rect.h}];
      for(const [index,next,kind] of [[0,1,r.start],[points.length-1,points.length-2,r.end]] as const) {
        if(kind==='junction')continue;
        const a=points[index],b=points[next],dot=(p:RoadPoint)=>r.direction==='horizontal'?(p.x-a.x)*Math.sign(b.x-a.x):(p.y-a.y)*Math.sign(b.y-a.y);
        const clipped:RoadPoint[]=[];
        for(let i=0;i<polygon.length;i++) {
          const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=dot(p),dq=dot(q);
          if(dp>1e-6)clipped.push(p);
          if((dp>1e-6)!==(dq>1e-6)){const t=dp/(dp-dq);clipped.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});}
        }
        polygon=clipped;
      }
      if(polygon.length<3 || Math.abs(polygon.reduce((sum,p,i)=>sum+p.x*polygon[(i+1)%polygon.length].y-p.y*polygon[(i+1)%polygon.length].x,0))<.001)return false;
      const inside=(p:RoadPoint)=>{const signs=polygon.map((a,j)=>{const b=polygon[(j+1)%polygon.length];return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);});return signs.every(n=>n>=0)||signs.every(n=>n<=0);};
      return points.some(inside) || points.slice(1).some((b,i)=>polygon.some((p,j)=>segmentDistance(points[i],b,p,polygon[(j+1)%polygon.length])<radius));
    }))return true;
    if(includePaving)for(let y=rect.y;y<=rect.y+rect.h;y+=2)for(let x=rect.x;x<=rect.x+rect.w;x+=2)if(paved(x,y))return true;
    return false;
  };
  return { contains, intersects };
}
const masks = new WeakMap<WorldMap, ReturnType<typeof roadClearance>>();
export function roadMask(world: WorldMap) {
  let mask=masks.get(world);
  if(!mask){mask=roadClearance(world);masks.set(world,mask);}
  return mask;
}

const relocationOffsets:{dx:number;dy:number;distance:number}[]=[];
for(let dy=-192;dy<=192;dy+=4)for(let dx=-192;dx<=192;dx+=4)relocationOffsets.push({dx,dy,distance:dx*dx+dy*dy});
relocationOffsets.sort((a,b)=>a.distance-b.distance);

export interface RoadRelocation { mapId: string; propId: string; dx: number; dy: number }
// Move physical bases, not tall sprite bounds. IDs, labels, interactions and
// collision rectangles travel together. Never change an exit or gameplay gate.
export function clearRoads(world: WorldMap): RoadRelocation[] {
  if(!world.roads.length)return [];
  masks.delete(world);
  const mask=roadMask(world),moves:RoadRelocation[]=[];
  world.props=world.props.filter(p=>!groundScatter(p) || !mask.intersects(p,true));
  const priority=(p:WorldProp)=>['station','home','shop','shed','diner','water-tower','car','ambient-taxi'].includes(p.kind)?0:1;
  for(const p of [...world.props].sort((a,b)=>priority(a)-priority(b))) {
    if(roadInfrastructure(p) || !(p.footprints??[]).some(r=>mask.intersects(r)))continue;
    const found=relocationOffsets.find(({dx,dy})=> (p.footprints??[]).every(base=>{
      const r={...base,x:base.x+dx,y:base.y+dy};
      if(mask.intersects(r,['tree','pine','bush','rock','dead-tree'].includes(p.kind)) || r.x<32 || r.y<32 || r.x+r.w>world.width-32 || r.y+r.h>world.height-32)return false;
      for(const x of [r.x,r.x+r.w])for(const y of [r.y,r.y+r.h]) {
        const col=Math.floor(x/TILE),row=Math.floor(y/TILE);
        if(world.collision[row*world.cols+col] || ['water','void'].includes(tileAt(world,col,row)) || p.kind==='car' && tileAt(world,col,row)!=='stone')return false;
      }
      const space={x:r.x-8,y:r.y-8,w:r.w+16,h:r.h+16};
      return !world.props.some(other=>other!==p && (other.footprints??[]).some(b=>overlaps(space,b)))
        && ![world.spawn,...world.spawns].some(a=>overlaps(space,{x:a.x-12,y:a.y-12,w:24,h:24}))
        && !world.exits.some(e=>overlaps(space,e));
    }));
    if(!found)throw new Error(`${world.id}/${p.id}: no clear roadside placement`);
    p.x+=found.dx;p.y+=found.dy;
    for(const r of p.footprints??[]){r.x+=found.dx;r.y+=found.dy;}
    for(const a of world.radarAnchors??[])if(a.id===p.id){a.x+=found.dx;a.y+=found.dy;}
    moves.push({mapId:world.id,propId:p.id,dx:found.dx,dy:found.dy});
  }
  masks.delete(world); // Reindex furnishing pockets at their final positions.
  return moves;
}
