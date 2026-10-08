import type { WorldProp } from './worldBuilder';

// Ground layers are painted before Y-sorted actors in both normal and fixture views.
export const GROUND_DECALS = new Set<WorldProp['kind']>(['puddle', 'debris', 'crater', 'impact', 'ember-vent', 'ground-crack', 'blast-scrap', 'ash-tuft', 'bank-stones', 'plaza-fragment']);
export const EMBEDDED_BLAST = new Set<WorldProp['kind']>(['canyon-rock', 'rubble', 'fallen-statue', 'rift-shard', 'floating-debris']);

export function drawScorchedDepression(c: CanvasRenderingContext2D, w: number, h: number, hot = false) {
  const x=w/2,y=h/2,rx=w*.48,ry=h*.46;
  c.save();
  c.save();c.translate(x,y);c.scale(rx,ry);
  const bowl=c.createRadialGradient(0,.16,.02,0,0,1);
  bowl.addColorStop(0,hot?'#743c2e':'#24252b');bowl.addColorStop(.5,'#343035');bowl.addColorStop(.78,'#59463f');bowl.addColorStop(.92,'#827061');bowl.addColorStop(1,'#75665800');
  c.fillStyle=bowl;c.beginPath();c.ellipse(0,0,1,1,0,0,Math.PI*2);c.fill();c.restore();
  c.lineCap='round';
  for(const [start,end,color,width]of [[Math.PI,Math.PI*2,'#b19a7b',h*.045],[0,Math.PI,'#28282e',h*.075]] as const){
    c.strokeStyle=color;c.lineWidth=Math.max(.7,width);c.beginPath();c.ellipse(x,y,rx*.84,ry*.79,0,start,end);c.stroke();
  }
  for(let n=0;n<43;n++){
    const a=n*2.39996,r=.3+(n*17%67)/100,px=x+Math.cos(a)*rx*r,py=y+Math.sin(a)*ry*r;
    c.fillStyle=n%9===0?'#c77e47':n%3?'#8b7d6a80':'#171e2580';
    c.beginPath();c.ellipse(px,py,n%9===0?.6:1.1,.45,0,0,Math.PI*2);c.fill();
  }
  c.restore();
}

export function footprintGrounding(heightAt:(x:number,z:number)=>number,x:number,z:number,w:number,d:number,rotation=0) {
  const cos=Math.cos(rotation),sin=Math.sin(rotation);
  const sample=(u:number,v:number)=>heightAt(x+u*cos+v*sin,z-u*sin+v*cos);
  const heights=[sample(0,0)];
  for(const u of [-w/2,0,w/2])for(const v of [-d/2,0,d/2])heights.push(sample(u,v));
  return {base:Math.min(...heights),tiltX:Math.atan2(sample(0,d/2)-sample(0,-d/2),d),tiltZ:-Math.atan2(sample(w/2,0)-sample(-w/2,0),w)};
}
