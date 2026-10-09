// Frozen drawing source from ae34e62 (400c445's parent). Compare pixels in the
// same browser so font/GPU/browser upgrades cannot invalidate the reference.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const game = new URL('../src/pages/WaysideFury/game/', import.meta.url);
const reference = JSON.parse(await readFile(new URL('./fixtures/fury-pre400-art.json', import.meta.url), 'utf8'));
assert.equal(reference.commit, 'ae34e62acd712d37125c4ad460d74fa76d9b852e');
for(const [path,sha]of Object.entries(reference.assets)){
 const bytes=await readFile(new URL('../'+path,import.meta.url));
 assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),sha,`${path}: original art asset changed`);
}
const files=[];
const { chromium } = await import(process.env.FURY_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.FURY_PLAYWRIGHT_MODULE).href : 'playwright');
let browser;
try {
 for(const [name,source] of Object.entries(reference.sources)) {
  const target=new URL(name.replace(/([^/]+)$/,'.art-reference-$1'),game);files.push(target);
  const rewritten=source.replace(/(['"])(\.\.?\/[^'"]+)\1/g,(all,quote,path)=>{
   const resolved=new URL(path,target),relative=resolved.pathname.slice(game.pathname.length).replace(/\.ts$/,'');
   if(Object.keys(reference.sources).some(key=>key.replace(/\.ts$/,'')===relative))return `${quote}${path.replace(/([^/]+)$/,'.art-reference-$1')}${quote}`;
   return all;
  });
  await writeFile(target,rewritten);
 }
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-accelerated-2d-canvas','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(`${process.env.FURY_BASE_URL??'http://127.0.0.1:5224'}/wayside-fury?gfx=2d`);
 await page.waitForFunction(()=>window.__waysideFury?.renderer.flat.avatar&&!document.querySelector('.wf-primary')?.disabled,{},{timeout:90000});
 const result=await page.evaluate(async()=>{
  const path='/src/pages/WaysideFury/game/';
  const {Renderer}=await import(path+'render.ts'), {Renderer:Before}=await import(path+'.art-reference-render.ts');
  const {newGame,addEnemy}=await import(path+'sim.ts');
  const create=()=>{const c=document.createElement('canvas');c.width=256;c.height=256;c.getContext('2d',{willReadFrequently:true});return c;};
  const a=create(),b=create(),after=new Renderer(a),before=new Before(b);
  await Promise.all([...after.images.values(),...before.images.values()].map(image=>image.decode()));
  // decode can settle before onload has prepared the detail atlas.
  for(const r of [after,before])for(const [id,image]of r.images)r.prepareSheet(id,image);
  const checks=[];
  const stamp=(c,draw,w=256,h=256)=>{c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.reset();ctx.scale(4,4);draw(ctx);return ctx.getImageData(0,0,w,h).data;};
  const compare=(name,left,right)=>{const large=name.startsWith("prologue/");const x=stamp(a,left,large?1280:256,large?720:256),y=stamp(b,right,large?1280:256,large?720:256);let different=0,ink=0;for(let i=0;i<x.length;i++){if(x[i]!==y[i])different++;if(y[i])ink++;}checks.push({name,different,ink});};
  // Every original sheet frame and both flips; bosses are checked below.
  for(const id of after.images.keys())for(let frame=0;frame<12;frame++)for(const flip of [false,true])compare(`${id}/${frame}/${flip}`,()=>after.sprite(id,32,54,frame/(id.startsWith('run_')?20:12),flip),()=>before.sprite(id,32,54,frame/(id.startsWith('run_')?20:12),flip));
  const avatar=window.__waysideFury.renderer.flat.avatar;after.setAvatar(avatar);before.setAvatar(avatar);
  for(const id of ['you','joe','matt','alex','jon'])for(const suited of [false,true])for(const faceX of [-1,1]){
   const s=newGame();Object.assign(s,{active:id,x:32,y:54,time:0,moving:false,spaceOutfit:suited,faceX,faceY:0,meleeCharge:0});
   compare(`hero/${id}/${suited}/${faceX}`,()=>after.hero(s),()=>before.hero(s));
  }
  for(const [file,method,family,types] of [
   ['renderWoods2d.ts','drawWoodsBody','woodsBehavior',['rooted','lantern','wisp','bailiff','foreman']],
   ['renderSpace2d.ts','drawLunarBody','behavior',['rat','walker','scout','echo','satellite','inspector','warden']],
   ['chapters/ch4Art.ts','drawCityEnemy','behavior',['cable-rat','neon-imp','turnstile','clockwolf','switchmaster','architect']]]){
   const now=(await import(path+file))[method],old=(await import(path+file.replace(/([^/]+)$/,'.art-reference-$1')))[method];
   for(const type of types)for(const boss of [false,true]){const s=newGame();s.time=0;const e=addEnemy(s,boss?'boss':'grunt',32,54);e[family]=type;compare(`${type}/${boss}`,c=>now(c,e,s),c=>old(c,e,s));}
  }
  after.reducedMotion=true;before.reducedMotion=true;
  for(const id of ['zombie','pumpkin','ghost','imp','shadowbeast']){const s=newGame();s.time=0;const e=addEnemy(s,'grunt',32,54);e.sprite=id;compare(`enemy/${id}`,()=>after.enemy(s,e),()=>before.enemy(s,e));}
  // County WebGL uses the exact pre-400 texture dimensions, palette and frames.
  const {OverworldRenderer:Now3d}=await import(path+'render3d.ts'),{OverworldRenderer:Old3d}=await import(path+'.art-reference-render3d.ts');
  const sheets=async C=>{const r=Object.create(C.prototype);Object.assign(r,{sheets:new Map(),images:[],disposed:false});r.loadSheets();await Promise.all(r.images.map(i=>i.decode()));return r;};
  const current3d=await sheets(Now3d),original3d=await sheets(Old3d);
  for(const [id,sheet]of current3d.sheets){const old=original3d.sheets.get(id);compare(`3d-sheet/${id}`,c=>c.drawImage(sheet.texture.image,0,0),c=>c.drawImage(old.texture.image,0,0));checks.push({name:`3d-size/${id}`,different:Number(sheet.w!==old.w||sheet.h!==old.h||sheet.frames!==old.frames),ink:1});}
  // Vehicle authored shapes are shared. Suspension/wheel transforms stay outside them.
  const nowScenery=await import(path+'scenery.ts'),oldScenery=await import(path+'.art-reference-scenery.ts');
  for(const method of ['drawTaxiBody','drawTaxiWreck'])for(const pose of ['side','front'])compare(`vehicle/${method}/${pose}`,c=>{c.translate(32,54);nowScenery[method](c,pose);},c=>{c.translate(32,54);oldScenery[method](c,pose);});

  const oldCounty=await import(path+'.art-reference-countyArt.ts'),nowCounty=await import(path+'countyArt.ts');
  for(const kind of ['keeper']){const prop={kind,x:12,y:12,w:40,h:40};compare(`county/${kind}`,c=>nowCounty.drawCountyProp(c,prop),c=>oldCounty.drawCountyProp(c,prop));}
  for(const kind of ['car','npc']){const prop={kind,id:'art-check',label:'Jon',x:12,y:12,w:40,h:40};const s=newGame();compare(`prop/${kind}`,()=>after.prop(prop,0,s),()=>before.prop(prop,0,s));}
  const nowMoon=await import(path+'renderSpace2d.ts'),oldMoon=await import(path+'.art-reference-renderSpace2d.ts');
  for(const kind of ['lander','rocket']){const p={kind,id:'art-check',x:12,y:12,w:40,h:40};const s=newGame();compare(`space-prop/${kind}`,c=>nowMoon.drawSpaceProp(c,p,s),c=>oldMoon.drawSpaceProp(c,p,s));}
  // Render Space atlas cells without issuing GPU draws: texture pixels are the
  // actual billboard source, including the pre-400 128x192 street projection.
  const {SpaceRenderer:NowSpace}=await import(path+'renderSpace3d.ts'),{SpaceRenderer:OldSpace}=await import(path+'.art-reference-renderSpace3d.ts');
  const surface=()=>{const c=create();c.getBoundingClientRect=()=>({width:640,height:400});return c;};
  const fakeRenderer={getPixelRatio:()=>1,setPixelRatio(){},setSize(){},setRenderTarget(){},render(){}};
  const nowSpace=new NowSpace(fakeRenderer,surface()),oldSpace=new OldSpace(fakeRenderer,surface());
  await Promise.all([...nowSpace.street.values(),...oldSpace.street.values()].map(i=>i.decode()));nowSpace.setAvatar(avatar);oldSpace.setAvatar(avatar);
  for(const id of ['you','joe','matt','alex','jon'])for(const suited of [false,true]){
   const s=newGame();Object.assign(s,{mapId:'space-launch',scene:'dungeon',sceneTimer:5,time:0,enemies:[],active:id,spaceOutfit:suited});nowSpace.draw(s,0);oldSpace.draw(s,0);
   compare(`space3d/${id}/${suited}`,c=>c.drawImage(nowSpace.actors.get('local').canvas,0,0,64,64),c=>c.drawImage(oldSpace.actors.get('local').canvas,0,0,64,64));
  }
  nowSpace.dispose();oldSpace.dispose();
  for(let beat=0;beat<12;beat++){const s=newGame();Object.assign(s,{cutscene:beat,sceneTimer:0,time:0});compare(`prologue/${beat}`,()=>after.drawPrologue(s),()=>before.drawPrologue(s));}
  // Shape markers are opt-in in both projections. Enemies never get glyphs.
  const {availablePickups}=await import(path+'collectibles.ts'),{obstaclesForState}=await import(path+'locks/obstacles.ts');
  const {OVERWORLD}=await import(path+'world.ts'),THREE=await import('/node_modules/.vite/deps/three.js');
  const taxiGeometry=C=>{
   const r=Object.create(C.prototype);Object.assign(r,{taxi:new THREE.Group(),headlights:new THREE.PointLight(),wheels:[],materials:new Map(),geometries:{box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,8)}});r.makeTaxi();
   return JSON.stringify(r.taxi.children.map(mesh=>({color:mesh.material?.color?.getHex(),emissive:mesh.material?.emissive?.getHex(),position:mesh.position.toArray(),scale:mesh.scale.toArray(),rotation:mesh.rotation.toArray(),vertices:Array.from(mesh.geometry?.attributes.position.array??[]),indices:Array.from(mesh.geometry?.index?.array??[]),instances:Array.from(mesh.instanceMatrix?.array??[])})));
  };
  checks.push({name:'3d-taxi-geometry',different:Number(taxiGeometry(Now3d)!==taxiGeometry(Old3d)),ink:1});
  const markerState=newGame();Object.assign(markerState,{scene:'overworld',mapId:'overworld',foundItems:[],solvedInteractions:[]});
  const pickup=availablePickups(markerState)[0],gate=obstaclesForState(markerState)[0];
  const projection=Object.create(Now3d.prototype);Object.assign(projection,{terrain:{heightAt:()=>0},world:OVERWORLD,target:new THREE.Vector3(),viewport:{width:320,height:180},scratch:new THREE.Vector3(),camera:new THREE.OrthographicCamera(-160,160,90,-90,.1,2000)});
  for(const [kind,point]of [['pickup',{x:pickup.x,y:pickup.y}],['gate',{x:gate.x+gate.w/2,y:gate.y}]]){
   Object.assign(markerState,point);markerState.enemies=[];addEnemy(markerState,'grunt',point.x,point.y);after.viewport={...after.viewport,width:320,height:180};after.camera={x:point.x-160,y:point.y-90};
   projection.camera.position.set(point.x,650,point.y+400);projection.camera.lookAt(point.x,0,point.y);projection.camera.updateMatrixWorld();
   for(const [mode,renderer]of [['2d',after],['3d',projection]])for(const enabled of [false,true]){
    const labels=renderer.presentation({...markerState,shapeMarkers:enabled}).labels;
    checks.push({name:`${mode}/${kind}-markers/${enabled}`,different:Number(labels.some(l=>String(l.id).startsWith(`${kind}-symbol-`))!==enabled||labels.some(l=>String(l.id).startsWith('enemy-symbol-'))),ink:1});
   }
  }
  after.dispose();before.dispose();return checks;
 });
 const output=process.env.FURY_ART_OUTPUT??'work/fury-art';await mkdir(output,{recursive:true});await writeFile(`${output}/pixel-comparison.json`,JSON.stringify({reference:reference.commit,assets:Object.keys(reference.assets).length,checks:result},null,2));
 for(const check of result){assert.ok(check.ink>0,`${check.name}: reference must draw visible art`);assert.equal(check.different,0,`${check.name}: differs from pre-400c445 (${check.different} channels)`);}

 console.log(`${result.length} pre-400c445 pixel/geometry comparisons passed (2D, shared Space art, WebGL textures and vehicles).`);
}finally{await browser?.close();await Promise.all(files.map(file=>rm(file,{force:true})));}
