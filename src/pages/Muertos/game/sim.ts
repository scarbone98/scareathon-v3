// The game itself, with no drawing or sound: the player, the zombies and
// their rounds, the guns, and everything you can buy. The controller feeds
// it input each frame and turns its events into sound and callouts.
import {
  BOX_SPOT,
  CELL,
  clearLine,
  cellOf,
  collide,
  COLS,
  floorAt,
  doorCenter,
  DOORS,
  flowField,
  makeWalkable,
  PAP_SPOT,
  PERK_SPOTS,
  PERKS,
  PLAYER_START,
  rayWall,
  ROWS,
  SPAWNS,
  WALLBUYS,
  zoneAt,
  type PerkId,
  type SpawnDef,
  type ZoneId,
} from "./map";
import {
  BOX_COST,
  BOX_POOL,
  KNIFE_DAMAGE,
  magOf,
  nameOf,
  newWeapon,
  PAP_COST,
  reserveOf,
  WEAPONS,
  type WeaponId,
  type WeaponState,
} from "./weapons";

export type Input = {
  // Which way to walk, on the ground: x east, z south, each -1..1.
  mx: number;
  mz: number;
  // Which way to aim. Top-down shots fly flat; first person aims up and
  // down too, and can look down the sights.
  yaw: number;
  pitch: number;
  flat: boolean;
  ads: boolean;
  fire: boolean;
  reload: boolean;
  use: boolean;
  knife: boolean;
  swap: boolean;
  sprint: boolean;
};

export const NO_INPUT: Input = { mx: 0, mz: 0, yaw: 0, pitch: 0, flat: false, ads: false, fire: false, reload: false, use: false, knife: false, swap: false, sprint: false };

export type Gait = 0 | 1 | 2; // shamble, jog, sprint
export type ZState = "spawn" | "window" | "climb" | "rise" | "walk" | "dead";

export type Zombie = {
  id: number;
  x: number;
  // Height off the ground (rising from graves, climbing walls), and the
  // ground itself.
  y: number;
  gy: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  hp: number;
  gait: Gait;
  speed: number;
  state: ZState;
  spawn: number; // index into SPAWNS
  t: number;
  attackT: number;
  struck: boolean;
  phase: number;
  headless: boolean;
  deadT: number;
  groanT: number;
  farT: number;
  look: number;
  hitT: number;
};

export type PowerKind = "ammo" | "insta" | "double" | "nuke";
export type Drop = { id: number; kind: PowerKind; x: number; z: number; t: number };

export type Ev =
  | { type: "shot"; weapon: WeaponId; pap: boolean; kick: number }
  | { type: "tracer"; ox: number; oy: number; oz: number; x: number; y: number; z: number; ray: boolean; pap: boolean }
  | { type: "impact"; x: number; y: number; z: number; blood: boolean }
  | { type: "hit"; head: boolean; kill: boolean }
  | { type: "kill"; id: number; head: boolean }
  | { type: "points"; amount: number }
  | { type: "dry" }
  | { type: "reload"; weapon: WeaponId }
  | { type: "shell" }
  | { type: "knife"; hit: boolean }
  | { type: "buy"; what: string }
  | { type: "poor" }
  | { type: "door"; id: string }
  | { type: "board"; win: number; fix: boolean; left: number }
  | { type: "roundStart"; round: number }
  | { type: "roundEnd"; round: number }
  | { type: "hurt" }
  | { type: "down" }
  | { type: "swing"; id: number }
  | { type: "groan"; id: number; x: number; z: number; gait: Gait }
  | { type: "spawn"; id: number; kind: SpawnDef["kind"]; x: number; z: number }
  | { type: "drop"; kind: PowerKind }
  | { type: "power"; kind: PowerKind }
  | { type: "perk"; perk: PerkId }
  | { type: "box"; state: "open" | "offer" | "take" | "close"; weapon?: WeaponId }
  | { type: "pap"; state: "start" | "done" }
  | { type: "switch" }
  | { type: "splash"; x: number; y: number; z: number };

export type Prompt = { text: string; cost?: number; can: boolean };

export type Player = {
  x: number;
  y: number; // the floor underfoot
  z: number;
  yaw: number;
  pitch: number;
  ads: boolean;
  hp: number;
  maxHp: number;
  points: number;
  earned: number;
  kills: number;
  headshots: number;
  weapons: WeaponState[];
  cur: number;
  perks: PerkId[];
  reloadT: number;
  fireCd: number;
  switchT: number;
  knifeT: number;
  knifeHit: boolean;
  busyT: number; // drinking a perk, or the Pack-a-Punch
  busyKind: "" | "perk" | "pap";
  hurtT: number;
  slowT: number;
  moving: number; // 0..1
  sprinting: boolean;
  dead: boolean;
  deadT: number;
  repairT: number;
  repairs: number;
  vx: number;
  vz: number;
};

