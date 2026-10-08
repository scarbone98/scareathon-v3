import { MAIL_BALLOON_HOOK, type OverworldHook } from "./game/overworldHooks";
import { HeroPortrait } from "./HeroPortrait";
import type { HeroAvatar } from "./game/avatar";
import { HERO_IDS, HERO_NAMES } from "./game/sim";
import { useEffect, useRef, useState } from 'react';
import { GLOBE_DESTINATIONS, globeAvailable, globeDistance, newGlobe, startLanding, stepGlobe, type GlobeDestination } from './game/globe';
import { drawGlobe } from './game/globeArt';
import type { GlobeRenderer3D } from './game/globe3d';
import type { GameState } from './game/sim';
import type { GraphicsMode } from './game/graphics';
import './GlobeTravel.css';

export function GlobeTravel({state,avatar,mode,onMode,onOptionalHook,onLand,onClose}:{state:GameState;avatar:HeroAvatar|null;mode:GraphicsMode;onMode:(mode:GraphicsMode)=>void;onOptionalHook?:(hook:Readonly<OverworldHook>)=>void;onLand:(destination:GlobeDestination)=>void;onClose:()=>void}) {
  const origin=state.mapId==='hub'?'wayside':state.mapId==='space-launch'?'launch':state.mapId==='blast-0'?'blast':'county';
  const session=useRef(newGlobe(origin,Math.floor(state.time*1000)+state.rngSeed));
  const stateRef=useRef(state);stateRef.current=state;
  const canvas=useRef<HTMLCanvasElement>(null),canvas3d=useRef<HTMLCanvasElement>(null);
  const input=useRef({turn:0,throttle:0,brake:false,auto:false});
  const depth=useRef<GlobeRenderer3D|null>(null),committed=useRef(false);
  const callbacks=useRef({onLand,onClose});callbacks.current={onLand,onClose};
  const [view,setView]=useState({...session.current}),[fallback,setFallback]=useState(false);
  const [message,setMessage]=useState('Joe, Matt, Alex, Jon and You aboard. Choose a world route.');
  useEffect(()=>{
    let canceled=false;setFallback(false);
    if(mode==='3d')void import('./game/globe3d').then(({GlobeRenderer3D})=>{if(!canceled)depth.current=new GlobeRenderer3D(canvas3d.current!);}).catch(()=>{if(!canceled)setFallback(true);});
    return ()=>{canceled=true;depth.current?.dispose();depth.current=null;};
  },[mode]);
  useEffect(()=>{
    const siblings=[...document.querySelectorAll<HTMLElement>('.wf-shell > :not(.wf-globe)')].map(node=>({node,inert:node.inert}));
    siblings.forEach(({node})=>{node.inert=true;});
    const keys=new Set<string>();
    const surface=canvas.current;
    const contain=(e:KeyboardEvent)=>{if(e.target===canvas.current && ["w","a","s","d","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)){e.preventDefault();keys.add(e.key);input.current.turn=Number(keys.has("d")||keys.has("ArrowRight"))-Number(keys.has("a")||keys.has("ArrowLeft"));input.current.throttle=Number(keys.has("w")||keys.has("ArrowUp"))-Number(keys.has("s")||keys.has("ArrowDown"));input.current.brake=keys.has(" ");if(input.current.turn)input.current.auto=false;e.stopImmediatePropagation();}};
    surface?.addEventListener("keydown",contain);
    const sync=()=>{input.current.turn=Number(keys.has('d')||keys.has('ArrowRight'))-Number(keys.has('a')||keys.has('ArrowLeft'));input.current.throttle=Number(keys.has('w')||keys.has('ArrowUp'))-Number(keys.has('s')||keys.has('ArrowDown'));input.current.brake=keys.has(' ');if(input.current.turn)input.current.auto=false;};
    const down=(e:KeyboardEvent)=>{if((e.target as HTMLElement).tagName==='BUTTON')return;if(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)){e.preventDefault();keys.add(e.key);sync();}};
    const up=(e:KeyboardEvent)=>{keys.delete(e.key);sync();};
    const blur=()=>{keys.clear();input.current={turn:0,throttle:0,brake:true,auto:false};};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    let frame=0,last=0,accumulator=0,published=0;
    const draw=(time:number)=>{
      const elapsed=last?Math.min(.1,(time-last)/1000):0;last=time;
      if(!document.hidden && !committed.current){
        accumulator+=elapsed;
        while(accumulator>=1/60){
          const arrive=stepGlobe(session.current,1/60,input.current);accumulator-=1/60;
          if(arrive){const d=GLOBE_DESTINATIONS.find(d=>d.id===session.current.selected);if(d && globeAvailable(stateRef.current,d)){committed.current=true;callbacks.current.onLand(d);}else{session.current.phase='cruise';setMessage('That route is unavailable. Choose another destination.');}break;}
        }
      }else accumulator=0;
      if(committed.current || !canvas.current)return;
      const c=canvas.current;c.style.opacity=String(session.current.phase==='takeoff'?Math.min(1,session.current.phaseTime/1.25):1);const {width:w,height:h}=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
      if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.dataset.renderDpr=String(dpr);}
      let activeDepth=false;
      if(depth.current)try{depth.current.draw(session.current,w,h,dpr);activeDepth=true;}catch{depth.current.dispose();depth.current=null;setFallback(true);}
      canvas3d.current!.style.visibility=activeDepth?'visible':'hidden';
      const ctx=c.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);
      drawGlobe(ctx,w,h,session.current,id=>{const d=GLOBE_DESTINATIONS.find(d=>d.id===id);return !!d&&globeAvailable(stateRef.current,d);},activeDepth,matchMedia('(prefers-reduced-motion: reduce)').matches);
      if(time-published>100){setView({...session.current});published=time;}
      frame=requestAnimationFrame(draw);
    };
    frame=requestAnimationFrame(draw);
    canvas.current?.focus();
    return ()=>{cancelAnimationFrame(frame);siblings.forEach(({node,inert})=>{node.inert=inert;});surface?.removeEventListener("keydown",contain);window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  },[]);
  const selected=GLOBE_DESTINATIONS.find(d=>d.id===view.selected)!;
  const canLand=globeAvailable(state,selected)&&globeDistance(view,selected)<=.22&&view.phase==='cruise'&&view.intercept===0;
  const steer=(turn:number)=>{input.current.turn=turn;if(turn)input.current.auto=false;};
  const cancel=()=>{if(view.phase==='landing'){session.current.phase='cruise';session.current.phaseTime=0;setMessage('Approach canceled. Still cruising.');}else callbacks.current.onClose();};
  const signal=Math.min(2,Math.floor((30-view.intercept)/10));
  return <section className="wf-globe" data-phase={view.phase} role="dialog" aria-modal="true" aria-label="County Cruiser world route">
    <canvas key={mode} ref={canvas3d} className="wf-globe-canvas" aria-hidden="true" />
    <canvas ref={canvas} className="wf-globe-canvas" tabIndex={0} aria-label="Steer with WASD or arrows. Space brakes. Choose a destination for automatic heading." onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);steer((e.clientX/e.currentTarget.clientWidth-.5)*2);}} onPointerMove={e=>{if(e.buttons)steer(Math.max(-1,Math.min(1,(e.clientX/e.currentTarget.clientWidth-.5)*2)));}} onPointerUp={()=>steer(0)} onPointerCancel={()=>steer(0)} />
    <header><span className="wf-eyebrow">COUNTY CRUISER</span><h2>A little Earth. A long way home.</h2><div className="wf-globe-crew" aria-label="Five crew members aboard">{HERO_IDS.slice(1).concat(HERO_IDS[0]).map(id=><span key={id}><HeroPortrait id={id} avatar={avatar}/><small>{HERO_NAMES[id]}</small></span>)}</div><p>{view.phase==='takeoff'?'Wheels folding · taking off…':view.phase==='landing'?`Approaching ${selected.name}…`:message}</p>{fallback&&<small>Canvas globe active · 3D unavailable</small>}<button onClick={()=>onMode(mode==='2d'?'3d':'2d')}>{mode==='2d'?'Try 3D':'Use 2D'}</button> <button onClick={cancel}>{view.phase==='landing'?'Cancel landing':'County roads / Return'}</button></header>
    <div className="wf-globe-console">
      {view.offer&&<div className="wf-globe-encounter"><p>A mail balloon is signaling! Optional, no fare.</p><button onClick={()=>{session.current.offer=false;session.current.intercept=30;session.current.signals=0;setMessage('Mail balloon: relay three signals, ten seconds each.');}}>Intercept mail balloon</button><button onClick={()=>{session.current.offer=false;}}>Pass</button></div>}
      {view.intercept>0?<div className="wf-globe-encounter"><p>Relay the balloon’s {['left','middle','right'][signal]} signal · {Math.ceil(view.intercept)}s</p>{['Left','Middle','Right'].map((label,index)=><button key={label} disabled={view.signals>signal} onClick={()=>{if(index===signal&&session.current.signals===signal){session.current.signals++;if(session.current.signals===3)onOptionalHook?.(MAIL_BALLOON_HOOK);setMessage(session.current.signals===3?'Mail balloon: All three received! Tell the station we’re on our way.':'Signal relayed. Wait for the next beacon.');}}}>{label}</button>)}<button onClick={()=>{session.current.intercept=0;setMessage('Mail balloon waves goodbye. Back on the world route.');}}>Return to route</button></div>:<>
      <div className="wf-globe-destinations" aria-label="World destinations">{GLOBE_DESTINATIONS.map(d=><button key={d.id} disabled={view.phase!=="cruise"} aria-pressed={view.selected===d.id} onClick={()=>{if(session.current.phase!=='cruise')return;session.current.selected=d.id;input.current.auto=globeAvailable(state,d);setMessage(globeAvailable(state,d)?`Automatic heading for ${d.name}. Steer to take over.`:d.requirement);}}><span>{globeAvailable(state,d)?'◆':'◇'} {d.name}</span><small>{globeAvailable(state,d)?`${Math.round(globeDistance(view,d)*180/Math.PI)}° · ~${Math.ceil(globeDistance(view,d)/.065)}s`:'Story route · locked'}</small></button>)}</div>
      <div className="wf-globe-actions"><button onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);steer(-1);}} onPointerUp={()=>steer(0)} onPointerCancel={()=>steer(0)}>↶ Turn</button><button onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);input.current.brake=true;}} onPointerUp={()=>{input.current.brake=false;}} onPointerCancel={()=>{input.current.brake=false;}}>Brake</button><button onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);steer(1);}} onPointerUp={()=>steer(0)} onPointerCancel={()=>steer(0)}>Turn ↷</button><button disabled={!canLand} onClick={()=>{startLanding(session.current,globeAvailable(state,selected));}}>Land</button></div>
      <p className="wf-globe-guide">{globeAvailable(state,selected)?'Drag to steer · WASD / arrows · Space brakes. Select a pin’s name to fly there.':selected.requirement}</p>
      </>}
    </div>
  </section>;
}
