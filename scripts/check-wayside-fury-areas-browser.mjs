import assert from 'node:assert/strict';
import {chromium} from './wayside-fury-muted-playwright.mjs';
const browser=await chromium.launch({headless:true,...(process.env.FURY_CHROMIUM_PATH?{executablePath:process.env.FURY_CHROMIUM_PATH}:{}),args:['--mute-audio']});
const errors=[];
try {
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3});
 await context.addInitScript(()=>{const getContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return String(type).includes('webgl')?null:getContext.call(this,type,...args);};});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5218'}/wayside-fury?gfx=3d`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__waysideFury);
 await page.getByRole('button',{name:/Begin adventure|Continue adventure/}).click();
 await page.evaluate(async()=>{const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');const game=window.__waysideFury;game.mutate(s=>{enterScene(s,'overworld');s.x=520;s.y=405;s.sceneTimer=4;});game.setPaused(false);});
 await page.waitForFunction(()=>document.querySelector('canvas[aria-label="Wayside Fury action RPG"]').dataset.gfxStatus==='fallback');
 await page.waitForFunction(()=>window.__waysideFury.state.contextAttack.displayed.targetId==='interior-diner-door');await page.keyboard.down('j');await page.waitForFunction(()=>window.__waysideFury.state.mapId==='interior-diner');
 await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.__waysideFury.state.mapId),'interior-diner','held use never bounces through the exit mat');await page.keyboard.up('j');await page.waitForFunction(()=>!window.__waysideFury.state.previousInput.attack);
 await page.evaluate(()=>window.__waysideFury.mutate(s=>{s.x=216;s.y=152;}));await page.waitForFunction(()=>window.__waysideFury.state.contextAttack.displayed.targetId==='pickup-c1-diner');await page.keyboard.down('j');
 await page.waitForFunction(()=>window.__waysideFury.state.foundItems.includes('pickup-c1-diner'));
 await page.keyboard.up('j');await page.waitForFunction(()=>!window.__waysideFury.state.previousInput.attack);
 const candy=await page.evaluate(()=>window.__waysideFury.state.candy);
 await page.evaluate(()=>window.__waysideFury.mutate(s=>{s.x=224;s.y=304;}));await page.waitForFunction(()=>window.__waysideFury.state.contextAttack.displayed.targetId==='interior-diner-exit');await page.keyboard.down('j');await page.waitForFunction(()=>window.__waysideFury.state.mapId==='overworld');await page.keyboard.up('j');await page.waitForFunction(()=>!window.__waysideFury.state.previousInput.attack);
 await page.waitForFunction(()=>window.__waysideFury.state.contextAttack.displayed.targetId==='interior-diner-door');await page.keyboard.down('j');await page.waitForFunction(()=>window.__waysideFury.state.mapId==='interior-diner');await page.keyboard.up('j');await page.waitForFunction(()=>!window.__waysideFury.state.previousInput.attack);
 assert.equal(await page.evaluate(()=>window.__waysideFury.state.candy),candy);
 await page.evaluate(async()=>{const {makeSave}=await import('/src/pages/WaysideFury/game/save.ts');localStorage.setItem('wayside-fury-save',JSON.stringify(makeSave(window.__waysideFury.state,null)));});
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__waysideFury);await page.getByRole('button',{name:/Continue adventure/}).click();await page.waitForFunction(()=>window.__waysideFury.state.mapId==='interior-diner');
 assert.deepEqual(errors,[]);console.log('Areas browser: actual keyboard entry, held-button debounce, diner one-shot find, door return, reload resume and unavailable-WebGL 2D fallback pass.');
} finally {await browser.close();}
