import assert from 'node:assert/strict';
import { footprintGrounding, GROUND_DECALS } from '../src/pages/WaysideFury/game/grounding.ts';
const plane=(x,z)=>10+x*.3-z*.2;
for(const angle of [0,.7,2.1]) {
 const f=footprintGrounding(plane,20,30,12,8,angle);
 const points=[];
 for(const u of [-6,0,6])for(const v of [-4,0,4])points.push(plane(20+u*Math.cos(angle)+v*Math.sin(angle),30-u*Math.sin(angle)+v*Math.cos(angle)));
 assert.ok(Math.abs(f.base-Math.min(...points))<1e-10,'rotated footprint uses lowest terrain point');
 assert.ok(f.base<plane(20,30),'sloped props sink to the low edge rather than hovering');
 assert.ok(Math.abs(f.tiltX)+Math.abs(f.tiltZ)>0,'slope has a presentation tilt');
}
const dip=footprintGrounding((x,z)=>x===0&&z===0?-3:0,0,0,10,10);
assert.equal(dip.base,-3,'center depression is sampled as well as footprint corners');
assert.deepEqual(footprintGrounding(()=>0,0,0,12,8),{base:0,tiltX:0,tiltZ:-0});
assert.ok(['crater','impact','ember-vent','ground-crack'].every(k=>GROUND_DECALS.has(k)),'depressions and cracks stay below actors');
console.log('Wayside Fury grounding footprint/layer checks pass.');