export type Game = {
  demo: boolean;
  time: number;
  round: number;
  phase: "pre" | "active" | "between" | "over";
  phaseT: number;
  toSpawn: number;
  spawnT: number;
  player: Player;
  zombies: Zombie[];
  boards: number[]; // per spawn; windows only
  doors: Set<string>;
  zones: Set<ZoneId>;
  walk: Uint8Array;
  flow: Float32Array;
  flowCell: number;
  drops: Drop[];
  lastDrop: PowerKind | null;
  dropsThisRound: number;
  insta: number;
  double: number;
  box: { state: "idle" | "rolling" | "offer"; t: number; weapon: WeaponId | null };
  events: Ev[];
  prompt: Prompt | null;
  nextId: number;
  prev: { fire: boolean; use: boolean; knife: boolean; swap: boolean; reload: boolean };
  rnd: () => number;
};

export const MAX_ALIVE = 24;
export const WINDOW_BOARDS = 6;
const PLAYER_R = 0.35;
const ZOMBIE_R = 0.34;
const WALK = 4.4;
const SPRINT = 6.4;
const GAIT_SPEED = [1.25, 2.5, 4.3];
const DROP_LIFE = 26;
const POWER_TIME = 30;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- rounds ----------

export const zombiesInRound = (r: number) => (r <= 4 ? [6, 8, 13, 18][r - 1] : Math.min(140, Math.round(24 + (r - 5) * 5.5)));
export const zombieHealth = (r: number) => (r < 10 ? 150 + 100 * (r - 1) : Math.round(950 * Math.pow(1.1, r - 9)));
const spawnDelay = (r: number) => Math.max(0.4, 2.2 * Math.pow(0.93, r - 1));

function rollGait(g: Game): Gait {
  const r = g.round;
  const u = g.rnd();
  if (r <= 2) return 0;
  if (r === 3) return u < 0.3 ? 1 : 0;
  if (r === 4) return u < 0.6 ? 1 : 0;
  const sprint = Math.min(0.85, (r - 4) * 0.2);
  return u < sprint ? 2 : 1;
}

// ---------- setup ----------

export function newGame(opts: { demo?: boolean; seed?: number } = {}): Game {
  const demo = !!opts.demo;
  const doors = new Set<string>(demo ? DOORS.map((d) => d.id) : []);
  const g: Game = {
    demo,
    time: 0,
    round: 0,
    phase: "pre",
    phaseT: demo ? 0.5 : 2.2,
    toSpawn: 0,
    spawnT: 0,
    player: {
      x: PLAYER_START.x,
      y: floorAt(PLAYER_START.x, PLAYER_START.z),
      z: PLAYER_START.z,
      yaw: PLAYER_START.yaw,
      pitch: 0,
      ads: false,
      hp: 100,
      maxHp: 100,
      points: 500,
      earned: 0,
      kills: 0,
      headshots: 0,
      weapons: [newWeapon("pistola")],
      cur: 0,
      perks: [],
      reloadT: 0,
      fireCd: 0,
      switchT: 0,
      knifeT: 0,
      knifeHit: false,
      busyT: 0,
      busyKind: "",
      hurtT: 9,
      slowT: 0,
      moving: 0,
      sprinting: false,
      dead: false,
      deadT: 0,
      repairT: 0,
      repairs: 0,
      vx: 0,
      vz: 0,
    },
    zombies: [],
    boards: SPAWNS.map((s) => (s.kind === "window" ? WINDOW_BOARDS : 0)),
    doors,
    zones: new Set<ZoneId>(demo ? [1, 2, 3, 4] : [1]),
    walk: makeWalkable(doors),
    flow: new Float32Array(COLS * ROWS),
    flowCell: -1,
    drops: [],
    lastDrop: null,
    dropsThisRound: 0,
    insta: 0,
    double: 0,
    box: { state: "idle", t: 0, weapon: null },
    events: [],
    prompt: null,
    nextId: 1,
    prev: { fire: false, use: false, knife: false, swap: false, reload: false },
    rnd: mulberry32(opts.seed ?? (Math.random() * 1e9) | 0),
  };
  if (demo) g.player.weapons = [newWeapon("rifle", true), newWeapon("rayo")];
  return g;
}

// ---------- helpers ----------

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const curWeapon = (g: Game) => g.player.weapons[g.player.cur];
export const aliveZombies = (g: Game) => g.zombies.filter((z) => z.state !== "dead").length;

function addPoints(g: Game, n: number) {
  const amt = g.double > 0 ? n * 2 : n;
  g.player.points += amt;
  g.player.earned += amt;
  g.events.push({ type: "points", amount: amt });
}

function spend(g: Game, cost: number) {
  if (g.player.points < cost) {
    g.events.push({ type: "poor" });
    return false;
  }
  g.player.points -= cost;
  g.events.push({ type: "points", amount: -cost });
  return true;
}

// The gun's height, for shots fired flat across the ground.
export const GUN_Y = 1.2;
const EYE = 1.6;

// ---------- the step ----------

export function step(g: Game, dt: number, input: Input) {
  g.time += dt;
  const p = g.player;
  if (g.phase === "over") {
    p.deadT += dt;
    stepZombies(g, dt);
    return;
  }
  stepRounds(g, dt);
  stepPlayer(g, dt, input);
  stepZombies(g, dt);
  stepDrops(g, dt);
  stepBox(g, dt);
  g.insta = Math.max(0, g.insta - dt);
  g.double = Math.max(0, g.double - dt);
  g.prev = { fire: input.fire, use: input.use, knife: input.knife, swap: input.swap, reload: input.reload };
}

