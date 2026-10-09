import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE??'/Users/szaneer/hark-work/fury-capture/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true,args:['--mute-audio','--use-angle=metal','--enable-gpu']});
const output='docs/wayside-fury-design/minimap';await mkdir(output,{recursive:true});const metrics=[];
try {
for(const gfx of (process.env.FURY_CAPTURE_GFX?.split(',')??['2d','3d']))for(const size of [{width:390,height:844,dpr:3},{width:844,height:390,dpr:3},{width:1440,height:900,dpr:2}]) {
 if(process.env.FURY_CAPTURE_SIZE && `${size.width}x${size.height}`!==process.env.FURY_CAPTURE_SIZE)continue;
 console.log(`Starting minimap: ${gfx} ${size.width}x${size.height}`);
 const context=await browser.newContext({viewport:size,deviceScaleFactor:size.dpr,hasTouch:size.width<1000,isMobile:size.width<1000});await context.addInitScript(()=>localStorage.setItem('wayside-fury-controls-dismissed','1'));
 const page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5224'}/wayside-fury?gfx=${gfx}`);await page.waitForFunction(()=>window.__waysideFury&&!document.querySelector('.wf-primary').disabled);await page.locator('.wf-primary').click();
 for(const chapter of [1,2,3,4,5]) {
 await page.evaluate(async chapter=>{const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');const game=window.__waysideFury;game.mutate(s=>{s.chapter=chapter;s.campaignMilestones=['realm-0','woods-complete','space-complete','city-complete'].slice(0,chapter-1);enterScene(s,'overworld');s.notice='';s.x=chapter===3?1500:chapter===2?640:chapter===4?1000:208;s.y=chapter===2?260:480;});game.setPaused(true);game.renderer.reset();},chapter);
 await page.locator('.wf-minimap').waitFor();if(gfx==='3d')await page.waitForFunction(()=>document.querySelector('.wf-stage canvas').dataset.gfx==='3d');await page.waitForFunction(()=>{const r=document.querySelector('.wf-minimap').getBoundingClientRect();return [...document.querySelectorAll('.wf-hud,.wf-play-band,.wf-stick-zone,.wf-action-buttons')].filter(e=>e.getClientRects().length).every(e=>{const o=e.getBoundingClientRect();return !(r.x<o.right&&r.right>o.x&&r.y<o.bottom&&r.bottom>o.y);});});await page.waitForTimeout(350);
 const measure=await page.evaluate(()=>{const m=document.querySelector('.wf-minimap'),r=m.getBoundingClientRect(),c=m.querySelector('canvas');const obstacles=[...document.querySelectorAll('.wf-hud,.wf-pause,.wf-stick-zone,.wf-action-buttons,.wf-play-band')].filter(e=>e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return{class:e.className,x:b.x,y:b.y,w:b.width,h:b.height};});return{map:{x:r.x,y:r.y,w:r.width,h:r.height},canvas:{w:c.width,h:c.height,cssW:c.clientWidth,cssH:c.clientHeight},obstacles};});
 const r=measure.map;for(const o of measure.obstacles)assert.ok(!(r.x<o.x+o.w&&r.x+r.w>o.x&&r.y<o.y+o.h&&r.y+r.h>o.y),`${size.width}x${size.height}: overlap ${o.class}`);
 assert.ok(Math.abs(measure.canvas.w-measure.canvas.cssW*size.dpr)<=1);await page.screenshot({path:`${output}/${size.width}x${size.height}-${gfx}-chapter${chapter}-overworld.png`});metrics.push({gfx,size,chapter,...measure});console.log(`Captured chapter ${chapter}`);
 }
 // Cover local towns and the launch checklist with real authored geometry.
 for(const mapId of ['hub','woods-layby','space-launch','city-boulevard','city-market']) {
 await page.evaluate(async mapId=>{const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(s=>{enterScene(s,mapId==='hub'?'hub':'dungeon',0,mapId);s.enemies=[];s.dialogue=null;s.notice='';});window.__waysideFury.setPaused(true);window.__waysideFury.renderer.reset();},mapId);await page.locator('.wf-minimap').waitFor();await page.waitForTimeout(200);await page.screenshot({path:`${output}/${size.width}x${size.height}-${gfx}-${mapId}.png`});
 }
 await page.keyboard.press('m');await page.locator('.wf-full-map').waitFor();await page.waitForTimeout(200);await page.screenshot({path:`${output}/${size.width}x${size.height}-${gfx}-full-map.png`});await page.keyboard.press('Escape');await page.locator('.wf-full-map').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.__waysideFury.state.localPaused),false);
 // Select is edge-triggered and closes without an immediate reopen.
 await page.evaluate(()=>{window.__mapPad={connected:true,buttons:Array.from({length:17},()=>({pressed:false,value:0})),axes:[0,0,0,0],id:'Minimap fixture',index:0,mapping:'standard'};navigator.getGamepads=()=>[window.__mapPad];window.__mapPad.buttons[8].pressed=true;});await page.locator('.wf-full-map').waitFor();await page.evaluate(()=>window.__mapPad.buttons[8].pressed=false);await page.waitForTimeout(100);await page.evaluate(()=>window.__mapPad.buttons[8].pressed=true);await page.locator('.wf-full-map').waitFor({state:'detached'});await page.evaluate(()=>navigator.getGamepads=()=>[]);
 assert.deepEqual(errors,[]);await context.close();console.log(`${gfx} ${size.width}x${size.height}: chapter/town maps, DPR, layout and map input pass`);
}
} finally {await writeFile(`${output}/metrics${process.env.FURY_CAPTURE_GFX?'-'+process.env.FURY_CAPTURE_GFX:''}${process.env.FURY_CAPTURE_SIZE?'-'+process.env.FURY_CAPTURE_SIZE:''}.json`,JSON.stringify(metrics,null,2));await browser.close();}
