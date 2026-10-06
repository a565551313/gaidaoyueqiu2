// 把管理后台打成一个可被 Node 检查的 bundle（admin.html 不进生产构建，
// 这里用与 uiflow/build.mjs 相同的方法做 SFC 编译校验）。必须单独进程跑。
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { writeFileSync } from 'node:fs'

writeFileSync('.admin-entry.mjs', `import './src/admin/main.js'\n`)
await build({
  configFile: false, logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"', __VUE_PROD_DEVTOOLS__: 'false', __VUE_OPTIONS_API__: 'true', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  build: {
    outDir: '.admin-out', emptyOutDir: true, minify: false, target: 'esnext', cssCodeSplit: false,
    lib: { entry: '.admin-entry.mjs', formats: ['es'], fileName: () => 'e.mjs' }
  },
  plugins: [vue()]
})
