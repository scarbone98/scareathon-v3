import type { WorldProp } from './worldBuilder';
const artwork = new Map<string, HTMLCanvasElement>();
export const COUNTY_ART = new Set(['keeper','bench','crate','reeds','water-tower','windmill']);
// Original vector-authored detail, cached at 8 px/world unit. Both renderers
// use this art; footprints remain in worldBuilder, never inferred from pixels.
export function countyArtwork(kind: string) {
  let canvas=artwork.get(kind); if(canvas) return canvas;
  canvas=document.createElement('canvas');canvas.width=512;canvas.height=768;
  const c=canvas.getContext('2d')!;c.scale(8,8);
  const rect=(x:number,y:number,w:number,h:number,color:string)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  const line=(x:number,y:number,xx:number,yy:number,color:string,width=1)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();};
  if(kind==='keeper') {
    // Work apron, radio pouch, stitched cap and a warm readable face.
    rect(19,71,9,22,'#304e60');rect(35,71,9,22,'#304e60');
    rect(16,90,14,5,'#283d45');rect(34,90,14,5,'#283d45');
    c.fillStyle='#aa9f79';c.beginPath();c.roundRect(12,37,40,38,7);c.fill();
    rect(21,42,22,34,'#456c68');line(23,47,41,47,'#a3b5a1',1);rect(34,56,8,12,'#d3b580');rect(35,58,6,4,'#283e50');
    for(const x of [12,46]) {c.fillStyle='#cba786';c.beginPath();c.ellipse(x,68,4,6,0,0,Math.PI*2);c.fill();}
    c.fillStyle='#d4b18d';c.beginPath();c.ellipse(32,27,12,14,0,0,Math.PI*2);c.fill();
    rect(25,26,2,2,'#2b4146');rect(38,26,2,2,'#2b4146');line(29,34,35,34,'#8f6658',.7);
    c.fillStyle='#536e70';c.beginPath();c.ellipse(32,15,15,7,0,Math.PI,Math.PI*2);c.fill();rect(19,14,31,4,'#536e70');rect(26,11,10,3,'#d3b77e');
  } else if(kind==='water-tower') {
    for(const x of [12,48]) {rect(x,38,4,56,'#627a7e');rect(x,40,1,54,'#bed0c9');}
    for(let y=48;y<88;y+=16) {line(14,y,50,y+16,'#69888b',1.4);line(50,y,14,y+16,'#69888b',1.4);}
    const g=c.createLinearGradient(6,0,58,0);g.addColorStop(0,'#526d7a');g.addColorStop(.4,'#c8dad8');g.addColorStop(1,'#748a8d');c.fillStyle=g;
    c.beginPath();c.roundRect(6,16,52,32,8);c.fill();
    c.fillStyle='#c3d2c3';c.beginPath();c.ellipse(32,16,26,8,0,0,Math.PI*2);c.fill();
    rect(8,30,48,5,'#ccac70');rect(23,25,18,10,'#304f55');
    for(let n=0;n<12;n++) {rect(56,40+n*4,5,.6,'#cbd1b2');}
    for(let n=0;n<8;n++) rect(10+n*6,20,.5,3,'#d7e2d8');
  } else if(kind==='windmill') {
    rect(29,24,6,70,'#94755c');rect(30,26,1,66,'#dab589');
    for(let y=48;y<90;y+=12){line(20,y+12,32,y,'#6b7f7f');line(44,y+12,32,y,'#6b7f7f');}
    for(let n=0;n<8;n++){c.save();c.translate(32,28);c.rotate(n*Math.PI/4);rect(7,-1,22,2,'#527a83');rect(14,-7,14,6,'#aabcb4');for(let k=0;k<4;k++)line(15+k*3,-7,15+k*3,-1,'#e1d7b1',.5);c.restore();}
    c.fillStyle='#dfbe77';c.beginPath();c.arc(32,28,4,0,Math.PI*2);c.fill();
    rect(4,72,18,14,'#566c69');rect(6,74,14,3,'#c5ac7b');
  } else if(kind==='bench') {
    for(const x of [8,48]) {rect(x,75,4,19,'#3c5357');line(x,76,x+6,89,'#a4b4a4');}
    for(let y=56;y<72;y+=5){rect(5,y,54,4,'#b0956e');rect(6,y,52,.6,'#e0c7a0');}
    rect(3,76,58,5,'#ae8e66');line(4,76,60,76,'#edd2a7');
    for(const x of [10,50]) for(const y of [58,63,68,78])rect(x,y,.8,.8,'#33494a');
  } else if(kind==='crate') {
    rect(6,44,52,44,'#846b53');rect(6,44,52,4,'#d2ae7c');
    for(let x=8;x<58;x+=8){rect(x,48,1,40,'#554f45');rect(x+2,49,.5,37,'#b69972');}
    rect(6,53,52,5,'#bea178');rect(6,78,52,5,'#bea178');
    line(10,83,54,49,'#d3b88a',4);
    for(const x of [9,53])for(const y of [55,80])rect(x,y,1,1,'#374c4f');
    rect(26,59,16,12,'#d7d0a8');rect(29,62,10,1,'#607065');rect(29,65,7,1,'#607065');
  } else {
    for(let n=0;n<22;n++){const x=6+(n*17)%52,y=66+(n*7)%24;line(x,94,x+(n%3-1)*6,y,'#738f64',.8);line(x,88,x-4,y+8,'#a2ad76',.6);rect(x-1,y-7,2,8,n%3?'#b7a270':'#d9b877');}
  }
  artwork.set(kind,canvas);return canvas;
}
export function drawCountyProp(c:CanvasRenderingContext2D,p:WorldProp) {
  if(!COUNTY_ART.has(p.kind))return false;
  c.drawImage(countyArtwork(p.kind),p.x,p.y,p.w,p.h);return true;
}
