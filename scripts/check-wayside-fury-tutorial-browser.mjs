import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.FURY_PLAYWRIGHT_MODULE?pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--mute-audio','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir('work/tutorial',{recursive:true});
try {
 for(const [name,width,height,dpr,gfx] of [['phone-2d',390,844,3,'2d'],['phone-3d',390,844,3,'3d'],['desktop-2d',1440,900,2,'2d']]) {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:width<500,isMobile:width<500});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5224'}/wayside-fury?gfx=${gfx}`);
  await page.getByRole('button',{name:/Begin adventure|Continue adventure/}).click();
  await page.getByRole('button',{name:'Skip prologue',exact:true}).click();
  const choice=page.getByRole('dialog',{name:'Tutorial choice'});await choice.waitFor();
  assert.equal(await page.evaluate(()=>!!window.__waysideFury.state.opening),false);
  for(const button of await choice.getByRole('button').all()) {const r=await button.boundingBox();assert.ok(r.height>=44&&r.width>=44&&r.x>=0&&r.x+r.width<=width&&r.y+r.height<=height);}
  await page.screenshot({path:`work/tutorial/${name}-choice.png`});
  if(width>500) {
   await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Skip');
   // Exercise the game's normal gamepad navigation and A confirmation.
   await page.evaluate(()=>{window.__pad={index:0,connected:true,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__pad]});window.dispatchEvent(new Event('gamepadconnected'));window.__pad.buttons[0]={pressed:true,value:1};});
  } else await choice.getByRole('button',{name:'Skip',exact:true}).click();
  await choice.waitFor({state:'detached'});
  await page.evaluate(()=>{if(window.__pad)window.__pad.buttons[0]={pressed:false,value:0};});
  assert.equal(await page.evaluate(()=>window.__waysideFury.state.scene),'overworld');
  assert.equal(await page.locator('.wf-play-band').count(),1);assert.equal(await page.locator('.wf-minimap-wrap').count(),1);
  if(gfx==='2d'){await page.reload();await page.getByRole('button',{name:/Continue adventure/}).click();}
  console.log(`${name}: saved skip and HUD checked`);
  assert.equal(await choice.count(),0,'choice is saved');
  const beforeReplay=await page.evaluate(()=>({scene:window.__waysideFury.state.scene,mapId:window.__waysideFury.state.mapId,candy:window.__waysideFury.state.candy}));
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Replay tutorial',exact:true}).click();
  await page.getByRole('region',{name:'Guided opening'}).waitFor();console.log(`${name}: replay entered`);
  assert.equal(await page.evaluate(()=>window.__waysideFury.state.scene),'test');assert.equal(await page.evaluate(()=>window.__waysideFury.state.mapId),'training');
  if(gfx==='3d')await page.waitForFunction(()=>document.querySelector('canvas[data-gfx="3d"]')?.dataset.gfxStatus==='ready' && document.querySelector('.wf-canvas-3d')?.style.visibility==='visible');
  assert.equal(await page.evaluate(()=>window.__waysideFury.state.enemies[0].sprite),'zombie');
  for(const stage of [0,1,3,4]) {
   await page.evaluate(async stage=>{const {tickOpening}=await import('/src/pages/WaysideFury/game/opening.ts');window.__waysideFury.mutate(s=>{if(stage===3||stage===4){s.opening.stage=stage-1;s.x=stage===3?150:168;if(stage===4)s.opening.hits=1;tickOpening(s,0);}else s.opening.stage=stage;s.x=stage===1?90:stage===3?168:stage===4?195:55;s.y=110;});},stage);
   await page.waitForTimeout(150);await page.screenshot({path:`work/tutorial/${name}-stage-${stage}.png`});
  }
  await page.getByRole('button',{name:'Skip practice',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>({scene:window.__waysideFury.state.scene,mapId:window.__waysideFury.state.mapId,candy:window.__waysideFury.state.candy})),beforeReplay,'replay restores progress');
  assert.deepEqual(errors,[]);console.log(`${name}: choice, saved skip, HUD, keyboard/gamepad, replay and original mobs pass`);await context.close();
 }
 // The Play action is independent of Replay and persists the choice immediately.
 const context=await browser.newContext();const page=await context.newPage();await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5224'}/wayside-fury`);await page.getByRole('button',{name:/Begin adventure/}).click();await page.getByRole('button',{name:'Skip prologue'}).click();await page.getByRole('button',{name:'Play tutorial',exact:true}).click();await page.getByRole('region',{name:'Guided opening'}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('wayside-fury-opening-choice')),'play');await context.close();
}finally{await browser.close();}
