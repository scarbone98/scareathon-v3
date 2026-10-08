import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { enemyWindupTell, applyEnemyWindup } from '../src/pages/WaysideFury/game/enemyWindup.ts';
for(const windup of [0,-.1,.251,.8,1.2])assert.equal(enemyWindupTell({hp:1,windup}),false);
for(const windup of [.25,.2,.001])assert.equal(enemyWindupTell({hp:1,windup}),true);
assert.equal(enemyWindupTell({hp:0,windup:.2}),false);
const e={hp:10,windup:.2,x:40,y:60,aimX:1,aimY:0},before=JSON.stringify(e),calls=[];
const c={translate:(...v)=>calls.push(['translate',...v]),scale:(...v)=>calls.push(['scale',...v]),filter:'none'};
applyEnemyWindup(c,e);
assert.equal(JSON.stringify(e),before);
assert.deepEqual(calls,[['translate',40,60],['scale',1.045,.94],['translate',-40,-60]]);
assert.equal(c.filter,'brightness(1.18) sepia(0.18)');
// All body paths share the same brief tell; target overlays must stay absent.
for(const file of ['render.ts','render3d.ts','renderSpace2d.ts','renderSpace3d.ts','renderWoods2d.ts','chapters/ch4Art.ts']) {
 const source=await readFile(new URL(`../src/pages/WaysideFury/game/${file}`,import.meta.url),'utf8');
 assert.doesNotMatch(source,/bossTelegraph|drawCityTelegraph|drawLunarTelegraph|drawWoodsTell/,file);
 assert.match(source,/applyEnemyWindup|enemyWindupTell|drawLunarBody/,file);
}
console.log('Enemy tells: final 250ms only, feet anchored, no state writes or directional ground overlays.');

const hud=await readFile(new URL('../src/pages/WaysideFury/page.tsx',import.meta.url),'utf8');
assert.doesNotMatch(hud,/boss\.windup|RUSH — DASH ASIDE|RADIAL BLAST — GUARD OR DASH/,'HUD must not announce the attack before its body tell');
