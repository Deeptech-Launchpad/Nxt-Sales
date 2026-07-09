import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Backend (incl. Google OAuth) is served under /api. /auth/callback is a
      // frontend route handled by the SPA, so it must NOT be proxied.
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
