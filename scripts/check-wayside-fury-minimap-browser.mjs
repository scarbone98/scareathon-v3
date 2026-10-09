import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE??'/Users/szaneer/hark-work/fury-capture/node_modules/playwright/index.mjs').href);
const timeout=Number(process.env.FURY_BROWSER_TIMEOUT??120000);
const browser=await chromium.launch({headless:true,args:['--mute-audio','--use-angle=metal','--enable-gpu']});
try {
 for(const fallback of [false,true]) {
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
  await context.addInitScript(fallback=>{localStorage.setItem('wayside-fury-controls-dismissed','1');if(fallback){const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:original.call(this,kind,...args);};}},fallback);
  const page=await context.newPage();page.setDefaultTimeout(timeout);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5224'}/wayside-fury${fallback?'?gfx=3d':''}`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__waysideFury&&!document.querySelector('.wf-primary').disabled);await page.locator('.wf-primary').click();
  await page.evaluate(async()=>{const {skipPrologue}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(skipPrologue);});
  await page.locator('.wf-minimap').waitFor();if(fallback)await page.waitForFunction(()=>document.querySelector('.wf-stage canvas').dataset.gfx==='2d');
  await page.evaluate(()=>{for(const key of ['m','Escape'])document.body.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__waysideFury.state.localPaused),false,'rapid map open/close resumes immediately');assert.equal(await page.locator('.wf-full-map').count(),0);
  await page.evaluate(()=>{const game=window.__waysideFury;game.state.enemies.push({});document.querySelector('.wf-minimap').click();game.state.enemies.pop();});await page.waitForTimeout(100);assert.equal(await page.locator('.wf-full-map').count(),0,'stale corner tap cannot pause a combat lock');
  await page.locator('.wf-minimap').click();await page.getByRole('dialog',{name:'County map'}).waitFor();
  await page.evaluate(()=>window.__waysideFury.mutate(s=>s.events.push({type:'checkpoint',id:'minimap-pause-probe'})));await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.__waysideFury.state.localPaused),true,'save-status refresh preserves map pause');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.locator('.wf-full-map').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.__waysideFury.state.localPaused),true);await page.getByRole('button',{name:'Resume',exact:true}).click();await page.locator('.wf-minimap').click();await page.locator('.wf-full-map').waitFor();
  const before=await page.evaluate(()=>({x:window.__waysideFury.state.x,time:window.__waysideFury.state.time}));await page.keyboard.down('d');await page.waitForTimeout(250);assert.deepEqual(await page.evaluate(()=>({x:window.__waysideFury.state.x,time:window.__waysideFury.state.time})),before);await page.keyboard.press('m');await page.keyboard.up('d');await page.locator('.wf-full-map').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.__waysideFury.state.localPaused),false);
  await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Minimap: On',exact:true}).click();await page.getByText('North up · 2D and 3D').waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Resume',exact:true}).click();await page.locator('.wf-minimap').waitFor({state:'detached'});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wayside-fury-minimap'))),{enabled:false,rotate:false});
  await page.keyboard.press('m');await page.locator('.wf-full-map').waitFor();await page.keyboard.press('Escape');await page.locator('.wf-full-map').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Minimap: Off',exact:true}).click();await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Resume',exact:true}).click();await page.locator('.wf-minimap').waitFor();
  await page.evaluate(()=>window.__waysideFury.setPaused(true));
  await page.evaluate(async()=>{const {bakeMinimap,drawMinimap}=await import('/src/pages/WaysideFury/game/minimapArt.ts');const {resolveMapObjective}=await import('/src/pages/WaysideFury/game/minimap.ts');const {getWorld}=await import('/src/pages/WaysideFury/game/world.ts');const s=window.__waysideFury.state,map=getWorld(s.scene,s.room,s.mapId),snapshot=JSON.stringify(s),worldSnapshot=JSON.stringify(map),base=bakeMinimap(map);for(let i=0;i<12;i++)drawMinimap(document.querySelector('.wf-minimap canvas'),map,s,resolveMapObjective(s,map),false,true,i*16);if(base!==bakeMinimap(map)||snapshot!==JSON.stringify(s)||worldSnapshot!==JSON.stringify(map))throw new Error('Minimap must cache geometry and leave authoritative state unchanged');});
  assert.deepEqual(errors,[]);await context.close();console.log(`Minimap browser: ${fallback?'WebGL fallback':'default 2D'}, click/M/Esc, paused movement, settings, disabled-map shortcut, cache and immutability pass.`);
 }
} finally {await browser.close();}
