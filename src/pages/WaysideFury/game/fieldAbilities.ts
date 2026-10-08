import type { GameState } from './sim.ts';
import { getWorld } from './world.ts';
export const hasFieldFlag=(s:GameState,id:string)=>s.solvedInteractions.includes(id)||s.coop?.worldSolvedInteractions?.includes(id)===true;
export const knowsField=(s:GameState,id:string)=>s.campaignMilestones.includes(id)||s.coop?.worldCampaignMilestones?.includes(id)===true;
const cache = new WeakMap<object,{key:string;world:ReturnType<typeof getWorld>}>();
export function fieldWorld(s:GameState) {
  const world=getWorld(s.scene,s.room,s.mapId,!!s.coop && (s.coop.protocolVersion ?? 1) < 6);
  if(!world.id.startsWith('woods-')) return world;
  const key=world.props.filter(p=>p.kind==='seal'&&hasFieldFlag(s,p.id)).map(p=>p.id).join(',');
  const previous=cache.get(world);if(previous?.key===key) return previous.world;
  const result={...world,props:world.props.filter(p=>p.kind!=='seal'||!hasFieldFlag(s,p.id))};
  cache.set(world,{key,world:result});return result;
}
export function solveField(s:GameState,id:string,ability:'breaker-knuckle'|'circuit-spark') {
  if(!knowsField(s,ability)) {s.notice='Rescue the maintenance ghost at the Ranger Lay-by first.';return false;}
  if(!hasFieldFlag(s,id)) s.solvedInteractions.push(id);
  s.notice=ability==='breaker-knuckle'?'Joe assists: cracked housing broken. Your active hero stays equipped.':'Matt assists: bypass powered. The return path stays open.';
  s.effects.push({id:s.nextId++,kind:ability==='breaker-knuckle'?'slash':'charge',hero:ability==='breaker-knuckle'?'joe':'matt',fieldAssist:true,x:s.x+18,y:s.y,dx:s.faceX,dy:s.faceY,size:24,ttl:.65,maxT:.65});
  s.events.push({type:'checkpoint',id});return true;
}
