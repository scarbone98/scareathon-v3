import { sanitizeDayNightSeconds } from "./u1/world/dayNight";
import { MAX_MILESTONES } from "../../../../server/shared/waysideFury/save.js";
import { sameCampaignMap } from "./campaign.ts";
import { CAMPAIGN_CONTENT_VERSION, COOP_PROTOCOL_VERSION, compatibleMap, legacyMapId } from "../../../../server/shared/waysideFury/campaign.js";
import { applyCoopReward, rollCoopCandy } from "./coopRewards";
import { GATEKEEPER_ROOM, WATCHER_ROOM } from "./world";
import { authoritativePickupTarget } from "./collectibles.ts";
import { ambientTaxi } from "./dressing.ts";
import { fetchWithAuth } from "../../../fetchWithAuth";
import type { AvatarAppearance, HeroAvatar } from "./avatar";
import { activeHero, applyCoopHit, applyCoopDamage, reviveCoopHero, enforceCountyPartyBounds, setCoopPlayerCount, syncCoopLevel, exitCoop, enterScene, encounterLevel, type GameEvent, type GameState, type Input, type RemoteHero } from "./sim";

export interface CoopPlayer { seat: number; userId: string; name: string; connected: boolean }
export interface CoopRoom { type: "room"; code: string; seat: number; hostSeat: number; token: string; protocolVersion?: number; contentVersion?: number; players: CoopPlayer[] }
export interface CoopCallbacks {
  onRoom(room: CoopRoom | null): void;
  onToast(text: string): void;
  onAvatar(seat: number, appearance: AvatarAppearance): void;
  onReward?(state: GameState, reward: CoopReward): void;
}
export interface CoopReward {
  id: string; kind: "kill" | "checkpoint" | "pickup"; xp?: number; xpLevel?: number; candy?: number; pickupId?: string;
  areas?: string[]; bosses?: string[]; rooms?: string[]; chapter?: number;
  campaignMilestones?: string[]; solvedInteractions?: string[]; completedCinematics?: string[];
  healHp?: number; healKi?: number; power?: number; ward?: number;
}
type WorldState = Pick<GameState, "scene" | "room" | "mapId" | "time" | "palette" | "transitionTarget" | "transitionPalette" | "cutscene" | "sceneTimer" | "enemies" | "projectiles" | "clearedRooms" | "areas" | "bosses" | "chapter" | "rngSeed" | "nextId" | "x" | "y" | "ambientTaxiWrecked" | "ambientTaxiGag"> & Partial<Pick<GameState, "campaignMilestones" | "solvedInteractions" | "completedCinematics" | "film" | "spaceOutfit" | "difficulty">> & { worldCycleSeconds?: number; nightEncounterWindow?: string | null; combatLevel?: number; spawnedExtras?: number; protocolVersion?: number };
interface Sample<T> { at: number; value: T }
const round = (n: number) => Math.round(n * 1000) / 1000;
const campaignIds = (...lists: (string[] | undefined)[]) => [...new Set(lists.flatMap(ids => ids ?? []))].slice(0, MAX_MILESTONES);
const worldState = (s: GameState): WorldState => ({ worldCycleSeconds: s.worldCycleSeconds, nightEncounterWindow: s.nightWorld?.window ?? null, difficulty: s.difficulty, combatLevel: encounterLevel(s), protocolVersion: s.coop?.protocolVersion ?? COOP_PROTOCOL_VERSION, scene: s.scene, room: s.room, mapId: s.mapId, time: s.time, palette: s.palette, film: s.film ? {...s.film} : null, spaceOutfit: s.spaceOutfit,
  transitionTarget: s.transitionTarget, transitionPalette: s.transitionPalette, cutscene: s.cutscene, sceneTimer: s.sceneTimer,
  // A guest finishing hit arrives after step. Retain its zero-HP entries until
  // the next step awards the clear, including if authority migrates that frame.
  enemies: s.enemies.map(e => ({ ...e, hp: Math.max(0, e.hp) })), projectiles: s.projectiles.filter(p => p.owner === "enemy"), clearedRooms: [...new Set([...s.clearedRooms, ...(s.coop?.worldClearedRooms ?? [])])],
  campaignMilestones: campaignIds(s.coop?.worldCampaignMilestones, s.campaignMilestones),
  solvedInteractions: campaignIds(s.coop?.worldSolvedInteractions, s.solvedInteractions).filter(id=>id!=="moon-unlimited-air"),
  completedCinematics: campaignIds(s.coop?.worldCompletedCinematics, s.completedCinematics),
  areas: s.areas, bosses: [...new Set([...s.bosses, ...(s.coop?.worldBosses ?? [])])], chapter: Math.max(s.coop?.worldChapter ?? 1,s.chapter), rngSeed: s.rngSeed, nextId: s.nextId, x: s.x, y: s.y,
  ambientTaxiWrecked: s.ambientTaxiWrecked, ambientTaxiGag: s.ambientTaxiGag, spawnedExtras: s.coop?.spawnedExtras ?? 0 });

