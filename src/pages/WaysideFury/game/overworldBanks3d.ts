import * as THREE from 'three';
import { drawOverworldBanks } from './overworldBanks.ts';
import { TILE, tileAt, type WorldMap } from './worldBuilder.ts';

export function buildOverworldBanks(world: WorldMap, heightAt: (x:number,y:number)=>number) {
  const group=new THREE.Group();group.name='county-material-banks';
  const resources:{geometry:THREE.BufferGeometry;material:THREE.Material;texture:THREE.Texture}[]=[];
  const size=256,scale=3;
  for(let y=0;y<world.height;y+=size)for(let x=0;x<world.width;x+=size) {
    let boundary=false;
    for(let row=y/TILE;row<Math.min(world.rows,(y+size)/TILE)&&!boundary;row++)for(let col=x/TILE;col<Math.min(world.cols,(x+size)/TILE)&&!boundary;col++) {
      const kind=tileAt(world,col,row);
      boundary=['stone','ash','corrupt','sand','dirt'].includes(kind)&&[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>{
        const neighbor=tileAt(world,col+dx,row+dy);
        return neighbor!==kind&&['grass','ash','corrupt','stone','dirt','sand'].includes(neighbor);
      });
    }
    if(!boundary)continue;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size*scale;
    const c=canvas.getContext('2d')!;c.scale(scale,scale);c.translate(-x,-y);drawOverworldBanks(c,world,{x,y,w:size,h:size});
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const material=new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,alphaTest:.01,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const positions:number[]=[],uvs:number[]=[],normals:number[]=[],normal=new THREE.Vector3();
    for(let dy=0;dy<size&&y+dy<world.height;dy+=TILE)for(let dx=0;dx<size&&x+dx<world.width;dx+=TILE)for(const [ox,oy] of [[0,0],[0,TILE],[TILE,0],[TILE,0],[0,TILE],[TILE,TILE]]) {
      const px=x+dx+ox,py=y+dy+oy;positions.push(px,heightAt(px,py)+.025,py);uvs.push((px-x)/size,1-(py-y)/size);
      normal.set(heightAt(px-.5,py)-heightAt(px+.5,py),1,heightAt(px,py-.5)-heightAt(px,py+.5)).normalize();normals.push(normal.x,normal.y,normal.z);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`county-material-bank-${x}-${y}`;mesh.receiveShadow=true;mesh.renderOrder=0;group.add(mesh);resources.push({geometry,material,texture});
  }
  return {group,dispose:()=>{for(const r of resources){r.geometry.dispose();r.material.dispose();r.texture.dispose();}group.clear();}};
}
