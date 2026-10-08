import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const wrapper=process.env.PLAYWRIGHT_MODULE??new URL('./wayside-fury-muted-playwright.mjs',import.meta.url).href;
const {chromium}=await import(wrapper.startsWith('/')?pathToFileURL(wrapper).href:wrapper);
const browser=await chromium.launch({headless:true,args:['--mute-audio']});
const base=process.env.FURY_BASE_URL??'http://127.0.0.1:5211';
const out=process.env.FURY_WOODS_SHOTS??'/private/tmp/fury-ch2-shots';await mkdir(out,{recursive:true});
const errors=[],metrics=[];
try {
 for(const [width,height,dpr] of [[390,844,3],[1440,900,2]])for(const gfx of ['2d','3d']) {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<600,hasTouch:width<600,reducedMotion:'reduce'});
  if(gfx==='3d')await context.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return ['webgl','webgl2','experimental-webgl'].includes(kind)?null:original.call(this,kind,...args);};});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/wayside-fury?gfx=${gfx}`,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>window.__waysideFury,null,{timeout:120000});
  await page.getByRole('button',{name:/Begin adventure|Continue adventure/}).click();
  await page.waitForFunction(()=>!document.querySelector('.wf-title-actions'),null,{timeout:120000});
  await page.evaluate(async()=>{const {enterCampaignMap}=await import('/src/pages/WaysideFury/game/sim.ts');const game=window.__waysideFury;game.setPaused(true);game.mutate(s=>{s.clearedRooms=['realm-0'];s.campaignMilestones=['breaker-knuckle','circuit-spark'];enterCampaignMap(s,'woods-layby');});});
  for(const id of ['woods-lantern-walk','woods-pump-house','woods-heartwood-engine']) {
   const metric=await page.evaluate(async id=>{
    const {enterCampaignMap}=await import('/src/pages/WaysideFury/game/sim.ts');const game=window.__waysideFury;
    game.mutate(s=>{enterCampaignMap(s,id);s.x=id==='woods-lantern-walk'?464:id==='woods-heartwood-engine'?400:320;s.y=254;for(const e of s.enemies){e.windup=.8;e.tellX=s.x;e.tellY=s.y;const len=Math.max(1,Math.hypot(s.x-e.x,s.y-e.y));e.aimX=(s.x-e.x)/len;e.aimY=(s.y-e.y)/len;}if(id==='woods-heartwood-engine')s.enemies[0].phase=2;});
    // Let the chapter HUD layout and ResizeObserver settle at native DPR.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    game.renderer.draw(game.state,0,0);const before=JSON.stringify(game.state);for(let i=0;i<12;i++)game.renderer.draw(game.state,0,0);
    const canvas=document.querySelector('canvas[aria-label="Wayside Fury action RPG"]'),r=canvas.getBoundingClientRect();
    return {unchanged:before===JSON.stringify(game.state),dpr:Number(canvas.dataset.renderDpr),width:canvas.width,height:canvas.height,cssWidth:r.width,cssHeight:r.height,renderer:canvas.dataset.renderer,mapId:game.state.mapId};
   },id);
   assert.ok(metric.unchanged);assert.equal(metric.dpr,dpr);assert.ok(Math.abs(metric.width-metric.cssWidth*dpr)<=1);assert.ok(Math.abs(metric.height-metric.cssHeight*dpr)<=1);assert.equal(metric.renderer,'2d');
   metrics.push({width,height,gfx,...metric});const file=`${out}/${width}x${height}-${gfx}-${id}.png`;
   if(process.env.FURY_WOODS_FULL_SCREENSHOTS==='1')await page.screenshot({path:file,timeout:120000});
   else {const png=await page.evaluate(()=>document.querySelector('canvas[aria-label="Wayside Fury action RPG"]').toDataURL('image/png').split(',')[1]);await writeFile(file,Buffer.from(png,'base64'));}
  }
  if(gfx==='3d') {
   await page.evaluate(async()=>{const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');const g=window.__waysideFury;g.mutate(s=>enterScene(s,'overworld'));g.renderer.draw(g.state,0,0);});
   await page.waitForFunction(()=>document.querySelector('canvas[aria-label="Wayside Fury action RPG"]').dataset.gfxStatus==='fallback',null,{timeout:60000});
   assert.equal(await page.evaluate(()=>window.__waysideFury.state.mapId),'overworld');
  }
  await context.close();console.log(`${width}x${height} ${gfx}: native DPR, Woods shared 2D, immutable rendering and optional fallback pass`);
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/metrics.json`,JSON.stringify(metrics,null,2));
} finally {await browser.close();}
