import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from './wayside-fury-muted-playwright.mjs';
const phase=process.argv[2]??'after',out=`docs/wayside-fury-design/areas/${phase}`;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.FURY_CHROMIUM_PATH?{executablePath:process.env.FURY_CHROMIUM_PATH}:{}),args:['--mute-audio']}),metrics=[],errors=[];
try {
 for(const [width,height,dpr] of [[390,844,3],[1440,900,2]].filter(([w,h])=>!process.env.FURY_AREAS_VIEWPORTS||process.env.FURY_AREAS_VIEWPORTS.includes(`${w}x${h}`))) for(const gfx of ['2d','3d'].filter(g=>!process.env.FURY_AREAS_GFX||process.env.FURY_AREAS_GFX===g)) {
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,reducedMotion:'reduce',isMobile:width<600,hasTouch:width<600});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5218'}/wayside-fury?gfx=${gfx}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__waysideFury);
  await page.getByRole('button',{name:/Begin adventure|Continue adventure/}).click();
  const scenes=[['overworld',0,'overworld',768,960],['dungeon',2,'blast-2',320,192],['dungeon',0,'woods-layby',320,224],['dungeon',0,'city-boulevard',320,208]];
  if(phase==='after') for(const id of ['station','diner','farmhouse','office','yard-shed','warehouse','woods-cabin','city-archive','city-cafe']) scenes.push(['dungeon',0,`interior-${id}`,224,224]);
  for(const [scene,room,mapId,x,y] of scenes) {
   const result=await page.evaluate(async({scene,room,mapId,x,y})=>{
    const {enterScene}=await import('/src/pages/WaysideFury/game/sim.ts');const game=window.__waysideFury;
    game.setPaused(true);game.mutate(s=>{s.campaignMilestones=['space-complete','woods-complete'];s.clearedRooms=['realm-0'];enterScene(s,scene,room,mapId);s.sceneTimer=4;s.x=x;s.y=y;s.enemies=[];});
    game.renderer.draw(game.state,0,0);const before=JSON.stringify(game.state);for(let n=0;n<8;n++)game.renderer.draw(game.state,0,0);
    const canvas=document.querySelector('canvas[aria-label="Wayside Fury action RPG"]'),r=canvas.getBoundingClientRect();
    return {mapId:game.state.mapId,unchanged:before===JSON.stringify(game.state),width:canvas.width,height:canvas.height,cssWidth:r.width,cssHeight:r.height,dpr:Number(canvas.dataset.renderDpr),status:canvas.dataset.gfxStatus};
   },{scene,room,mapId,x,y});
   assert.equal(result.mapId,mapId);assert.ok(result.unchanged);assert.equal(result.dpr,dpr);assert.ok(Math.abs(result.width-result.cssWidth*dpr)<=1);
   await page.screenshot({path:`${out}/${width}x${height}-${gfx}-${mapId}.png`,timeout:240000});metrics.push({width,height,gfx,...result});await writeFile(`${out}/metrics-${width}-${gfx}.json`,JSON.stringify(metrics.filter(m=>m.width===width&&m.gfx===gfx),null,2));
  }
  await context.close();console.log(phase,width,gfx,'captured');
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/metrics.json`,JSON.stringify(metrics,null,2));
} finally {await browser.close();}
