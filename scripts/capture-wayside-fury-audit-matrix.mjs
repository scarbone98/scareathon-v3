import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const phase = process.argv[2] ?? 'after';
const { chromium } = await import(pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE ?? '/Users/szaneer/hark-work/fury-capture/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=metal', '--enable-gpu'] });
const output = `docs/wayside-fury-design/audit/${phase}`;
await mkdir(output, { recursive: true });
const spots = [
  ['station-junction',208,480], ['diner-crossing',528,480],
  ['woods-junction',656,444], ['woods-edge',656,240],
  ['blast-approach',1088,416], ['city-junction',1040,512],
  ['launch-junction',1584,456], ['launch-gate',1584,416],
  ['west-lake',336,352], ['east-lake',976,240],
  ['reservoir-north',656,752], ['causeway',768,960],
  ['reservoir-south',768,1248], ['orchard-edge',2170,1040],
  ['garden-transition',160,720], ['cliff-transition',976,576],
];
const selectedSpots = process.env.FURY_CAPTURE_SPOTS ? spots.filter(([name])=>process.env.FURY_CAPTURE_SPOTS.split(',').includes(name)) : spots;
const force = process.env.FURY_AUDIT_RECAPTURE==='1';
const report = JSON.parse(await readFile(`${output}/metrics.json`,'utf8').catch(()=> '[]'));
try {
  for (const gfx of process.env.FURY_CAPTURE_GFX?.split(',') ?? ['2d','3d']) for (const size of [{width:390,height:844,dpr:3},{width:1440,height:900,dpr:2}]) {
    if (process.env.FURY_CAPTURE_SIZE && String(size.width)!==process.env.FURY_CAPTURE_SIZE) continue;
    if(!force && (await Promise.all(selectedSpots.map(async([name])=>report.some(r=>r.gfx===gfx&&r.size.width===size.width&&r.name===name)&&await access(`${output}/${size.width}x${size.height}-${gfx}-${name}.png`).then(()=>true,()=>false)))).every(Boolean))continue;
    const context = await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:size.dpr,hasTouch:size.width===390,isMobile:size.width===390});
    await context.addInitScript(()=>localStorage.setItem('wayside-fury-controls-dismissed','1'));
    const page=await context.newPage();page.setDefaultTimeout(300000);

    const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
    page.on('console',msg=>{if(msg.type()==='error')console.error(msg.text());});
    await page.goto(`${process.env.FURY_BASE_URL ?? 'http://localhost:5232'}/wayside-fury${gfx==='3d'?'?gfx=3d':''}`, {waitUntil:'commit'});
    for(let attempt=0;attempt<8;attempt++) {
      console.log(`startup ${gfx} ${size.width} attempt ${attempt+1}`);
      try {await page.waitForFunction(()=>window.__waysideFury && !document.querySelector('.wf-primary').disabled,{},{timeout:180000});break;}
      catch(error){console.log(await page.evaluate(()=>({title:document.title,body:document.body.innerText.slice(0,1000),api:!!window.__waysideFury,resources:performance.getEntriesByType('resource').length})));if(attempt===7){console.error(await page.locator('body').innerText());await page.screenshot({path:'/tmp/fury-audit-startup.png'});throw error;}await page.reload({waitUntil:'commit'});}
    }
    await page.locator('.wf-primary').click();
    await page.evaluate(async()=>{const {skipPrologue}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(skipPrologue);window.__waysideFury.setPaused(true);});
    await page.waitForFunction(()=>window.__waysideFury.state.scene==='overworld');
    if(gfx==='3d')await page.waitForFunction(()=>document.querySelector('canvas').dataset.gfx==='3d');
    await page.evaluate(()=>window.__waysideFury.setPaused(true));
    for(const [name,x,y] of selectedSpots) {
      if(!force && report.some(r=>r.gfx===gfx&&r.size.width===size.width&&r.name===name) && await access(`${output}/${size.width}x${size.height}-${gfx}-${name}.png`).then(()=>true,()=>false))continue;
      await page.evaluate(async({x,y})=>{const {enterCampaignMap}=await import('/src/pages/WaysideFury/game/sim.ts');window.__waysideFury.mutate(s=>{s.campaignMilestones=['realm-0','woods-complete','space-complete','city-complete'];enterCampaignMap(s,'overworld');s.x=x;s.y=y;s.notice='';s.vx=s.vy=0;s.time=24;});window.__waysideFury.renderer.reset();window.__waysideFury.renderer.flat.transition=0;window.__waysideFury.renderer.draw(window.__waysideFury.state,0,0);},{x,y});
      await page.waitForFunction(({gfx})=>window.__waysideFury?.state.scene==='overworld' && window.__waysideFury.state.mapId==='overworld' && document.querySelector('canvas').dataset.gfx===gfx && !document.querySelector('.wf-sync-loading'),{gfx});
      await page.waitForTimeout(180);
      await page.screenshot({path:`${output}/${size.width}x${size.height}-${gfx}-${name}.png`});
      const canvases=await page.evaluate(()=>[...document.querySelectorAll('.wf-stage canvas')].filter(c=>getComputedStyle(c).visibility!=='hidden').map(c=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight,dpr:Number(c.dataset.renderDpr)})));
      for(const c of canvases)assert.ok(Math.abs(c.width-c.cssWidth*size.dpr)<=2&&Math.abs(c.height-c.cssHeight*size.dpr)<=2,'native DPR');
      const previous=report.findIndex(r=>r.gfx===gfx&&r.size.width===size.width&&r.name===name);if(previous>=0)report.splice(previous,1);
      report.push({gfx,size,name,x,y,canvases});console.log(`${phase}: ${gfx} ${size.width} ${name}`);
    }
    assert.deepEqual(errors,[]);await context.close();
  }
} finally {await writeFile(`${output}/metrics.json`,JSON.stringify(report,null,2));await browser.close();}
