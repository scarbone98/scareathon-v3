import { fieldWorld } from './fieldAbilities.ts';
import type { GameState } from './sim.ts';
import { getWorld, isBlocked } from './world.ts';
export const onMoon = (s: Pick<GameState,'mapId'>) => s.mapId.startsWith('moon-m');
export const hasSpaceFlag = (s:GameState,id:string) => s.solvedInteractions.includes(id)||s.coop?.worldSolvedInteractions?.includes(id)===true;
export function lunarLift(s:Pick<GameState,'boundTimer'>) { return Math.sin(Math.PI*(1-Math.min(.4,s.boundTimer)/.4))*12; }
export function tickLunar(s:GameState,dt:number) {
  s.boundTimer=Math.max(0,s.boundTimer-dt);
  if (!onMoon(s)||s.localPaused||s.film||s.dialogue||s.overlay||s.coop?.downed||s.heroes[s.active].hp<=0) return;
  const world=getWorld(s.scene,s.room,s.mapId,!!s.coop);
  const safe=[0,2,5,6,7,8].includes(s.room)||s.solvedInteractions.includes('moon-unlimited-air');
  const near=world.props.some(p=>p.kind==='air'&&Math.hypot(s.x-(p.x+p.w/2),s.y-(p.y+p.h+10))<40);
  if (safe||near) { s.oxygen=Math.min(100,s.oxygen+dt*50); if (s.oxygen>25) s.oxygenWarned=false; }
  else s.oxygen=Math.max(0,s.oxygen-dt);
  if (s.oxygen<=25&&!s.oxygenWarned) { s.oxygenWarned=true; s.notice='Air running low. Free air posts are marked nearby; reserve recycler is automatic.'; }
  if (s.oxygen===0) s.notice='Reserve air — refill when convenient. No penalties.';
}
export function tryBoundLink(s:GameState) {
  if (!onMoon(s)) return false;
  const world=getWorld(s.scene,s.room,s.mapId,!!s.coop);
  for (const link of world.boundLinks??[]) for (const [from,to] of [[link.from,link.to],[link.to,link.from]]) {
    if (Math.hypot(s.x-from.x,s.y-from.y)>link.radius) continue;
    const dx=to.x-from.x,dy=to.y-from.y;
    if (dx*s.faceX+dy*s.faceY<0) continue;
    if (isBlocked(world,to.x,to.y,7)) { s.x=from.x; s.y=from.y; return false; }
    // Explicitly authored links only; the normal substepped dash still collides.
    s.boundTravel={from:{x:s.x,y:s.y},to:{...to},elapsed:0}; return true;
  }
  return false;
}
export function advanceBoundLink(s:GameState,dt:number) {
  const travel=s.boundTravel; if(!travel) return false;
  travel.elapsed=Math.min(.4,travel.elapsed+dt); const t=travel.elapsed/.4;
  s.x=travel.from.x+(travel.to.x-travel.from.x)*t; s.y=travel.from.y+(travel.to.y-travel.from.y)*t;
  if(t>=1) {
    if(isBlocked(getWorld(s.scene,s.room,s.mapId,!!s.coop),s.x,s.y,7)) {s.x=travel.from.x;s.y=travel.from.y;}
    s.boundTravel=null;
  }
  return true;
}
// Solved machinery removes the same precise footprint used by movement and QA.
export function lunarWorld(s:GameState) {
  const world=getWorld(s.scene,s.room,s.mapId,!!s.coop);
  if(world.id!=='moon-m05') return fieldWorld(s);
  return {...world,props:world.props.filter(p=>p.kind!=='seal'||!hasSpaceFlag(s,p.id))};
}

export function brakeBound(s:GameState) {
  if(s.boundTravel) { s.x=s.boundTravel.from.x; s.y=s.boundTravel.from.y; }
  s.boundTravel=null;s.boundTimer=0;s.dashTimer=0;
}
