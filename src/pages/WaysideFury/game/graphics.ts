import type { HeroAvatar } from './avatar';
import { Renderer, type RenderPresentation } from './render';
import type { GameEvent, GameState } from './sim';
import type { OverworldRenderer } from './render3d';

export type GraphicsMode = '2d' | '3d';
export interface GraphicsStatus {
  requested: GraphicsMode;
  active: GraphicsMode;
  status: 'ready' | 'loading' | 'fallback';
}
const PREFERENCE_KEY = 'wayside-fury-graphics';

// Graphics are a device preference, never part of a local or cloud game save.
export function readGraphicsMode(): GraphicsMode {
  const query = new URLSearchParams(window.location.search).get('gfx');
  if (query === '2d' || query === '3d') return query;
  try { return localStorage.getItem(PREFERENCE_KEY) === '3d' ? '3d' : '2d'; }
  catch { return '2d'; }
}
export function rememberGraphicsMode(mode: GraphicsMode) {
  try { localStorage.setItem(PREFERENCE_KEY, mode); } catch { /* Session selection still works. */ }
  const url = new URL(window.location.href);
  if (url.searchParams.has('gfx')) {
    url.searchParams.set('gfx', mode);
    window.history.replaceState(window.history.state, '', url);
  }
}

// The 2D renderer stays alive for other scenes and while the optional chunk loads.
// A generation guards asynchronous imports against switches and React unmounts.
export class GraphicsRenderer {
  private flat: Renderer;
  private depth: OverworldRenderer | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private avatar: HeroAvatar | null = null;
  private remoteAvatars = new Map<number, HeroAvatar>();
  private generation = 0;
  private loading = false;
  private failed = false;
  private disposed = false;
  private selected: GraphicsMode;
  private current: GraphicsStatus | null = null;

  constructor(private canvas: HTMLCanvasElement, mode: GraphicsMode, private onStatus?: (status: GraphicsStatus) => void) {
    this.flat = new Renderer(canvas);
    this.selected = mode;
    canvas.dataset.renderer = '2d';
    this.status('2d', 'ready');
  }
  get graphicsMode() { return this.selected; }
  setGraphicsMode(mode: GraphicsMode) {
    if (mode === this.selected && !this.failed) return;
    this.selected = mode; this.failed = false;
    delete this.canvas.dataset.gfxError;
    this.generation++; this.loading = false;
    this.releaseDepth();
    this.status('2d', 'ready');
  }
  setAvatar(avatar: HeroAvatar) { this.avatar = avatar; this.flat.setAvatar(avatar); this.depth?.setAvatar(avatar); }
  setRemoteAvatar(seat: number, avatar: HeroAvatar) {
    this.remoteAvatars.set(seat, avatar);
    this.flat.setRemoteAvatar(seat, avatar); this.depth?.setRemoteAvatar(seat, avatar);
  }
  reset() { this.flat.reset(); this.depth?.reset(); }
  onEvent(s: GameState, event: GameEvent) { this.flat.onEvent(s, event); this.depth?.onEvent(s, event); }
  presentation(s: GameState): RenderPresentation {
    return this.current?.active === '3d' && this.depth ? this.depth.presentation(s) : this.flat.presentation(s);
  }
  draw(s: GameState, dt = 1 / 60, frameDelta = dt) {
    if (this.disposed) return;
    this.depth?.syncRemotePeers(s);
    const wantsDepth = this.selected === '3d' && s.scene === 'overworld';
    if (wantsDepth && !this.depth && !this.failed && !this.loading) this.loadDepth();
    if (wantsDepth && this.depth && !this.failed) {
      try {
        this.depth.draw(s, dt, frameDelta);
        this.canvas.style.visibility = 'hidden';
        this.overlay!.style.visibility = 'visible';
        this.status('3d', 'ready');
        return;
      } catch (error) {
        this.canvas.dataset.gfxError = error instanceof Error ? error.message : '3D rendering failed';
        this.failed = true; this.releaseDepth();
      }
    }
    this.canvas.style.visibility = '';
    if (this.overlay) this.overlay.style.visibility = 'hidden';
    if (this.current?.active === '3d') this.flat.reset();
    const start = performance.now();
    this.flat.draw(s, dt, frameDelta);
    this.canvas.dataset.renderMs = (performance.now() - start).toFixed(3);
    this.canvas.dataset.frameMs = (frameDelta * 1000).toFixed(3);
    this.status('2d', this.failed && this.selected === '3d' ? 'fallback' : wantsDepth && this.loading ? 'loading' : 'ready');
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.generation++; this.loading = false;
    this.releaseDepth(); this.flat.dispose(); this.avatar = null; this.remoteAvatars.clear();
    this.canvas.style.visibility = '';
  }
  private loadDepth() {
    const generation = ++this.generation;
    this.loading = true;
    void import('./render3d').then(({ OverworldRenderer: DepthRenderer }) => {
      if (this.disposed || generation !== this.generation || this.selected !== '3d') return;
      const overlay = document.createElement('canvas');
      overlay.className = 'wf-canvas-3d';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.visibility = 'hidden';
      this.overlay = overlay;
      this.canvas.insertAdjacentElement('afterend', overlay);
      this.depth = new DepthRenderer(overlay);
      if (this.avatar) this.depth.setAvatar(this.avatar);
      for (const [seat, avatar] of this.remoteAvatars) this.depth.setRemoteAvatar(seat, avatar);
    }).catch(error => {
      if (this.disposed || generation !== this.generation) return;
      this.canvas.dataset.gfxError = error instanceof Error ? error.message : '3D initialization failed';
      this.failed = true; this.releaseDepth(); this.status('2d', 'fallback');
    }).finally(() => {
      if (generation === this.generation) this.loading = false;
    });
  }
  private releaseDepth() {
    // Snap the dormant camera to the current state on its next draw, even paused.
    if (this.current?.active === '3d') this.flat.reset();
    try { this.depth?.dispose(); } catch { /* A lost context must still return to 2D. */ } finally {
      this.depth = null; this.overlay?.remove(); this.overlay = null;
      this.canvas.style.visibility = '';
    }
  }
  private status(active: GraphicsMode, status: GraphicsStatus['status']) {
    this.canvas.dataset.gfx = active; this.canvas.dataset.gfxStatus = status;
    if (this.current?.requested === this.selected && this.current.active === active && this.current.status === status) return;
    this.current = { requested: this.selected, active, status };
    this.onStatus?.(this.current);
  }
}
