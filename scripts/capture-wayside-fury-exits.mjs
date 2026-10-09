import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const phase = process.argv[2] ?? 'after';
const { chromium } = await import(pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE ?? '/Users/szaneer/hark-work/fury-capture/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const output = `docs/wayside-fury-design/exits/${phase}`;
await mkdir(output, { recursive: true });
const report = [];
try {
  for (const gfx of (process.env.FURY_CAPTURE_GFX?.split(',') ?? ['2d', '3d'])) for (const size of [{width:390,height:844,dpr:3}]) {
    if(process.env.FURY_CAPTURE_SIZE && String(size.width)!==process.env.FURY_CAPTURE_SIZE)continue;
    const context = await browser.newContext({viewport:size,deviceScaleFactor:size.dpr,hasTouch:size.width===390,isMobile:size.width===390});
    await context.addInitScript(() => localStorage.setItem('wayside-fury-controls-dismissed','1'));
    const page = await context.newPage(); page.setDefaultTimeout(240000);
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${process.env.FURY_BASE_URL ?? "http://localhost:5225"}/wayside-fury${gfx==='3d'?'?gfx=3d':''}`);
    await page.waitForFunction(()=>window.__waysideFury && !document.querySelector('.wf-primary').disabled);
    await page.locator('.wf-primary').click();
    await page.evaluate(async()=>{const {skipPrologue}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(skipPrologue);window.__waysideFury.setPaused(true);});
    await page.waitForFunction(()=>window.__waysideFury.state.scene==='overworld');
    if(gfx==='3d') await page.waitForFunction(()=>document.querySelector('canvas').dataset.gfx==='3d');
    await page.evaluate(()=>window.__waysideFury.setPaused(true));
    for(const [name,x,y,mapId='overworld'] of [['blast-entry',548,192,'blast-0'],['blast-creek',870,256,'blast-1'],['county-woods',656,256],['interior-door',224,270,'interior-station'],['woods-seam',650,224,'woods-layby']]) {
      await page.evaluate(async({x,y,mapId})=>{const {enterCampaignMap}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(s=>{s.clearedRooms=['realm-0'];s.campaignMilestones=['woods-complete','space-complete'];enterCampaignMap(s,mapId);s.x=x;s.y=y;s.enemies=[];s.notice='';s.vx=s.vy=0;});window.__waysideFury.renderer.reset();window.__waysideFury.renderer.flat.transition=0;const state=JSON.stringify(window.__waysideFury.state);window.__waysideFury.renderer.draw(window.__waysideFury.state,0,0);if(state!==JSON.stringify(window.__waysideFury.state))throw Error('Exit rendering mutated simulation');},{x,y,mapId});
      await page.waitForFunction(({mapId,gfx})=>window.__waysideFury.state.mapId===mapId&&document.querySelector('canvas').dataset.gfx===(mapId==='overworld'?gfx:'2d'),{mapId,gfx});
      await page.waitForTimeout(400);
      await page.screenshot({path:`${output}/${size.width}x${size.height}-${gfx}-${name}.png`});
      const canvases=await page.evaluate(()=>[...document.querySelectorAll('.wf-stage canvas')].filter(c=>getComputedStyle(c).visibility!=='hidden').map(c=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight,dpr:Number(c.dataset.renderDpr)})));
      for(const c of canvases) assert.ok(Math.abs(c.width-c.cssWidth*size.dpr)<=2 && Math.abs(c.height-c.cssHeight*size.dpr)<=2);
      report.push({gfx,size,name,mapId,active:mapId==='overworld'?gfx:'2d',canvases});
      console.log(`${phase}: ${gfx} ${size.width} ${name}`);
    }
    assert.deepEqual(errors,[]); await context.close();
  }
  if(phase==='after') {
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3});
    await context.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:original.call(this,kind,...args);};localStorage.setItem('wayside-fury-controls-dismissed','1');});
    const page=await context.newPage();page.setDefaultTimeout(240000);
    await page.goto(`${process.env.FURY_BASE_URL ?? 'http://localhost:5225'}/wayside-fury?gfx=3d`);
    await page.waitForFunction(()=>window.__waysideFury && !document.querySelector('.wf-primary').disabled);
    await page.locator('.wf-primary').click();
    await page.evaluate(async()=>{const {skipPrologue}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(skipPrologue);window.__waysideFury.setPaused(true);});
    await page.waitForFunction(()=>document.querySelector('canvas').dataset.gfx==='2d' && document.querySelector('canvas').dataset.gfxStatus==='fallback');
    assert.equal(await page.evaluate(()=>window.__waysideFury.graphicsMode),'3d','unavailable WebGL preserves optional preference');
    report.push({check:'unavailable WebGL falls back to playable Canvas',dpr:3});
    await context.close();
  }
} finally {await writeFile(`${output}/metrics${process.env.FURY_CAPTURE_SIZE ? "-"+process.env.FURY_CAPTURE_SIZE : ""}${process.env.FURY_CAPTURE_GFX ? "-"+process.env.FURY_CAPTURE_GFX : ""}.json`,JSON.stringify(report,null,2));await browser.close();}
