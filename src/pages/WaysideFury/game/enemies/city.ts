import type { Enemy, GameState } from '../sim.ts';
import type { CityBehavior } from '../chapters/ch4Worlds.ts';
import type { LunarTarget } from './lunar.ts';
import { cityBossDamage, updateCityBoss, type CityCombat } from '../bosses/architect.ts';
export const isCityBehavior = (behavior: unknown): behavior is CityBehavior => ['cable-rat','neon-imp','turnstile','clockwolf','switchmaster','architect'].includes(String(behavior));
export function configureCityEnemy(s:GameState,e:Enemy,behavior:CityBehavior) {
  e.behavior=behavior;e.poise=e.burst=e.exposed=0;e.shieldBroken=false;
  const power=Math.max(8,...s.party.map(id=>s.heroes[id].power),...(s.coop?.remoteHeroes.map(p=>p.hero.power)??[]));
  const hp=power*(behavior==='architect'?95:behavior==='switchmaster'?65:behavior==='turnstile'?11:behavior==='clockwolf'?12:8);
  e.baseMaxHp=hp;e.hp=e.maxHp=hp*(1+(e.kind==='boss'?.75:.6)*((s.coop?.playerCount??1)-1));
  e.radius=e.kind==='boss'?18:behavior==='clockwolf'?12:8;e.speed=behavior==='cable-rat'?38:behavior==='turnstile'?24:30;
  e.pattern=behavior==='cable-rat'&&e.x>400?1:0;
  e.cooldown=1;e.aimX=-1;e.aimY=0;e.miniBoss=behavior==='switchmaster';
}
export function cityDamage(e:Enemy,damage:number,dx:number,dy:number,force:number) {
  if(e.kind==='boss') return cityBossDamage(e,damage,force);
  // Attack travel opposite the shield's facing strikes its protected front.
  if(e.behavior==='turnstile'&&e.actionTimer===0&&dx*e.aimX+dy*e.aimY<-.3) return damage*.12;
  return damage;
}
export function updateCityEnemy(s:GameState,e:Enemy,dt:number,target:LunarTarget,api:CityCombat) {
  if(e.kind==='boss') {updateCityBoss(s,e,dt,target,api);return;}
  const dx=target.x-e.x,dy=target.y-e.y,len=Math.max(1,Math.hypot(dx,dy));
  const damage=9+Math.max(s.character.level,...(s.coop?.remoteHeroes.map(p=>p.hero.level)??[]))*1.3;
  if(e.actionTimer>0) {
    e.actionTimer=Math.max(0,e.actionTimer-dt);
    if(e.behavior==='clockwolf') api.move(e,e.aimX*(100/.6)*dt,e.aimY*(100/.6)*dt);
    if(e.behavior==='cable-rat') api.move(e,e.aimX*210*dt,e.aimY*210*dt);
    if(e.behavior==='cable-rat') for(const t of api.targets()) if(Math.hypot(t.x-e.x,t.y-e.y)<20) api.hurt(t,damage,e.x,e.y);
    if(e.actionTimer===0) {
      for(const t of api.targets()) if(Math.hypot(t.x-e.x,t.y-e.y)<(e.behavior==='clockwolf'?34:22)) api.hurt(t,damage,e.x,e.y);
      e.cooldown=2;e.pattern++;
    }return;
  }
  if(e.windup>0) {
    e.windup=Math.max(0,e.windup-dt);if(e.windup>0) return;
    if(e.behavior==='neon-imp') {
      // One marked bank point, then one bounce toward the locked target.
      const bx=e.x+e.aimX*55,by=e.y+e.aimY*55;
      api.shot(e,e.aimX,e.aimY,90,damage,5);
      const p=s.projectiles.at(-1)!;p.bounceDistance=55;p.bounceVx=(target.x-bx)/Math.max(1,Math.hypot(target.x-bx,target.y-by))*100;p.bounceVy=(target.y-by)/Math.max(1,Math.hypot(target.x-bx,target.y-by))*100;
      e.cooldown=2.6;
    } else e.actionTimer=e.behavior==='clockwolf'?.6:e.behavior==='cable-rat'?.6:.35;
    return;
  }
  if(len>200) {api.move(e,dx/len*e.speed*dt,dy/len*e.speed*dt);return;}
  if(e.cooldown===0) {
    e.aimX=dx/len;e.aimY=dy/len;
    if(e.behavior==='cable-rat') {const pad=e.pattern%2===0?{x:436,y:248}:{x:340,y:168};const l=Math.max(1,Math.hypot(pad.x-e.x,pad.y-e.y));e.aimX=(pad.x-e.x)/l;e.aimY=(pad.y-e.y)/l;}
    if(e.behavior==='neon-imp') {const a=Math.atan2(dy,dx)+.65;e.aimX=Math.cos(a);e.aimY=Math.sin(a);}
    e.windup=e.behavior==='clockwolf'?1.1:e.behavior==='cable-rat'?.7:.85;
  } else {
    const direction=e.behavior==='neon-imp'?(len<100?-1:0):len>40?1:0;
    api.move(e,dx/len*e.speed*direction*dt,dy/len*e.speed*direction*dt);
    if(e.behavior==='turnstile') {e.aimX=dx/len;e.aimY=dy/len;}
  }
}
