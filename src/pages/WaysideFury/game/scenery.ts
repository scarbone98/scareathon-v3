// Presentation-only artwork. Shapes retain the authored prop footprints.
// Rasterize foliage once at high detail; never allocate textures in the frame loop.
let canopy: HTMLCanvasElement | null = null;
export function drawCanopy(c: CanvasRenderingContext2D, x: number, y: number) {
  if (!canopy) {
    canopy = document.createElement('canvas');
    canopy.width = 384; canopy.height = 480;
    const p = canopy.getContext('2d')!; p.scale(12, 12);
    const trunk = p.createLinearGradient(13, 0, 19, 0);
    trunk.addColorStop(0, '#3b3932'); trunk.addColorStop(.4, '#9c8060'); trunk.addColorStop(1, '#514e3f');
    p.fillStyle = trunk;
    p.beginPath(); p.moveTo(14, 38); p.lineTo(15, 16); p.lineTo(18, 16); p.lineTo(19, 38); p.closePath(); p.fill();
    p.strokeStyle = '#c1a37a80'; p.lineWidth = .3;
    for (let n = 0; n < 4; n++) { p.beginPath(); p.moveTo(15 + n * .7, 28); p.lineTo(14.7 + n, 37); p.stroke(); }
    // Overlapping boughs: warm upper rim, cool self-shadow, fine needle clusters.
    for (let tier = 0; tier < 4; tier++) {
      const cy = 28 - tier * 5, radius = 13 - tier * 2.7;
      const shade = p.createLinearGradient(0, cy - 7, 0, cy + 5);
      shade.addColorStop(0, '#76946b'); shade.addColorStop(.25, '#476f57'); shade.addColorStop(1, '#173e37');
      p.fillStyle = shade; p.beginPath(); p.moveTo(16, cy - 12);
      p.bezierCurveTo(12, cy - 5, 16 - radius, cy - 1, 16 - radius, cy + 3);
      p.quadraticCurveTo(16, cy + 8, 16 + radius, cy + 3);
      p.bezierCurveTo(16 + radius - 1, cy - 1, 20, cy - 5, 16, cy - 12); p.fill();
      p.lineCap = 'round'; p.lineWidth = .28;
      for (let n = 0; n < 45; n++) {
        const t = n / 45, a = n * 2.39996;
        const px = 16 + Math.cos(a) * radius * Math.sqrt(t) * .87;
        const py = cy + Math.sin(a) * 3 * Math.sqrt(t) - (1 - t) * 4;
        p.strokeStyle = n % 3 ? '#acc38a60' : '#112f3480';
        p.beginPath(); p.moveTo(px - .65, py + .4); p.quadraticCurveTo(px, py - .4, px + 1.2, py - .7); p.stroke();
      }
    }
  }
  c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(canopy, x - 16, y - 38, 32, 40); c.restore();
}

// The wreck is the reference asset: muted ochre, slate glass, block panels and
// dark wheel/crease accents. All cab states share this palette and ground anchor.
const CAB = { shadow: '#716343', body: '#ad874b', light: '#e8ba70', glass: '#293e45', ink: '#17282e' };
export function drawTaxiBody(c: CanvasRenderingContext2D, view: 'side' | 'front' | 'rear' = 'side') {
  const panel = (x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  if (view === 'side') {
    panel(-16, -10, 32, 9, CAB.shadow); panel(-15, -12, 29, 8, CAB.body);
    panel(-10, -23, 19, 14, CAB.body); panel(-9, -24, 17, 2, CAB.light);
    panel(-7, -21, 13, 8, CAB.glass); panel(-1, -21, 1, 8, CAB.body);
    panel(-7, -21, 11, 1, '#5d5c55');
    panel(-15, -12, 5, 2, CAB.light); panel(9, -12, 6, 2, CAB.light);
    panel(-14, -3, 5, 4, CAB.ink); panel(8, -3, 5, 4, CAB.ink);
    panel(-6, -11, 1, 7, CAB.shadow); panel(-4, -10, 3, 1, CAB.ink);
    panel(14, -9, 2, 3, CAB.light); panel(-16, -9, 1, 2, '#925b49');
  } else {
    panel(-10, -11, 20, 10, CAB.shadow); panel(-9, -14, 18, 11, CAB.body);
    panel(-8, -23, 16, 12, CAB.body); panel(-7, -24, 14, 2, CAB.light);
    panel(-6, -21, 12, 7, CAB.glass); panel(-6, -21, 11, 1, '#5d5c55');
    panel(-8, -13, 16, 2, CAB.light);
    panel(-10, -3, 4, 4, CAB.ink); panel(6, -3, 4, 4, CAB.ink);
    for (const x of [-8, 5]) panel(x, -8, 3, 2, view === 'front' ? CAB.light : '#925b49');
    panel(-3, -6, 6, 2, CAB.ink);
  }
  panel(-4, -28, 8, 4, CAB.light);
  for (const x of [-3, -1, 1]) panel(x, -27, 1, 2, CAB.ink);
}

export function drawTaxiWreck(c: CanvasRenderingContext2D) {
  const panel = (x: number, y: number, w: number, h: number, color: string) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  panel(-16, -10, 32, 9, CAB.shadow); panel(-15, -12, 29, 5, CAB.body);
  panel(-10, -17, 19, 8, '#5d5c55'); panel(-7, -16, 11, 5, CAB.glass);
  panel(-14, -3, 5, 4, CAB.ink); panel(8, -3, 5, 4, CAB.ink);
  c.fillStyle = '#6c6b65'; c.beginPath(); c.arc(2, -18, 8, 0, Math.PI * 2); c.fill();
  panel(-3, -23, 7, 3, '#989180'); panel(10, -10, 6, 2, CAB.light);
  panel(-6, -10, 1, 5, '#252c35'); panel(-10, -7, 4, 1, '#252c35');
}