function stepRounds(g: Game, dt: number) {
  g.phaseT -= dt;
  if (g.phase === "pre" || g.phase === "between") {
    if (g.phaseT <= 0) {
      g.round++;
      g.phase = "active";
      g.toSpawn = g.demo ? 9999 : zombiesInRound(g.round);
      g.spawnT = 1.5;
      g.dropsThisRound = 0;
      g.player.repairs = 0;
      g.events.push({ type: "roundStart", round: g.round });
    }
    return;
  }
  // Active.
  g.spawnT -= dt;
  const alive = aliveZombies(g);
  const cap = g.demo ? 14 : MAX_ALIVE;
  if (g.toSpawn > 0 && alive < cap && g.spawnT <= 0) {
    if (spawnZombie(g)) {
      g.toSpawn--;
      g.spawnT = spawnDelay(g.round) * (0.7 + g.rnd() * 0.6);
    } else g.spawnT = 0.5;
  }
  if (!g.demo && g.toSpawn <= 0 && alive === 0) {
    g.phase = "between";
    g.phaseT = 9;
    g.events.push({ type: "roundEnd", round: g.round });
  }
}

function spawnZombie(g: Game) {
  const p = g.player;
  const here = zoneAt(p.x, p.z) || 1;
  const cands: { i: number; w: number }[] = [];
  SPAWNS.forEach((s, i) => {
    if (!g.zones.has(s.zone)) return;
    const d = Math.hypot(s.to.x - p.x, s.to.z - p.z);
    if (d < 5) return;
    // A window can hold one zombie at a time.
    if (s.kind === "window" && g.zombies.some((z) => z.spawn === i && (z.state === "spawn" || z.state === "window" || z.state === "climb"))) return;
    let w = s.zone === here ? 4 : DOORS.some((dd) => g.doors.has(dd.id) && dd.zones.includes(s.zone) && dd.zones.includes(here as ZoneId)) ? 1.5 : 0.35;
    if (d > 45) w *= 0.3;
    cands.push({ i, w });
  });
  if (!cands.length) return false;
  let u = g.rnd() * cands.reduce((s, c) => s + c.w, 0);
  let pick = cands[0].i;
  for (const c of cands) {
    u -= c.w;
    if (u <= 0) {
      pick = c.i;
      break;
    }
  }
  const s = SPAWNS[pick];
  const gait = rollGait(g);
  const z: Zombie = {
    id: g.nextId++,
    x: s.from.x,
    y: s.kind === "ground" ? -1.9 : s.kind === "climb" ? -2.4 : 0,
    gy: floorAt(s.to.x, s.to.z),
    z: s.from.z,
    yaw: s.face,
    vx: 0,
    vz: 0,
    hp: zombieHealth(g.round),
    gait,
    speed: GAIT_SPEED[gait] * (0.9 + g.rnd() * 0.2),
    state: s.kind === "window" ? "spawn" : s.kind === "climb" ? "climb" : "rise",
    spawn: pick,
    t: 0,
    attackT: 0,
    struck: false,
    phase: g.rnd() * 10,
    headless: false,
    deadT: 0,
    groanT: 1 + g.rnd() * 4,
    farT: 0,
    look: g.rnd(),
    hitT: 0,
  };
  g.zombies.push(z);
  g.events.push({ type: "spawn", id: z.id, kind: s.kind, x: s.to.x, z: s.to.z });
  return true;
}

// ---------- the player ----------

