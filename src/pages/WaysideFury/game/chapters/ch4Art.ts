import { creatureMotion } from '../animation';
import { getWorld } from '../world.ts';
import { applyEnemyWindup } from '../enemyWindup';
import type { WorldProp } from '../worldBuilder.ts';
import type { Enemy, GameState } from '../sim.ts';
import { CITY_RAT_OUTLETS } from './ch4Worlds.ts';
import { isCityBehavior } from '../enemies/city.ts';
import { hasSpaceFlag } from '../lunar.ts';
import { hasMilestone } from './ch3.ts';
import { inCity } from './ch4.ts';
const ink='#172630',amber='#EDB86F',violet='#9467C2';
function oval(c:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,color:string|CanvasGradient) {c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
function line(c:CanvasRenderingContext2D,x:number,y:number,xx:number,yy:number,color:string,width=1) {c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();}
export function drawCityGround(c:CanvasRenderingContext2D,s:GameState) {
  if(!inCity(s)) return;
  c.save();
  const warm=hasMilestone(s,'city-restored');
  if([0,2,5].includes(s.room)) {const solved=hasSpaceFlag(s,`city-anchor-${s.room}`);c.fillStyle=solved?'#EDB86F44':'#9467C299';c.fillRect(608,176,16,64);for(let y=180;y<240;y+=8) line(c,608,y,624,y,solved?amber:violet,1.5);}
  for(const x of [112,240,400,528]) {
    // Puddles, bundled cables and window reflections at native canvas resolution.
    oval(c,x+34,284,30,5,'#23434E');
    for(let n=0;n<5;n++) line(c,x+10,284+n*.6,x+52,284+n*.6,warm?'#EDB86F44':'#9467C244',.6);
    for(let n=0;n<3;n++) {c.strokeStyle=n%2?violet:ink;c.lineWidth=1.4;c.beginPath();c.moveTo(x-28,96+n*3);c.bezierCurveTo(x-10,124+n*3,x+40,128+n*3,x+60,96+n*3);c.stroke();}
    c.fillStyle='#12323D';c.fillRect(x-10,84,60,5);
    for(let n=0;n<6;n++) {c.fillStyle=warm?amber:'#657789';c.fillRect(x-8+n*10,85,5,2);}
  }
  if(s.room===4||s.room===9||s.enemies.some(e=>e.behavior==='cable-rat')) for(const {x,y} of CITY_RAT_OUTLETS) {c.strokeStyle=amber;c.lineWidth=2;c.strokeRect(x-12,y-12,24,24);for(let n=0;n<3;n++) line(c,x-8,y-6+n*6,x+8,y-6+n*6,ink,2);}
  for(const authored of s.room===13?[{id:'city-pedestal-0',x:220,y:130},{id:'city-pedestal-1',x:440,y:130},{id:'city-pedestal-2',x:320,y:310}]:[0,2,5].includes(s.room)?[{id:`city-anchor-${s.room}`,x:196,y:290}]:[]) {
    const prop=getWorld(s.scene,s.room,s.mapId).props.find(p=>p.id===authored.id);
    const target=prop ? {id:authored.id,x:prop.x+prop.w/2,y:prop.y+prop.h+12} : authored;
    const solved=hasSpaceFlag(s,target.id);c.strokeStyle=solved?amber:violet;c.lineWidth=2;c.beginPath();c.arc(target.x,target.y,17,0,Math.PI*(target.id==='city-pedestal-2'?1.5:2));c.stroke();
    if(solved) {line(c,target.x-6,target.y,target.x-1,target.y+6,amber,2);line(c,target.x-1,target.y+6,target.x+8,target.y-7,amber,2);}
  }
  if(s.mapId==='city-hatching') {
    const index=s.dialogue?.speaker==='Jon'?s.dialogue.index:-1;
    const g=c.createRadialGradient(500,134,1,500,134,65);g.addColorStop(0,'#fff5e8');g.addColorStop(1,'#9467C200');oval(c,500,134,64,78,g);
    const egg=c.createLinearGradient(480,65,525,145);egg.addColorStop(0,'#fff6dc');egg.addColorStop(1,'#b0bdb6');oval(c,500,108,24,38,egg);
    oval(c,500,122,10,5,ink);oval(c,488,102,3,4,ink);oval(c,510,102,3,4,ink);
    for(const side of [-1,1]) {line(c,500+side*20,125,500+side*35,143,'#e8e5cf',5);line(c,500+side*12,143,500+side*20,157,'#e8e5cf',5);}
    if(index>=0) {line(c,471,145,480,128,amber,3);line(c,488,137,497,120,amber,3);}
    if(index===0) {oval(c,440,170,24,30,'#fff3d7bb');}
  }
  c.restore();
}
export function drawCityEnemy(c:CanvasRenderingContext2D,e:Enemy,s:GameState):boolean {
  if(!isCityBehavior(e.behavior)) return false;
  c.save();c.translate(e.x,e.y);oval(c,0,0,e.radius+5,4,'#101f3050');
  c.save();creatureMotion(c,e.motion,s.time,0,0,e.woodsBehavior==='wisp'||e.behavior==='neon-imp');applyEnemyWindup(c,{...e,x:0,y:0});
  if(e.behavior==='clockwolf'&&e.actionTimer>0) c.translate(0,-Math.sin(Math.PI*(1-e.actionTimer/.6))*18);
  const g=c.createLinearGradient(-15,-30,15,0);g.addColorStop(0,e.hitTimer>0?'#fff3cf':'#537680');g.addColorStop(1,ink);
  if(e.behavior==='cable-rat') {
    c.strokeStyle='#b09b86';c.lineWidth=2;c.beginPath();c.moveTo(-9,-4);c.bezierCurveTo(-18,-18,-25,-6,-17,1);c.stroke();
    oval(c,0,-7,12,7,g);oval(c,8,-11,6,6,'#886B65');oval(c,6,-16,4,4,'#EDB86F');line(c,11,-8,18,-6,'#d4b3a0');
    for(const y of [-9,-6,-3]) line(c,13,y,20,y-2,'#d4b3a0',.7);
  } else if(e.behavior==='clockwolf') {
    c.fillStyle=g;c.beginPath();c.moveTo(-14,0);c.lineTo(-17,-20);c.lineTo(-10,-36);c.lineTo(-3,-29);c.lineTo(7,-37);c.lineTo(15,-21);c.lineTo(10,-1);c.closePath();c.fill();
    for(const side of [-1,1]) {line(c,side*7,-15,side*21,-7,'#ad9c86',5);for(let n=0;n<3;n++) line(c,side*20,-9+n*3,side*26,-13+n*3,'#d9d4c4');}
    oval(c,0,-21,9,5,'#abaaa0');oval(c,-5,-27,2,1,amber);oval(c,5,-27,2,1,amber);
  } else if(e.behavior==='neon-imp') {
    oval(c,0,-15,9,15,g);for(const side of [-1,1]) {c.fillStyle=violet;c.beginPath();c.moveTo(side*5,-21);c.lineTo(side*16,-34);c.lineTo(side*10,-17);c.fill();line(c,side*8,-15,side*17,-6,amber,3);}oval(c,0,-20,6,4,'#ad86ba');oval(c,0,-21,3,1,amber);
  } else if(e.behavior==='turnstile') {
    c.fillStyle=g;c.fillRect(-8,-22,16,21);oval(c,0,-27,8,7,'#a4aca0');
    const x=e.aimX*12,y=e.aimY*8;c.fillStyle='#879c9f';c.fillRect(x-10,y-25,20,24);c.strokeStyle=amber;c.lineWidth=2;c.strokeRect(x-10,y-25,20,24);line(c,x-7,y-18,x+7,y-18,ink,3);
  } else {
    c.fillStyle=e.behavior==='architect'?'#3f384f':'#886B65';c.beginPath();c.moveTo(-18,0);c.lineTo(-11,-34);c.lineTo(11,-34);c.lineTo(18,0);c.fill();
    oval(c,0,-40,11,10,'#d6c4ad');c.fillStyle=ink;c.fillRect(-13,-51,26,5);c.fillRect(-9,-60,18,10);
    for(const side of [-1,1]) {line(c,side*9,-31,side*25,-23,amber,4);oval(c,side*5,-41,2,2,violet);}
    line(c,25,-5,25,-49,amber,3);oval(c,25,-51,5,6,violet);
    if((e.exposed??0)<=0) {c.strokeStyle=violet;c.lineWidth=2;c.beginPath();c.ellipse(0,-25,28,38,0,0,Math.PI*2);c.stroke();}
  }
  c.restore();
  const width=e.kind==='boss'?54:24;c.fillStyle=ink;c.fillRect(-width/2,-72,width,5);c.fillStyle=amber;c.fillRect(-width/2,-72,width*Math.max(0,e.hp/e.maxHp),3);
  c.restore();return true;
}

export function drawCityProp(c:CanvasRenderingContext2D,p:WorldProp,s:GameState):boolean {
  if(!inCity(s)||!['shop','shed','socket'].includes(p.kind)) return false;
  c.save();c.translate(p.x,p.y);
  const warm=hasMilestone(s,'city-restored'),w=p.w,h=p.h;
  if(p.kind==='socket') {
    const solved=hasSpaceFlag(s,p.id);c.fillStyle=ink;c.fillRect(0,0,w,h);c.strokeStyle=solved?amber:violet;c.lineWidth=1.5;c.strokeRect(1,1,w-2,h-2);
    oval(c,w/2,h/2,6,6,solved?amber:violet);for(let n=0;n<3;n++) line(c,3,h-5-n*3,w-3,h-5-n*3,'#98a6a5',.6);
  } else {
    const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#886B65');g.addColorStop(1,'#23434E');c.fillStyle=g;c.fillRect(0,0,w,h);
    for(let y=5;y<h;y+=8) {line(c,0,y,w,y,'#233542',.6);for(let x=(y%16?8:0);x<w;x+=16)line(c,x,y,x,y+8,'#233542',.6);}
    for(const x of [8,w-25]) {c.fillStyle=ink;c.fillRect(x,10,17,22);const glow=c.createLinearGradient(x,10,x+17,32);glow.addColorStop(0,warm?'#F2C879':'#657485');glow.addColorStop(1,'#293E4A');c.fillStyle=glow;c.fillRect(x+2,12,13,18);line(c,x+8,12,x+8,30,ink,1);line(c,x+2,21,x+15,21,ink,1);}
    c.fillStyle='#172630';c.fillRect(w/2-7,h-22,14,22);line(c,w/2+3,h-12,w/2+3,h-9,amber,1.5);c.fillStyle=warm?amber:violet;c.fillRect(4,2,w-8,3);
  }
  c.restore();return true;
}

export function drawCityStory(c:CanvasRenderingContext2D,s:GameState,width:number,height:number):boolean {
  if(s.mapId!=='city-hatching'||s.dialogue?.speaker!=='Jon') return false;
  c.save();c.fillStyle='#172630';c.fillRect(0,height*.10,width,height*.66);
  const scale=Math.min(width/180,height/270),x=width/2,y=height*.34,index=s.dialogue.index;
  c.translate(x,y);c.scale(scale,scale);
  const light=c.createRadialGradient(0,0,4,0,0,58);light.addColorStop(0,'#e9e4d5');light.addColorStop(.6,'#756d90');light.addColorStop(1,'#172630');oval(c,0,0,58,60,light);
  c.strokeStyle=violet;c.lineWidth=3;c.beginPath();c.ellipse(0,-4,44,55,0,Math.PI,Math.PI*2);c.stroke();
  const shell=c.createLinearGradient(-20,-32,20,22);shell.addColorStop(0,'#fff6dc');shell.addColorStop(1,'#b0bdb6');oval(c,0,-6,21,34,shell);
  oval(c,0,9,9,4,ink);oval(c,-9,-8,3,4,ink);oval(c,9,-8,3,4,ink);
  for(const side of [-1,1]) {line(c,side*18,8,side*30,20,'#eee7d7',5);line(c,side*10,23,side*19,34,'#eee7d7',5);}
  line(c,-40,30,-28,13,amber,3);line(c,-23,23,-11,6,amber,3);
  if(index===0) {oval(c,-40,5,7,16,'#fff6dcaa');for(let n=0;n<5;n++)line(c,-47+n*3,-6,-47+n*3,16,'#9467C288',1);}
  else {c.strokeStyle=amber;c.lineWidth=1;c.beginPath();c.ellipse(-40,24,8,3,0,0,Math.PI*2);c.stroke();}
  c.restore();return true;
}
