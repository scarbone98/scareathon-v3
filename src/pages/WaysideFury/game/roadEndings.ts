import { roadPoints, roadWidth } from './roadNetwork.ts';
import { TILE, tileAt, type RoadSegment, type WorldMap } from './worldBuilder.ts';

export function roadEndingKind(world:WorldMap,r:RoadSegment,index:number):'apron'|'trail' {
  const points=roadPoints(r),p=points[index],q=points[index===0?1:points.length-2];
  const x=p.x+(r.direction==='horizontal'?Math.sign(p.x-q.x)*8:0);
  const y=p.y+(r.direction==='vertical'?Math.sign(p.y-q.y)*8:0);
  return ['dirt','grass','ash','sand'].includes(tileAt(world,Math.floor(x/TILE),Math.floor(y/TILE)))?'trail':'apron';
}

export function clipRoadEnds(c:CanvasRenderingContext2D,r:RoadSegment,world:WorldMap) {
  if(world.id!=='overworld')return;
  const points=roadPoints(r);
  for(const [i,j,kind] of [[0,1,r.start],[points.length-1,points.length-2,r.end]] as const) {
    if(kind==='junction')continue;
    const p=points[i],q=points[j],angle=r.direction==='horizontal' ? (p.x>q.x?0:Math.PI) : (p.y>q.y?Math.PI/2:-Math.PI/2);
    c.translate(p.x,p.y);c.rotate(angle);
    const trim=kind==='entrance' && roadEndingKind(world,r,i)==='trail'?40:0;
    c.beginPath();c.rect(-20000,-20000,20000-trim,40000);c.clip();
    c.rotate(-angle);c.translate(-p.x,-p.y);
  }
}
// Overworld road termini alone receive a flared threshold. Room openings are terrain.
// Shared by native Canvas and terrain-draped 3D decals; no collision changes.
export function drawRoadEndings(c:CanvasRenderingContext2D,world:WorldMap) {
  if(world.id!=='overworld')return;
  for(const r of world.roads) {
    const points=roadPoints(r),half=roadWidth(r)/2;
    for(const [i,j,kind] of [[0,1,r.start],[points.length-1,points.length-2,r.end]] as const) {
      if(kind!=='entrance')continue;
      const p=points[i],q=points[j];
      c.save();c.translate(p.x,p.y);c.rotate(r.direction==='horizontal' ? (p.x>q.x?0:Math.PI) : (p.y>q.y?Math.PI/2:-Math.PI/2));
      const trail=roadEndingKind(world,r,i)==='trail';
      if(trail){
        c.beginPath();c.moveTo(-44,-half);c.lineTo(-20,-half*.75);c.lineTo(-12,-half*.8);c.lineTo(0,-half*.4);
        c.lineTo(0,half*.4);c.lineTo(-8,half*.65);c.lineTo(-20,half*.6);c.lineTo(-44,half);c.closePath();
        const fade=c.createLinearGradient(-44,0,0,0);fade.addColorStop(0,'#3b4f55');fade.addColorStop(.35,'#777364');fade.addColorStop(.7,'#97835bb0');fade.addColorStop(1,'#97835b00');c.fillStyle=fade;c.fill();
        c.fillStyle='#b6ac8880';for(let n=0;n<24;n++)c.fillRect(-38+n*1.5,(n%2?1:-1)*(half*(1-n/40)-3),.7,.5);
        c.restore();continue;
      }
      c.beginPath();c.moveTo(-44,-half+2);c.lineTo(-14,-half-5);
      c.quadraticCurveTo(-4,-half-8,0,-half);c.lineTo(0,half);
      c.quadraticCurveTo(-4,half+8,-14,half+5);c.lineTo(-44,half-2);c.closePath();
      const blend=c.createLinearGradient(-44,0,0,0);
      blend.addColorStop(0,'#3b4f5500');blend.addColorStop(.3,'#3b4f55');blend.addColorStop(1,'#79817a');
      c.fillStyle=blend;c.fill();
      // Fine threshold joints and gravel keep the transition from reading as
      // a hard rectangular end; lane paint stays well back from this apron.
      c.strokeStyle='#b0afa080';c.lineWidth=.8;
      c.beginPath();c.moveTo(-7,-half+5);c.lineTo(-7,half-5);c.stroke();
      c.fillStyle='#aaab9270';
      for(let n=0;n<14;n++){const x=-40+n*2.5,y=(n%2?1:-1)*(half-3-n%3);c.fillRect(x,y,.7,.5);}
      c.restore();
    }
  }
}
