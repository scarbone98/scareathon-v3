// Part A vector staging. Part B can replace cast art through the spaceOutfit flag.
// Draw functions sample simulation only; no timeline, collision or rewards live here.
import type { GameState, Enemy } from './sim.ts';
import type { WorldMap, WorldProp } from './world.ts';
import { sampleSpaceFilm } from './chapters/ch3Films.ts';
import { hasSpaceFlag, lunarLift } from './lunar.ts';
const silver='#dae4f2',ink='#111829',amber='#f5c776',magenta='#ce6bbb';
function ellipse(c:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,color:string|CanvasGradient) {c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();}
function line(c:CanvasRenderingContext2D,x:number,y:number,xx:number,yy:number,color:string,w=1) {c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();}
function rocket(c:CanvasRenderingContext2D,x:number,y:number,size=1,flame=0) {
  c.save();c.translate(x,y);c.scale(size,size);
  const g=c.createLinearGradient(-14,0,14,0);g.addColorStop(0,'#79899c');g.addColorStop(.35,'#fff8ed');g.addColorStop(1,'#adb9ca');
  c.fillStyle=g;c.beginPath();c.moveTo(-12,0);c.lineTo(-12,-65);c.quadraticCurveTo(-8,-89,0,-100);c.quadraticCurveTo(8,-89,12,-65);c.lineTo(12,0);c.closePath();c.fill();
  for(const dy of [-20,-40,-60]) {c.fillStyle=dy===-40?amber:'#7b8c9d';c.fillRect(-12,dy,24,dy===-40?10:2);}
  ellipse(c,0,-65,5,7,'#31546e');line(c,-2,-69,2,-66,'#c1e7f9',1);
  for(const side of [-1,1]) {c.fillStyle='#d69448';c.beginPath();c.moveTo(side*12,-20);c.lineTo(side*23,4);c.lineTo(side*10,0);c.fill();}
  if(flame>0) {const f=c.createLinearGradient(0,0,0,flame);f.addColorStop(0,'#fff5ca');f.addColorStop(.3,'#f5b468');f.addColorStop(1,'#ea755000');c.fillStyle=f;c.beginPath();c.moveTo(-9,0);c.quadraticCurveTo(-17,flame*.6,0,flame);c.quadraticCurveTo(17,flame*.6,9,0);c.fill();}
  c.restore();
}
function earth(c:CanvasRenderingContext2D,x:number,y:number,r:number) {
  const g=c.createRadialGradient(x-r*.3,y-r*.4,r*.02,x,y,r);g.addColorStop(0,'#8dd8f1');g.addColorStop(.65,'#438ed4');g.addColorStop(1,'#173957');ellipse(c,x,y,r,r,g);
  c.save();c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.clip();
  for(let n=0;n<7;n++) {ellipse(c,x+Math.sin(n*2)*r*.65,y+(n/6-.5)*r*1.6,r*.24,r*.1,n%2?'#7caa98':'#e4f5fa');}c.restore();
}
export function drawSpaceProp(c:CanvasRenderingContext2D,p:WorldProp,s:GameState) {
  if(p.kind==='fence' && (s.mapId==='space-launch'||p.x>=1328)) {
    c.save(); const vertical=p.h>20;
    const length=vertical?p.h:p.w, start={x:vertical?p.x+p.w/2:p.x,y:vertical?p.y:p.y+p.h};
    for(let n=0;n<=length;n+=16) {const x=start.x+(vertical?0:n),y=start.y+(vertical?n:0);line(c,x,y,x,y-20,silver,1.5);}
    for(const lift of [8,18])line(c,start.x,start.y-lift,start.x+(vertical?0:length),start.y+(vertical?length:0)-lift,'#aabacb',1);
    for(let n=0;n<length;n+=8) {const x=start.x+(vertical?0:n),y=start.y+(vertical?n:0);line(c,x,y-17,x+(vertical?4:8),y+(vertical?8:0)-5,'#bdcbd865',.6);}
    c.restore();return true;
  }
  if(!['rocket','gantry','tank','control','locker','air','socket','seal','lander','dish','flag'].includes(p.kind)) return false;
  c.save(); const x=p.x+p.w/2,y=p.y+p.h;
  c.globalAlpha=(p.kind==='rocket'||p.kind==='gantry')&&Math.abs(s.x-x)<p.w/2+14&&s.y<y+12?.45:1;
  ellipse(c,x+8,y+4,p.w*.65,6,'#11182935');
  if(p.kind==='rocket') rocket(c,x,y,p.h/100);
  if(p.kind==='gantry') {
    for(const xx of [p.x+12,p.x+p.w-12]) {line(c,xx,p.y,xx,y,'#596e82',5);for(let yy=p.y;yy<y;yy+=20) {line(c,xx-5,yy,xx+5,yy+20,'#a8bec9',1);}}
    for(let yy=p.y;yy<y;yy+=32) {line(c,p.x+12,yy,p.x+p.w-12,yy,'#76899c',3);line(c,p.x+12,yy,p.x+p.w-12,yy+32,'#516475',1);}
  }
  if(p.kind==='tank') {
    const g=c.createLinearGradient(p.x,0,p.x+p.w,0);g.addColorStop(0,'#64768b');g.addColorStop(.4,'#e3ecf4');g.addColorStop(1,'#738398');c.fillStyle=g;c.fillRect(p.x,p.y+12,p.w,p.h-16);ellipse(c,x,p.y+12,p.w/2,12,silver);ellipse(c,x,y-4,p.w/2,5,'#65758a');
    for(let yy=p.y+22;yy<y-8;yy+=14) line(c,p.x,yy,p.x+p.w,yy,'#8798a7');
    line(c,x,y,x,y+12,'#f5c776',3);line(c,x,y+12,x-24,y+12,'#7d8c9b',2);
  }
  if(p.kind==='control'||p.kind==='locker') {
    c.fillStyle='#394759';c.fillRect(p.x,p.y,p.w,p.h);c.fillStyle='#93adba';c.fillRect(p.x+3,p.y+3,p.w-6,5);
    const count=p.kind==='locker'?5:4;
    for(let n=0;n<count;n++) {const xx=p.x+5+n*(p.w-10)/count;c.fillStyle=p.kind==='locker'?silver:'#3f7e94';c.fillRect(xx,p.y+16,(p.w-14)/count,p.h-24);line(c,xx+2,p.y+24,xx+6,p.y+20,'#e3f7fc',1);}
  }
  if(p.kind==='air'||p.kind==='socket') {
    c.fillStyle='#465a6b';c.fillRect(p.x,p.y+10,p.w,p.h-10);
    const powered=hasSpaceFlag(s,p.id)||p.kind==='air';ellipse(c,x,p.y+10,p.w*.42,7,p.kind==='air'?'#95dde7':powered?amber:magenta);
    c.fillStyle=ink;c.font='bold 7px sans-serif';c.textAlign='center';c.fillText(p.kind==='air'?'AIR':powered?'OFF':'⚡',x,p.y+13);
    if(p.kind==='air') {line(c,x+7,y,x+17,y+9,'#b7dce6',2);ellipse(c,x+18,y+10,3,3,amber);}
  }
  if(p.kind==='seal'&&!hasSpaceFlag(s,p.id)) {c.fillStyle='#52647b';c.fillRect(p.x,p.y,p.w,p.h);line(c,x-8,p.y+4,x+2,p.y+15,amber,2);line(c,x+2,p.y+15,x-4,y-5,amber,2);}
  if(p.kind==='lander') {
    c.fillStyle='#d9e4ee';c.beginPath();c.moveTo(x-25,y-25);c.lineTo(x-20,p.y+16);c.lineTo(x+20,p.y+16);c.lineTo(x+25,y-25);c.fill();
    ellipse(c,x,p.y+24,13,9,'#2f647f');for(const side of [-1,1]) {line(c,x+side*20,y-30,x+side*37,y,silver,3);line(c,x+side*29,y,x+side*44,y,silver,3);}c.fillStyle=amber;c.fillRect(x-10,y-25,20,22);
  }
  if(p.kind==='dish') {line(c,x,y,x,p.y+40,'#899bac',5);c.fillStyle=silver;c.beginPath();c.ellipse(x,p.y+30,40,20,-.35,0,Math.PI);c.fill();line(c,x-20,p.y+30,x+5,p.y+5,amber,2);ellipse(c,x+5,p.y+5,5,5,s.campaignMilestones.includes('prism-lens')?amber:magenta);}
  if(p.kind==='flag') {line(c,x,y,x,p.y,silver,2);c.fillStyle=magenta;c.beginPath();c.moveTo(x,p.y);c.lineTo(x+40,p.y+8);c.lineTo(x,p.y+18);c.fill();}
  c.restore();return true;
}
export function drawMoonGround(c:CanvasRenderingContext2D,world:WorldMap,s:GameState) {
  if(!world.id.startsWith('moon-'))return;
  c.save();c.fillStyle='#858ea4';c.fillRect(16,16,world.width-32,world.height-32);
  // Quiet regolith: bounded smooth grain and long side shadows, no checkerboard.
  for(let n=0;n<260;n++) {const x=24+(n*137)% (world.width-48),y=24+(n*79)%(world.height-48);ellipse(c,x,y,1+(n%4)*.5,.7,n%3?'#dae4f226':'#11182924');}
  c.strokeStyle='#c1cbd355';c.lineWidth=1;for(let n=0;n<10;n++) {c.beginPath();c.ellipse(100+n*61,70+(n%2)*(world.height-140),34,12,-.3,0,Math.PI*2);c.stroke();}
  if(world.id==='moon-m01') earth(c,world.width-88,52,24);
  for(const link of world.boundLinks??[]) {
    line(c,link.from.x,link.from.y,link.to.x,link.to.y,'#f5c77670',2);
    for(const p of [link.from,link.to]) {c.strokeStyle=amber;c.beginPath();c.ellipse(p.x,p.y,24,14,0,0,Math.PI*2);c.stroke();}
  }
  if(world.id==='moon-m08') {ellipse(c,400,288,180,122,'#11182912');if(s.enemies.some(e=>e.behavior==='warden'&&e.phase===2&&!e.shieldBroken)) {c.strokeStyle=magenta;c.lineWidth=3;c.beginPath();c.ellipse(400,288,180,122,0,0,Math.PI*2);c.stroke();}}
  c.restore();
}
export function drawLunarTelegraph(c:CanvasRenderingContext2D,e:Enemy) {
  if(!e.behavior||e.windup<=0)return false;
  c.save();c.strokeStyle=amber;c.fillStyle='#f5c77628';c.lineWidth=2;
  if((e.burst??0)>0 || e.behavior==='warden'&&e.pattern===2 || e.behavior==='inspector'&&e.pattern===1) {c.beginPath();c.ellipse(e.x+((e.burst??0)>0?0:e.aimX*64),e.y+((e.burst??0)>0?0:e.aimY*64),64,64,0,0,Math.PI*2);c.fill();c.stroke();}
  else {const length=e.behavior==='walker'?68:150;c.beginPath();c.moveTo(e.x-e.aimY*10,e.y+e.aimX*10);c.lineTo(e.x+e.aimX*length-e.aimY*10,e.y+e.aimY*length+e.aimX*10);c.lineTo(e.x+e.aimX*length+e.aimY*10,e.y+e.aimY*length-e.aimX*10);c.lineTo(e.x+e.aimY*10,e.y-e.aimX*10);c.closePath();c.fill();c.stroke();}
  c.restore();return true;
}
export function drawSpaceSuit(c:CanvasRenderingContext2D,s:GameState) {
  if(!s.spaceOutfit)return;
  const lift=lunarLift(s),colors={you:'#a1efd0',joe:'#7ae1ef',matt:'#f5c776',alex:'#b5d999',jon:'#c8a5ed'};
  c.save();c.translate(s.x,s.y-lift);c.strokeStyle=colors[s.active];c.lineWidth=1.2;c.fillStyle='#eff5f744';
  c.beginPath();c.ellipse(0,-19,10,11,0,0,Math.PI*2);c.fill();c.stroke();line(c,-6,-26,-2,-28,'#fff9e9',1.5);
  c.fillStyle='#f1f5ee';c.fillRect(-7,-12,14,9);line(c,-5,-11,-5,-4,colors[s.active],1.5);line(c,5,-11,5,-4,colors[s.active],1.5);c.restore();
}
export function drawSpaceFilm(c:CanvasRenderingContext2D,s:GameState,w:number,h:number,reduced:boolean,cast:(id:GameState['active'],x:number,y:number)=>void) {
  if(!s.film)return;
  const {shot,progress}=sampleSpaceFilm(s.film.id,s.film.elapsed),t=reduced?.5:progress;
  c.save();c.fillStyle=ink;c.fillRect(0,0,w,h);
  for(let n=0;n<90;n++) ellipse(c,(n*83)%w,(n*41)%(h*.7),n%5?.3:.65,.4,'#dae4f2aa');
  const x=w*.5,y=h*.55,kind=shot.composition;
  if(['crew','lockers','helmet','cabin','burger'].includes(kind)) {
    const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#35495c');g.addColorStop(1,ink);c.fillStyle=g;c.fillRect(w*.04,h*.08,w*.92,h*.6);
    for(let n=0;n<5;n++) {const xx=w*(.15+n*.175),yy=h*.48+(n%2)*4;
      if(kind==='lockers') {c.fillStyle='#899bac';c.fillRect(xx-12,h*.17,24,h*.4);line(c,xx,h*.2,xx,h*.35,amber,1);}
      cast((['joe','matt','alex','jon','you'] as const)[n],xx,yy);
      c.fillStyle=silver;c.font='5px sans-serif';c.textAlign='center';c.fillText(['Joe','Matt','Alex','Jon','You'][n],xx,yy+12);
    }
    if(kind==='burger') {const bx=w*(.25+t*.45),by=h*(.23+Math.sin(t*Math.PI)*.05);ellipse(c,bx,by,7,4,'#edb574');c.fillStyle='#62815b';c.fillRect(bx-7,by+1,14,2);line(c,bx,by,w*.67,h*.4,'#dae4f260');}
  } else if(kind==='earth') {
    const returning=s.film.id==='space-return';earth(c,x,y,h*(returning?.05+t*.3:.35-t*.3));
    c.strokeStyle='#a6becb';c.lineWidth=4;c.strokeRect(w*.08,h*.12,w*.84,h*.58);
  } else if(kind==='separation') {
    c.save();c.translate(x,y);c.rotate(.55);rocket(c,0,-t*24,.65,20+t*8);c.fillStyle='#c1ced9';c.fillRect(-8,10+t*38,16,32);line(c,-8,21+t*38,8,21+t*38,amber,5);c.restore();
  } else if(kind==='pad'||kind==='launch'||kind==='clouds') {
    c.fillStyle='#496576';c.fillRect(0,h*.66,w,h*.34);
    c.fillStyle='#708292';c.fillRect(w*.1,h*.57,w*.22,h*.1);
    for(let n=0;n<3;n++) ellipse(c,w*(.72+n*.07),h*.61,6,15,silver);
    for(const xx of [x-26,x+26]) line(c,xx,h*.22,xx,h*.67,'#8a9daa',2);
    rocket(c,x,h*(kind==='launch'?.65-t*.43:.63),Math.min(.6,w/300),kind==='launch'?30+t*20:0);
    if(kind==='launch'||kind==='clouds') for(let n=0;n<7;n++) ellipse(c,x+(n-3)*15,h*.68-(kind==='clouds'?t*h*.5:0),15+t*12,5+t*7,'#e0e9eb50');
  } else {
    c.fillStyle='#858ea4';c.beginPath();c.ellipse(x,h*.86,w*.8,h*.32,0,0,Math.PI*2);c.fill();earth(c,w*.8,h*.13,h*.04);
    if(kind==='moon') {line(c,x,h*.7,x,h*.48,silver,3);ellipse(c,x,h*.45,20,8,silver);ellipse(c,x,h*.69,4,4,magenta);}
    else {const yy=kind==='descent'?h*(.28+t*.33):kind==='reentry'?h*(.25+t*.25):h*.6;rocket(c,x,yy,.4,kind==='descent'?12:0);for(const side of [-1,1]) line(c,x+side*5,yy,x+side*17,yy+10,silver,2);
      if(kind==='reentry') {c.strokeStyle=amber;c.lineWidth=3;c.beginPath();c.arc(x,yy-32,25,Math.PI,Math.PI*2);c.stroke();line(c,x-25,yy-32,x,yy,silver);line(c,x+25,yy-32,x,yy,silver);}
    }
  }
  c.fillStyle=amber;c.font='bold 7px sans-serif';c.textAlign='left';c.fillText(`${shot.id} · ${s.film.id.replace('space-','').toUpperCase()}`,8,12);c.restore();
}
