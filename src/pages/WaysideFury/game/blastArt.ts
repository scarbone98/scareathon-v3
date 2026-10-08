import type { WorldProp } from './worldBuilder';
export const BLAST_ART=new Set(['canyon-rock','blast-scrap','ash-tuft','bank-stones','plaza-fragment','wreck-truck','fallen-pole','impact','rubble','broken-bridge','bridge-rail','ruin-house','tractor','hay-bale','shelf','ember-vent','pillar','gate-wall','fountain','fallen-statue','rift-shard','floating-debris','ground-crack','dead-tree','loading-dock','forklift']);
const cache=new Map<string,HTMLCanvasElement>();
// Original Canvas illustrations at 4 source pixels per world unit. Fine material
// marks are deterministic and cached; no raster upscaling or borrowed game art.
export function drawBlastProp(ctx:CanvasRenderingContext2D,p:WorldProp) {
  if(!BLAST_ART.has(p.kind))return false;
  const key=`${p.kind}:${p.w}:${p.h}`;
  let image=cache.get(key);
  if(!image) {
    image=document.createElement('canvas');image.width=p.w*4;image.height=p.h*4;
    const c=image.getContext('2d')!;c.scale(4,4);const w=p.w,h=p.h;
    const rect=(x:number,y:number,ww:number,hh:number,color:string)=>{c.fillStyle=color;c.fillRect(x,y,ww,hh);};
    const line=(x:number,y:number,xx:number,yy:number,color:string,lw=1)=>{c.strokeStyle=color;c.lineWidth=lw;c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();};
    const ellipse=(x:number,y:number,rx:number,ry:number,color:string)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
    const poly=(pts:number[][],color:string)=>{c.fillStyle=color;c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
    ellipse(w/2,h*.9,w*.46,h*.09,'#292a31');
    const k=p.kind;
    if(k==='blast-scrap'||k==='ash-tuft'||k==='bank-stones'||k==='plaza-fragment') {
      c.clearRect(0,0,w,h);
      for(let n=0;n<6;n++) {
        const x=2+(n*13)%(w-5),y=3+(n*7)%(h-5);
        if(k==='ash-tuft'){line(x,h-1,x-3,y,'#615f50',.7);line(x,h-1,x+2,y-2,'#989075',.6);}
        else if(k==='bank-stones') {ellipse(x,y,2+n%2,1.5,n%2?'#7a817c':'#939b8d');line(x-1,y-1,x+1,y-1,'#b3b7a2',.5);}
        else if(k==='plaza-fragment') {poly([[x,y],[x+4,y-2],[x+5,y+2],[x,y+3]],'#797b7c');line(x,y,x+4,y-2,'#a6a494',.5);}
        else {line(x,y,x+4,y+2,n%2?'#897967':'#70666b',1.3);line(x,y-.5,x+3,y+1,'#aa927a',.4);}
      }
    } else if(k==='wreck-truck' ||k==='tractor'||k==='forklift') {
      for(const x of [w*.2,w*.76]){ellipse(x,h*.78,w*.12,h*.2,'#222931');ellipse(x,h*.78,w*.055,h*.1,'#7e7770');for(let n=0;n<8;n++){const a=n*Math.PI/4;line(x+Math.cos(a)*w*.04,h*.78+Math.sin(a)*h*.08,x+Math.cos(a)*w*.09,h*.78+Math.sin(a)*h*.16,'#434349',.7);}}
      rect(w*.08,h*.42,w*.8,h*.3,k==='tractor'?'#68705a':k==='forklift'?'#b58a49':'#64534d');
      poly([[w*.42,h*.42],[w*.46,h*.12],[w*.72,h*.09],[w*.8,h*.46]],'#9a7c61');
      poly([[w*.49,h*.18],[w*.68,h*.16],[w*.73,h*.38],[w*.48,h*.38]],'#2b414b');line(w*.5,h*.2,w*.67,h*.31,'#80969a');
      rect(w*.16,h*.45,w*.2,h*.08,'#b59b70');rect(w*.13,h*.38,w*.07,h*.16,'#383c40');
      for(let n=0;n<7;n++)line(w*(.12+n*.04),h*.58,w*(.12+n*.04),h*.7,'#282d32',.6);
      if(k==='wreck-truck' ){rect(w*.08,h*.18,w*.32,h*.24,'#454346');for(let n=0;n<5;n++)line(w*(.09+n*.065),h*.21,w*(.12+n*.065),h*.4,'#93816a');line(w*.52,h*.18,w*.65,h*.38,'#202a32',2);}
      for(let n=0;n<38;n++){const x=w*(.1+(n*17%75)/100),y=h*(.44+(n*7%25)/100);line(x,y,x+1.6,y+.4,n%3?'#89725a':'#b18c62',.5);}
      line(w*.42,h*.45,w*.42,h*.71,'#382f32',.8);line(w*.08,h*.73,w*.86,h*.73,'#9a8062',.7);
      if(k==='forklift'){rect(w*.84,0,w*.05,h*.87,'#a2a5a1');line(w*.85,h*.85,w,h*.85,'#b9bab2',3);line(w*.85,h*.73,w,h*.73,'#6b757a',2);}
    } else if(k==='dead-tree'||k==='fallen-pole') {
      line(w*.5,h*.94,w*.44,h*.18,'#4b403e',5);line(w*.48,h*.8,w*.39,h*.18,'#8a7562',1);
      if(k==='dead-tree'){for(const [x,y] of [[.1,.35],[.9,.28],[.2,.12],[.85,.6]]){line(w*.45,h*.5,w*x,h*y,'#504643',3);line(w*x,h*y,w*(x+.04),h*(y-.1),'#907863',.7);}}
      else {line(w*.08,h*.19,w*.92,h*.27,'#a59070',3);for(const x of [.18,.75]){ellipse(w*x,h*.23,2,3,'#b7b6a2');line(w*x,h*.23,w*(x+.15),h*.86,'#34363c',.7);}}
    } else if(k==='impact'||k==='ember-vent'||k==='fountain') {
      ellipse(w*.5,h*.53,w*.47,h*.43,k==='fountain'?'#858682':'#77615c');ellipse(w*.5,h*.52,w*.38,h*.32,'#303039');
      ellipse(w*.5,h*.53,w*.3,h*.23,k==='fountain'?'#476c75':k==='ember-vent'?'#b25338':'#242630');
      for(let n=0;n<18;n++){const a=n*Math.PI/9;line(w*.5+Math.cos(a)*w*.4,h*.53+Math.sin(a)*h*.36,w*.5+Math.cos(a)*w*.46,h*.53+Math.sin(a)*h*.43,'#bc9b7c',.7);}
      if(k==='ember-vent')for(let n=0;n<8;n++)line(w*(.25+n*.065),h*.65,w*(.3+n*.06),h*(.3+(n%3)*.08),'#f2a45c',1.5);
      if(k==='fountain'){rect(w*.46,h*.13,w*.08,h*.43,'#a4a593');ellipse(w*.5,h*.17,w*.2,h*.09,'#b5b3a0');}
    } else if(k==='ground-crack') {
      for(let n=0;n<5;n++){line(n*w/5,h*.5,(n+.6)*w/5,h*(n%2?.2:.8),'#252634',2);line((n+.6)*w/5,h*(n%2?.2:.8),(n+1)*w/5,h*.5,'#ad7977',.7);}
    } else if(k==='rift-shard'||k==='floating-debris'||k==='rubble'||k==='fallen-statue') {
      if(k==='fallen-statue'){rect(w*.1,h*.65,w*.22,h*.24,'#8d8980');poly([[w*.3,h*.76],[w*.45,h*.4],[w*.8,h*.42],[w*.9,h*.65],[w*.7,h*.83]],'#98988b');ellipse(w*.8,h*.35,w*.08,h*.14,'#aeb1a0');line(w*.5,h*.43,w*.61,h*.76,'#555b62',2);}
      else if(k==='rift-shard'){poly([[w*.12,h*.8],[w*.4,h*.04],[w*.82,h*.3],[w*.9,h*.78],[w*.5,h*.95]],'#685574');poly([[w*.4,h*.04],[w*.49,h*.62],[w*.82,h*.3]],'#a38aaa');line(w*.4,h*.15,w*.49,h*.62,'#edbee2',1.3);line(w*.49,h*.62,w*.8,h*.8,'#bb88bc',.8);}
      else for(let n=0;n<5;n++){const x=w*(.12+n*.14),y=h*(.3+(n%3)*.15);poly([[x,y+h*.28],[x+w*.1,y-h*.22],[x+w*.25,y],[x+w*.2,y+h*.25]],n%2?'#737679':'#969087');line(x+w*.1,y-h*.18,x+w*.2,y,'#c2aaa0',.6);}
      if(k==='floating-debris'){ellipse(w*.5,h*.95,w*.25,1,'#4f354f');}
    } else if(k==='canyon-rock') {
      poly([[0,h],[w*.06,h*.25],[w*.3,0],[w*.72,h*.04],[w*.96,h*.34],[w,h]],'#514c51');
      poly([[w*.06,h*.25],[w*.3,0],[w*.72,h*.04],[w*.6,h*.25],[w*.15,h*.4]],'#958777');
      for(let n=0;n<8;n++){const y=h*(.25+n*.085);line(w*.1,y,w*.9,y+(n%2?3:-2),'#756663',.7);}
      line(w*.6,h*.16,w*.46,h*.48,'#302f3d',2);line(w*.46,h*.48,w*.58,h*.72,'#b29177',.8);
    } else if(k==='pillar'||k==='gate-wall'||k==='ruin-house') {
      rect(2,h*.15,w-4,h*.75,'#5e666c');poly([[2,h*.15],[w*.15,2],[w-4,2],[w-2,h*.15]],'#a5a69a');
      for(let y=h*.24;y<h*.9;y+=9){line(2,y,w-2,y,'#373f48',.7);for(let x=4+(Math.floor(y/9)%2)*9;x<w-4;x+=18)line(x,y,x,y+8,'#858880',.6);}
      line(3,h*.18,3,h*.86,'#b9b5a2',1);rect(0,h*.87,w,h*.1,'#929084');
      if(k==='ruin-house'){poly([[0,h*.15],[w*.15,0],[w*.4,h*.09],[w*.65,0],[w,h*.22],[w*.8,h*.32],[w*.55,h*.13]],'#7e5b4b');rect(w*.42,h*.44,w*.18,h*.44,'#252c35');for(const x of [.16,.73]){rect(w*x,h*.38,w*.15,h*.22,'#2e3940');line(w*x,h*.38,w*(x+.15),h*.6,'#b09a79',2);}}
      if(k==='pillar') {rect(w*.25,h*.18,w*.08,h*.66,'#b5b2a2');line(w*.45,h*.4,w*.8,h*.49,'#2f3943',1.5);}
    } else if(k==='shelf') {
      for(const x of [2,w-5])rect(x,0,3,h,'#56636a');
      for(const y of [h*.3,h*.65,h*.9]){rect(0,y,w,3,'#9d9d8a');for(let n=0;n<3;n++){rect(6+n*w*.27,y-h*.2,w*.2,h*.18,n%2?'#a0805a':'#697777');line(7+n*w*.27,y-h*.14,10+n*w*.27,y-2,'#cfb892',.7);}}
    } else if(k==='hay-bale') {
      c.fillStyle='#9a8058';c.beginPath();c.roundRect(2,h*.15,w-4,h*.75,5);c.fill();for(let n=0;n<35;n++)line(4+(n*13)%(w-8),h*.2+(n*7)%(h*.6),8+(n*13)%(w-8),h*.24+(n*7)%(h*.6),'#c6a46a',.5);for(const x of [.25,.7])line(w*x,h*.18,w*x,h*.87,'#3a383c',2);
    } else {
      // Dock and bridge timber, with broken spans visibly absent over water.
      for(let x=0;x<w;x+=9){if(k==='broken-bridge'&&x>w*.3&&x<w*.65)continue;rect(x,h*.25,8,h*.65,'#8d765c');line(x+2,h*.3,x+3,h*.85,'#c1a378',.7);for(const y of [h*.36,h*.8])ellipse(x+4,y,.7,.7,'#373e44');}
      if(k==='bridge-rail'){rect(0,h*.2,w,3,'#b6a184');for(let x=4;x<w;x+=24)rect(x,0,3,h,'#6a6863');}
    }
    cache.set(key,image);
  }
  ctx.save();ctx.imageSmoothingEnabled=true;ctx.drawImage(image,p.x,p.y,p.w,p.h);ctx.restore();return true;
}
