import { creatureMotion } from './animation';
import { applyEnemyWindup } from './enemyWindup';
import type { Enemy, GameState } from './sim.ts';
import { hasFieldFlag } from './fieldAbilities.ts';
const pine='#28483f',moss='#78935d',amber='#f2c879',plum='#785078';
function ellipse(c:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,color:string|CanvasGradient) {c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
export function drawWoodsBody(c:CanvasRenderingContext2D,e:Enemy,s:GameState) {
  if(!e.woodsBehavior) return false;
  c.save();c.translate(e.x,e.y);
  ellipse(c,0,1,e.radius*1.15,5,'#101e2366');
  c.save();creatureMotion(c,e.motion,s.time,0,0,e.woodsBehavior==='wisp'||e.behavior==='neon-imp');applyEnemyWindup(c,{...e,x:0,y:0});
  const large=e.kind==='boss',h=large?48:27,w=large?25:12;
  const material=c.createLinearGradient(-w,-h,w,0);material.addColorStop(0,moss);material.addColorStop(.45,pine);material.addColorStop(1,'#152e2b');
  if(e.woodsBehavior==='wisp') {
    const lit=(e.exposed??0)===0;
    if(lit) {const glow=c.createRadialGradient(0,-20,1,0,-20,30);glow.addColorStop(0,'#f2c87999');glow.addColorStop(1,'#f2c87900');c.fillStyle=glow;c.fillRect(-30,-50,60,60);}
    c.fillStyle=lit?amber:'#9d9caa';c.beginPath();c.moveTo(-8,-5);c.bezierCurveTo(-10,-17,-4,-27,0,-34);c.bezierCurveTo(12,-24,9,-13,6,-5);c.closePath();c.fill();
    ellipse(c,0,-12,6,9,'#efe7c2');c.strokeStyle='#735b70';c.lineWidth=1;c.strokeRect(-6,-19,12,16);
  } else if(e.woodsBehavior==='lantern') {
    ellipse(c,0,-14,16,14,'#ad6e37');
    for(const x of [-9,-3,3,9]) {c.strokeStyle='#e9a251';c.lineWidth=1.2;c.beginPath();c.ellipse(x*.3,-14,4,12,0,-1.3,1.3);c.stroke();}
    c.fillStyle=amber;c.fillRect(-9,-19,5,4);c.fillRect(4,-19,5,4);c.fillRect(-5,-9,10,3);
    c.strokeStyle=moss;c.lineWidth=3;c.beginPath();c.moveTo(0,-27);c.quadraticCurveTo(8,-35,11,-29);c.stroke();
  } else {
    c.fillStyle=material;c.beginPath();c.roundRect(-w,-h,w*2,h,large?12:6);c.fill();
    c.strokeStyle=moss;c.lineWidth=1.7;
    for(let n=0;n<7;n++) {c.beginPath();c.moveTo(-w+n*w/3,-h+8);c.bezierCurveTo(-w+n*w/3+8,-h*.6,-w+n*w/3-6,-h*.3,-w+n*w/3+4,0);c.stroke();}
    if(e.woodsBehavior==='bailiff') {
      c.fillStyle='#ad9271';c.beginPath();c.moveTo(-20,-42);c.lineTo(0,-62);c.lineTo(20,-42);c.closePath();c.fill();
      c.strokeStyle='#aa9674';c.lineWidth=3;c.beginPath();c.moveTo(24,0);c.lineTo(24,-52);c.moveTo(14,-52);c.lineTo(37,-52);c.stroke();
      for(let x=15;x<38;x+=5) {c.beginPath();c.moveTo(x,-52);c.lineTo(x,-44);c.stroke();}
    }
    if(e.woodsBehavior==='foreman') {
      const metal=c.createLinearGradient(-18,-36,18,-12);metal.addColorStop(0,'#899e9e');metal.addColorStop(.5,'#354f53');metal.addColorStop(1,'#a7b5a8');
      ellipse(c,0,-22,18,17,metal);ellipse(c,0,-22,10,10,e.phase===2&&!e.shieldBroken?plum:amber);
      for(let n=0;n<8;n++) {const a=n*Math.PI/4;ellipse(c,Math.cos(a)*14,-22+Math.sin(a)*13,1.5,1.5,'#cfdbc0');}
      for(const x of [-31,31]) {c.strokeStyle=moss;c.lineWidth=6;c.beginPath();c.moveTo(x*.6,-35);c.quadraticCurveTo(x,-23,x,-4);c.stroke();}
    }
    ellipse(c,-5,-h+10,2,2,amber);ellipse(c,5,-h+10,2,2,amber);
  }
  c.restore();
  const width=large?56:26;c.fillStyle='#13292c';c.fillRect(-width/2,-h-12,width,5);c.fillStyle=e.hitTimer>0?'#fff0c4':plum;c.fillRect(-width/2,-h-11,width*Math.max(0,e.hp)/e.maxHp,3);
  c.restore();
  if(e.woodsBehavior==='wisp'&&(e.exposed??0)===0) for(const ally of s.enemies.filter(a=>a.id!==e.id&&Math.hypot(a.x-e.x,a.y-e.y)<160)) {c.save();c.strokeStyle='#f2c87960';c.lineWidth=1.2;c.beginPath();c.moveTo(e.x,e.y-18);c.quadraticCurveTo((e.x+ally.x)/2,e.y-40,ally.x,ally.y-18);c.stroke();c.restore();}
  return true;
}
export function drawWoodsMachinery(c:CanvasRenderingContext2D,s:GameState) {
  if(s.mapId!=='woods-heartwood-engine') return;
  for(const [n,x] of [[0,224],[1,512]]) {
    const broken=hasFieldFlag(s,`woods-anchor-${n}-broken`),powered=hasFieldFlag(s,`woods-anchor-${n}-powered`);
    c.save();c.strokeStyle=powered?amber:plum;c.lineWidth=powered?2:4;c.beginPath();c.moveTo(x,330);c.bezierCurveTo(x,260,448,330,448,224);c.stroke();
    ellipse(c,x,314,18,16,broken?'#536969':pine);c.strokeStyle=amber;c.lineWidth=2;c.beginPath();c.moveTo(x-8,306);c.lineTo(x+2,315);c.lineTo(x-4,324);c.stroke();
    if(powered) ellipse(c,x,314,5,5,amber);c.restore();
  }
}

// Released fire remains visible while damaging; never preview its landing point.
export function drawWoodsHazard(c:CanvasRenderingContext2D,e:Enemy) {
  if(e.hp<=0 || e.woodsBehavior!=='lantern' || e.windup>0 || e.actionTimer<=0) return;
  c.save();ellipse(c,e.tellX??e.x,e.tellY??e.y,24,24,'#f2a35f48');c.restore();
}
