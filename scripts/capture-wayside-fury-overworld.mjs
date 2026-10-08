import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const phase = process.argv[2] ?? 'after';
const { chromium } = await import(pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE ?? '/Users/szaneer/hark-work/fury-capture/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const output = `docs/wayside-fury-design/overworld-${phase}`;
await mkdir(output, { recursive: true });
const report = [];
try {
  for (const gfx of (process.env.FURY_CAPTURE_GFX?.split(',') ?? ['2d', '3d'])) for (const size of [{width:390,height:844,dpr:3},{width:1440,height:900,dpr:2}]) {
    if(process.env.FURY_CAPTURE_SIZE && String(size.width)!==process.env.FURY_CAPTURE_SIZE)continue;
    const context = await browser.newContext({viewport:size,deviceScaleFactor:size.dpr,hasTouch:size.width===390,isMobile:size.width===390});
    await context.addInitScript(() => localStorage.setItem('wayside-fury-controls-dismissed','1'));
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${process.env.FURY_BASE_URL ?? "http://localhost:5186"}/wayside-fury?gfx=${gfx}`);
    await page.waitForFunction(()=>window.__waysideFury && !document.querySelector('.wf-primary').disabled);
    await page.locator('.wf-primary').click();
    await page.evaluate(async()=>{const {skipPrologue}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(skipPrologue);});
    await page.waitForFunction(()=>window.__waysideFury.state.scene==='overworld');
    if(gfx==='3d') await page.waitForFunction(()=>document.querySelector('canvas').dataset.gfx==='3d');
    await page.evaluate(()=>window.__waysideFury.setPaused(true));
    for(const [name,x,y] of [['station',208,480],['reservoir',768,1280],['orchard',1760,1280]]) {
      await page.evaluate(async({x,y})=>{const {step,idleInput}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(s=>{s.x=x;s.y=y;s.notice='';step(s,idleInput(),0);});window.__waysideFury.renderer.reset();},{x,y});
      await page.waitForTimeout(400);
      await page.screenshot({path:`${output}/${size.width}x${size.height}-${gfx}-${name}.png`});
      const canvases=await page.evaluate(()=>[...document.querySelectorAll('.wf-stage canvas')].filter(c=>getComputedStyle(c).visibility!=='hidden').map(c=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight,dpr:Number(c.dataset.renderDpr)})));
      for(const c of canvases) assert.ok(Math.abs(c.width-c.cssWidth*size.dpr)<=2 && Math.abs(c.height-c.cssHeight*size.dpr)<=2);
      report.push({gfx,size,name,canvases});
    }
    assert.deepEqual(errors,[]); await context.close();
  }
} finally {await writeFile(`${output}/metrics${process.env.FURY_CAPTURE_SIZE ? "-"+process.env.FURY_CAPTURE_SIZE : ""}${process.env.FURY_CAPTURE_GFX ? "-"+process.env.FURY_CAPTURE_GFX : ""}.json`,JSON.stringify(report,null,2));await browser.close();}
