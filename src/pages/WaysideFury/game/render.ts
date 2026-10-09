import { drawOpening } from "./opening";
import { drawCrew } from './crewArt';
import { creatureMotion, idleMotion, type ActorMotion } from './animation';
import { prologueCamera } from './prologue';
import { radarPickupTarget as hubRadarPickupTarget } from "../u1/minimap/relicRadar";
import { drawArenaFloor } from "../u1/hub/arenaArt";
import { drawQuestNpc, drawQuestCosmetic } from "../u1/hub/questArt";
import { chipEffects, CHIP_REGISTRY, itemsState } from "./u1/items/chips";
import { chipTargets } from "./u1/items/pickups";
import { relicTargets, RELIC_SUMMON, hasAllRelics, OUTFITS } from "./u1/items/relics";
import { radarPickupTarget } from "./u1/items/radar";
import { drawItemMarker, drawWishOutfit } from "./u1/items/draw";
import { renderTrainingGrounds } from "./u1/combat/trainingRender";
import { drawFusionForm } from "./u1/combat/fusionRender";
import { drawDayNightLighting } from "./u1/world/dayNightRender";
import { sampleDayNight } from "./u1/world/dayNight";
import { worldCycleSeconds } from "./u1/world/dayNightRuntime";
import { obstaclesForState, isObstacleCleared } from './locks/obstacles';
import { drawHeroObstacle } from './locks/obstacleRender';
import { INTERIORS } from './interiors';
import { drawExitOpening, nearExit, exitCaption, exitOpacity } from './exitArt';
import { groundScatter, roadMask } from './roadClearance.ts';
import { drawWalkableSurface, isGroundProp } from "./walkableSurfaces";
import { drawScorchedDepression, GROUND_DECALS } from './grounding.ts';
import { drawAreaGround, drawInteriorGround, drawBuildingDoors } from './renderAreas2d.ts';
import { applyEnemyWindup } from "./enemyWindup";
import { drawBlastProp } from "./blastArt";
import { drawCityGround, drawCityEnemy, drawCityProp, drawCityStory } from "./chapters/ch4Art";
import { drawWoodsBody, drawWoodsHazard, drawWoodsMachinery } from "./renderWoods2d";
import { fieldWorld } from "./fieldAbilities";
import { drawCountyProp } from "./countyArt";
import { resolveHeroVisual, drawHeroVisual, type SuitPose } from './heroVisuals';
import { drawSpaceProp, drawMoonGround, drawLunarBody, drawLaunchEstablishing, drawSpaceFilm } from "./renderSpace2d";
import { lunarLift, hasSpaceFlag } from "./lunar";
import { campaignLocations, sameCampaignMap } from "./campaign.ts";
// The renderer only reads simulation state. World units are independent of pixels.
import { zonePreviews, drawPreviewPart } from './zonePreviews';
import { activeHero, type Effect, type Enemy, type GameState, type GameEvent, type HeroId, type Projectile } from "./sim";

import { HUB_POINTS, PROLOGUE } from "./content";
import { parkedCarPose, cameraTarget, getWorld, type WorldMap, type WorldProp } from "./world";
import { drawCanopy, drawTaxiBody, drawTaxiWreck } from "./scenery";
import { QualityRecovery } from './qualityRecovery';
import { TerrainCache } from "./terrain";
import type { AvatarStrip, HeroAvatar } from "./avatar";
import { getRenderViewport } from "./viewport";
import { ambientTaxi, TAXI_ROCK_IMPACT, roadsideBirds, taxiRockPosition } from './dressing';
import { availablePickups } from './collectibles';

interface Sheet { url: string; w: number; h: number; frames: number }
const SHEETS = {
  joe: { url: "/royale/joe_idle.png", w: 16, h: 24, frames: 6 },
  matt: { url: "/royale/matt_idle.png", w: 16, h: 24, frames: 6 },
  alex: { url: "/royale/ui/alex_idle.png", w: 16, h: 24, frames: 6 },
  jon: { url: "/royale/ui/jon_idle.png", w: 16, h: 24, frames: 5 },
  run_joe: { url: "/mystery-crypt/run_joe.png", w: 16, h: 24, frames: 4 },
  run_matt: { url: "/mystery-crypt/run_matt.png", w: 16, h: 24, frames: 4 },
  zombie: { url: "/sprites/zombiesprite-1.png", w: 16, h: 24, frames: 6 },
  pumpkin: { url: "/sprites/pumpkin.png", w: 16, h: 16, frames: 6 },
  ghost: { url: "/sprites/ghost.png", w: 16, h: 32, frames: 6 },
  imp: { url: "/sprites/imp.png", w: 16, h: 16, frames: 4 },
  shadowbeast: { url: "/sprites/shadowbeast.png", w: 32, h: 32, frames: 6 },
} satisfies Record<string, Sheet>;
type BuiltinSpriteId = keyof typeof SHEETS;
type SpriteId = BuiltinSpriteId | "you";
const ACCENT: Record<HeroId, string> = { you: "#b0f3d1", joe: "#79ebff", matt: "#ffd06f", alex: "#bada86", jon: "#c39beb" };
const INK = "#101722";
// These dimensions author the story's stage; the stage is drawn directly into
// the native canvas with a responsive transform, never into a small buffer.
const STAGE_WIDTH = 320, STAGE_HEIGHT = 180, SPRITE_DETAIL = 3;
interface DetailedSheet { canvas: HTMLCanvasElement; frames: number }


