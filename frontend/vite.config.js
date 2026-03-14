import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /api requests to the backend server running on localhost:5001
    // This allows the frontend to call /api/analyze which gets forwarded to the backend
    // Fixes local development when not using Netlify dev
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})
