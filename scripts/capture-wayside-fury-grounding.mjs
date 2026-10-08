// Native-DPR presentation fixtures. Blast intentionally shares Canvas in optional 3D.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const phase=process.argv[2]??'after';assert.ok(['before','after'].includes(phase));
const mod=process.env.FURY_PLAYWRIGHT_MODULE??'playwright';
const {chromium}=await import(mod.startsWith('/')?pathToFileURL(mod).href:mod);
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--mute-audio','--use-angle=metal','--enable-gpu']});
const output=new URL('../docs/wayside-fury-design/grounding/',import.meta.url);await mkdir(output,{recursive:true});
const metrics=[];
try {
 for(const mode of ['2d','3d']) {
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2,reducedMotion:'reduce'});
 page.setDefaultTimeout(180000);
 const base=process.env.FURY_BASE_URL??'http://127.0.0.1:5220';
 await page.route(`${base}/`,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
 await page.goto(`${base}/?gfx=${mode}`);
 await page.evaluate(async mode=>{
 const [{GraphicsRenderer},world,sim]=await Promise.all([import('/src/pages/WaysideFury/game/graphics.ts'),import('/src/pages/WaysideFury/game/world.ts'),import('/src/pages/WaysideFury/game/sim.ts')]);
 document.body.innerHTML='<canvas></canvas>';document.body.style.cssText='margin:0;background:#191e29';
 const style=document.createElement('style');style.textContent='canvas{position:absolute;inset:0;width:1440px;height:900px}';document.head.append(style);
 const canvas=document.querySelector('canvas'),g=new GraphicsRenderer(canvas,mode);
 window.fixture={g,world,sim,canvas};await Promise.all([...g.flat.images.values()].map(i=>i.decode().catch(()=>{})));
 },mode);
 const scenes=process.env.FURY_GROUND_CAPTURE==='chapters'?[['woods-ground','dungeon',0],['city-ground','dungeon',0]]:[['scorched-road','dungeon',0],['rift-approach','dungeon',6],['watchers-hollow','dungeon',7],['overworld-crater','overworld',0],['moon-rocks','dungeon',0]].filter(([name])=>process.env.FURY_GROUND_CAPTURE==='overworld'?name==='overworld-crater':true);
 for(const [name,scene,room]of scenes) {
 await page.evaluate(({scene,room,name})=>{
 const f=window.fixture,s=f.sim.newGame();f.sim.enterScene(s,scene,room);
 if(name==='woods-ground')f.sim.enterScene(s,'dungeon',0,'woods-layby');
 if(name==='city-ground')f.sim.enterScene(s,'dungeon',0,'city-boulevard');
 if(name==='moon-rocks')f.sim.enterScene(s,'dungeon',0,'moon-m01');
 const m=f.world.getWorld(s.scene,s.room,s.mapId);s.x=m.width/2;s.y=m.height/2;
 if(name==='overworld-crater'){const p=m.props.find(p=>p.kind==='crater');s.x=p.x+p.w/2;s.y=p.y+p.h/2;}
 s.notice='';s.dialogue=null;s.moving=false;f.s=s;f.g.reset();f.g.flat.qualityCap=Infinity;f.g.flat.resize();f.before=JSON.stringify(s);f.g.draw(s,0,0);
 },{scene,room,name});
 if(mode==='3d'&&['overworld-crater','moon-rocks'].includes(name))await page.waitForFunction(()=>{const f=window.fixture;f.g.draw(f.s,0,0);return f.canvas.dataset.gfx==='3d';},{},{timeout:180000});
 await page.evaluate(()=>{const f=window.fixture;for(let i=0;i<12;i++)f.g.draw(f.s,0,0);f.g.flat.transition=0;f.g.draw(f.s,0,0);});
 const metric=await page.evaluate(()=>{const f=window.fixture,c=f.canvas.dataset.gfx==='3d'?document.querySelector('.wf-canvas-3d'):f.canvas;return {immutable:f.before===JSON.stringify(f.s),active:f.canvas.dataset.gfx,dpr:c.dataset.renderDpr,width:c.width,height:c.height};});
 assert.ok(metric.immutable);assert.equal(Number(metric.dpr),2);assert.equal(metric.width,2880);assert.equal(metric.height,1800);
 assert.equal(metric.active,['overworld-crater','moon-rocks'].includes(name)?mode:'2d');
 if(phase==='after'&&mode==='3d'&&name==='overworld-crater'){
   metric.bowl=await page.evaluate(async()=>{
     const f=window.fixture,{createOverworldElevation}=await import('/src/pages/WaysideFury/game/terrain3d.ts');
     const p=f.world.OVERWORLD.props.find(p=>p.kind==='crater'),x=p.x+p.w/2,z=p.y+p.h/2;
     return {base:createOverworldElevation(f.world.OVERWORLD).heightAt(x,z),surface:f.g.depth.terrain.heightAt(x,z)};
   });
   assert.ok(metric.bowl.surface<metric.bowl.base-5,'real terrain depression below original ground');
 }
 await page.screenshot({path:new URL(`${phase}-${mode}-${name}.png`,output).pathname});if(phase==='after'&&mode==='3d'&&name==='overworld-crater'){
   metric.contextLoss=await page.evaluate(()=>{
     const f=window.fixture;document.querySelector('.wf-canvas-3d').dispatchEvent(new Event('webglcontextlost',{cancelable:true}));f.g.draw(f.s,0,0);
     return {active:f.canvas.dataset.gfx,status:f.canvas.dataset.gfxStatus,immutable:f.before===JSON.stringify(f.s)};
   });
   assert.deepEqual(metric.contextLoss,{active:'2d',status:'fallback',immutable:true});
 }
 metrics.push({phase,mode,name,...metric});console.log(`${phase} ${mode} ${name}: ${metric.active}`);
 }
 await page.evaluate(()=>window.fixture.g.dispose());await page.close();
 }
 await writeFile(new URL(`${phase}${process.env.FURY_GROUND_CAPTURE?'-'+process.env.FURY_GROUND_CAPTURE:''}-metrics.json`,output),JSON.stringify(metrics,null,2)+'\n');
}finally{await browser.close();}
