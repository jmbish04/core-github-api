import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@diceui/timeline": path.resolve(__dirname, "./src/components/ui/diceui/timeline.tsx"),
      "@diceui/kanban": path.resolve(__dirname, "./src/components/ui/diceui/kanban.tsx"),
      "@diceui/stat": path.resolve(__dirname, "./src/components/ui/diceui/stat.tsx"),
      "@db": path.resolve(__dirname, "../backend/src/db"),
      "@api": path.resolve(__dirname, "../backend/src"),
    },
  },
  build: {
    outDir: '../../public', // Build to the worker's public directory
    emptyOutDir: true
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787', // Worker local dev address
        changeOrigin: true,
      },
      '/tools': { // Also proxy tools if needed, though they might be under /api
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
})
