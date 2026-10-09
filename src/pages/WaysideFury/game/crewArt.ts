import type { HeroId } from './sim';
import type { HeroAvatar } from './avatar';
import { idleMotion, type ActorMotion } from './animation';

const colors = {
  you: ['#88c9ad', '#c49370', '#433c39'], joe: ['#64b8c5', '#d4a079', '#634939'],
  matt: ['#dbac59', '#ebc09b', '#9a673d'], alex: ['#91af6b', '#b98262', '#382e30'], jon: ['#a088bd', '#e2ae89', '#473c41'],
};
const rearColors = new WeakMap<HeroAvatar, string>();
function limb(c: CanvasRenderingContext2D, x: number, y: number, ex: number, ey: number, width: number, color: string) {
  c.lineCap = 'round'; c.strokeStyle = '#24313d'; c.lineWidth = width + 1.2;
  c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke(); c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}

/** Original vector rig: distinct front/back/profile, planted alternating feet,
 * opposing arms, breathing and blinks. Draws at native canvas/WebGL resolution. */
export function drawCrew(c: CanvasRenderingContext2D, id: HeroId, x: number, y: number, time: number, motion = idleMotion(), avatar?: HeroAvatar | null, emote: 'calm' | 'talk' | 'shock' | 'ready' = 'calm') {
  const [shirt, skin, hair] = colors[id], walk = motion.speed > 1;
  const stride = walk ? Math.sin(motion.phase) : 0;
  const side = motion.facing === 'left' || motion.facing === 'right', back = motion.facing === 'up';
  c.save(); c.translate(x, y); c.imageSmoothingEnabled = true;
  if (motion.facing === 'left') c.scale(-1, 1);
  // Preserve the Station outfit using articulated lower strips. The rear pose
  // masks the face instead of displaying eyes on the back of the head.
  if (id === 'you' && avatar) {
    drawAvatar(c, avatar, time, motion); c.restore(); return;
  }
  const footX = side ? 0 : 3.2;
  for (const sign of [-1, 1]) {
    const fx = footX * sign + (side ? stride * sign * 4 : stride * sign * .6);
    const fy = -1 - Math.max(0, stride * sign) * (side ? 2 : 3);
    limb(c, footX * sign, -10, fx, fy - 1, 3.8, '#445568');
    oval(c, fx + (side ? 1.2 : 0), fy, 3, 1.6, '#26323e');
  }
  c.translate(0, walk ? -Math.abs(stride) * .8 : -Math.sin(time * 2.4) * .35);
  for (const sign of [-1, 1]) {
    const ax = sign * (side ? 2 : 6), swing = stride * sign * 3;
    limb(c, ax * .75, -19, ax + (side ? swing : 0), -11 + (side ? 0 : swing), 3, shirt);
    oval(c, ax + (side ? swing : 0), -10 + (side ? 0 : swing), 1.8, 2, skin);
  }
  c.fillStyle = shirt; c.beginPath(); c.roundRect(side ? -4 : -5.5, -21, side ? 8 : 11, 12, 3); c.fill();
  limb(c, side ? 2 : -3.5, -18, side ? 2 : -3.5, -11, .6, '#e2e3c480');
  if (!back) { c.fillStyle = '#d9ceb0'; c.fillRect(side ? 1 : 2, -18, 2, 3); }
  oval(c, side ? 1 : 0, -26, side ? 5.2 : 6, 6.7, skin);
  oval(c, 0, -30, 6, 3.5, hair);
  if (back) oval(c, 0, -26, 6, 5, hair);
  else {
    const blink = time > 0 && (time + id.length * .7) % 4.1 > 3.95;
    for (const eye of side ? [3.5] : [-2.5, 2.5]) oval(c, eye, -26, .65, blink ? .2 : emote === 'shock' ? 1.4 : .9, '#24313d');
    if (emote === 'shock') oval(c, side ? 4 : 0, -22.5, 1.1, 1.5, '#754d49');
    else limb(c, side ? 2 : -1.5, -22.3, side ? 4 : 1.5, -22.3 + (emote === 'talk' ? Math.sin(time * 13) * .6 : 0), .55, '#885d50');
  }
  if (id === 'jon') { c.strokeStyle = '#d8c9dc'; c.lineWidth = .7; if (!back) c.strokeRect(side ? 1.5 : -4.5, -28, side ? 4 : 9, 4); }
  if (id === 'joe') { c.fillStyle = '#e1c39b'; c.fillRect(-3.5, -15, 7, 6); }
  if (id === 'matt') oval(c, side ? 4 : 6, -12, 1.7, 1.7, '#ddc875');
  if (emote === 'ready') limb(c, 5, -18, 9, -23, 3, skin);
  c.restore();
}

function drawAvatar(c: CanvasRenderingContext2D, avatar: HeroAvatar, time: number, motion: ActorMotion) {
  c.imageSmoothingEnabled = false;
  const stride = motion.speed > 1 ? Math.sin(motion.phase) : 0;
  const side = motion.facing === 'left' || motion.facing === 'right';
  const frameTime = motion.speed > 1 ? motion.phase / (Math.PI * 2) : time;
  if (side) c.scale(.82, 1);
  const floating = ['body_ghost', 'body_crow', 'body_shadowbeast', 'body_skull'].includes(avatar.bodyKey);
  for (const strip of [...avatar.back, avatar.body, ...avatar.front]) {
    const frame = Math.floor(frameTime * (motion.speed > 1 ? strip.frames : strip.fps)) % strip.frames;
    if (floating) {
      c.drawImage(strip.canvas, frame * 32, 0, 32, 48, -16, -48 - (motion.speed > 1 ? Math.sin(motion.phase) : Math.sin(time * 2.4)) * 1.2, 32, 48);
      continue;
    }
    c.drawImage(strip.canvas, frame * 32, 0, 32, 40, -16, -48 - Math.abs(stride) * .7, 32, 40);
    for (const n of [0, 1]) {
      const step = stride * (n ? 1 : -1);
      c.drawImage(strip.canvas, frame * 32 + n * 16, 40, 16, 8, -16 + n * 16 + (side ? step * 2.5 : 0), -8 - Math.max(0, step) * 2.3, 16, 8);
    }
  }
  if (motion.facing === 'up' && avatar.bodyKey === 'body_kid') {
    // The catalog head begins at (8,26), not the top of its transparent cell.
    // Sample the saved look's skin so the back pose does not invent a hood or
    // change its hair/hat. Keep the portrait/wardrobe source canvases untouched.
    let skin = rearColors.get(avatar);
    if (!skin) {
      const pixel = avatar.body.canvas.getContext('2d')!.getImageData(13, 28, 1, 1).data;
      skin = pixel[3] ? `rgb(${pixel[0]} ${pixel[1]} ${pixel[2]})` : '#c49370';
      rearColors.set(avatar, skin);
    }
    const frame = Math.floor(frameTime * avatar.body.fps) % avatar.rig.frames;
    const [dx, dy] = avatar.rig.anchors.head?.[frame] ?? [0, 0];
    oval(c, dx, (avatar.fallback && !avatar.appearance ? 32 : 30) + dy - 48 - Math.abs(stride) * .7, 4.6, 4, skin);
  }
}
