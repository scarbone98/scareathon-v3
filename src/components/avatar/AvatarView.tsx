import { useEffect, useRef, useState } from "react";
import { composeLook } from "./compose";
import { useAvatarManifest } from "./manifest";
import type { AvatarLook } from "./types";

type AvatarViewProps = {
  look: AvatarLook | null;
  // CSS height in px; the width follows the 120x150 canvas
  height?: number;
  className?: string;
  label?: string;
};

// Draws an avatar at a whole-pixel-friendly size with crisp pixels.
export function AvatarView({ look, height = 300, className = "", label = "Avatar preview" }: AvatarViewProps) {
  const { data: manifest } = useAvatarManifest();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!manifest || !look) return;
    let cancelled = false;
    composeLook(look, manifest)
      .then((composed) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        canvas.width = composed.width;
        canvas.height = composed.height;
        const context = canvas.getContext("2d");
        context?.clearRect(0, 0, canvas.width, canvas.height);
        context?.drawImage(composed, 0, 0);
        setFailed(false);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [look, manifest]);

  const width = manifest ? Math.round((height * manifest.width) / manifest.height) : Math.round(height * 0.8);

  return (
    <span className={`avatar-view ${className}`} style={{ width, height }} role="img" aria-label={label}>
      <canvas ref={canvasRef} style={{ width, height, imageRendering: "pixelated" }} />
      {failed && <span className="avatar-view-error">Couldn't draw this look</span>}
    </span>
  );
}
