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
      // Team Chat real-time layer (Update 3) — needs the websocket upgrade
      // proxied too, not just plain HTTP.
      '/socket.io': { target: 'http://localhost:4000', changeOrigin: true, ws: true },
      // Chat file attachments (Update 3 / E5) — served back read-only from the backend.
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
