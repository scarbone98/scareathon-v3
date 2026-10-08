import { INTERIORS, interiorDefinition } from '../../../../server/shared/waysideFury/interiors.js';
import { map, paint, prop, exit, tileAt, overlaps, type WorldMap } from './worldBuilder.ts';
export { INTERIORS, interiorDefinition };
export const INTERIOR_WORLDS = INTERIORS.map((room, index) => {
  const m = map(room.id, room.name, 28, 22, 'stone');
  m.spawn = { x: 224, y: 256 };
  paint(m, 0, 0, m.width, 48, 'void', true);
  paint(m, 0, m.height - 32, m.width, 32, 'void', true);
  paint(m, 0, 0, 32, m.height, 'void', true);
  paint(m, m.width - 32, 0, 32, m.height, 'void', true);
  const desk = prop(m, ['office','archive','station'].includes(room.theme) ? 'control' : 'bench', 160, 88, 112, 40, 'Counter'); desk.id = `${room.id}-counter`;
  const keeper = prop(m, 'npc', 292, 112, 20, 30, room.theme === 'cabin' ? 'Ranger' : room.theme === 'diner' ? 'Diner keeper' : 'Caretaker');keeper.id = `${room.id}-keeper`;
  const book = prop(m, 'sign', 104, 152, 24, 28, 'Read local ledger');book.id = `${room.id}-ledger`;
  for (const [x,y] of index % 2 ? [[48,64],[336,64],[336,208]] : [[48,64],[48,208],[336,64]]) {
    prop(m, room.theme === 'warehouse' || room.theme === 'shed' ? 'crate' : 'bench', x, y, 56, 28);
  }
  if (['diner','cafe','station'].includes(room.theme)) prop(m,'vending',336,152,24,40,'Warm drinks');
  if (room.theme === 'farm' || room.theme === 'cabin') prop(m,'flower',336,224,32,24,'Windowsill garden');
  m.radarAnchors = [{id:`${room.id}-lore`,x:116,y:196}];
  exit(m,{id:`${room.id}-exit`,name:`Return · ${room.name.split(' · ')[0]}`,x:200,y:288,w:48,h:32,target:'hub',targetMapId:room.parent,entryX:room.x,entryY:room.y+16});
  return m;
});
export function attachInteriorDoors(worlds: WorldMap[]) {
  for (const room of INTERIORS) {
    const parent = worlds.find(m=>m.id===room.parent);if(!parent) continue;
    let building = parent.props.find(p=>p.kind===room.building && Math.abs(p.x+p.w/2-room.x)<60 && Math.abs(p.y+p.h-room.y)<80);
    if (!building) building=prop(parent,room.building as 'home',room.x-56,room.y-88,112,72,room.name.split(' · ').at(-1));
    building.interiorId=room.id;
    building.label=room.name.split(' · ').at(-1);
    // Door is immediately outside the solid base, never inside the facade.
    const apron={x:room.x-24,y:room.y-4,w:48,h:48};paint(parent,apron.x,apron.y,apron.w,apron.h,'stone');
    parent.props=parent.props.filter(p=>p===building || !["tree","pine","rock","bush","flower","reeds"].includes(p.kind) || !(p.footprints??[]).some(r=>r.x<apron.x+apron.w && r.x+r.w>apron.x && r.y<apron.y+apron.h && r.y+r.h>apron.y));
    parent.radarAnchors??=[];parent.radarAnchors.push({id:`${room.id}-door`,x:room.x,y:room.y});
  }
  for (const world of worlds.filter(world=>world.organic || world.id==="hub")) world.props=world.props.filter(p=>!(["tree","pine","rock"].includes(p.kind) && p.x>=32 && p.y>=32 && p.x+p.w<=world.width-32 && p.y+p.h<=world.height-32) || (p.footprints??[]).every(r=>!world.exits.some(e=>overlaps({x:r.x-32,y:r.y-32,w:r.w+64,h:r.h+64},e)) && [r.x+.1,r.x+r.w-.1].every(x=>[r.y+.1,r.y+r.h-.1].every(y=>tileAt(world,Math.floor(x/16),Math.floor(y/16))===(world.id.startsWith("blast")?"ash":"grass")))));
}
