import { INTERIORS } from './interiors';
import { drawExitOpening, nearExit, exitCaption } from './exitArt';
import { buildWalkableSurfaces } from './walkableSurfaces3d';
import { isWalkableSurface, surfaceHeightAt } from './walkableSurfaces';
import { scorchedGroundMesh, contactGroundMesh } from './grounding3d.ts';
import { footprintGrounding } from './grounding.ts';
import * as THREE from 'three';
import type { GameState } from './sim';
import type { HeroAvatar } from './avatar';
import type { RenderPresentation, RenderLabel } from './render';
import { getWorld, type WorldProp } from './world';
import { getRenderViewport } from './viewport';
import { hasSpaceFlag, lunarLift } from './lunar';
import { sameCampaignMap } from './campaign';
import { resolveHeroVisual } from './heroVisuals';
import { sampleSpaceFilm } from './chapters/ch3Films';
import { drawLunarBody } from './renderSpace2d';

export function isSpaceScene(s:GameState) {return s.mapId==='space-launch'||s.mapId.startsWith('moon-');}
interface Actor {mesh:THREE.Sprite;texture:THREE.CanvasTexture;canvas:HTMLCanvasElement;key:string}
// Shares the optional WebGL context, but owns/disposes every Space resource.
export class SpaceRenderer {
  private scene=new THREE.Scene();
  private camera=new THREE.OrthographicCamera(-1,1,1,-1,1,4000);
  private staticGroup=new THREE.Group();
  private actors=new Map<string,Actor>();
  private props=new Map<string,THREE.Group>();
  private key='';
  private filmKey='';
  private filmSet=new THREE.Group();
  private focus=new THREE.Vector2();
  private ready=false;
  private avatar:HeroAvatar|null=null;
  private street=new Map<string,HTMLImageElement>();
  private remotes=new Map<number,HeroAvatar>();
  private viewport=getRenderViewport(1,1,1);
  private groundEffects:THREE.Mesh;
  private groundEffectsCanvas=document.createElement('canvas');
  private groundEffectsTexture:THREE.CanvasTexture;
  constructor(private renderer:THREE.WebGLRenderer,private canvas:HTMLCanvasElement) {
    for(const [id,url]of Object.entries({joe:'/royale/joe_idle.png',matt:'/royale/matt_idle.png',alex:'/royale/ui/alex_idle.png',jon:'/royale/ui/jon_idle.png'})){const image=new Image();image.src=url;this.street.set(id,image);}
    this.scene.background=new THREE.Color('#0c1527');
    this.scene.add(new THREE.HemisphereLight(0xcce8ff,0x4b506c,2.2));
    const sun=new THREE.DirectionalLight(0xffedcb,3);sun.position.set(-150,350,-120);this.scene.add(sun);
    this.scene.add(this.staticGroup,this.filmSet);
    this.groundEffectsTexture=new THREE.CanvasTexture(this.groundEffectsCanvas);
    this.groundEffects=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.groundEffectsTexture,transparent:true,depthWrite:false,toneMapped:false}));
    this.groundEffects.rotation.x=-Math.PI/2;this.scene.add(this.groundEffects);
  }
  setAvatar(a:HeroAvatar){this.avatar=a;}
  setRemoteAvatar(seat:number,a:HeroAvatar){this.remotes.set(seat,a);}
  reset(){this.ready=false;}
  private mesh(group:THREE.Group,geometry:THREE.BufferGeometry,color:string,x:number,y:number,z:number) {
    const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.68,metalness:.22}));m.position.set(x,y,z);group.add(m);return m;
  }
  private box(g:THREE.Group,w:number,h:number,d:number,color:string,x=0,y=h/2,z=0){return this.mesh(g,new THREE.BoxGeometry(w,h,d),color,x,y,z);}
  private cylinder(g:THREE.Group,r:number,h:number,color:string,x=0,y=h/2,z=0){return this.mesh(g,new THREE.CylinderGeometry(r,r,h,32),color,x,y,z);}
  private globe(g:THREE.Group,x:number,y:number,z:number){
    const globe=this.mesh(g,new THREE.SphereGeometry(1,64,32),'#ffffff',x,y,z);globe.name='earth';
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const c=canvas.getContext('2d')!;
    const ocean=c.createLinearGradient(0,0,0,512);ocean.addColorStop(0,'#9fcfe2');ocean.addColorStop(.25,'#3c98cb');ocean.addColorStop(.7,'#236aa9');ocean.addColorStop(1,'#c5e3ee');c.fillStyle=ocean;c.fillRect(0,0,1024,512);
    for(const [x,y,rx,ry]of [[210,155,110,60],[310,245,50,100],[560,155,50,40],[610,240,65,100],[735,150,150,70],[875,340,50,30]]){c.fillStyle='#80a58c';c.beginPath();for(let n=0;n<42;n++){const a=n/42*Math.PI*2,r=.82+Math.sin(n*2.7)*.16;c.lineTo(x+Math.cos(a)*rx*r,y+Math.sin(a)*ry*r);}c.closePath();c.fill();}
    c.strokeStyle='#e4f7faab';c.lineWidth=8;c.lineCap='round';for(let n=0;n<42;n++){const x=n*83%1024,y=60+n*47%390;c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+24,y-10,x+42,y+18,x+75,y+3);c.stroke();}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;globe.material.map=texture;globe.material.roughness=1;return globe;
  }
  private rocket(g:THREE.Group,h=148) {
    this.cylinder(g,12,h*.72,'#dce6ee',0,h*.44);
    this.mesh(g,new THREE.ConeGeometry(12,h*.2,32),'#f1ede2',0,h*.9,0);
    for(const y of [h*.22,h*.54])this.cylinder(g,12.3,6,'#e5ad54',0,y);
    for(const side of [-1,1])this.box(g,5,24,20,'#b98a4e',side*14,12,0);
    this.cylinder(g,9,8,'#3e4e62',0,4);
  }
  private buildProp(p:WorldProp) {
    if(isWalkableSurface(p)) return;
    const g=new THREE.Group();g.position.set(p.x+p.w/2,0,p.y+p.h);this.props.set(p.id,g);this.staticGroup.add(g);
    const h=p.h;
    switch(p.kind){
      case 'rocket':this.rocket(g,h);break;
      case 'gantry':
        for(const side of [-1,1]){this.box(g,7,h,9,'#5d7288',side*(p.w/2-12));for(let y=20;y<h;y+=24){const beam=this.box(g,3,30,3,'#92a7b7',side*(p.w/2-12),y);beam.rotation.z=side*.3;}}
        for(let y=24;y<h;y+=32)this.box(g,p.w-24,3,6,'#8195a7',0,y,-28);
        this.box(g,p.w-20,3,20,'#a5b4bd',0,h-8);break;
      case 'tank':this.cylinder(g,p.w/2,h-12,'#aebfcf');this.mesh(g,new THREE.SphereGeometry(p.w/2,32,16),'#d4e1eb',0,h-12,0).scale.y=.4;
        for(let y=12;y<h-12;y+=16)this.cylinder(g,p.w/2+.3,1,'#667a90',0,y);
        this.box(g,3,10,20,'#e9b264',0,4,14);break;
      case 'control':case 'locker':
        this.box(g,p.w,h*.65,Math.max(18,p.h*.6),'#42566d',0,h*.325,-p.h*.3);
        this.box(g,p.w+4,4,p.h*.65,'#93a7b7',0,h*.65,-p.h*.3);
        for(let n=0;n<(p.kind==='locker'?5:4);n++)this.box(g,p.w/6,h*.4,1,p.kind==='locker'?'#dde6e8':'#407e9c',-p.w*.4+n*p.w/5,h*.34,1);
        this.box(g,p.w*.7,2,2,'#e7bf77',0,h*.57,2);break;
      case 'lander':this.mesh(g,new THREE.CylinderGeometry(20,28,34,8),'#dce5e9',0,38,0);this.box(g,24,13,1,'#315b7c',0,43,24);
        for(const x of [-1,1])for(const z of [-1,1]){const leg=this.box(g,3,28,3,'#9baebe',x*28,14,z*22);leg.rotation.z=-x*.25;this.box(g,18,2,12,'#7d90a4',x*32,1,z*22);}this.box(g,20,2,32,'#c4aa76',0,1,38);break;
      case 'dish':this.cylinder(g,4,h*.65,'#889caf');{const bowl=this.mesh(g,new THREE.SphereGeometry(38,32,16,0,Math.PI*2,0,Math.PI/2),'#d9e7ee',0,h*.7,0);bowl.rotation.z=.3;bowl.scale.y=.3;}this.cylinder(g,2,40,'#e8b466',0,h*.9);break;
      case 'air':case 'socket':this.box(g,p.w,p.h*.7,18,'#435b71');this.cylinder(g,8,3,p.kind==='air'?'#b4eaf0':'#e5ae63',0,p.h*.7);
        this.box(g,p.w*.65,7,1,'#192d43',0,p.h*.4,10);this.box(g,5,3,2,'#d9fff3',0,p.h*.4,11);break;
      case 'seal':this.box(g,p.w,p.h,12,'#637b91');this.box(g,3,p.h*.7,1,'#edbc73',0,p.h*.5,7);break;
      case 'fence':{
        const vertical=p.h>20,length=vertical?p.h:p.w;
        for(let n=0;n<=length;n+=16)this.cylinder(g,1,23,'#a6bacb',vertical?0:n-p.w/2,11.5,vertical?n-p.h:0);
        for(const y of [7,20])this.box(g,vertical?1:length,1,vertical?length:1,'#8098ac',0,y,vertical?-p.h/2:0);break;
      }
      case 'crater':{
        // Lunar ground is flat: a shaded bowl decal and soft, low regolith rim
        // conform to that surface rather than hovering as a detached torus.
        const surface=(x:number,z:number)=>{
          const r=Math.hypot(x/(p.w*.48),(z+p.h/2)/(p.h*.46));
          return Math.min(p.w,p.h)*.024*Math.exp(-Math.pow((r-.87)/.13,2));
        };
        g.add(scorchedGroundMesh(p.w,p.h,surface,0,-p.h/2));break;
      }
      case 'flag':this.cylinder(g,1,h,'#d5e3ef');this.box(g,30,15,1,'#c481c4',15,h-10);break;
      case 'rock':{
        const foot=footprintGrounding(()=>0,p.x+p.w/2,p.y+p.h/2,p.w,p.h);
        const rock=this.mesh(g,new THREE.DodecahedronGeometry(p.w*.5,1),'#8999af',0,foot.base+p.w*.09,-p.h/2);
        rock.scale.y=.5;rock.rotation.set(-foot.tiltX,p.x*.017,-foot.tiltZ);
        g.add(contactGroundMesh(p.w*1.15,p.h*.8,0,-p.h/2));break;
      }
      default:this.box(g,p.w,Math.min(h,24),Math.max(4,p.w*.5),'#64778e');
    }
  }
  private releaseGroup(g:THREE.Group) {g.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){if('map'in m&&m.map instanceof THREE.Texture)m.map.dispose();m.dispose();}}});g.clear();}
  private build(s:GameState) {
    this.releaseGroup(this.staticGroup);for(const a of this.actors.values()){a.texture.dispose();a.mesh.material.dispose();this.scene.remove(a.mesh);}this.actors.clear();this.props.clear();this.key=s.mapId;this.ready=false;
    const world=getWorld(s.scene,s.room,s.mapId),moon=s.mapId.startsWith('moon-');
    const floor=this.box(this.staticGroup,world.width,2,world.height,moon?'#7d8ba4':'#536778',world.width/2,-1,world.height/2);floor.material.roughness=1;
    // Deterministic regolith stones / paved expansion seams, independent of state.
    if(moon)for(let n=0;n<100;n++){const x=24+(n*137)%(world.width-48),z=24+(n*79)%(world.height-48);this.mesh(this.staticGroup,new THREE.DodecahedronGeometry(.7+n%3,0),n%3?'#a9b6c8':'#5e708c',x,(.7+n%3)*.35*.36,z).scale.y=.35;}
    else for(let x=0;x<world.width;x+=32)this.box(this.staticGroup,.4,.05,world.height,'#718294',x,.1,world.height/2);
    for(let row=0;row<world.rows;row++)for(let col=0;col<world.cols;col++)if(world.collision[row*world.cols+col])this.box(this.staticGroup,16,12,16,'#566880',col*16+8,6,row*16+8);
    for(const p of world.props)this.buildProp(p);
    for(const door of INTERIORS.filter(door=>door.parent===world.id)) {
      this.box(this.staticGroup,22,27,1,'#26363d',door.x,13.5,door.y);
      for(const x of [door.x-12,door.x+12])this.box(this.staticGroup,2,29,2,'#dfc08d',x,14.5,door.y);
      this.box(this.staticGroup,26,2,2,'#dfc08d',door.x,29,door.y);
      this.box(this.staticGroup,2,2,2,'#efce89',door.x+6,13,door.y+1);
    }
    buildWalkableSurfaces(this.staticGroup,world);

    this.groundEffectsCanvas.width=world.width*2;this.groundEffectsCanvas.height=world.height*2;
    this.groundEffectsTexture.dispose();this.groundEffectsTexture=new THREE.CanvasTexture(this.groundEffectsCanvas);(this.groundEffects.material as THREE.MeshBasicMaterial).map=this.groundEffectsTexture;
    this.groundEffects.scale.set(world.width,world.height,1);this.groundEffects.position.set(world.width/2,.5,world.height/2);
  }
  private actor(id:string,x:number,y:number,lift:number,key:string,draw:(c:CanvasRenderingContext2D)=>void,w=32,h=48) {
    let a=this.actors.get(id);if(!a){const canvas=document.createElement('canvas');canvas.width=Math.max(128,Math.ceil(w*this.viewport.zoom*this.viewport.dpr));canvas.height=Math.max(192,Math.ceil(h*this.viewport.zoom*this.viewport.dpr));const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const mesh=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));mesh.center.set(.5,2/48);this.scene.add(mesh);a={mesh,texture,canvas,key:''};this.actors.set(id,a);}
    const pw=Math.max(128,Math.ceil(w*this.viewport.zoom*this.viewport.dpr)),ph=Math.max(192,Math.ceil(h*this.viewport.zoom*this.viewport.dpr));
    if(a.canvas.width!==pw||a.canvas.height!==ph){a.texture.dispose();a.canvas.width=pw;a.canvas.height=ph;a.texture=new THREE.CanvasTexture(a.canvas);a.texture.colorSpace=THREE.SRGBColorSpace;a.mesh.material.map=a.texture;a.mesh.material.needsUpdate=true;a.key='';}
    if(a.key!==key){const c=a.canvas.getContext('2d')!;c.clearRect(0,0,a.canvas.width,a.canvas.height);c.save();c.scale(a.canvas.width/128,a.canvas.height/192);draw(c);c.restore();a.texture.needsUpdate=true;a.key=key;}
    a.mesh.visible=true;a.mesh.position.set(x,lift+1,y);a.mesh.scale.set(w,h,1);
  }
  private drawFilm(s:GameState) {
    if(!s.film)return;
    const {shot,progress}=sampleSpaceFilm(s.film.id,s.film.elapsed),reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches,t=reduced?.5:progress;
    if(this.filmKey!==shot.composition){
      this.releaseGroup(this.filmSet);this.filmKey=shot.composition;
      if(['cabin','burger','helmet','crew','lockers','earth'].includes(shot.composition)){
        this.box(this.filmSet,300,180,8,'#283d56',0,60,-55);for(let x=-140;x<=140;x+=56)this.box(this.filmSet,2,160,12,'#718da3',x,60,-48);
        if(shot.composition==='earth'){this.box(this.filmSet,240,4,4,'#b0c4d3',0,118,-42);this.box(this.filmSet,240,4,4,'#b0c4d3',0,-10,-42);}
        else for(let n=0;n<5;n++){this.box(this.filmSet,36,62,12,'#536a83',-112+n*56,18,0);this.box(this.filmSet,28,2,1,'#dab274',-112+n*56,27,8);}
      }else{
        this.rocket(this.filmSet,100);
        this.globe(this.filmSet,85,105,-75);
        const globe=this.mesh(this.filmSet,new THREE.SphereGeometry(140,64,32),'#8c9bb2',0,-155,0);globe.name='moon';
        if(shot.composition==='separation'){const stage=this.cylinder(this.filmSet,12,42,'#b2c4d4',0,-45);stage.name='stage';}
        if(shot.composition==='pad'||shot.composition==='launch'){for(const x of [-35,35])this.box(this.filmSet,6,130,7,'#70869c',x,65);this.box(this.filmSet,60,30,30,'#465d74',-95,0,0);for(let n=0;n<3;n++)this.cylinder(this.filmSet,10,40,'#c0d1df',85+n*24,10);}
      }
      if(shot.composition==='earth'){this.globe(this.filmSet,0,48,-40);}
      if(shot.composition==='burger'){this.mesh(this.filmSet,new THREE.SphereGeometry(6,24,12),'#e7b16b',0,73,12).name='burger';}
    }
    this.staticGroup.visible=false;this.groundEffects.visible=false;this.filmSet.visible=true;
    const earth=this.filmSet.getObjectByName('earth');if(earth){const r=shot.composition==='earth'?(s.film.id==='space-return'?10+t*48:58-t*48):9;earth.scale.setScalar(r);earth.rotation.y=t*.2;}
    const stage=this.filmSet.getObjectByName('stage');if(stage)stage.position.y=-45-t*65;
    const burger=this.filmSet.getObjectByName('burger');if(burger){burger.position.x=-75+t*150;burger.position.y=75+Math.sin(t*Math.PI)*12;burger.rotation.z=t;}
    this.filmSet.position.y=['launch','clouds'].includes(shot.composition)?t*65:0;
    for(const a of this.actors.values())a.mesh.visible=false;
    const crew=['cabin','burger','helmet','crew','lockers'].includes(shot.composition);
    if(crew)for(const [n,id]of (['joe','matt','alex','jon','you']as const).entries()){
      const portrait=this.viewport.cssHeight>this.viewport.cssWidth*1.4;
      const x=portrait?(n<3?-48+n*48:-24+(n-3)*48):-108+n*54;
      const y=portrait?(n<3?-5:32):0;
      const v=resolveHeroVisual({...s,spaceOutfit:true,active:id,faceX:0,faceY:1},id==='you'?this.avatar:null,shot.composition==='helmet'?(s.film.id==='space-return'?'helmet-off':'helmet-on'):shot.composition==='crew'?'interact':'idle')!;
      this.actor(`cast-${id}`,x,y,28,`${id}:${v.frame}:${shot.id}:${v.appearanceReady}:${this.avatar?.portraitUrl??''}`,c=>{c.drawImage(v.canvas,0,0);c.drawImage(v.visor,0,0);},shot.composition==='helmet'?48:32,shot.composition==='helmet'?72:48);
    }
    const aspect=this.viewport.cssWidth/this.viewport.cssHeight,fw=crew&&aspect<.8?180:330,fh=fw/aspect;
    this.camera.left=-fw/2;this.camera.right=fw/2;this.camera.top=fh/2;this.camera.bottom=-fh/2;this.camera.updateProjectionMatrix();
    this.camera.position.set(0,90,500);this.camera.lookAt(0,40,0);this.camera.updateMatrixWorld();
    this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);
  }
  draw(s:GameState,dt:number) {
    if(this.key!==s.mapId)this.build(s);
    const {width,height}=this.canvas.getBoundingClientRect();this.viewport=getRenderViewport(width,height,window.devicePixelRatio);
    const dpr=window.devicePixelRatio||1;if(this.renderer.getPixelRatio()!==dpr||this.canvas.width!==Math.round(width*dpr)||this.canvas.height!==Math.round(height*dpr)){this.renderer.setPixelRatio(dpr);this.renderer.setSize(width,height,false);}
    this.canvas.dataset.renderDpr=`${window.devicePixelRatio||1}`;this.canvas.dataset.worldWidth=`${this.viewport.width}`;this.canvas.dataset.worldHeight=`${this.viewport.height}`;
    if(s.film){this.drawFilm(s);return;}
    this.staticGroup.visible=true;this.groundEffects.visible=true;this.filmSet.visible=false;this.filmKey='';
    const world=getWorld(s.scene,s.room,s.mapId),establish=s.mapId==='space-launch'&&s.sceneTimer<3&&!s.moving;
    const boss=s.enemies.find(e=>e.kind==='boss'&&e.hp>0&&Math.hypot(e.x-s.x,e.y-s.y)<180);
    const vw=establish?Math.max(560,430*width/height):boss?Math.max(200,this.viewport.width):this.viewport.width,vh=vw*height/width;
    const target=new THREE.Vector2(establish?world.width/2:s.x,establish?world.height/2:s.y);
    if(!this.ready||dt===0)this.focus.copy(target);else this.focus.lerp(target,1-Math.exp(-dt*8.5));this.ready=true;
    this.camera.left=-vw/2;this.camera.right=vw/2;this.camera.top=vh/2;this.camera.bottom=-vh/2;this.camera.updateProjectionMatrix();
    this.camera.position.set(this.focus.x,650,this.focus.y+400);this.camera.lookAt(this.focus.x,0,this.focus.y);this.camera.updateMatrixWorld();
    for(const p of world.props){const g=this.props.get(p.id);if(!g)continue;g.visible=p.kind!=='seal'||!hasSpaceFlag(s,p.id);if(p.kind==='gantry'||p.kind==='rocket'){const occluded=Math.abs(s.x-g.position.x)<p.w/2+14&&s.y<g.position.z+12;g.traverse(o=>{if(o instanceof THREE.Mesh){const m=o.material as THREE.MeshStandardMaterial;m.transparent=occluded;m.opacity=occluded?.35:1;m.depthWrite=!occluded;}});}}
    for(const a of this.actors.values())a.mesh.visible=false;
    const suited=(id:string,state:GameState,avatar:HeroAvatar|null)=>{
      const v=resolveHeroVisual(state,avatar);if(!v){
        const frame=Math.floor(state.time*8),image=this.street.get(state.active);
        this.actor(id,state.x,state.y,surfaceHeightAt(world,state.x,state.y),`street:${state.active}:${frame}:${avatar?.portraitUrl??''}:${image?.complete}`,c=>{c.imageSmoothingEnabled=false;
          if(state.active==='you'&&avatar){for(const strip of [...avatar.back,avatar.body,...avatar.front])c.drawImage(strip.canvas,(frame%strip.frames)*32,0,32,48,0,0,128,192);}
          else if(image?.complete&&image.naturalWidth)c.drawImage(image,(frame%(state.active==='jon'?5:6))*16,0,16,24,0,0,128,192);
        });return;
      }
      this.actor(id,state.x,state.y,surfaceHeightAt(world,state.x,state.y)+lunarLift(state),`${state.active}:${v.pose}:${v.facing}:${v.frame}:${v.appearanceReady}:${avatar?.portraitUrl??''}`,c=>{c.drawImage(v.canvas,0,0);c.drawImage(v.visor,0,0);});
    };
    const visualState=window.matchMedia('(prefers-reduced-motion: reduce)').matches?{...s,time:0}:s;
    suited('local',visualState,this.avatar);
    for(const peer of s.coop?.remoteHeroes??[])if(sameCampaignMap(s,peer))suited(`peer-${peer.seat}`,{...s,...peer,meleeCharge:peer.meleeCharge??0,spaceOutfit:peer.spaceOutfit??s.spaceOutfit,active:peer.hero.id,heroes:{...s.heroes,[peer.hero.id]:peer.hero}},this.remotes.get(peer.seat)??null);
    for(const e of s.enemies)if(e.hp>0){const w=e.behavior==='warden'?128:64;this.actor(`enemy-${e.id}`,e.x,e.y,surfaceHeightAt(world,e.x,e.y),`${Math.floor(s.time*12)}:${e.hp}:${e.phase}:${e.windup}`,c=>{c.save();c.scale(128/w,2);c.translate(w/2,92);drawLunarBody(c,{...e,x:0,y:0},s);c.restore();},w,96);}
    const c=this.groundEffectsCanvas.getContext('2d')!;c.clearRect(0,0,c.canvas.width,c.canvas.height);c.save();c.scale(2,2);
    for(const e of world.exits)drawExitOpening(c,world,e,(!e.requiresClear||s.enemies.every(enemy=>enemy.hp<=0))&&(!e.requiresInteraction||hasSpaceFlag(s,e.requiresInteraction)));
    // Ground shadows retain the collision position while bound billboards lift.
    for(const a of this.actors.values())if(a.mesh.visible){c.fillStyle='#15233e60';c.beginPath();c.ellipse(a.mesh.position.x,a.mesh.position.z,14,5,0,0,Math.PI*2);c.fill();}
    for(const link of world.boundLinks??[])for(const p of [link.from,link.to]){c.strokeStyle='#f5c776';c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y,24,14,0,0,Math.PI*2);c.stroke();}
    for(const p of s.projectiles){c.fillStyle=p.owner==='enemy'?'#f1a0c5':'#b9ffdf';c.beginPath();c.arc(p.x,p.y,p.radius,0,Math.PI*2);c.fill();}
    for(const e of s.effects){c.strokeStyle='#d0fff0';c.lineWidth=2;c.beginPath();c.arc(e.x,e.y,e.size,0,Math.PI*2);c.stroke();}
    for(const [id,a]of this.actors)if(!a.mesh.visible){this.scene.remove(a.mesh);a.texture.dispose();a.mesh.material.dispose();this.actors.delete(id);}
    c.restore();this.groundEffectsTexture.needsUpdate=true;
    this.renderer.setRenderTarget(null);this.renderer.render(this.scene,this.camera);
  }
  presentation(s:GameState):RenderPresentation {
    const project=(x:number,y:number,h=0)=>{const v=new THREE.Vector3(x,h,y).project(this.camera);return{x:(v.x+1)/2,y:(1-v.y)/2};};
    const labels:RenderLabel[]=[];if(s.film)return{focus:{x:.5,y:.5},camera:{x:0,y:0,width:this.viewport.width,height:this.viewport.height},labels};const world=getWorld(s.scene,s.room,s.mapId);
    for(const door of INTERIORS)if(door.parent===s.mapId&&Math.hypot(s.x-door.x,s.y-door.y)<=48)labels.push({id:door.id,text:`› ${door.name}`,...project(door.x,door.y,32),kind:'exit'});
    for(const p of world.props)if(p.label&&!p.interiorId&&Math.hypot(s.x-p.x-p.w/2,s.y-p.y-p.h)<110)labels.push({id:p.id,text:p.label,...project(p.x+p.w/2,p.y+p.h,p.h+8),kind:'hub'});
    for(const e of world.exits)if(nearExit(e,s.x,s.y))labels.push({id:e.id,text:exitCaption(world,e),...project(e.x+e.w/2,e.y,15),kind:'exit'});
    for(const f of s.floaters)labels.push({id:f.id,text:f.text,...project(f.x,f.y,28),kind:'floater',color:f.color,opacity:Math.min(1,f.ttl*4)});
    for(const p of s.coop?.remoteHeroes??[])if(sameCampaignMap(s,p))labels.push({id:`peer-${p.seat}`,text:p.name,...project(p.x,p.y,52),kind:'hub'});
    return{focus:project(s.x,s.y),camera:{x:this.focus.x-this.viewport.width/2,y:this.focus.y-this.viewport.height/2,width:this.viewport.width,height:this.viewport.height},labels:labels.filter(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1)};
  }
  dispose(){this.releaseGroup(this.staticGroup);this.releaseGroup(this.filmSet);for(const a of this.actors.values()){a.texture.dispose();a.mesh.material.dispose();}this.actors.clear();this.groundEffectsTexture.dispose();this.groundEffects.geometry.dispose();(this.groundEffects.material as THREE.Material).dispose();this.scene.clear();this.remotes.clear();}
}
