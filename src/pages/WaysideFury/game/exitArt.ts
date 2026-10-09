import { isRoadScene, onRoad } from './roadNetwork.ts';
import { TILE, type WorldExit, type WorldMap } from './worldBuilder.ts';

// Presentation only: triggers, collision, arrivals and gates stay authored data.
export function nearExit(e: WorldExit, x: number, y: number) {
  return Math.hypot(Math.max(e.x-x,0,x-e.x-e.w),Math.max(e.y-y,0,y-e.y-e.h)) <= TILE*3;
}
export function exitDirection(world: WorldMap, e: WorldExit) {
  if (world.id.startsWith('interior-')) return 'south';
  const distances = [e.x, world.width-e.x-e.w, e.y, world.height-e.y-e.h];
  return (['west','east','north','south'] as const)[distances.indexOf(Math.min(...distances))];
}
export function exitCaption(world: WorldMap, e: WorldExit) {
  return `${({west:'‹',east:'›',north:'⌃',south:'⌄'})[exitDirection(world,e)]} ${e.name}`;
}
export function drawExitOpening(c: CanvasRenderingContext2D, world: WorldMap, e: WorldExit, open = true) {
  const direction=exitDirection(world,e),vertical=direction==='north'||direction==='south';
  const x=e.x+e.w/2,y=e.y+e.h/2;
  const angle=direction==='west'?Math.PI:direction==='north'?-Math.PI/2:direction==='south'?Math.PI/2:0;
  const interior=world.id.startsWith('interior-'),woods=world.id.startsWith('woods-'),moon=world.id.startsWith('moon-');
  if(interior) {
    c.save();
    c.fillStyle='#766452';c.fillRect(e.x,e.y+8,e.w,world.height-e.y+12);
    const fade=c.createLinearGradient(0,e.y,0,world.height+12);fade.addColorStop(0,'#10192300');fade.addColorStop(1,'#101923b0');c.fillStyle=fade;c.fillRect(e.x,e.y,e.w,world.height-e.y+12);
    c.fillStyle='#211f24';c.fillRect(e.x,e.y-24,e.w,40);
    c.fillStyle='#c1a27c';c.fillRect(e.x-3,e.y-27,5,45);c.fillRect(e.x+e.w-2,e.y-27,5,45);c.fillRect(e.x-3,e.y-27,e.w+6,5);
    c.fillStyle='#8f6649';c.beginPath();c.moveTo(e.x+2,e.y-22);c.lineTo(e.x+14,e.y-16);c.lineTo(e.x+14,e.y+19);c.lineTo(e.x+2,e.y+14);c.closePath();c.fill();
    c.strokeStyle='#bd9570';c.lineWidth=.8;c.stroke();c.fillStyle='#efce89';c.beginPath();c.arc(e.x+11,e.y+1,1.2,0,Math.PI*2);c.fill();c.restore();return;
  }
  const half=(vertical?e.w:e.h)/2;
  const length=direction==='west'?x:direction==='east'?world.width-x:direction==='north'?y:world.height-y;
  c.save();c.translate(x,y);c.rotate(angle);
  // A continuous path through the boundary replaces a floor-mounted device.
  c.fillStyle=woods?'#8c795a':moon?'#7d8ba4':world.id.startsWith('blast-')?'#8c795a':'#636b70';
  c.beginPath();c.moveTo(-18,-half+3);c.quadraticCurveTo(length*.4,-half-2,length+12,-half+2);
  c.lineTo(length+12,half-2);c.quadraticCurveTo(length*.4,half+2,-18,half-3);c.closePath();if(!isRoadScene(world)||!onRoad(world,x,y))c.fill();
  const shade=c.createLinearGradient(-12,0,length+12,0);shade.addColorStop(0,'#10192300');shade.addColorStop(.55,'#10192318');shade.addColorStop(1,'#101923b0');
  c.fillStyle=shade;c.fill();
  // Broken masonry / trail posts frame either side without narrowing the lane.
  for(const side of [-1,1]) {
    const py=side*(half+7);
    c.fillStyle=woods?'#405644':moon?'#9aa8ba':'#6d6861';
    c.beginPath();c.moveTo(-12,py-5);c.lineTo(-8,py-10);c.lineTo(7,py-8);c.lineTo(14,py+4);c.lineTo(2,py+8);c.lineTo(-13,py+5);c.closePath();c.fill();
    c.strokeStyle=woods?'#829375':'#aaa394';c.lineWidth=.8;c.beginPath();c.moveTo(-8,py-7);c.lineTo(6,py-5);c.stroke();
  }
  if(!open) {
    // Closed routes use a physical crossbar rather than a glowing plate.
    c.strokeStyle='#ac8b66';c.lineWidth=3;c.beginPath();c.moveTo(0,-half);c.lineTo(0,half);c.stroke();
    c.strokeStyle='#584b43';c.lineWidth=1;c.beginPath();c.moveTo(-2,-half);c.lineTo(-2,half);c.stroke();
  }
  c.restore();
}