function stepPlayer(g: Game, dt: number, input: Input) {
  const p = g.player;
  p.yaw = input.yaw;
  p.pitch = input.flat ? 0 : input.pitch;
  p.hurtT += dt;
  p.slowT = Math.max(0, p.slowT - dt);
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.switchT = Math.max(0, p.switchT - dt);
  if (p.busyT > 0) {
    p.busyT -= dt;
    if (p.busyT <= 0 && p.busyKind === "pap") {
      const w = curWeapon(g);
      w.pap = true;
      w.mag = magOf(w);
      w.reserve = reserveOf(w);
      g.events.push({ type: "pap", state: "done" });
    }
    if (p.busyT <= 0) p.busyKind = "";
  }
  if (p.hurtT > 2.6 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 140 * dt);

  // Moving.
  const w = curWeapon(g);
  const busy = p.busyT > 0;
  const len = Math.hypot(input.mx, input.mz);
  p.sprinting = input.sprint && len > 0.3 && !input.fire && !input.ads && p.knifeT <= 0;
  p.ads = !input.flat && input.ads && !p.sprinting && !busy && p.switchT <= 0;
  let speed = p.sprinting ? SPRINT : p.ads ? WALK * 0.6 : WALK;
  // Walking backwards from where you aim is slower.
  if (len > 0.01 && !p.sprinting) {
    const back = -(input.mx * Math.sin(p.yaw) - input.mz * Math.cos(p.yaw)) / len;
    if (back > 0.3) speed *= 1 - (back - 0.3) * 0.35;
  }
  if (p.slowT > 0) speed *= 0.6;
  const wx = len > 1 ? input.mx / len : input.mx;
  const wz = len > 1 ? input.mz / len : input.mz;
  const k = 1 - Math.exp(-14 * dt);
  p.vx += (wx * speed - p.vx) * k;
  p.vz += (wz * speed - p.vz) * k;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  collide(g.walk, p, PLAYER_R);
  p.y = floorAt(p.x, p.z);
  p.moving = Math.min(1, Math.hypot(p.vx, p.vz) / WALK);

  if (g.demo) p.hp = p.maxHp;

  // Swapping guns.
  if (input.swap && !g.prev.swap && p.weapons.length > 1 && !busy) {
    p.cur = (p.cur + 1) % p.weapons.length;
    p.switchT = 0.55;
    p.reloadT = 0;
    g.events.push({ type: "switch" });
  }

  // The knife.
  if (p.knifeT > 0) {
    const before = p.knifeT;
    p.knifeT -= dt;
    if (before > 0.38 && p.knifeT <= 0.38) knifeHit(g);
  } else if (input.knife && !g.prev.knife && !busy) {
    p.knifeT = 0.55;
    p.reloadT = 0;
  }

  // Reloading.
  const def = WEAPONS[w.id];
  const reloadTime = (def.reload * (p.perks.includes("piragua") ? 0.5 : 1));
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (def.perShell && input.fire && !g.prev.fire && w.mag > 0) p.reloadT = 0;
    else if (p.reloadT <= 0) {
      if (def.perShell) {
        w.mag++;
        w.reserve--;
        g.events.push({ type: "shell" });
        if (w.mag < magOf(w) && w.reserve > 0) p.reloadT = reloadTime;
        else p.reloadT = 0;
      } else {
        const take = Math.min(magOf(w) - w.mag, w.reserve);
        w.mag += take;
        w.reserve -= take;
      }
    }
  }
  const canAct = !busy && p.knifeT <= 0 && p.switchT <= 0;
  const wantReload = (input.reload && !g.prev.reload) || (w.mag === 0 && w.reserve > 0 && (input.fire || p.fireCd <= 0));
  if (canAct && p.reloadT <= 0 && wantReload && w.mag < magOf(w) && w.reserve > 0) {
    p.reloadT = reloadTime + (def.perShell ? 0.15 : 0);
    g.events.push({ type: "reload", weapon: w.id });
  }

  // Firing.
  const trigger = def.auto ? input.fire : input.fire && !g.prev.fire;
  if (trigger && canAct && p.reloadT <= 0 && p.fireCd <= 0) {
    if (w.mag > 0) fire(g, input.flat);
    else if (!g.prev.fire) g.events.push({ type: "dry" });
  }

  // Using things.
  g.prompt = null;
  if (!g.demo) {
    interact(g, input, busy);
    repairWindows(g, dt, input);
  }
}

function knifeHit(g: Game) {
  const p = g.player;
  let best: Zombie | null = null;
  let bestD = 2.1;
  for (const z of g.zombies) {
    if (z.state === "dead" || z.state === "spawn" || z.y < -0.8 || Math.abs(z.gy - p.y) > 1.5) continue;
    const dx = z.x - p.x;
    const dz = z.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    const ang = Math.abs(wrap(Math.atan2(dx, -dz) - p.yaw));
    if (ang > 0.9) continue;
    best = z;
    bestD = d;
  }
  g.events.push({ type: "knife", hit: !!best });
  if (!best) return;
  damage(g, best, g.insta > 0 ? best.hp : KNIFE_DAMAGE, false, "knife");
}

