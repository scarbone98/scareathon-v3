import type { GameState } from '../sim.ts';
import type { InteractTarget } from '../contextAttack.ts';
import { getWorld, isBlocked } from '../world.ts';
import { record, refillCrew, hasMilestone } from './ch3.ts';
import { hasSpaceFlag } from '../lunar.ts';
export const inCity = (s: Pick<GameState,'mapId'>) => s.mapId.startsWith('city-');
// Optional Update 1 content IDs only: no new inventory, currency or quest system.
export const CITY_HOOKS = { rewardIds:['city-switchmaster','city-architect','city-complete'], radarIds:['city-anchor-0','city-anchor-2','city-anchor-5'], arenaEchoId:'city-architect-recording' } as const;
export function cityCheckpoint(s:GameState,id=s.mapId) {s.events.push({type:'checkpoint',id});}
export function cityTargets(s:GameState):InteractTarget[] {
  if(!inCity(s)) return [];
  const targets=getWorld(s.scene,s.room,s.mapId).props.filter(p=>p.kind==='socket'||p.id==='city-rest'||p.id==='city-vendor').map(p=>({id:p.id,name:p.label??'Interact',kind:'use' as const,x:p.x+p.w/2,y:p.y+p.h+12}));
  if(s.mapId==='city-hatching' && !s.enemies.length && !hasSpaceFlag(s,'city-evacuation')) targets.push({id:'city-evacuate',name:'Jon · Hold the evacuation shutter',kind:'use',x:440,y:240});
  if(s.mapId==='city-refuge') targets.push({id:'city-next-chapter',name:'Chapter 5 · Rally at Wayside',kind:'use',x:320,y:260});
  return targets;
}
export function cityInteract(s:GameState,id:string):boolean {
  if(!inCity(s)) return false;
  if(id==='city-vendor') {if(!hasMilestone(s,'city-restored')) s.dialogue={speaker:'Market shelter',index:0,lines:['Civilians and unpossessed monsters are sheltering together. Restore the Exchange and we can reopen our supply stall.']};else s.overlay='shop';return true;}
  if(id==='city-rest') {refillCrew(s);s.checkpointMapId=s.mapId;cityCheckpoint(s,`${s.mapId}-rest`);s.overlay='home';s.notice='Safe workshop: crew refilled. Change your party or return to the route.';return true;}
  if(id.startsWith('city-anchor-')) {
    record(s.solvedInteractions,id);record(s.campaignMilestones,'night-anchor');cityCheckpoint(s,id);
    s.notice='Jon’s Night Anchor holds the route permanently. He assists from the bench; anyone can operate it.';return true;
  }
  if(id==='city-signal-switch'||id.startsWith('city-pedestal-')) {
    const boss=s.enemies.find(e=>e.behavior==='switchmaster'||e.behavior==='architect');
    if(!boss) return true;
    if(id==='city-pedestal-2'&&boss.phase===2) {s.notice='Broken sigil: a decoy. The two intact relay pedestals work.';return true;}
    boss.exposed=6;boss.windup=0;boss.shieldBroken=true;s.notice='Relay interrupted! Six seconds for a full combo and Ki. The signal shield returns after recovery.';return true;
  }
  if(id==='city-evacuate') {
    if(s.enemies.length||!(s.clearedRooms.includes('city-hatching')||s.coop?.worldClearedRooms?.includes('city-hatching'))) return true;
    record(s.solvedInteractions,'city-evacuation');record(s.campaignMilestones,'city-complete');record(s.completedCinematics,'city-last-order');
    s.chapter=Math.max(5,s.chapter);refillCrew(s);s.checkpointMapId='city-refuge';cityCheckpoint(s,'city-complete');
    s.dialogue={speaker:'Jon',index:0,lines:['The Creation takes the Architect’s staff. It snaps cleanly. His own portal light erases him without a trace.','Architect’s recorded voice: “You belong to me.” The Creation answers in that same voice: “No.”','Joe, Matt, Alex and You guide the survivors out. Jon holds the shutter and counts every head, then follows last.','A rift tears open toward Haywire Junction. Everybody is safe at the refuge. Bring them to Wayside for Chapter 5.']};return true;
  }
  if(id==='city-next-chapter') {s.dialogue={speaker:'Alex',index:0,lines:['Haywire Junction is on the other side of the final rift. First, bring everybody to Wayside. The next chapter starts at the shelter rally.']};return true;}
  return false;
}
export function enterCityRoom(s:GameState) {
  if(!inCity(s)) {
    if(s.scene==='hub'&&hasMilestone(s,'city-complete')) {s.notice='Chapter 5 · Last Stop: Everywhere. Survivors are safe. Rally at Wayside for Haywire Junction.';s.checkpointMapId='hub';s.events.push({type:'checkpoint',id:'city-rally'});}
    return;
  }
  s.chapter=Math.max(s.chapter,4);s.spaceOutfit=false;s.palette=[7,8].includes(s.room)?'eightbit':'real';
  if([0,1,12,14].includes(s.room)) {refillCrew(s);s.checkpointMapId=s.mapId;cityCheckpoint(s,`${s.mapId}-arrival`);}
  if(s.room===12&&!hasMilestone(s,'city-order-heard')) {record(s.campaignMilestones,'city-order-heard');s.dialogue={speaker:'The Architect · balcony recording',index:0,lines:['I built the Creation to make both worlds obey. Every relay, every voice, every order belongs to me.','Jon: Five of us. Everybody together. Refill at the workshop before we go in.']};cityCheckpoint(s,'city-order-heard');}
  s.notice=s.room===0?'The Prism Lens reveals Old City. Jon: Interact at violet anchors; they stay solved for the whole crew.' : `${getWorld(s.scene,s.room,s.mapId).name} · Read the marked attacks. Return paths and crew anchors remain open.`;
  if(s.room===8&&!hasMilestone(s,'city-voices')) {record(s.campaignMilestones,'city-voices');s.dialogue={speaker:'Ghost recording',index:0,lines:['The Creation learned every order. Every terrified voice. It is beginning to answer back.','Alex: Taking the Moon stabilizer offline woke it up. Jon: Then we get everyone out together.']};}
}
export function cityClear(s:GameState):boolean {
  if(!inCity(s)) return false;
  if(s.room===6) {record(s.bosses,'city-switchmaster');record(s.campaignMilestones,'city-restored');record(s.solvedInteractions,'city-market-shortcut');refillCrew(s);s.notice='District restored. Warm windows return; the market is a safe supply stop. The Backstage route exposes Eggworks.';}
  else if(s.room===13) {record(s.bosses,'city-architect');s.notice='The Architect’s shield falls. The egg wakes. Hold the marked evacuation shutter to bring everybody out.';}
  else s.notice='City encounter clear. Follow the eastern route; retreat remains available.';
  cityCheckpoint(s);return true;
}

