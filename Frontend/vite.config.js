import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/ws/chat': { target: backend, changeOrigin: true, ws: true },
        '/chat':    { target: backend, changeOrigin: true },
        '/ingest':  { target: backend, changeOrigin: true },
        '/health':  { target: backend, changeOrigin: true }
      }
    }
  }
})
