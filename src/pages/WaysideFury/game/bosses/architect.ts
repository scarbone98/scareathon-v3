import type { Enemy, GameState } from '../sim.ts';
import type { LunarCombat, LunarTarget } from '../enemies/lunar.ts';
export interface CityCombat extends LunarCombat { summon(behavior:'turnstile'|'neon-imp',x:number,y:number):void }
export function interruptCityBoss(e:Enemy) {e.exposed=6;e.shieldBroken=true;e.windup=0;}
export function cityBossDamage(e:Enemy,damage:number,force:number) {
  e.poise=(e.poise??0)+Math.min(1,force/45);
  if(e.poise>=5) {e.poise=0;e.burst=.85;e.windup=.85;e.actionTimer=0;e.kx=e.ky=0;}
  if((e.burst??0)>0) return damage*.2;
  return (e.exposed??0)>0?damage:damage*.15;
}
export function cityLanes(e:Enemy) {return e.pattern%2===0?[0,2]:[1,3];}
export function updateCityBoss(s:GameState,e:Enemy,dt:number,target:LunarTarget,api:CityCombat) {
  const damage=12+Math.max(s.character.level,...(s.coop?.remoteHeroes.map(p=>p.hero.level)??[]))*1.7;
  if(e.phase===1&&e.hp<=e.maxHp*.5) {
    e.phase=2;e.pattern++;e.burst=1;e.windup=1;e.exposed=0;e.kx=e.ky=0;
    s.projectiles=s.projectiles.filter(p=>p.owner==='hero');
    s.notice=e.behavior==='architect'?'Architect phase 2: the broken sigil is a decoy. Interrupt an intact relay.':'Switchmaster phase 2: lanes alternate faster. Two lanes always stay safe.';
  }
  if((e.burst??0)>0) {
    e.burst=Math.max(0,e.burst!-dt);e.windup=e.burst!;
    if(e.burst===0) {
      for(const t of api.targets()) if(Math.hypot(t.x-e.x,t.y-e.y)<64) api.hurt(t,damage,e.x,e.y);
      // Collision-aware displacement into the open apron breaks wall pressure.
      api.move(e,320-e.x,208-e.y);e.cooldown=1.4;e.windup=0;
    }return;
  }
  if((e.exposed??0)>0) {e.exposed=Math.max(0,e.exposed!-dt);if(e.exposed===0) {e.shieldBroken=false;e.cooldown=1.2;}return;}
  const dx=target.x-e.x,dy=target.y-e.y,len=Math.max(1,Math.hypot(dx,dy));
  if(e.windup>0) {
    e.windup=Math.max(0,e.windup-dt);if(e.windup>0) return;
    if(e.behavior==='switchmaster') {
      for(const t of api.targets()) if(cityLanes(e).includes(Math.max(0,Math.min(3,Math.floor((t.y-32)/88))))) api.hurt(t,damage,e.x,e.y);
      api.shot(e,e.aimX,e.aimY,90,damage,6);
      s.projectiles.at(-1)!.signal=true;
    } else {
      if(e.pattern%2===0 && s.enemies.filter(a=>a.hp>0).length<4) {api.summon('turnstile',420,250);api.summon('neon-imp',440,170);}
      else for(const offset of [-.4,-.2,0,.2,.4]) {const a=Math.atan2(e.aimY,e.aimX)+offset;api.shot(e,Math.cos(a),Math.sin(a),95,damage,6);}
      const pad=[[320,208],[380,280],[380,144]][e.pattern%3];api.move(e,pad[0]-e.x,pad[1]-e.y);
    }
    e.pattern++;e.cooldown=e.phase===2?1.6:2.4;return;
  }
  if(e.cooldown===0) {e.aimX=dx/len;e.aimY=dy/len;e.windup=e.phase===2?.9:1.2;}
}
