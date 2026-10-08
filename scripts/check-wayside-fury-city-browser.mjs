import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import('./wayside-fury-muted-playwright.mjs');
const browser=await chromium.launch({headless:true,args:['--mute-audio']});
const base=process.env.FURY_BASE_URL??'http://127.0.0.1:5214',out=process.env.FURY_CITY_SHOTS??'/private/tmp/fury-ch4-shots';await mkdir(out,{recursive:true});
const metrics=[],errors=[];
try {
 for(const [width,height,dpr] of [[390,844,3],[1440,900,2]].filter(([w,h])=>!process.env.FURY_CITY_VIEWPORTS||process.env.FURY_CITY_VIEWPORTS.split(',').includes(`${w}x${h}`))) for(const gfx of ['2d','3d']) {
  console.log('City browser case',width,height,gfx);
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<600,hasTouch:width<600,reducedMotion:'reduce'});
  if(gfx==='3d') await context.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes('webgl')?null:original.call(this,type,...args);};});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/wayside-fury?gfx=${gfx}`,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>window.__waysideFury,null,{timeout:120000});
  await page.getByRole('button',{name:/Begin adventure|Continue adventure/}).click();
  await page.waitForFunction(()=>!document.querySelector('.wf-title-actions'),null,{timeout:120000});
  for(const mapId of ['city-switchmaster','city-hatching']) {
   const result=await page.evaluate(async mapId=>{
    const {enterScene,createHero}=await import('/src/pages/WaysideFury/game/sim.ts');const {cityInteract}=await import('/src/pages/WaysideFury/game/chapters/ch4.ts');
    const game=window.__waysideFury;game.setPaused(true);game.mutate(s=>{s.campaignMilestones=['space-complete'];s.character={level:10,xp:0};for(const id of Object.keys(s.heroes))s.heroes[id]=createHero(id,s.character,s.gear);enterScene(s,'dungeon',0,mapId);s.x=340;s.y=250;
     if(mapId==='city-switchmaster') {s.enemies[0].windup=1;s.enemies[0].pattern=0;}
     else {s.enemies=[];s.clearedRooms.push(mapId);s.bosses.push('city-architect');cityInteract(s,'city-evacuate');}
    });game.renderer.draw(game.state,0,0);const before=JSON.stringify(game.state);for(let n=0;n<12;n++)game.renderer.draw(game.state,0,0);
    const canvas=document.querySelector('canvas[aria-label="Wayside Fury action RPG"]'),r=canvas.getBoundingClientRect();return {mapId,width:canvas.width,height:canvas.height,cssWidth:r.width,cssHeight:r.height,dpr:Number(canvas.dataset.renderDpr),unchanged:before===JSON.stringify(game.state)};
   },mapId);
   await page.waitForFunction(mapId=>!document.querySelector('.wf-title-actions')&&window.__waysideFury.state.mapId===mapId,mapId,{timeout:120000});
   if(mapId==='city-switchmaster') await page.waitForFunction(()=>document.querySelector('.wf-boss-hud strong')?.textContent.includes('SWITCHMASTER'),null,{timeout:120000});
   assert.ok(result.unchanged);assert.equal(result.dpr,dpr);assert.ok(Math.abs(result.width-result.cssWidth*dpr)<=1);assert.ok(Math.abs(result.height-result.cssHeight*dpr)<=1);metrics.push({width,height,gfx,...result});
   await page.screenshot({path:`${out}/${width}x${height}-${gfx}-${mapId}.png`,timeout:180000});
  }
  if(gfx==='3d') {await page.evaluate(async()=>{const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(s=>enterScene(s,'overworld'));window.__waysideFury.renderer.draw(window.__waysideFury.state,0,0);});await page.waitForFunction(()=>document.querySelector('canvas[aria-label="Wayside Fury action RPG"]').dataset.gfxStatus==='fallback',null,{timeout:120000});}
  await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/metrics.json`,JSON.stringify(metrics,null,2));console.log('City phone/desktop, native DPR, shared 2D in optional 3D mode, state immutability and unavailable-WebGL fallback pass.');
} finally {await browser.close();}
