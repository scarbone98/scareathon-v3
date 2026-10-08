import assert from 'node:assert/strict';
import { BLAST_WORLDS, isBlocked, baseFootprints } from '../src/pages/WaysideFury/game/world.ts';
import { isGroundProp, isWalkableSurface, surfaceRects, surfaceHeightAt, surfaceElevationAt } from '../src/pages/WaysideFury/game/walkableSurfaces.ts';
const creek = BLAST_WORLDS[1];
const broken = creek.props.find(p => p.kind === 'broken-bridge');
assert.deepEqual(surfaceRects(broken), [{x:416,y:96,w:32,h:64},{x:512,y:96,w:32,h:64}]);
for (const [x,y] of [[432,128],[528,128],[480,272],[480,408]]) {
  assert.equal(isBlocked(creek,x,y,7),false, `standing on the deck at ${x},${y}`);
  assert.equal(surfaceHeightAt(creek,x,y),2, '3D actors stand at deck height');
}
for (const x of [448,464,480,496,512]) assert.equal(isBlocked(creek,x,128,7),true,'broken span keeps water blocked');
assert.equal(surfaceHeightAt(creek,480,128),0,'no invisible deck in the gap');
for (const y of [272,408]) for (let x=416;x<=544;x+=4) assert.equal(isBlocked(creek,x,y,7),false,'intact crossing stays continuous');
for (const kind of ['bridge','broken-bridge','dock','loading-dock','boardwalk','catwalk','ramp','stairs','rug','floor-decal']) {
  const p={kind,x:0,y:0,w:64,h:32};
  assert.ok(isWalkableSurface(p)&&isGroundProp(p),`${kind} must draw in the ground pass`);
  assert.deepEqual(baseFootprints(kind,0,0,64,32),[],`${kind} deck is walkable`);
}
const vertical={kind:'bridge',x:0,y:0,w:32,h:128,surface:{direction:'vertical',gap:[.25,.75],deckHeight:5}};
assert.deepEqual(surfaceRects(vertical),[{x:0,y:0,w:32,h:32},{x:0,y:96,w:32,h:32}]);
assert.equal(surfaceHeightAt({props:[vertical]},16,16),5);
assert.equal(surfaceHeightAt({props:[vertical]},16,64),0);
const slope=(x,y)=>x*.01+y*.02;
assert.equal(surfaceElevationAt({props:[{kind:'bridge',x:0,y:0,w:100,h:40,surface:{deckHeight:4}}]},20,20,slope),slope(50,20)+4,'actors and slab use the same flat deck base on sloping terrain');
console.log('Bridge surfaces: deck collision, blocked gaps, two intact crossings, ground classification and 3D standing heights pass.');