// Each clock uses receipt time, avoiding assumptions about synchronized devices.
// A 100ms playout buffer brackets both enemies and remote heroes at 20Hz.
export function buffered<T>(samples: Sample<T>[], now: number) {
  const target = now - 100;
  while (samples.length > 2 && samples[1].at <= target) samples.shift();
  const a = samples[0], b = samples[1] ?? a;
  return a ? { a: a.value, b: b.value, alpha: Math.max(0, Math.min(1, (target - a.at) / Math.max(1, b.at - a.at))) } : null;
}
export class FuryCoop {
  room: CoopRoom | null = null;
  private clientId = crypto.randomUUID();
  private socket: WebSocket | null = null;
  private closed = false;
  private reconnectTimer = 0;
  private sentAt = 0;
  private appearance: AvatarAppearance | undefined;
  private appearanceSent = false;
  private appearances = new Map<number, string>();
  private peers = new Map<number, Sample<RemoteHero>[]>();
  private worlds: Sample<WorldState>[] = [];
  private latestWorld: WorldState | null = null;
  private hits: { seat: number; scene: GameState["scene"]; room: number; mapId?: string; hit: Extract<GameEvent, { type: "coop-hit" }> }[] = [];
  private rewards: CoopReward[] = [];
  private pickupRequests: { seat: number; id: string; scene: GameState["scene"]; room: number; mapId?: string }[] = [];
  private rewarded = new Set<string>();
  private rewardSnapshotAt = -1;
  private activeState: GameState | null = null;
  private revived = false;
  private damages: { damage: number; sourceX: number; sourceY: number }[] = [];
  constructor(private cb: CoopCallbacks) {}
  beginRun() { this.clientId = crypto.randomUUID(); this.rewardSnapshotAt = -1; this.hits = []; this.damages = []; this.rewards = []; this.pickupRequests = []; this.revived = false; this.rewarded.clear(); }
  setAvatar(avatar: HeroAvatar) { this.appearance = avatar.appearance; this.appearanceSent = false; }
  get isHost() { return !!this.room && this.room.seat === this.room.hostSeat; }
  async connect(kind: "create" | "join", code?: string) { const previous = this.socket; this.socket = null; previous?.close(); this.closed = false; await this.open({ type: kind, code }); }
  private async open(command: object) {
    const response = await fetchWithAuth("/wayside-fury/coop/ticket", { method: "POST" });
    if (!response.ok) throw new Error(response.status === 401 ? "Sign in to play co-op" : "Could not connect to co-op.");
    const { ticket } = await response.json();
    if (this.closed) return;
    const url = new URL(`${(import.meta.env.VITE_BASE_URL || location.origin).replace(/\/$/, "")}/wayside-fury/coop/ws`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url); this.socket = socket;
      const timeout = window.setTimeout(() => { reject(new Error("Co-op connection timed out.")); socket.close(); }, 10000);
      socket.onopen = () => this.send({ type: "auth", ticket, protocolVersion: COOP_PROTOCOL_VERSION, contentVersion: CAMPAIGN_CONTENT_VERSION });
      socket.onmessage = event => {
        if (this.socket !== socket) return;
        const message = JSON.parse(event.data);
        if (message.type === "ready") {
          if (message.protocolVersion !== undefined && (message.protocolVersion !== COOP_PROTOCOL_VERSION || message.contentVersion !== CAMPAIGN_CONTENT_VERSION)) {
            clearTimeout(timeout); reject(new Error("Update Wayside Fury to join this party.")); socket.close(); return;
          }
          this.send(command); return;
        }
        if (message.type === "error") {
          clearTimeout(timeout); this.cb.onToast(message.message ?? message.error ?? "Co-op connection failed.");
          reject(new Error(message.message ?? "Co-op connection failed.")); if (this.socket === socket) this.socket = null; socket.close(); return;
        }
        if (message.type === "room") { clearTimeout(timeout); this.receiveRoom(message); resolve(); return; }
        this.receive(message);
      };
      socket.onerror = () => { clearTimeout(timeout); reject(new Error("Co-op connection failed.")); };
      socket.onclose = event => {
        clearTimeout(timeout); reject(new Error("Co-op disconnected."));
        if (this.socket !== socket || this.closed || !this.room) return;
        if (event.code === 4000 || event.code === 4008) { this.cb.onToast(event.code === 4000 ? "Your party seat was opened in another tab." : "Co-op disconnected: too many messages."); this.leave(); return; }
        this.cb.onToast("Connection lost. Rejoining your party…");
        this.reconnectTimer = window.setTimeout(() => {
          if (!this.room || this.closed) return;
          void this.open({ type: "rejoin", code: this.room.code, token: this.room.token }).catch(() => {
            if (!this.closed) { this.cb.onToast("Could not rejoin. Return to Co-op to reconnect."); this.leave(); }
          });
        }, 1000);
      };
    });
  }
  private receiveRoom(room: CoopRoom) {
    const previous = this.room;
    for (const player of room.players) if (player.seat !== room.seat && !previous?.players.some(p => p.userId === player.userId)) this.cb.onToast(`${player.name} joined the party.`);
    for (const player of previous?.players ?? []) if (!room.players.some(p => p.userId === player.userId)) { this.peers.delete(player.seat); this.appearances.delete(player.seat); this.cb.onToast(`${player.name} left the party.`); }
    if (previous && previous.hostSeat !== room.hostSeat) this.cb.onToast(`${room.players.find(p => p.seat === room.hostSeat)?.name ?? "A teammate"} is now hosting.`);
    this.room = room; this.appearanceSent = false; this.cb.onRoom(room);
  }
  private receive(message: { type: string; id: string; seat: number; userId: string; name: string; hero: RemoteHero; appearance?: AvatarAppearance; state: WorldState; enemyId: number; damage: number; dx: number; dy: number; force: number; relayX?: number; relayY?: number; relayId?: string; relayKind?: "ki"|"interact"; attackId: string; reward: CoopReward; targetSeat?: number; scene: GameState["scene"]; room: number; mapId?: string; input: Input; sourceX: number; sourceY: number }) {
    const at = performance.now();
    if (message.type === "hero" && message.seat !== this.room?.seat) {
      const player = this.room?.players.find(p => p.seat === message.seat);
      if (!player) return;
      const samples = this.peers.get(message.seat) ?? [];
      samples.push({ at, value: { ...message.hero, seat: player.seat, userId: player.userId, name: player.name, interact: message.input.interact } });
      if (samples.length > 12) samples.shift(); this.peers.set(message.seat, samples);
      if (message.appearance) { const key = JSON.stringify(message.appearance); if (this.appearances.get(message.seat) !== key) { this.appearances.set(message.seat, key); this.cb.onAvatar(message.seat, message.appearance); } }
    }
    if (message.type === "state") {
      if (!compatibleMap(message.state.scene, message.state.room, message.state.mapId, COOP_PROTOCOL_VERSION)) {
        this.cb.onToast("Unknown co-op area. Returned safely to Wayside."); this.leave();
        if (this.activeState) enterScene(this.activeState, "hub"); return;
      }
      message.state.mapId ??= legacyMapId(message.state.scene, message.state.room)!;
      this.latestWorld = message.state;
      this.worlds.push({ at, value: message.state }); if (this.worlds.length > 12) this.worlds.shift();
    }
    if (message.type === "hit" && this.isHost) this.hits.push({ seat: message.seat, scene: message.scene, room: message.room, mapId: message.mapId, hit: { type: "coop-hit", enemyId: message.enemyId, damage: message.damage, dx: message.dx, dy: message.dy, force: message.force, attackId: message.attackId, relayId: message.relayId, relayKind: message.relayKind,relayX:message.relayX,relayY:message.relayY } });
    if (message.type === "reward" && (message.targetSeat === undefined || message.targetSeat === this.room?.seat)) this.rewards.push(message.reward);
    if (message.type === "pickup" && this.isHost) this.pickupRequests.push({ seat: message.seat, id: message.id, scene: message.scene, room: message.room, mapId: message.mapId });
    if (message.type === "damage" && message.targetSeat === this.room?.seat) this.damages.push({ damage: message.damage, sourceX: message.sourceX, sourceY: message.sourceY });
    if (message.type === "revive" && message.targetSeat === this.room?.seat) this.revived = true;
  }
  private send(message: object) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  sendReward(reward: CoopReward, targetSeat?: number) { this.send({ type: "reward", reward, targetSeat }); }
  sendRevive(targetSeat: number) { this.send({ type: "revive", targetSeat }); }
  event(s: GameState, event: GameEvent) {
    if (!this.room) return;
    if (this.isHost && event.type === "checkpoint" && event.id === "realm-0" && s.coop) s.coop.worldChapter = Math.max(2, s.coop.worldChapter ?? s.chapter);
    // Websocket ordering caches the post-kill/clear world before distributing
    // rewards. A promoted host therefore cannot resurrect an already-paid kill.
    if (this.isHost && (event.type === "kill" || event.type === "checkpoint" || event.type === "ambient-taxi-crash") && this.rewardSnapshotAt !== s.time) {
      this.send({ type: "state", state: worldState(s) }); this.rewardSnapshotAt = s.time;
    }
    if (this.isHost && event.type === "kill") {
      const id = `${this.clientId}:kill:${event.enemyId}`;
      for (const player of this.room.players.filter(p => p.connected)) {
        const reward: CoopReward = { id, kind: "kill", xp: event.xp, xpLevel: event.xpLevel, candy: rollCoopCandy(id, player.userId, event.kind === "boss") };
        if (player.seat === this.room.seat) { if (applyCoopReward(s, reward)) s.events.push({ type: "checkpoint", id: `coop-reward-${id}` }); }
        else this.sendReward(reward, player.seat);
      }
    }
    if (this.isHost && event.type === "checkpoint" && !event.id.startsWith("coop-reward-") && !event.id.startsWith("personal-") && !event.id.startsWith("interior-")) {
      const id = `${this.clientId}:checkpoint:${event.id}`;
      const areas = event.id === "home" ? ["wayside"] : event.id === `blast-${WATCHER_ROOM}` ? ["blast"] : event.id === "realm-0" ? ["eightbit-realm"] : [];
      const spaceBosses = event.id === "moon-m06" ? ["moon-cheese-inspector"] : event.id === "moon-m08" || event.id === "moon-m09-rest" ? ["moon-apogee-warden"] : [];
      const woodsBosses = event.id === "woods-heartwood-engine" ? ["woods-foreman"] : event.id === "woods-conveyor-yard" ? ["woods-briar-bailiff"] : [];
      const cityBosses = event.id === "city-switchmaster" ? ["city-switchmaster"] : event.id === "city-hatching" ? ["city-architect"] : [];
      const bosses = cityBosses.length ? cityBosses : woodsBosses.length ? woodsBosses : spaceBosses.length ? spaceBosses : event.id === `blast-${WATCHER_ROOM}` ? ["blast-watcher"] : event.id === `blast-${GATEKEEPER_ROOM}` ? ["blast-gatekeeper"] : [];
      const cityEvent=event.id.startsWith("city-");
      const rooms = event.id === "home" || cityEvent && event.id!==s.mapId ? [] : [event.id];
      const campaignMilestones = event.id.startsWith("woods-") || event.id.startsWith("city-") || event.id.startsWith("moon-") || event.id.startsWith("space-") ? campaignIds(s.coop?.worldCampaignMilestones,s.campaignMilestones).filter(id=>!cityEvent||id.startsWith("city-")||id==="night-anchor") : [];
      const solvedInteractions = campaignMilestones.length ? campaignIds(s.coop?.worldSolvedInteractions,s.solvedInteractions).filter(id=>id!=="moon-unlimited-air"&&(!cityEvent||id.startsWith("city-"))) : [];
      const completedCinematics = campaignMilestones.length ? campaignIds(s.coop?.worldCompletedCinematics,s.completedCinematics).filter(id=>!cityEvent||id.startsWith("city-")) : [];
      for (const player of this.room.players.filter(p => p.connected)) {
        const cache = event.id.startsWith("loot-");
        const candy = cache ? (s.room === 8 ? 18 : 25) + rollCoopCandy(id, player.userId, false) - 2 : 0;
        const reward: CoopReward = { id, kind: "checkpoint", xp: 0, candy, areas, bosses, rooms, campaignMilestones, solvedInteractions, completedCinematics, chapter: s.chapter,
          ...(cache ? { healHp: 35, healKi: 20, power: s.room === 9 ? 1 : 0 } : /^(blast-\d+|realm-\d+)$/.test(event.id) ? { healHp: 12, healKi: 8 } : {}) };
        if (player.seat === this.room.seat) applyCoopReward(s, reward); else this.sendReward(reward, player.seat);
      }
    }
    if (event.type === "coop-damage") this.send({ ...event, type: "damage", targetSeat: event.seat });
    if (event.type === "coop-revive") this.sendRevive(event.seat);
    if (event.type === "coop-hit") this.send({ ...event, type: "hit", attackId: `${this.clientId}:${event.attackId}`, scene: s.scene, room: s.room, mapId: s.mapId });
    if (event.type === "coop-pickup") this.send({ type: "pickup", id: event.id, scene: s.scene, room: s.room, mapId: s.mapId });
  }
  update(s: GameState, input: Input, now: number) {
    this.activeState = s;
    const room = this.room;
    if (!room) { exitCoop(s); return; }
    const role = this.isHost ? "host" : "guest";
    if (s.coop?.role === "guest" && role === "host" && this.latestWorld) {
      const w = this.latestWorld;
      s.worldCycleSeconds = sanitizeDayNightSeconds(w.worldCycleSeconds);
      s.nightWorld = { window: w.nightEncounterWindow ?? null };
      s.personalTaxiWrecked ||= s.ambientTaxiWrecked || w.ambientTaxiWrecked === true;
      if (s.coop) { s.coop.worldClearedRooms = [...w.clearedRooms]; s.coop.worldChapter = w.chapter; s.coop.worldBosses = [...w.bosses];
        s.coop.worldCampaignMilestones = [...(w.campaignMilestones ?? [])];
        s.coop.worldSolvedInteractions = [...(w.solvedInteractions ?? [])];
        s.coop.worldCompletedCinematics = [...(w.completedCinematics ?? [])]; }
      if (s.scene !== w.scene || s.room !== w.room || s.mapId !== w.mapId) { enterScene(s, w.scene, w.room, w.mapId); s.x = w.x; s.y = w.y; }
      Object.assign(s, { palette: w.palette, transitionTarget: w.transitionTarget, transitionPalette: w.transitionPalette, cutscene: w.cutscene, sceneTimer: w.sceneTimer, film: w.film ? {...w.film} : null, spaceOutfit: w.spaceOutfit ?? s.spaceOutfit,
        ambientTaxiWrecked: w.ambientTaxiWrecked ?? false, ambientTaxiGag: w.ambientTaxiGag ?? -1 });
      s.difficulty = w.difficulty ?? "normal"; s.enemies = structuredClone(w.enemies); s.projectiles = structuredClone(w.projectiles);
      s.rngSeed = w.rngSeed; s.nextId = Math.max(s.nextId, w.nextId);
      if (s.coop) s.coop.spawnedExtras = w.spawnedExtras ?? Math.max(0, room.players.filter(p => p.connected).length - 1);
    }
    s.coop ??= { role, seat: room.seat, remoteHeroes: [], appliedHits: [], personalDifficulty: s.difficulty };
    s.coop.role = role; s.coop.seat = room.seat; s.coop.protocolVersion = room.protocolVersion ?? 1;
    setCoopPlayerCount(s, room.players.filter(p => p.connected).length);
    s.coop.remoteHeroes = [...this.peers].filter(([seat]) => room.players.some(p => p.seat === seat && p.connected)).flatMap(([, samples]) => {
      const blend = buffered(samples, now); if (!blend) return [];
      const { a, b, alpha } = blend;
      const same = sameCampaignMap(a, b);
      return [{ ...b, x: same ? a.x + (b.x - a.x) * alpha : b.x, y: same ? a.y + (b.y - a.y) * alpha : b.y }];
    });
    if (role === "guest") {
      const blend = buffered(this.worlds, now);
      if (blend) {
        const { a, b, alpha } = blend;
        s.coop.worldCycleSeconds = sanitizeDayNightSeconds(b.worldCycleSeconds);
        s.nightWorld = { window: b.nightEncounterWindow ?? null };
        s.coop.hostLevel = b.combatLevel; s.difficulty = b.difficulty ?? "normal"; s.coop.worldChapter = b.chapter; s.coop.worldClearedRooms = [...b.clearedRooms]; s.coop.worldBosses = [...b.bosses];
        s.coop.worldCampaignMilestones = [...(b.campaignMilestones ?? [])];
        s.coop.worldSolvedInteractions = [...(b.solvedInteractions ?? [])];
        s.coop.worldCompletedCinematics = [...(b.completedCinematics ?? [])];
        if (s.scene !== b.scene || s.room !== b.room || s.mapId !== b.mapId) { if (b.scene === "dead") { s.deaths++; s.events.push({ type: "death" }); } enterScene(s, b.scene, b.room, b.mapId); s.x = b.x + 18; s.y = b.y + 10; }
        const wrecked = b.ambientTaxiWrecked ?? false;
        s.personalTaxiWrecked ||= s.ambientTaxiWrecked || wrecked;
        if (wrecked && !s.ambientTaxiWrecked) s.events.push({ type: "ambient-taxi-crash", x: ambientTaxi(s).x, y: ambientTaxi(s).y });
        Object.assign(s, { palette: b.palette, transitionTarget: b.transitionTarget, transitionPalette: b.transitionPalette, cutscene: b.cutscene, sceneTimer: b.sceneTimer, film: b.film ? {...b.film} : null, spaceOutfit: b.spaceOutfit ?? s.spaceOutfit,
          ambientTaxiWrecked: wrecked, ambientTaxiGag: a.ambientTaxiGag >= 0 && b.ambientTaxiGag >= 0 ? a.ambientTaxiGag + (b.ambientTaxiGag - a.ambientTaxiGag) * alpha : b.ambientTaxiGag ?? -1 });
        s.enemies = b.enemies.map(e => { const old = a.enemies.find(p => p.id === e.id); return old && sameCampaignMap(a, b) ? { ...e, x: old.x + (e.x - old.x) * alpha, y: old.y + (e.y - old.y) * alpha } : { ...e }; });
        // Guests predict their own Ki; host enemy projectiles remain authoritative.
        s.projectiles = [...s.projectiles.filter(p => p.owner === "hero"), ...b.projectiles.map(p => ({ ...p, hits: [...p.hits] }))];
      }
    }
    syncCoopLevel(s);
    for (const damage of this.damages.splice(0)) applyCoopDamage(s, damage.damage, damage.sourceX, damage.sourceY);
    for (const request of this.hits.splice(0)) if (role === "host" && sameCampaignMap(s, request)) applyCoopHit(s, request.hit, request.seat);
    for (const request of this.pickupRequests.splice(0)) {
      if (role !== "host" || !sameCampaignMap(s, request)) continue;
      const player = room.players.find(p => p.seat === request.seat && p.connected), samples = this.peers.get(request.seat), peer = samples?.[samples.length - 1]?.value;
      if (!player || !peer || !authoritativePickupTarget(s, peer, request.id)) continue;
      this.sendReward({ id: `pickup:${request.id}:${player.userId}`, kind: "pickup", pickupId: request.id, xp: 0, candy: 0 }, player.seat);
    }
    if (this.revived) { reviveCoopHero(s); this.revived = false; }
    for (const reward of this.rewards.splice(0)) if (!this.rewarded.has(reward.id)) { this.rewarded.add(reward.id); if (applyCoopReward(s, reward)) { if (reward.kind !== "pickup") s.events.push({ type: "checkpoint", id: `coop-reward-${reward.id}` }); this.cb.onReward?.(s, reward); } }
    if (now - this.sentAt < 50) return;
    this.sentAt = now;
    const player = room.players.find(p => p.seat === room.seat)!;
    enforceCountyPartyBounds(s);
    const hero: RemoteHero = { ...player, hero: { ...activeHero(s) }, x: round(s.x), y: round(s.y), faceX: s.faceX, faceY: s.faceY,
      filmSkip: s.filmSkipHeld >= 1, filmHold: s.filmHold, spaceOutfit: s.spaceOutfit, boundTimer: s.boundTimer, moving: s.moving, guard: s.guard, guardTimer: s.guardTimer, meleeCharge: s.meleeCharge, attackTimer: s.attackTimer, combo: s.combo, charge: s.charge, dashTimer: s.dashTimer, scene: s.scene, room: s.room, mapId: s.mapId, downed: !!s.coop.downed, reviveProgress: s.coop.reviveProgress ?? 0 };
    this.send({ type: "hero", hero, input, ...(!this.appearanceSent && this.appearance ? { appearance: this.appearance } : {}) });
    this.appearanceSent = true;
    if (role === "host") this.send({ type: "state", state: worldState(s) });
  }
  leave() {
    this.closed = true; clearTimeout(this.reconnectTimer); this.send({ type: "leave" }); this.socket?.close(); this.socket = null;
    this.room = null;
    if (this.activeState?.coop) exitCoop(this.activeState);
    this.peers.clear(); this.appearances.clear(); this.worlds = []; this.latestWorld = null; this.hits = []; this.rewards = []; this.pickupRequests = []; this.damages = []; this.revived = false; this.rewarded.clear(); this.cb.onRoom(null);
  }
}
