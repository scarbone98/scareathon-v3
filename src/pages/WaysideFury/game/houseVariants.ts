import { baseFootprints, type WorldMap, type WorldProp } from './worldBuilder.ts';
export const HOUSE_KINDS = new Set(['home', 'shed', 'ruin-house']);
export type HouseBiome = 'town' | 'woods' | 'blast' | 'city' | 'moon';
export interface HouseStyle {
  roof: string; wall: string; material: 'timber' | 'masonry';
  roofRows: number; roofInset: number; door: number; windows: readonly number[];
  porch: boolean; chimney: boolean; yard: boolean; width: number; height: number;
}
// Recombine the existing roof strips, siding, window frames, porch posts,
// chimney blocks and fence rails. Every palette entry already occurs in Fury.
const PALETTES: Record<HouseBiome, readonly [string,string][]> = {
  town: [['#526d66','#999a7c'],['#906957','#ad946e'],['#5e5960','#baae87']],
  woods: [['#526d66','#ad946e'],['#5e5960','#999a7c'],['#906957','#baae87']],
  blast: [['#7e5b4b','#ad946e'],['#5e5960','#6b6356'],['#906957','#999a7c']],
  city: [['#5e5960','#baae87'],['#526d66','#999a7c'],['#906957','#ad946e']],
  moon: [['#5e5960','#baae87'],['#526d66','#999a7c'],['#906957','#6b6356']],
};
const PARTS = [
  {roofRows:7,roofInset:4,door:.5,windows:[.16,.73],porch:false,chimney:false,yard:false,width:1,height:1,material:'timber'},
  {roofRows:5,roofInset:3,door:.38,windows:[.63],porch:true,chimney:true,yard:false,width:.9,height:.95,material:'masonry'},
  {roofRows:8,roofInset:5,door:.62,windows:[.14,.36],porch:false,chimney:true,yard:true,width:1,height:1.08,material:'timber'},
  {roofRows:4,roofInset:1,door:.5,windows:[.12,.76],porch:true,chimney:false,yard:true,width:.95,height:.92,material:'masonry'},
  {roofRows:6,roofInset:2,door:.42,windows:[.68],porch:false,chimney:true,yard:true,width:.85,height:1.04,material:'masonry'},
  {roofRows:7,roofInset:3,door:.58,windows:[.12,.32],porch:true,chimney:false,yard:false,width:.92,height:1,material:'timber'},
] as const;
export const HOUSE_VARIANT_COUNT = PARTS.length;
export const houseBiome = (id: string): HouseBiome => id.startsWith('woods-') ? 'woods' : id.startsWith('blast-') ? 'blast' : id.startsWith('city-') ? 'city' : id.startsWith('moon-') ? 'moon' : 'town';
export function houseStyle(p: WorldProp): HouseStyle | undefined {
  if (!p.house) return undefined;
  const [roof,wall] = PALETTES[p.house.biome][p.house.variant % 3];
  return { ...PARTS[p.house.variant], roof, wall };
}
function hash(key: string) { let n = 2166136261; for (const c of key) n = Math.imul(n ^ c.charCodeAt(0),16777619); return n >>> 0; }
// Neighbors are houses within 240 world units, plus consecutive houses in a
// row-major level sweep. Greedy coloring rules out repeats in both definitions.
export function adjacentHouses(a: WorldProp, b: WorldProp) {
  const dx = Math.max(0, a.x-b.x-b.w, b.x-a.x-a.w), dy = Math.max(0,a.y-b.y-b.h,b.y-a.y-a.h);
  return Math.hypot(dx,dy) <= 240;
}
export function assignHouseVariants(world: WorldMap) {
  const houses = world.props.filter(p => HOUSE_KINDS.has(p.kind)).sort((a,b)=>(a.y+a.h)-(b.y+b.h) || a.x-b.x || a.id.localeCompare(b.id));
  for (const [i,p] of houses.entries()) {
    const seed = hash(`${world.id}:${p.x}:${p.y}`), unavailable = new Set(houses.slice(0,i).filter((q,j)=>j===i-1 || adjacentHouses(p,q)).map(q=>q.house!.variant));
    const variant = Array.from({length:HOUSE_VARIANT_COUNT},(_,n)=>(seed+n)%HOUSE_VARIANT_COUNT).find(n=>!unavailable.has(n));
    if (variant === undefined) throw new Error(`${world.id}: more than six mutually adjacent houses`);
    const part = PARTS[variant], cx = p.x + p.w/2, bottom = p.y + p.h;
    p.w = Math.round(p.w * part.width); p.h = Math.round(p.h * part.height);
    p.x = cx - p.w/2; p.y = bottom - p.h;
    p.footprints = baseFootprints(p.kind,p.x,p.y,p.w,p.h);
    p.house = { biome: houseBiome(world.id), variant, mirrored: !!(seed & 128) };
  }
}
