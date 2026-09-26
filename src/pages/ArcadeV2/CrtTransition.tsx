import { useEffect, useRef } from "react";

// Full-screen old-TV transition. "on": static, then the picture opens out from
// a bright line into the game. "off": the picture collapses to a line and a dot,
// then static. onMidpoint fires when the screen is fully covered (swap what's
// underneath then); onDone when the effect has finished.

type Props = {
  mode: "on" | "off";
  onMidpoint: () => void;
  onDone: () => void;
};

const STATIC_MS = 420;
const LINE_MS = 380;
const FADE_IN_MS = 90; // the static swells in from the cabinet's rather than cutting on

export default function CrtTransition({ mode, onMidpoint, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const beamRef = useRef<HTMLDivElement | null>(null);
  const callbacks = useRef({ onMidpoint, onDone });
  callbacks.current = { onMidpoint, onDone };

  useEffect(() => {
    const canvas = canvasRef.current;
    const beam = beamRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !beam || !context) return;
    canvas.width = 160;
    canvas.height = 90;
    const start = performance.now();
    let frame = 0;
    let midpointSent = false;

    const paintStatic = (alpha: number) => {
      const image = context.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < image.data.length; i += 4) {
        const v = Math.random() * 255;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
        image.data[i + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      canvas.style.opacity = String(alpha);
    };

    const tick = () => {
      const t = performance.now() - start;
      if (mode === "on") {
        // Static over black, then a bright line opens up to reveal the game
        if (t < STATIC_MS) {
          paintStatic(Math.min(t / FADE_IN_MS, 1));
          beam.style.opacity = "0";
        } else {
          if (!midpointSent) {
            midpointSent = true;
            callbacks.current.onMidpoint();
          }
          const k = Math.min((t - STATIC_MS) / LINE_MS, 1);
          paintStatic(1 - k);
          // The black mask splits from the middle outward, leaving a glowing seam
          beam.style.opacity = "1";
          beam.style.transform = `scaleY(${Math.max(1 - k, 0)})`;
          beam.style.boxShadow = `0 0 ${40 * (1 - k)}px ${10 * (1 - k)}px rgba(255,255,255,${1 - k})`;
          if (k >= 1) {
            callbacks.current.onDone();
            return;
          }
        }
      } else {
        // The picture squeezes to a line, then a dot, then static
        const k = Math.min(t / LINE_MS, 1);
        canvas.style.opacity = "0";
        beam.style.opacity = "1";
        beam.style.transform = k < 0.7 ? `scaleY(${1 - k / 0.7})` : `scaleX(${1 - (k - 0.7) / 0.3})`;
        if (k >= 1 && !midpointSent) {
          midpointSent = true;
          callbacks.current.onMidpoint();
        }
        if (k >= 1) {
          const s = (t - LINE_MS) / STATIC_MS;
          paintStatic(1 - s);
          beam.style.opacity = "0";
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
    <div className="pointer-events-auto fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {mode === "on" ? (
        // Two black halves that the beam pries apart
        <div ref={beamRef} className="absolute inset-0 origin-center bg-black" style={{ opacity: 0 }} />
      ) : (
        // A frame of black around a shrinking white picture
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div ref={beamRef} className="h-full w-full origin-center bg-white/90" />
        </div>
      )}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ imageRendering: "pixelated" }} />
    </div>
  );
}
