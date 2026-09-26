import { useQuery } from "@tanstack/react-query";
import type { AvatarManifest } from "./types";

// The manifest ships with the site, so it only changes on deploy.
let manifestPromise: Promise<AvatarManifest> | null = null;

export function loadAvatarManifest() {
  manifestPromise ||= fetch("/avatar-v2/manifest.json").then((response) => {
    if (!response.ok) {
      manifestPromise = null;
      throw new Error("Failed to load avatar art");
    }
    return response.json() as Promise<AvatarManifest>;
  });
  return manifestPromise;
}

export function useAvatarManifest() {
  return useQuery({
    queryKey: ["avatar", "manifest"],
    queryFn: loadAvatarManifest,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

// The colour players see for a ramp (its base shade).
export function rampSwatch(manifest: AvatarManifest, ramp: string) {
  return manifest.ramps[ramp]?.[3] || "#000";
}
