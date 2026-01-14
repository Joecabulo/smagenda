import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const basePath = mode === 'production' ? '/142555787po/' : '/'
  return {
    base: basePath,
    plugins: [react()],
    build: {
      outDir: '../dist/142555787po',
      emptyOutDir: false,
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8787',
          changeOrigin: true,
        },
      },
    },
  }
})
