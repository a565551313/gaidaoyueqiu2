import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      // 只打包游戏本体。lab.html 是美术检阅台，纯开发工具，
      // 开发时 `npm run dev` 访问 /lab.html 即可，不随生产产物发布。
      input: { main: 'index.html' }
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
