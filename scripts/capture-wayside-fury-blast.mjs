// Whole-room native-detail fixtures using the production Canvas terrain/prop/actor paths.
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const phase=process.argv[2]??'after';assert.ok(['before','after'].includes(phase));
const modulePath=process.env.FURY_PLAYWRIGHT_MODULE??'playwright';
const {chromium}=await import(modulePath.startsWith('/')?pathToFileURL(modulePath).href:modulePath);
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{channel:'chrome'}),args:['--mute-audio']});
const output=new URL('../docs/wayside-fury-design/blast-after/',import.meta.url);await mkdir(output,{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 page.setDefaultTimeout(180000);
 const base=process.env.FURY_BASE_URL??'http://127.0.0.1:5216';
 await page.route(`${base}/`,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
 await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5216'}/`,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
  const [{Renderer},{TerrainCache},world,sim]=await Promise.all([import('/src/pages/WaysideFury/game/render.ts'),import('/src/pages/WaysideFury/game/terrain.ts'),import('/src/pages/WaysideFury/game/world.ts'),import('/src/pages/WaysideFury/game/sim.ts')]);
  document.body.innerHTML='<canvas style="width:1440px;height:900px;display:block"></canvas>';document.body.style.cssText='margin:0;background:#191e29';
  const canvas=document.querySelector('canvas'),renderer=new Renderer(canvas);
  window.blastFixture={renderer,terrain:new TerrainCache(),world,sim,canvas};
  await Promise.all([...renderer.images.values()].map(i=>i.decode().catch(()=>{})));
 });
 const metrics=[];
 for(let room=0;room<10;room++) {
  metrics.push(await page.evaluate(room=>{
   const {renderer:r,terrain,world,sim,canvas}=window.blastFixture,m=world.BLAST_WORLDS[room],s=sim.newGame();sim.enterScene(s,'dungeon',room);
   const before=JSON.stringify(s),c=canvas.getContext('2d'),scale=Math.min(1320/m.width,740/m.height),ox=(1440-m.width*scale)/2,oy=110;
   c.setTransform(2,0,0,2,0,0);c.fillStyle='#191e29';c.fillRect(0,0,1440,900);c.fillStyle='#eee4cf';c.font='600 28px system-ui';c.fillText(m.name,60,55);c.font='16px system-ui';c.fillStyle='#aab4ba';c.fillText('BLAST SITE · Whole-room Canvas 2D inspection · native DPR 2',60,83);
   c.save();c.translate(ox,oy);c.scale(scale,scale);terrain.draw(c,m,{x:0,y:0},m.width,m.height,0,2*scale,2);
   [...m.props.map(p=>({y:p.y+p.h,draw:()=>r.prop(p,0,s)})),...s.enemies.map(e=>({y:e.y,draw:()=>r.enemy(s,e)})),{y:s.y,draw:()=>r.hero(s)}].sort((a,b)=>a.y-b.y).forEach(a=>a.draw());
   c.restore();assertState();function assertState(){if(before!==JSON.stringify(s))throw Error('Rendering mutated simulation');}
   return {room,name:m.name,props:m.props.length,encounters:m.spawns.length,dpr:2,width:canvas.width,height:canvas.height};
  },room));
  await page.screenshot({path:new URL(`${phase}-${room}.png`,output).pathname});console.log(`${phase}: blast-${room}`);
  if(phase==='after') {
   const parity=await page.evaluate(async room=>{
    const {GraphicsRenderer}=await import('/src/pages/WaysideFury/game/graphics.ts');
    const {world,sim}=window.blastFixture,canvas=document.createElement('canvas');
    canvas.style.cssText='position:absolute;left:-2000px;top:0;width:1440px;height:900px';document.body.append(canvas);
    const g=new GraphicsRenderer(canvas,'2d'),s=sim.newGame();sim.enterScene(s,'dungeon',room);s.x=world.BLAST_WORLDS[room].width/2;
    await Promise.all([...g.flat.images.values()].map(i=>i.decode().catch(()=>{})));
    const state=JSON.stringify(s);g.draw(s,0,0);const flat=canvas.toDataURL();g.setGraphicsMode('3d');g.reset();g.draw(s,0,0);
    const result={equal:flat===canvas.toDataURL(),renderer:canvas.dataset.renderer,immutable:state===JSON.stringify(s),width:canvas.width,height:canvas.height};g.dispose();canvas.remove();return result;
   },room);
   assert.ok(parity.equal&&parity.immutable,`blast-${room}: optional 3D exactly matches 2D without changing state`);assert.equal(parity.renderer,'2d');assert.equal(parity.width,2880);assert.equal(parity.height,1800);metrics.at(-1).parity=parity;
  }
 }
 await writeFile(new URL(`${phase}-metrics.json`,output),JSON.stringify(metrics,null,2));
} finally {await browser.close();}
