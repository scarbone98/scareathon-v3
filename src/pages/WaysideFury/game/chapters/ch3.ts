import type { GameState } from '../sim.ts';
import type { InteractTarget } from '../contextAttack.ts';
import { getWorld } from '../world.ts';
import { hasSpaceFlag, onMoon } from '../lunar.ts';
import { startSpaceFilm } from '../cinematics.ts';
import type { SpaceFilmId } from './ch3Films.ts';
export const SPACE_REWARD_IDS = ['moon-cheese-inspector','moon-apogee-warden','moon-relay-disabled','prism-lens'] as const;
export const hasMilestone = (s:GameState,id:string) => s.campaignMilestones.includes(id)||s.coop?.worldCampaignMilestones?.includes(id)===true;
export const record = (list:string[],id:string) => { if(!list.includes(id)) list.push(id); };
export function refillCrew(s:GameState) {for(const h of Object.values(s.heroes)) { h.hp=h.maxHp;h.ki=h.maxKi;h.stamina=h.maxStamina; } s.oxygen=100;}
export function spaceCheckpoint(s:GameState,mapId=s.mapId) {
  if(['space-launch','moon-m01','moon-m03','moon-m06','moon-m09'].includes(mapId)) s.checkpointMapId=mapId; s.events.push({type:'checkpoint',id:`${mapId}-rest`});
}
export function spaceTargets(s:GameState):InteractTarget[] {
  const point=(id:string,name:string,x:number,y:number):InteractTarget=>({id,name,x,y,kind:'use'});
  if(s.mapId==='space-launch') return [
    point('space-control','Mission control · checklist / refill',88,276),point('space-fuel','Matt · Power safe fuel panel',380,308),
    point('space-lockers','Suit up · five crew helmets',162,184),point('space-board','Board rocket',256,192),
    point('space-replay','Replay outbound film',120,294)];
  if(!onMoon(s)) return [];
  const targets:InteractTarget[]=[];
  if(s.room===0) targets.push(point('space-home',hasMilestone(s,'prism-lens')?'Return with Prism Lens':'Return for supplies',148,200),point('space-air-option',s.solvedInteractions.includes('moon-unlimited-air')?'Use normal air tank':'Unlimited air · same rewards',88,280));
  if(s.room===2) targets.push(point('moon-radio','Matt · Restore survey relay',232,170));
  if(s.room===4) targets.push(point('moon-basalt','Joe · Break basalt plug',304,170),point('moon-bridge','Matt · Power service bridge',288,238));
  if(s.room===8) targets.push(point('moon-lens','Remove Prism Lens',260,150));
  if(s.room===6) targets.push(point('moon-recording','Play flag recording',252,154));
  if([5,7].includes(s.room)) for(const p of getWorld(s.scene,s.room,s.mapId).props.filter(p=>p.kind==='socket')) {
    if(!hasSpaceFlag(s,p.id)) targets.push(point(p.id,s.room===7?'Matt · Ground Warden pylon':'Matt · Ground practice pylon',p.x+p.w/2,p.y+p.h+12));
  }
  if([0,2,5].includes(s.room)) targets.push(point('moon-rest','Crew refill / save',100,getWorld(s.scene,s.room,s.mapId).height/2+84));
  return targets;
}
export type SpaceAction = 'moon'|'earth'|null;
export function spaceInteract(s:GameState,id:string):boolean {
  if(id==='space-control') {
    refillCrew(s); spaceCheckpoint(s);
    s.dialogue={speaker:'Mission control',index:0,lines:[`Relay battery ✓ · Navigation ✓ · Suits ${s.spaceOutfit?'✓':'— visit lockers'} · Fuel ${hasSpaceFlag(s,'space-fuel')?'✓':'— power the safe panel'}`,'The Moon relay is hiding the Eggworks. Bring home its Prism Lens. Five seats, no fuel currency.']}; return true;
  }
  if(id==='space-fuel') {
    if(!hasSpaceFlag(s,id)) { record(s.solvedInteractions,id);s.fuelGag=0; spaceCheckpoint(s); }
    s.notice='Matt powers the panel. The hose twitches; a gauge spins backward. Jon taps it: “There. Science.”'; return true;
  }
  if(id==='space-lockers') { startSpaceFilm(s,'space-suitup'); return true; }
  if(id==='space-board'||id==='space-replay') {
    if(!s.spaceOutfit||!hasSpaceFlag(s,'space-fuel')) {s.notice='Checklist: power the fuel panel and seal all five suits before boarding.';return true;}
    record(s.campaignMilestones,'moon-departed');spaceCheckpoint(s,'moon-m01');
    startSpaceFilm(s,id==='space-replay'||!hasMilestone(s,'moon-arrived')?'space-outbound':'space-revisit');return true;
  }
  if(id==='space-home') {
    record(s.campaignMilestones,'moon-returning');spaceCheckpoint(s,'space-launch');
    startSpaceFilm(s,'space-return');return true;
  }
  if(id==='space-air-option') {
    if(s.solvedInteractions.includes('moon-unlimited-air')) s.solvedInteractions=s.solvedInteractions.filter(i=>i!=='moon-unlimited-air');
    else record(s.solvedInteractions,'moon-unlimited-air');
    s.notice=s.solvedInteractions.includes('moon-unlimited-air')?'Unlimited air enabled. Rewards unchanged.':'Normal tank enabled. Reserve air has no penalty.';s.events.push({type:'checkpoint',id:'personal-air-option'});return true;
  }
  if(id==='moon-rest') {refillCrew(s);spaceCheckpoint(s);s.notice='All five crew members refilled. Lunar checkpoint saved.';return true;}
  if(id==='moon-radio') {record(s.solvedInteractions,id);record(s.solvedInteractions,'moon-shack-lift');spaceCheckpoint(s);refillCrew(s);s.notice='Matt restores the survey relay. Crater Hop and the landing shortcut are open.';return true;}
  if(id==='moon-basalt') {record(s.solvedInteractions,id);s.notice='Joe’s Breaker Knuckle opens the basalt housing. Matt can power the bridge.';spaceCheckpoint(s);return true;}
  if(id==='moon-bridge') {
    if(!hasSpaceFlag(s,'moon-basalt')) {s.notice='Break the cracked basalt housing first. Joe assists even when benched.';return true;}
    record(s.solvedInteractions,id);spaceCheckpoint(s);s.notice='Matt’s Circuit Spark powers the bridge. The service ramp stays open.';return true;
  }
  if(id.includes('-pylon-')) {
    if(s.room===7&&!s.enemies.some(e=>e.behavior==='warden'&&e.phase===2)) {s.notice='Pylons ground when the Warden raises its phase-two shield.';return true;}
    record(s.solvedInteractions,id);s.notice='Pylon grounded. One circuit stays off for this attempt.';return true;
  }
  if(id==='moon-recording') {record(s.solvedInteractions,id);s.dialogue={speaker:'Survey recording',index:0,lines:['The Creation repeats every voice it hears. It is learning to give the orders.','Jon: “Wrong flag. Right snack.” The recording points toward Old City.']};return true;}
  if(id==='moon-lens') {
    if(!s.bosses.includes('moon-apogee-warden')&&!s.coop?.worldBosses?.includes('moon-apogee-warden')) {s.notice='Disable the Apogee Warden before removing its relay lens.';return true;}
    record(s.campaignMilestones,'prism-lens');record(s.campaignMilestones,'moon-relay-disabled');record(s.bosses,'moon-apogee-warden');
    record(s.clearedRooms,'moon-relay-disabled');refillCrew(s);spaceCheckpoint(s,'moon-m09');
    s.dialogue={speaker:'Quiet Side',index:0,lines:['The Prism Lens lifts free. The magenta pulse stops. A projection reveals Old City’s hidden Eggworks.','Joe, quietly over the radio: “Found you.” Return to the lander.']};return true;
  }
  return false;
}
export function completeSpaceFilm(s:GameState,id:SpaceFilmId):SpaceAction {
  record(s.completedCinematics,id);
  if(id==='space-suitup') {s.spaceOutfit=true;record(s.solvedInteractions,'space-suits');s.notice='Five helmets sealed. Walk to the rocket and deliberately board.';spaceCheckpoint(s);return null;}
  if(id==='space-outbound'||id==='space-revisit') {record(s.campaignMilestones,'moon-arrived');record(s.campaignMilestones,'comet-bound');refillCrew(s);return 'moon';}
  record(s.campaignMilestones,'moon-home');
  if(hasMilestone(s,'prism-lens')) {record(s.campaignMilestones,'space-complete');s.chapter=Math.max(4,s.chapter);}
  s.spaceOutfit=false;refillCrew(s);return 'earth';
}
export function enterSpaceRoom(s:GameState) {
  s.film=null;s.boundTimer=0;s.boundTravel=null;s.oxygen=100;s.oxygenWarned=false;
  s.spaceOutfit=onMoon(s);
  if(onMoon(s)) {
    s.chapter=Math.max(3,s.chapter);record(s.campaignMilestones,'moon-departed');record(s.campaignMilestones,'comet-bound');record(s.campaignMilestones,`${s.mapId}-visited`);
    if(s.room===0) s.notice='Alex: Dash makes a short Comet Bound. Guard brakes. Extra lift gives no extra invulnerability. Free return at the lander.';
    else s.notice=`${getWorld(s.scene,s.room,s.mapId).name} · Air posts are free. Clear relay encounters and follow the service lane.`;
    if([0,2,5,8].includes(s.room)) {refillCrew(s);spaceCheckpoint(s);}
    if(s.room===5) record(s.solvedInteractions,'moon-ring-lift');
    // Pylons persist for this boss attempt only, never across a retry.
    if(s.room===7) {
      s.solvedInteractions=s.solvedInteractions.filter(id=>!id.startsWith('moon-m08-pylon-'));
      if(s.coop?.role==='host') s.coop.worldSolvedInteractions=s.coop.worldSolvedInteractions?.filter(id=>!id.startsWith('moon-m08-pylon-'));
    }
  }
  if(s.mapId==='space-launch') s.notice=hasMilestone(s,'moon-home')?'Successful landings: 1-ish. Free return visits remain available.':'Wayside Aerospace: mission control, fuel panel, suit lockers, then board.';
}
