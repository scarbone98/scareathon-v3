import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.FURY_PLAYWRIGHT_MODULE?pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--mute-audio','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const output='work/fury-feel';await mkdir(output,{recursive:true});const report=[];
try {
 for(const [name,width,height,dpr,gfx] of [['phone-2d',390,844,3,'2d'],['phone-3d',390,844,3,'3d'],['desktop-2d',1440,900,2,'2d']]) {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:width<500,isMobile:width<500});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__vibrations=[];Object.defineProperty(navigator,'vibrate',{configurable:true,value:n=>{window.__vibrations.push(n);return true;}});});
  await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5224'}/wayside-fury?gfx=${gfx}`);
  await page.waitForFunction(()=>window.__waysideFury&&!document.querySelector('.wf-primary')?.disabled,{},{timeout:90000});
  await page.locator('.wf-primary').click();
  await page.getByRole('button',{name:'Skip prologue',exact:true}).click();
  await page.getByRole('button',{name:'Skip',exact:true}).click();
  await page.evaluate(async()=>{const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');const game=window.__waysideFury;game.mutate(s=>{delete s.opening;enterScene(s,'overworld');s.x=500;s.y=480;s.enemies=[];});});
  if(gfx==='3d')await page.waitForFunction(()=>document.querySelector('canvas[data-gfx="3d"]'),{},{timeout:120000});
  await page.locator('.wf-chapter-goal').waitFor({state:'visible'});assert.match(await page.locator('.wf-chapter-goal').innerText(),/Next unlock:.*Woods/);
  const haptics=await page.evaluate(()=>{const g=window.__waysideFury;g.ux.haptics=true;g.mutate(s=>s.events.push({type:'hit',x:s.x,y:s.y,damage:20,target:'hero'},{type:'pickup',kind:'candy',x:s.x,y:s.y}));const enabled=window.__vibrations.length;g.ux.haptics=false;g.mutate(s=>s.events.push({type:'hit',x:s.x,y:s.y,damage:20,target:'hero'}));return {enabled,total:window.__vibrations.length};});
  assert.equal(haptics.enabled,2);assert.equal(haptics.total,2);
  await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');
  const road=await page.evaluate(async()=>{const {onRoad}=await import('/src/pages/WaysideFury/game/roadNetwork.ts');const {getWorld}=await import('/src/pages/WaysideFury/game/world.ts');const s=window.__waysideFury.state;return onRoad(getWorld(s.scene,s.room,s.mapId),s.x,s.y,-19);});assert.ok(road);
  const timing=await page.evaluate(async()=>{const samples=[];let last=performance.now();for(let n=0;n<20;n++) {const now=await new Promise(requestAnimationFrame);samples.push(now-last);last=now;}samples.sort((a,b)=>a-b);return {medianMs:samples[10],p95Ms:samples[19]};});
  const finalState=await page.evaluate(()=>({scene:window.__waysideFury.state.scene,gfx:document.querySelector('canvas[data-renderer="2d"]').dataset.gfx}));
  assert.equal(finalState.scene,'overworld');assert.equal(finalState.gfx,gfx);await page.locator('.wf-chapter-goal').waitFor({state:'visible'});
  await page.screenshot({path:`${output}/${name}.png`});
  assert.deepEqual(errors,[]);report.push({name,haptics,road,timing});console.log(name,JSON.stringify(report.at(-1)));
  await context.close();
 }
 await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
}finally{await browser.close();}