function fire(g: Game, flat: boolean) {
  const p = g.player;
  const w = curWeapon(g);
  const def = WEAPONS[w.id];
  const cafe = p.perks.includes("cafe");
  w.mag--;
  p.fireCd = 60 / def.rpm / (cafe ? 1.33 : 1);
  const kick = def.kick * (p.ads ? 0.6 : 1);
  g.events.push({ type: "shot", weapon: w.id, pap: w.pap, kick });
  const spread = def.spread * (p.ads ? (def.pellets > 1 ? 0.7 : 0.3) : 1) * (1 + p.moving * (flat ? 0.4 : 0.6));
  const ox = p.x;
  const oy = p.y + (flat ? GUN_Y : EYE);
  const oz = p.z;
  const dmgBase = def.damage * (w.pap ? 2 : 1) * (cafe ? 1.33 : 1);
  // Pellets that strike the same zombie add up, so a shotgun blast is one hit.
  const struck = new Map<Zombie, { dmg: number; head: boolean }>();
  for (let i = 0; i < def.pellets; i++) {
    const a = g.rnd() * Math.PI * 2;
    const r = Math.sqrt(g.rnd()) * spread;
    const yaw = p.yaw + Math.cos(a) * r;
    const pitch = flat ? 0 : p.pitch + Math.sin(a) * r;
    const cp = Math.cos(pitch);
    const d = { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
    const wallT = rayWall(g.walk, ox, oy, oz, d.x, d.y, d.z, 120);
    let hitZ: Zombie | null = null;
    let hitT = wallT;
    let head = false;
    for (const z of g.zombies) {
      const h = flat ? rayZombie(z, ox, oz, d.x, d.z, p.y) : rayZombie3D(z, ox, oy, oz, d.x, d.y, d.z);
      if (h && h.t < hitT) {
        hitT = h.t;
        hitZ = z;
        head = h.head;
      }
    }
    const ix = ox + d.x * hitT;
    const iy = oy + d.y * hitT;
    const iz = oz + d.z * hitT;
    if (i < 3) g.events.push({ type: "tracer", ox, oy, oz, x: ix, y: iy, z: iz, ray: w.id === "rayo", pap: w.pap });
    if (def.splash) {
      splash(g, ix, iy, iz, def.splash * (w.pap ? 1.4 : 1), dmgBase);
      continue;
    }
    g.events.push({ type: "impact", x: ix, y: iy, z: iz, blood: !!hitZ });
    if (hitZ) {
      const s = struck.get(hitZ) ?? { dmg: 0, head: false };
      s.dmg += dmgBase * (head ? def.headMult : 1);
      s.head ||= head;
      struck.set(hitZ, s);
    }
  }
  for (const [z, s] of struck) damage(g, z, g.insta > 0 ? z.hp : s.dmg, s.head, "gun");
}

function splash(g: Game, x: number, y: number, z: number, radius: number, dmg: number) {
  g.events.push({ type: "splash", x, y, z });
  for (const zb of g.zombies) {
    if (zb.state === "dead" || zb.state === "spawn") continue;
    const d = Math.hypot(zb.x - x, zb.gy + zb.y + 1 - y, zb.z - z);
    if (d > radius) continue;
    const f = 1 - (d / radius) * 0.6;
    damage(g, zb, g.insta > 0 ? zb.hp : dmg * f, false, "gun");
  }
}

// First person: a zombie is a head on a body, a sphere on a standing cylinder.
export function rayZombie3D(z: Zombie, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): { t: number; head: boolean } | null {
  if (z.state === "dead" || z.state === "spawn") return null;
  let best: { t: number; head: boolean } | null = null;
  if (!z.headless) {
    const lean = z.state === "walk" ? 0.12 : 0;
    const hx = z.x + Math.sin(z.yaw) * lean - ox;
    const hy = z.gy + z.y + 1.62 - oy;
    const hz = z.z - Math.cos(z.yaw) * lean - oz;
    const b = hx * dx + hy * dy + hz * dz;
    const c = hx * hx + hy * hy + hz * hz - 0.24 * 0.24;
    const disc = b * b - c;
    if (disc >= 0) {
      const t = b - Math.sqrt(disc);
      if (t > 0) best = { t, head: true };
    }
  }
  const px = ox - z.x;
  const pz = oz - z.z;
  const a = dx * dx + dz * dz;
  if (a > 1e-9) {
    const b = px * dx + pz * dz;
    const c = px * px + pz * pz - 0.34 * 0.34;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      for (const t of [(-b - s) / a, (-b + s) / a]) {
        if (t <= 0) continue;
        const y = oy + dy * t;
        const base = z.gy + z.y;
        if (y >= Math.max(z.gy, base) && y <= base + 1.45) {
          if (!best || t < best.t) best = { t, head: false };
          break;
        }
      }
    }
  }
  return best;
}

// Top-down, shots fly flat, so a zombie is a standing circle. One that passes
// close by the middle counts as a headshot.
export function rayZombie(z: Zombie, ox: number, oz: number, dx: number, dz: number, floor: number): { t: number; head: boolean } | null {
  if (z.state === "dead" || z.state === "spawn") return null;
  // Still mostly underground, or on another level of the fort.
  if (z.y < -1.1 || Math.abs(z.gy + Math.max(0, z.y) - floor) > 2.5) return null;
  const px = z.x - ox;
  const pz = z.z - oz;
  const along = px * dx + pz * dz;
  if (along <= 0) return null;
  const off = Math.abs(px * dz - pz * dx);
  const R = 0.38;
  if (off > R) return null;
  return { t: along - Math.sqrt(R * R - off * off), head: !z.headless && off < 0.08 };
}

function damage(g: Game, z: Zombie, amount: number, head: boolean, how: "gun" | "knife" | "nuke") {
  if (z.state === "dead") return;
  z.hp -= amount;
  z.hitT = 0.15;
  if (z.hp > 0) {
    if (how !== "nuke") {
      addPoints(g, 10);
      g.events.push({ type: "hit", head, kill: false });
    }
    return;
  }
  z.state = "dead";
  z.deadT = 0;
  z.headless = head && how === "gun";
  z.attackT = 0;
  const p = g.player;
  p.kills++;
  if (head) p.headshots++;
  if (how !== "nuke") {
    addPoints(g, how === "knife" ? 130 : head ? 100 : 60);
    g.events.push({ type: "hit", head, kill: true });
  }
  g.events.push({ type: "kill", id: z.id, head });
  // Power-ups.
  if (!g.demo && how !== "nuke" && g.dropsThisRound < 4 && z.y > -0.5 && g.rnd() < 0.035) {
    const kinds: PowerKind[] = ["ammo", "insta", "double", "nuke"].filter((k) => k !== g.lastDrop) as PowerKind[];
    const kind = kinds[Math.floor(g.rnd() * kinds.length)];
    g.lastDrop = kind;
    g.dropsThisRound++;
    g.drops.push({ id: g.nextId++, kind, x: z.x, z: z.z, t: DROP_LIFE });
    g.events.push({ type: "drop", kind });
  }
}

// ---------- buying and fixing ----------

