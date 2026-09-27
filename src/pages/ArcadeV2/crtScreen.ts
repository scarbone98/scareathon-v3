import { AdditiveBlending, Matrix3, Mesh, ShaderMaterial, type MeshStandardMaterial, type Texture } from "three";

// The cabinet's screen as a glass tube: a touch of curvature with rounded, dark
// corners, scanlines and a faint phosphor mask, and a soft glow of the picture's
// own colours spilling onto the bezel around it.

// Shared by the screen and its glow: the tube's shape, in the picture's 0-1 space
const CRT_SHAPE = /* glsl */ `
vec2 crtWarp(vec2 uv) {
  vec2 c = uv - 0.5;
  c *= 1.0 + dot(c, c) * 0.22;
  return c + 0.5;
}
// 1 inside the tube's rounded rectangle, easing to 0 across its edge
float crtInside(vec2 uv) {
  vec2 c = abs(uv - 0.5);
  float radius = 0.1;
  float d = length(max(c - vec2(0.5 - radius), 0.0)) - radius;
  return 1.0 - smoothstep(-0.012, 0.0, d);
}
`;

export function applyCrtLook(material: MeshStandardMaterial) {
  material.customProgramCacheKey = () => "crt-screen";
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
${CRT_SHAPE}
// Scanlines, a phosphor mask and a vignette, as a brightness multiplier
vec3 crtShade(vec2 uv) {
  // Coarse, like a low-res tube: each line is a few pixels tall at the size the
  // screen shows, so they read clearly without shimmering
  float lines = 96.0;
  // Fade the lines out only where the screen is too small on screen to show them cleanly
  float perPixel = fwidth(uv.y) * lines;
  float lineStrength = 0.6 * (1.0 - smoothstep(0.55, 0.9, perPixel));
  // Dark gaps between bright lines, rather than an even ripple
  float scan = 1.0 - lineStrength * pow(0.5 + 0.5 * cos(uv.y * lines * 6.2831853), 2.0);
  float column = mod(gl_FragCoord.x, 3.0);
  vec3 mask = vec3(0.9) + 0.18 * vec3(step(column, 1.0), step(1.0, column) * step(column, 2.0), step(2.0, column));
  vec2 c = uv - 0.5;
  // Darker toward the edges, as the glass bulges away
  float vignette = 1.0 - dot(c, c) * 1.8;
  // Brighter overall, to make up for what the lines take away
  return scan * mask * vignette * (1.0 + lineStrength * 0.7);
}`
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
  vec2 crtUv = crtWarp(vMapUv);
  float crtEdge = crtInside(crtUv);
  vec4 sampledDiffuseColor = texture2D(map, clamp(crtUv, 0.0, 1.0));
  // Glass barely reflects the room: the picture is almost all its own light
  diffuseColor.rgb *= sampledDiffuseColor.rgb * crtShade(crtUv) * crtEdge * 0.08;
#endif`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#ifdef USE_EMISSIVEMAP
  vec3 crtPicture = texture2D(emissiveMap, clamp(crtUv, 0.0, 1.0)).rgb;
  totalEmissiveRadiance *= crtPicture * crtShade(crtUv) * crtEdge;
#endif`
      );
  };
  material.needsUpdate = true;
}

// How far the glow reaches past the screen, as a share of its size
const GLOW_SPREAD = 1.35;

// A soft halo of the picture's colours around and over the screen. Add it to the
// screen mesh: it shares the mesh's quad, scaled up a little and lifted off the glass.
export function createCrtGlow(screen: Mesh) {
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // The screen sits recessed behind its bezel; the glow has to reach over it
    depthTest: false,
    blending: AdditiveBlending,
    uniforms: {
      map: { value: null as Texture | null },
      uvTransform: { value: new Matrix3() },
      strength: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform mat3 uvTransform;
      uniform float strength;
      varying vec2 vUv;
      ${CRT_SHAPE}
      vec3 picture(vec2 uv, float blur) {
        vec2 p = (uvTransform * vec3(clamp(uv, 0.0, 1.0), 1.0)).xy;
        return textureLod(map, p, blur).rgb;
      }
      void main() {
        // Back to the picture's own 0-1 space, which covers the middle of this larger quad
        vec2 uv = (vUv - 0.5) * ${GLOW_SPREAD.toFixed(2)} + 0.5;
        // A heavily blurred picture, nearest edge colours carrying out past the glass
        vec3 colour = picture(uv, 5.0) * 0.6 + picture(uv, 3.5) * 0.4;
        vec2 outside = max(abs(uv - 0.5) - 0.5, 0.0);
        // Fades to nothing exactly at this quad's edge, so it has no visible border
        float reach = (${GLOW_SPREAD.toFixed(2)} - 1.0) / 2.0;
        float spill = pow(1.0 - smoothstep(0.0, reach, length(outside)), 2.0);
        // Over the glass itself, just a faint bloom
        float over = crtInside(crtWarp(uv));
        float amount = mix(spill * 0.32, 0.05, over);
        gl_FragColor = vec4(colour * amount * strength, 1.0);
      }
    `,
  });
  const glow = new Mesh(screen.geometry, material);
  glow.scale.setScalar(GLOW_SPREAD);
  // Just off the glass, along the quad's facing
  screen.geometry.computeBoundingSphere();
  const normal = screen.geometry.getAttribute("normal");
  if (normal) glow.position.set(normal.getX(0), normal.getY(0), normal.getZ(0)).multiplyScalar(0.006);
  glow.renderOrder = 1;
  screen.add(glow);

  return {
    setPicture(texture: Texture) {
      texture.updateMatrix();
      material.uniforms.map.value = texture;
      material.uniforms.uvTransform.value.copy(texture.matrix);
    },
    setStrength(value: number) {
      material.uniforms.strength.value = value;
    },
    dispose() {
      screen.remove(glow);
      material.dispose();
    },
  };
}
