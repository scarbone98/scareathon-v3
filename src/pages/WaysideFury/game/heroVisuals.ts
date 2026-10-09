// High resolution, code-authored suit rig. Feet and visor anchors are shared by
// Canvas and WebGL; wardrobe is sampled for the face only and never rewritten.
import type { GameState } from './sim';
import type { HeroId } from './sim';
import type { HeroAvatar } from './avatar';
export const SUIT_POSES = ['idle','walk','bound','dash-launch','dash-air','dash-land','melee-1','melee-2','melee-3','charge','release','guard','hurt','downed','revive','interact','helmet-on','helmet-off'] as const;
export type SuitPose = typeof SUIT_POSES[number];
export const SUIT_MANIFEST = { cell: [128,192], feet: [64,184], helmet: [64,56], facings: 8, frames: 12, fps: 12 } as const;
const palettes = {joe:'#70d8ed',matt:'#edc068',alex:'#a6d282',jon:'#bd95e7',you:'#88e0bf'};
const faces = {joe:['#d4a079','#634939'],matt:['#ebc09b','#9a673d'],alex:['#b98262','#382e30'],jon:['#e2ae89','#473c41'],you:['#c49370','#433c39']};
const cache = new Map<string,HTMLCanvasElement>();
const faceCache = new WeakMap<HeroAvatar,Map<string,HTMLCanvasElement>>();
const portraits = new WeakMap<HeroAvatar,HTMLImageElement>();
export function suitPose(s:GameState):SuitPose {
  if(s.heroes[s.active].hp<=0) return 'downed';
  if(s.coop?.reviveHoldTarget) return 'revive';
  if(s.attackTimer>0) return `melee-${Math.max(1,Math.min(3,s.combo))}` as SuitPose;
  if(s.dashTimer>0) return s.dashTimer>.12?'dash-launch':s.dashTimer>.04?'dash-air':'dash-land';
  if(s.boundTimer>0) return s.boundTimer<.08?'dash-land':'bound';
  if(s.effects.some(e=>e.kind==='beam'&&e.hero===s.active&&e.ttl>.05))return 'release';
  if(s.guard) return 'guard';
  if(s.charge>.12 || s.meleeCharge>.25) return 'charge';
  if(s.heroes[s.active].invulnerable>.3) return 'hurt';
  if(s.previousInput.interact) return 'interact';
  return (s.motion?s.motion.speed>1:s.moving)?'walk':'idle';
}
export interface HeroVisual { canvas:HTMLCanvasElement; visor:HTMLCanvasElement; width:32; height:48; feet:readonly [16,46]; pose:SuitPose; facing:number; frame:number; appearanceReady:boolean }
function oval(c:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,fill:string|CanvasGradient,stroke?:string) {
  c.fillStyle=fill;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}
}
function limb(c:CanvasRenderingContext2D,points:number[],width:number,color:string) {
  c.strokeStyle='#27394c';c.lineWidth=width+4;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(points[0],points[1]);for(let n=2;n<points.length;n+=2)c.lineTo(points[n],points[n+1]);c.stroke();c.strokeStyle=color;c.lineWidth=width;c.stroke();
}
function rigTransform(g:CanvasRenderingContext2D,pose:SuitPose,facing:number,frame:number){
  const side=Math.sin(facing*Math.PI/4),phase=frame/12*Math.PI*2;g.translate(64,184);
  if(pose==='downed'){g.translate(-40,-10);g.rotate(Math.PI/2);g.scale(.52,.52);}
  if(pose==='dash-launch'||pose==='dash-land')g.scale(1.06,pose==='dash-land'?.78:.88);
  if(pose==='dash-air')g.rotate((side||1)*.13);
  if(pose==='hurt'){g.rotate(-(side||1)*.08);g.translate(-3,0);}
  if(pose==='revive')g.scale(1,.72);
  g.translate(0,-(pose==='idle'?Math.sin(phase)*1.4:pose==='bound'?4:0));
}
function author(id:HeroId,pose:SuitPose,facing:number,frame:number,visor=false) {
  const c=document.createElement('canvas');c.width=128;c.height=192;const g=c.getContext('2d')!;
  const accent=palettes[id],phase=frame/12*Math.PI*2, stride=pose==='walk'?Math.sin(phase)*12:pose==='bound'?10:0;
  const side=Math.sin(facing*Math.PI/4),back=facing>=3&&facing<=5;
  const attack=pose.startsWith('melee'),punch=attack?Math.sin(frame/11*Math.PI)*28:0;
  g.save();rigTransform(g,pose,facing,frame);
  if(!visor){
    // Life support pack, insulated joints, sculpted boots and pressure seams.
    oval(g,-side*9,-82,28,38,'#687a8e','#27394c');
    for(const dx of [-19,19]) {limb(g,[dx,-66,dx+stride*(dx<0?1:-1)*.4,-33,dx+stride*(dx<0?1:-1),-8],18,'#d3dde2');oval(g,dx+stride*(dx<0?1:-1),-7,13,8,'#52677a');limb(g,[dx-5,-23,dx+5,-23],3,accent);}
    const fabric=g.createLinearGradient(-27,-130,30,-55);fabric.addColorStop(0,'#f9f6e9');fabric.addColorStop(.5,'#dae5e9');fabric.addColorStop(1,'#8b9fb0');
    oval(g,0,-89,29,39,fabric,'#354b60');
    for(const dx of [-20,20])limb(g,[dx,-113,dx*.8,-74],3,accent);
    for(const dx of [-1,1]) {
      const guard=pose==='guard',charge=pose==='charge'||pose==='release',interact=pose==='interact'||pose==='revive';
      const handX=Math.max(-50,Math.min(50,dx*38+(dx===Math.sign(side||1)?punch*(side||1):0))),handY=guard?-116:charge?(pose==='release'?-117:-101):interact?-110:pose==='melee-2'?-73-punch:pose==='melee-3'?-91-punch*.3:-73+stride*dx;
      limb(g,[dx*25,-109,dx*37,-91,handX,handY],15,'#e1e9e9');
      oval(g,handX,handY,10,11,'#f4f1e5','#445b70');limb(g,[handX-7,handY+6,handX+6,handY+6],3,accent);
    }
    g.fillStyle='#42566a';g.fillRect(-18,-91,36,15);g.fillStyle=accent;g.fillRect(-16,-89,11,3);g.fillStyle='#eef9f3';for(let n=0;n<3;n++)g.fillRect(4+n*4,-88,2,2);
    g.strokeStyle='#879cad';g.lineWidth=1;for(let n=0;n<4;n++){g.beginPath();g.moveTo(-14,-66+n*3);g.lineTo(14,-66+n*3);g.stroke();}
    if(id==='matt'){oval(g,-43,-84,8,8,'#394c61');oval(g,-43,-84,5,5,'#edc068');limb(g,[-43,-84,-40,-87],1,'#27394c');}
    if(id==='jon'){g.fillStyle='#877799';g.fillRect(18,-74,19,23);limb(g,[24,-120,30,-140,37,-141],2,'#9cadbf');oval(g,37,-141,5,4,'#d5eaf5');}
    if(id==='alex')for(const dx of [-14,14])oval(g,dx,-110,3,3,'#d8ffa3');
    // Sewn station patch / scorched spatula: asymmetry is authored, never mirrored.
    oval(g,11,-104,7,7,accent);g.strokeStyle='#33495c';g.lineWidth=1;g.strokeRect(8,-108,6,7);
    if(id==='joe')limb(g,[11,-109,11,-99],2,'#5b4e43');
    oval(g,0,-127,24,7,'#647c90');limb(g,[-21,-126,21,-126],3,accent);
    oval(g,side*3,-153,32,31,fabric,'#344e65');
    if(!back){oval(g,side*6,-155,25,23,'#263c53');const [skin,hair]=faces[id];oval(g,side*6,-155,19,20,skin);oval(g,side*6,-169,19,8,hair);for(const dx of [-7,7])oval(g,side*6+dx,-155,1.7,2,'#243447');limb(g,[side*6-5,-145,side*6+5,-145],1,'#845d52');}
    else {oval(g,0,-153,23,22,'#d7e3e7');limb(g,[-17,-148,17,-148],3,accent);}
    for(const dx of [-30,30])oval(g,dx,-151,5,10,'#60788e');
  } else if(!back) {
    if(pose==='helmet-on')g.globalAlpha=frame/11;if(pose==='helmet-off')g.globalAlpha=1-frame/11;
    const glass=g.createLinearGradient(-22,-178,28,-130);glass.addColorStop(0,'#e0fbff60');glass.addColorStop(.5,'#97d9f718');glass.addColorStop(1,'#367aab55');
    oval(g,side*6,-155,26,24,glass,accent);g.strokeStyle='#ffffffbd';g.lineWidth=2;g.beginPath();g.ellipse(side*6,-155,21,20,0,3.6,4.6);g.stroke();
    limb(g,[side*6+15,-143,side*6+19,-147],1,'#c4f4ff');
  }
  g.restore();return c;
}
export function resolveHeroVisual(s:GameState,avatar?:HeroAvatar|null,pose=suitPose(s)):HeroVisual|null {
  if(!s.spaceOutfit)return null;
  const facing=(Math.round(Math.atan2(s.faceX,s.faceY)/ (Math.PI/4))+8)%8;
  const frame=s.attackTimer>0?Math.min(11,Math.max(0,Math.floor((1-s.attackTimer/(s.combo===3?.28:.2))*12))):(pose==='walk'&&s.motion?Math.floor(s.motion.phase/(Math.PI*2)*12):Math.floor(s.time*12))%12,key=`${s.active}:${pose}:${facing}:${frame}`;
  // Bounded cache rather than retaining the entire 5 × 18 × 8 atlas in memory.
  if(cache.size>192)cache.clear();
  if(!cache.has(key))cache.set(key,author(s.active,pose,facing,frame));
  const visorFrame=pose==='helmet-on'||pose==='helmet-off'?frame:0;const vk=`visor:${s.active}:${pose}:${facing}:${visorFrame}`;if(!cache.has(vk))cache.set(vk,author(s.active,pose,facing,visorFrame,true));
  let canvas=cache.get(key)!,appearanceReady=false;
  if(s.active==='you'&&avatar&&!(facing>=3&&facing<=5)) {
    let portrait=portraits.get(avatar);if(!portrait){portrait=new Image();portrait.src=avatar.portraitUrl;portraits.set(avatar,portrait);}
    if(portrait.complete&&portrait.naturalWidth){
      appearanceReady=true;let saved=faceCache.get(avatar);if(!saved){saved=new Map();faceCache.set(avatar,saved);}if(saved.size>96)saved.clear();
      if(!saved.has(key)){
      canvas=document.createElement('canvas');canvas.width=128;canvas.height=192;const c=canvas.getContext('2d')!;c.drawImage(cache.get(key)!,0,0);
      // Mask the saved portrait into the helmet; incompatible clothes stay covered.
      c.save();rigTransform(c,pose,facing,frame);c.translate(-64,-184);c.beginPath();c.ellipse(64+Math.sin(facing*Math.PI/4)*6,29,19,20,0,0,Math.PI*2);c.clip();c.fillStyle='#d7b08a';c.fillRect(40,4,48,50);c.imageSmoothingEnabled=true;c.drawImage(portrait,portrait.naturalWidth*.2,portrait.naturalHeight*.15,portrait.naturalWidth*.6,portrait.naturalHeight*.58,43,7,42,44);c.restore();saved.set(key,canvas);}
      canvas=saved.get(key)!;
    }
  }
  return {canvas,visor:cache.get(vk)!,width:32,height:48,feet:[16,46],pose,facing,frame,appearanceReady};
}
export function drawHeroVisual(c:CanvasRenderingContext2D,v:HeroVisual,x:number,y:number) {
  c.save();c.imageSmoothingEnabled=true;c.drawImage(v.canvas,x-16,y-46,32,48);c.drawImage(v.visor,x-16,y-46,32,48);c.restore();
}
