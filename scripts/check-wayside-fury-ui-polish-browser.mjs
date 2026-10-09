import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.FURY_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE).href : 'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({...(process.env.FURY_CHROMIUM_EXECUTABLE ? { executablePath: process.env.FURY_CHROMIUM_EXECUTABLE } : {}),headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
for(const viewport of [{width:390,height:844},{width:1440,height:900}])for(const gfx of ['2d','3d']) {
 const page=await browser.newPage({viewport,deviceScaleFactor:viewport.width===390?3:2});page.setDefaultTimeout(120000);console.log(`Checking ${viewport.width} ${gfx}`);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('wayside-fury-controls-dismissed','1'));
 await page.goto(`${process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5173'}/wayside-fury?gfx=${gfx}`,{waitUntil:'commit'});await page.waitForFunction(()=>window.__waysideFury&&!document.querySelector('.wf-primary').disabled);
 await page.locator('.wf-primary').click();
 await page.evaluate(async gfx=>{const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(s=>{enterScene(s,gfx==='3d'?'overworld':'hub');s.dialogue=null;s.enemies=[];});},gfx);
 if(gfx==='3d') { await page.waitForFunction(()=>document.querySelector('.wf-stage canvas').dataset.gfx==='3d'); await page.evaluate(()=>window.__waysideFury.setPresentationSuspended(true)); }
 await page.locator('.wf-minimap').waitFor();
 const small=await page.locator('.wf-minimap').boundingBox();assert.ok(small.width<=112);assert.ok(small.y>=await page.locator('.wf-hud').evaluate(el=>el.getBoundingClientRect().bottom));
 await page.locator('.wf-minimap').click();await page.locator('.wf-full-map').waitFor();
 assert.equal(await page.locator('.wf-modal-layer').evaluate(el=>el.getBoundingClientRect().width),viewport.width);
 await page.getByRole('button',{name:'Close map · M'}).click();
 await page.evaluate(()=>window.__waysideFury.mutate(s=>{s.overlay='arena';}));
 await page.getByText('Step into the ring.').waitFor();
 const panel=page.locator('.wf-arena-panel');const rect=await panel.boundingBox();
 if(viewport.width===390) assert.deepEqual(rect,{x:0,y:0,width:390,height:844});
 else {assert.ok(rect.x>0);assert.ok(Math.abs(rect.x+rect.width/2-720)<1);}
 assert.equal(await panel.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(17, 39, 49)');
 assert.equal(await page.locator('.wf-scene-surface').evaluate(el=>!!el.closest('[inert]')),true);
 const button=page.getByRole('button',{name:'Continue to Wayside'});await button.scrollIntoViewIfNeeded();await button.click();await panel.waitFor({state:'detached'});
 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.getByRole('button',{name:'Character',exact:true}).click();await page.locator('.wf-character').waitFor();
 await page.getByRole('button',{name:'Back to pause'}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByText('North up · 2D and 3D').waitFor();
 assert.deepEqual(errors,[]);console.log(`${viewport.width}x${viewport.height} DPR${viewport.width===390?3:2} ${gfx}: minimap placement/expand, Tournament coverage/opacity, scrolling, inert backdrop, character and settings passed`);await page.close();
}
}finally{await browser.close();}
