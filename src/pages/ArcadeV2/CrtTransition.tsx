import { useEffect, useRef } from "react";

// Full-screen old-TV transition.
// "on": static swells in, the game mounts underneath (onMidpoint), the static
//   holds a while to cover the game's loading screen, then the channel tunes
//   in: the snow breaks up into torn bands with a rolling bar and clears to the picture.
// "off": the picture collapses to a line and a dot on black (onMidpoint, swap
//   what's underneath then), and the black lifts.
// onDone fires when the effect has finished.

type Props = {
  mode: "on" | "off";
  onMidpoint: () => void;
  onDone: () => void;
};

const STATIC_MS = 420;
const FADE_IN_MS = 90; // the static swells in from the cabinet's rather than cutting on
// Snow held over the game after it mounts, to hide its loading screen
const HOLD_MS = 2500;
const TUNE_MS = 900;
const LINE_MS = 380;
const LIFT_MS = 260;

export default function CrtTransition({ mode, onMidpoint, onDone }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const beamRef = useRef<HTMLDivElement | null>(null);
  const callbacks = useRef({ onMidpoint, onDone });
  callbacks.current = { onMidpoint, onDone };

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const beam = beamRef.current;
    const context = canvas?.getContext("2d");
    if (!root || !canvas || !context) return;
    canvas.width = 160;
    canvas.height = 90;
    const image = context.createImageData(canvas.width, canvas.height);
    const start = performance.now();
    let frame = 0;
    let midpointSent = false;
    let tuneStart = -1;

    // Snow, row by row: rowAlpha(y) says how much of that row is covered
    const paintStatic = (rowAlpha: (y: number) => number) => {
      const { width, height } = canvas;
      for (let y = 0; y < height; y += 1) {
        const alpha = Math.max(0, Math.min(1, rowAlpha(y))) * 255;
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          const v = Math.random() * 255;
          image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
          image.data[i + 3] = alpha;
        }
      }
      context.putImageData(image, 0, 0);
    };

    const tick = () => {
      const now = performance.now();
      const t = now - start;
      if (mode === "on") {
        if (!midpointSent && t >= STATIC_MS) {
          midpointSent = true;
          callbacks.current.onMidpoint();
        }
        if (tuneStart < 0 && t >= STATIC_MS + HOLD_MS) tuneStart = now;
        if (tuneStart < 0) {
          // No signal yet: solid snow
          const fade = Math.min(t / FADE_IN_MS, 1);
          paintStatic(() => fade);
        } else {
          // Tuning in: the snow thins and tears into bands and a dark bar
          // rolls up the screen until the picture locks
          const k = Math.min((now - tuneStart) / TUNE_MS, 1);
          const left = 1 - k;
          const height = canvas.height;
          const barY = height * (1 - ((k * 1.6) % 1));
          const bands = Array.from({ length: height }, () => Math.random());
          paintStatic((y) => {
            const tear = bands[y] < left * 0.35 ? 1 : 0;
            const nearBar = Math.max(0, 1 - Math.abs(y - barY) / (height * 0.12));
            return left * left * 0.85 + tear * left + nearBar * left * 0.6;
          });
          // The rolling bar also darkens the picture as it passes
          if (beam) {
            beam.style.opacity = String(left * 0.55);
            beam.style.top = `${(barY / height) * 100 - 12}%`;
          }
          if (k >= 1) {
            callbacks.current.onDone();
            return;
          }
        }
      } else {
        // The picture squeezes to a line, then a dot, then the black lifts
        const k = Math.min(t / LINE_MS, 1);
        if (beam) beam.style.transform = k < 0.7 ? `scaleY(${1 - k / 0.7})` : `scaleX(${1 - (k - 0.7) / 0.3})`;
        if (k >= 1 && !midpointSent) {
          midpointSent = true;
          callbacks.current.onMidpoint();
        }
        if (k >= 1) {
          const s = (t - LINE_MS) / LIFT_MS;
          root.style.opacity = String(Math.max(1 - s, 0));
          if (s >= 1) {
            callbacks.current.onDone();
            return;
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  return (
    <div ref={rootRef} className="pointer-events-auto fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {mode === "on" ? (
        <>
          {/* The rolling vertical-hold bar */}
          <div
            ref={beamRef}
            className="absolute inset-x-0 h-1/4 bg-gradient-to-b from-transparent via-black to-transparent"
            style={{ opacity: 0 }}
          />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
        </>
      ) : (
        // A frame of black around a shrinking white picture
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div ref={beamRef} className="h-full w-full origin-center bg-white/90" />
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </div>
  );
}
