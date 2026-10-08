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

export function drawTaxiBody(c: CanvasRenderingContext2D) {
  const panel = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color; c.fillRect(x, y, w, h);
  };
  // Match the crew sprites: one-unit ink contour, broad three-tone panels.
  // Keep native-DPR edges and smooth world motion; only the art is simplified.
  for (const x of [-10, 6]) for (const y of [-9, 6]) panel(x, y, 5, 3, '#17282e');
  panel(-14, -6, 28, 12, '#17282e'); panel(-12, -8, 24, 16, '#17282e');
  panel(-13, -5, 26, 10, '#d8a354'); panel(-11, -7, 22, 14, '#d8a354');
  panel(-11, -7, 22, 2, '#efd08b'); panel(-11, 5, 22, 2, '#a97540');
  panel(-8, -5, 15, 10, '#17282e'); panel(-7, -4, 13, 8, '#365965');
  panel(-7, -4, 3, 2, '#799ba1'); panel(-2, -5, 4, 10, '#d8a354');
  panel(-3, -2, 6, 4, '#17282e'); panel(-2, -1, 4, 2, '#efd08b');
  for (const y of [-4, 2]) {
    panel(11, y, 2, 2, '#efd08b'); panel(-13, y, 1, 2, '#b96e60');
  }
  for (const x of [-9, -5, 3, 7]) panel(x, 5, 2, 1, '#17282e');
}
