import { roadPoints, roadWidth, projectRoad, onRoad } from './roadNetwork.ts';
import { HIDDEN_PICKUPS } from '../../../../server/shared/waysideFury/collectibles.js';
import { TILE, paint, prop, type WorldMap, type TileKind } from './worldBuilder.ts';
export interface AreaPoint { x: number; y: number }
export interface AreaTrail { points: AreaPoint[]; width: number; tile: TileKind }
export interface AreaLandform { points: AreaPoint[]; kind: 'cliff' | 'water'; color: string }
export interface OrganicLayout { trails: AreaTrail[]; landforms: AreaLandform[]; stairs: AreaPoint[] }
const distance = (p: AreaPoint, a: AreaPoint, b: AreaPoint) => {
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
};
export function insidePolygon(p: AreaPoint, points: AreaPoint[]) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
function ribbon(m: WorldMap, points: AreaPoint[], width: number, tile: TileKind) {
  const layout=m.organic??={trails:[],landforms:[],stairs:[]};
  if(tile!=='road')layout.trails.push({points,width,tile});
  // Foot trails are native vector artwork over existing passable ground.
  // Only taxi roads need a material grid for the optional depth renderer.
  if (tile !== "road") return;
  const half=width/2,segments=points.slice(1).map((b,i)=>{const a=points[i];return {a,b,left:Math.min(a.x,b.x)-half,right:Math.max(a.x,b.x)+half,top:Math.min(a.y,b.y)-half,bottom:Math.max(a.y,b.y)+half};});
  for(let row=1;row<m.rows-1;row++) for(let col=1;col<m.cols-1;col++) {
    const p={x:col*TILE+8,y:row*TILE+8};
    if(segments.some(s=>p.x>=s.left&&p.x<=s.right&&p.y>=s.top&&p.y<=s.bottom&&distance(p,s.a,s.b)<half)) {
      const index=row*m.cols+col;
      // A trail never removes authored water, gates, cliffs or collision.
      if(tile==='road' && m.tiles[index]==='water') { m.tiles[index]='bridge'; m.collision[index]=0; }
      else if(!m.collision[index] && m.tiles[index]!=='stone') m.tiles[index]=tile;
    }
  }
}
function landform(m: WorldMap, points: AreaPoint[], kind: 'water'|'cliff', color: string, reserved: AreaPoint[]) {
  if(reserved.some(p=>insidePolygon(p,points)||points.some((q,i)=>distance(p,q,points[(i+1)%points.length])<48))) return;
  m.organic!.landforms.push({points,kind,color});
  for(let row=1;row<m.rows-1;row++) for(let col=1;col<m.cols-1;col++) {
    if(insidePolygon({x:col*TILE+8,y:row*TILE+8},points)) {m.tiles[row*m.cols+col]=kind==='water'?'water':'stone';m.collision[row*m.cols+col]=1;}
  }
}
function local(m: WorldMap, index: number, arrivals: AreaPoint[]) {
  const woods=m.id.startsWith('woods-'),city=m.id.startsWith('city-'),blast=m.id.startsWith('blast-');
  const ground:TileKind=woods?(m.id==='woods-mirror-sawmill'?'corrupt':'grass'):city?(m.id.includes('backstage')||m.id.includes('doorway')?'corrupt':'stone'):'ash';
  const path:TileKind=woods?'dirt':city?'stone':'dirt',cy=m.spawn.y;
  m.organic={trails:[],landforms:[],stairs:[]};
  // Retain the Blast rebuild’s authored paving; add contour trails and stairs.
  // Other local maps replace the old straight band, retaining solid terrain.
  const keepPaving=m.props.some(p=>p.kind==="car");
  if(!city&&!blast) m.tiles=m.tiles.map((tile,i)=>!m.collision[i]&&(tile==='dirt'||tile==='sand'||tile==='stone'&&!keepPaving||tile==='corrupt'&&!woods)?ground:tile);
  else if(city) m.tiles=m.tiles.map(tile=>tile==='road'?'stone':tile);
  const reserved=[m.spawn,...arrivals,...m.spawns,...m.props.filter(p=>['seal','socket','chest','npc'].includes(p.kind)).map(p=>({x:p.x+p.w/2,y:p.y+p.h+16})),...HIDDEN_PICKUPS.filter(p=>p.scene==='dungeon'&&m.id===`blast-${p.room}`)];
  const lower=index%2===0,sign=lower?1:-1;
  const points=[m.spawn,{x:144,y:cy+sign*64},{x:272,y:cy+sign*56},{x:336,y:cy},{x:400,y:cy},{x:m.width-208,y:cy-sign*64},{x:m.width-64,y:cy}];
  if(['city-boulevard','city-market','city-clockroof'].includes(m.id)) {
    m.roads.push({id:`${m.id}-street`,x:32,y:cy-36,w:m.width-64,h:72,direction:'horizontal',start:'entrance',end:'entrance',curve:points,curveWidth:72});
  }
  ribbon(m,points,72,path);
  for (const car of m.props.filter(p=>p.kind==="car")) ribbon(m,[{x:car.x+car.w/2,y:car.y+car.h+16},{x:car.x+car.w/2,y:cy}],48,"stone");
  // A second contour route forms an actual walkable loop around an island.
  ribbon(m,[{x:144,y:cy+sign*64},{x:184,y:cy-sign*104},{x:272,y:cy-sign*96},{x:336,y:cy}],52,path);
  // Irregular islands introduce an alcove and a detour, with generous combat pockets.
  landform(m,[{x:112,y:64},{x:176,y:48},{x:248,y:72},{x:264,y:112},{x:208,y:136},{x:136,y:112}],woods?'water':'cliff',woods?'#35697a':'#66665f',reserved);
  landform(m,[{x:m.width-224,y:m.height-112},{x:m.width-152,y:m.height-144},{x:m.width-72,y:m.height-112},{x:m.width-64,y:m.height-56},{x:m.width-176,y:m.height-48}],index%3===0?'water':'cliff',woods?'#486653':city?'#776c65':'#70605c',reserved);
  for(const e of m.exits) {
    const old={x:e.x+e.w/2,y:e.y+e.h/2};
    if(e.x===0) e.x=32;
    else if(e.x+e.w>=m.width) e.x=m.width-e.w-32;
    if(e.y===0) e.y=32;
    else if(e.y+e.h>=m.height) e.y=m.height-e.h-32;
    const center={x:e.x+e.w/2,y:e.y+e.h/2};
    // Same ID, target, gate and arrival anchor; only its physical apron moves.
    ribbon(m,[old,center,{x:Math.max(80,Math.min(m.width-80,center.x)),y:cy}],64,path);
    // Stairs retain authored carriageways and their paved entrance connectors.
    const paving=blast?m.tiles.flatMap((tile,i)=>['road','stone','bridge'].includes(tile)?[{i,tile}]:[]):[];
    paint(m,e.x,e.y,e.w,e.h,path);
    for(const {i,tile} of paving) m.tiles[i]=tile;
    m.organic.stairs.push(center);
    // Close the former opening with a visible boundary, retaining entry clearance.
    if(old.x<32) paint(m,0,e.y,16,e.h,ground,true);
    if(old.x>m.width-32) paint(m,m.width-16,e.y,16,e.h,ground,true);
    if(old.y<32) paint(m,e.x,0,e.w,16,ground,true);
    if(old.y>m.height-32) paint(m,e.x,m.height-16,e.w,16,ground,true);
  }
  // Clear scenery bases from the new ribbons, leaving all gameplay props intact.
  m.props=m.props.filter(p=>!['tree','pine','rock','flower'].includes(p.kind)||!(p.footprints??[]).some(r=>m.organic!.trails.some(t=>t.points.slice(1).some((b,i)=>distance({x:r.x+r.w/2,y:r.y+r.h/2},t.points[i],b)<t.width/2+12))));
  if(woods&&index!==3) for(const [x,y] of [[80,56],[m.width-136,64],[m.width-176,m.height-96]]) {
    if(!reserved.some(p=>Math.hypot(x+24-p.x,y+56-p.y)<64)) prop(m,'pine',x,y,48,64);
  }
}
export function shapeOrganicAreas(worlds: WorldMap[]) {
  for(const [i,m] of worlds.filter(m=>/^(blast-|woods-|city-)/.test(m.id)).entries()) local(m,i,worlds.flatMap(world=>world.exits.filter(e=>e.targetMapId===m.id).map(e=>({x:e.entryX,y:e.entryY}))));
  const county=worlds.find(m=>m.id==='overworld');
  if(county) {
    county.organic={trails:[],landforms:[],stairs:[]};
    // Winding footpaths link the existing road loops, stops and farmhouse.
    ribbon(county,[{x:208,y:480},{x:288,y:608},{x:272,y:784},{x:352,y:896},{x:448,y:960}],64,'dirt');
    ribbon(county,[{x:1248,y:960},{x:1376,y:864},{x:1536,y:912},{x:1600,y:1040},{x:1456,y:1120},{x:1376,y:1248}],72,'dirt');
    ribbon(county,[{x:1536,y:912},{x:1824,y:944},{x:1936,y:1088},{x:1840,y:1248}],64,'dirt');
    const reserves=[county.spawn,...HIDDEN_PICKUPS.filter(p=>p.scene==='overworld')];
    landform(county,[{x:1328,y:584},{x:1504,y:560},{x:1632,y:624},{x:1584,y:704},{x:1440,y:736},{x:1344,y:672}],'cliff','#667464',reserves);
    // Existing county road identities remain; their long district legs now bend.
    for(const r of county.roads.filter(r=>['county','garden-loop','reservoir-loop','orchard-loop','county-shortcut','reservoir-causeway'].includes(r.id))) {
      const horizontal=r.direction==='horizontal',a={x:r.x+(horizontal?0:r.w/2),y:r.y+(horizontal?r.h/2:0)},b={x:r.x+(horizontal?r.w:r.w/2),y:r.y+(horizontal?r.h/2:r.h)};
      const points=r.id==='county' ? [a,{x:208,y:480},{x:352,y:480},{x:520,y:480},{x:832,y:480},{x:944,y:480},{x:1088,y:480},{x:1280,y:464},{x:1584,y:480},{x:1840,y:512},{x:2064,y:544},b] : [a,{x:a.x+(b.x-a.x)*.25+(horizontal?0:80),y:a.y+(b.y-a.y)*.25+(horizontal?-64:0)},{x:a.x+(b.x-a.x)*.65+(horizontal?0:112),y:a.y+(b.y-a.y)*.65+(horizontal?64:0)},b];
      r.curve=points;r.curveWidth=64;
    }
    // Snap junction terminals onto their adjoining centerline; this removes
    // rounded caps extending past T junctions and makes district loops connect.
    for(const r of county.roads) {
      const points=roadPoints(r).map(p=>({...p}));
      for(const [index,kind] of [[0,r.start],[points.length-1,r.end]] as const) {
        if(kind!=='junction')continue;
        const p=points[index];
        // Slide the terminal along its own heading onto the nearest crossing
        // centerline, so spurs stay straight; otherwise project sideways.
        const inward=index?points.slice(0,index).reverse():points.slice(1);
        const back=inward.find(q=>Math.hypot(q.x-p.x,q.y-p.y)>=8)??inward[0];
        const len=Math.hypot(p.x-back.x,p.y-back.y)||1,dx=(p.x-back.x)/len,dy=(p.y-back.y)/len;
        let slide: {x:number;y:number;along:number}|undefined;
        for(const other of county.roads) if(other!==r) {
          const q=roadPoints(other);
          for(let i=1;i<q.length;i++){
            const a=q[i-1],b=q[i],ex=b.x-a.x,ey=b.y-a.y,den=dx*ey-dy*ex;
            if(Math.abs(den)<1e-9)continue;
            const along=((a.x-p.x)*ey-(a.y-p.y)*ex)/den,t=((a.x-p.x)*dy-(a.y-p.y)*dx)/den;
            if(t>=0&&t<=1&&Math.abs(along)<144&&(!slide||Math.abs(along)<Math.abs(slide.along)))slide={x:p.x+dx*along,y:p.y+dy*along,along};
          }
        }
        if(slide){points[index]={x:slide.x,y:slide.y};continue;}
        const candidates=county.roads.filter(other=>other!==r).flatMap(other=>{
          const q=roadPoints(other);return q.slice(1).map((b,i)=>projectRoad(p,q[i],b));
        }).sort((a,b)=>a.distance-b.distance);
        if(candidates[0]?.distance<144)points[index]={x:candidates[0].x,y:candidates[0].y};
      }
      r.curve=points;r.curveWidth=roadWidth(r);
    }
    // Remove ALL old raster lanes before rasterizing any new ribbon. Sequential
    // removal preserved earlier roads' stair steps at overlap cells.
    const oldTiles=[...county.tiles];
    county.tiles=oldTiles.map((tile,i)=>{
      if(tile!=='road'&&tile!=='bridge')return tile;
      const col=i%county.cols,row=Math.floor(i/county.cols);
      const water=(direction:number)=>[1,2,3,4,5].some(d=>oldTiles[(row+direction*d)*county.cols+col]==='water');
      return tile==='bridge'||water(-1)&&water(1)?'water':'grass';
    });
    county.collision=county.tiles.map((tile,i)=>tile==='water'?1:oldTiles[i]==='road'||oldTiles[i]==='bridge'?0:county.collision[i]);
    for(const r of county.roads)ribbon(county,roadPoints(r),roadWidth(r),'road');
    county.props=county.props.filter(p=>!['tree','pine','rock','bush','fence','reeds','crate','bench'].includes(p.kind)||!(p.footprints??[]).some(r=>onRoad(county,r.x+r.w/2,r.y+r.h/2,Math.hypot(r.w,r.h)/2+12)||county.organic!.trails.some(t=>t.points.slice(1).some((b,i)=>distance({x:r.x+r.w/2,y:r.y+r.h/2},t.points[i],b)<t.width/2+12))));
    // Keep the two lookout approaches dressed after clearing the shifted lanes.
    for(const x of [768,1760])for(const side of [-1,1]) {
      const px=x+side*88,py=x===768?1340:1224;
      if(!onRoad(county,px+12,py+12,24))prop(county,'flower',px,py,24,16);
    }
  }
}
