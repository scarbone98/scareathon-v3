// Paused native-DPR visual fixtures; never performance evidence.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from './wayside-fury-muted-playwright.mjs';
const phase=process.argv[2]??'after';
assert.ok(['before','after'].includes(phase));
const output=`docs/wayside-fury-design/telegraph/${phase}`;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--mute-audio']});
const metrics=[],errors=[];
try {
 for(const [width,height,dpr] of [[390,844,3],[1440,900,2]])for(const gfx of ['2d','3d']) {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:width<600,reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('requestfailed',r=>console.error(r.url(),r.failure()));console.log('Opening',width,gfx);
  await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5219'}/wayside-fury?chapter=3&gfx=${gfx}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__waysideFury);
  await page.getByRole('button',{name:/Begin adventure|Continue adventure/}).click();
  await page.waitForFunction(()=>window.__waysideFury.state.mapId==='space-launch');
  console.log(`${phase}: ${width}x${height} ${gfx} ready`);
  for(const mapId of ['blast-7','woods-heartwood-engine','city-hatching','moon-m08']) {
   const result=await page.evaluate(async mapId=>{
    const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');
    const game=window.__waysideFury;game.setPaused(true);
    game.mutate(s=>{enterScene(s,'dungeon',0,mapId);s.dialogue=null;s.time=2;s.x=340;s.y=280;
     const boss=s.enemies.find(e=>e.kind==='boss')??s.enemies[0];
     if(!boss)throw Error(`No enemy in ${mapId}`);
     s.enemies=[boss];Object.assign(boss,{x:400,y:210,windup:.2,actionTimer:0,aimX:-.65,aimY:.76,pattern:0});
    });
    game.renderer.draw(game.state,0,0);
    return {behavior:game.state.enemies[0].behavior,woodsBehavior:game.state.enemies[0].woodsBehavior};
   },mapId);
   if(gfx==='3d'&&mapId==='moon-m08')await page.waitForFunction(()=>document.querySelector('canvas[aria-label="Wayside Fury action RPG"]').dataset.gfx==='3d');
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const measurement=await page.evaluate(()=>{
    const game=window.__waysideFury,before=JSON.stringify(game.state);for(let n=0;n<12;n++)game.renderer.draw(game.state,0,0);
    const c=document.querySelector('canvas[aria-label="Wayside Fury action RPG"]'),r=c.getBoundingClientRect();
    return {immutable:before===JSON.stringify(game.state),gfx:c.dataset.gfx,dpr:c.dataset.renderDpr,native:Math.abs(c.width-r.width*devicePixelRatio)<=1&&Math.abs(c.height-r.height*devicePixelRatio)<=1};
   });
   assert.ok(measurement.immutable);assert.ok(measurement.native);
   if(gfx==='3d'&&mapId==='moon-m08')assert.equal(measurement.gfx,'3d');
   const name=`${width}x${height}-${gfx}-${mapId}`;
   await page.screenshot({path:`${output}/${name}.png`});metrics.push({name,...result,...measurement});
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(`${output}/metrics.json`,JSON.stringify(metrics,null,2)+'\n');
 console.log(`${phase}: ${metrics.length} immutable native-DPR combat screenshots`);
} finally {await browser.close();}
