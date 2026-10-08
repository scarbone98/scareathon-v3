import * as THREE from 'three';
import { drawScorchedDepression } from './grounding.ts';

// Continuous, terrain-conforming decal: no shadow caster, vertical gap or z-fight.
export function scorchedGroundMesh(w:number,h:number,heightAt:(x:number,z:number)=>number,x=0,z=0) {
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(w*4);canvas.height=Math.ceil(h*4);
  const c=canvas.getContext('2d')!;c.scale(4,4);drawScorchedDepression(c,w,h);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const x0=Math.floor((x-w/2)/4)*4,z0=Math.floor((z-h/2)/4)*4;
  const x1=Math.ceil((x+w/2)/4)*4,z1=Math.ceil((z+h/2)/4)*4;
  // Match the terrain's four-unit lattice and NE–SW triangles exactly.
  const geometry=new THREE.PlaneGeometry(x1-x0,z1-z0,(x1-x0)/4,(z1-z0)/4);geometry.rotateX(-Math.PI/2);
  const positions=geometry.getAttribute('position'),uvs=geometry.getAttribute('uv');
  for(let n=0;n<positions.count;n++){
    const px=(x0+x1)/2+positions.getX(n),pz=(z0+z1)/2+positions.getZ(n);
    positions.setXYZ(n,px-x,heightAt(px,pz)+.015,pz-z);uvs.setXY(n,(px-x+w/2)/w,1-(pz-z+h/2)/h);
  }
  geometry.computeVertexNormals();
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,0,z);mesh.name='scorched-ground-decal';mesh.renderOrder=2;mesh.castShadow=false;return mesh;
}

export function contactGroundMesh(w:number,h:number,x=0,z=0) {
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
  const c=canvas.getContext('2d')!;c.scale(1,.5);
  const gradient=c.createRadialGradient(64,64,10,64,64,64);
  gradient.addColorStop(0,'#1d283b70');gradient.addColorStop(.55,'#28354640');gradient.addColorStop(1,'#28354600');
  c.fillStyle=gradient;c.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const geometry=new THREE.PlaneGeometry(w,h);geometry.rotateX(-Math.PI/2);
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,.015,z);mesh.name='rock-contact-shadow';return mesh;
}
