import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from './wayside-fury-muted-playwright.mjs';
const base=process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5228';
const output='/tmp/fury-u1combat-shots';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--mute-audio']});
try {
 for(const [name,viewport,dpr] of [['phone',{width:390,height:844},3],['desktop',{width:1440,height:900},2]]) {
  const context=await browser.newContext({viewport,deviceScaleFactor:dpr});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/wayside-fury?gfx=3d`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__waysideFury);
  await page.getByRole('button',{name:/Begin adventure|Continue adventure/}).click();
  await page.evaluate(async()=>{
   const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');const {TRAINING_BOARD}=await import('/src/pages/WaysideFury/game/u1/combat/training.ts');
   const game=window.__waysideFury;game.mutate(s=>{enterScene(s,'hub');s.x=TRAINING_BOARD.x;s.y=TRAINING_BOARD.y;s.notice='';});game.setPaused(false);
  });
  await page.waitForFunction(()=>window.__waysideFury.state.contextAttack.target?.id==='training-board');
  await page.evaluate(()=>window.__waysideFury.setTouch({attack:true}));
  await page.waitForFunction(()=>window.__waysideFury.state.training);
  await page.evaluate(()=>window.__waysideFury.setTouch({attack:false}));
  await page.locator('.wf-training-progress').waitFor();
  await page.screenshot({path:`${output}/${name}-training.png`});
  await page.getByRole('button',{name:'Stop training'}).click();
  assert.equal(await page.evaluate(()=>window.__waysideFury.state.training),null);
  await page.evaluate(async()=>{
   const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');const game=window.__waysideFury;
   game.mutate(s=>{enterScene(s,'dungeon',0,'moon-m01');s.enemies=[];for(const h of Object.values(s.heroes))h.ki=h.maxKi;s.notice='';});
  });
  await page.locator('.wf-fusion-control button').click();
  await page.waitForFunction(()=>window.__waysideFury.state.fusion.world.forms.length===1);
  await page.screenshot({path:`${output}/${name}-fusion.png`});
  const data=await page.evaluate(()=>{const game=window.__waysideFury;const c=document.querySelector('canvas[aria-label="Wayside Fury action RPG"]');return {form:game.state.fusion.world.forms[0],ki:game.state.heroes[game.state.active].ki,renderer:c?.dataset.renderer,canvasWidth:c?.width,cssWidth:c?.getBoundingClientRect().width,dpr:devicePixelRatio};});
  assert.equal(data.form.mode,'solo');assert.ok(data.ki<5);assert.equal(data.renderer,'2d');assert.ok(data.canvasWidth>=data.cssWidth*data.dpr-.1,'native DPR');
  await page.evaluate(()=>window.__waysideFury.setTouch({ki:true}));
  await page.waitForFunction(()=>window.__waysideFury.state.charge>.1);
  await page.evaluate(()=>window.__waysideFury.setTouch({ki:false}));
  await page.waitForFunction(()=>window.__waysideFury.state.fusion.world.forms[0].specialUsed);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(`U1 combat browser: phone/desktop training, fusion, native DPR and 3D fallback pass. Screenshots: ${output}`);
} finally {await browser.close();}
