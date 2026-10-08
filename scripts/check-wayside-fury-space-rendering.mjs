// Muted Chromium integration and native-DPR checks for the gameplay slice.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const wrapper = process.env.PLAYWRIGHT_MODULE ?? new URL('./wayside-fury-muted-playwright.mjs',import.meta.url).href;
const {chromium}=await import(wrapper.startsWith('/')?pathToFileURL(wrapper).href:wrapper);
const browser=await chromium.launch({headless:true,args:['--mute-audio']});
const base=process.env.FURY_BASE_URL??'http://127.0.0.1:5187';
const out=process.env.FURY_SPACE_SHOTS??'/private/tmp/ch3-shots';await mkdir(out,{recursive:true});
const errors=[];
try {
 for(const [width,height,dpr] of [[390,844,3],[1440,900,2]])for(const gfx of ['2d','3d']) {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<600,hasTouch:width<600,reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('requestfailed',r=>console.error(r.url(),r.failure()));
  await page.goto(`${base}/wayside-fury?chapter=3&gfx=${gfx}`,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>window.__waysideFury,null,{timeout:180000});
  const begin=page.getByRole('button',{name:/Begin adventure|Continue adventure/});await begin.click();
  await page.waitForFunction(()=>window.__waysideFury.state.mapId==='space-launch',null,{timeout:60000}).catch(async e=>{console.error({width,height,gfx,errors,state:await page.evaluate(()=>({map:window.__waysideFury?.state.mapId,scene:window.__waysideFury?.state.scene}))});throw e;});
  if(width===390&&gfx==='2d') {
    const sheet=await page.evaluate(async()=>{
      const {resolveHeroVisual,SUIT_POSES}=await import('/src/pages/WaysideFury/game/heroVisuals.ts');
      const game=window.__waysideFury,c=document.createElement('canvas');c.width=SUIT_POSES.length*128;c.height=5*216;const g=c.getContext('2d');g.fillStyle='#142236';g.fillRect(0,0,c.width,c.height);
      for(const [row,id]of ['joe','matt','alex','jon','you'].entries())for(const [col,pose]of SUIT_POSES.entries()){
        const v=resolveHeroVisual({...game.state,spaceOutfit:true,active:id,time:.25,faceX:0,faceY:1},null,pose);g.drawImage(v.canvas,col*128,row*216);g.drawImage(v.visor,col*128,row*216);g.fillStyle='#f2dcad';g.font='12px sans-serif';g.fillText(`${id}: ${pose}`,col*128+3,row*216+204);
      }return c.toDataURL('image/png').split(',')[1];
    });await writeFile(`${out}/suit-contact-sheet.png`,Buffer.from(sheet,'base64'));
  }
  const caseId=`${width}x${height}-dpr${dpr}-${gfx}`;
  async function fixture(mapId,film=null,elapsed=0) {
    return page.evaluate(async({mapId,film,elapsed})=>{
      const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');
      const {startSpaceFilm}=await import('/src/pages/WaysideFury/game/cinematics.ts');
      const game=window.__waysideFury;game.setPaused(true);
      game.mutate(s=>{enterScene(s,'dungeon',0,mapId);s.spaceOutfit=true;if(mapId==='moon-m08'){s.x=400;s.y=340;}if(mapId==='moon-m04'){s.x=350;s.y=210;}if(film){startSpaceFilm(s,film);s.film.elapsed=elapsed;}});
      game.renderer.draw(game.state,0,0);
      const before=JSON.stringify(game.state);for(let n=0;n<12;n++)game.renderer.draw(game.state,0,0);
      const canvas=document.querySelector('canvas[aria-label="Wayside Fury action RPG"]');const rect=canvas.getBoundingClientRect();
      return {unchanged:before===JSON.stringify(game.state),width:canvas.width,height:canvas.height,cssWidth:rect.width,cssHeight:rect.height,dpr:canvas.dataset.renderDpr,mapId:game.state.mapId};
    },{mapId,film,elapsed});
  }
  for(const [mapId,name,film,elapsed] of [['space-launch','compound',null,0],['moon-m04','crater-hop',null,0],['moon-m08','warden',null,0],['space-launch','separation','space-outbound',20],['space-launch','earth','space-outbound',34]]) {
    await fixture(mapId,film,elapsed);
    if(gfx==='3d')await page.waitForFunction(()=>document.querySelector('canvas[aria-label="Wayside Fury action RPG"]').dataset.gfx==='3d',null,{timeout:60000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const result=await fixture(mapId,film,elapsed);assert.ok(result.unchanged,`${caseId}: renderer mutates state`);
    assert.equal(Number(result.dpr),dpr);assert.ok(Math.abs(result.width-result.cssWidth*dpr)<=1);assert.ok(Math.abs(result.height-result.cssHeight*dpr)<=1,JSON.stringify({caseId,name,...result}));
    if(gfx==='3d'){const backing=await page.evaluate(()=>{const c=document.querySelector('.wf-canvas-3d'),r=c.getBoundingClientRect();return[c.width,c.height,r.width,r.height];});assert.ok(Math.abs(backing[0]-backing[2]*dpr)<=1);assert.ok(Math.abs(backing[1]-backing[3]*dpr)<=1);}
    await page.screenshot({path:`${out}/${caseId}-${name}.png`,timeout:180000});
  }
  if(gfx==='3d') {
    const beforeLoss=await page.evaluate(()=>JSON.stringify(window.__waysideFury.state));
    await page.evaluate(()=>{document.querySelector('.wf-canvas-3d').dispatchEvent(new Event('webglcontextlost',{cancelable:true}));window.__waysideFury.renderer.draw(window.__waysideFury.state,0,0);});
    await page.waitForFunction(()=>document.querySelector('canvas[aria-label="Wayside Fury action RPG"]').dataset.gfxStatus==='fallback',null,{timeout:60000});
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__waysideFury.state)),beforeLoss);
  }
  await context.close();console.log(`${caseId}: dev entry, native backing and immutable shared space presentation pass`);
 }
 assert.deepEqual(errors,[]);
} finally {await browser.close();}
