import { zonePreviews } from '../src/pages/WaysideFury/game/zonePreviews.ts';
import assert from 'node:assert/strict';
import { ALL_WORLDS, COOP_OVERWORLD, ROAD_RELOCATIONS } from '../src/pages/WaysideFury/game/world.ts';
import { roadClearance, roadMask, groundScatter, roadInfrastructure } from '../src/pages/WaysideFury/game/roadClearance.ts';
const worlds=ALL_WORLDS;
let solids=0,scatter=0;
for(const world of worlds) {
 const mask=roadMask(world);
 for(const p of world.props) {
  if(groundScatter(p)){assert.ok(!mask.intersects(p,true),`${world.id}/${p.id}: ground scatter clears pavement/shoulder/plaza`);scatter++;}
  if(roadInfrastructure(p))continue; // Authored gates/barriers/bridge rails terminate or contain the road.
  for(const footprint of p.footprints??[]){assert.ok(!mask.intersects(footprint),`${world.id}/${p.id}: solid base intersects road clearance`);solids++;}
 }
}
const road={id:'diagonal',x:0,y:0,w:160,h:160,direction:'horizontal',start:'junction',end:'junction',curve:[{x:0,y:0},{x:160,y:160}],curveWidth:16};
const fixture={roads:[road],tiles:[],collision:[],props:[],cols:10};
const mask=roadClearance(fixture);
assert.ok(mask.intersects({x:30,y:30,w:100,h:100}),'detect a ribbon crossing a rectangle, even when center/corners are insufficient');
assert.ok(mask.intersects({x:60,y:78,w:2,h:2}),'half-tile shoulder is reserved');
assert.ok(!mask.intersects({x:0,y:80,w:10,h:10}),'clear beside the diagonal');
assert.ok(mask.intersects({x:60,y:60,w:2,h:2}),'a future solid prop on asphalt fails the same assertion');
for(const world of [...worlds.filter(m=>m.id==='overworld'),COOP_OVERWORLD])for(const p of zonePreviews(world))assert.ok(!roadMask(world).intersects({x:p.groundX-p.w/2,y:p.groundZ-p.d/2,w:p.w,h:p.d}),`${world.id}: destination miniature base clears roads/plazas`);
const contained=roadClearance({...fixture,roads:[{...road,x:50,y:50,w:10,h:16,curve:undefined}]});
assert.ok(contained.intersects({x:0,y:0,w:200,h:200},false),'a whole road segment inside a large prop still intersects');
const tower=ROAD_RELOCATIONS.find(r=>r.propId.includes('water-tower'));
assert.ok(tower,'water tower moved beside the final curved road');
console.log(`Road clearance: ${worlds.length} maps, ${solids} solid footprints, ${scatter} scatter props; ${ROAD_RELOCATIONS.length} bases relocated. Gates/barriers/bridge rails retain authored road infrastructure collision.`);