export interface RenderLabel {
  id: string | number; text: string; x: number; y: number;
  kind: 'location' | 'locked' | 'hub' | 'exit' | 'floater' | 'caption';
  color?: string; opacity?: number; scale?: number;
}
export interface RenderPresentation {
  camera: { x: number; y: number; width: number; height: number };
  labels: RenderLabel[];
  focus?: { x: number; y: number };
}
interface PixelBurst { x: number; y: number; color: string; life: number; maxLife: number; seed: number; strength: number }
interface Tumble { x: number; y: number; sprite: SpriteId; life: number; maxLife: number; scale: number; flip: boolean }

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private images = new Map<BuiltinSpriteId, HTMLImageElement>();
  private avatar: HeroAvatar | null = null;
  private remoteAvatars = new Map<number, HeroAvatar>();
  private detailedSheets = new Map<BuiltinSpriteId, DetailedSheet>();
  private viewport = getRenderViewport(1, 1, window.devicePixelRatio);
  private qualityCap = Infinity;

  private qualityRecovery = new QualityRecovery();
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private resize = () => {
    const { width, height } = this.ctx.canvas.getBoundingClientRect();
    this.setViewport(width, height);
  };
  private terrain = new TerrainCache();
  private camera = { x: 0, y: 0 };
  private world: WorldMap | null = null;
  private sceneKey = '';
  private transition = 0;
  private shake = 0;
  private visualTime = 0;
  private kiPose = 0;
  private previousKi: number | null = null;
  private previousHero: HeroId | null = null;
  private bursts: PixelBurst[] = [];
  private tumbles: Tumble[] = [];
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private reducedMotion = this.motionQuery.matches;
  private motionChanged = (event: MediaQueryListEvent) => { this.reducedMotion = event.matches; };

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    for (const [id, sheet] of Object.entries(SHEETS)) {
      const image = new Image();
      image.onload = () => { if (!this.disposed) this.prepareSheet(id as BuiltinSpriteId, image); };
      image.src = sheet.url; this.images.set(id as BuiltinSpriteId, image);
    }
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas);
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
    this.motionQuery.addEventListener('change', this.motionChanged);
    this.resize();
  }
  setAvatar(assets: HeroAvatar) { this.avatar = assets; }
  setRemoteAvatar(seat: number, assets: HeroAvatar) { this.remoteAvatars.set(seat, assets); }
  reset() {
    this.sceneKey = ''; this.world = null; this.bursts = []; this.tumbles = []; this.shake = 0;
    this.transition = 0; this.qualityRecovery.reset();
    this.kiPose = 0; this.previousKi = null; this.previousHero = null;
  }
  dispose() {
    this.disposed = true; this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('resize', this.resize);
    this.motionQuery.removeEventListener('change', this.motionChanged); this.terrain.clear();
    for (const image of this.images.values()) image.onload = null;
    this.images.clear(); this.detailedSheets.clear(); this.avatar = null;
  }
  private setViewport(cssWidth: number, cssHeight: number) {
    if (cssWidth <= 0 || cssHeight <= 0) return;
    const next = getRenderViewport(cssWidth, cssHeight, window.devicePixelRatio, this.qualityCap);
    if (next.pixelScale !== this.viewport.pixelScale || next.dpr !== this.viewport.dpr) this.terrain.clear();
    this.viewport = next;
    const canvas = this.ctx.canvas;
    if (canvas.width !== next.pixelWidth) canvas.width = next.pixelWidth;
    if (canvas.height !== next.pixelHeight) canvas.height = next.pixelHeight;
    canvas.dataset.pixelScale = `${next.pixelScale}`; canvas.dataset.zoom = `${next.zoom}`;
    canvas.dataset.renderDpr = `${next.dpr}`; canvas.dataset.qualityCap = `${this.qualityCap}`;
    canvas.dataset.worldWidth = `${next.width}`; canvas.dataset.worldHeight = `${next.height}`;
  }
  private checkQuality(frameDelta: number) {
    if ((window.devicePixelRatio || 1) !== this.viewport.dpr) this.resize();
    if (document.hidden || frameDelta <= 0) { this.qualityRecovery.reset(); }
  }
  project(x: number, y: number) { return { x: (x - this.camera.x) / this.viewport.width, y: (y - this.camera.y) / this.viewport.height }; }
  presentation(s: GameState): RenderPresentation {
    const labels: RenderLabel[] = [];
    if(s.mapId==='city-hatching'&&s.dialogue?.speaker==='Jon') return {camera:{...this.camera,width:this.viewport.width,height:this.viewport.height},labels,focus:{x:.5,y:.5}};
    if(s.film || s.mapId === "space-launch" && s.sceneTimer<3 && !s.moving) return {camera:{...this.camera,width:this.viewport.width,height:this.viewport.height},labels,focus:{x:.5,y:.5}};
    const add = (id: string | number, text: string, x: number, y: number, kind: RenderLabel['kind'], color?: string, opacity?: number, scale?: number) => {
      const point = this.project(x, y);
      if (point.x < .02 || point.x > .98 || point.y < .05 || point.y > .95) return;
      labels.push({ id, text, ...point, kind, color, opacity, scale });
    };
    if (s.scene === 'overworld') for (const location of campaignLocations(s)) {
      const distance = Math.hypot(s.x - location.x, s.y - location.y);
      if (distance <= 48) add(location.id, location.locked ? `${location.name} · Taken over` : location.name, location.x, location.y + 24, location.locked ? 'locked' : 'location', undefined, Math.min(1,(48-distance)/16));
    }
    if (s.scene === 'hub') for (const point of HUB_POINTS) {
      if (Math.hypot(s.x - point.x, s.y - point.y) < 140) add(point.id, point.name, point.x, point.y - (point.id === 'taxi' ? 25 : 61), 'hub', undefined, Math.max(0, Math.min(1, (140 - Math.hypot(s.x - point.x, s.y - point.y)) / 40)));
    }
    if (this.world && s.scene !== 'prologue' && s.scene !== 'shift') for (const exit of this.world.exits) {
      if (nearExit(exit,s.x,s.y)) add(`exit-${exit.id}`, exitCaption(this.world,exit), exit.x + exit.w / 2, exit.y - (this.world.id.startsWith('interior-') ? 40 : 15), 'exit', undefined, exitOpacity(exit,s.x,s.y));
    }
    for (const door of INTERIORS) if (door.parent===s.mapId && Math.hypot(s.x-door.x,s.y-door.y)<=48) add(`door-${door.id}`,door.name,door.x,door.y-35,'exit',undefined,Math.min(1,(48-Math.hypot(s.x-door.x,s.y-door.y))/16));
    if (this.world && s.scene !== 'prologue' && s.scene !== 'shift') for (const prop of this.world.props) {
      if (prop.label && !prop.interiorId && !['shop', 'home', 'portal'].includes(prop.kind) && !(s.scene === 'hub' && HUB_POINTS.some(point => point.name === prop.label)) && Math.hypot(s.x - prop.x - prop.w / 2, s.y - prop.y - prop.h) < 110) add(`prop-${prop.id}`, prop.label, prop.x + prop.w / 2, prop.y - 8, 'hub', undefined, Math.max(0, Math.min(1, (110 - Math.hypot(s.x - prop.x - prop.w / 2, s.y - prop.y - prop.h)) / 30)));
    }
    if (s.scene !== 'prologue' && s.scene !== 'shift') for (const floater of s.floaters) {
      add(floater.id, floater.text, floater.x, floater.y, 'floater', floater.color, Math.min(1, floater.ttl * 4), 1 + Math.max(0, floater.ttl - .65) * 1.5);
    }
    for (const enemy of s.enemies) if (enemy.hp > 0) add(`enemy-symbol-${enemy.id}`, enemy.kind === 'boss' ? '♛' : enemy.kind === 'shooter' ? '⊙' : '▲', enemy.x, enemy.y - enemy.radius - 14, 'caption');
    for (const pickup of availablePickups(s)) if (Math.hypot(s.x - pickup.x, s.y - pickup.y) < 80) add(`pickup-symbol-${pickup.id}`, { snack: '♡', candy: '◈', lore: '▤', trinket: '✦' }[pickup.kind], pickup.x, pickup.y - 16, 'caption');
    for (const gate of obstaclesForState(s)) if (!isObstacleCleared(s,gate.id) && Math.hypot(s.x - gate.x - gate.w/2, s.y - gate.y) < 100) add(`gate-symbol-${gate.id}`, `${{ you: '◎', joe: '≋', matt: '◆', alex: '✚', jon: '✦' }[gate.hero]} ${gate.hero === 'you' ? 'You' : gate.hero} · locked`, gate.x + gate.w/2, gate.y - 38, 'locked');
    for (const peer of s.coop?.remoteHeroes ?? []) if (sameCampaignMap(s, peer)) add(`peer-${peer.seat}`, peer.name, peer.x, peer.y - 34, 'hub', '#b0f3d1');
    if (s.scene === 'overworld' && s.ambientTaxiGag >= TAXI_ROCK_IMPACT && s.ambientTaxiGag < 3.5) add('cab-driver', 'My cab!', ambientTaxi(s).x, ambientTaxi(s).y - 38, 'caption');
    return { camera: { ...this.camera, width: this.viewport.width, height: this.viewport.height }, labels, focus: this.project(s.x, s.y) };
  }
  onEvent(s: GameState, event: GameEvent) {
    if (event.type === 'ambient-taxi-crash') {
      this.shake = Math.max(this.shake, 5);
      this.bursts.push({ x: event.x, y: event.y - 10, color: '#ffe0a1', life: .48, maxLife: .48, seed: 79, strength: 32 });
    }
    if (event.type === 'hit') {
      this.shake = Math.max(this.shake, Math.min(4, 1 + event.damage / 14));
      this.bursts.push({ x: event.x, y: event.y - 9, color: event.target === 'hero' ? '#ffab94' : ACCENT[s.active], life: .22, maxLife: .22, seed: Math.round(event.x + event.y), strength: Math.min(22, 10 + event.damage / 3) });
    }
    if (event.type === 'kill') {
      this.bursts.push({ x: event.x, y: event.y - 12, color: event.kind === 'boss' ? '#d488cf' : '#94b58a', life: .48, maxLife: .48, seed: event.enemyId, strength: event.kind === 'boss' ? 36 : 23 });
      if(!s.mapId.startsWith('city-')) this.tumbles.push({ x: event.x, y: event.y, sprite: event.sprite, life: .34, maxLife: .34, scale: event.radius > 10 ? 1.6 : 1, flip: event.x > s.x });
    }
    if (event.type === 'death') this.tumbles.push({ x: s.x, y: s.y, sprite: s.active, life: .65, maxLife: .65, scale: 1, flip: s.faceX < 0 });
    if (this.bursts.length > 36) this.bursts.splice(0, this.bursts.length - 36);
  }
  draw(s: GameState, dt = 1 / 60, frameDelta = dt) {
    const c = this.ctx;
    // Paused menus and snapshots do not establish a gameplay frame budget.
    this.checkQuality(dt > 0 ? frameDelta : 0);
    const { width, height, pixelScale } = this.viewport;
    dt = Math.min(.05, Math.max(0, dt));
    this.visualTime += dt;
    this.kiPose = Math.max(0, this.kiPose - dt);
    const ki = activeHero(s).ki;
    if (this.previousHero === s.active && this.previousKi !== null && ki < this.previousKi - 1 && s.charge === 0) this.kiPose = .24;
    this.previousKi = ki; this.previousHero = s.active;
    this.shake = Math.max(0, this.shake - dt * 23);
    this.transition = Math.max(0, this.transition - dt);
    for (const burst of this.bursts) burst.life -= dt;
    for (const tumble of this.tumbles) tumble.life -= dt;
    this.bursts = this.bursts.filter(burst => burst.life > 0);
    this.tumbles = this.tumbles.filter(tumble => tumble.life > 0);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
    c.imageSmoothingEnabled = false;
    if(s.film) {
      this.camera={x:0,y:0};
      drawSpaceFilm(c,s,width,height,this.reducedMotion,(id,x,y,pose)=>this.hero({...s,active:id,x,y,spaceOutfit:true,boundTimer:0,moving:false},pose));
      return;
    }
    if (s.scene === 'prologue' || s.scene === 'shift') {
      this.camera = { x: 0, y: 0 };
      const storyState = this.reducedMotion ? { ...s, time: 0, sceneTimer: 2.5 } : s;
      this.drawCinematic(storyState);
      if (s.palette === 'eightbit' || (s.scene === 'shift' && s.transitionPalette === 'eightbit' && s.sceneTimer > 1.15)) this.applyRealmPalette();
      return;
    }
    if(s.mapId === 'space-launch' && s.sceneTimer < 3 && !s.moving) {
      drawLaunchEstablishing(c,s,width,height,getWorld(s.scene,s.room,s.mapId),()=>this.hero(s));return;
    }
    const world = (s.scene === 'dead' || s.scene === 'results') && this.world ? this.world : fieldWorld(s);
    const key = `${world.id}:${s.scene === 'dead' || s.scene === 'results' ? '' : s.scene}`;
    const target = cameraTarget(world, s.x, s.y, width, height, s.moving ? s.faceX : 0, s.moving ? s.faceY : 0);
    if (this.sceneKey !== key) { this.camera = target; this.sceneKey = key; this.transition = this.reducedMotion ? 0 : .18; }
    const ease = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 8.5);
    this.camera.x = world.width <= width ? (world.width - width) / 2 : Math.max(0, Math.min(world.width - width, this.camera.x + (target.x - this.camera.x) * ease));
    this.camera.y = world.height <= height ? (world.height - height) / 2 : Math.max(0, Math.min(world.height - height, this.camera.y + (target.y - this.camera.y) * ease));
    c.canvas.dataset.cameraX = `${this.camera.x}`; c.canvas.dataset.cameraY = `${this.camera.y}`;
    if (this.world && this.world !== world && this.world.id === world.id) this.terrain.clear();
    this.world = world;
    c.save();
    const shakeX = this.reducedMotion ? 0 : Math.sin(this.visualTime * 113) * this.shake;
    const shakeY = this.reducedMotion ? 0 : Math.cos(this.visualTime * 97) * this.shake * .5;
    c.translate(-this.camera.x + shakeX, -this.camera.y + shakeY);
    const motionTime = this.reducedMotion ? 0 : s.time;
    this.terrain.draw(c, world, this.camera, width, height, motionTime, pixelScale, this.viewport.dpr);
    drawAreaGround(c,world);
    drawArenaFloor(c,s);
    renderTrainingGrounds(c,s,motionTime);
    drawOpening(c,s);
    drawInteriorGround(c,world);
    drawMoonGround(c,world,s);
    drawCityGround(c,s);
    drawWoodsMachinery(c,s);
    this.ambient(s, world, motionTime);
    if (s.scene === 'overworld') this.locationMarkers(s, motionTime);
    for (const effect of s.effects) if ((effect.kind === 'dash' || effect.kind === 'charge') && this.visible(effect.x, effect.y, 50)) this.effect(effect);
    for (const enemy of s.enemies) if (this.visible(enemy.tellX ?? enemy.x, enemy.tellY ?? enemy.y, 30)) drawWoodsHazard(this.ctx, enemy);
    const visibleProps = world.props.filter(prop => this.visible(prop.x, prop.y, Math.max(prop.w, prop.h) + 30));
    for (const prop of visibleProps.filter(prop => isGroundProp(prop) || GROUND_DECALS.has(prop.kind))) this.prop(prop, motionTime, s);
    const actors = visibleProps.filter(prop => !isGroundProp(prop) && !GROUND_DECALS.has(prop.kind)).map(prop => ({ y: prop.y + prop.h, draw: () => this.prop(prop, motionTime, s) }));
    if (s.scene === 'overworld') for (const part of zonePreviews(world)) if (this.visible(part.x, part.z, part.h + part.y + 40)) actors.push({ y: part.z, draw: () => drawPreviewPart(c, part) });
    if (s.scene === 'overworld') actors.push({ y: s.y, draw: () => this.taxi(s.x, s.y, s.faceX, s.faceY, motionTime, s.moving, s.motion) });
    else if (s.scene !== 'dead') actors.push({ y: s.y, draw: () => {
      const outfit = OUTFITS.find(outfit => outfit.id === itemsState(s).relics.outfits.at(-1));
      if (outfit) drawWishOutfit(c, s.x, s.y, outfit.color, outfit.glow, motionTime);
      drawFusionForm(c,s,s.coop?.seat ?? 0,false,this.reducedMotion); this.hero(s); drawFusionForm(c,s,s.coop?.seat ?? 0,true,this.reducedMotion);
    } });
    else if (this.tumbles.length === 0) actors.push({ y: s.y, draw: () => { c.save(); c.translate(s.x, s.y); c.rotate(Math.PI / 2); this.sprite(s.active, 0, 0, 0, s.faceX < 0); c.restore(); } });
    actors.push(...s.enemies.filter(enemy => enemy.hp > 0 && this.visible(enemy.x, enemy.y, 60)).map(enemy => ({ y: enemy.y, draw: () => this.enemy(s, enemy) })));
    if (s.scene !== 'overworld' && s.active === 'you' && this.avatar && !s.spaceOutfit) actors.push({ y: s.y + 1, draw: () => { for (const strip of this.avatar!.companions) this.avatarStrip(strip, s.x, s.y, this.reducedMotion ? 0 : this.visualTime, s.faceX < 0, 1, false, s.motion); } });
    for (const peer of s.coop?.remoteHeroes ?? []) if (sameCampaignMap(s, peer) && this.visible(peer.x, peer.y, 60)) actors.push({ y: peer.y, draw: () => {
      const ownAvatar = this.avatar; this.avatar = this.remoteAvatars.get(peer.seat) ?? null;
      const remote = { ...s, ...peer, hubCosmetic: peer.questCosmetic, meleeCharge: peer.meleeCharge ?? 0, active: peer.hero.id, heroes: { ...s.heroes, [peer.hero.id]: peer.hero } };
      if (s.scene === 'overworld') this.taxi(peer.x, peer.y, peer.faceX, peer.faceY, motionTime, peer.moving, peer.motion); else { drawFusionForm(c,remote,peer.seat,false,this.reducedMotion); this.hero(remote); drawFusionForm(c,remote,peer.seat,true,this.reducedMotion); }
      for (const strip of peer.spaceOutfit ? [] : this.avatar?.companions ?? []) this.avatarStrip(strip, peer.x, peer.y, this.reducedMotion ? 0 : this.visualTime, peer.faceX < 0, 1, false, peer.motion);
      this.avatar = ownAvatar;
    } });
    for(const assist of s.effects.filter(e=>e.fieldAssist&&e.hero)) actors.push({y:assist.y,draw:()=>{c.save();c.globalAlpha=Math.min(1,assist.ttl*4);if(s.spaceOutfit)this.hero({...s,active:assist.hero!,x:assist.x,y:assist.y,moving:false,guard:false,attackTimer:0,charge:0});else this.sprite(assist.hero!,assist.x,assist.y,motionTime,s.faceX<0);c.restore();}});
    for (const door of world.radarAnchors?.filter(anchor=>anchor.id.endsWith("-door")) ?? []) actors.push({y:door.y,draw:()=>drawBuildingDoors(c,s)});
    const radar = radarPickupTarget(s);
    for (const item of [...chipTargets(s), ...relicTargets(s), ...(radar ? [radar] : [])]) actors.push({ y: item.y, draw: () => drawItemMarker(c, { ...item, color: item.kind === "chip" ? CHIP_REGISTRY[item.chip].color : undefined }, motionTime, this.reducedMotion) });
    if (s.mapId === "hub" && hasAllRelics(s)) actors.push({ y: RELIC_SUMMON.y, draw: () => drawItemMarker(c, { ...RELIC_SUMMON, kind: "summon" }, motionTime, this.reducedMotion) });
    for (const gate of obstaclesForState(s)) if (this.visible(gate.x,gate.y,110)) {
      actors.push({y:gate.y+gate.h,draw:()=>drawHeroObstacle(c,gate,isObstacleCleared(s,gate.id),motionTime,this.reducedMotion?1:1-(s.effects.find(e=>Math.abs(e.x-gate.x-gate.w/2)<1&&Math.abs(e.y-gate.y-gate.h/2)<1)?.ttl??0)/.8)});
      actors.push({y:gate.rewardAnchor.y,draw:()=>{c.save();c.fillStyle='#9b7252';c.fillRect(gate.rewardAnchor.x-10,gate.rewardAnchor.y-10,20,12);c.strokeStyle='#e3bc78';c.lineWidth=1;c.strokeRect(gate.rewardAnchor.x-10,gate.rewardAnchor.y-10,20,12);c.restore();}});
    }
    actors.sort((a, b) => a.y - b.y); for (const actor of actors) actor.draw();
    this.pickupGlints(s, motionTime);
    const hubRadar = hubRadarPickupTarget(s);
    if (hubRadar) { c.save(); c.strokeStyle = "#e8cd83"; c.lineWidth = 1.5; c.beginPath(); c.arc(hubRadar.x, hubRadar.y - 6, 7, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(hubRadar.x, hubRadar.y - 6); c.lineTo(hubRadar.x + 5, hubRadar.y - 11); c.stroke(); c.restore(); }
    if (s.scene === 'overworld') this.rockGag(s, motionTime);
    for (const shot of s.projectiles) if (this.visible(shot.x, shot.y, 60)) this.projectile(shot, motionTime);
    for (const effect of s.effects) if (effect.kind !== 'dash' && effect.kind !== 'charge' && this.visible(effect.x, effect.y, 70)) this.effect(effect);
    this.drawImpacts();
    const daylight = sampleDayNight(worldCycleSeconds(s));
    c.canvas.dataset.worldPhase = s.scene === "overworld" ? daylight.phase : "interior";
    if (s.scene === "overworld") drawDayNightLighting(c, world, { ...this.camera, width, height }, daylight, s, s.enemies);
    c.restore();
    if(s.mapId==='city-hatching'&&s.dialogue?.speaker==='Jon') {
      // A screen-space foreground keeps all five identities visible on phones.
      drawCityStory(c,s,width,height);
      c.save();
      for(const [index,id] of (['joe','matt','alex','jon','you'] as const).entries()) this.hero({...s,active:id,x:width/2+(index-2)*Math.min(34,width/6),y:height*.68,spaceOutfit:false,moving:false,guard:false,attackTimer:0,charge:0});
      c.restore();
    }
    if (s.palette === 'eightbit') this.applyRealmPalette();
    if (this.transition > 0) { c.globalAlpha = this.transition / .18 * .65; this.rect(0, 0, width, height, '#151c2a'); c.globalAlpha = 1; }
  }
  private visible(x: number, y: number, margin = 40) { return x >= this.camera.x - margin && x <= this.camera.x + this.viewport.width + margin && y >= this.camera.y - margin && y <= this.camera.y + this.viewport.height + margin; }
  private pickupGlints(s: GameState, time: number) {
    for (const pickup of availablePickups(s)) {
      if (Math.hypot(pickup.x - s.x, pickup.y - s.y) > 80 || !this.visible(pickup.x, pickup.y)) continue;
      const bob = this.reducedMotion ? 0 : Math.sin(time * 3 + pickup.x) * 1.5;
      const color = pickup.kind === 'lore' ? '#b9dfff' : pickup.kind === 'trinket' ? '#edc3fa' : '#ffe3a3';
      this.ctx.globalAlpha = .28; this.glow(pickup.x, pickup.y - 4 + bob, 5, color); this.ctx.globalAlpha = 1;
      this.rect(pickup.x - .6, pickup.y - 8 + bob, 1.2, 6, color); this.rect(pickup.x - 2.6, pickup.y - 5.6 + bob, 5.2, 1.2, color);
    }
  }
  private parkedCar(x: number, y: number, color: string, direction = 1) {
    const c = this.ctx; c.save(); c.translate(x, y); c.scale(direction, 1);
    this.shadow(0, 1, 34); this.rect(-15, -11, 30, 10, '#25353c');
    this.rect(-16, -13, 32, 9, color); this.rect(-8, -20, 18, 9, color);
    this.rect(-6, -18, 13, 6, '#314b58'); this.rect(-5, -17, 6, 1, '#7caaaa');
    this.rect(-13, -3, 5, 4, '#17282e'); this.rect(8, -3, 5, 4, '#17282e');
    this.rect(14, -10, 2, 3, '#f0deb1'); this.rect(-16, -9, 2, 2, '#c86661'); this.rect(-14, -4, 27, 1, '#9ba9a1');
    c.restore();
  }
  private rockGag(s: GameState, time: number) {
    const rock = taxiRockPosition(s), c = this.ctx;
    if (rock && this.visible(rock.x, rock.y - rock.height, 160)) {
      c.globalAlpha = .2 + (1 - rock.height / 190) * .25;
      c.save(); c.translate(rock.x, rock.y); c.scale(1, .35); this.disc(0, 0, 8, '#1b252d'); c.restore(); c.globalAlpha = 1;
      c.save(); c.translate(rock.x, rock.y - rock.height); c.rotate(rock.rotation);
      this.disc(0, 0, 9, '#625d59'); this.rect(-5, -6, 8, 4, '#aaa18d'); this.rect(3, -2, 5, 7, '#464952'); c.restore();
    }
    const impact = s.ambientTaxiGag - TAXI_ROCK_IMPACT;
    if (impact >= 0 && impact < .75 && !this.reducedMotion) {
      for (let k = 0; k < 15; k++) {
        const a = k * 2.4, spread = impact * (25 + k % 5 * 8);
        c.globalAlpha = (1 - impact / .75) * .5;
        this.disc(ambientTaxi(s).x + Math.cos(a) * spread, ambientTaxi(s).y - 12 + Math.sin(a) * spread * .5 - impact * 8, 3 + impact * 7, k % 4 ? '#b8a786' : '#ffe2a4');
      } c.globalAlpha = 1;
    }
    if (s.ambientTaxiWrecked && this.visible(ambientTaxi(s).x, ambientTaxi(s).y, 90)) {
      for (let k = 0; k < 6; k++) {
        const life = (time * .42 + k / 6) % 1;
        c.globalAlpha = (1 - life) * .4;
        this.disc(ambientTaxi(s).x + Math.sin(time + k) * (2 + life * 8), ambientTaxi(s).y - 21 - life * 35, 3 + life * 7, '#727776');
      } c.globalAlpha = 1;
    }
  }
  private drawCinematic(s: GameState) {
    const c = this.ctx, { width, height } = this.viewport;
    const sky = c.createLinearGradient(0, 0, width, height);
    sky.addColorStop(0, s.scene === 'shift' ? '#35263f' : '#203342'); sky.addColorStop(1, '#19252f');
    c.fillStyle = sky; c.fillRect(0, 0, width, height);
    for (let k = 0; k < 38; k++) {
      const x = (k * 43.7) % width, y = (k * 19.3 + s.time * 1.2) % height;
      c.globalAlpha = .12 + Math.sin(k + s.time) * .05; this.disc(x, y, .35 + k % 3 * .15, '#d5c6d6');
    }
    c.globalAlpha = 1;
    const portrait = height > width * 1.25;
    const scale = Math.min(width / STAGE_WIDTH, height * .58 / STAGE_HEIGHT);
    const shot = prologueCamera(s.cutscene, s.sceneTimer, this.reducedMotion);
    c.save();
    const stageY = portrait ? height * .39 : height * .45;
    c.beginPath(); c.rect(0, stageY - STAGE_HEIGHT * scale / 2, width, STAGE_HEIGHT * scale); c.clip();
    c.translate(width / 2, stageY); c.scale(scale * (s.scene === 'prologue' ? shot.zoom : 1), scale * (s.scene === 'prologue' ? shot.zoom : 1));
    c.translate(s.scene === 'prologue' ? -shot.x : -160, s.scene === 'prologue' ? -shot.y : -90);
    if (s.scene === 'prologue') this.drawPrologue(s); else this.drawShift(s);
    c.restore();
    if (s.scene === 'prologue' && s.sceneTimer < .35) {
      c.globalAlpha = 1 - s.sceneTimer / .35; this.rect(0, 0, width, height, '#15212e'); c.globalAlpha = 1;
    }
  }
  private drawShift(s: GameState) {
    const progress = Math.min(1, s.sceneTimer / 2.4);
    this.rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT, '#201e35');
    for (let y = 0; y < STAGE_HEIGHT; y += 16) for (let x = 0; x < STAGE_WIDTH; x += 16) {
      this.rect(x + 1, y + 1, 14, 14, (x + y) % 32 ? '#342b49' : '#40324f');
      this.rect(x + 3, y + 2, 8, 1, '#5c426f');
    }
    this.portal(160, 109, s.time, Math.min(1, progress * 4));
    this.ctx.globalAlpha = Math.max(0, 1 - progress * 1.3);
    this.sprite(s.active, 148 + progress * 12, 109 - Math.sin(progress * Math.PI) * 11, s.time);
    this.sprite(s.party.find(id => id !== s.active) ?? 'joe', 178 - progress * 12, 113 - Math.sin(progress * Math.PI) * 8, s.time, true);
    this.ctx.globalAlpha = 1;
    if (!this.reducedMotion) for (let k = 0; k < 8; k++) {
      const y = (k * 23 + Math.floor(s.sceneTimer * 37)) % STAGE_HEIGHT;
      this.ctx.globalAlpha = .25 + progress * .3;
      this.rect((k * 41) % STAGE_WIDTH, y, 24 + progress * 42, 2, k % 2 ? '#ae76cd' : '#75c7d0');
    }
    this.ctx.globalAlpha = 1;
  }

  private locationMarkers(s: GameState, time: number) {
    for (const location of campaignLocations(s)) {
      if (!this.visible(location.x, location.y, 80)) continue;
      if (location.locked) {
        this.ctx.globalAlpha = .1 + Math.sin(time * 3) * .025;
        this.disc(location.x, location.y, 48, '#9958b4'); this.ctx.globalAlpha = 1;
        this.portal(location.x, location.y, time, .85);
        for (let k = 0; k < 14; k++) {
          const x = location.x - 44 + (k * 23) % 88, y = location.y - 28 + (k * 17) % 56;
          this.rect(x + Math.floor(time * 2 + k) % 2, y, k % 2 ? 4 : 2, 2, k % 3 ? '#815181' : '#ab699d');
        }
      }
    }
  }
  private ambient(s: GameState, world: WorldMap, time: number) {
    const realm = s.palette === 'eightbit', blast = world.id.startsWith('blast');
    if (blast || realm) for (let k = 0; k < 22; k++) {
      const x = (k * 79 + time * (realm ? 4 : 7)) % world.width;
      const y = (k * 47 + world.height - time * (realm ? 6 : 13) % world.height) % world.height;
      if (!this.visible(x, y, 5)) continue;
      this.ctx.globalAlpha = .25 + (Math.sin(time * 2 + k) + 1) * .12;
      this.rect(x, y, realm ? 2 : 1, 2, realm ? '#d299d8' : k % 3 ? '#d89773' : '#ffca91');
    }
    this.ctx.globalAlpha = 1;
    for (const exit of world.exits) {
      if (!this.visible(exit.x + exit.w / 2, exit.y + exit.h / 2, 100)) continue;
      const open = (!exit.requiresClear || s.enemies.every(enemy => enemy.hp <= 0)) && (!exit.requiresInteraction || hasSpaceFlag(s,exit.requiresInteraction));
      drawExitOpening(this.ctx,world,exit,open);
    }
    if (world.id === 'overworld' && !this.reducedMotion) {
      const x = (time * 18 + 200) % world.width, y = 130 + Math.sin(time * .5) * 25;
      if (this.visible(x, y, 10)) {
        const wing = Math.floor(time * 6) % 2 ? 1 : -1;
        this.rect(x - 3, y + wing, 3, 1, '#eee3bd'); this.rect(x, y, 2, 1, '#eee3bd'); this.rect(x + 2, y + wing, 3, 1, '#eee3bd');
      }
      for (const bird of s.ambientBirds ?? roadsideBirds(s)) if (this.visible(bird.x, bird.y, 20)) {
        this.rect(bird.x - 4, bird.y - bird.height + bird.wing, 4, 1, '#353e46'); this.rect(bird.x, bird.y - bird.height, 2, 2, '#353e46'); this.rect(bird.x + 2, bird.y - bird.height + bird.wing, 4, 1, '#353e46');
      }
      for (let k = 0; k < 16; k++) {
        const x = (k * 83 + time * 7) % world.width, y = 390 + (k * 23 + time * 2) % 200;
        if (!this.visible(x, y, 5)) continue;
        this.ctx.globalAlpha = .3; this.rect(x, y + Math.sin(time + k) * 5, 2, 1, k % 2 ? '#bbaa71' : '#cf9866');
      } this.ctx.globalAlpha = 1;
    }
  }
  private prop(prop: WorldProp, time: number, s: GameState) {
    if(this.world && groundScatter(prop) && roadMask(this.world).intersects(prop))return;
    if(drawWalkableSurface(this.ctx,prop)) return;
    if(drawBlastProp(this.ctx,prop) || drawCityProp(this.ctx,prop,s) || drawSpaceProp(this.ctx,prop,s) || drawCountyProp(this.ctx,prop,time)) return;
    const x = prop.x + prop.w / 2, y = prop.y + prop.h;
    const c = this.ctx;
    if (prop.id.startsWith('u8-quest-')) { drawQuestNpc(c, prop.id, x, y, time); return; }
    if (prop.kind === 'tree' || prop.kind === 'pine') {
      const sway = this.reducedMotion ? 0 : Math.sin(time * 1.6 + x * .04) * .8;
      c.save(); if (prop.w > 32 && s.x > prop.x - 8 && s.x < prop.x + prop.w + 8 && s.y > prop.y && s.y < prop.y + prop.h - 10) c.globalAlpha = .38; c.translate(x + sway, y); const variation = .86 + (Math.floor(x) % 5) * .06; c.scale(variation * prop.w / 24, variation * prop.h / 32); this.tree(0, 0);
      if (prop.kind === 'pine') { this.rect(-5, -21, 10, 2, '#40534c'); this.rect(-3, -28, 6, 1, '#647064'); }
      c.restore(); return;
    }
    if (prop.kind === 'lamp') { this.lamp(x, y, time, s.palette === 'eightbit' ? '#db9cdb' : '#efce8f'); return; }
    if (prop.kind === 'portal') { if (s.scene !== 'overworld') this.portal(x, y, time); return; }
    if (prop.kind === 'car') {
      const pose = parkedCarPose(prop);
      this.parkedCar(pose.x, pose.y + 7.5, prop.color ?? '#799ba1', pose.heading); return;
    }
    if (prop.kind === 'ambient-taxi') {
      if (!s.ambientTaxiWrecked) this.taxi(x, y, 1, 0, time, false);
      else {
        this.shadow(x, y, 37); c.save(); c.translate(x, y); drawTaxiWreck(c); c.restore();
      } return;
    }
    if (prop.kind === 'bush') {
      this.shadow(x, y, prop.w); this.disc(x - 5, y - 5, 6, '#3d6249'); this.disc(x + 4, y - 6, 7, '#527551'); this.disc(x, y - 10, 5, '#6d8a57');
      this.rect(x - 6, y - 8, 2, 1, '#a0a665'); return;
    }
    if (prop.kind === 'puddle') {
      c.save(); c.translate(x, y - 2); c.scale(1, .25); c.globalAlpha = .65; this.disc(0, 0, prop.w / 2, '#557b84'); c.restore();
      this.rect(x - prop.w / 3, y - 3, prop.w / 2, .6, '#c5d5ce'); return;
    }
    if (prop.kind === 'debris') { this.rect(x-5,y-1,11,1,'#343c3560'); this.rect(x - 4, y - 3, 7, 3, '#796962'); this.rect(x + 2, y - 5, 3, 4, '#b29271'); return; }
    if (prop.kind === 'mailbox') {
      this.rect(x - 1, y - 14, 2, 15, '#715e46'); this.rect(x - 6, y - 19, 12, 7, '#758f90'); this.rect(x - 5, y - 18, 4, 5, '#496269'); this.rect(x + 5, y - 20, 1, 7, '#b4a486'); this.rect(x + 5, y - 20, 5, 2, '#db8a69'); return;
    }
    if (prop.kind === 'vending') {
      this.shadow(x, y, 24); this.rect(x - 10, y - 32, 20, 31, '#ac655a'); this.rect(x - 9, y - 31, 18, 3, '#e8cbb1');
      this.rect(x - 7, y - 25, 10, 17, '#273c45'); for (let k = 0; k < 6; k++) this.rect(x - 5 + k % 2 * 4, y - 23 + Math.floor(k / 2) * 5, 2, 3, k % 2 ? '#d6a98e' : '#d9d28a');
      this.rect(x + 5, y - 18, 2, 6, '#deb787'); this.rect(x - 6, y - 5, 13, 3, '#323b40'); return;
    }
    if (prop.kind === 'npc') {
      this.shadow(x, y);
      const id = prop.label === 'Jon' ? 'jon' : 'alex';
      drawCrew(c, id, x, y, time + x * .01); return;
    }
    if (prop.kind === 'station' || prop.kind === 'shop' || prop.kind === 'home' || prop.kind === 'shed' || prop.kind === 'diner') {
      this.worldBuilding(prop, time);
      if (prop.kind === 'diner') {
        this.rect(prop.x + 3, prop.y + 37, prop.w - 6, 5, '#dfb791');
        for (let k = 0; k < 11; k++) this.rect(prop.x + 3 + k * 9.7, prop.y + 37, 5, 5, '#a65e55');
        this.rect(x - 25, prop.y + 14, 50, 11, '#35474b'); this.rect(x - 20, prop.y + 17, 40, 2, '#f2d2a0'); this.rect(x - 15, prop.y + 21, 30, 1, '#c68e72');
      } return;
    }
    if (prop.kind === 'crater') {
      c.save(); c.translate(prop.x, prop.y); drawScorchedDepression(c, prop.w, prop.h); c.restore(); return;
    }
    if (prop.kind === 'flower') {
      for (let k = 0; k < Math.max(2, prop.w / 6); k++) {
        const px = prop.x + k * 6, py = y - 3 - k % 2 * 3, sway = this.reducedMotion ? 0 : Math.sin(time * 2 + k + x) * .5;
        this.rect(px, py, 1, 5, '#73905b'); this.rect(px - 1 + sway, py, 3, 2, k % 2 ? '#dac389' : '#d0949b');
      } return;
    }
    if (prop.kind === 'barrier') {
      // Full-width hazard rail at the physical map boundary; the footprint is
      // the rail's ground projection, shared with the road authoring helper.
      this.rect(prop.x, prop.y, prop.w, prop.h, '#26373d');
      const vertical = prop.h > prop.w, length = vertical ? prop.h : prop.w;
      for (let offset = 0; offset < length; offset += 12) {
        this.rect(prop.x + (vertical ? 1 : offset), prop.y + (vertical ? offset : 1),
          vertical ? prop.w - 2 : Math.min(6, length - offset), vertical ? Math.min(6, length - offset) : prop.h - 2, '#e8ba70');
      }
      for (const far of [false, true]) this.rect(prop.x + (!vertical && far ? prop.w - 2 : -2),
        prop.y + (vertical && far ? prop.h - 2 : -2), vertical ? prop.w + 4 : 4, vertical ? 4 : prop.h + 4, '#929587');
      return;
    }
    if (prop.kind === 'fence') {
      this.rect(prop.x + 2, y - 3, prop.w, 3, '#243b31');
      this.rect(prop.x, y - 9, prop.w, 2, '#a3916c'); this.rect(prop.x, y - 4, prop.w, 2, '#71664e');
      for (let px = prop.x; px < prop.x + prop.w; px += 16) { this.rect(px, y - 12, 3, 13, '#887b5d'); this.rect(px, y - 12, 2, 2, '#c0ad7f'); } return;
    }
    if (prop.kind !== 'rock') this.shadow(x, y, prop.w + 3);
    if (prop.kind === 'rock') {
      c.save(); c.fillStyle='#1c262b60';c.beginPath();c.ellipse(x,y-1,8,1.7,0,0,Math.PI*2);c.fill();c.restore();
      this.rect(x - 7, y - 6, 14, 6, '#4a4d52'); this.rect(x - 5, y - 10, 10, 5, '#7c7773'); this.rect(x - 4, y - 10, 5, 2, '#a5a087'); this.rect(x + 4, y - 6, 3, 5, '#41464b');
      for(let n=0;n<9;n++){this.rect(x-7+n*1.7,y-1+(n%2)*.4,2,.8,n%3?'#657054':'#8b8166');}
    } else if (prop.kind === 'sign') {
      this.rect(x - 2, y - 14, 4, 15, '#615643'); this.rect(x - 11, y - 22, 22, 12, '#b09b6f'); this.rect(x - 10, y - 21, 20, 2, '#d6c18b');
      this.rect(x - 6, y - 16, 10, 2, '#524f41'); this.rect(x + 4, y - 18, 2, 6, '#524f41');
    } else if (prop.kind === 'chest') {
      const open = s.clearedRooms.includes(prop.id);
      this.rect(x - 11, y - 12, 22, 11, '#76513f'); this.rect(x - 10, y - 12, 20, 3, '#b68656'); this.rect(x - 9, y - 3, 18, 2, '#543c39');
      this.rect(x - 11, y - (open ? 23 : 18), 22, 7, open ? '#684f47' : '#d0a56b');
      for (const dx of [-7, 5]) this.rect(x + dx, y - (open ? 20 : 17), 2, open ? 19 : 15, '#e1bf7f');
      this.rect(x - 2, y - 10, 4, 5, '#efdc91');
      if (!open) { c.globalAlpha = .35 + Math.sin(time * 3) * .12; this.rect(x - 1, y - 23, 2, 4, '#ffe7af'); this.rect(x - 2, y - 22, 4, 2, '#ffe7af'); c.globalAlpha = 1; }
    } else if (prop.kind === 'bbq') {
      this.rect(x - 9, y - 19, 18, 4, '#bd9670'); this.rect(x - 12, y - 15, 24, 11, '#43474d'); this.rect(x - 10, y - 13, 20, 2, '#74706a');
      this.rect(x - 8, y - 4, 3, 8, '#272f36'); this.rect(x + 6, y - 4, 3, 8, '#272f36');
      for (let k = 0; k < 3; k++) { c.globalAlpha = .4; this.rect(x - 6 + k * 6 + Math.sin(time + k) * 2, y - 21 - (time * 8 + k * 5) % 17, 2, 3, '#b9ac93'); } c.globalAlpha = 1;
    }
  }
  private worldBuilding(prop: WorldProp, time: number) {
    const { x, y, w, h } = prop, c = this.ctx;
    const station = prop.kind === 'station', home = prop.kind === 'home', shed = prop.kind === 'shed';
    const roof = home ? '#526d66' : shed ? '#5e5960' : '#906957', wall = home ? '#999a7c' : '#ad946e';
    c.save(); c.translate(x + w / 2 + 7, y + h - 1); c.scale(1, .12);
    this.glow(0, 0, w * .62, '#101c26'); c.restore();
    this.rect(x + 5, y + h - 4, w + 9, 8, '#243531');
    this.rect(x + 3, y + h * .4, w - 6, h * .6, wall);
    this.rect(x + w - 16, y + h * .4, 13, h * .6, '#6b6356');
    const wallShade = c.createLinearGradient(x, y + h * .4, x + w, y + h);
    wallShade.addColorStop(0, '#ffe5b012'); wallShade.addColorStop(.65, '#1f263300'); wallShade.addColorStop(1, '#1f263336');
    c.fillStyle = wallShade; c.fillRect(x + 3, y + h * .4, w - 6, h * .6);
    this.rect(x + 5, y + h * .42, w - 23, 3, '#d6bf92');
    for (let py = y + h * .5; py < y + h - 7; py += 9) this.rect(x + 4, py, w - 21, 1, '#8e7e61');
    for (let k = 0; k < 7; k++) this.rect(x - 5 + k * 4, y + h * .4 - k * 5, w + 10 - k * 8, 5, roof);
    for (let k = 1; k < 7; k++) {
      const top = y + h * .4 - k * 5;
      this.rect(x - 4 + k * 4, top, w + 8 - k * 8, .5, home ? '#90a995' : '#c0906b');
      for (let px = x + k * 4 + 4; px < x + w - k * 4; px += 11) this.rect(px, top + 1.5, .5, 2, home ? '#38564f' : '#725142');
    }
    this.rect(x - 5, y + h * .4 + 4, w + 10, 1.5, '#222b343d');
    this.rect(x + 20, y + h * .4 - 32, w - 40, 2, home ? '#88a093' : '#c0966b');
    for (let px = x + 16; px < x + w - 18; px += 18) this.rect(px, y + h * .4 - 20, 9, 1, home ? '#6c837a' : '#ad8261');
    const doorX = x + w / 2;
    this.rect(doorX - 10, y + h - 31, 20, 31, '#324346'); this.rect(doorX - 7, y + h - 28, 14, 26, '#526159');
    this.rect(doorX + 4, y + h - 15, 2, 3, '#ead79f'); this.rect(doorX - 13, y + h - 1, 26, 4, '#c2b28b');
    const windows = station ? [x + 18, x + 44, x + w - 66, x + w - 40] : [x + 18, x + w - 40];
    for (const wx of windows) {
      this.rect(wx - 2, y + h * .55 - 2, 23, 22, '#596252'); this.rect(wx, y + h * .55, 19, 17, '#ead198');
      c.globalAlpha = .3 + Math.sin(time * 2 + wx) * .03; this.glow(wx + 9, y + h * .55 + 7, 18, '#ffe1a0'); c.globalAlpha = 1;
      this.rect(wx + 1, y + h * .55 + 1, 5, 2, '#fff2c3');
      this.rect(wx + 8, y + h * .55, 2, 17, '#8d7e61'); this.rect(wx, y + h * .55 + 8, 19, 2, '#8d7e61');
    }
    if (station) { this.rect(doorX - 24, y + h * .45, 48, 12, '#2e4544'); this.rect(doorX - 20, y + h * .45 + 2, 40, 2, '#d2bd8a'); }
    if (prop.kind === 'shop') {
      for (let k = 0; k < 8; k++) this.rect(x + 8 + k * (w - 16) / 8, y + h * .7, (w - 16) / 8, 8, k % 2 ? '#e0c48d' : '#a96f5b');
      this.rect(x - 7, y + h - 13, 12, 12, '#785943'); this.rect(x - 4, y + h - 18, 4, 7, '#c7a87a');
    }
  }
  private drawImpacts() {
    const c = this.ctx;
    for (const tumble of this.tumbles) {
      if (!this.visible(tumble.x, tumble.y, 70)) continue;
      const progress = 1 - tumble.life / tumble.maxLife;
      c.save(); c.translate(tumble.x, tumble.y);
      c.globalAlpha = Math.min(1, tumble.life * 5);
      if (!this.reducedMotion) { c.rotate((tumble.flip ? -1 : 1) * Math.min(Math.PI / 2, progress * 2)); c.translate(progress * 6, -Math.sin(progress * Math.PI) * 6); }
      this.sprite(tumble.sprite, 0, 0, 0, tumble.flip, tumble.scale); c.restore();
    }
    for (const burst of this.bursts) {
      if (!this.visible(burst.x, burst.y, 70)) continue;
      const progress = 1 - burst.life / burst.maxLife;
      c.globalAlpha = Math.min(1, burst.life * 6);
      const count = this.reducedMotion ? 4 : burst.maxLife > .3 ? 16 : 9;
      for (let k = 0; k < count; k++) {
        const angle = k * Math.PI * 2 / count + burst.seed;
        const radius = this.reducedMotion ? 4 : progress * burst.strength;
        const x = burst.x + Math.cos(angle) * radius, y = burst.y + Math.sin(angle) * radius + (burst.maxLife > .3 ? progress * progress * 15 : 0);
        c.lineCap = 'round'; c.lineWidth = k % 3 ? .8 : 1.3; c.strokeStyle = k % 3 ? burst.color : '#fff3c9';
        c.beginPath(); c.moveTo(x - Math.cos(angle) * (2 + progress * 2), y - Math.sin(angle) * (2 + progress * 2)); c.lineTo(x, y); c.stroke();
      }
      c.globalAlpha = 1;
    }
  }
  private hero(s: GameState, pose?:SuitPose) {
    const c = this.ctx, hero = activeHero(s), color = ACCENT[s.active];
    if (s.meleeCharge > .25) { c.save(); c.strokeStyle = color; c.lineWidth = 2; c.beginPath(); c.arc(s.x, s.y - 10, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.meleeCharge / .6)); c.stroke(); c.restore(); }
    const suited = resolveHeroVisual(this.reducedMotion ? {...s,time:0,motion:idleMotion(s.motion?.facing)} : s, this.avatar,pose);
    if (suited) {
      this.shadow(s.x,s.y,14);
      drawHeroVisual(c,suited,s.x,s.y-lunarLift(s));
      return;
    }
    if (s.coop && hero.hp <= 0) { this.shadow(s.x, s.y, 17); c.save(); c.translate(s.x, s.y - 7); c.rotate(Math.PI / 2); this.sprite(s.active, 0, 0, s.time, s.faceX < 0); c.restore(); return; }
    const time = this.reducedMotion ? 0 : s.time;
    const walking = (s.motion?.speed ?? 0) > 1;
    if (s.charge > .12) {
      c.globalAlpha = .55 + Math.sin(time * 18) * .07; this.glow(s.x, s.y - 12, 19 + Math.min(9, s.charge * 5), color); c.globalAlpha = 1;
      c.strokeStyle = color; c.lineWidth = .65; c.globalAlpha = .45;
      c.beginPath(); c.ellipse(s.x, s.y - 12, 11 + s.charge * 2, 19, Math.sin(time * 2) * .1, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
      for (let k = 0; k < (this.reducedMotion ? 3 : 8); k++) {
        const a = time * 4 + k * Math.PI / 4, radius = 11 + k % 3 * 3;
        const px = s.x + Math.cos(a) * radius, py = s.y - 10 + Math.sin(a) * 15 - (time * 9 + k * 2) % 5;
        c.strokeStyle = color; c.lineWidth = .6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(px - Math.cos(a) * 2, py + 2); c.lineTo(px, py); c.stroke();
        this.disc(px, py, .6, '#fff3cf');
      }
    }
    this.shadow(s.x, s.y, s.dashTimer > 0 ? 19 : 14);
    this.rect(s.x - 5, s.y + 1, 10, 1, color);
    if (walking && !this.reducedMotion) for (let k = 0; k < 3; k++) {
      const life = (time * 3 + k / 3) % 1;
      c.globalAlpha = (1 - life) * .3;
      this.disc(s.x - s.faceX * life * 14 + (k % 2 ? 3 : -3), s.y - s.faceY * life * 14, .7 + life * 1.2, '#b7b395');
    }
    c.globalAlpha = hero.invulnerable > 0 && Math.floor(time * 16) % 2 === 0 ? .6 : 1;
    const cycle = Math.sin((s.motion?.speed ?? 0) > 1 ? s.motion!.phase : time * 2.8), bob = this.reducedMotion ? 0 : walking ? Math.abs(cycle) * 1.2 : cycle * .5;
    const attackDuration = s.combo === 3 ? .28 : .2, attackProgress = s.attackTimer > 0 ? 1 - s.attackTimer / attackDuration : 0;
    const strike = s.attackTimer > 0 ? (attackProgress < .18 ? -.8 : Math.sin((attackProgress - .18) / .82 * Math.PI)) : 0;
    c.save(); c.translate(s.x, s.y - bob - (s.spaceOutfit ? lunarLift(s) : 0));
    if (!this.reducedMotion) {
      const lean = s.dashTimer > 0 ? .12 * s.faceX : walking ? .035 * s.faceX + cycle * .015 : 0;
      c.rotate(lean + strike * .12 * s.faceX - this.kiPose / .24 * .1 * s.faceX + (hero.invulnerable > .3 ? -.09 * s.faceX : 0));
      if (s.dashTimer > 0) c.scale(1.16, .87); else if (s.attackTimer > 0) { c.translate(strike * s.faceX * 3, strike * s.faceY * 2); c.scale(1 + strike * .04, 1 - strike * .025); }
      else if (this.kiPose > 0) { const recoil = this.kiPose / .24; c.translate(-s.faceX * recoil * 2, -s.faceY * recoil); c.scale(1 + recoil * .035, 1 - recoil * .03); }
      else if (s.charge > .12) c.scale(1.035, .96);
      else c.scale(1 - cycle * .008, 1 + cycle * .009);
    }
    drawCrew(c, s.active, 0, 0, time, this.reducedMotion ? idleMotion(s.motion?.facing) : s.motion, this.avatar);
    drawQuestCosmetic(c, s);
    c.restore(); c.globalAlpha = 1;

    if (s.guard) {
      const x = s.x + s.faceX * 9, y = s.y - 12 + s.faceY * 7;
      c.globalAlpha = .6; this.rect(x - 5, y - 7, 10, 13, color); this.rect(x - 3, y + 6, 6, 3, color); c.globalAlpha = 1;
      this.rect(x - 3, y - 4, 6, 2, '#effbff'); this.rect(x - 1, y - 5, 2, 8, '#effbff');
    }
  }
  private enemy(s: GameState, enemy: Enemy) {
    if (this.reducedMotion) { s = { ...s, time: 0 }; enemy = { ...enemy, motion: idleMotion(enemy.motion?.facing) }; }
    if (chipEffects(s).scanner) {
      const top = enemy.y - (enemy.kind === "boss" ? 48 : 38), width = enemy.kind === "boss" ? 48 : 24;
      this.rect(enemy.x - width / 2, top, width, 3, INK);
      this.rect(enemy.x - width / 2, top, width * Math.max(0, enemy.hp) / enemy.maxHp, 3, "#7de5ff");
      if (enemy.windup > 0) { this.ctx.save(); this.ctx.strokeStyle = "#7de5ff"; this.ctx.lineWidth = 1; this.ctx.beginPath(); this.ctx.arc(enemy.x, enemy.y - 12, enemy.radius + 4, 0, Math.PI * 2); this.ctx.stroke(); this.ctx.restore(); }
    }
    if(drawWoodsBody(this.ctx,enemy,s)) return;
    if(drawCityEnemy(this.ctx,enemy,s)) return;
    if(drawLunarBody(this.ctx,enemy,s)) return;
    const c = this.ctx, boss = enemy.kind === 'boss', scale = boss ? 1.6 : 1;
    const id = enemy.sprite;
    const time = this.reducedMotion ? 0 : s.time + enemy.id * .17;
    if (boss && enemy.phase === 2) { c.globalAlpha = .55 + Math.sin(time * 9) * .07; this.glow(enemy.x, enemy.y - 23, 35, '#db82cb'); c.globalAlpha = 1; }
    this.shadow(enemy.x, enemy.y, boss ? 34 : 13);
    c.save(); c.translate(enemy.x, enemy.y);
    creatureMotion(c, enemy.motion, time, 0, 0, enemy.sprite === 'ghost');
    applyEnemyWindup(c, { ...enemy, x: 0, y: 0 });
    if (!this.reducedMotion) {
      const stagger = enemy.hitTimer / .15;
      c.rotate(enemy.hitTimer > 0 ? -Math.sign(enemy.kx || 1) * stagger * .18 : Math.sin(time * 5) * .015);
      c.translate(0, -Math.abs(Math.sin(time * 7)) * .7);
    }
    this.sprite(id, 0, 0, (enemy.motion?.speed ?? 0) > 1 ? enemy.motion!.phase / (Math.PI * 2) * SHEETS[id].frames / 12 : time * .35, false, scale, enemy.hitTimer > 0); c.restore();
    if (enemy.archetype === 'shield' && enemy.windup === 0 && enemy.actionTimer === 0) {
      const facing = Math.atan2(enemy.aimY, enemy.aimX);
      c.save(); c.strokeStyle = '#90daed'; c.lineWidth = 2.5; c.beginPath();
      c.arc(enemy.x, enemy.y - 8, 15, facing - .9, facing + .9); c.stroke(); c.restore();
    }
    if (enemy.hp < enemy.maxHp || boss) {
      const width = boss ? 48 : 18, top = enemy.y - SHEETS[id].h * scale - 6;
      this.rect(enemy.x - width / 2 - 1, top - 1, width + 2, 4, INK);
      this.rect(enemy.x - width / 2, top, width, 2, '#613448');
      this.rect(enemy.x - width / 2, top, width * enemy.hp / enemy.maxHp, 2, boss ? '#ef87bc' : '#f19b77');
    }
  }

  private drawPrologue(s: GameState) {
    const beat = PROLOGUE[s.cutscene] ?? PROLOGUE[0], phase = beat.phase;
    const time = this.reducedMotion ? 4 : s.sceneTimer;
    const crew = ['joe', 'matt', 'alex', 'jon'] as const;
    const dark = phase === 'dark' || phase === 'portal';
    const actor = (id: HeroId, x: number, y: number, moving = false, facing: ActorMotion['facing'] = 'down', emote: 'calm' | 'talk' | 'shock' | 'ready' = 'calm', distance = 0) => {
      this.shadow(x, y, 15);
      drawCrew(this.ctx, id, x, y, this.reducedMotion ? 0 : s.time, { phase: distance / 24 * Math.PI * 2, speed: moving && !this.reducedMotion ? 30 : 0, facing }, null, emote);
      if (beat.hero === id && phase !== 'taxi') {
        this.ctx.strokeStyle = ACCENT[id]; this.ctx.lineWidth = 1;
        this.ctx.beginPath(); this.ctx.ellipse(x, y + 2, 9, 2, 0, 0, Math.PI * 2); this.ctx.stroke();
      }
    };
    if (phase === 'backstory') {
      this.rect(0, 0, 320, 180, '#1e1d36');
      for (let k = 0; k < 32; k++) this.disc((k * 83) % 320, 12 + (k * 29) % 68, .5, '#eaccc1');
      this.rect(0, 110, 320, 70, '#34384a'); this.portal(265, 107, time);
      crew.forEach((id, i) => {
        const travel = Math.min(1, Math.max(0, (time - i * .22) / 1.6));
        actor(id, 245 + (85 + i * 37 - 245) * travel, 116 + i % 2 * 6, travel < 1, travel < 1 ? 'left' : 'down', 'calm', Math.abs(85 + i * 37 - 245) * travel);
      });
      return;
    }
    this.drawBackyard(time, dark);
    if (phase === 'years') {
      // Begin on an empty yard, then let the reunion enter the frame.
      crew.forEach((id, i) => {
        const travel = Math.min(1, Math.max(0, (time - .6 - i * .2) / 1.5));
        actor(id, 60 + (119 + i * 32 - 60) * travel, 99 + i % 2 * 6, travel < 1, 'right', 'calm', (119 + i * 32 - 60) * travel);
      });
      return;
    }
    if (phase === 'suitup') {
      this.rect(0, 0, 320, 180, '#152733');
      crew.forEach((id, i) => {
        const t = Math.min(1, Math.max(0, (time - i * .38) / .55));
        this.ctx.globalAlpha = .12; this.disc(82 + i * 52, 80, 26, ACCENT[id]); this.ctx.globalAlpha = 1;
        actor(id, 82 + i * 52, 137 - t * 25, t < 1, 'down', t === 1 ? 'ready' : 'calm', t * 25);
      });
      return;
    }
    if (phase === 'taxi') {
      this.road(0, 111, 320, 25, true);
      crew.forEach((id, i) => {
        const p = Math.min(1, Math.max(0, (time - .5 - i * .3) / 1.4));
        const start = 100 + i * 35;
        if (p < 1) actor(id, start + (167 - start) * p, 103 + i % 2 * 4, true, start > 167 ? 'left' : 'right', 'calm', Math.abs(167 - start) * p);
      });
      // Park until the player finishes reading; departure belongs to the fade.
      const depart = (s.prologueExit ?? 0) * 150;
      this.taxi(167 + depart, 127, 1, 0, time, depart > 0, { phase: depart / 4, speed: depart > 0 ? 150 : 0, facing: 'right' });
      return;
    }
    crew.forEach((id, i) => {
      const x = [119, 143, 188, 216][i], y = [99, 104, 103, 98][i];
      actor(id, x, y, false, dark ? 'right' : i > 1 ? 'left' : 'right', dark ? 'shock' : beat.hero === id ? 'talk' : 'calm');
      if (dark && time < 2.4) {
        this.ctx.font = 'bold 12px sans-serif'; this.ctx.fillStyle = '#f5d299'; this.ctx.fillText('!', x - 2, y - 41);
      }
    });
    if (dark) {
      this.ctx.globalAlpha = .2; this.disc(268, 50, 26, '#ffac87'); this.ctx.globalAlpha = 1;
      this.rect(264, 35, 8, 19, '#df9078'); this.rect(257, 41, 22, 6, '#e8b286');
    }
    if (phase === 'portal') {
      this.portal(264, 99, time);
      const entrance = this.reducedMotion ? 1 : Math.min(1, time / 1.2);
      this.ctx.save(); this.ctx.globalAlpha = entrance;
      this.architect(264 - entrance * 23, 101, time); this.ctx.restore();
    }
  }

  private drawBackyard(time: number, dark: boolean) {
    this.rect(0, 0, STAGE_WIDTH, STAGE_HEIGHT, dark ? "#1c2034" : "#425b59");
    this.rect(0, 58, STAGE_WIDTH, 122, dark ? "#2a343b" : "#3c5941");
    for (let y = 66; y < 135; y += 11) for (let x = 6; x < STAGE_WIDTH; x += 15) this.rect(x, y, 3, 1, dark ? "#38414c" : "#55704c");
    this.rect(12, 36, 79, 36, dark ? "#505360" : "#b39873");
    this.rect(8, 30, 87, 9, dark ? "#494450" : "#98775c");
    this.rect(17, 24, 68, 7, dark ? "#55505a" : "#b28d68");
    this.rect(63, 51, 14, 22, "#36474a");
    this.rect(25, 45, 20, 15, dark ? "#987d79" : "#f7d59c");
    this.rect(34, 45, 2, 15, "#746754");
    this.rect(0, 67, STAGE_WIDTH, 5, dark ? "#595663" : "#a39876");
    for (let x = 0; x < STAGE_WIDTH; x += 12) {
      this.rect(x, 57, 8, 22, dark ? "#4a4d59" : "#8f8c6c");
      this.rect(x + 1, 55, 6, 2, dark ? "#67616a" : "#c0af87");
    }
    this.rect(97, 86, 138, 40, dark ? "#45414a" : "#8a765e");
    for (let x = 98; x < 235; x += 14) this.rect(x, 87, 1, 38, dark ? "#353441" : "#675d4e");
    this.rect(107, 79, 91, 7, dark ? "#6a5558" : "#b98a62");
    this.rect(113, 86, 4, 9, "#394040");
    this.rect(188, 86, 4, 9, "#394040");
    for (const x of [120, 148, 179]) {
      this.rect(x, 78, 8, 2, "#e4d3ac");
      this.rect(x + 2, 77, 4, 1, "#b67459");
    }
    this.rect(155, 110, 18, 4, "#202c32");
    this.rect(153, 103, 22, 7, "#464347");
    this.rect(155, 102, 18, 2, "#b78866");
    this.rect(158, 114, 2, 8, "#30383c");
    this.rect(168, 114, 2, 8, "#30383c");
    for (let k = 0; k < 4; k++) this.rect(156 + k * 4, 100 - Math.floor(time * 5 + k) % 4, 2, 2, "#eeb775");
    for (let k = 0; k < 8; k++) {
      const x = 100 + k * 26;
      const y = 31 + Math.round(Math.sin(k * 0.45) * 8);
      this.rect(x - 1, y, 27, 1, "#2c333c");
      this.rect(x, y + 1, 3, 4, dark ? "#ae8a83" : "#f9d598");
    }
    this.tree(9, 110); this.tree(307, 110);
  }

  private architect(x: number, y: number, time: number) {
    this.shadow(x, y, 22);
    this.rect(x - 5, y - 37, 10, 10, "#111724");
    this.rect(x - 7, y - 32, 14, 11, "#101622");
    for (let k = 0; k < 5; k++) this.rect(x - 6 - k * 2, y - 25 + k * 5, 12 + k * 4, 6, "#111724");
    this.rect(x - 3, y - 31, 2, 1, "#b784bc");
    this.rect(x + 2, y - 31, 2, 1, "#b784bc");
    this.rect(x + 7, y - 21, 9, 4, "#111724");
    const eggX = x + 18;
    const eggY = y - 20;
    this.ctx.globalAlpha = 0.2 + Math.sin(time * 6) * 0.1;
    this.disc(eggX, eggY - 1, 13, "#e09bc6");
    this.ctx.globalAlpha = 1;
    this.rect(eggX - 5, eggY - 9, 10, 18, "#9a71a9");
    this.rect(eggX - 7, eggY - 5, 14, 11, "#9a71a9");
    this.rect(eggX - 3, eggY - 11, 6, 2, "#bd8bbb");
    this.rect(eggX - 3, eggY - 7, 3, 5, "#eed2cf");
    this.rect(eggX + 1, eggY + 2, 3, 4, "#cc91b2");
    this.rect(eggX - 2, eggY - 1, 4, 2, Math.sin(time * 6) > 0 ? "#ffe4d7" : "#b888bc");
  }

  private applyRealmPalette() {
    // The realm retains its plum/teal art direction at native resolution.
    // Color compositing avoids a per-frame readback or a coarse render target.
    const c = this.ctx, { width, height } = this.viewport;
    c.save(); c.globalCompositeOperation = 'color'; c.globalAlpha = .2;
    c.fillStyle = '#ae78bb'; c.fillRect(0, 0, width, height);
    c.globalCompositeOperation = 'soft-light'; c.globalAlpha = .22;
    const tint = c.createLinearGradient(0, 0, width, height);
    tint.addColorStop(0, '#87d9cf'); tint.addColorStop(1, '#a84d9d');
    c.fillStyle = tint; c.fillRect(0, 0, width, height); c.restore();
  }

  private rect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  private road(x: number, y: number, w: number, h: number, horizontal: boolean) {
    this.rect(x - 2, y - 2, w + 4, h + 4, "#536054");
    this.rect(x, y, w, h, "#323e3e");
    for (let k = 4; k < (horizontal ? w : h); k += 14) {
      this.rect(horizontal ? x + k : x + w / 2, horizontal ? y + h / 2 : y + k, horizontal ? 6 : 1, horizontal ? 1 : 6, "#968a63");
    }
  }

  private tree(x: number, y: number) {
    this.shadow(x + 2, y, 25);
    drawCanopy(this.ctx, x, y);
  }

  private taxi(x: number, y: number, dx: number, dy: number, time: number, moving: boolean, motion?: ActorMotion) {
    const c = this.ctx;
    this.shadow(x, y, 37);
    c.save(); c.translate(x, y - 8); c.rotate(Math.atan2(dy, dx));
    const headlights = c.createLinearGradient(12, 0, 37, 0);
    headlights.addColorStop(0, '#ffeab93d'); headlights.addColorStop(1, '#ffeab900');
    c.fillStyle = headlights; c.beginPath(); c.moveTo(12, -4); c.lineTo(37, -12); c.lineTo(37, 12); c.lineTo(12, 4); c.fill();
    c.restore();
    c.save(); c.translate(x, y);
    // All headings retain the upright side-on cabin and the wreck's artwork.
    if (dx < 0) c.scale(-1, 1);
    const wheelPhase = this.reducedMotion ? 0 : motion?.phase ?? 0;
    c.translate(0, this.reducedMotion ? 0 : moving ? -Math.abs(Math.sin(wheelPhase * 2)) * .45 : Math.sin(time * 9) * .12);
    drawTaxiBody(c, 'side');
    if (moving) for (const wx of [-10, 10]) { c.strokeStyle = '#91a0a4'; c.lineWidth = .7; c.beginPath(); c.moveTo(wx - Math.cos(wheelPhase) * 2, -2 - Math.sin(wheelPhase) * 2); c.lineTo(wx + Math.cos(wheelPhase) * 2, -2 + Math.sin(wheelPhase) * 2); c.stroke(); }
    if (moving && !this.reducedMotion) for (let k = 0; k < 6; k++) {
      const life = ((time * 3 + k / 6) % 1);
      c.globalAlpha = (1 - life) * .45;
      this.disc(-14 - life * 24, (k % 2 ? 5 : -4) + life * (k % 2 ? 5 : -5), .8 + life * 1.7, '#b2a17c');
    }
    c.globalAlpha = 1;
    c.restore();
  }

  private portal(x: number, y: number, time: number, alpha = 1) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha * .65;
    this.glow(x, y - 15, 33, '#c179e8');
    c.globalAlpha = alpha;
    for (let k = 0; k < 32; k++) {
      const a = k * Math.PI / 16;
      this.rect(x + Math.cos(a) * 16, y - 16 + Math.sin(a) * 22, 3, 3, k % 3 ? "#aa75c9" : "#e4a2da");
    }
    this.rect(x - 11, y - 29, 22, 25, "#302044");
    this.rect(x - 7, y - 33, 14, 33, "#302044");
    const core = c.createRadialGradient(x, y - 15, 2, x, y - 15, 17);
    core.addColorStop(0, '#bf95cf88'); core.addColorStop(1, '#291c4300');
    c.fillStyle = core; c.fillRect(x - 10, y - 30, 20, 28);
    c.strokeStyle = '#e2a5e8'; c.lineWidth = .65; c.globalAlpha = alpha * .65;
    c.beginPath(); c.ellipse(x, y - 16, 14 + Math.sin(time * 3) * .3, 20, 0, -Math.PI * .7 + time * .2, Math.PI * .8 + time * .2); c.stroke();
    c.globalAlpha = alpha;
    for (let k = 0; k < 5; k++) {
      const px = x - 7 + ((k * 5 + Math.floor(time * 8)) % 14);
      const py = y - 28 + ((k * 11 + Math.floor(time * 13)) % 23);
      this.rect(px, py, 2, 3, "#9772b5");
    }
    c.restore();
  }

  private lamp(x: number, y: number, time: number, color = "#f1cf88") {
    const c = this.ctx;
    c.globalAlpha = .35 + Math.sin(time * 3 + x) * .04;
    this.glow(x, y - 9, 22, color);
    c.globalAlpha = 1;
    this.rect(x - 2, y - 15, 4, 14, "#17292d");
    this.rect(x - 4, y - 15, 8, 7, "#6e6653");
    this.rect(x - 2, y - 14, 4, 5, color);
    this.rect(x - 5, y - 17, 10, 2, "#273536");
    this.rect(x - 4, y - 2, 8, 3, "#283936");
  }

  private disc(x: number, y: number, radius: number, color: string) {
    if (radius <= 0) return;
    this.ctx.fillStyle = color; this.ctx.beginPath(); this.ctx.arc(x, y, radius, 0, Math.PI * 2); this.ctx.fill();
  }
  private glow(x: number, y: number, radius: number, color: string) {
    if (radius <= 0) return;
    const c = this.ctx, glow = c.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `${color}b3`); glow.addColorStop(.35, `${color}50`); glow.addColorStop(1, `${color}00`);
    c.fillStyle = glow; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  private shadow(x: number, y: number, width = 14) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.scale(1, .3);
    const shadow = c.createRadialGradient(0, 0, width * .12, 0, 0, width * .65);
    shadow.addColorStop(0, '#0c172568'); shadow.addColorStop(.55, '#0c17253d'); shadow.addColorStop(1, '#0c172500');
    c.fillStyle = shadow; c.fillRect(-width * .7, -width * .7, width * 1.4, width * 1.4); c.restore();
  }

  private prepareSheet(id: BuiltinSpriteId, image: HTMLImageElement) {
    const sheet = SHEETS[id], source = document.createElement('canvas');
    source.width = image.naturalWidth; source.height = image.naturalHeight;
    const sourceContext = source.getContext('2d', { willReadFrequently: true })!;
    sourceContext.drawImage(image, 0, 0);
    // This small asset read happens once on load, never in the frame loop.
    const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;
    const canvas = document.createElement('canvas'), frames = sheet.frames * 2;
    canvas.width = sheet.w * SPRITE_DETAIL * frames; canvas.height = sheet.h * SPRITE_DETAIL;
    const c = canvas.getContext('2d')!;
    const alpha = (px: number, py: number) => px < 0 || px >= source.width || py < 0 || py >= source.height ? 0 : pixels[(py * source.width + px) * 4 + 3];
    for (let frame = 0; frame < frames; frame++) for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) {
      const sx = Math.floor(frame / 2) * sheet.w + x, offset = (y * source.width + sx) * 4;
      const a = pixels[offset + 3]; if (!a) continue;
      const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      const stride = id.startsWith('run_') && frame % 2 && y > sheet.h * .68 ? (x < sheet.w / 2 ? -1 : 1) : 0;
      const breath = !id.startsWith('run_') && y < sheet.h * .65 ? Math.round(Math.sin(frame * Math.PI * 2 / frames)) : 0;
      const dx = (frame * sheet.w + x) * SPRITE_DETAIL + stride + breath, dy = y * SPRITE_DETAIL;
      c.globalAlpha = a / 255; c.fillStyle = `rgb(${r} ${g} ${b})`; c.fillRect(dx, dy, 3, 3);
      const up = y > 0 && alpha(sx, y - 1), left = x > 0 && alpha(sx - 1, y);
      if (!up && !left) c.clearRect(dx, dy, 1, 1);
      if (!alpha(sx, y + 1) && !alpha(sx + 1, y)) c.clearRect(dx + 2, dy + 2, 1, 1);
      if (r + g + b > 150) {
        c.fillStyle = `rgba(255,243,215,${!up ? .24 : .07})`; c.fillRect(dx + 1, dy, 2, 1);
        c.fillStyle = 'rgba(12,23,36,.12)'; c.fillRect(dx + 2, dy + 1, 1, 2);
      }
    }
    this.detailedSheets.set(id, { canvas, frames });
  }

  private avatarStrip(strip: AvatarStrip, x: number, y: number, time: number, flip = false, scale = 1, hit = false, motion?: ActorMotion) {
    const c = this.ctx, phase = !this.reducedMotion && motion && motion.speed > 1 ? motion.phase / (Math.PI * 2) * strip.frames : time * strip.fps;
    const frame = Math.floor(phase) % strip.frames;
    c.save(); c.translate(x, y);
    if (flip) c.scale(-1, 1);
    c.drawImage(strip.canvas, frame * 32, 0, 32, 48, -16 * scale, -48 * scale, 32 * scale, 48 * scale);
    if (hit) {
      c.globalCompositeOperation = 'lighter'; c.globalAlpha *= .8;
      c.drawImage(strip.canvas, frame * 32, 0, 32, 48, -16 * scale, -48 * scale, 32 * scale, 48 * scale);
    }
    c.restore();
  }

  private sprite(id: SpriteId, x: number, y: number, time: number, flip = false, scale = 1, hit = false) {
    const c = this.ctx;
    if (id === 'you') {
      if (this.avatar) this.avatarStrip(this.avatar.body, x, y, time, flip, scale, hit);
      else this.sprite('joe', x, y, time, flip, scale, hit);
      return;
    }
    const sheet = SHEETS[id];
    const detailed = this.detailedSheets.get(id);
    if (!detailed) return;
    const frame = Math.floor(time * (id.startsWith("run_") ? 20 : 12)) % detailed.frames;
    c.save();
    c.translate(x, y);
    if (flip) c.scale(-1, 1);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    const sourceWidth = sheet.w * SPRITE_DETAIL, sourceHeight = sheet.h * SPRITE_DETAIL;
    c.drawImage(detailed.canvas, frame * sourceWidth, 0, sourceWidth, sourceHeight, -sheet.w * scale / 2, -sheet.h * scale, sheet.w * scale, sheet.h * scale);
    if (hit) {
      c.globalCompositeOperation = "lighter";
      c.globalAlpha *= 0.8;
      c.drawImage(detailed.canvas, frame * sourceWidth, 0, sourceWidth, sourceHeight, -sheet.w * scale / 2, -sheet.h * scale, sheet.w * scale, sheet.h * scale);
    }
    c.restore();
  }

  private projectile(shot: Projectile, time: number) {
    const c = this.ctx, color = shot.owner === "enemy" ? "#f18c9d" : ACCENT[shot.hero ?? "joe"];
    const length = Math.hypot(shot.vx, shot.vy) || 1, dx = shot.vx / length, dy = shot.vy / length;
    c.save(); c.globalAlpha = .7;
    this.glow(shot.x, shot.y - 9, shot.radius * 3 + 5, color);
    if (shot.beam) {
      const trail = c.createLinearGradient(shot.x - dx * 36, shot.y - dy * 36 - 9, shot.x, shot.y - 9);
      trail.addColorStop(0, `${color}00`); trail.addColorStop(.6, `${color}a6`); trail.addColorStop(1, '#fff4e2');
      c.strokeStyle = trail; c.lineCap = 'round'; c.lineWidth = shot.radius * 1.6;
      c.beginPath(); c.moveTo(shot.x - dx * 36, shot.y - dy * 36 - 9); c.lineTo(shot.x, shot.y - 9); c.stroke();
      c.globalAlpha = 1;
      this.disc(shot.x, shot.y - 9, shot.radius, color);
      this.disc(shot.x, shot.y - 9, Math.max(2, shot.radius - 2), "#fff8de");
    } else {
      c.globalAlpha = .4; c.strokeStyle = color; c.lineCap = 'round'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(shot.x - dx * 9, shot.y - dy * 9 - 9); c.lineTo(shot.x, shot.y - 9); c.stroke();
      c.globalAlpha = 1;
      this.disc(shot.x, shot.y - 9, shot.radius + Math.sin(time * 30) * 0.4, color);
      this.disc(shot.x, shot.y - 9, 1.15, "#fff8e6");
    }
    c.restore();
  }

  private effect(effect: Effect) {
    const c = this.ctx;
    const color = ACCENT[effect.hero ?? "joe"];
    const life = Math.max(0, effect.ttl / effect.maxT);
    const progress = 1 - life;
    c.save();
    if (effect.kind === "slash") {
      const angle = Math.atan2(effect.dy, effect.dx);
      const radius = effect.size * (0.7 + progress * 0.3);
      c.globalAlpha = Math.min(1, life * 2);
      c.lineCap = 'round'; c.strokeStyle = `${color}55`; c.lineWidth = 7;
      c.beginPath(); c.arc(effect.x, effect.y - 11, radius, angle - 1.1, angle + 1.1); c.stroke();
      c.strokeStyle = color; c.lineWidth = 2.3;
      c.beginPath(); c.arc(effect.x, effect.y - 11, radius, angle - 1.05, angle + 1.05); c.stroke();
      c.strokeStyle = '#fff3d2'; c.lineWidth = 1;
      c.beginPath(); c.arc(effect.x, effect.y - 11, radius + .7, angle - .8, angle + .8); c.stroke();
    } else if (effect.kind === "dash") {
      c.globalAlpha = life * 0.38;
      this.sprite(effect.hero ?? "joe", effect.x, effect.y, 0, effect.dx < 0);
      for (let k = 0; k < 3; k++) this.rect(effect.x - effect.dx * (k * 5 + 5), effect.y - 7 - k * 4, 4, 1, color);
    } else if (effect.kind === "hit") {
      c.globalAlpha = life;
      this.glow(effect.x, effect.y - 9, 11 * life + 2, color);
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        c.lineWidth = .8; c.strokeStyle = k % 2 ? color : '#fff8d4'; c.lineCap = 'round';
        c.beginPath(); c.moveTo(effect.x + Math.cos(a) * progress * 8, effect.y - 9 + Math.sin(a) * progress * 8);
        c.lineTo(effect.x + Math.cos(a) * progress * 15, effect.y - 9 + Math.sin(a) * progress * 15); c.stroke();
      }
    } else if (effect.kind === "level") {
      c.globalAlpha = life * 0.7;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        this.rect(effect.x + Math.cos(a) * progress * 26, effect.y - 12 + Math.sin(a) * progress * 26, 3, 3, "#fbe79d");
      }
    } else if (effect.kind === "beam") {
      c.globalAlpha = life * 0.6;
      this.glow(effect.x, effect.y - 12, 26 * life, color);
      this.disc(effect.x, effect.y - 12, 9 * life, '#fff6dd');
    } else {
      c.globalAlpha = life * 0.3;
      this.glow(effect.x, effect.y - 12, effect.size * 1.35, color);
    }
    c.restore();
  }
}