function interact(g: Game, input: Input, busy: boolean) {
  const p = g.player;
  const press = input.use && !g.prev.use;
  const near = (x: number, z: number, r: number) => Math.hypot(x - p.x, z - p.z) < r;
  const offer = (text: string, cost: number | undefined, act: () => void) => {
    g.prompt = { text, cost, can: cost === undefined || p.points >= cost };
    if (press && !busy) act();
  };

  // Windows first: repairing is hold-to-use.
  for (let i = 0; i < SPAWNS.length; i++) {
    const s = SPAWNS[i];
    if (s.kind !== "window" || g.boards[i] >= WINDOW_BOARDS || !g.zones.has(s.zone)) continue;
    if (!near(s.to.x, s.to.z, 2.0)) continue;
    g.prompt = { text: "Hold to rebuild the barrier", can: true };
    return;
  }

  for (const d of DOORS) {
    if (g.doors.has(d.id)) continue;
    const c = doorCenter(d);
    const r = d.cells.length > 2 ? 3.6 : 2.8;
    if (!near(c.x, c.z, r)) continue;
    // Only from a side that's open.
    if (!g.zones.has(zoneAt(p.x, p.z) as ZoneId)) continue;
    return offer(d.label, d.cost, () => {
      if (!spend(g, d.cost)) return;
      openDoor(g, d.id);
    });
  }

  for (const wb of WALLBUYS) {
    if (!near(wb.x, wb.z, 1.9)) continue;
    const def = WEAPONS[wb.weapon as WeaponId];
    const have = p.weapons.find((w) => w.id === def.id);
    if (have) {
      const cost = have.pap ? 4500 : Math.round(def.cost / 2);
      return offer(`Buy ammo for ${nameOf(have)}`, cost, () => {
        if (have.reserve >= reserveOf(have) && have.mag >= magOf(have)) return;
        if (!spend(g, cost)) return;
        have.reserve = reserveOf(have);
        g.events.push({ type: "buy", what: "ammo" });
      });
    }
    return offer(`Buy ${def.name}`, def.cost, () => {
      if (!spend(g, def.cost)) return;
      give(g, def.id);
      g.events.push({ type: "buy", what: def.id });
    });
  }

  for (const ps of PERK_SPOTS) {
    if (!near(ps.x, ps.z, 2.1)) continue;
    const perk = PERKS[ps.perk];
    if (p.perks.includes(perk.id)) {
      g.prompt = { text: `${perk.name}: ${perk.blurb.toLowerCase()}`, can: false };
      return;
    }
    return offer(`Drink ${perk.name} (${perk.blurb.toLowerCase()})`, perk.cost, () => {
      if (!spend(g, perk.cost)) return;
      p.perks.push(perk.id);
      if (perk.id === "coqui") {
        p.maxHp = 250;
        p.hp = 250;
      }
      p.busyT = 1.6;
      p.busyKind = "perk";
      p.reloadT = 0;
      g.events.push({ type: "perk", perk: perk.id });
    });
  }

  if (near(BOX_SPOT.x, BOX_SPOT.z, 2.2)) {
    const b = g.box;
    if (b.state === "idle") {
      return offer("Open the mystery box", BOX_COST, () => {
        if (!spend(g, BOX_COST)) return;
        b.state = "rolling";
        b.t = 3.4;
        b.weapon = rollBox(g);
        g.events.push({ type: "box", state: "open" });
      });
    }
    if (b.state === "offer" && b.weapon) {
      const wid = b.weapon;
      return offer(`Take ${WEAPONS[wid].name}`, undefined, () => {
        give(g, wid);
        b.state = "idle";
        b.weapon = null;
        g.events.push({ type: "box", state: "take", weapon: wid });
      });
    }
  }

  if (near(PAP_SPOT.x, PAP_SPOT.z, 2.6)) {
    const w = curWeapon(g);
    if (w.pap) {
      g.prompt = { text: `${nameOf(w)} is already upgraded`, can: false };
      return;
    }
    return offer(`Pack-a-Punch your ${WEAPONS[w.id].name}`, PAP_COST, () => {
      if (!spend(g, PAP_COST)) return;
      p.busyT = 3.2;
      p.busyKind = "pap";
      p.reloadT = 0;
      g.events.push({ type: "pap", state: "start" });
    });
  }
}

// Repairs run on the hold, at a steady clip.
function repairWindows(g: Game, dt: number, input: Input) {
  const p = g.player;
  if (!input.use || p.busyT > 0) {
    p.repairT = 0;
    return;
  }
  for (let i = 0; i < SPAWNS.length; i++) {
    const s = SPAWNS[i];
    if (s.kind !== "window" || g.boards[i] >= WINDOW_BOARDS || !g.zones.has(s.zone)) continue;
    if (Math.hypot(s.to.x - p.x, s.to.z - p.z) >= 2.0) continue;
    // Not while a zombie is climbing through.
    if (g.zombies.some((z) => z.spawn === i && z.state === "climb")) return;
    p.repairT += dt;
    if (p.repairT >= 0.6) {
      p.repairT = 0;
      g.boards[i]++;
      if (p.repairs < 50) {
        p.repairs++;
        addPoints(g, 10);
      }
      g.events.push({ type: "board", win: i, fix: true, left: g.boards[i] });
    }
    return;
  }
  p.repairT = 0;
}

