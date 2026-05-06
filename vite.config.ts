import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function manualChunks(id: string) {
  if (!id.includes('node_modules')) return undefined

  if (id.includes('/three/')) return 'vendor-three'
  if (id.includes('/gsap/')) return 'vendor-animation'
  if (id.includes('/@use-gesture/')) return 'vendor-gesture'
  if (id.includes('/framer-motion/') || id.includes('/motion-dom/') || id.includes('/motion-utils/')) {
    return 'vendor-motion'
  }
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
  if (id.includes('/react-icons/')) return 'vendor-icons'

  return undefined
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
})
