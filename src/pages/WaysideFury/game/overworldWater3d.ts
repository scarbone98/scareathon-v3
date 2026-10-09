import * as THREE from 'three';
import { countyLakes, drawCountyWater } from './overworldWater.ts';
import type { WorldMap } from './worldBuilder.ts';

// Bank/depth artwork is shared with Canvas; only the specular ripple is 3D.
// Texture coordinates never animate, so foam cannot slide over roads or props.
export function buildCountyWater(world: WorldMap, heightAt: (x:number,y:number)=>number) {
  const group = new THREE.Group(); group.name = 'county-water';
  const water: THREE.Mesh[] = [], resources: {shape:THREE.BufferGeometry;material:THREE.MeshStandardMaterial;texture:THREE.Texture}[] = [];
  const size = 256, scale = 3, lakes = countyLakes(world);
  for (let y = 0; y < world.height; y += size) for (let x = 0; x < world.width; x += size) {
    if (!lakes.some(l=>l.x<x+size+8 && l.x+l.w>x-8 && l.y<y+size+8 && l.y+l.h>y-8)) continue;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size*scale;
    const c = canvas.getContext('2d')!; c.scale(scale,scale); c.translate(-x,-y);
    drawCountyWater(c,world,{x,y,w:size,h:size});
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.02,depthWrite:false,roughness:.42,metalness:.08,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const waterTime = {value:0}; material.userData.waterTime = waterTime;
    material.onBeforeCompile = shader => {
      shader.uniforms.countyWaterTime = waterTime;
      shader.vertexShader = 'varying vec2 countyWaterPosition;\n'+shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ncountyWaterPosition = position.xz;');
      shader.fragmentShader = 'uniform float countyWaterTime;\nvarying vec2 countyWaterPosition;\n'+shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float wave = sin(countyWaterPosition.x * .11 + countyWaterPosition.y * .19 + countyWaterTime * .7);
        float fine = sin(countyWaterPosition.x * .047 - countyWaterPosition.y * .31 - countyWaterTime * .5);
        diffuseColor.rgb += vec3(.024, .035, .034) * pow(max(0., wave * fine), 5.);
      `);
    };
    material.customProgramCacheKey = ()=>'county-water-v1';
    const positions:number[] = [], uvs:number[] = [];
    // Match the terrain's triangle diagonal exactly, avoiding decal z-fighting.
    for(let dy=0;dy<size && y+dy<world.height;dy+=16) for(let dx=0;dx<size && x+dx<world.width;dx+=16) {
      for(const [ox,oy] of [[0,0],[0,16],[16,0],[16,0],[0,16],[16,16]]) {
        const px=x+dx+ox,py=y+dy+oy; positions.push(px,heightAt(px,py)+.04,py); uvs.push((px-x)/size,1-(py-y)/size);
      }
    }
    const shape = new THREE.BufferGeometry(); shape.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); shape.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    // Calm shared normals keep per-tile illumination out of the lake surface.
    const normals:number[]=[];for(let i=0;i<positions.length/3;i++)normals.push(0,1,0);
    shape.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    const mesh = new THREE.Mesh(shape,material); mesh.name=`county-water-${x}-${y}`; mesh.renderOrder=1;
    group.add(mesh);water.push(mesh);resources.push({shape,material,texture});
  }
  return {group,water,dispose:()=>{for(const r of resources){r.shape.dispose();r.material.dispose();r.texture.dispose();}group.clear();}};
}
