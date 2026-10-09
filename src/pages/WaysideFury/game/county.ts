import { paint, prop, road, tileAt, TILE, overlaps, type WorldMap, type WorldProp } from './worldBuilder.ts';

export const COUNTY_STOPS = [
  { id: 'rain-garden', name: 'Station Rain Garden', x: 160, y: 704, text: 'The luggage keeper: Our rain garden catches every storm. Take the causeway east or follow the long reservoir loop. Both roads come home.' },
  { id: 'reservoir', name: 'Reservoir Lookout', x: 768, y: 1280, text: 'The reservoir keeper: That little maintenance road across the water saves a long drive. The birds prefer the scenic route. So do I.' },
  { id: 'scrap-orchard', name: 'Scrap Orchard', x: 1760, y: 1280, text: 'The orchard mechanic: We grow spare parts here. The launch compound is north; the county shortcut is west. No moving traffic, just us and the wind.' },
] as const;
export const COUNTY_DISTRICTS = [
  { id: 'station-garden', name: 'Station rain garden', bounds: { x: 64, y: 560, w: 320, h: 656 }, radarAnchorId: 'county-rain-garden' },
  { id: 'reservoir-bank', name: 'Reservoir causeway', bounds: { x: 384, y: 640, w: 752, h: 800 }, radarAnchorId: 'county-reservoir' },
  { id: 'scrap-orchard', name: 'Scrap orchard', bounds: { x: 1280, y: 576, w: 864, h: 864 }, radarAnchorId: 'county-orchard' },
] as const;

// All new geometry is beyond the original landmarks; old personal finds keep
// their coordinates. Road terminals overlap actual junctions, including bends.
export function dressCounty(m: WorldMap) {
  for (let n = 0; n < 8; n++) {
    paint(m, 384 + n * 16, 688 + n * 48, 720 - n * 32, 64, 'sand');
  }
  // Paint the complete outer bank first. Interleaving bank/water passes carved
  // repeating dry stripes through the preceding row of the same reservoir.
  for (let n = 0; n < 8; n++) {
    paint(m, 416 + n * 16, 704 + n * 48, 656 - n * 32, 48, 'water', true);
  }
  const link = (id: string, x: number, y: number, w: number, h: number, direction: 'horizontal' | 'vertical') => road(m, { id, x, y, w, h, direction, start: 'junction', end: 'junction' });
  link('garden-loop', 128, 448, 64, 864, 'vertical');
  link('reservoir-loop', 128, 1248, 2048, 64, 'horizontal');
  link('orchard-loop', 2112, 448, 64, 864, 'vertical');
  link('county-shortcut', 1184, 448, 64, 864, 'vertical');
  link('reservoir-causeway', 128, 928, 1120, 64, 'horizontal');
  m.props=m.props.filter(p=>!m.roads.some(r=>overlaps({x:p.x-12,y:p.y-12,w:p.w+24,h:p.h+24},r)) || ['barrier','station','portal'].includes(p.kind) || p.y<560 && p.x<1280);
  paint(m, 64, 656, 64, 112, 'stone');
  paint(m, 704, 1312, 128, 64, 'stone');
  paint(m, 1696, 1312, 128, 64, 'stone');
  const landmark = (kind: WorldProp['kind'], x: number, y: number, w: number, h: number, label: string) => prop(m, kind, x, y, w, h, label);
  landmark('water-tower', 880, 1160, 64, 72, 'County water tower');
  landmark('windmill', 1936, 1120, 64, 88, 'The spare-parts windmill');
  landmark('shed', 40, 816, 80, 64, 'Luggage yard');
  landmark('shed', 1344, 720, 96, 64, 'Orchard workshop');
  landmark('bench', 724, 1332, 40, 20, 'Reservoir lookout');
  landmark('bench', 1700, 1332, 40, 20, 'Mechanic’s rest stop');
  landmark('sign', 72, 696, 24, 32, 'Rain garden');
  landmark('keeper', 88, 736, 16, 24, 'Luggage keeper');
  landmark('keeper', 800, 1330, 16, 24, 'Reservoir keeper');
  landmark('keeper', 1784, 1330, 16, 24, 'Orchard mechanic');
  // Clusters have a local vocabulary and quiet centers. Placement is bounded
  // and deterministic; roads, solid terrain, old objects and finds stay clear.
  const reserved = [{x:280,y:520,w:180,h:80}, {x:608,y:544,w:96,h:96}, {x:1110,y:470,w:100,h:120}];
  const place = (kind: WorldProp['kind'], x: number, y: number, w: number, h: number) => {
    const bounds = { x: x - 12, y: y - 12, w: w + 24, h: h + 24 };
    if (m.roads.some(r => overlaps(bounds, r)) || reserved.some(r => overlaps(bounds,r)) || m.props.some(p => overlaps(bounds,p))) return;
    if (![x, x+w].every(px => [y,y+h].every(py => tileAt(m,Math.floor(px/TILE),Math.floor(py/TILE))==='grass'))) return;
    prop(m,kind,x,y,w,h);
  };
  for (let n=0;n<108;n++) {
    const x=64+(n*173)%2160, y=576+(n*97)%864;
    const orchard=x>1280;
    place(n%3===0 ? 'tree' : 'pine',x,y,48+n%3*8,64);
    place(orchard?'crate':'bush',x+62,y+42,22,18);
    place(orchard?'reeds':'flower',x+78,y+16,24,16);
    place('rock',x-30,y+55,24,18);
  }
  // Route-edge clusters every ~100 units: 4–6 families in each sampled view.
  for (const r of m.roads) for(let d=64;d<(r.direction==='horizontal'?r.w:r.h)-48;d+=96) for(const side of [-1,1]) {
    const x=r.direction==='horizontal'?r.x+d:r.x+(side<0?-76:r.w+24);
    const y=r.direction==='vertical'?r.y+d:r.y+(side<0?-76:r.h+24);
    if(y<560 && x<1280) continue;
    place('tree',x,y,56,64);
    place(x>1280?'crate':'reeds',x+58,y+38,24,20);
    place('flower',x+30,y+64,20,12);
    place('rock',x+2,y+70,24,16);
  }
  for (const x of [576,672,768,864]) {
    prop(m,'reeds',x,898,28,22); prop(m,'reeds',x+32,1000,24,22);
    prop(m,'fence',x,906,40,12); prop(m,'fence',x+20,1008,40,12);
  }
  prop(m,'crate',1824,1320,24,20); prop(m,'reeds',1668,1336,24,20);
  prop(m,'flower',1800,1220,24,12); prop(m,'crate',1648,1320,24,20);
  m.props=m.props.filter(p=>!['tree','pine','rock'].includes(p.kind) || (p.footprints??[]).every(rect=>[rect.x,rect.x+rect.w-.01].every(x=>[rect.y,rect.y+rect.h-.01].every(y=>tileAt(m,Math.floor(x/TILE),Math.floor(y/TILE))==='grass'))));
  // Dry-land scatter predates the reservoir paint. Flowers and ordinary yard
  // fences cannot float in the lake; reeds remain as intentional bank plants.
  m.props=m.props.filter(p=>!['flower','bush','fence'].includes(p.kind) || tileAt(m,Math.floor((p.x+p.w/2)/TILE),Math.floor((p.y+p.h)/TILE))!=='water');
  m.radarAnchors = COUNTY_DISTRICTS.map(d=>({id:d.radarAnchorId,x:d.bounds.x+d.bounds.w/2,y:d.bounds.y+d.bounds.h/2}));
}
