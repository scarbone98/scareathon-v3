// Presentation geometry only. Simulation coordinates and rules never use this.
export interface RenderViewport {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
  // Physical pixels per world unit: an integer keeps tile and sheet edges crisp.
  pixelScale: number;
  zoom: number;
  width: number;
  height: number;
}

export function getRenderViewport(cssWidth: number, cssHeight: number, deviceDpr: number, dprCap = Infinity): RenderViewport {
  cssWidth = Number.isFinite(cssWidth) ? Math.max(1, cssWidth) : 1;
  cssHeight = Number.isFinite(cssHeight) ? Math.max(1, cssHeight) : 1;
  const dpr = Math.min(Number.isFinite(deviceDpr) && deviceDpr > 0 ? deviceDpr : 1, Math.max(1, dprCap));
  const pixelWidth = Math.round(cssWidth * dpr), pixelHeight = Math.round(cssHeight * dpr);
  // 37 CSS-pixel tiles on phones, 64 on roomy desktops. The native-resolution
  // addendum takes precedence over the old 240-world-unit minimum: small phones
  // show fewer tiles at a comfortable size, rather than shrinking all the art.
  const desiredZoom = Math.min(cssWidth, cssHeight) < 600 ? 2.3 : 4;
  const pixelScale = Math.max(1, Math.round(desiredZoom * dpr), Math.ceil(pixelWidth / 640), Math.ceil(pixelHeight / 400));
  const zoom = pixelScale / dpr;
  return { cssWidth, cssHeight, pixelWidth, pixelHeight, dpr, pixelScale, zoom, width: cssWidth / zoom, height: cssHeight / zoom };
}
