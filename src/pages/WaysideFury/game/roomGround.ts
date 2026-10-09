import { insidePolygon } from './organicAreas.ts';
import { isBlocked, TILE, type WorldMap } from './worldBuilder.ts';
import { isRoadScene } from './roadNetwork.ts';

export interface GroundPoint { x: number; y: number }
export interface WornTrail { points: GroundPoint[]; width: number }
const trails = new WeakMap<WorldMap, WornTrail[]>();
const paved = new Set(['blast-2', 'blast-4', 'blast-5', 'blast-6', 'blast-7', 'blast-9']);
export const continuousBlastGround = (world: WorldMap) => world.id.startsWith('blast-');

// Artwork alone: collision, arrivals, rewards and save identities are untouched.
export function trailClear(world: WorldMap, x: number, y: number, radius = 18) {
  if (isBlocked(world, x, y, radius)) return false;
  // Depressions are walkable in gameplay, but a worn route must go around them.
  return !world.props.some(p => ['crater', 'impact', 'ember-vent'].includes(p.kind) &&
    x + radius > p.x && x - radius < p.x + p.w && y + radius > p.y && y - radius < p.y + p.h);
}
function segmentClear(world: WorldMap, a: GroundPoint, b: GroundPoint) {
  const count = Math.max(1, Math.ceil(Math.hypot(b.x-a.x, b.y-a.y)/2));
  for (let i=0;i<=count;i++) if (!trailClear(world,a.x+(b.x-a.x)*i/count,a.y+(b.y-a.y)*i/count)) return false;
  return true;
}
export function wornTrails(world: WorldMap): WornTrail[] {
  const cached=trails.get(world); if(cached) return cached;
  const result: WornTrail[]=[]; trails.set(world,result);
  // County and city streets already have an authored road network. Never lay
  // a second, unrelated ribbon across it. A framed opening needs no approach.
  if(!world.organic || isRoadScene(world)) return result;
  const cols=world.cols, rows=world.rows;
  const clear=new Uint8Array(cols*rows);
  for(let i=0;i<clear.length;i++) clear[i]=Number(trailClear(world,(i%cols+.5)*TILE,(Math.floor(i/cols)+.5)*TILE));
  const point=(i:number)=>({x:(i%cols+.5)*TILE,y:(Math.floor(i/cols)+.5)*TILE});
  const nearest=(p:GroundPoint)=> {
    let best=-1,distance=48;
    for(let i=0;i<clear.length;i++) if(clear[i]) {const q=point(i),d=Math.hypot(p.x-q.x,p.y-q.y);if(d<distance){best=i;distance=d;}}
    return best;
  };
  const destinations=[...world.exits.map(e=>({x:e.x+e.w/2,y:e.y+e.h/2})),
    ...world.props.filter(p=>p.kind==='chest').map(p=>({x:p.x+p.w/2,y:p.y+p.h+24}))];
  if(!world.exits.length)return result;
  const start=nearest(destinations.shift()!);if(start<0)return result;
  for(const destination of destinations) {
    const end=nearest(destination);if(end<0||end===start)continue;
    const parent=new Int32Array(clear.length).fill(-1),queue=[start];parent[start]=start;
    for(let n=0;n<queue.length&&parent[end]<0;n++) {
      const i=queue[n],x=i%cols,y=Math.floor(i/cols);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,ny=y+dy,j=ny*cols+nx;
        if(nx<0||ny<0||nx>=cols||ny>=rows||!clear[j]||parent[j]>=0||!segmentClear(world,point(i),point(j)))continue;
        parent[j]=i;queue.push(j);
      }
    }
    if(parent[end]<0)continue; // Narrow/locked routes get the opening alone.
    const route=[point(end)];for(let i=end;i!==start;){i=parent[i];route.push(point(i));}route.reverse();
    const simple=[route[0]];
    for(let i=0;i<route.length-1;) {let j=route.length-1;while(j>i+1&&!segmentClear(world,route[i],route[j]))j--;simple.push(route[j]);i=j;}
    // Round corners only when the entire sampled curve retains trail clearance.
    const smooth=[simple[0]];
    for(let i=1;i<simple.length-1;i++) {
      const a=simple[i-1],b=simple[i],d=simple[i+1];
      const blend=(p:GroundPoint)=>{const t=Math.min(.35,24/Math.hypot(p.x-b.x,p.y-b.y));return{x:b.x+(p.x-b.x)*t,y:b.y+(p.y-b.y)*t};};
      const from=blend(a),to=blend(d),curve=[from];
      for(let k=1;k<=12;k++){const t=k/12;curve.push({x:(1-t)**2*from.x+2*(1-t)*t*b.x+t*t*to.x,y:(1-t)**2*from.y+2*(1-t)*t*b.y+t*t*to.y});}
      if(curve.every((p,k)=>!k||segmentClear(world,curve[k-1],p)))smooth.push(...curve);else smooth.push(b);
    }
    smooth.push(simple[simple.length-1]);
    const safe=smooth.every((p,i)=>!i||segmentClear(world,smooth[i-1],p));
    result.push({points:safe?smooth:simple,width:28});
  }
  return result;
}
export function drawWornTrails(c:CanvasRenderingContext2D,world:WorldMap) {
  c.save();c.lineCap='butt';c.lineJoin='round';
  for(const trail of wornTrails(world)) {
    const first=trail.points[0],last=trail.points[trail.points.length-1];
    const tone=world.id.startsWith('woods-')?'118,111,84':paved.has(world.id)?'155,148,130':'173,148,116';
    const fade=c.createLinearGradient(first.x,first.y,last.x,last.y);
    fade.addColorStop(0,`rgba(${tone},0)`);fade.addColorStop(.12,`rgba(${tone},.13)`);fade.addColorStop(.88,`rgba(${tone},.13)`);fade.addColorStop(1,`rgba(${tone},0)`);
    c.strokeStyle=fade;
    for(let feather=8;feather>=0;feather-=2) {
      c.globalAlpha=.18;c.lineWidth=trail.width+feather;
      c.beginPath();trail.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();
    }
  }
  c.restore();
}

