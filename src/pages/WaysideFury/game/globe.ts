import { canEnter, getArea, getMap } from './campaign.ts';
import { isBlocked } from './worldBuilder.ts';
import type { GameState } from './sim.ts';
export interface GlobeDestination { id:string; name:string; areaId?:string; mapId:string; lat:number; lon:number; landmark:string; requirement:string; radarAnchorId:string }
export const GLOBE_DESTINATIONS: readonly GlobeDestination[] = [
  {id:'county',name:'County roads',mapId:'overworld',lat:.25,lon:0,landmark:'road',requirement:'',radarAnchorId:'globe-county'},
  {id:'wayside',name:'Wayside Station',areaId:'wayside',mapId:'hub',lat:.42,lon:-.42,landmark:'station',requirement:'',radarAnchorId:'globe-wayside'},
  {id:'blast',name:'Blast Site',areaId:'blast',mapId:'blast-0',lat:.1,lon:.62,landmark:'crater',requirement:'',radarAnchorId:'globe-blast'},
  {id:'launch',name:'Launch compound',areaId:'space',mapId:'space-launch',lat:-.22,lon:1.18,landmark:'rocket',requirement:'Recover the launch key from Hollow Woods to authorize launch access.',radarAnchorId:'globe-launch'},
  {id:'woods',name:'Hollow Woods',areaId:'woods',mapId:'',lat:.75,lon:-1.05,landmark:'woods',requirement:'Return through the realm. The Woods maps are coming next.',radarAnchorId:'globe-woods'},
  {id:'city',name:'Old City',areaId:'city',mapId:'',lat:-.45,lon:2.5,landmark:'city',requirement:'Recover the Prism Lens. City maps are coming in Chapter 4.',radarAnchorId:'globe-city'},
  {id:'finale',name:'Last Stop',areaId:'finale',mapId:'',lat:.18,lon:-2.6,landmark:'rift',requirement:'Restore Old City. The final rift is a future chapter.',radarAnchorId:'globe-finale'},
];
export function globeAvailable(s:GameState,d:GlobeDestination) {
  const area=d.areaId?getArea(d.areaId):undefined;
  const map=getMap(d.mapId);
  return !s.coop && !!map && (!d.areaId || !!area?.available && canEnter(s,d.areaId)) && !isBlocked(map,map.spawn.x,map.spawn.y,map.id==='overworld'?10:7);
}
export interface GlobeSession { origin:string; selected:string; lat:number; lon:number; heading:number; speed:number; phase:'takeoff'|'cruise'|'landing'; phaseTime:number; elapsed:number; seed:number; offer:boolean; offered:boolean; intercept:number; signals:number }
export const wrapLongitude=(lon:number)=>Math.atan2(Math.sin(lon),Math.cos(lon));
export function newGlobe(origin:string,seed=1729):GlobeSession {
  const d=GLOBE_DESTINATIONS.find(d=>d.id===origin)??GLOBE_DESTINATIONS[0];
  return {origin:d.id,selected:d.id,lat:d.lat,lon:d.lon,heading:0,speed:0,phase:'takeoff',phaseTime:0,elapsed:0,seed,offer:false,offered:false,intercept:0,signals:0};
}
export function globeDistance(s:GlobeSession,d:GlobeDestination) {
  return Math.acos(Math.min(1,Math.max(-1,Math.sin(s.lat)*Math.sin(d.lat)+Math.cos(s.lat)*Math.cos(d.lat)*Math.cos(s.lon-d.lon))));
}
export function startLanding(s:GlobeSession,available:boolean) {
  const d=GLOBE_DESTINATIONS.find(d=>d.id===s.selected);
  if(!available || !d || s.phase!=='cruise' || s.intercept>0 || globeDistance(s,d)>.22)return false;
  s.phase='landing';s.phaseTime=0;s.speed=0;s.offer=false;return true;
}
// Fixed-rate travel is independent of drawing and WebGL. No rewards or airborne
// save coordinates. Existing safe checkpoints handle reload before/after commit.
export function stepGlobe(s:GlobeSession,dt:number,input:{turn:number;throttle:number;brake:boolean;auto:boolean}) {
  s.elapsed+=dt;s.phaseTime+=dt;
  if(s.phase==='takeoff') {if(s.phaseTime>=1.25){s.phase='cruise';s.phaseTime=0;}return false;}
  const d=GLOBE_DESTINATIONS.find(d=>d.id===s.selected);
  if(s.phase==='landing') {
    if(d){const ease=1-Math.exp(-dt*4);s.lat+=(d.lat-s.lat)*ease;s.lon=wrapLongitude(s.lon+wrapLongitude(d.lon-s.lon)*ease);}
    return s.phaseTime>=1.8;
  }
  if(s.intercept>0) {s.intercept=Math.max(0,s.intercept-dt);s.speed=0;return false;}
  const delta=d?wrapLongitude(d.lon-s.lon):0;
  const desired=d?Math.atan2(delta*Math.cos(s.lat),d.lat-s.lat):s.heading;
  if(input.auto && d) s.heading+=wrapLongitude(desired-s.heading)*(1-Math.exp(-dt*3));
  else s.heading=wrapLongitude(s.heading+input.turn*dt*1.5);
  const target=input.brake?0:input.auto&&d&&globeDistance(s,d)<.12?0:Math.max(0,.065+input.throttle*.06);
  s.speed+=(target-s.speed)*(1-Math.exp(-dt*3));
  s.lat=Math.max(-1.25,Math.min(1.25,s.lat+Math.cos(s.heading)*s.speed*dt));
  s.lon=wrapLongitude(s.lon+Math.sin(s.heading)*s.speed*dt/Math.max(.3,Math.cos(s.lat)));
  if(s.elapsed>13.25 && !s.offered) {s.offered=true;s.offer=(s.seed>>>0)%5===0;}
  return false;
}
export function spherePoint(lat:number,lon:number) {return {x:Math.cos(lat)*Math.sin(lon),y:Math.sin(lat),z:Math.cos(lat)*Math.cos(lon)};}
export function globeProject(lat:number,lon:number,s:Pick<GlobeSession,'lat'|'lon'>) {
  const p=spherePoint(lat,wrapLongitude(lon-s.lon)),tilt=s.lat-.9;
  return {x:p.x,y:p.y*Math.cos(tilt)-p.z*Math.sin(tilt),z:p.y*Math.sin(tilt)+p.z*Math.cos(tilt)};
}
// Original geography, tessellated once. No source map or copied continents.
const geography=(lat:number,lon:number)=>Math.abs(lat)>1.25 ? -1 : Math.sin(lon*2+.8)*Math.cos(lat*3)+.43*Math.sin(lon*5-lat*4)+.2*Math.cos(lon*9+lat*7)-.23;
export const GLOBE_PATCHES = Array.from({length:48},(_,row)=>Array.from({length:96},(_,col)=>{
  const lat=(row/48-.5)*Math.PI,lon=(col/96-.5)*Math.PI*2,delta=Math.PI/48;
  const corners=[[lat,lon],[lat+delta,lon],[lat+delta,lon+delta],[lat,lon+delta]];
  const polygon:number[][]=[];
  for(let i=0;i<4;i++) {
    const a=corners[i],b=corners[(i+1)%4],fa=geography(a[0],a[1]),fb=geography(b[0],b[1]);
    if(fa>=0)polygon.push(a);
    if((fa>=0)!==(fb>=0)){const t=fa/(fa-fb);polygon.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }
  return {lat,lon,land:polygon.length>2,polygon,color:'#76947a'};
})).flat();
