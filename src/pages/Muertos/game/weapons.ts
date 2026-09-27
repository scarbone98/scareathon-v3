// The guns. Damage is against zombies with 150 health on round one and
// about 1,000 by round nine. Pack-a-Punch doubles damage, fattens the
// magazine and reserve, and renames the gun.

export type WeaponId = "pistola" | "carabina" | "escopeta" | "metralleta" | "rifle" | "ametralladora" | "rayo";

export type WeaponDef = {
  id: WeaponId;
  name: string;
  papName: string;
  cost: number; // at the wall; 0 if it only comes from the box
  damage: number;
  pellets: number;
  spread: number; // radians, hip fire
  rpm: number;
  auto: boolean;
  mag: number;
  reserve: number;
  reload: number; // seconds
  perShell?: boolean; // shotguns reload a shell at a time
  splash?: number; // metres, the ray gun
  headMult: number;
  range: number;
  kick: number; // view kick per shot, radians
  sound: "pistol" | "rifle" | "shotgun" | "smg" | "lmg" | "ray";
  // The low-poly model's look.
  look: { body: string; wood?: string; long: number };
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistola: {
    id: "pistola", name: "Pistola", papName: "El Cañón", cost: 0,
    damage: 45, pellets: 1, spread: 0.02, rpm: 360, auto: false, mag: 8, reserve: 80, reload: 1.5,
    headMult: 3, range: 60, kick: 0.025, sound: "pistol",
    look: { body: "#3a3d45", long: 0.26 },
  },
  carabina: {
    id: "carabina", name: "Carabina", papName: "La Garita", cost: 600,
    damage: 110, pellets: 1, spread: 0.012, rpm: 420, auto: false, mag: 15, reserve: 120, reload: 1.8,
    headMult: 2.5, range: 80, kick: 0.02, sound: "rifle",
    look: { body: "#2e3036", wood: "#7a4a24", long: 0.62 },
  },
  escopeta: {
    id: "escopeta", name: "Escopeta", papName: "El Trueno", cost: 1000,
    damage: 60, pellets: 8, spread: 0.075, rpm: 80, auto: false, mag: 6, reserve: 48, reload: 0.5, perShell: true,
    headMult: 1.5, range: 22, kick: 0.07, sound: "shotgun",
    look: { body: "#2b2c30", wood: "#8a5a2c", long: 0.68 },
  },
  metralleta: {
    id: "metralleta", name: "Metralleta", papName: "La Parranda", cost: 1200,
    damage: 55, pellets: 1, spread: 0.035, rpm: 620, auto: true, mag: 32, reserve: 192, reload: 2.2,
    headMult: 2.5, range: 45, kick: 0.012, sound: "smg",
    look: { body: "#2a2b2f", long: 0.46 },
  },
  rifle: {
    id: "rifle", name: "Rifle de Asalto", papName: "Coquí Rojo", cost: 1400,
    damage: 95, pellets: 1, spread: 0.025, rpm: 540, auto: true, mag: 30, reserve: 180, reload: 2.4,
    headMult: 2.5, range: 80, kick: 0.016, sound: "rifle",
    look: { body: "#33363c", wood: "#5c3a1e", long: 0.64 },
  },
  ametralladora: {
    id: "ametralladora", name: "Ametralladora", papName: "La Tormenta", cost: 0,
    damage: 130, pellets: 1, spread: 0.045, rpm: 560, auto: true, mag: 100, reserve: 400, reload: 4.2,
    headMult: 2.5, range: 80, kick: 0.014, sound: "lmg",
    look: { body: "#3b3f36", wood: "#4d3a24", long: 0.78 },
  },
  rayo: {
    id: "rayo", name: "Rayo Coquí", papName: "Coquí Mortal", cost: 0,
    damage: 1000, pellets: 1, spread: 0.01, rpm: 190, auto: false, mag: 20, reserve: 160, reload: 2.6, splash: 2.6,
    headMult: 1, range: 70, kick: 0.03, sound: "ray",
    look: { body: "#3fd46a", long: 0.34 },
  },
};

// What the box can hand out, and how often.
export const BOX_POOL: [WeaponId, number][] = [
  ["carabina", 3],
  ["escopeta", 3],
  ["metralleta", 3],
  ["rifle", 3],
  ["ametralladora", 3],
  ["rayo", 1.2],
];

export const PAP_COST = 5000;
export const BOX_COST = 950;
export const KNIFE_DAMAGE = 150;

export type WeaponState = { id: WeaponId; mag: number; reserve: number; pap: boolean };

export const newWeapon = (id: WeaponId, pap = false): WeaponState => {
  const d = WEAPONS[id];
  return { id, pap, mag: pap ? papMag(d) : d.mag, reserve: pap ? papReserve(d) : d.reserve };
};

export const papMag = (d: WeaponDef) => (d.perShell ? d.mag + 2 : Math.round(d.mag * 1.5));
export const papReserve = (d: WeaponDef) => Math.round(d.reserve * 1.5);
export const magOf = (w: WeaponState) => (w.pap ? papMag(WEAPONS[w.id]) : WEAPONS[w.id].mag);
export const reserveOf = (w: WeaponState) => (w.pap ? papReserve(WEAPONS[w.id]) : WEAPONS[w.id].reserve);
export const nameOf = (w: WeaponState) => (w.pap ? WEAPONS[w.id].papName : WEAPONS[w.id].name);
