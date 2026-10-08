import type { GameState } from '../sim.ts';
import type { InteractTarget } from '../contextAttack.ts';
import { hasFieldFlag, knowsField, solveField } from '../fieldAbilities.ts';
import { record, refillCrew } from './ch3.ts';
export const WOODS_REWARD_IDS=['woods-foreman','woods-launch-key','woods-lunch-receipt'] as const;
export const inWoods=(s:Pick<GameState,'mapId'>)=>s.mapId.startsWith('woods-');
const point=(id:string,name:string,x:number,y:number):InteractTarget=>({id,name,x,y,kind:'use'});
export function woodsTargets(s:GameState):InteractTarget[] {
  if(!inWoods(s)) return [];
  const targets:InteractTarget[]=[];
  if(s.mapId==='woods-layby') targets.push(point('woods-ghost','Rescue maintenance ghost / learn crew tools',220,224),point('woods-rest','Crew refill / save',188,300));
  if(s.mapId==='woods-ranger-gate'&&!hasFieldFlag(s,'woods-ranger-seal')) targets.push(point('woods-ranger-seal','Joe · Break cracked root housing',324,224));
  if(s.mapId==='woods-pump-house') targets.push(point('woods-pump-bridge','Matt · Hold Ki 1 second at bypass',308,308),point('woods-rest','Crew refill / save',188,318));
  if(s.mapId==='woods-mirror-sawmill') targets.push(point('woods-mirror','Trace mirror relay',336,158));
  if(s.mapId==='woods-conveyor-yard') targets.push(point('woods-rest','Refill before Heartwood Engine',188,300));
  if(s.mapId==='woods-lunch-shed') targets.push(point('woods-lunch','Read incident receipt',270,324));
  if(s.mapId==='woods-heartwood-engine'&&s.enemies.some(e=>e.woodsBehavior==='foreman'&&e.phase===2)) for(const [n,x] of [[0,224],[1,512]]) {
    if(!hasFieldFlag(s,`woods-anchor-${n}-broken`)) targets.push(point(`woods-anchor-${n}-broken`,'Joe · Break root anchor housing',x,356));
    else if(!hasFieldFlag(s,`woods-anchor-${n}-powered`)) targets.push(point(`woods-anchor-${n}-powered`,'Matt · Hold Ki 1 second at anchor',x,356));
  }
  return targets;
}
export function woodsInteract(s:GameState,id:string) {
  if(!inWoods(s)||!id.startsWith('woods-')) return false;
  if(id==='woods-ghost') {
    record(s.campaignMilestones,'breaker-knuckle');record(s.campaignMilestones,'circuit-spark');
    s.dialogue={speaker:'Maintenance ghost',index:0,lines:['“Under cause of damage, can I put all of it?” Its incident forms keep duplicating.','Joe learns Breaker Knuckle: use Attack at visibly cracked housings. Matt learns Circuit Spark: hold Ki for one second beside a grounded socket.','Crew assists work with any active hero, even if Joe or Matt is benched or down. The monsters are receiving orders; some are frightened too.']};
    s.events.push({type:'checkpoint',id:'woods-tools'});return true;
  }
  if(id==='woods-rest') {refillCrew(s);s.checkpointMapId=s.mapId==='woods-conveyor-yard'?'woods-pump-house':s.mapId;s.notice='Crew refilled. Woods checkpoint saved.';s.events.push({type:'checkpoint',id:'woods-rest'});return true;}
  if(id==='woods-ranger-seal'||id.endsWith('-broken')) {solveField(s,id,'breaker-knuckle');return true;}
  if(id==='woods-pump-bridge'||id.endsWith('-powered')) {s.notice='Hold Ki at the marked socket for one second. Matt assists any active hero.';return true;}
  if(id==='woods-mirror') {
    if(s.enemies.length) {s.notice='Clear the mirror creatures before tracing the relay.';return true;}
    if(!hasFieldFlag(s,'woods-mirror-copy')) {
      record(s.solvedInteractions,'woods-mirror-copy');s.palette='eightbit';
      s.dialogue={speaker:'8-Bit Mill',index:0,lines:['A short rift deposits all five of you in a copy of the mill. Joe cracks the relay casing; Matt traces its grounded bypass.','The ghost’s diagrams match the machine. The command signal is reflected from the Moon. Use the relay again to return to the real control room.']};
    } else {
      s.palette='real';record(s.solvedInteractions,'woods-mirror-return');refillCrew(s);
      s.dialogue={speaker:'Alex',index:0,lines:['Back in the real control room. The Foreman is guarding the launch authorization.','Jon counts Joe, Matt, Alex, himself and You. “Everybody back? Good. Keep moving.”']};
    }
    s.events.push({type:'checkpoint',id:hasFieldFlag(s,'woods-mirror-return')?'woods-mirror-return':'woods-mirror-copy'});return true;
  }
  if(id==='woods-lunch') {record(s.solvedInteractions,'woods-lunch-receipt');s.dialogue={speaker:'Incident receipt',index:0,lines:['Cause of damage: all of it. Lunch missing: also all of it.','A pencil diagram marks the shortcut to the ranger checkpoint. The pencil is still warm.']};s.events.push({type:'checkpoint',id:'woods-lunch'});return true;}
  return false;
}
export function tickWoodsField(s:GameState,ki:boolean) {
  if(!inWoods(s)||s.coop?.role==='guest'||!ki||s.charge<1) return;
  const target=woodsTargets(s).find(t=>(t.id==='woods-pump-bridge'||t.id.endsWith('-powered'))&&Math.hypot(s.x-t.x,s.y-t.y)<34&&!hasFieldFlag(s,t.id));
  if(target&&solveField(s,target.id,'circuit-spark')) s.charge=0;
}
export function enterWoods(s:GameState) {
  if(!inWoods(s)) return;
  s.chapter=Math.max(2,s.chapter);s.spaceOutfit=false;
  if(s.mapId==='woods-layby') {refillCrew(s);s.checkpointMapId=s.mapId;s.events.push({type:'checkpoint',id:'woods-arrival'});}
  if(s.mapId==='woods-heartwood-engine') {
    refillCrew(s);s.solvedInteractions=s.solvedInteractions.filter(id=>!id.startsWith('woods-anchor-'));
    if(s.coop?.role==='host') s.coop.worldSolvedInteractions=s.coop.worldSolvedInteractions?.filter(id=>!id.startsWith('woods-anchor-'));
  }
  if(s.mapId==='woods-mirror-sawmill'&&hasFieldFlag(s,'woods-mirror-copy')&&!hasFieldFlag(s,'woods-mirror-return')) s.palette='eightbit';
  s.notice=knowsField(s,'breaker-knuckle')?'Hollow Woods · cracked housings: Attack. Grounded sockets: hold Ki 1 second.':'Find the maintenance ghost at the Ranger Lay-by to learn both crew tools.';
}
export function clearWoods(s:GameState) {
  if(s.mapId==='woods-conveyor-yard') record(s.bosses,'woods-briar-bailiff');
  if(s.mapId==='woods-heartwood-engine') {
    record(s.bosses,'woods-foreman');record(s.areas,'woods');record(s.campaignMilestones,'woods-complete');record(s.campaignMilestones,'woods-launch-key');record(s.solvedInteractions,'woods-complete');
    s.chapter=Math.max(3,s.chapter);s.checkpointMapId='hub';refillCrew(s);
    s.dialogue={speaker:'Launch authorization',index:0,lines:['The Foreman’s motor winds down. The frightened roots loosen. You recover a launch key and Moon coordinates.','Alex: “We need altitude.” Joe points at the taxi. Matt: “More altitude than that.”','Jon hands You the coordinates. Return to Wayside, then follow the east road to the fenced launch compound.']};
  }
  s.notice=s.mapId==='woods-heartwood-engine'?'Launch key recovered! Return to Wayside; the Chapter 3 compound is open.':'Woods encounter clear. Follow the marked machinery route.';
  s.events.push({type:'checkpoint',id:s.mapId});
}
