import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.FURY_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({headless:true,args:['--no-sandbox','--mute-audio','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const matrix = process.env.FURY_UX_PHONE_3D_ONLY ? [[390,844,3,'?gfx=3d']] : [[390,844,3,''],[1440,900,2,''],[390,844,3,'?gfx=3d']];
 for(const [width,height,dpr,gfx] of matrix) {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:width<500,isMobile:width<500});
  const page=await context.newPage(), errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5225'}/wayside-fury${gfx}`);
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('HUD size',{exact:true}).fill('1.3');await page.getByLabel('Text size',{exact:true}).fill('1.5');
  await page.getByLabel('Haptics',{exact:true}).uncheck();
  await page.getByText('Keyboard bindings',{exact:true}).click();await page.getByLabel('Key for right',{exact:true}).focus();await page.keyboard.press('r');
  await page.getByLabel('Key for right',{exact:true}).blur();
  await page.reload();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  assert.equal(await page.getByLabel('HUD size',{exact:true}).inputValue(),'1.3');
  assert.equal(await page.getByLabel('Text size',{exact:true}).inputValue(),'1.5');
  assert.equal(await page.getByLabel('Haptics',{exact:true}).isChecked(),false);
  await page.getByRole('button',{name:/Begin adventure|Continue adventure/}).click();
  await page.getByRole('button',{name:'Skip prologue',exact:true}).click();
  await page.getByRole('region',{name:'Guided opening'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__waysideFury.state.opening.stage),0);
  const before=await page.evaluate(()=>window.__waysideFury.state.x);await page.keyboard.down('r');await page.waitForFunction(x=>window.__waysideFury.state.x>x+5,before);await page.keyboard.up('r');
  if(width<500){await page.evaluate(()=>window.__waysideFury.setTouch({}));await page.locator('.wf-touch-dock').waitFor();
   const rects=await page.locator('.wf-touch-btn').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,label:el.textContent};}));
   for(const r of rects){assert.ok(r.w>=44&&r.h>=44);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=width&&r.y+r.h<=height);assert.ok(r.label.trim().length>0);}
   for(let i=0;i<rects.length;i++)for(const b of rects.slice(i+1)){const a=rects[i];assert.ok(a.x+a.w+8<=b.x||b.x+b.w+8<=a.x||a.y+a.h+8<=b.y||b.y+b.h+8<=a.y,'action targets spaced apart');}
   await page.screenshot({path:`work/ux-opening-${width}-${gfx?'3d':'2d'}.png`});
  }
  await page.getByRole('button',{name:'Skip practice',exact:true}).click();
  await page.waitForFunction(()=>!window.__waysideFury.state.opening);
  await page.evaluate(async()=>{const {itemsState}=await import('/src/pages/WaysideFury/game/u1/items/chips.ts');window.__waysideFury.mutate(s=>{s.scene='overworld';s.mapId='overworld';s.x=500;s.y=480;s.enemies=[];s.film=null;s.dialogue=null;s.overlay=null;itemsState(s).radar.owned=true;itemsState(s).radar.enabled=true;});});
  if(gfx)await page.waitForFunction(()=>document.querySelector('.wf-stage canvas[data-gfx="3d"]'));
  await page.keyboard.down('r');await page.waitForFunction(()=>document.querySelector('.wf-shell').classList.contains('wf-driving-straight'));assert.equal(await page.locator('.wf-minimap-wrap').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  await page.keyboard.down('s');await page.waitForFunction(()=>!document.querySelector('.wf-shell').classList.contains('wf-driving-straight'));await page.keyboard.up('s');await page.keyboard.up('r');
  await page.waitForFunction(()=>Math.hypot(window.__waysideFury.state.vx,window.__waysideFury.state.vy)<20);
  assert.equal(await page.locator('.wf-minimap-wrap').evaluate(el=>getComputedStyle(el).visibility),'visible');
  const native=await page.locator(gfx ? '.wf-canvas-3d' : '.wf-stage canvas[data-renderer="2d"]').evaluate(el=>({w:el.width,h:el.height,cw:el.clientWidth,ch:el.clientHeight,dpr:Number(el.dataset.renderDpr)}));
  assert.ok(Math.abs(native.w-native.cw*dpr)<=2,'native DPR width');assert.ok(Math.abs(native.h-native.ch*dpr)<=2,'native DPR height');
  await page.reload();await page.getByRole('button',{name:'Continue adventure',exact:true}).click();await page.waitForFunction(()=>window.__waysideFury.state.scene!=='prologue');
  assert.equal(await page.evaluate(()=>!!window.__waysideFury.state.opening),false,'skipped opening stays skipped');
  assert.deepEqual(errors,[]);console.log(`UX passes: ${width}x${height} DPR${dpr} ${gfx||'2D'}: saved settings, key remap, course entry/skip, touch targets, driving navigation, native DPR.`);await context.close();
 }
}finally{await browser.close();}
