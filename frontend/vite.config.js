import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // API calls → backend
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Only proxy /auth/google and /auth/google/callback to backend.
      // Do NOT proxy /auth/callback — that is a React route handled by React Router.
      '/auth/google': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/auth/me': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/auth/logout': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/detections': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