export function applyCityRequest(s:GameState,seat:number,id:string,kind:'ki'|'interact',ray?:{x:number;y:number;dx:number;dy:number}):boolean {
  if(s.coop?.role!=='host'||!inCity(s)) return false;
  const actor=s.coop.remoteHeroes.find(p=>p.seat===seat&&p.mapId===s.mapId&&p.hero.hp>0&&!p.downed);
  const target=cityTargets(s).find(t=>t.id===id);
  if(!actor||!target||!id.startsWith('city-anchor-')&&id!=='city-signal-switch'&&!id.startsWith('city-pedestal-')) return false;
  if(kind==='ki'&&(!ray||![ray.x,ray.y,ray.dx,ray.dy].every(Number.isFinite)||Math.abs(Math.hypot(ray.dx,ray.dy)-1)>.02||Math.hypot(actor.x-ray.x,actor.y-ray.y)>400)) return false;
  const origin=kind==='ki'?ray!:actor;
  const dx=target.x-origin.x,dy=(kind==='ki'?target.y-24:target.y)-origin.y,len=Math.hypot(dx,dy);
  if(len>(kind==='ki'?560:40)||kind==='ki'&&(dx*ray!.dx+dy*ray!.dy<0||Math.abs(dx*ray!.dy-dy*ray!.dx)>30)) return false;
  const world=getWorld(s.scene,s.room,s.mapId);
  if(kind==='ki') for(let n=0;n<len-24;n+=4) {
    // Ignore the target's own housing; no ray can cross another solid footprint.
    if(isBlocked(world,origin.x+dx*n/Math.max(1,len),origin.y+dy*n/Math.max(1,len),2)) return false;
  }
  return cityInteract(s,id);
}
