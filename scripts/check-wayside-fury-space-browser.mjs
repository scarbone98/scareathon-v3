// Muted Chromium integration and native-DPR checks for the gameplay slice.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const wrapper = process.env.PLAYWRIGHT_MODULE ?? new URL('./wayside-fury-muted-playwright.mjs',import.meta.url).href;
const {chromium}=await import(wrapper.startsWith('/')?pathToFileURL(wrapper).href:wrapper);
const browser=await chromium.launch({headless:true,args:['--mute-audio']});
const base=process.env.FURY_BASE_URL??'http://127.0.0.1:5187';
const out=process.env.FURY_SPACE_SHOTS??'/private/tmp/ch3-shots';await mkdir(out,{recursive:true});
const errors=[];
try {
 for(const [width,height,dpr] of [[390,844,3],[844,390,3],[1440,900,2],[390,844,4]])for(const gfx of ['2d','3d']) {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,reducedMotion:'reduce'});
  if(gfx==='3d') await context.addInitScript(()=>{
    const getContext=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args) {return type==='webgl'||type==='webgl2'||type==='experimental-webgl'?null:getContext.call(this,type,...args);};
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/wayside-fury?chapter=3&gfx=${gfx}`,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>window.__waysideFury,null,{timeout:60000});
  const begin=page.getByRole('button',{name:/Begin adventure|Continue adventure/});await begin.click();
  await page.waitForFunction(()=>window.__waysideFury.state.mapId==='space-launch',null,{timeout:60000}).catch(async e=>{console.error({width,height,gfx,errors,state:await page.evaluate(()=>({map:window.__waysideFury?.state.mapId,scene:window.__waysideFury?.state.scene}))});throw e;});
  const caseId=`${width}x${height}-dpr${dpr}-${gfx}`;
  async function fixture(mapId,film=null,elapsed=0) {
    return page.evaluate(async({mapId,film,elapsed})=>{
      const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');
      const {startSpaceFilm}=await import('/src/pages/WaysideFury/game/cinematics.ts');
      const game=window.__waysideFury;game.setPaused(true);
      game.mutate(s=>{enterScene(s,'dungeon',0,mapId);s.spaceOutfit=true;if(film){startSpaceFilm(s,film);s.film.elapsed=elapsed;}});
      game.renderer.draw(game.state,0,0);
      const before=JSON.stringify(game.state);for(let n=0;n<12;n++)game.renderer.draw(game.state,0,0);
      const canvas=document.querySelector('canvas[aria-label="Wayside Fury action RPG"]');const rect=canvas.getBoundingClientRect();
      return {unchanged:before===JSON.stringify(game.state),width:canvas.width,height:canvas.height,cssWidth:rect.width,cssHeight:rect.height,dpr:canvas.dataset.renderDpr,mapId:game.state.mapId};
    },{mapId,film,elapsed});
  }
  for(const [mapId,name,film,elapsed] of [['space-launch','compound',null,0],['moon-m04','crater-hop',null,0],['moon-m08','warden',null,0],['space-launch','separation','space-outbound',20],['space-launch','earth','space-outbound',34]]) {
    const result=await fixture(mapId,film,elapsed);assert.ok(result.unchanged,`${caseId}: renderer mutates state`);
    assert.equal(Number(result.dpr),dpr);assert.ok(Math.abs(result.width-result.cssWidth*dpr)<=1);assert.ok(Math.abs(result.height-result.cssHeight*dpr)<=1);
    await page.screenshot({path:`${out}/${caseId}-${name}.png`,timeout:180000});
  }
  if(gfx==='3d') {
    await page.evaluate(async()=>{const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(s=>enterScene(s,'overworld'));});
    await page.waitForFunction(()=>document.querySelector('canvas[aria-label="Wayside Fury action RPG"]').dataset.gfxStatus==='fallback',null,{timeout:60000});
    assert.equal(await page.evaluate(()=>window.__waysideFury.state.mapId),'overworld');
  }
  await context.close();console.log(`${caseId}: dev entry, native backing and immutable shared space presentation pass`);
 }
 assert.deepEqual(errors,[]);
} finally {await browser.close();}