function rollBox(g: Game): WeaponId {
  const held = new Set(g.player.weapons.map((w) => w.id));
  const pool = BOX_POOL.filter(([id]) => !held.has(id));
  let u = g.rnd() * pool.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of pool) {
    u -= w;
    if (u <= 0) return id;
  }
  return pool[0][0];
}

function stepBox(g: Game, dt: number) {
  const b = g.box;
  if (b.state === "idle") return;
  b.t -= dt;
  if (b.t > 0) return;
  if (b.state === "rolling") {
    b.state = "offer";
    b.t = 9;
    g.events.push({ type: "box", state: "offer", weapon: b.weapon ?? undefined });
  } else {
    b.state = "idle";
    b.weapon = null;
    g.events.push({ type: "box", state: "close" });
  }
}

function give(g: Game, id: WeaponId) {
  const p = g.player;
  const have = p.weapons.findIndex((w) => w.id === id);
  if (have >= 0) {
    p.cur = have;
  } else if (p.weapons.length < (p.perks.includes("mule") ? 3 : 2)) {
    p.weapons.push(newWeapon(id));
    p.cur = p.weapons.length - 1;
  } else {
    p.weapons[p.cur] = newWeapon(id);
  }
  p.reloadT = 0;
  p.switchT = 0.55;
  g.events.push({ type: "switch" });
}

export function openDoor(g: Game, id: string) {
  const d = DOORS.find((x) => x.id === id);
  if (!d || g.doors.has(id)) return;
  g.doors.add(id);
  for (const z of d.zones) g.zones.add(z);
  g.walk = makeWalkable(g.doors);
  g.flowCell = -1;
  g.events.push({ type: "door", id });
}

// ---------- zombies ----------

