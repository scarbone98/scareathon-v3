// Wardrobe pixels are composed at load time. Runtime poses only draw cached strips.
import { bodyOf, composeLook, composePortrait, rigOf } from '../../../components/avatar/compose';
import { lookFromAvatar, randomLook } from '../../../components/avatar/look';
import { loadAvatarManifest } from '../../../components/avatar/manifest';
import type { AvatarAnchor, AvatarItem, AvatarLook, AvatarManifest, AvatarResponse, AvatarRig, InventoryEntry } from '../../../components/avatar/types';
import { fetchWithAuth } from '../../../fetchWithAuth';

export interface AvatarStrip { canvas: HTMLCanvasElement; frames: number; fps: number }
export interface AvatarAppearance { profile: AvatarLook["profile"]; outfit: { key: string; dyes: AvatarLook["outfit"][number]["dyes"] }[] }
export interface HeroAvatar {
  appearance?: AvatarAppearance;
  body: AvatarStrip;
  back: AvatarStrip[];
  front: AvatarStrip[];
  companions: AvatarStrip[];
  bodyKey: string;
  rig: AvatarRig;
  portraitUrl: string;
  fallback: boolean;
}
type CatalogItem = Omit<AvatarItem, 'id' | 'itemKey' | 'basePrice' | 'releaseStatus'> & {
  key: string; price?: number | null; release?: string;
};
type CatalogManifest = AvatarManifest & { items?: CatalogItem[] };
const EXTRA_CATEGORIES = new Set(['wings', 'companion', 'aura']);
const EXTRA_BACK = new Set(['back_fx', 'wings']);
const EXTRA_FRONT = new Set(['front_fx']);
const ANCHORS: AvatarAnchor[] = ['head', 'body', 'ground', 'free'];

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Avatar loading cancelled', 'AbortError');
}
function catalogInventory(manifest: CatalogManifest): InventoryEntry[] {
  return (manifest.items ?? []).filter(item => item.release !== 'unreleased').map((item, index) => ({
    itemInstanceId: index + 1,
    item: { ...item, id: index + 1, itemKey: item.key, basePrice: item.price ?? null, releaseStatus: item.release },
  }));
}
function guestLook(manifest: AvatarManifest): AvatarLook {
  const look = randomLook(catalogInventory(manifest as CatalogManifest), manifest);
  if (!look) throw new Error('No starter avatar in the manifest');
  return { profile: look.profile, outfit: look.outfit.map(({ item, dyes }) => ({ item, dyes })) };
}
const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
const lcm = (a: number, b: number) => a / gcd(a, b) * b;

// composeLook uses a body's frame count for the complete strip. Extending that
// rig to a full common cycle avoids truncating a five-frame wing/pet at frame six.
function loopManifest(manifest: AvatarManifest, bodyKey: string, rig: AvatarRig, partFrames: number[], slots: string[]): AvatarManifest {
  const frames = partFrames.reduce((count, frameCount) => lcm(count, frameCount), rig.frames);
  if (frames > 120) throw new Error('Avatar accessory loop is too large');
  const anchors: AvatarRig['anchors'] = {};
  for (const anchor of ANCHORS) {
    const offsets = rig.anchors[anchor];
    if (offsets) anchors[anchor] = Array.from({ length: frames }, (_, frame) => offsets[frame % rig.frames]);
  }
  return { ...manifest, slots, bases: { ...manifest.bases, [bodyKey]: { ...rig, frames, anchors } } };
}
function withoutShadow(look: AvatarLook): AvatarLook {
  return { ...look, outfit: look.outfit.map(entry => ({ ...entry, item: { ...entry.item, parts: entry.item.parts.filter(part => part.slot !== 'shadow') } })) };
}

export async function composeHeroAvatar(look: AvatarLook, manifest: AvatarManifest): Promise<HeroAvatar> {
  if (manifest.width !== 32 || manifest.height !== 48) throw new Error('Unsupported avatar cell size');
  const bodyItem = bodyOf(look);
  if (!bodyItem || !manifest.bases[bodyItem.itemKey]) throw new Error('Avatar body has no rig');
  const bodyKey = bodyItem.itemKey, rig = rigOf(look, manifest);
  const hidden = new Set(look.outfit.flatMap(({ item }) => item.hides));
  const bodyLook = withoutShadow({ ...look, outfit: look.outfit.filter(({ item }) => !EXTRA_CATEGORIES.has(item.category)) });
  const back: AvatarStrip[] = [], front: AvatarStrip[] = [], companions: AvatarStrip[] = [];
  // Keep the real body key and rig but draw only the selected accessory's pixels.
  const rigEntry = { item: { ...bodyItem, parts: [] }, dyes: {} };
  const extraEntries = look.outfit.filter(({ item }) => EXTRA_CATEGORIES.has(item.category) && item.itemKey !== 'mini_me');
  const groups: { target: AvatarStrip[]; slots: string[] }[] = [
    { target: back, slots: manifest.slots.filter(slot => EXTRA_BACK.has(slot)) },
    { target: front, slots: manifest.slots.filter(slot => EXTRA_FRONT.has(slot)) },
    { target: companions, slots: ['companion'] },
  ];
  for (const entry of extraEntries) {
    for (const { target, slots } of groups) {
      const visible = entry.item.parts.filter(part => slots.includes(part.slot) && !hidden.has(part.slot) && (!part.fits || part.fits.includes(bodyKey)) && rig.anchors[part.anchor]);
      if (!visible.length) continue;
      const accessoryLook = { ...look, outfit: [rigEntry, { ...entry, item: { ...entry.item, parts: visible } }] };
      target.push(await composeLook(accessoryLook, loopManifest(manifest, bodyKey, rig, visible.map(part => part.frames), [...slots])));
    }
  }
  const body = await composeLook(bodyLook, { ...manifest, slots: manifest.slots.filter(slot => !hidden.has(slot)) });
  if (look.outfit.some(({ item }) => item.itemKey === 'mini_me') && !hidden.has('companion')) {
    const miniLook = withoutShadow({ ...look, outfit: look.outfit.filter(({ item }) => item.category !== 'companion' && item.category !== 'aura') });
    const miniFrames = miniLook.outfit.flatMap(({ item }) => item.parts.filter(part => !hidden.has(part.slot) && (!part.fits || part.fits.includes(bodyKey)) && rig.anchors[part.anchor]).map(part => part.frames));
    const small = await composeLook(miniLook, loopManifest(manifest, bodyKey, rig, miniFrames, manifest.slots.filter(slot => !hidden.has(slot))));
    const canvas = document.createElement('canvas'); canvas.width = 32 * small.frames; canvas.height = 48;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('Could not create companion canvas');
    c.imageSmoothingEnabled = false;
    for (let frame = 0; frame < small.frames; frame++) c.drawImage(small.canvas, frame * 32, 0, 32, 48, frame * 32 + 17, 23, 16, 24);
    companions.push({ canvas, frames: small.frames, fps: small.fps });
  }
  const portrait = await composePortrait(look, manifest, 2);
  return { appearance: { profile: look.profile, outfit: look.outfit.map(({ item, dyes }) => ({ key: item.itemKey, dyes })) }, body, back, front, companions, bodyKey, rig, portraitUrl: portrait.toDataURL('image/png'), fallback: false };
}

