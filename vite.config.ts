import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function manualChunks(id: string) {
  // Shared CJS helpers must not pull a lazy game engine into React's imports.
  if (id.includes('commonjsHelpers')) return 'vendor-commonjs'
  if (!id.includes('node_modules')) return undefined

  // Keep dependencies flowing into Three, avoiding renderer/core chunk cycles.
  if (id.includes('/three/')) {
    if (id.includes('/three/src/math/') || id.endsWith('/three/src/constants.js')) return 'vendor-three-math'
    if (id.includes('/shaders/ShaderChunk') || id.includes('/shaders/ShaderLib/')) return 'vendor-three-shaders'
    return 'vendor-three'
  }
  // Phaser's published ESM bundle is monolithic; split its source by subsystem.
  if (id.includes('/phaser/')) {
    if (id.includes('/physics/')) return 'vendor-phaser-physics'
    if (id.includes('/gameobjects/')) return 'vendor-phaser-objects'
    if (id.includes('/renderer/')) return 'vendor-phaser-renderer'
    if (/\/phaser\/src\/(math|geom|curves|utils)\//.test(id)) return 'vendor-phaser-math'
    if (/\/phaser\/src\/(input|loader|sound)\//.test(id)) return 'vendor-phaser-io'
    if (/\/phaser\/src\/(textures|display)\//.test(id)) return 'vendor-phaser-display'
    return 'vendor-phaser'
  }
  if (id.includes('/gsap/')) return 'vendor-animation'
  if (id.includes('/@use-gesture/')) return 'vendor-gesture'
  if (id.includes('/@supabase/') || id.includes('/@gotrue/') || id.includes('/@supabase-js/')) {
    return 'vendor-supabase'
  }
  if (id.includes('/@tanstack/')) return 'vendor-query'
  if (
    id.includes('/react/') ||
    id.includes('/react-dom/') ||
    id.includes('/react-router-dom/') ||
    id.includes('/react-router/') ||
    id.includes('/@remix-run/router/') ||
    id.includes('/scheduler/')
  ) {
    return 'vendor-react'
  }

  return undefined
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: 'phaser-build-flags',
      apply: 'build',
      enforce: 'pre',
      transform(code, id) {
        if (!id.includes('/node_modules/phaser/')) return undefined
        // Match Phaser's production webpack flags, including both renderers.
        return code.replace(/typeof (CANVAS_RENDERER|WEBGL_RENDERER|WEBGL_DEBUG|EXPERIMENTAL|PLUGIN_3D|PLUGIN_CAMERA3D|PLUGIN_FBINSTANT|FEATURE_SOUND)\b/g,
          (_, flag: string) => ['CANVAS_RENDERER', 'WEBGL_RENDERER', 'FEATURE_SOUND'].includes(flag) ? 'true' : 'false')
      },
    },
  ],
  resolve: {
    alias: [
      { find: /^three$/, replacement: 'three/src/Three.js' },
      // Dev's dependency optimizer uses the existing published Phaser bundle.
      ...(command === 'build' ? [{ find: /^phaser$/, replacement: 'phaser/src/phaser.js' }] : []),
    ],
  },
  build: {
    manifest: true,
    // Preserve Phaser's CommonJS initialization order across engine chunks.
    commonjsOptions: { strictRequires: true },
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
}))
