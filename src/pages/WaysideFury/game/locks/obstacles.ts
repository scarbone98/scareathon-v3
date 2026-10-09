// Ported from Update 1 U3 (origin/wayside-fury-update1), without its inventory
// namespace. Enclosed side alcoves preserve every authored story route.
import type { GameState, HeroId } from '../sim.ts';
import { getWorld, isBlocked, type CollisionRect } from '../world.ts';
import { gateRequirementMet, type GateRequirement } from '../../../../../server/shared/waysideFury/obstacles.js';
export interface HeroObstacle extends CollisionRect {
  id: string; worldId: string; kind: 'boulder' | 'vent' | 'terminal' | 'vines';
  hero: HeroId; name: string; requirement: GateRequirement; walls: CollisionRect[];
  rewardAnchor: {x:number;y:number}; rewardId: string; lore: string;
}
const make = (id:string,worldId:string,kind:HeroObstacle['kind'],hero:HeroId,left:number,top:number,requirement:GateRequirement,name:string,lore:string):HeroObstacle => ({
  id:`locks-${id}`,worldId,kind,hero,requirement,name,lore,x:left+6,y:top+68,w:60,h:10,
  walls:[{x:left,y:top,w:72,h:6},{x:left,y:top+6,w:6,h:72},{x:left+66,y:top+6,w:6,h:72}],
  rewardAnchor:{x:left+36,y:top+40},rewardId:`locks-cache-${id}`,
});
export const HERO_OBSTACLES:readonly HeroObstacle[] = [
  make('county-danger','overworld','vent','you',384,48,{kind:'level',level:8},'Danger: Lv 8+ · inspect barricade','Old survey ledger: the relay was listening long before the egg arrived.'),
  make('county-debris','overworld','boulder','joe',720,48,{kind:'ability',milestone:'breaker-knuckle'},'Heavy debris · Breaker Knuckle needed','Joe finds a lunch tin beneath the fallen stone. The crew kept a place for you.'),
  make('blast-stone','blast-0','boulder','joe',344,56,{kind:'ability',milestone:'breaker-knuckle'},'Cracked wall · Breaker Knuckle needed','An incident note points toward roots wrapped around the relay: come back with Joe’s new technique.'),
  make('blast-return','blast-8','terminal','alex',312,56,{kind:'story',milestone:'woods-complete'},'Relay seal · finish Hollow Woods','The orchard dispatch log confirms that every relay used the same return address: Wayside.'),
  make('woods-lift','woods-layby','vent','matt',392,120,{kind:'hero',hero:'matt'},'Bent grille · Matt needed','Matt slips the grille loose. A maintenance ghost left supplies for whoever came back.'),
  make('woods-signal','woods-layby','terminal','alex',40,280,{kind:'story',milestone:'space-complete'},'Sky seal · bring home the Prism Lens','Through the Lens, an old forestry chart reveals that the Moon signal was an echo, not an order.'),
  make('moon-nav','moon-m01','terminal','alex',264,40,{kind:'hero',hero:'alex'},'Navigation latch · Alex needed','Alex decodes a handwritten star chart. Its home marker is a tiny barbecue.'),
  make('moon-reserve','moon-m01','vent','jon',472,168,{kind:'story',milestone:'space-complete'},'Return seal · bring home the Prism Lens','The reserve stores contain a note: successful landings include the ones nobody saw.'),
  make('city-supply','city-boulevard','vines','jon',136,88,{kind:'hero',hero:'jon'},'Knotted cables · Jon needed','Jon sorts the tangled supply cables and uncovers a relief package addressed to everyone.'),
  make('city-night','city-boulevard','terminal','matt',424,88,{kind:'story',milestone:'city-complete'},'Blackout seal · restore Old City','A final dispatch cancels the Architect’s orders. The city is free to write its own timetable.'),
];
export const gatesEnabled = (s:GameState) => !s.coop || (s.coop.protocolVersion ?? 1)>=7;
export function obstaclesForState(s:GameState):readonly HeroObstacle[] {
  return gatesEnabled(s)?HERO_OBSTACLES.filter(g=>g.worldId===s.mapId):[];
}
export function isObstacleCleared(s:GameState,id:string):boolean {
  // Shared host geometry is borrowed. Personal discoveries remain separate.
  return (s.coop?.worldSolvedInteractions??[]).includes(id)||s.solvedInteractions.includes(id) && s.coop?.role!=='guest';
}
const hits=(r:CollisionRect,x:number,y:number,radius:number)=>{
  const nx=Math.max(r.x,Math.min(x,r.x+r.w)),ny=Math.max(r.y,Math.min(y,r.y+r.h));
  return radius===0?x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h:(x-nx)**2+(y-ny)**2<radius**2;
};
export function obstacleBlocks(s:GameState,x:number,y:number,radius=7):boolean {
  return obstaclesForState(s).some(g=>g.walls.some(w=>hits(w,x,y,radius))||!isObstacleCleared(s,g.id)&&hits(g,x,y,radius));
}
export function requirementMet(s:GameState,g:HeroObstacle):boolean {
  return gateRequirementMet(g.requirement,{level:s.coop?.syncedLevel??s.character.level,heroes:s.unlockedHeroes,
    milestones:[...s.campaignMilestones,...s.coop?.worldCampaignMilestones??[]]});
}
export function gateTargets(s:GameState) {
  return obstaclesForState(s).flatMap(g=>isObstacleCleared(s,g.id)?[{id:g.rewardId,name:(s.solvedInteractions.includes(g.rewardId)||s.coop?.worldSolvedInteractions?.includes(g.rewardId))?(s.mapId.startsWith('moon-')?'Return via rocket':'Shortcut to Wayside'):'Read hidden ledger · collect supplies',kind:'use' as const,x:g.rewardAnchor.x,y:g.rewardAnchor.y}]:[
    {id:g.id,name:requirementMet(s,g)?`Clear ${g.kind==='boulder'?'stone':g.kind==='vines'?'cables':'barrier'}`:g.name,kind:'use' as const,x:g.x+g.w/2,y:g.y+g.h/2}]);
}
export function clearHeroObstacle(s:GameState,id:string):boolean {
  const g=obstaclesForState(s).find(g=>g.id===id);
  if(!g||isObstacleCleared(s,id)||s.overlay||s.heroes[s.active].hp<=0||Math.hypot(s.x-g.x-g.w/2,s.y-g.y-g.h/2)>=34)return false;
  if(s.coop?.role==='guest'){s.notice='The party host clears shared obstacles.';return false;}
  if(!requirementMet(s,g)){s.notice=g.requirement.kind==='hero'?`Too heavy or awkward… ${g.hero[0].toUpperCase()+g.hero.slice(1)} could help. Crew assists work even when benched.`:g.name;return false;}
  s.solvedInteractions.push(id);
  s.effects.push({id:s.nextId++,kind:g.kind==='boulder'?'slash':'charge',hero:g.hero,fieldAssist:s.scene!=='overworld',x:g.x+g.w/2,y:g.y+g.h/2,dx:0,dy:-1,size:28,ttl:.8,maxT:.8});
  s.floaters.push({id:s.nextId++,x:g.x+g.w/2,y:g.y-22,text:'WAY CLEARED',color:'#ffe0a2',ttl:1.3});
  s.notice='The way is clear. Supplies and a return route wait inside.';
  s.events.push({type:'checkpoint',id});return true;
}
export function markSeenGates(s:GameState) {
  for(const g of obstaclesForState(s))if(Math.hypot(s.x-g.x-g.w/2,s.y-g.y)<100&&!s.solvedInteractions.includes(`${g.id}-seen`))s.solvedInteractions.push(`${g.id}-seen`);
}
// Optional minimap/radar hook: only seen, still-locked gates. No radar dependency.
export function lockedGateAnchors(s:GameState) {
  return obstaclesForState(s).filter(g=>s.solvedInteractions.includes(`${g.id}-seen`)&&!isObstacleCleared(s,g.id))
    .map(g=>({id:g.id,x:g.x+g.w/2,y:g.y+g.h/2,icon:'lock' as const}));
}
export function releaseBorrowedObstacles(s:GameState) {
  const radius=s.scene==='overworld'?10:7;
  for(const g of obstaclesForState(s)) {
    if(isObstacleCleared(s,g.id)||s.x<g.walls[0].x-radius||s.x>g.walls[0].x+72+radius||s.y<g.walls[0].y-radius||s.y>g.y+g.h+radius)continue;
    const world=getWorld(s.scene,s.room,s.mapId);
    for(let offset=0;offset<=48;offset+=4)for(const dx of [0,-12,12,-24,24]) {
      const x=g.x+g.w/2+dx,y=g.y+g.h+radius+3+offset;
      if(!isBlocked(world,x,y,radius)&&!obstacleBlocks(s,x,y,radius)){s.x=x;s.y=y;s.vx=s.vy=s.knockX=s.knockY=0;return;}
    }
  }
}