function stepZombies(g: Game, dt: number) {
  const p = g.player;
  const pc = cellOf(p.x, p.z);
  const pci = pc.r * COLS + pc.c;
  if (pci !== g.flowCell) {
    g.flowCell = pci;
    flowField(g.walk, pc.c, pc.r, g.flow);
  }
  const over = g.phase === "over";
  for (const z of g.zombies) {
    z.hitT = Math.max(0, z.hitT - dt);
    if (z.state === "dead") {
      z.deadT += dt;
      continue;
    }
    const s = SPAWNS[z.spawn];
    z.t += dt;
    z.groanT -= dt;
    if (z.groanT <= 0) {
      z.groanT = 2.5 + g.rnd() * 5;
      g.events.push({ type: "groan", id: z.id, x: z.x, z: z.z, gait: z.gait });
    }
    switch (z.state) {
      case "spawn": {
        // Walking up to the window from inside the house.
        const dx = s.at.x - z.x;
        const dz = s.at.z - z.z;
        const d = Math.hypot(dx, dz);
        z.yaw = s.face;
        if (d < 0.05) {
          z.state = "window";
          z.t = 0;
        } else {
          const m = Math.min(d, 1.4 * dt);
          z.x += (dx / d) * m;
          z.z += (dz / d) * m;
          z.phase += dt * 5;
        }
        break;
      }
      case "window": {
        z.yaw = s.face;
        if (g.boards[z.spawn] <= 0) {
          z.state = "climb";
          z.t = 0;
        } else if (z.t > 1.15) {
          z.t = 0;
          g.boards[z.spawn]--;
          g.events.push({ type: "board", win: z.spawn, fix: false, left: g.boards[z.spawn] });
        }
        break;
      }
      case "climb": {
        z.yaw = s.face;
        if (s.kind === "climb") {
          // Up the rocks below the sea wall, then over it.
          const up = 1.3;
          const over = 0.7;
          if (z.t < up) {
            const k = z.t / up;
            z.x = s.from.x;
            z.z = s.from.z;
            z.y = -2.4 + k * 3.6;
          } else {
            const k = Math.min(1, (z.t - up) / over);
            z.x = s.from.x + (s.to.x - s.from.x) * k;
            z.z = s.from.z + (s.to.z - s.from.z) * k;
            z.y = 1.2 * (1 - k) + Math.sin(k * Math.PI) * 0.3;
          }
          if (z.t >= up + over) toWalk(z);
        } else {
          const dur = 1.1;
          const k = Math.min(1, z.t / dur);
          z.x = s.at.x + (s.to.x - s.at.x) * k;
          z.z = s.at.z + (s.to.z - s.at.z) * k;
          z.y = Math.sin(k * Math.PI) * 0.7;
          if (k >= 1) toWalk(z);
        }
        break;
      }
      case "rise": {
        const dur = 1.7;
        z.y = -1.9 + Math.min(1, z.t / dur) * 1.9;
        z.yaw = wrap(Math.atan2(p.x - z.x, -(p.z - z.z)));
        if (z.t >= dur) toWalk(z);
        break;
      }
      case "walk":
        walkZombie(g, z, dt, over);
        break;
    }
  }
  // Separation between walkers.
  const walkers = g.zombies.filter((z) => z.state === "walk");
  for (let i = 0; i < walkers.length; i++) {
    for (let j = i + 1; j < walkers.length; j++) {
      const a = walkers[i];
      const b = walkers[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      const min = ZOMBIE_R * 2;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      a.x -= (dx / d) * push;
      a.z -= (dz / d) * push;
      b.x += (dx / d) * push;
      b.z += (dz / d) * push;
    }
  }
  for (const z of walkers) {
    collide(g.walk, z, ZOMBIE_R);
    z.gy = floorAt(z.x, z.z);
  }

  // Dead bodies sink away.
  g.zombies = g.zombies.filter((z) => z.state !== "dead" || z.deadT < 4);
}

function toWalk(z: Zombie) {
  z.state = "walk";
  z.t = 0;
  z.y = 0;
}

function walkZombie(g: Game, z: Zombie, dt: number, over: boolean) {
  const p = g.player;
  const dx = p.x - z.x;
  const dz = p.z - z.z;
  const level = Math.abs(p.y - z.gy) < 1.2;
  const dist = level ? Math.hypot(dx, dz) : Math.hypot(dx, dz) + 3;

  // Attacking.
  if (z.attackT > 0) {
    z.attackT -= dt;
    if (!z.struck && z.attackT < 0.55) {
      z.struck = true;
      if (!over && !g.demo && dist < 1.55) hurtPlayer(g);
    }
  } else if (!over && dist < 1.15) {
    z.attackT = 1.0;
    z.struck = false;
    g.events.push({ type: "swing", id: z.id });
  }

  // Where to head: straight at the player when there's a clear line,
  // otherwise downhill on the flow field.
  let tx = p.x;
  let tz = p.z;
  const zc = cellOf(z.x, z.z);
  const here = g.flow[zc.r * COLS + zc.c];
  if (!(dist < 10 && clearLine(g.walk, z.x, z.z, p.x, p.z))) {
    let best = here;
    let bc = -1;
    let br = -1;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = zc.c + dc;
        const nr = zc.r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        if (!g.walk[nr * COLS + nc]) continue;
        if (dc && dr && (!g.walk[zc.r * COLS + nc] || !g.walk[nr * COLS + zc.c])) continue;
        const v = g.flow[nr * COLS + nc];
        if (v < best) {
          best = v;
          bc = nc;
          br = nr;
        }
      }
    }
    if (bc >= 0) {
      tx = (bc + 0.5) * CELL;
      tz = (br + 0.5) * CELL;
    }
  }

  // Zombies left far behind shuffle off and come back in somewhere closer.
  if (!g.demo && (here > 26 || !isFinite(here) || here >= 1e8)) {
    z.farT += dt;
    if (z.farT > 7 && g.phase === "active") {
      z.state = "dead";
      z.deadT = 99;
      g.toSpawn++;
      return;
    }
  } else z.farT = 0;

  const mx = tx - z.x;
  const mz = tz - z.z;
  const ml = Math.hypot(mx, mz);
  let speed = z.speed * (z.attackT > 0 ? 0.35 : 1) * (z.hitT > 0 ? 0.55 : 1);
  if (over || dist < 0.8) speed = over ? 0.3 : 0;
  const k = 1 - Math.exp(-8 * dt);
  const wx = ml > 0.01 ? (mx / ml) * speed : 0;
  const wz = ml > 0.01 ? (mz / ml) * speed : 0;
  z.vx += (wx - z.vx) * k;
  z.vz += (wz - z.vz) * k;
  z.x += z.vx * dt;
  z.z += z.vz * dt;
  z.gy = floorAt(z.x, z.z);
  const face = dist < 3 ? Math.atan2(dx, -dz) : Math.atan2(z.vx, -z.vz);
  z.yaw += wrap(face - z.yaw) * (1 - Math.exp(-7 * dt));
  z.phase += dt * Math.hypot(z.vx, z.vz) * (z.gait === 0 ? 2.6 : 2.2);

  // Keep off the player.
  if (level && dist < PLAYER_R + ZOMBIE_R && dist > 1e-4) {
    const push = PLAYER_R + ZOMBIE_R - dist;
    z.x -= (dx / dist) * push * 0.7;
    z.z -= (dz / dist) * push * 0.7;
    p.x += (dx / dist) * push * 0.3;
    p.z += (dz / dist) * push * 0.3;
  }
}

function hurtPlayer(g: Game) {
  const p = g.player;
  if (p.dead) return;
  p.hp -= 50;
  p.hurtT = 0;
  p.slowT = 0.5;
  g.events.push({ type: "hurt" });
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    g.phase = "over";
    g.events.push({ type: "down" });
  }
}

// ---------- power-ups ----------

function stepDrops(g: Game, dt: number) {
  const p = g.player;
  for (const d of g.drops) {
    d.t -= dt;
    if (Math.hypot(d.x - p.x, d.z - p.z) < 1.4) {
      d.t = -1;
      g.events.push({ type: "power", kind: d.kind });
      switch (d.kind) {
        case "ammo":
          for (const w of p.weapons) w.reserve = reserveOf(w);
          break;
        case "insta":
          g.insta = POWER_TIME;
          break;
        case "double":
          g.double = POWER_TIME;
          break;
        case "nuke":
          for (const z of g.zombies) if (z.state !== "dead" && z.state !== "spawn") damage(g, z, z.hp + 1, false, "nuke");
          addPoints(g, 400);
          break;
      }
    }
  }
  g.drops = g.drops.filter((d) => d.t > 0);
}
