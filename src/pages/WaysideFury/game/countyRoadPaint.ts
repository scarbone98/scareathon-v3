import { junctionAt, roadPoints, roadWidth, type RoadPaint, type RoadPoint } from './roadNetwork.ts';
import type { WorldMap } from './worldBuilder.ts';

// Paint is measured along the entire polyline, never restarted at its vertices.
export function countyRoadPaint(world: WorldMap): RoadPaint[] {
  const result: RoadPaint[] = [];
  for (const road of world.roads) {
    const points = roadPoints(road), runs = [0];
    for (let i=1;i<points.length;i++) runs.push(runs[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
    const length = runs[runs.length-1]; if (!length) continue;
    const at = (distance:number): RoadPoint => {
      const i = Math.min(points.length-1, Math.max(1,runs.findIndex(run=>run>=distance)));
      const t = (distance-runs[i-1])/(runs[i]-runs[i-1] || 1), a = points[i-1], b = points[i];
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
    };
    const junction = (d:number) => {const p=at(d);return junctionAt(world,road,p.x,p.y);};
    const trim = (d:number) => road.start!=='junction' && d<44 || road.end!=='junction' && d>length-44;
    for (let d=0;d+2<=length;d+=2) {
      if (trim(d) || junction(d)===junction(d+2)) continue;
      const p = at(d), a = at(Math.max(0,d-.5)), b = at(Math.min(length,d+.5));
      const span = Math.hypot(b.x-a.x,b.y-a.y), dx=(b.x-a.x)/span,dy=(b.y-a.y)/span,half=roadWidth(road)/2-7;
      result.push({a:{x:p.x-dy*half,y:p.y+dx*half},b:{x:p.x+dy*half,y:p.y-dx*half},width:1.8,kind:'stop'});
    }
    for (let d=10;d+14<=length;d+=36) {
      if (trim(d) || trim(d+14)) continue;
      // Test the entire dash, including bends, before emitting any part of it.
      if (Array.from({length:8},(_,i)=>d+i*2).some(junction)) continue;
      const path = [at(d),...points.filter((_,i)=>runs[i]>d && runs[i]<d+14),at(d+14)];
      result.push({a:path[0],b:path[path.length-1],points:path,width:1.2,kind:'lane'});
    }
  }
  return result;
}
