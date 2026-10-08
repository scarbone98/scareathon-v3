import * as THREE from 'three';
import { GLOBE_PATCHES, type GlobeSession } from './globe';
import { globeFrame } from './globeArt';
// Optional presentation only. The Canvas renderer stays mounted underneath and
// uses the same orientation immediately if creation or context recovery fails.
export class GlobeRenderer3D {
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.OrthographicCamera();
  private sphere:THREE.Mesh;
  private atmosphere:THREE.Mesh;
  constructor(private canvas:HTMLCanvasElement) {
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
    this.scene.background=new THREE.Color('#102b3b');
    const textureCanvas=document.createElement('canvas');textureCanvas.width=1536;textureCanvas.height=768;
    const c=textureCanvas.getContext('2d')!;c.fillStyle='#397b91';c.fillRect(0,0,1536,768);
    for(const patch of GLOBE_PATCHES)if(patch.land){c.fillStyle=patch.color;c.beginPath();patch.polygon.forEach(([lat,lon],i)=>{const x=(lon/Math.PI/2+.5)*1536,y=(-lat/Math.PI+.5)*768;if(i===0)c.moveTo(x,y);else c.lineTo(x,y);});c.closePath();c.fill();}
    const texture=new THREE.CanvasTexture(textureCanvas);texture.colorSpace=THREE.SRGBColorSpace;
    // Sphere UV longitude starts along -X; offset to match spherePoint exactly.
    this.sphere=new THREE.Mesh(new THREE.SphereGeometry(1,96,64),new THREE.MeshStandardMaterial({map:texture,roughness:.92}));
    this.sphere.geometry.rotateY(-Math.PI/2);
    this.scene.add(this.sphere);
    this.atmosphere=new THREE.Mesh(new THREE.SphereGeometry(1.025,64,32),new THREE.MeshBasicMaterial({color:'#97ded7',transparent:true,opacity:.12,side:THREE.BackSide}));this.scene.add(this.atmosphere);
    this.scene.add(new THREE.HemisphereLight('#d6efed','#123d55',2));const sun=new THREE.DirectionalLight('#fff0ca',2.5);sun.position.set(-3,4,5);this.scene.add(sun);
  }
  draw(s:GlobeSession,w:number,h:number,dpr:number) {
    if(this.renderer.getContext().isContextLost())throw new Error('Globe context lost');
    const {r,cx,cy}=globeFrame(w,h);
    if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.renderer.setPixelRatio(dpr);this.renderer.setSize(w,h,false);}
    this.canvas.dataset.renderDpr=String(dpr);
    this.camera.left=-w/2;this.camera.right=w/2;this.camera.top=h/2;this.camera.bottom=-h/2;this.camera.near=.1;this.camera.far=r*6;this.camera.position.set(0,0,r*3);this.camera.updateProjectionMatrix();
    const qx=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),s.lat-.9),qy=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-s.lon);
    this.sphere.quaternion.copy(qx.multiply(qy));this.sphere.scale.setScalar(r);this.sphere.position.set(cx-w/2,h/2-cy,0);this.atmosphere.position.copy(this.sphere.position);this.atmosphere.scale.setScalar(r);
    this.renderer.render(this.scene,this.camera);
  }
  dispose() {this.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const m=o.material as THREE.MeshStandardMaterial;m.map?.dispose();m.dispose();}});this.renderer.dispose();}
}
