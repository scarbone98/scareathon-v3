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
      const cy = 27 - tier * 6, radius = 13 - tier * 2.7;
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

export function drawTaxiBody(c: CanvasRenderingContext2D) {
  const panel = (x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) => {
    c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill();
  };
  // Same 26 × 18 silhouette and orientation as the original taxi.
  panel(-13.8, -7.5, 27.6, 16, 4, '#172d32');
  for (const x of [-10, 6]) for (const y of [-9, 6]) {
    panel(x, y, 5, 3.4, .9, '#111e27'); panel(x + .4, y + .6, 4.2, .4, .2, '#718183');
  }
  const paint = c.createLinearGradient(0, -7, 0, 7);
  paint.addColorStop(0, '#ffdf8b'); paint.addColorStop(.25, '#edba59'); paint.addColorStop(.7, '#cf9340'); paint.addColorStop(1, '#996537');
  panel(-13, -7, 26, 14, 3.8, paint);
  panel(-8, -5.9, 15, 11.8, 2.8, '#775d39');
  const glass = c.createLinearGradient(-7, -5, 7, 5);
  glass.addColorStop(0, '#99c7c9'); glass.addColorStop(.3, '#3d6976'); glass.addColorStop(1, '#1b3749');
  panel(-7.5, -5.3, 14, 10.6, 2.2, glass);
  panel(-3.4, -5.5, 5.8, 11, 1.5, '#f4c76c');
  panel(-2.5, -2, 4, 3, .7, '#fff0b9');
  panel(-1.6, -1.3, 2.2, .5, .1, '#554b39');
  c.strokeStyle = '#fff2c780'; c.lineWidth = .35;
  c.beginPath(); c.moveTo(-6.8, -4.4); c.lineTo(-4.5, 3.4); c.moveTo(3.1, -4.5); c.lineTo(5.6, 3); c.stroke();
  c.strokeStyle = '#94662f'; c.lineWidth = .3;
  c.beginPath(); c.moveTo(8.1, -4.5); c.lineTo(9.3, -3.8); c.lineTo(9.3, 3.8); c.lineTo(8.1, 4.5); c.stroke();
  for (let k = -10; k < 11; k += 2) panel(k, 5.3, 1, .7, .1, '#374746');
  for (const y of [-4.8, 2.4]) {
    panel(11.8, y, 1.7, 2.6, .6, '#fff8d9'); panel(-13.2, y, 1.3, 2.4, .4, '#d66e64');
  }
  panel(13, -3.5, .5, 7, .2, '#c4d0bf'); panel(-13.4, -3, .5, 6, .2, '#b5bdb0');
  for (const y of [-7.8, 6.5]) panel(1, y, 2.5, 1.3, .6, '#eec270');
}
