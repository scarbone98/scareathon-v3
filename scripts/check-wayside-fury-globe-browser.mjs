import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE??'/Users/szaneer/hark-work/fury-capture/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true,args:['--mute-audio','--use-angle=metal','--enable-gpu']});
const output='docs/wayside-fury-design/overworld-after';await mkdir(output,{recursive:true});const report=[];
try {
 for(const gfx of (process.env.FURY_CAPTURE_GFX?.split(',')??['2d','3d']))for(const size of [{width:390,height:844,dpr:3},{width:1440,height:900,dpr:2}]) {
  if(process.env.FURY_CAPTURE_SIZE&&String(size.width)!==process.env.FURY_CAPTURE_SIZE)continue;
  console.log('Globe fixture',gfx,size);
  const context=await browser.newContext({viewport:size,deviceScaleFactor:size.dpr,hasTouch:size.width===390,isMobile:size.width===390});
  await context.addInitScript(()=>localStorage.setItem('wayside-fury-controls-dismissed','1'));
  const page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5186'}/wayside-fury?gfx=${gfx}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__waysideFury&&!document.querySelector('.wf-primary').disabled);
  await page.locator('.wf-primary').click();await page.evaluate(async()=>{const {skipPrologue}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(skipPrologue);});
  console.log('Opening globe');await page.getByRole('button',{name:'World route · County Cruiser',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.wf-globe')?.dataset.phase==='cruise');
  if(gfx==='3d')await page.waitForFunction(()=>getComputedStyle(document.querySelector('.wf-globe-canvas')).visibility==='visible');
  const canvases=await page.locator('.wf-globe-canvas').evaluateAll(cs=>cs.map(c=>({w:c.width,h:c.height,cssW:c.clientWidth,cssH:c.clientHeight,visible:getComputedStyle(c).visibility!=='hidden'})));
  for(const c of canvases.filter(c=>c.visible))assert.ok(Math.abs(c.w-c.cssW*size.dpr)<=2&&Math.abs(c.h-c.cssH*size.dpr)<=2);
  assert.equal(await page.locator('.wf-globe-crew .wf-hero-face').count(),5);
  await page.screenshot({path:`${output}/${size.width}x${size.height}-${gfx}-globe.png`});
  // Unavailable chapter previews explain the milestone without moving the party.
  await page.getByRole('button',{name:/Hollow Woods/}).click();await page.waitForFunction(()=>document.querySelector('.wf-globe-guide').textContent.includes('Woods'));assert.match(await page.locator('.wf-globe-guide').innerText(),/realm|Woods/);assert.ok(await page.getByRole('button',{name:'Land',exact:true}).isDisabled());
  await page.getByRole('button',{name:/Wayside Station/}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.wf-globe-destinations button')].some(b=>b.textContent.includes('Wayside Station')&&b.getAttribute('aria-pressed')==='true'));
  await page.waitForFunction(()=>!document.querySelector('.wf-globe-actions button:last-child').disabled);
  const checkpointBefore=await page.evaluate(()=>window.__waysideFury.state.checkpointMapId);assert.equal(checkpointBefore,'overworld');
  await page.getByRole('button',{name:'Land',exact:true}).click();
  await page.getByRole('button',{name:'Cancel landing',exact:true}).click();assert.equal(await page.evaluate(()=>window.__waysideFury.state.mapId),'overworld');await page.waitForFunction(()=>document.querySelector('.wf-globe')?.dataset.phase==='cruise');
  await page.getByRole('button',{name:'Land',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.wf-globe'));
  assert.equal(await page.evaluate(()=>window.__waysideFury.state.mapId),'hub');assert.equal(await page.evaluate(()=>window.__waysideFury.state.checkpointMapId),'hub');
  await page.getByRole('button',{name:'World route · County Cruiser',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.wf-globe')?.dataset.phase==='cruise');
  await page.getByRole('button',{name:/County roads.*°/}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.wf-globe-destinations button')].some(b=>b.textContent.includes('County roads')&&b.getAttribute('aria-pressed')==='true'));
  await page.waitForFunction(()=>!document.querySelector('.wf-globe-actions button:last-child').disabled);
  if(gfx==='3d') {
   const snapshot=await page.evaluate(()=>JSON.stringify(window.__waysideFury.state));
   await page.locator('.wf-globe-canvas').first().evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
   await page.getByText('Canvas globe active · 3D unavailable').waitFor();
   assert.equal(await page.evaluate(()=>JSON.stringify(window.__waysideFury.state)),snapshot,'context loss preserves safe travel state');
   await page.getByRole('button',{name:'Use 2D',exact:true}).click();await page.getByRole('button',{name:'Try 3D',exact:true}).click();
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.wf-globe-canvas')).visibility==='visible');
   assert.equal(await page.evaluate(()=>JSON.stringify(window.__waysideFury.state)),snapshot,'mode switches preserve travel state');
  }
  await page.getByRole('button',{name:'Land',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.wf-globe'));
  const arrival=await page.evaluate(()=>({mapId:window.__waysideFury.state.mapId,checkpoint:window.__waysideFury.state.checkpointMapId,notice:window.__waysideFury.state.notice,previousInput:window.__waysideFury.state.previousInput}));console.log('Return arrival',arrival);assert.equal(arrival.mapId,'overworld');assert.equal(await page.evaluate(()=>window.__waysideFury.state.candy),0);
  assert.deepEqual(errors,[]);report.push({gfx,size,canvases,loop:'county → Wayside → county',cancel:true,contextLoss:gfx==='3d'});await context.close();
 }
 // DPR4 + unavailable WebGL, and portrait-to-landscape resizing.
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:4});
 await context.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return String(kind).includes('webgl')?null:get.call(this,kind,...args);};localStorage.setItem('wayside-fury-controls-dismissed','1');});
 const page=await context.newPage();page.setDefaultTimeout(120000);await page.goto('http://127.0.0.1:5186/wayside-fury?gfx=3d');await page.waitForFunction(()=>window.__waysideFury&&!document.querySelector('.wf-primary').disabled);await page.locator('.wf-primary').click();await page.evaluate(async()=>{const {skipPrologue}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(skipPrologue);});await page.getByRole('button',{name:'World route · County Cruiser',exact:true}).click();await page.getByText('Canvas globe active · 3D unavailable').waitFor();
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);await page.waitForTimeout(500);const backing=await page.locator('.wf-globe-canvas').last().evaluate(c=>({w:c.width,h:c.height,cssW:c.clientWidth,cssH:c.clientHeight}));assert.equal(backing.w,backing.cssW*4);assert.equal(backing.h,backing.cssH*4);report.push({gfx:'fallback',viewport,dpr:4,backing});}
 await context.close();
}finally{await writeFile(`${output}/globe-metrics${process.env.FURY_CAPTURE_SIZE?'-'+process.env.FURY_CAPTURE_SIZE:''}${process.env.FURY_CAPTURE_GFX?'-'+process.env.FURY_CAPTURE_GFX:''}.json`,JSON.stringify(report,null,2));await browser.close();}
console.log('Globe browser: native DPR matrix, five crew portraits, registry locks, automatic heading, cancel/landing round trips, context loss, DPR4 fallback and resize pass.');
