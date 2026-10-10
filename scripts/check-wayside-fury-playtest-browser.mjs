import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(process.env.FURY_PLAYWRIGHT_MODULE?pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--mute-audio','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const output=process.env.FURY_LAYOUT_SHOTS??'work/playtest-layout';await mkdir(output,{recursive:true});const report=[];
try {
 for(const [name,width,height,dpr,gfx] of [['phone-2d',390,844,3,'2d'],['phone-3d',390,844,3,'3d'],['desktop-2d',1440,900,2,'2d']].filter(c=>!process.env.FURY_LAYOUT_CASE||c[0]===process.env.FURY_LAYOUT_CASE)) {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:width<500,isMobile:width<500});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5224'}/wayside-fury?gfx=${gfx}`);
  await page.getByRole('button',{name:/Begin adventure/}).click();await page.getByRole('button',{name:'Skip prologue',exact:true}).click();await page.getByRole('button',{name:'Play tutorial',exact:true}).click();
  await page.getByRole('region',{name:'Guided opening'}).waitFor();
  if(gfx==='3d')await page.waitForFunction(()=>window.__waysideFury.renderer.depth&&document.querySelector('canvas[aria-label="Wayside Fury action RPG"]').dataset.gfx==='3d');
  await page.evaluate(()=>{const g=window.__waysideFury;g.setPaused(true);cancelAnimationFrame(g.raf);});
  const signature=()=>page.evaluate(()=>{
   const g=window.__waysideFury.renderer,r=g.depth??g.flat,v=r.viewport;
   return {zoom:v.zoom,width:v.width,height:v.height,fov:r.camera.fov??null,angle:r.camera.quaternion?.toArray()??null};
  });
  const tutorialSignature=await signature();
  for(const stage of [0,1,2,3,4,5]) {
   await page.evaluate(async stage=>{
    const {COURSE,tickOpening}=await import('/src/pages/WaysideFury/game/opening.ts'),g=window.__waysideFury;
    g.mutate(s=>{s.enemies=[];s.opening.stage=stage;s.opening.hits=0;s.x=COURSE.x+([55,90,105,168,195,260][stage]);s.y=COURSE.y+110;
     if(stage===3||stage===4){s.opening.stage=stage-1;if(stage===3)s.x=COURSE.x+150;else s.opening.hits=1;tickOpening(s,0);s.x=COURSE.x+(stage===3?168:195);}
    });
    // Reuse real original targets for the first combat beat.
    if(stage<2){const {addEnemy}=await import('/src/pages/WaysideFury/game/sim.ts');g.mutate(s=>{const e=addEnemy(s,'grunt',COURSE.x+100,COURSE.y+110);e.speed=0;e.hp=e.maxHp=6;s.opening.targetId=e.id;});}
    g.renderer.reset();g.renderer.draw(g.state,0);
   },stage);
   await page.waitForTimeout(200);
   await page.evaluate(()=>{const g=window.__waysideFury;g.renderer.flat.transition=0;g.renderer.draw(g.state,0);});
   const bounds=await page.evaluate(async()=>{
    const g=window.__waysideFury,s=g.state,r=g.renderer.depth??g.renderer.flat,actors=[{id:'hero',x:s.x,y:s.y},...s.enemies.filter(e=>e.hp>0)];
    if(!g.renderer.depth)return actors.map(a=>({id:a.id,left:r.project(a.x-12,a.y).x,right:r.project(a.x+12,a.y).x,top:r.project(a.x,a.y-32).y,bottom:r.project(a.x,a.y+2).y}));
    const {Vector3}=await import('/node_modules/three/build/three.module.js');
    return actors.map(a=>{const points=[];for(const dx of [-12,12])for(const h of [0,32]){const p=new Vector3(a.x+dx,r.terrain.heightAt(a.x,a.y)+h,a.y).project(r.camera);points.push({x:(p.x+1)/2,y:(1-p.y)/2});}return {id:a.id,left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};});
   });
   for(const a of bounds)assert.ok(a.left>=.02&&a.right<=.98&&a.top>=.02&&a.bottom<=.98,`${name}/stage-${stage}: ${JSON.stringify(a)}`);
   report.push({name,stage,bounds});
   if([0,3,4].includes(stage))await page.screenshot({path:`${output}/${name}-tutorial-${stage}.png`});
  }
  await page.evaluate(async()=>{const {finishOpening}=await import('/src/pages/WaysideFury/game/opening.ts');window.__waysideFury.mutate(s=>{finishOpening(s,true);s.sceneTimer=10;s.prologueExit=undefined;s.x=800;s.y=480;});window.__waysideFury.renderer.reset();window.__waysideFury.renderer.draw(window.__waysideFury.state,0);});
  if(gfx==='3d')await page.waitForFunction(()=>window.__waysideFury.renderer.depth?.world.id==='overworld');
  await page.evaluate(()=>{const g=window.__waysideFury;g.renderer.draw(g.state,0);});await page.waitForTimeout(200);const gameplaySignature=await signature();
  assert.equal(tutorialSignature.zoom,gameplaySignature.zoom);assert.equal(tutorialSignature.fov,gameplaySignature.fov);assert.equal(tutorialSignature.width,gameplaySignature.width);assert.equal(tutorialSignature.height,gameplaySignature.height);
  if(gfx==='3d')for(let i=0;i<4;i++)assert.ok(Math.abs(tutorialSignature.angle[i]-gameplaySignature.angle[i])<1e-6,'same 3D angle');
  // Exercise the same eased follow with the same 24-unit displacement in each map.
  const follow=()=>page.evaluate(()=>{const g=window.__waysideFury,s=g.state,r=g.renderer.depth??g.renderer.flat;g.renderer.reset();r.draw(s,0);const before=r.camera.position?.x??r.camera.x;s.x+=24;r.draw(s,1/60);return (r.camera.position?.x??r.camera.x)-before;});
  const normalFollow=await follow();
  for(const [spot,x,y] of [['diner-mailbox',530,480],['station-tower',336,704],['causeway-west',480,915],['causeway-east',1060,950],['farmhouse',1456,1150]]) {
   await page.evaluate(({x,y})=>{window.__waysideFury.mutate(s=>{s.x=x;s.y=y;s.notice='';});window.__waysideFury.renderer.reset();window.__waysideFury.renderer.flat.transition=0;window.__waysideFury.renderer.draw(window.__waysideFury.state,0);},{x,y});await page.waitForTimeout(200);
   const position=await page.evaluate(()=>{const g=window.__waysideFury;g.renderer.flat.transition=0;g.renderer.draw(g.state,0);return {x:g.state.x,y:g.state.y,cam:g.renderer.depth?{x:g.renderer.depth.target.x,y:g.renderer.depth.target.z}:{x:g.renderer.flat.camera.x+g.renderer.flat.viewport.width/2,y:g.renderer.flat.camera.y+g.renderer.flat.viewport.height/2}};});
   assert.equal(position.x,x);assert.equal(position.y,y);assert.ok(Math.hypot(position.cam.x-x,position.cam.y-y)<80,`camera follows screenshot ${spot}`);report.push({name,spot,position});await page.screenshot({path:`${output}/${name}-${spot}.png`});
  }
  if(name==='desktop-2d') {
   const pixels=await page.evaluate(async()=>{
    const {houseStyle}=await import('/src/pages/WaysideFury/game/houseVariants.ts');
    const {drawBlastProp}=await import('/src/pages/WaysideFury/game/blastArt.ts');
    const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=1120;canvas.id='house-variant-gallery';canvas.style.cssText='position:fixed;inset:0;z-index:99999;width:1440px;height:1120px;background:#203132';document.body.append(canvas);
    const r=window.__waysideFury.renderer.flat,previous=r.ctx,c=canvas.getContext('2d');r.ctx=c;c.fillStyle='#203132';c.fillRect(0,0,1440,1120);c.fillStyle='#ead198';c.font='24px system-ui';c.fillText('Wayside Fury · existing house parts · six variants per biome',24,36);
    const hashes=[];
    try {for(const [row,biome] of ['town','woods','blast','city','moon'].entries()) {
     c.fillStyle='#ead198';c.font='20px system-ui';c.fillText(biome,24,76+row*208);const group=[];
     for(let variant=0;variant<6;variant++) {
      const p={id:`gallery-${biome}-${variant}`,kind:biome==='blast'?'ruin-house':'home',x:32+variant*236,y:row*208+92,w:176,h:104,house:{biome,variant,mirrored:variant%2===1}};
      const style=houseStyle(p);p.w=Math.round(p.w*style.width);p.h=Math.round(p.h*style.height);
      if(biome==='blast')drawBlastProp(c,p);else r.worldBuilding(p,0);
      let hash=2166136261;for(const value of c.getImageData(variant*236,row*208+80,232,126).data)hash=Math.imul(hash^value,16777619);group.push(hash>>>0);
      c.fillStyle='#c2b28b';c.font='14px system-ui';c.fillText(`Variant ${variant+1}${p.house.mirrored?' · mirrored':''}`,32+variant*236,row*208+220);
     }hashes.push({biome,hashes:group});
    }}finally{r.ctx=previous;}return hashes;
   });
   for(const p of pixels)assert.equal(new Set(p.hashes).size,6,`${p.biome}: six visibly distinct rendered variants`);
   await page.locator('#house-variant-gallery').screenshot({path:`${output}/house-variants.png`});await page.evaluate(()=>document.querySelector('#house-variant-gallery').remove());report.push({housePixels:pixels});
  }
  await page.evaluate(async()=>{const {startOpening,COURSE}=await import('/src/pages/WaysideFury/game/opening.ts');window.__waysideFury.mutate(s=>{startOpening(s,true);s.x=COURSE.x+90;});window.__waysideFury.renderer.reset();window.__waysideFury.renderer.draw(window.__waysideFury.state,0);});
  if(gfx==='3d')await page.waitForFunction(()=>window.__waysideFury.renderer.depth?.world.id==='training');await page.evaluate(()=>{const g=window.__waysideFury;g.renderer.draw(g.state,0);});await page.waitForTimeout(100);const tutorialFollow=await follow();assert.ok(Math.abs(tutorialFollow-normalFollow)<.001,'identical follow easing');
  report.push({name,tutorialSignature,gameplaySignature,normalFollow,tutorialFollow});assert.deepEqual(errors,[]);console.log(`${name}: six tutorial beats in frame, camera parity/follow, overworld screenshots pass`);await context.close();
 }
}finally{await writeFile(`${output}/metrics.json`,JSON.stringify(report,null,2));await browser.close();}
