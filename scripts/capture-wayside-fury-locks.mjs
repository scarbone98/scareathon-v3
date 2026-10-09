import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE??'/Users/szaneer/hark-work/fury-capture/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true,args:['--mute-audio','--use-angle=metal','--enable-gpu']});
const assists=process.env.FURY_CAPTURE_ASSISTS==='1';
const out=`docs/wayside-fury-design/locks${assists?'/assists':''}`;await mkdir(out,{recursive:true});const report=[];
try{
for(const gfx of ['2d','3d'])for(const size of (assists?[{width:390,height:844,dpr:3}]:[{width:390,height:844,dpr:3},{width:1440,height:900,dpr:2}])){
 const context=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:size.dpr,hasTouch:size.width<1000,isMobile:size.width<1000,reducedMotion:'reduce'});
 await context.addInitScript(()=>localStorage.setItem('wayside-fury-controls-dismissed','1'));
 const page=await context.newPage();page.setDefaultTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${process.env.FURY_BASE_URL??'http://localhost:5226'}/wayside-fury${gfx==='3d'?'?gfx=3d':''}`,{waitUntil:'commit'});
 await page.waitForFunction(()=>window.__waysideFury&&!document.querySelector('.wf-primary').disabled);await page.locator('.wf-primary').click();
 await page.evaluate(async()=>{const{skipPrologue}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(skipPrologue);window.__waysideFury.setPaused(true);});
 for(const [type,id]of (assists?[['assist','locks-moon-reserve']]:[['level','locks-county-danger'],['ability','locks-county-debris'],['story','locks-moon-reserve']]))for(const cleared of (assists?[true]:[false,true])){
  await page.evaluate(async({id,cleared,assists})=>{
   const {enterCampaignMap,interact,interactTarget}=await import('/src/pages/WaysideFury/game/sim.ts');
   const {HERO_OBSTACLES,isObstacleCleared}=await import('/src/pages/WaysideFury/game/locks/obstacles.ts');
   const {interactionPrompt}=await import('/src/pages/WaysideFury/game/contextAttack.ts');const g=HERO_OBSTACLES.find(g=>g.id===id),api=window.__waysideFury;
   api.mutate(s=>{s.clearedRooms=['realm-0'];s.campaignMilestones=['woods-complete','moon-departed'];s.solvedInteractions=[];s.dialogue=null;s.overlay=null;s.character.level=1;s.enemies=[];
    enterCampaignMap(s,g.worldId);s.enemies=[];s.sceneTimer=5;s.transitionCooldown=10;s.x=g.x+g.w/2;s.y=g.y+g.h+(s.scene==='overworld'?10:7)+3;s.faceX=0;s.faceY=-1;s.vx=s.vy=0;s.notice='';
    if(cleared){if(g.requirement.kind==='level')s.character.level=g.requirement.level;else s.campaignMilestones.push(g.requirement.milestone);interact(s,{id:g.id,x:s.x,y:s.y,name:'Clear gate',kind:'use'});}
    if(isObstacleCleared(s,id)!==cleared)throw Error('clear state mismatch');if(assists){for(const e of s.effects)e.ttl=.6;}else s.effects=[];s.floaters=[];
    const t=interactTarget(s);s.contextAttack.target=t;s.contextAttack.displayed=interactionPrompt(t,false,true);
   });api.setPaused(true);api.renderer.reset();api.renderer.flat.transition=0;
   const before=JSON.stringify(api.state);api.renderer.draw(api.state,0,0);if(JSON.stringify(api.state)!==before)throw Error('renderer mutated gate/save state');
  },{id,cleared,assists});
  await page.waitForFunction(gfx=>{const c=document.querySelector('canvas');if(gfx==='3d'&&c.dataset.gfxStatus==='fallback')throw Error(c.dataset.gfxError);return c.dataset.gfx===gfx;},gfx);
  await page.waitForTimeout(250);
  const canvases=await page.evaluate(()=>[...document.querySelectorAll('.wf-stage canvas')].filter(c=>getComputedStyle(c).visibility!=='hidden').map(c=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight,dpr:Number(c.dataset.renderDpr)})));
  for(const c of canvases)assert.ok(Math.abs(c.width-c.cssWidth*size.dpr)<=2&&Math.abs(c.height-c.cssHeight*size.dpr)<=2,'native DPR');
  const name=`${size.width}x${size.height}-${gfx}-${type}-${cleared?'cleared':'locked'}`;await page.screenshot({path:`${out}/${name}.png`});report.push({name,id,gfx,cleared,size,canvases});console.log(name);
 }
 assert.deepEqual(errors,[]);await context.close();
}
}finally{await writeFile(`${out}/metrics.json`,JSON.stringify(report,null,2));await browser.close();}
