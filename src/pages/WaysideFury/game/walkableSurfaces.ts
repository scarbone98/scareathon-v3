import type { CollisionRect, WorldMap, WorldProp } from './worldBuilder';

// Floors never enter the actor depth sort. Explicit metadata also supports
// chapter-specific art without guessing from labels (e.g. a locked bridge seal).
const DECKS = new Set<WorldProp['kind']>(['bridge', 'broken-bridge', 'dock', 'loading-dock', 'boardwalk', 'catwalk', 'ramp', 'stairs', 'rug', 'floor-decal']);
const DECALS = new Set<WorldProp['kind']>(['rug', 'floor-decal', 'puddle', 'ground-crack', 'impact', 'blast-scrap', 'ash-tuft', 'bank-stones', 'plaza-fragment']);
export function isWalkableSurface(p: WorldProp) { return !!p.surface || DECKS.has(p.kind); }
export function isGroundProp(p: WorldProp) { return isWalkableSurface(p) || DECALS.has(p.kind) || p.kind === 'bridge-rail'; }
export function surfaceDirection(p: WorldProp) { return p.surface?.direction ?? (p.w >= p.h ? 'horizontal' : 'vertical'); }
export function surfaceGap(p: WorldProp) { return p.surface?.gap ?? (p.kind === 'broken-bridge' ? [.25, .75] as const : undefined); }
export function surfaceRects(p: WorldProp): CollisionRect[] {
  const gap = surfaceGap(p);
  if (!gap) return [{ x: p.x, y: p.y, w: p.w, h: p.h }];
  return surfaceDirection(p) === 'horizontal'
    ? [{ x: p.x, y: p.y, w: p.w * gap[0], h: p.h }, { x: p.x + p.w * gap[1], y: p.y, w: p.w * (1-gap[1]), h: p.h }]
    : [{ x: p.x, y: p.y, w: p.w, h: p.h * gap[0] }, { x: p.x, y: p.y + p.h * gap[1], w: p.w, h: p.h * (1-gap[1]) }];
}
export function surfaceHeight(p: WorldProp) { return p.surface?.deckHeight ?? (p.kind === 'rug' || p.kind === 'floor-decal' ? .1 : 2); }
export function surfaceHeightAt(world: WorldMap, x: number, y: number) {
  let height = 0;
  for (const p of world.props) if (isWalkableSurface(p) && surfaceRects(p).some(r => x >= r.x && x <= r.x+r.w && y >= r.y && y <= r.y+r.h)) height = Math.max(height, surfaceHeight(p));
  return height;
}

export function surfaceElevationAt(world: WorldMap, x: number, y: number, ground: (x: number, y: number) => number) {
  let elevation=ground(x,y);
  for (const p of world.props.filter(isWalkableSurface)) for (const r of surfaceRects(p)) {
    if(x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h) elevation=Math.max(elevation,ground(r.x+r.w/2,r.y+r.h/2)+surfaceHeight(p));
  }
  return elevation;
}

// Native vector decking: transverse boards, edge rails, small post caps. The
// edge line is the only shadow; no floating ellipse across blocked water.
export function drawWalkableSurface(c: CanvasRenderingContext2D, p: WorldProp) {
  if (!isWalkableSurface(p) && p.kind !== 'bridge-rail') return false;
  c.save();
  if (p.kind === 'bridge-rail') {
    c.fillStyle = '#51483d'; c.fillRect(p.x, p.y+p.h-2, p.w, 2);
    c.fillStyle = '#b9a181'; c.fillRect(p.x, p.y+2, p.w, 3);
    for (let x=p.x+3; x<p.x+p.w; x+=24) { c.fillStyle='#6d6253'; c.fillRect(x,p.y,3,p.h); c.fillStyle='#d4bd95'; c.fillRect(x,p.y,3,2); }
    c.restore(); return true;
  }
  if (p.kind === 'rug' || p.kind === 'floor-decal') {
    c.fillStyle=p.color ?? '#81664e'; c.fillRect(p.x,p.y,p.w,p.h);
    c.strokeStyle='#c7ae85'; c.lineWidth=1; c.strokeRect(p.x+2,p.y+2,p.w-4,p.h-4);
    c.restore(); return true;
  }
  const horizontal = surfaceDirection(p) === 'horizontal';
  for (const r of surfaceRects(p)) {
    c.save(); c.translate(r.x, r.y);
    if (!horizontal) { c.translate(0,r.h); c.rotate(-Math.PI/2); }
    const length = horizontal ? r.w : r.h, width = horizontal ? r.h : r.w;
    c.beginPath(); c.rect(0,0,length,width); c.clip();
    c.fillStyle = '#554b40'; c.fillRect(0,0,length,width);
    for (let x=0, n=0; x<length; x+=8,n++) {
      const end = Math.min(length,x+7.4);
      c.beginPath(); c.moveTo(x,0); c.lineTo(end,0);
      for (let y=0; y<=width; y+=4) {
        const brokenEnd = !!surfaceGap(p) && !(horizontal ? r.x > p.x : r.y > p.y) && end>=length-1;
        c.lineTo(end-(brokenEnd ? (y/4%3)*1.4 : 0),y);
      }
      for (let y=width; y>=0; y-=4) c.lineTo(x+(surfaceGap(p) && (horizontal ? r.x>p.x : r.y>p.y) && x===0 ? (y/4%3)*1.4 : 0),y);
      c.closePath(); c.fillStyle=n%3===0?'#a38a66':'#927958'; c.fill();
      c.strokeStyle='#c6ab80'; c.lineWidth=.55; c.beginPath(); c.moveTo(x+1.8,3); c.lineTo(x+2.3,width-3); c.stroke();
      c.strokeStyle='#735e48'; c.beginPath(); c.moveTo(x+5,7); c.lineTo(x+4.6,width-7); c.stroke();
      for (const y of [5,width-5]) { c.fillStyle='#414344'; c.beginPath(); c.arc(x+4,y,.7,0,Math.PI*2); c.fill(); }
    }
    {
      for (const y of [1,width-3]) { c.fillStyle='#51483d'; c.fillRect(0,y+2,length,1); c.fillStyle='#c2ac88'; c.fillRect(0,y,length,2); }
      for (let x=2; x<length; x+=24) for (const y of [0,width-5]) { c.fillStyle='#6d6253'; c.fillRect(x,y,4,5); c.fillStyle='#d7bf94'; c.fillRect(x,y,4,1.2); }
    }
    c.restore();
  }
  c.restore(); return true;
}
