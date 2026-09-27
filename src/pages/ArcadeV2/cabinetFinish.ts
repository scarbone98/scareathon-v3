import { CanvasTexture, Color, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping } from "three";

// The cabinet's black body as pebbled laminate rather than glossy plastic.
// The model's UVs stretch unevenly across its panels, so the grain is projected
// from the cabinet's own axes (triplanar) instead of wrapped with them.

const SIZE = 256;

// A tiling height map: fine pebbles in red, soft mottling in green
function finishTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext("2d")!;
  const random = seeded(7);

  // Draws a soft dot, repeated across the edges so the tile wraps seamlessly
  const dot = (x: number, y: number, radius: number, rgb: string, alpha: number) => {
    for (const dx of [-SIZE, 0, SIZE]) {
      for (const dy of [-SIZE, 0, SIZE]) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx + radius < 0 || cx - radius > SIZE || cy + radius < 0 || cy - radius > SIZE) continue;
        const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
        gradient.addColorStop(1, `rgba(${rgb}, 0)`);
        context.fillStyle = gradient;
        context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }
    }
  };

  context.fillStyle = "rgb(128, 128, 0)";
  context.fillRect(0, 0, SIZE, SIZE);
  // Mottling first, in green only, then pebbles in red only
  context.globalCompositeOperation = "lighter";
  for (let i = 0; i < 60; i++) dot(random() * SIZE, random() * SIZE, 30 + random() * 50, "0, 40, 0", 0.5);
  for (let i = 0; i < 3200; i++) dot(random() * SIZE, random() * SIZE, 1.5 + random() * 2.5, "70, 0, 0", 0.35 + random() * 0.5);
  context.globalCompositeOperation = "difference";
  for (let i = 0; i < 60; i++) dot(random() * SIZE, random() * SIZE, 30 + random() * 50, "0, 40, 0", 0.5);
  for (let i = 0; i < 1600; i++) dot(random() * SIZE, random() * SIZE, 1.5 + random() * 2, "60, 0, 0", 0.3 + random() * 0.4);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createCabinetFinish() {
  const texture = finishTexture();
  const material = new MeshStandardMaterial({ color: new Color("#0c0a0f"), roughness: 0.6, metalness: 0.05 });
  material.name = "CabinetFinish";
  material.emissive = new Color(0x222222);
  material.emissiveIntensity = 0.25;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.finishMap = { value: texture };
    // Pebbles per model unit (the cabinet's model is a few units tall)
    shader.uniforms.finishScale = { value: 0.9 };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFinishPos;\nvarying vec3 vFinishNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFinishPos = position;\nvFinishNormal = normal;");

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D finishMap;
uniform float finishScale;
varying vec3 vFinishPos;
varying vec3 vFinishNormal;
vec2 finishSample(vec3 p, vec3 n) {
  vec3 w = pow(abs(normalize(n)), vec3(4.0));
  w /= (w.x + w.y + w.z);
  return texture2D(finishMap, p.yz * finishScale).rg * w.x
    + texture2D(finishMap, p.xz * finishScale).rg * w.y
    + texture2D(finishMap, p.xy * finishScale).rg * w.z;
}
// Tilts the normal down the height map's slope (three's bump mapping, without UVs)
vec3 finishPerturb(vec3 surfPos, vec3 surfNormal, vec2 dHdxy, float face) {
  vec3 sigmaX = normalize(dFdx(surfPos));
  vec3 sigmaY = normalize(dFdy(surfPos));
  vec3 r1 = cross(sigmaY, surfNormal);
  vec3 r2 = cross(surfNormal, sigmaX);
  float det = dot(sigmaX, r1) * face;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNormal - grad);
}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec2 finish = finishSample(vFinishPos, vFinishNormal);
// Soft blotches of wear, darker and lighter than the base black
diffuseColor.rgb *= 0.9 + (finish.g - 0.5) * 0.6 + (finish.r - 0.5) * 0.2;`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
// Pebble tops catch a little shine, the hollows stay matte
roughnessFactor = clamp(roughnessFactor - (finish.r - 0.5) * 0.3 + (finish.g - 0.5) * 0.2, 0.35, 0.9);`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
float finishHeight = finish.r;
normal = finishPerturb(-vViewPosition, normal, vec2(dFdx(finishHeight), dFdy(finishHeight)) * 0.3, faceDirection);`
      );
  };

  return {
    material,
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}
