import { GLOBE_DESTINATIONS, GLOBE_PATCHES, globeProject, globeDistance, type GlobeSession } from './globe';
export function globeFrame(w:number,h:number) { const r=Math.max(w*.57,h*.56); return {r,cx:w/2,cy:r+h*.3}; }
export function drawGlobe(c:CanvasRenderingContext2D,w:number,h:number,s:GlobeSession,available:(id:string)=>boolean,depth=false,reduced=false) {
  c.clearRect(0,0,w,h);
  const {r,cx,cy}=globeFrame(w,h);
  const lift=s.phase==='takeoff'?Math.min(1,s.phaseTime/1.25):s.phase==='landing'?1-Math.min(1,s.phaseTime/1.8):1;
  if(!depth) {
    const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#071827');sky.addColorStop(.55,'#234958');sky.addColorStop(1,'#4a7882');c.fillStyle=sky;c.fillRect(0,0,w,h);
    for(let n=0;n<70;n++){c.fillStyle=n%3?'#a3c9cc80':'#e7d8b1';c.beginPath();c.arc((n*137.3)%w,(n*73.9)%(h*.3),n%3?.6:1,0,Math.PI*2);c.fill();}
    const atmosphere=c.createRadialGradient(cx,cy,r*.98,cx,cy,r*1.065);atmosphere.addColorStop(0,'#9bdcd5aa');atmosphere.addColorStop(1,'#78c8d000');c.fillStyle=atmosphere;c.beginPath();c.arc(cx,cy,r*1.065,0,Math.PI*2);c.fill();
    const ocean=c.createRadialGradient(cx-r*.35,cy-r*.6,r*.08,cx,cy,r);ocean.addColorStop(0,'#639da3');ocean.addColorStop(.55,'#326c86');ocean.addColorStop(1,'#163448');c.fillStyle=ocean;c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fill();
    for(const patch of GLOBE_PATCHES) {
      if(!patch.land)continue;
      const mid=globeProject(patch.lat+.032,patch.lon+.032,s);if(mid.z<.035)continue;
      const points=patch.polygon.map(([lat,lon])=>globeProject(lat,lon,s));
      if(points.some(p=>p.z<0))continue;
      c.globalAlpha=.65+mid.z*.35;c.fillStyle=patch.color;c.beginPath();points.forEach((p,i)=>{if(i===0)c.moveTo(cx+p.x*r,cy-p.y*r);else c.lineTo(cx+p.x*r,cy-p.y*r);});c.closePath();c.fill();
    }c.globalAlpha=1;
    // Meridian arcs and rolling cloud banks are actual sphere projections.
    for(let n=0;n<12;n++){c.strokeStyle=n%2?'#dcebd520':'#9fc5bb18';c.lineWidth=n%2?7:1;c.beginPath();let started=false;
      for(let k=0;k<64;k++){const lat=-1.4+k*.045,lon=n*Math.PI/6-3.14+(n%2&&!reduced?s.elapsed*.002:0);const p=globeProject(lat,lon,s);if(p.z<.04){started=false;continue;}const x=cx+p.x*r,y=cy-p.y*r;if(!started){c.moveTo(x,y);started=true;}else c.lineTo(x,y);}c.stroke();}
    const shade=c.createRadialGradient(cx-r*.3,cy-r*.6,r*.4,cx,cy,r);shade.addColorStop(0,'#091a2900');shade.addColorStop(.75,'#091a2920');shade.addColorStop(1,'#091a2988');c.fillStyle=shade;c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fill();
  }
  for(const d of [...GLOBE_DESTINATIONS].sort((a,b)=>globeProject(a.lat,a.lon,s).z-globeProject(b.lat,b.lon,s).z)){
    const p=globeProject(d.lat,d.lon,s);if(p.z<.12)continue;
    const x=cx+p.x*r,y=cy-p.y*r;if(x<20||x>w-20||y<115||y>h*.66)continue;
    const selected=d.id===s.selected, unlocked=available(d.id),scale=.5+p.z*.5;
    c.save();c.translate(x,y);c.scale(scale,scale);
    c.strokeStyle=unlocked?'#ead29a':'#9ca6b1';c.lineWidth=2;c.fillStyle=selected?'#f6cf7e':unlocked?'#78d5bb':'#657287';
    c.beginPath();c.moveTo(0,0);c.lineTo(-7,-15);c.quadraticCurveTo(-12,-31,0,-33);c.quadraticCurveTo(12,-31,7,-15);c.closePath();c.fill();c.stroke();
    c.fillStyle='#163f4a';c.font='bold 13px system-ui';c.textAlign='center';c.fillText(unlocked?'•':'×',0,-18);
    // Each region has its own small landmark silhouette on the spherical surface.
    c.fillStyle=unlocked?'#bccda1':'#758b87';
    if(d.landmark==='rocket'){c.beginPath();c.moveTo(22,-8);c.lineTo(17,-17);c.lineTo(22,-37);c.lineTo(27,-17);c.closePath();c.fill();c.fillStyle='#ebc77f';c.fillRect(19,-17,6,3);}
    else if(d.landmark==='woods'){for(let n=0;n<3;n++){c.beginPath();c.moveTo(14+n*7,-8);c.lineTo(19+n*7,-28-n%2*5);c.lineTo(24+n*7,-8);c.closePath();c.fill();}}
    else if(d.landmark==='crater'){c.strokeStyle='#d0b995';c.beginPath();c.ellipse(25,-12,13,6,0,0,Math.PI*2);c.stroke();}
    else if(d.landmark==='rift'){c.strokeStyle='#b89cd0';c.beginPath();c.ellipse(22,-22,6,14,0,0,Math.PI*2);c.stroke();}
    else {c.fillRect(14,-25,24,17);c.fillStyle='#a8c5ba';c.beginPath();c.moveTo(12,-25);c.lineTo(26,-35);c.lineTo(40,-25);c.closePath();c.fill();c.fillStyle='#315263';for(let n=0;n<3;n++)c.fillRect(18+n*7,-22,3,6);}
    c.font='600 12px system-ui';const width=c.measureText(d.name).width+16;c.fillStyle='#102b39e8';c.beginPath();c.roundRect(-width/2,-62,width,24,6);c.fill();c.fillStyle='#e9e3cc';c.fillText(d.name,0,-45);c.restore();
  }
  const taxiX=w/2,taxiY=h*.48+(reduced?0:Math.sin(s.elapsed*2)*3)+(1-lift)*60;
  c.save();c.translate(taxiX,taxiY);c.scale(w<600?1:1.4,w<600?1:1.4);
  c.fillStyle='#102b3860';c.beginPath();c.ellipse(0,32,38,9,0,0,Math.PI*2);c.fill();
  const body=c.createLinearGradient(0,-20,0,10);body.addColorStop(0,'#f3d28a');body.addColorStop(.5,'#c39653');body.addColorStop(1,'#806943');c.fillStyle=body;c.beginPath();c.roundRect(-32,-9,64,22,8);c.fill();c.beginPath();c.roundRect(-22,-31,44,27,9);c.fill();
  c.fillStyle='#274c60';c.beginPath();c.roundRect(-17,-27,34,16,5);c.fill();c.strokeStyle='#a6cfce';c.lineWidth=1;c.beginPath();c.moveTo(-13,-24);c.lineTo(7,-24);c.stroke();
  for(let n=0;n<5;n++){c.fillStyle=['#85cdd0','#e9c26f','#95bb78','#b09dd8','#a8e6c9'][n];c.beginPath();c.arc(-12+n*6,-16,2.6,0,Math.PI*2);c.fill();}
  c.fillStyle='#f4dfa4';for(const x of [-26,18]){c.beginPath();c.roundRect(x,0,8,5,2);c.fill();}
  c.fillStyle='#324448';c.beginPath();c.roundRect(-12,6,24,4,2);c.fill();
  c.strokeStyle='#d1b47e';c.lineWidth=3;c.beginPath();c.moveTo(0,-32);c.lineTo(0,-45);c.stroke();
  c.save();c.translate(0,-45);c.rotate(reduced?0:s.elapsed*12);c.fillStyle='#8dbdb4';c.beginPath();c.ellipse(0,0,22,3,0,0,Math.PI*2);c.fill();c.restore();c.restore();
  if(s.offer || s.intercept>0){c.save();c.translate(w*.72,h*.37);c.fillStyle='#d6b88b';c.beginPath();c.ellipse(0,0,25,32,0,0,Math.PI*2);c.fill();c.strokeStyle='#a0bfc4';c.lineWidth=2;c.stroke();c.beginPath();c.moveTo(-15,25);c.lineTo(-10,52);c.moveTo(15,25);c.lineTo(10,52);c.stroke();c.fillStyle='#647d7d';c.fillRect(-14,48,28,14);c.restore();}
  const d=GLOBE_DESTINATIONS.find(d=>d.id===s.selected);
  if(d){c.fillStyle='#d7e6da';c.font='12px system-ui';c.textAlign='center';c.fillText(`${Math.round(globeDistance(s,d)*180/Math.PI)}° to ${d.name}`,w/2,h*.6);}
}