function pixelFallback(): HeroAvatar {
  const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 48;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Could not create fallback avatar');
  const rect = (x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  rect(9, 26, 14, 11, '#463b43'); rect(10, 29, 12, 9, '#d0a880'); rect(9, 26, 14, 4, '#655044');
  rect(12, 32, 2, 2, '#263942'); rect(19, 32, 2, 2, '#263942'); rect(14, 36, 5, 1, '#9b685c');
  rect(8, 38, 16, 7, '#76a59a'); rect(8, 38, 16, 2, '#a2ccba'); rect(9, 45, 6, 3, '#364956'); rect(17, 45, 6, 3, '#364956');
  const portrait = document.createElement('canvas'); portrait.width = portrait.height = 48;
  const pc = portrait.getContext('2d');
  if (!pc) throw new Error('Could not create fallback portrait');
  pc.imageSmoothingEnabled = false; pc.drawImage(canvas, 4, 19, 24, 24, 0, 0, 48, 48);
  return { body: { canvas, frames: 1, fps: 1 }, back: [], front: [], companions: [], bodyKey: 'body_kid', rig: { frames: 1, fps: 1, anchors: { head: [[0, 0]], body: [[0, 0]], ground: [[0, 0]], free: [[0, 0]] } }, portraitUrl: portrait.toDataURL('image/png'), fallback: true };
}

async function loadAvatarAssets(userId: string | null, signal?: AbortSignal): Promise<HeroAvatar> {
  checkAbort(signal);
  let manifest: AvatarManifest;
  try { manifest = await loadAvatarManifest(); }
  catch { checkAbort(signal); return pixelFallback(); }
  checkAbort(signal);
  if (userId) {
    try {
      // Read afresh on each game load, so changes in the Station appear next visit.
      const response = await fetchWithAuth('/user/avatar', { signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load your Station look');
      const data = await response.json() as AvatarResponse;
      const assets = await composeHeroAvatar(lookFromAvatar(data.data), manifest);
      checkAbort(signal); return assets;
    } catch { checkAbort(signal); }
  }
  try {
    const assets = await composeHeroAvatar(guestLook(manifest), manifest);
    checkAbort(signal); return { ...assets, fallback: userId !== null };
  } catch { checkAbort(signal); return pixelFallback(); }
}

// Bound the entire pipeline, including shared manifest and image promises. A
// disconnected asset host must not leave the title screen waiting forever.
export const AVATAR_LOAD_TIMEOUT_MS = 8000;
export async function loadHeroAvatar(userId: string | null, signal?: AbortSignal): Promise<HeroAvatar> {
  checkAbort(signal);
  const abort = new AbortController();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (assets?: HeroAvatar, error?: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); abort.abort();
      if (error) reject(error); else resolve(assets!);
    };
    const cancel = () => finish(undefined, new DOMException('Avatar loading cancelled', 'AbortError'));
    const fallback = () => { try { finish(pixelFallback()); } catch (error) { finish(undefined, error); } };
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(fallback, AVATAR_LOAD_TIMEOUT_MS);
    if (signal?.aborted) { cancel(); return; }
    void loadAvatarAssets(userId, abort.signal).then(assets => finish(assets), () => {
      if (signal?.aborted) cancel(); else fallback();
    });
  });
}

// Only local catalog keys become image paths; a peer cannot supply asset URLs.
export async function composeAppearance(appearance: AvatarAppearance): Promise<HeroAvatar> {
  try {
    const manifest = await loadAvatarManifest();
    const catalog = catalogInventory(manifest as CatalogManifest);
    const outfit = appearance.outfit.slice(0, 24).flatMap(entry => {
      const item = catalog.find(candidate => candidate.item.itemKey === entry.key)?.item;
      return item ? [{ item, dyes: entry.dyes }] : [];
    });
    return await composeHeroAvatar({ profile: appearance.profile, outfit }, manifest);
  } catch { return pixelFallback(); }
}
