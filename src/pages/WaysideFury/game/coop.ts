import { prepareArenaPlayer, recordArenaResult } from "../u1/hub/arena";
import { applyCoopReward, rollCoopCandy } from "./coopRewards";
import { GATEKEEPER_ROOM, WATCHER_ROOM } from "./world";
import { fetchWithAuth } from "../../../fetchWithAuth";
import type { AvatarAppearance, HeroAvatar } from "./avatar";
import { activeHero, applyCoopHit, applyCoopDamage, reviveCoopHero, setCoopPlayerCount, syncCoopLevel, exitCoop, enterScene, type GameEvent, type GameState, type Input, type RemoteHero } from "./sim";

export interface CoopPlayer { seat: number; userId: string; name: string; connected: boolean }
export interface CoopRoom { type: "room"; code: string; seat: number; hostSeat: number; token: string; players: CoopPlayer[] }
export interface CoopCallbacks {
  onRoom(room: CoopRoom | null): void;
  onToast(text: string): void;
  onAvatar(seat: number, appearance: AvatarAppearance): void;
  onReward?(state: GameState, reward: CoopReward): void;
}
export interface CoopReward {
  id: string; kind: "kill" | "checkpoint"; enemyKind?: "grunt" | "shooter" | "boss"; xp?: number; candy?: number;
  areas?: string[]; bosses?: string[]; rooms?: string[]; chapter?: number;
  healHp?: number; healKi?: number; power?: number; ward?: number;
}
type WorldState = Pick<GameState, "scene" | "room" | "time" | "palette" | "transitionTarget" | "transitionPalette" | "cutscene" | "sceneTimer" | "enemies" | "projectiles" | "clearedRooms" | "areas" | "bosses" | "chapter" | "rngSeed" | "nextId" | "x" | "y"> & { spawnedExtras?: number; arena?: GameState["arena"] };
interface Sample<T> { at: number; value: T }
const round = (n: number) => Math.round(n * 1000) / 1000;
const worldState = (s: GameState): WorldState => ({ scene: s.scene, room: s.room, time: s.time, palette: s.palette,
  transitionTarget: s.transitionTarget, transitionPalette: s.transitionPalette, cutscene: s.cutscene, sceneTimer: s.sceneTimer,
  // A guest finishing hit arrives after step. Retain its zero-HP entries until
  // the next step awards the clear, including if authority migrates that frame.
  enemies: s.enemies.map(e => ({ ...e, hp: Math.max(0, e.hp) })), projectiles: s.projectiles.filter(p => p.owner === "enemy"), clearedRooms: [...new Set([...s.clearedRooms, ...(s.coop?.worldClearedRooms ?? [])])],
  areas: s.areas, bosses: s.bosses, chapter: s.chapter, rngSeed: s.rngSeed, nextId: s.nextId, x: s.x, y: s.y, spawnedExtras: s.coop?.spawnedExtras ?? 0, ...(s.arena ? { arena: { ...s.arena } } : {}) });

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
  private hits: { seat: number; scene: GameState["scene"]; room: number; hit: Extract<GameEvent, { type: "coop-hit" }> }[] = [];
  private rewards: CoopReward[] = [];
  private rewarded = new Set<string>();
  private rewardSnapshotAt = -1;
  private activeState: GameState | null = null;
  private revived = false;
  private damages: { damage: number; sourceX: number; sourceY: number }[] = [];
  constructor(private cb: CoopCallbacks) {}
  beginRun() { this.clientId = crypto.randomUUID(); this.rewardSnapshotAt = -1; this.hits = []; this.damages = []; this.rewards = []; this.revived = false; this.rewarded.clear(); }
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
      socket.onopen = () => this.send({ type: "auth", ticket });
      socket.onmessage = event => {
        if (this.socket !== socket) return;
        const message = JSON.parse(event.data);
        if (message.type === "ready") { this.send(command); return; }
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
  private receive(message: { type: string; seat: number; userId: string; name: string; hero: RemoteHero; appearance?: AvatarAppearance; state: WorldState; enemyId: number; damage: number; dx: number; dy: number; force: number; attackId: string; reward: CoopReward; targetSeat?: number; scene: GameState["scene"]; room: number; input: Input; sourceX: number; sourceY: number }) {
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
      this.latestWorld = message.state;
      this.worlds.push({ at, value: message.state }); if (this.worlds.length > 12) this.worlds.shift();
    }
    if (message.type === "hit" && this.isHost) this.hits.push({ seat: message.seat, scene: message.scene, room: message.room, hit: { type: "coop-hit", enemyId: message.enemyId, damage: message.damage, dx: message.dx, dy: message.dy, force: message.force, attackId: message.attackId } });
    if (message.type === "reward" && (message.targetSeat === undefined || message.targetSeat === this.room?.seat)) this.rewards.push(message.reward);
    if (message.type === "damage" && message.targetSeat === this.room?.seat) this.damages.push({ damage: message.damage, sourceX: message.sourceX, sourceY: message.sourceY });
    if (message.type === "revive" && message.targetSeat === this.room?.seat) this.revived = true;
  }
  private send(message: object) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  sendReward(reward: CoopReward, targetSeat?: number) { this.send({ type: "reward", reward, targetSeat }); }
  sendRevive(targetSeat: number) { this.send({ type: "revive", targetSeat }); }
  event(s: GameState, event: GameEvent) {
    if (!this.room) return;
    // Websocket ordering caches the post-kill/clear world before distributing
    // rewards. A promoted host therefore cannot resurrect an already-paid kill.
    if (this.isHost && (event.type === "kill" || event.type === "checkpoint" || event.type === "arena-finish") && this.rewardSnapshotAt !== s.time) {
      this.send({ type: "state", state: worldState(s) }); this.rewardSnapshotAt = s.time;
    }
    if (this.isHost && event.type === "kill") {
      const id = `${this.clientId}:kill:${event.enemyId}`;
      for (const player of this.room.players.filter(p => p.connected)) {
        const reward: CoopReward = { id, kind: "kill", xp: s.scene === "arena" ? 0 : event.xp, candy: s.scene === "arena" ? 0 : rollCoopCandy(id, player.userId, event.kind === "boss"), enemyKind: event.kind };
        if (player.seat === this.room.seat) { if (applyCoopReward(s, reward)) s.events.push({ type: "checkpoint", id: `coop-reward-${id}` }); }
        else this.sendReward(reward, player.seat);
      }
    }
    if (this.isHost && event.type === "checkpoint" && !event.id.startsWith("coop-reward-")) {
      const id = `${this.clientId}:checkpoint:${event.id}`;
      const areas = event.id === "home" ? ["wayside"] : event.id === `blast-${WATCHER_ROOM}` ? ["blast"] : event.id === "realm-0" ? ["eightbit-realm"] : [];
      const bosses = event.id === `blast-${WATCHER_ROOM}` ? ["blast-watcher"] : event.id === `blast-${GATEKEEPER_ROOM}` ? ["blast-gatekeeper"] : [];
      const rooms = event.id === "home" ? [] : [event.id];
      for (const player of this.room.players.filter(p => p.connected)) {
        const cache = event.id.startsWith("loot-");
        const candy = cache ? (s.room === 8 ? 18 : 25) + rollCoopCandy(id, player.userId, false) - 3 : 0;
        const reward: CoopReward = { id, kind: "checkpoint", xp: 0, candy, areas, bosses, rooms, chapter: s.chapter,
          ...(cache ? { healHp: 35, healKi: 20, power: s.room === 9 ? 1 : 0 } : {}) };
        if (player.seat === this.room.seat) applyCoopReward(s, reward); else this.sendReward(reward, player.seat);
      }
    }
    if (event.type === "coop-damage") this.send({ ...event, type: "damage", targetSeat: event.seat });
    if (event.type === "coop-revive") this.sendRevive(event.seat);
    if (event.type === "coop-hit") this.send({ ...event, type: "hit", attackId: `${this.clientId}:${event.attackId}`, scene: s.scene, room: s.room });
  }
  update(s: GameState, input: Input, now: number) {
    this.activeState = s;
    const room = this.room;
    if (!room) { exitCoop(s); return; }
    const role = this.isHost ? "host" : "guest";
    if (s.coop?.role === "guest" && role === "host" && this.latestWorld) {
      const w = this.latestWorld;
      if (s.coop) s.coop.worldClearedRooms = [...w.clearedRooms];
      if (s.scene !== w.scene || s.room !== w.room) { if (w.scene === "arena") prepareArenaPlayer(s); enterScene(s, w.scene, w.room); s.x = w.x; s.y = w.y; }
      Object.assign(s, { palette: w.palette, transitionTarget: w.transitionTarget, transitionPalette: w.transitionPalette, cutscene: w.cutscene, sceneTimer: w.sceneTimer });
      s.arena = w.arena ? { ...w.arena } : undefined;
      if (s.arena?.status === "finished" && s.arenaVitals) { this.damages.length = 0; this.revived = false; recordArenaResult(s); s.overlay = "arena"; }
      s.enemies = structuredClone(w.enemies); s.projectiles = structuredClone(w.projectiles);
      s.rngSeed = w.rngSeed; s.nextId = Math.max(s.nextId, w.nextId);
      if (s.coop) s.coop.spawnedExtras = w.spawnedExtras ?? Math.max(0, room.players.filter(p => p.connected).length - 1);
    }
    s.coop ??= { role, seat: room.seat, remoteHeroes: [], appliedHits: [] };
    s.coop.role = role; s.coop.seat = room.seat;
    setCoopPlayerCount(s, room.players.filter(p => p.connected).length);
    s.coop.remoteHeroes = [...this.peers].filter(([seat]) => room.players.some(p => p.seat === seat && p.connected)).flatMap(([, samples]) => {
      const blend = buffered(samples, now); if (!blend) return [];
      const { a, b, alpha } = blend;
      const same = a.scene === b.scene && a.room === b.room;
      return [{ ...b, x: same ? a.x + (b.x - a.x) * alpha : b.x, y: same ? a.y + (b.y - a.y) * alpha : b.y }];
    });
    if (role === "guest") {
      const blend = buffered(this.worlds, now);
      if (blend) {
        const { a, b, alpha } = blend;
        if (s.scene !== b.scene || s.room !== b.room) { if (b.scene === "arena") prepareArenaPlayer(s); if (b.scene === "dead") { s.deaths++; s.events.push({ type: "death" }); } enterScene(s, b.scene, b.room); s.x = b.x + 18; s.y = b.y + 10; }
        Object.assign(s, { palette: b.palette, transitionTarget: b.transitionTarget, transitionPalette: b.transitionPalette, cutscene: b.cutscene, sceneTimer: b.sceneTimer });
        s.enemies = b.enemies.map(e => { const old = a.enemies.find(p => p.id === e.id); return old && a.scene === b.scene && a.room === b.room ? { ...e, x: old.x + (e.x - old.x) * alpha, y: old.y + (e.y - old.y) * alpha } : { ...e }; });
        s.arena = b.arena ? { ...b.arena } : undefined;
        if (s.arena?.status === "finished" && s.arenaVitals && s.arenaRecorded !== s.arena.id) { this.damages.length = 0; this.revived = false; recordArenaResult(s); if (s.scene === "hub") s.overlay = "arena"; }
        // Guests predict their own Ki; host enemy projectiles remain authoritative.
        s.projectiles = [...s.projectiles.filter(p => p.owner === "hero"), ...b.projectiles.map(p => ({ ...p, hits: [...p.hits] }))];
      }
    }
    syncCoopLevel(s);
    for (const damage of this.damages.splice(0)) applyCoopDamage(s, damage.damage, damage.sourceX, damage.sourceY);
    for (const { seat, hit, scene, room: area } of this.hits.splice(0)) if (role === "host" && scene === s.scene && area === s.room) applyCoopHit(s, hit, seat);
    if (this.revived) { reviveCoopHero(s); this.revived = false; }
    for (const reward of this.rewards.splice(0)) if (!this.rewarded.has(reward.id)) { this.rewarded.add(reward.id); if (applyCoopReward(s, reward)) { s.events.push({ type: "checkpoint", id: `coop-reward-${reward.id}` }); this.cb.onReward?.(s, reward); } }
    if (now - this.sentAt < 50) return;
    this.sentAt = now;
    const player = room.players.find(p => p.seat === room.seat)!;
    const hero: RemoteHero = { ...player, hero: { ...activeHero(s) }, x: round(s.x), y: round(s.y), faceX: s.faceX, faceY: s.faceY,
      moving: s.moving, guard: s.guard, attackTimer: s.attackTimer, combo: s.combo, charge: s.charge, dashTimer: s.dashTimer, scene: s.scene, room: s.room, questCosmetic: s.hubCosmetic ?? null, downed: !!s.coop.downed, reviveProgress: s.coop.reviveProgress ?? 0 };
    this.send({ type: "hero", hero, input, ...(!this.appearanceSent && this.appearance ? { appearance: this.appearance } : {}) });
    this.appearanceSent = true;
    if (role === "host") this.send({ type: "state", state: worldState(s) });
  }
  leave() {
    this.closed = true; clearTimeout(this.reconnectTimer); this.send({ type: "leave" }); this.socket?.close(); this.socket = null;
    this.room = null;
    if (this.activeState?.coop) exitCoop(this.activeState);
    this.peers.clear(); this.appearances.clear(); this.worlds = []; this.latestWorld = null; this.hits = []; this.rewards = []; this.damages = []; this.revived = false; this.rewarded.clear(); this.cb.onRoom(null);
  }
}
