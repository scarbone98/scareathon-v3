import * as THREE from 'three';
import { drawRoadNetwork, roadPoints, roadWidth } from './roadNetwork.ts';
import type { WorldMap } from './worldBuilder.ts';

// Shared native vector pavement is draped on small terrain triangles. Alpha
// represents the ribbon union, not a second tiled road. Offset avoids fighting.
export function buildRoadSurface(world:WorldMap,heightAt:(x:number,y:number)=>number) {
  const group=new THREE.Group();group.name='road-network';
  const resources:{geometry:THREE.BufferGeometry;material:THREE.MeshStandardMaterial;texture:THREE.Texture}[]=[];
  const size=256,scale=3;
  for(let y=0;y<world.height;y+=size)for(let x=0;x<world.width;x+=size) {
    if(!world.roads.some(r=>{const points=roadPoints(r),margin=roadWidth(r)/2;return Math.min(...points.map(p=>p.x))-margin<x+size&&Math.max(...points.map(p=>p.x))+margin>x&&Math.min(...points.map(p=>p.y))-margin<y+size&&Math.max(...points.map(p=>p.y))+margin>y;}))continue;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size*scale;
    const c=canvas.getContext('2d')!;c.scale(scale,scale);c.translate(-x,-y);drawRoadNetwork(c,world);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const material=new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,alphaTest:.02,roughness:1,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    const positions:number[]=[],uvs:number[]=[];
    const point=(px:number,py:number)=>{positions.push(px,heightAt(px,py)+.06,py);uvs.push((px-x)/size,1-(py-y)/size);};
    for(let dy=0;dy<size&&y+dy<world.height;dy+=16)for(let dx=0;dx<size&&x+dx<world.width;dx+=16) {
      const px=x+dx,py=y+dy;
      for(const [ox,oy] of [[0,0],[0,16],[16,0],[16,0],[0,16],[16,16]])point(px+ox,py+oy);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeVertexNormals();
    // Match continuous terrain normals; independently shaded decal triangles
    // otherwise reveal a faceted checkerboard on causeway bank slopes.
    const normals=geometry.getAttribute('normal'),normal=new THREE.Vector3();
    for(let i=0;i<positions.length/3;i++) {
      const px=positions[i*3],py=positions[i*3+2];
      normal.set(heightAt(px-.5,py)-heightAt(px+.5,py),1,heightAt(px,py-.5)-heightAt(px,py+.5)).normalize();
      normals.setXYZ(i,normal.x,normal.y,normal.z);
    }
    const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;mesh.name=`road-ribbon-${x}-${y}`;group.add(mesh);resources.push({geometry,material,texture});
  }
  return {group,dispose:()=>{for(const r of resources){r.geometry.dispose();r.material.dispose();r.texture.dispose();}group.clear();}};
}
