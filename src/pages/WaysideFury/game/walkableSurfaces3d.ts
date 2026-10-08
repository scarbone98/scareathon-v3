import * as THREE from 'three';
import type { WorldMap } from './worldBuilder';
import { drawWalkableSurface, isWalkableSurface, surfaceHeight, surfaceRects } from './walkableSurfaces';

// Horizontal artwork on a thin solid deck, never an upright billboard. All
// resources are owned/disposed with the renderer's existing static scene.
export function buildWalkableSurfaces(parent: THREE.Object3D, world: WorldMap, ground: (x: number, y: number) => number = () => 0) {
  for (const p of world.props.filter(isWalkableSurface)) {
    const canvas = document.createElement('canvas'); canvas.width=Math.ceil(p.w*4); canvas.height=Math.ceil(p.h*4);
    const c=canvas.getContext('2d')!; c.scale(4,4); c.translate(-p.x,-p.y); drawWalkableSurface(c,p);
    const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
    for (const r of surfaceRects(p)) {
      const height=surfaceHeight(p), base=ground(r.x+r.w/2,r.y+r.h/2);
      const slab=new THREE.Mesh(new THREE.BoxGeometry(r.w,height,r.h),new THREE.MeshStandardMaterial({color:'#67543f',roughness:1}));
      slab.position.set(r.x+r.w/2,base+height/2,r.y+r.h/2); slab.receiveShadow=true; parent.add(slab);
      const geometry=new THREE.PlaneGeometry(r.w,r.h), uv=geometry.getAttribute('uv');
      for(let i=0;i<uv.count;i++) uv.setXY(i,(r.x-p.x+uv.getX(i)*r.w)/p.w,1-(r.y-p.y+(1-uv.getY(i))*r.h)/p.h);
      const deck=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.1,roughness:1,side:THREE.DoubleSide}));
      deck.rotation.x=-Math.PI/2; deck.position.set(r.x+r.w/2,base+height+.02,r.y+r.h/2);
      deck.receiveShadow=true; parent.add(deck);
    }
  }
}
