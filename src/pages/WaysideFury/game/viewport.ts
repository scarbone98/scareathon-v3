// Presentation geometry only. Simulation coordinates and rules never use this.
export interface RenderViewport {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
  // Physical pixels per world unit; integer at native device resolution.
  pixelScale: number;
  zoom: number;
  width: number;
  height: number;
}

export function getRenderViewport(cssWidth: number, cssHeight: number, deviceDpr: number, dprCap = Infinity): RenderViewport {
  cssWidth = Number.isFinite(cssWidth) ? Math.max(1, cssWidth) : 1;
  cssHeight = Number.isFinite(cssHeight) ? Math.max(1, cssHeight) : 1;
  const nativeDpr = Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1;
  const dpr = Math.min(nativeDpr, Math.max(1, dprCap));
  const pixelWidth = Math.round(cssWidth * dpr), pixelHeight = Math.round(cssHeight * dpr);
  // About 29 CSS-pixel tiles on phones (27–32 after rounding to whole device
  // pixels), 64 on roomy desktops. Phones used to get 37-pixel tiles, which
  // left a 167×362-unit view in portrait: the taxi and one junction filled the
  // screen and there was too little road ahead to steer by. The wider view
  // keeps every sprite at an integer device-pixel scale, so the art stays
  // crisp; it just shows more county.
  const phone = Math.min(cssWidth, cssHeight) < 600;
  const desiredZoom = phone ? 1.8 : 4;
  // The view never exceeds 640 world units across. Its height stays within 400
  // on desktops and tablets, where the zoom is coarse; a tall phone may show
  // up to 520 so that portrait sees the road ahead instead of being pinned to
  // the 400 cap (which forced 37-pixel tiles on a 3× phone).
  const maxHeight = phone ? 520 : 400;
  // Derive camera geometry from the device, never the adaptive backing cap.
  // Lower quality may use fractional backing pixels per unit; native quality
  // retains integer pixel edges and both scenes retain exactly the same view.
  const nativeScale = Math.max(1, Math.round(desiredZoom * nativeDpr), Math.ceil(cssWidth * nativeDpr / 640), Math.ceil(cssHeight * nativeDpr / maxHeight));
  const zoom = nativeScale / nativeDpr, pixelScale = zoom * dpr;
  return { cssWidth, cssHeight, pixelWidth, pixelHeight, dpr, pixelScale, zoom, width: cssWidth / zoom, height: cssHeight / zoom };
}
