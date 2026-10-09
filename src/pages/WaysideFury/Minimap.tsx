import { Modal } from "./Modal";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameState } from './game/sim';
import { getWorld } from './game/world';
import { minimapAvailable, minimapLayout, resolveMapObjective } from './game/minimap';
import { drawMinimap } from './game/minimapArt';
import './Minimap.css';
const KEY='wayside-fury-minimap';
function readPreferences() {
  try { const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return { enabled: saved.enabled !== false, rotate: false }; }
  catch { return { enabled: true, rotate: false }; }
}
export function MinimapSettings() {
  const [prefs,setPrefs]=useState(readPreferences);
  const update=(next:typeof prefs)=>{setPrefs(next);try{localStorage.setItem(KEY,JSON.stringify(next));}catch{/* Device storage can be unavailable. */}window.dispatchEvent(new Event('wf-minimap-settings'));};
  return <div className="wf-map-settings"><p>County minimap</p><button className="wf-secondary" aria-pressed={prefs.enabled} onClick={()=>update({...prefs,enabled:!prefs.enabled})}>Minimap: {prefs.enabled?'On':'Off'}</button><span className="wf-small">North up · 2D and 3D</span></div>;
}
export function Minimap({state,getState,onPause,blocked}:{state:GameState;getState:()=>GameState;onPause:(paused:boolean)=>void;blocked:boolean}) {
  const [prefs,setPrefs]=useState(readPreferences),[full,setFull]=useState(false);
  const [box,setBox]=useState({x:12,y:120,w:94,h:94});
  const canvas=useRef<HTMLCanvasElement>(null),root=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null);
  const live=useRef({state,getState,onPause,blocked,full,prefs});live.current={state,getState,onPause,blocked,full,prefs};
  const available=minimapAvailable(state), inCoop=!!state.coop;
  useEffect(()=>{const update=()=>setPrefs(readPreferences());window.addEventListener('wf-minimap-settings',update);return()=>window.removeEventListener('wf-minimap-settings',update);},[]);
  useLayoutEffect(()=>{
    if(!available||blocked)return;
    const shell=root.current?.closest('.wf-shell');if(!shell)return;
    const measure=()=>{const bounds=shell.getBoundingClientRect();const obstacles=Array.from(shell.querySelectorAll('.wf-hud,.wf-play-band,.wf-party-hud,.wf-stick-zone,.wf-action-buttons,.wf-save-status,.wf-sound-chip')).filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{x:r.left-bounds.left,y:r.top-bounds.top,w:r.width,h:r.height};});
      const probe=document.createElement('span');probe.style.cssText='position:absolute;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';shell.append(probe);const style=getComputedStyle(probe);const inset=Math.max(12,...[style.paddingTop,style.paddingRight,style.paddingBottom,style.paddingLeft].map(v=>parseFloat(v)||0));probe.remove();const hud=shell.querySelector('.wf-hud')?.getBoundingClientRect();const top=hud?Math.max(inset,hud.bottom-bounds.top+8):inset;setBox(minimapLayout(bounds.width,bounds.height,obstacles,inset,top));};
    const observer=new ResizeObserver(measure);observer.observe(shell);shell.querySelectorAll('.wf-hud,.wf-play-band,.wf-touch-dock').forEach(e=>observer.observe(e));measure();return()=>observer.disconnect();
  },[available,blocked,state.notice,inCoop,state.mapId,state.chapter]);
  useEffect(()=>{
    let raf=0,frame=0,previousSelect=false;
    const toggle=()=>{const v=live.current;if(v.full){v.full=false;v.onPause(false);setFull(false);}else if(!v.blocked&&minimapAvailable(v.getState())){v.full=true;v.onPause(true);setFull(true);}};
    const key=(e:KeyboardEvent)=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target instanceof HTMLInputElement)return;if(e.key.toLowerCase()==='m'||e.key==='Escape'&&live.current.full){e.preventDefault();e.stopImmediatePropagation();toggle();}};
    window.addEventListener('keydown',key,true);
    const tick=(time:number)=>{raf=requestAnimationFrame(tick);const v=live.current;const select=Array.from(navigator.getGamepads?.()??[]).some(p=>p?.connected&&p.buttons[8]?.pressed);if(select&&!previousSelect)toggle();previousSelect=select;
      if(++frame%2||document.hidden||!canvas.current)return;const s=v.getState();if(!v.full&&(v.blocked||!v.prefs.enabled||!minimapAvailable(s)))return;const map=getWorld(s.scene,s.room,s.mapId);drawMinimap(canvas.current,map,s,resolveMapObjective(s,map),v.full,v.prefs.rotate,time);};
    raf=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(raf);window.removeEventListener('keydown',key,true);};
  },[]);
  useEffect(()=>{if(full)close.current?.focus();},[full]);
  useEffect(()=>{if(full && (!available || blocked)) {live.current.full=false;onPause(false);setFull(false);}},[full,available,blocked,onPause]);
  if(!available&&!full||blocked&&!full)return null;
  const map=getWorld(state.scene,state.room,state.mapId),objective=resolveMapObjective(state,map);
  const hide=()=>{live.current.full=false;onPause(false);setFull(false);};
  const Frame = full ? Modal : 'div';
  return <Frame ref={root} role={full?'dialog':undefined} aria-modal={full?true:undefined} aria-label={full?'County map':undefined} onKeyDown={e=>{if(full&&e.key==='Tab'){e.preventDefault();close.current?.focus();}}} className={full?'wf-full-map wf-overlay':'wf-minimap-wrap'} style={full?undefined:{left:box.x,top:box.y,width:box.w,height:box.h}}>
    {full?<><header><div><h2>{map.name}</h2><p>◆ {objective.name}</p></div><button ref={close} onClick={hide}>Close map · M</button></header><canvas ref={canvas} aria-label={`Map of ${map.name}. Objective: ${objective.name}`} /><p className="wf-map-legend">▲ You · ◆ Current objective · Mint exits</p></>:prefs.enabled&&box.w>0&&<button className="wf-minimap" aria-label={`Open map. Objective: ${objective.name}`} title="Map · M / Select" onClick={()=>{if(!blocked && minimapAvailable(getState())) {live.current.full=true;onPause(true);setFull(true);}}}><canvas ref={canvas} aria-hidden="true" /></button>}
  </Frame>;
}