// A single ground composition replaces the old tile paving/dirt/ash blocks.
// This runs inside the native-DPR terrain cache, before all decals and props.
export function drawBlastGround(c:CanvasRenderingContext2D,world:WorldMap, bounds = {x:0,y:0,w:world.width,h:world.height}) {
  const concrete=paved.has(world.id);
  c.fillStyle=concrete?'#626564':'#685c53';c.fillRect(-2048,-2048,world.width+4096,world.height+4096);
  for(let n=0;n<7;n++) {
    const x=world.width*(.12+(n*37%79)/100),y=world.height*(.12+(n*29%73)/100);
    c.save();c.translate(x,y);c.scale(world.width*.25,world.height*.28);
    const wash=c.createRadialGradient(0,0,.1,0,0,1);
    wash.addColorStop(0,n%2?'#322f3828':concrete?'#afa48a24':'#ab92752b');wash.addColorStop(1,'#685c5300');
    c.fillStyle=wash;c.beginPath();c.ellipse(0,0,1,1,0,0,Math.PI*2);c.fill();c.restore();
  }
  // Fine ash/gravel flecks have world-space seeds, never tile borders.
  c.save();c.globalAlpha=.18;
  for(let y=Math.floor(bounds.y/7)*7;y<bounds.y+bounds.h;y+=7)for(let x=Math.floor(bounds.x/9)*9;x<bounds.x+bounds.w;x+=9) {
    const seed=Math.abs(Math.imul(x+7,374761393)^Math.imul(y+13,668265263));
    c.fillStyle=seed%2?'#b5a48b':'#34333c';c.fillRect(x+seed%71/10,y+(seed>>>8)%53/10,seed%5?.35:.8,.3);
  }
  c.restore();
  // Connected hazardous materials retain their authored extent and readability.
  // Smooth, slightly irregular perimeter curves replace stair-step tile banks.
  const visited=new Set<number>();
  for(let i=0;i<world.tiles.length;i++) if(world.organic?.landforms.some(form=>insidePolygon({x:(i%world.cols+.5)*TILE,y:(Math.floor(i/world.cols)+.5)*TILE},form.points))) visited.add(i);
  for(let i=0;i<world.tiles.length;i++) {
    const tile=world.tiles[i];if(visited.has(i)||!['water','corrupt'].includes(tile)||tile==='corrupt'&&!world.collision[i])continue;
    const queue=[i];visited.add(i);let minX=world.width,minY=world.height,maxX=0,maxY=0;
    for(let n=0;n<queue.length;n++) {
      const j=queue[n],x=j%world.cols,y=Math.floor(j/world.cols);
      minX=Math.min(minX,x*TILE);minY=Math.min(minY,y*TILE);maxX=Math.max(maxX,(x+1)*TILE);maxY=Math.max(maxY,(y+1)*TILE);
      for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const k=(y+dy)*world.cols+x+dx;if(x+dx>=0&&x+dx<world.cols&&y+dy>=0&&y+dy<world.rows&&world.tiles[k]===tile&&!visited.has(k)){visited.add(k);queue.push(k);}}
    }
    c.beginPath();c.moveTo(minX+4,minY);c.bezierCurveTo(minX-3,minY+(maxY-minY)*.3,minX+3,minY+(maxY-minY)*.7,minX,maxY-4);
    c.quadraticCurveTo(minX,maxY,maxX-4,maxY);c.quadraticCurveTo(maxX+2,maxY,maxX,maxY-8);
    c.bezierCurveTo(maxX-3,minY+(maxY-minY)*.7,maxX+3,minY+(maxY-minY)*.3,maxX,minY+4);c.quadraticCurveTo(maxX,minY,minX+4,minY);c.closePath();
    c.fillStyle=tile==='water'?'#355e69':'#493d4f';c.fill();c.strokeStyle=tile==='water'?'#90857460':'#82706b50';c.lineWidth=3;c.stroke();
  }
  c.strokeStyle=concrete?'#45484a':'#49424a';c.lineWidth=18;c.beginPath();c.roundRect(8,8,world.width-16,world.height-16,18);c.stroke();
}
