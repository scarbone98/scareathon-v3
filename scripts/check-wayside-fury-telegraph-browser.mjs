// Real Canvas regression for every authored enemy body; Chromium is muted.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from './wayside-fury-muted-playwright.mjs';
const output='docs/wayside-fury-design/telegraph/after';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--mute-audio']});
try {
 const page=await browser.newPage();
 await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5219'}/wayside-fury`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__waysideFury);
   const tells=await page.evaluate(async()=>{
    const {drawWoodsBody,drawWoodsHazard}=await import('/src/pages/WaysideFury/game/renderWoods2d.ts');
    const {drawCityEnemy}=await import('/src/pages/WaysideFury/game/chapters/ch4Art.ts');
    const {drawLunarBody}=await import('/src/pages/WaysideFury/game/renderSpace2d.ts');
    const game=window.__waysideFury,s={...game.state,time:0,enemies:[]},results=[];
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const c=canvas.getContext('2d');
    const sheet=document.createElement('canvas');sheet.width=480;sheet.height=2048;const g=sheet.getContext('2d');g.fillStyle='#142236';g.fillRect(0,0,480,2048);g.fillStyle='#f2dcad';g.font='14px sans-serif';for(const [n,label] of ['Idle','Long countdown','Final 250 ms'].entries())g.fillText(label,n*160+12,22);
    for(const [field,draw,behaviors] of [['woodsBehavior',drawWoodsBody,['rooted','lantern','wisp','bailiff','foreman']],['behavior',drawCityEnemy,['cable-rat','neon-imp','turnstile','clockwolf','switchmaster','architect']],['behavior',drawLunarBody,['rat','walker','echo','satellite','scout','inspector','warden']]])for(const behavior of behaviors) {
     const e={x:128,y:160,hp:100,maxHp:100,radius:12,kind:'boss',phase:1,actionTimer:0,hitTimer:0,aimX:0,aimY:1,[field]:behavior};
     function pixels(windup){c.clearRect(0,0,256,256);draw(c,{...e,windup},s);return c.getImageData(0,0,256,256).data;}
     const early=pixels(1),later=pixels(.8),tell=pixels(.2);let earlyDiff=0,tellDiff=0;for(let n=0;n<early.length;n++){earlyDiff+=early[n]!==later[n];tellDiff+=early[n]!==tell[n];}
     for(const [col,windup] of [0,1,.2].entries()){pixels(windup);const row=results.length;g.drawImage(canvas,col*160-48,row*112-52);g.fillStyle='#f2dcad';g.font='11px sans-serif';g.fillText(behavior,col*160+8,row*112+34);}
     results.push({behavior,earlyDiff,tellDiff});
    }
    c.clearRect(0,0,256,256);
    const hazard={hp:1,woodsBehavior:'lantern',windup:.2,actionTimer:2,x:128,y:128,tellX:160,tellY:160};
    drawWoodsHazard(c,hazard);const hidden=c.getImageData(0,0,256,256).data.every(v=>v===0);
    drawWoodsHazard(c,{...hazard,windup:0});const visible=c.getImageData(0,0,256,256).data.some(v=>v!==0);
    return {results,hidden,visible,sheet:sheet.toDataURL('image/png').split(',')[1]};
   });
   for(const tell of tells.results){assert.equal(tell.earlyDiff,0,`${tell.behavior}: long countdown has no visual warning`);assert.ok(tell.tellDiff>0,`${tell.behavior}: brief body tell visible`);}
   assert.ok(tells.hidden&&tells.visible,'fire patch shown only after release');
   await writeFile(`${output}/body-tells-contact-sheet.png`,Buffer.from(tells.sheet,'base64'));delete tells.sheet;
   await writeFile(`${output}/body-tells.json`,JSON.stringify(tells,null,2)+'\n');
 console.log('All 18 authored bodies: no long wind-up warning, visible brief tell; released fire patch only.');
} finally {await browser.close();}
