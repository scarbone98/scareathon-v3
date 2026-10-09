// Run against a Vite dev server; guest preview needs the usual VITE_SUPABASE settings.
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const moduleName = process.env.PLAYWRIGHT_MODULE ?? 'playwright';
const { chromium } = await import(moduleName.startsWith('/') ? pathToFileURL(moduleName).href : moduleName);
const base = process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5185';
const output = process.env.FURY_DESIGN_SHOTS ?? 'work/fury-design-browser';
await mkdir(output, { recursive: true });
import assert from 'node:assert/strict';
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
try {
for(const [name,viewport,dpr,touch] of [['phone',{width:390,height:844},3,true],['desktop',{width:1440,height:900},1,false]]) {
 const context=await browser.newContext({viewport,deviceScaleFactor:dpr,isMobile:touch,hasTouch:touch});
 const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(30000);
 await page.goto(`${base}/wayside-fury?gfx=2d`);
 await page.waitForFunction(()=>window.__waysideFury&&!document.querySelector('.wf-primary')?.disabled,{},{timeout:90000});
 await page.locator('.wf-primary').click();
 await page.locator('.wf-intro-dialogue').waitFor();
 assert.equal(await page.locator('canvas[aria-label="Wayside Fury action RPG"]').evaluate(c=>Number(c.dataset.renderDpr)),dpr);
 await page.screenshot({path:`${output}/${name}-intro.png`});
 for(let beat=0;beat<12;beat++) {
  await page.evaluate(i=>window.__waysideFury.mutate(s=>{s.cutscene=i;s.sceneTimer=1.3;s.prologueRevealed=false;}),beat);
  const panel=page.locator('.wf-intro-dialogue');
  const box=await panel.boundingBox(); assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1);
  await page.getByRole('button',{name:'Reveal line'}).click();
  assert.equal(await page.evaluate(()=>window.__waysideFury.state.cutscene),beat);
  if(beat===2)await page.screenshot({path:`${output}/${name}-speaker.png`});
  if(beat===7)await page.screenshot({path:`${output}/${name}-portal.png`});
 }
 if(touch) await page.getByRole('button',{name:'Skip prologue'}).tap();
 else await page.keyboard.press('Shift');
 await page.waitForFunction(()=>window.__waysideFury.state.scene==='overworld');
 await page.waitForTimeout(700);
 await page.screenshot({path:`${output}/${name}-county.png`});
 await page.evaluate(async()=>{const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(s=>enterScene(s,'hub'));});
 await page.keyboard.down('d');await page.waitForTimeout(450);await page.keyboard.up('d');
 await page.screenshot({path:`${output}/${name}-crew.png`});
 await page.goto(`${base}/wayside-fury?gfx=3d`);
 await page.waitForFunction(()=>window.__waysideFury&&!document.querySelector('.wf-primary')?.disabled,{},{timeout:90000});
 await page.locator('.wf-primary').click();
 await page.evaluate(async()=>{const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(s=>enterScene(s,'overworld'));});
 await page.waitForFunction(()=>document.querySelector('canvas[data-gfx="3d"]'),{},{timeout:90000});
 await page.keyboard.down('d');await page.waitForTimeout(450);await page.keyboard.up('d');
 await page.screenshot({path:`${output}/${name}-3d.png`});
 // Exercise the shared Space renderer with all crew and suited movement.
 await page.evaluate(async()=>{const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(s=>{enterScene(s,'dungeon',0,'moon-m04');s.spaceOutfit=true;s.sceneTimer=5;});});
 for (const hero of ['you','joe','matt','alex','jon']) {
  await page.evaluate(id=>window.__waysideFury.mutate(s=>{s.active=id;}),hero);
  await page.keyboard.down('d');await page.waitForTimeout(150);await page.keyboard.up('d');
 }
 await page.screenshot({path:`${output}/${name}-moon.png`});
 // Compare authored poses at a fixed position: no translation can fake a walk.
 const rigChecks = await page.evaluate(async()=>{
  const {drawCrew}=await import('/src/pages/WaysideFury/game/crewArt.ts');
  const {drawWoodsBody}=await import('/src/pages/WaysideFury/game/renderWoods2d.ts');
  const {drawLunarBody}=await import('/src/pages/WaysideFury/game/renderSpace2d.ts');
  const {drawCityEnemy}=await import('/src/pages/WaysideFury/game/chapters/ch4Art.ts');
  const {newGame,addEnemy}=await import('/src/pages/WaysideFury/game/sim.ts');
  const c=document.createElement('canvas');c.width=256;c.height=384;const ctx=c.getContext('2d');
  const stamp=draw=>{ctx.reset();ctx.scale(4,4);draw(ctx);return c.toDataURL();};
  const result=[];
  for(const id of ['you','joe','matt','alex','jon']){
   const avatar=id==='you'?window.__waysideFury.renderer.flat.avatar:null;
   const facing=['down','up','left','right'].map(f=>stamp(ctx=>drawCrew(ctx,id,32,80,1,{phase:.7,speed:60,facing:f},avatar)));
   const a=stamp(ctx=>drawCrew(ctx,id,32,80,1,{phase:0,speed:60,facing:'down'},avatar));
   const b=stamp(ctx=>drawCrew(ctx,id,32,80,1,{phase:1.5,speed:60,facing:'down'},avatar));
   result.push({id,facings:new Set(facing).size,walk:a!==b});
  }
  for(const [family,types,draw] of [
   ['woods',['rooted','lantern','wisp','bailiff','foreman'],drawWoodsBody],
   ['moon',['rat','walker','scout','echo','satellite','inspector','warden'],drawLunarBody],
   ['city',['cable-rat','neon-imp','turnstile','clockwolf','switchmaster','architect'],drawCityEnemy]]){
   for(const id of types){const state=newGame();const e=addEnemy(state,'grunt',32,80);if(family==='woods')e.woodsBehavior=id;else e.behavior=id;
    const a=stamp(ctx=>draw(ctx,{...e,motion:{phase:0,speed:50,facing:'right'}},state));
    const b=stamp(ctx=>draw(ctx,{...e,motion:{phase:1.5,speed:50,facing:'right'}},state));
    result.push({id,facings:null,walk:a!==b});
   }
  }
  return result;
 });
 for(const r of rigChecks){if(r.facings!==null)assert.equal(r.facings,4,`${r.id}: directional poses`);assert.ok(r.walk,`${r.id}: moves at a fixed anchor`);}
 // Reduced motion shows complete text and final confirm shares the skip fade.
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(async()=>{const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(s=>{enterScene(s,'prologue');s.cutscene=11;});});
 await page.getByRole('button',{name:'Drive out'}).click();
 await page.waitForFunction(()=>window.__waysideFury.state.scene==='overworld');
 console.log(name,'intro bounds, reveal, skip, native DPR, movement, WebGL Space and reduced-motion final advance passed');
 await context.close();
}
assert.deepEqual(errors,[]);
} finally { await browser.close(); }
