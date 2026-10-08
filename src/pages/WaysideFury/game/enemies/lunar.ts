import type { Enemy, GameState, HeroState } from '../sim.ts';
import type { LunarBehavior } from '../chapters/ch3Worlds.ts';
import { hasSpaceFlag } from '../lunar.ts';
export interface LunarTarget { x:number;y:number;hero:HeroState;seat:number;guard:boolean;dashTimer:number }
export interface LunarCombat {
  move(e:Enemy,dx:number,dy:number):void;
  shot(e:Enemy,dx:number,dy:number,speed:number,damage:number,radius?:number):void;
  hurt(target:LunarTarget,damage:number,x:number,y:number):void;
  targets():LunarTarget[];
}
export function configureLunarEnemy(s:GameState,e:Enemy,behavior:LunarBehavior) {
  e.behavior=behavior;e.miniBoss=behavior==='inspector'; e.poise=0;e.burst=0;e.exposed=0;
  const power=Math.max(8,...s.party.map(id=>s.heroes[id].power),...(s.coop?.remoteHeroes.map(p=>p.hero.power)??[]));
  const factor=behavior==='warden'?180:behavior==='inspector'?62:behavior==='satellite'?6:behavior==='walker'?10:8;
  const hp=power*factor; e.baseMaxHp=hp;e.maxHp=e.hp=hp*(1+(e.kind==='boss'?.75:.6)*((s.coop?.playerCount??1)-1));
  e.speed=behavior==='rat'?42:behavior==='walker'?18:behavior==='echo'?22:24;
  e.radius=behavior==='warden'?24:behavior==='inspector'?16:8;
  e.cooldown=1;e.aimX=1;e.aimY=0;
}
export function lunarDamage(s:GameState,e:Enemy,damage:number,force:number) {
  if(!e.behavior) return damage;
  if(e.burst&&e.burst>0) return damage*.15;
  if(e.behavior==='echo'&&s.enemies.some(a=>a.behavior==='satellite'&&a.hp>0&&Math.hypot(a.x-e.x,a.y-e.y)<180)) return damage*.2;
  if(e.behavior==='warden'&&e.phase===2&&[0,1,2].some(n=>!hasSpaceFlag(s,`moon-m08-pylon-${n}`))) return 0;
  if(e.kind==='boss') {e.poise=(e.poise??0)+Math.min(1,force/50);if(e.poise>=5) {e.poise=0;e.burst=.65;e.windup=.65;e.actionTimer=0;}}
  return damage;
}
export function updateLunarEnemy(s:GameState,e:Enemy,dt:number,target:LunarTarget,api:LunarCombat) {
  const dx=target.x-e.x,dy=target.y-e.y,len=Math.max(1,Math.hypot(dx,dy));
  const damage=Math.max(9,Math.min(40,9+s.character.level*1.2));
  const hitNear=(radius:number,amount=damage)=> {for(const t of api.targets()) if(Math.hypot(t.x-e.x,t.y-e.y)<radius) api.hurt(t,amount,e.x,e.y);};
  const aim=()=>{e.aimX=dx/len;e.aimY=dy/len;};
  if(e.kind==='boss'&&e.phase===1&&e.hp<=e.maxHp*.5) {
    e.phase=2;e.poise=0;e.burst=.9;e.windup=.9;e.actionTimer=0;
    s.notice=e.behavior==='warden'?'Warden phase 2: ground all three marked pylons. Matt assists any active hero.':'Cheese Inspector phase 2: stamps alternate circles, then rolls down the marked lane.';
  }
  if((e.burst??0)>0) {
    e.burst=Math.max(0,e.burst!-dt);e.windup=e.burst!;
    if(e.burst===0) {
      for(let n=0;n<8;n++) {const a=n*Math.PI/4;api.shot(e,Math.cos(a),Math.sin(a),76,damage*.75);}
      // A generous, clear central arena apron breaks wall pressure without tunneling.
      const center=e.behavior==='warden'?{x:400,y:288}:{x:320,y:240};
      api.move(e,center.x-e.x,center.y-e.y);e.cooldown=1.4;
    }
    return;
  }
  if(e.behavior==='warden'&&e.phase===2&&[0,1,2].every(n=>hasSpaceFlag(s,`moon-m08-pylon-${n}`))&&!e.shieldBroken) {
    e.shieldBroken=true;e.exposed=6;e.windup=e.actionTimer=0;s.notice='All pylons grounded! Warden exposed for six seconds. Shield permanently down.';
  }
  if((e.exposed??0)>0) {e.exposed=Math.max(0,e.exposed!-dt);return;}
  // Never initiate offscreen attacks. Inactive enemies approach into readable range.
  if(len>200&&e.windup===0&&e.actionTimer===0) {if(e.behavior!=='satellite') api.move(e,dx/len*e.speed*dt,dy/len*e.speed*dt);return;}
  if(e.actionTimer>0) {
    e.actionTimer=Math.max(0,e.actionTimer-dt);
    const speed=e.behavior==='rat'?145:e.behavior==='walker'?110:e.behavior==='inspector'?180:135;
    api.move(e,e.aimX*speed*dt,e.aimY*speed*dt);hitNear(e.radius+12);
    if(e.actionTimer===0) {e.cooldown=e.kind==='boss'?2.6:1.8;e.pattern=(e.pattern+1)%3;}
    return;
  }
  if(e.windup>0) {
    e.windup=Math.max(0,e.windup-dt);if(e.windup>0) return;
    if(['rat','walker','inspector'].includes(e.behavior!)) {
      if(e.behavior==='inspector'&&e.pattern===1) {
        for(const t of api.targets()) for(const sign of e.phase===2?[1,-1]:[1]) {
          if(Math.hypot(t.x-(e.x+e.aimX*64*sign),t.y-(e.y+e.aimY*64*sign))<40) api.hurt(t,damage*1.15,e.x,e.y);
        }
      }
      e.actionTimer=e.behavior==='walker'?.6:.5;
    }
    else if(e.behavior==='echo') {
      const pads=[[450,128],[590,260],[420,280]],pad=pads[e.pattern%3];
      api.move(e,pad[0]-e.x,pad[1]-e.y);api.shot(e,dx/len,dy/len,62,damage);e.pattern++;e.cooldown=2;
    } else if(e.behavior==='scout') {api.shot(e,e.aimX,e.aimY,130,damage,7);e.cooldown=2.3;}
    else if(e.behavior==='warden') {
      if(e.pattern===0) {for(const offset of [-.12,0,.12]) {const a=Math.atan2(e.aimY,e.aimX)+offset;api.shot(e,Math.cos(a),Math.sin(a),125,damage,7);}}
      if(e.pattern===1 || e.hp<e.maxHp*.2&&e.pattern===0) for(let n=-2;n<=2;n++) {const a=Math.atan2(e.aimY,e.aimX)+n*.32;api.shot(e,Math.cos(a),Math.sin(a),65,damage*.8,8);}
      if(e.pattern===2) {api.move(e,e.aimX*64,e.aimY*64);hitNear(64,damage*1.3);}
      e.pattern=(e.pattern+1)%3;e.cooldown=e.hp<e.maxHp*.2?2.8:2;
    }
    return;
  }
  if(e.behavior==='satellite') {
    const ally=s.enemies.find(a=>a.behavior==='echo'&&a.hp>0);
    if(ally) {const ax=ally.x-e.x,ay=ally.y-e.y,l=Math.max(1,Math.hypot(ax,ay));if(l>64) api.move(e,ax/l*20*dt,ay/l*20*dt);}
    if(e.cooldown===0) {api.shot(e,dx/len,dy/len,45,damage*.6,5);e.cooldown=3.2;}return;
  }
  if(e.cooldown===0) {aim();e.windup=e.behavior==='rat'?.45:e.behavior==='walker'?1.1:e.behavior==='echo'?.8:.9;}
  else if(e.kind!=='boss'&&e.behavior!=='echo') {const dir=e.behavior==='scout'?(len<100?-1:len>140?1:0):len>48?1:0;api.move(e,dx/len*e.speed*dir*dt,dy/len*e.speed*dir*dt);}
}
