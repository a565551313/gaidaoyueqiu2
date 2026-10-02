import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      // 游戏本体 index.html + 美术预览 lab.html（预览页不影响游戏打包产物）
      input: { main: 'index.html', lab: 'lab.html' }
    }
  },
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
