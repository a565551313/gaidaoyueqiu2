import { createApp } from 'vue'
import AdminApp from './AdminApp.vue'
import './admin.css'

// 运营后台入口（admin.html）。与 lab.html 同模式：
// 开发时 `npm run dev` 访问 /admin.html；不进生产构建（vite.config 只打包 index.html）。
// 生产部署时按 docs/ADMIN_SETUP.md 的说明把 admin.html 加进构建输入即可。
createApp(AdminApp).mount('#admin-root')
