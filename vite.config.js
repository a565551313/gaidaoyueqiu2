import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // 允许 e2b 预览域名访问
    allowedHosts: true,
    hmr: { clientPort: 443 }
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true
  }
})
