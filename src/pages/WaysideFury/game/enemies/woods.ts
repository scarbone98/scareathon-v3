import type { Enemy, GameState } from '../sim.ts';
import type { WoodsBehavior } from '../chapters/ch2Worlds.ts';
import type { LunarCombat, LunarTarget } from './lunar.ts';
import { foremanCoreProtected } from '../bosses/foreman.ts';
export function configureWoodsEnemy(s:GameState,e:Enemy,behavior:WoodsBehavior) {
  e.woodsBehavior=behavior;e.poise=0;e.burst=0;e.exposed=0;e.miniBoss=behavior==='bailiff';
  const level=Math.max(s.character.level,...(s.coop?.remoteHeroes.map(p=>p.hero.level)??[]));
  const power=Math.max(8,...s.party.map(id=>s.heroes[id].power),...(s.coop?.remoteHeroes.map(p=>p.hero.power)??[]));
  const hp=Math.max(power,8+level*2)*({rooted:9,lantern:7,wisp:5,bailiff:42,foreman:100}[behavior]);
  e.baseMaxHp=hp;e.hp=e.maxHp=hp*(1+(e.kind==='boss'?.75:.6)*((s.coop?.playerCount??1)-1));
  e.radius=behavior==='foreman'?22:behavior==='bailiff'?16:9;e.speed=behavior==='wisp'?26:behavior==='rooted'?23:18;
  e.cooldown=1;e.aimX=1;e.aimY=0;
}
export function woodsDamage(s:GameState,e:Enemy,damage:number,force:number,ki=false) {
  if(!e.woodsBehavior) return damage;
  if(e.woodsBehavior==='wisp'&&ki) {e.exposed=5;e.windup=0;s.notice='Candle extinguished! Nearby monsters lose its protection for five seconds.';}
  if(e.woodsBehavior==='rooted'&&(e.windup>0||e.actionTimer>0)) {e.windup=0;e.actionTimer=0;e.cooldown=1.8;s.notice='Exposed root cut. Snare interrupted.';}
  if((e.burst??0)>0) return damage*.15;
  if(e.woodsBehavior==='foreman'&&e.phase===2&&foremanCoreProtected(s)) return 0;
  if(e.kind==='boss') {
    e.poise=(e.poise??0)+Math.min(1,force/50);
    if(e.poise>=5) {e.poise=0;e.burst=.8;e.windup=.8;e.actionTimer=0;}
  }
  const boosted=e.woodsBehavior!=='wisp'&&s.enemies.some(a=>a.woodsBehavior==='wisp'&&a.hp>0&&(a.exposed??0)===0&&Math.hypot(a.x-e.x,a.y-e.y)<160);
  return damage*(boosted?.55:1);
}
// One fixed aim per windup; broad lanes always leave both side pockets open.
export function updateWoodsEnemy(s:GameState,e:Enemy,dt:number,target:LunarTarget,api:LunarCombat) {
  const behavior=e.woodsBehavior!;
  const dx=target.x-e.x,dy=target.y-e.y,len=Math.max(1,Math.hypot(dx,dy));
  const level=Math.max(s.character.level,...(s.coop?.remoteHeroes.map(p=>p.hero.level)??[]));
  const boosted=s.enemies.some(a=>a.woodsBehavior==='wisp'&&a.id!==e.id&&a.hp>0&&(a.exposed??0)===0&&Math.hypot(a.x-e.x,a.y-e.y)<160);
  const damage=(8+level*1.3)*(boosted?1.2:1);
  if(e.kind==='boss'&&e.phase===1&&e.hp<=e.maxHp*.5) {
    e.phase=2;e.burst=1;e.windup=1;e.actionTimer=0;
    s.notice=behavior==='foreman'?'Foreman phase 2: break both anchor housings, then hold Ki at each bypass. The core opens for a full combo.':'Briar Bailiff phase 2: two rake sweeps. Stay beside the marked lane, then punish the tangled rake.';
  }
  if((e.burst??0)>0) {
    e.burst=Math.max(0,e.burst!-dt);e.windup=e.burst!;
    if(e.burst===0) {
      for(let n=0;n<8;n++) api.shot(e,Math.cos(n*Math.PI/4),Math.sin(n*Math.PI/4),78,damage*.7);
      // The authored apron has no props. Substepped movement cannot tunnel.
      api.move(e,448-e.x,224-e.y);e.kx=e.ky=0;e.cooldown=1.6;
    }
    return;
  }
  if(behavior==='foreman'&&e.phase===2&&!foremanCoreProtected(s)&&!e.shieldBroken) {
    e.shieldBroken=true;e.exposed=6;e.windup=e.actionTimer=0;s.notice='Both bypasses powered! Core exposed for six seconds; shield stays down.';
  }
  if((e.exposed??0)>0) {e.exposed=Math.max(0,e.exposed!-dt);return;}
  if(['lantern','rooted'].includes(behavior)&&e.actionTimer>0) {
    e.actionTimer=Math.max(0,e.actionTimer-dt);
    if(behavior==='lantern') for(const t of api.targets()) if(Math.hypot(t.x-e.tellX!,t.y-e.tellY!)<24) api.hurt(t,damage*.7,e.tellX!,e.tellY!);
    return;
  }
  if(e.windup>0) {
    e.windup=Math.max(0,e.windup-dt);if(e.windup>0) return;
    if(behavior==='lantern') {api.shot(e,e.aimX,e.aimY,56,damage,7);e.actionTimer=2.2;}
    if(behavior==='rooted') {
      e.actionTimer=.6;
      for(const t of api.targets()) if(Math.hypot(t.x-e.tellX!,t.y-e.tellY!)<22) api.hurt(t,damage,e.tellX!,e.tellY!);
    }
    if(behavior==='bailiff'||behavior==='foreman'&&e.pattern%2===0) {
      for(const t of api.targets()) {
        const tx=t.x-e.x,ty=t.y-e.y,along=tx*e.aimX+ty*e.aimY,across=Math.abs(tx*e.aimY-ty*e.aimX);
        if(along>0&&along<190&&across<24) api.hurt(t,damage*1.25,e.x,e.y);
      }
      if(behavior==='bailiff'&&(e.phase===1||e.pattern%2===1)) e.exposed=e.phase===2?1.6:2.4;
    }
    if(behavior==='foreman'&&e.pattern%2===1) api.shot(e,e.aimX,e.aimY,68,damage*1.4,12);
    e.pattern++;e.cooldown=behavior==='rooted'?2.6:behavior==='lantern'?2.4:behavior==='bailiff'&&e.phase===2&&e.pattern%2===1?.35:e.phase===2?1.5:2.2;return;
  }
  if(behavior==='wisp') {
    const ally=s.enemies.find(a=>a.id!==e.id&&a.hp>0);
    if(ally) {const ax=ally.x-e.x,ay=ally.y-e.y,l=Math.max(1,Math.hypot(ax,ay));if(l>60) api.move(e,ax/l*e.speed*dt,ay/l*e.speed*dt);}
    if(e.cooldown===0&&len<180) {api.shot(e,dx/len,dy/len,42,damage*.6);e.cooldown=3.4;}return;
  }
  if(len>200) {api.move(e,dx/len*e.speed*dt,dy/len*e.speed*dt);return;}
  if(e.cooldown===0) {
    e.aimX=dx/len;e.aimY=dy/len;e.tellX=target.x;e.tellY=target.y;
    e.windup=behavior==='rooted'?.95:behavior==='lantern'?.8:1.05;
  } else if(e.kind!=='boss') {
    const dir=behavior==='lantern'?(len<96?-1:0):len>48?1:0;
    api.move(e,dx/len*e.speed*dir*dt,dy/len*e.speed*dir*dt);
  }
}

export function woodsMovementScale(s:GameState) {
  if(s.dashTimer>0) return 1;
  return s.enemies.some(e=>e.woodsBehavior==='rooted'&&e.actionTimer>0&&Math.hypot(s.x-(e.tellX??e.x),s.y-(e.tellY??e.y))<22)?.55:1;
}
