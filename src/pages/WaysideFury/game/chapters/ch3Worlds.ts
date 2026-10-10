import { map, paint, prop, exit, type WorldMap, type WorldSpawn } from '../worldBuilder.ts';
export type LunarBehavior = 'rat' | 'walker' | 'scout' | 'echo' | 'satellite' | 'inspector' | 'warden';
export const MOON_NAMES = ['Crooked Landing', 'First Footprints', 'Survey Shack', 'Crater Hop', 'Glass Lava Tube', 'Dish Service Ring', 'The Wrong Flag', 'Apogee Bowl', 'Quiet Side'];
const sizes = [[640,384],[640,384],[480,320],[800,448],[720,384],[640,480],[480,320],[800,576],[480,320]];
export const moonId = (room: number) => `moon-m${String(room + 1).padStart(2, '0')}`;
function fence(m: WorldMap, x: number, y: number, w: number, h: number) {
  const p = prop(m, 'fence', x, y, w, h); p.footprints = [{ x, y: y + (h > 20 ? 0 : h - 4), w, h: h > 20 ? h : 4 }];
  // The runs meet at the corners; settling must not move or drop one and open the compound.
  p.anchored = true;
}
export function compound(m: WorldMap, ox = 0, oy = 0) {
  paint(m, ox, oy, 512, 336, 'stone');
  fence(m, ox, oy, 512, 12); fence(m, ox, oy, 8, 336); fence(m, ox+504, oy, 8, 336);
  fence(m, ox, oy+324, 208, 12); fence(m, ox+304, oy+324, 208, 12);
  for (const [x,y] of [[16,16],[480,16],[16,302],[480,302]]) prop(m, 'lamp', ox+x, oy+y, 12, 30);
  prop(m, 'control', ox+32, oy+176, 112, 80, 'Mission control');
  prop(m, 'gantry', ox+204, oy+28, 104, 156, 'Access gantry').footprints = [
    { x: ox+210, y: oy+168, w: 12, h: 16 }, { x: ox+290, y: oy+168, w: 12, h: 16 }];
  prop(m, 'rocket', ox+238, oy+24, 36, 148, 'Board rocket').footprints = [{ x: ox+242, y: oy+144, w: 28, h: 28 }];
  for (const x of [360,408,456]) prop(m, 'tank', ox+x, oy+182, 36, 68, 'Fuel farm');
  prop(m, 'locker', ox+144, oy+104, 36, 60, 'Suit lockers');
  prop(m, 'socket', ox+368, oy+272, 24, 24, 'Fuel panel');
  prop(m, 'sign', ox+184, oy+310, 16, 24, 'Wayside Aerospace');
}
export const LAUNCH_WORLD = (() => {
  const m = map('space-launch', 'County Launch Compound', 32, 24, 'stone'); compound(m);
  m.spawn = { x: 256, y: 352 };
  exit(m, { id: 'launch-taxi', name: 'Return to taxi', x: 224, y: 368, w: 64, h: 16, target: 'overworld', targetMapId: 'overworld', entryX: 1584, entryY: 452 });
  m.radarAnchors = [{ id: 'launch-checklist', x: 88, y: 276 }, { id: 'launch-boarding', x: 256, y: 192 }];
  return m;
})();
export const MOON_WORLDS = sizes.map(([w,h], room) => {
  const m = map(moonId(room), `Moon: Dead Air · ${MOON_NAMES[room]}`, w/16, h/16, room === 2 ? 'stone' : 'ash');
  paint(m,0,0,w,16,'stone',true); paint(m,0,h-16,w,16,'stone',true);
  paint(m,0,0,16,h,'stone',true); paint(m,w-16,0,16,h,'stone',true);
  m.spawn = { x: 64, y: h/2 };
  // A broad continuous service lane remains walkable around every optional bound.
  paint(m,32,h/2-40,w-64,80,'stone');
  for (let n=0; n<8; n++) {
    const x = 104 + (n*83)%(w-176), y = n%2 ? 64 : h-78;
    prop(m,'rock',x,y,20,14);
  }
  prop(m,'air',88,h/2+44,24,32,'Free air');
  if ([1,3,4].includes(room)) prop(m,'air',w/2,h/2+44,24,32,'Free air');
  if (room===0) prop(m,'lander',104,100,88,84,'Return to Earth');
  if (room===2) { prop(m,'control',160,40,96,64,'Survey radio'); prop(m,'socket',220,126,24,24,'Matt · Circuit Spark'); }
  if (room===1 || room===3) {
    for (const x of room===1 ? [220,420] : [220,420,620]) {
      prop(m,'crater',x-24,h/2-110,80,54);
      m.boundLinks ??= []; m.boundLinks.push({ id:`${m.id}-bound-${x}`, from:{x:x-36,y:h/2-64}, to:{x:x+80,y:h/2-64}, radius:28 });
    }
  }
  if (room===4) {
    paint(m,320,16,32,112,'stone',true); paint(m,320,240,32,h-256,'stone',true);
    const seal = prop(m,'seal',320,128,32,32,'Joe · Breaker Knuckle'); seal.id='moon-basalt';
    const bridge = prop(m,'seal',320,200,32,40,'Matt · Circuit Spark'); bridge.id='moon-bridge';
    prop(m,'socket',276,202,24,24,'Power bridge');
  }
  if (room===5 || room===7) for (const [n,x,y] of [[0,w/2,104],[1,160,h-104],[2,w-160,h-104]]) {
    const p = prop(m,'socket',x-12,y-24,24,24,'Ground pylon'); p.id=`${m.id}-pylon-${n}`;
  }
  if (room===6) prop(m,'flag',240,72,24,64,'The Wrong Flag');
  if (room===8) prop(m,'dish',220,32,80,100,'Prism Lens');
  m.radarAnchors = m.props.filter(p=>['air','socket','lander','dish','flag'].includes(p.kind)).map(p=>({ id:p.id,x:p.x+p.w/2,y:p.y+p.h+12 }));
  return m;
});
function link(a:number,b:number, side:'east'|'north'='east', gate?:string) {
  const m=MOON_WORLDS[a], other=MOON_WORLDS[b];
  const horizontal=side==='east';
  exit(m,{id:`${m.id}-to-${other.id}`,name:MOON_NAMES[b],x:horizontal?m.width-16:m.width/2-32,y:horizontal?m.height/2-32:0,w:horizontal?16:64,h:horizontal?64:16,target:b,targetMapId:other.id,entryX:horizontal?48:other.width/2,entryY:horizontal?other.height/2:other.height-48,requiresClear:m.spawns.length>0,requiresInteraction:gate});
  exit(other,{id:`${other.id}-to-${m.id}`,name:MOON_NAMES[a],x:horizontal?0:other.width/2-32,y:horizontal?other.height/2-32:other.height-16,w:horizontal?16:64,h:horizontal?64:16,target:a,targetMapId:m.id,entryX:horizontal?m.width-48:m.width/2,entryY:horizontal?m.height/2:48});
}
function spawn(room:number, behavior:LunarBehavior, x:number,y:number) {
  const kind = ['warden','inspector'].includes(behavior)?'boss':['scout','satellite'].includes(behavior)?'shooter':'grunt';
  const sprite = behavior==='walker'?'zombie':behavior==='echo'?'ghost':behavior==='inspector'?'pumpkin':'imp';
  MOON_WORLDS[room].spawns.push({ kind, sprite, x,y,behavior, miniBoss:behavior==='inspector' } as WorldSpawn);
}
spawn(1,'rat',300,240); spawn(1,'rat',460,160); spawn(1,'walker',540,240);
spawn(3,'scout',390,160); spawn(3,'rat',490,300); spawn(3,'scout',640,300);
spawn(4,'echo',450,128); spawn(4,'satellite',540,160); spawn(4,'echo',590,260);
spawn(5,'inspector',360,240); spawn(6,'rat',290,180); spawn(6,'rat',340,220); spawn(7,'warden',440,288);
link(0,1); link(1,2); link(2,3,'north','moon-radio'); link(3,4); link(4,5,'north','moon-bridge'); link(5,7); link(5,6,'north'); link(7,8,'north');
// Interior lifts are intentional interactions, never automatic boundary transitions.
for (const [a,b,id] of [[2,0,'moon-shack-lift'],[5,2,'moon-ring-lift'],[8,0,'moon-return-lift']] as const) {
  const m=MOON_WORLDS[a], other=MOON_WORLDS[b];
  exit(m,{id,name:`Lift · ${MOON_NAMES[b]}`,x:112,y:m.height-76,w:48,h:32,target:b,targetMapId:other.id,entryX:64,entryY:other.height/2});
  if (a!==8) exit(other,{id:`${id}-back`,name:`Lift · ${MOON_NAMES[a]}`,x:other.width-140,y:other.height-76,w:48,h:32,target:a,targetMapId:m.id,entryX:64,entryY:m.height/2,requiresInteraction:id});
}
