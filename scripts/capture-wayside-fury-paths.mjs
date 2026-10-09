// Muted, paused native-DPR fixtures through the production graphics router.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const phase=process.argv[2]??'after';
const {chromium}=await import(pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE??'/Users/szaneer/hark-work/fury-capture/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true,args:['--mute-audio','--use-angle=metal','--enable-gpu']});
const output=`docs/wayside-fury-design/paths/${phase}`;await mkdir(output,{recursive:true});
const report=[];
try {
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,reducedMotion:'reduce'});
 const page=await context.newPage();page.setDefaultTimeout(240000);
 const base=process.env.FURY_BASE_URL??'http://localhost:5231';
 await page.route(`${base}/`,route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><body style="margin:0;background:#15242c"><div id="caption" style="height:64px;color:#eee4cf;font:600 18px system-ui;padding:12px 16px;box-sizing:border-box"></div><canvas style="width:390px;height:716px;display:block"></canvas><div style="color:#bbcecd;font:14px system-ui;padding:16px">Paused native DPR 3 · production renderer</div></body>'}));
 await page.goto(`${base}/`,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
  const [{GraphicsRenderer},sim,world]=await Promise.all([import('/src/pages/WaysideFury/game/graphics.ts'),import('/src/pages/WaysideFury/game/sim.ts'),import('/src/pages/WaysideFury/game/world.ts')]);
  const g=new GraphicsRenderer(document.querySelector('canvas'),'2d');
  window.fixture={g,sim,world};await Promise.all([...g.flat.images.values()].map(i=>i.decode().catch(()=>{})));
 });
 for(const gfx of ['2d','3d'])for(const [room,x,y]of [[0,320,192],[1,400,272],[2,320,192],[5,480,272]]) {
  const metric=await page.evaluate(({room,x,y,gfx})=>{
   const {g,sim,world}=window.fixture,s=sim.newGame(),m=world.BLAST_WORLDS[room];sim.enterScene(s,'dungeon',room);s.x=x;s.y=y;s.enemies=[];
   g.setGraphicsMode(gfx);g.reset();const before=JSON.stringify(s);g.draw(s,0,0);
   if(before!==JSON.stringify(s))throw Error('Ground rendering changed gameplay');
   const c=document.querySelector('canvas');document.querySelector('#caption').textContent=`${m.name} · ${gfx==='3d'?'?gfx=3d → shared 2D':'default 2D'}`;
   return {room,name:m.name,requested:gfx,active:c.dataset.gfx,width:c.width,height:c.height,dpr:Number(c.dataset.renderDpr),pixels:c.toDataURL()};
  },{room,x,y,gfx});
  assert.equal(metric.active,'2d');assert.equal(metric.width,1170);assert.equal(metric.height,2148);
  if(gfx==='3d')assert.equal(metric.pixels,report.find(m=>m.room===room&&m.requested==='2d').pixels,'Blast optional 3D must exactly match default 2D');
  await page.screenshot({path:`${output}/390x844-${gfx}-${metric.name.toLowerCase().replaceAll(' ','-')}.png`});
  report.push(metric);console.log(`${phase}: ${gfx} ${metric.name}`);
 }
 await context.close();
} finally {await writeFile(`${output}/metrics.json`,JSON.stringify(report.map(({pixels,...m})=>m),null,2));await browser.close();}
