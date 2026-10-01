import { useEffect, useRef, useState } from "react";
import { composeLook } from "./compose";
import { useAvatarManifest } from "./manifest";
import type { AvatarLook } from "./types";

type AvatarViewProps = {
  look: AvatarLook | null;
  // CSS height in px; the width follows the canvas. Rounded down to a whole
  // multiple of the canvas so every art pixel is the same size.
  height?: number;
  className?: string;
  label?: string;
  // play the body's idle loop (on by default; off honours reduced motion too)
  animate?: boolean;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Draws an avatar with crisp pixels, playing its idle loop.
export function AvatarView({ look, height = 288, className = "", label = "Avatar preview", animate = true }: AvatarViewProps) {
  const { data: manifest } = useAvatarManifest();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!manifest || !look) return;
    let cancelled = false;
    let timer: number | undefined;
    composeLook(look, manifest)
      .then(({ canvas: strip, frames, fps }) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        canvas.width = manifest.width;
        canvas.height = manifest.height;
        const context = canvas.getContext("2d");
        if (!context) return;
        let frame = 0;
        const draw = () => {
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(strip, frame * manifest.width, 0, manifest.width, manifest.height, 0, 0, manifest.width, manifest.height);
        };
        draw();
        setFailed(false);
        if (animate && frames > 1 && !prefersReducedMotion()) {
          timer = window.setInterval(() => {
            frame = (frame + 1) % frames;
            draw();
          }, 1000 / fps);
        }
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [look, manifest, animate]);

  const scale = manifest ? Math.max(1, Math.floor(height / manifest.height)) : 1;
  const cssHeight = manifest ? manifest.height * scale : height;
  const cssWidth = manifest ? manifest.width * scale : Math.round(height * (2 / 3));

  return (
    <span className={`avatar-view ${className}`} style={{ width: cssWidth, height: cssHeight }} role="img" aria-label={label}>
      <canvas ref={canvasRef} style={{ width: cssWidth, height: cssHeight, imageRendering: "pixelated" }} />
      {failed && <span className="avatar-view-error">Couldn't draw this look</span>}
    </span>
  );
}
