import { MATERIALS } from './terrain.ts';
import { TILE, tileAt, type WorldMap } from './worldBuilder.ts';

// Feather the county's authored material boundaries at native resolution. The
// collision cells, road ribbons and dungeon ground stay exactly as authored.
export function drawOverworldBanks(c: CanvasRenderingContext2D, world: WorldMap, bounds: {x:number;y:number;w:number;h:number}) {
  if(world.id!=='overworld')return;
  const left=Math.max(0,Math.floor(bounds.x/TILE)-1),right=Math.min(world.cols,Math.ceil((bounds.x+bounds.w)/TILE)+1);
  const top=Math.max(0,Math.floor(bounds.y/TILE)-1),bottom=Math.min(world.rows,Math.ceil((bounds.y+bounds.h)/TILE)+1);
  c.save();c.lineCap='round';c.lineJoin='round';
  for(let row=top;row<bottom;row++)for(let col=left;col<right;col++) {
    const kind=tileAt(world,col,row);
    if(!['stone','ash','corrupt','sand','dirt'].includes(kind))continue;
    const x=col*TILE,y=row*TILE;
    c.save();c.beginPath();c.rect(x,y,TILE,TILE);c.clip();
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const neighbor=tileAt(world,col+dx,row+dy);
      // Water owns its bank and roads own their curb; do not tint those layers.
      if(neighbor===kind || !['grass','ash','corrupt','stone','dirt','sand'].includes(neighbor))continue;
      c.strokeStyle=MATERIALS[neighbor][0];
      for(const [width,alpha] of [[14,.16],[8,.24],[3,.4]]) {
        c.lineWidth=width;c.globalAlpha=alpha;c.beginPath();
        for(let i=0;i<=8;i++) {
          const along=i*2,phase=(dx?y+along:x+along)*.31;
          const inset=.7+Math.sin(phase)*.65;
          const px=dx<0?x+inset:dx>0?x+TILE-inset:x+along;
          const py=dy<0?y+inset:dy>0?y+TILE-inset:y+along;
          if(i)c.lineTo(px,py);else c.moveTo(px,py);
        }
        c.stroke();
      }
    }
    c.restore();
  }
  c.restore();
}
