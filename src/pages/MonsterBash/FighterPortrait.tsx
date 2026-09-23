import type { Monster } from "../../../server/shared/monster-bash/index.js";

// First frame of a monster's sprite sheet, drawn crisp at pixel scale.
export default function FighterPortrait({
  monster,
  size = 56,
  flip = false,
}: {
  monster: Monster;
  size?: number;
  flip?: boolean;
}) {
  const { url, frameWidth, frameHeight, frames } = monster.sprite;
  const scale = size / Math.max(frameWidth, frameHeight);
  return (
    <div className="flex items-end justify-center" style={{ width: size, height: size }} aria-hidden="true">
      <div
        style={{
          width: frameWidth * scale,
          height: frameHeight * scale,
          backgroundImage: `url(${url})`,
          backgroundSize: `${frameWidth * frames * scale}px ${frameHeight * scale}px`,
          backgroundPosition: "0 0",
          imageRendering: "pixelated",
          transform: flip ? "scaleX(-1)" : undefined,
        }}
      />
    </div>
  );
}
