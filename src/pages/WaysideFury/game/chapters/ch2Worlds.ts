import { map, paint, prop, exit } from '../worldBuilder.ts';
export type WoodsBehavior = 'rooted' | 'lantern' | 'wisp' | 'bailiff' | 'foreman';
export const WOODS_IDS = ['woods-layby','woods-ranger-gate','woods-lantern-walk','woods-pump-house','woods-conveyor-yard','woods-mirror-sawmill','woods-heartwood-engine','woods-lunch-shed'] as const;
const names = ['Ranger Lay-by','Ranger Gate','Lantern Walk','Pump House','Conveyor Yard','Mirror Sawmill','Heartwood Engine','Lost Lunch Shed'];
export const WOODS_WORLDS = WOODS_IDS.map((id, i) => {
  const m = map(id, `Hollow Woods · ${names[i]}`, 44, 28, i===5?'corrupt':'grass');
  m.spawn={x:64,y:224};
  paint(m,0,0,704,16,'grass',true);paint(m,0,432,704,16,'grass',true);
  paint(m,0,0,16,448,'grass',true);paint(m,688,0,16,448,'grass',true);
  paint(m,32,184,640,80,i>=3?'stone':'dirt');
  for(let n=0;n<9;n++) {
    prop(m,'pine',72+n*66,32,32,72); prop(m,'pine',80+n*66,344,36,80);
    if(n%2===0) prop(m,'lamp',100+n*66,132,12,30);
  }
  if(i===0) { prop(m,'bench',160,264,56,24,'Crew rest');prop(m,'sign',144,128,20,36,'Forestry radio'); }
  if(i===1) { const p=prop(m,'seal',352,184,32,80,'Cracked root housing');p.id='woods-ranger-seal';p.footprints=[{x:352,y:184,w:32,h:80}]; }
  if(i===3) {
    paint(m,352,16,32,168,'water',true);paint(m,352,264,32,168,'water',true);
    const p=prop(m,'seal',352,184,32,80,'Unpowered bridge');p.id='woods-pump-bridge';p.footprints=[{x:352,y:184,w:32,h:80}];
    prop(m,'socket',296,268,24,24,'Grounded bypass');prop(m,'bench',160,280,56,24,'Midpoint rest');
  }
  if(i===5) { prop(m,'control',288,72,96,64,'Mirror relay'); }
  if(i===6) for(const [n,x] of [[0,208],[1,496]]) {
    const p=prop(m,'socket',x,300,32,32,'Root anchor');p.id=`woods-anchor-${n}`;
  }
  if(i===7) { prop(m,'shed',256,64,96,80,'Lost Lunch Shed');prop(m,'sign',260,284,20,28,'Incident receipt'); }
  m.radarAnchors=m.props.filter(p=>['seal','socket','sign','control'].includes(p.kind)).map(p=>({id:p.id,x:p.x+p.w/2,y:p.y+p.h+14}));
  return m;
});
function link(a:number,b:number, gate?:string, north=false) {
  const m=WOODS_WORLDS[a],other=WOODS_WORLDS[b];
  exit(m,{id:`${m.id}-to-${other.id}`,name:other.name,x:north?112:688,y:north?0:184,w:north?64:16,h:north?16:80,target:b,targetMapId:other.id,entryX:north?144:48,entryY:north?400:224,requiresClear:true,requiresInteraction:gate});
  exit(other,{id:`${other.id}-to-${m.id}`,name:m.name,x:north?112:0,y:north?432:184,w:north?64:16,h:north?16:80,target:a,targetMapId:m.id,entryX:north?144:656,entryY:north?48:224});
}
function spawn(room:number,woodsBehavior:WoodsBehavior,x:number,y:number) {
  WOODS_WORLDS[room].spawns.push({kind:['bailiff','foreman'].includes(woodsBehavior)?'boss':woodsBehavior==='lantern'?'shooter':'grunt',sprite:woodsBehavior==='rooted'?'zombie':woodsBehavior==='lantern'?'pumpkin':woodsBehavior==='wisp'?'ghost':woodsBehavior==='bailiff'?'imp':'shadowbeast',woodsBehavior,x,y});
}
spawn(1,'rooted',480,200);spawn(1,'rooted',560,264);
spawn(2,'wisp',464,160);spawn(2,'lantern',544,224);spawn(2,'rooted',400,272);
spawn(3,'lantern',496,176);spawn(3,'rooted',560,272);
spawn(4,'bailiff',448,224);spawn(5,'wisp',480,168);spawn(5,'rooted',544,272);
spawn(6,'foreman',448,224);spawn(7,'lantern',496,224);
link(0,1);link(1,2,'woods-ranger-seal');link(2,3);link(3,4,'woods-pump-bridge');link(4,5);link(5,6,'woods-mirror-return');link(3,7,undefined,true);link(7,4,undefined,true);
exit(WOODS_WORLDS[0],{id:'woods-taxi',name:'Return to county taxi',x:0,y:184,w:16,h:80,target:'overworld',targetMapId:'overworld',entryX:656,entryY:224});
exit(WOODS_WORLDS[6],{id:'woods-home',name:'Return with launch key',x:688,y:184,w:16,h:80,target:'hub',targetMapId:'hub',entryX:480,entryY:416,requiresClear:true,requiresInteraction:'woods-complete'});
exit(WOODS_WORLDS[7],{id:'woods-lunch-shortcut',name:'Shortcut · Ranger Lay-by',x:0,y:184,w:16,h:80,target:0,targetMapId:'woods-layby',entryX:144,entryY:224});
