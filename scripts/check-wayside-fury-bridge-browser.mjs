// Real WebGL actor-height and deck-plane regression, plus the production Canvas
// draw-order/collision fixtures in capture-wayside-fury-bridge.mjs.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const source=process.env.FURY_PLAYWRIGHT_MODULE ?? 'playwright';
const {chromium}=await import(source.startsWith('/')?pathToFileURL(source).href:source);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--use-angle=metal','--enable-gpu']});
const output=new URL('../docs/wayside-fury-design/bridge/',import.meta.url);await mkdir(output,{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:3,reducedMotion:'reduce'});
 const base=process.env.FURY_BASE_URL ?? 'http://127.0.0.1:5221';
 await page.route(`${base}/`,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));await page.goto(`${base}/`);
 const metrics=await page.evaluate(async()=>{
  const [THREE,{SpaceRenderer},world,sim,{surfaceRects,isGroundProp},{Renderer}]=await Promise.all([import('/node_modules/three/src/Three.js'),import('/src/pages/WaysideFury/game/renderSpace3d.ts'),import('/src/pages/WaysideFury/game/world.ts'),import('/src/pages/WaysideFury/game/sim.ts'),import('/src/pages/WaysideFury/game/walkableSurfaces.ts'),import('/src/pages/WaysideFury/game/render.ts')]);
  document.body.style.cssText='margin:0';const canvas=document.createElement('canvas');canvas.style.cssText='width:390px;height:844px';document.body.append(canvas);
  const webgl=new THREE.WebGLRenderer({canvas,antialias:true}),r=new SpaceRenderer(webgl,canvas),m=world.getWorld('dungeon',0,'space-launch');
  const original=m.props;
  const deck={id:'regression-deck',kind:'broken-bridge',x:208,y:260,w:128,h:48,footprints:[],surface:{deckHeight:4,gap:[.45,.65]}};
  m.props=[...original,deck];
  try {
   const s=sim.newGame();sim.enterScene(s,'dungeon',0,'space-launch');Object.assign(s,{x:232,y:284,active:'joe',spaceOutfit:true,sceneTimer:10,enemies:[]});
   const enemy=sim.addEnemy(s,'grunt',244,292);enemy.behavior='walker';
   s.coop={role:'host',remoteHeroes:[{seat:2,scene:s.scene,room:s.room,mapId:s.mapId,x:220,y:286,hero:s.heroes.matt,spaceOutfit:true,faceX:1,faceY:0,hp:100}]};
   const state=JSON.stringify(s);
   const flatCanvas=document.createElement('canvas');flatCanvas.style.cssText='width:390px;height:844px';document.body.append(flatCanvas);
   const flat=new Renderer(flatCanvas),order=[];
   await Promise.all([...flat.images.values()].map(i=>i.decode().catch(()=>{})));
   const propDraw=flat.prop.bind(flat),heroDraw=flat.hero.bind(flat),enemyDraw=flat.enemy.bind(flat);
   flat.prop=(p,...args)=>{order.push(isGroundProp(p)?'ground':'prop');return propDraw(p,...args);};
   flat.hero=(...args)=>{order.push('hero');return heroDraw(...args);};
   flat.enemy=(...args)=>{order.push('enemy');return enemyDraw(...args);};
   flat.draw(s,0,0);
   if(order.filter(k=>k==='hero').length!==2 || !order.includes('enemy') || order.lastIndexOf('ground')>Math.min(order.indexOf('hero'),order.indexOf('enemy')))throw Error(`Ground must precede local/remote/enemy actors: ${order}`);
   flat.dispose();flatCanvas.remove();r.draw(s,0);
   if(state!==JSON.stringify(s))throw Error('WebGL mutated state');
   const actors=['local','peer-2',`enemy-${enemy.id}`].map(id=>({id,y:r.actors.get(id).mesh.position.y}));
   if(actors.some(a=>Math.abs(a.y-5)>.001))throw Error(`Actors not lifted to deck: ${JSON.stringify(actors)}`);
   const planes=r.staticGroup.children.filter(o=>o.geometry?.type==='PlaneGeometry'&&o.position.y===4.02);
   if(planes.length!==2||planes.some(p=>Math.abs(p.rotation.x+Math.PI/2)>.001))throw Error('Broken deck must have two horizontal planes');
   const deckRects=surfaceRects(deck);
   const bounds=planes.map(p=>({x:p.position.x-p.geometry.parameters.width/2,y:p.position.z-p.geometry.parameters.height/2,w:p.geometry.parameters.width,h:p.geometry.parameters.height}));
   if(JSON.stringify(bounds)!==JSON.stringify(deckRects))throw Error('WebGL geometry disagrees with deck rectangles');
   s.x=280;s.y=284;r.draw(s,0);if(Math.abs(r.actors.get('local').mesh.position.y-1)>.001)throw Error('No lift in broken gap');
   s.x=232;r.draw(s,0);window.bridgeWebgl={r,webgl};
   return {actors,bounds,canvasDrawOrder:order,dpr:webgl.getPixelRatio(),width:canvas.width,height:canvas.height,immutable:true};
  } finally {m.props=original;}
 });
 assert.equal(metrics.dpr,3);assert.equal(metrics.width,1170);assert.equal(metrics.height,2532);
 await page.screenshot({path:new URL('after-real-3d-standing-regression.png',output).pathname});
 await writeFile(new URL('webgl-regression-metrics.json',output),JSON.stringify(metrics,null,2));
 await page.evaluate(()=>{window.bridgeWebgl.r.dispose();window.bridgeWebgl.webgl.dispose();});
 console.log('Real WebGL: horizontal broken deck planes, local/remote/enemy standing heights, gap, native DPR and immutable simulation pass.');
} finally {await browser.close();}
