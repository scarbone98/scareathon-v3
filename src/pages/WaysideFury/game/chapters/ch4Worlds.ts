import { map, paint, prop, exit, type WorldMap } from '../worldBuilder.ts';
export type CityBehavior = 'cable-rat' | 'neon-imp' | 'turnstile' | 'clockwolf' | 'switchmaster' | 'architect';
export const CITY_RAT_OUTLETS=[{x:340,y:168},{x:436,y:248}] as const;
export const CITY_MAP_IDS = ['city-boulevard','city-market','city-clockroof','city-ticket-hall','city-cable-run','city-transformer','city-switchmaster','city-backstage','city-doorway','city-delivery','city-shell-press','city-gallery','city-balcony','city-hatching','city-refuge'] as const;
const names = ['Blackout Boulevard','Neon Market','Clockroof Walk','Blackout Exchange · Ticket Hall','Rat Cable Run','Transformer Floor','Switchmaster Booth','Backstage 8-Bit · Platform','The Old Escape Door','Eggworks · Delivery Floor','Shell Press','Incubator Gallery','Control Balcony · Workshop','Hatching Chamber','Last Order · Survivor Refuge'];
export const CITY_WORLDS: WorldMap[] = CITY_MAP_IDS.map((id, room) => {
  const m = map(id, names[room], 40, 26, room===7||room===8?'corrupt':'stone');
  m.spawn={x:64,y:208};
  paint(m,0,0,640,16,'void',true);paint(m,0,400,640,16,'void',true);
  paint(m,0,0,16,416,'void',true);paint(m,624,0,16,416,'void',true);
  paint(m,32,176,576,64,'road');
  for(const x of [112,240,400,528]) {
    prop(m,'lamp',x,70,12,44);prop(m,'puddle',x+14,280,44,12);
    const building=prop(m,room<3?'shop':'shed',x-16,18,76,48);building.color='#886B65';
  }
  if(room===0||room===1||room===12||room===14) {
    const keeper=prop(m,'npc',128,252,20,30,'Crew rest / supplies');keeper.id='city-rest';
  }
  if([0,2,5].includes(room)) {const p=prop(m,'socket',184,250,24,28,'Jon · Night Anchor');p.id=`city-anchor-${room}`;}
  if(room===1) {const vendor=prop(m,'npc',280,252,20,30,'Restored market · supplies');vendor.id='city-vendor';}
  if(room===6) {const p=prop(m,'socket',304,230,24,28,'Ki switch · expose operator');p.id='city-signal-switch';}
  if(room===13) {
    for(const [n,x,y] of [[0,220,130],[1,440,130],[2,320,310]]) {const p=prop(m,'socket',x-12,y-36,24,24,n===2?'Broken sigil · decoy':'Interrupt portal relay');p.id=`city-pedestal-${n}`;}
    prop(m,'portal',464,40,72,106,'The Creation');
  }
  const squads: Partial<Record<number,CityBehavior[]>>={2:['clockwolf','neon-imp'],3:['turnstile','neon-imp'],4:['cable-rat','cable-rat'],5:['turnstile','neon-imp'],7:['neon-imp','turnstile'],9:['cable-rat','turnstile'],10:['clockwolf','neon-imp'],11:['turnstile','clockwolf']};
  m.spawns=(squads[room]??[]).map((behavior,n)=>({kind:behavior==='neon-imp'?'shooter':'grunt',behavior,sprite:behavior==='neon-imp'?'imp':'zombie',x:340+n*96,y:168+n*80}));
  if(room===6||room===13) m.spawns=[{kind:'boss',behavior:room===6?'switchmaster':'architect',sprite:'shadowbeast',x:360,y:208}];
  m.radarAnchors=m.props.filter(p=>p.kind==='socket'||p.kind==='npc').map(p=>({id:p.id,x:p.x+p.w/2,y:p.y+p.h+12}));
  if(room>0) exit(m,{id:`${id}-return`,name:names[room-1],x:0,y:176,w:32,h:64,target:room-1,targetMapId:CITY_MAP_IDS[room-1],entryX:580,entryY:208});
  else exit(m,{id:'city-taxi',name:'Return to county taxi',x:0,y:176,w:32,h:64,target:'overworld',targetMapId:'overworld',entryX:1032,entryY:580});
  if(room<14) exit(m,{id:`${id}-next`,name:names[room+1],x:608,y:176,w:32,h:64,target:room+1,targetMapId:CITY_MAP_IDS[room+1],entryX:56,entryY:208,requiresClear:true,...([0,2,5].includes(room)?{requiresInteraction:`city-anchor-${room}`} : room===13?{requiresInteraction:'city-evacuation'}:{})});
  if(room===14) exit(m,{id:'city-home',name:'Bring survivors home · Chapter 5 rally',x:608,y:176,w:32,h:64,target:'hub',targetMapId:'hub',entryX:480,entryY:416,requiresInteraction:'city-evacuation'});
  if(room===1) exit(m,{id:'city-market-exchange-shortcut',name:'Restored Exchange shortcut',x:288,y:0,w:64,h:16,target:6,targetMapId:'city-switchmaster',entryX:320,entryY:370,requiresInteraction:'city-market-shortcut'});
  if(room===6) exit(m,{id:'city-exchange-market-shortcut',name:'Restored market / taxi',x:288,y:400,w:64,h:16,target:1,targetMapId:'city-market',entryX:320,entryY:48,requiresInteraction:'city-market-shortcut'});
  return m;
});
