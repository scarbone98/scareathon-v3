import { useMemo, useState } from "react";
import type { AvatarItem } from "./types";

type AvatarPreviewProps = {
  layers: AvatarItem[];
  size?: "sm" | "lg";
};

export function AvatarPreview({ layers, size = "lg" }: AvatarPreviewProps) {
  const [missingAssets, setMissingAssets] = useState<Set<string>>(new Set());
  const sortedLayers = useMemo(
    () =>
      [...layers].sort(
        (a, b) => a.layerOrder - b.layerOrder || a.id - b.id
      ),
    [layers]
  );

  const dimensions = size === "sm" ? "h-24 w-24" : "h-64 w-64";

  return (
    <div
      className={`${dimensions} relative shrink-0 overflow-hidden rounded border border-red-900/60 bg-black/60`}
      style={{
        imageRendering: "pixelated",
        backgroundImage:
          "linear-gradient(45deg, rgba(255,255,255,.05) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,.05) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,.05) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.05) 75%)",
        backgroundSize: "20px 20px",
        backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
      }}
      aria-label="Avatar preview"
    >
      {sortedLayers.map((layer) =>
        missingAssets.has(layer.assetPath) ? null : (
          <img
            key={`${layer.slot}-${layer.itemInstanceId}`}
            src={layer.assetPath}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
            style={{ imageRendering: "pixelated" }}
            onError={() =>
              setMissingAssets((current) => {
                const next = new Set(current);
                next.add(layer.assetPath);
                return next;
              })
            }
          />
        )
      )}
      {missingAssets.size > 0 && (
        <div className="absolute bottom-2 left-2 right-2 rounded bg-red-950/90 px-2 py-1 text-center text-xs text-red-100">
          Missing asset
        </div>
      )}
    </div>
  );
}
