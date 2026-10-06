// 把 BootUpdate（启动页版本检查/公告步骤）单独打成可在 Node 里挂载的 bundle，
// 供 verify-notice.mjs 做真实运行期验证。
// 与 build.mjs 同理：必须单独一个进程跑，vue 的 runtime-dom 在模块加载时就缓存 document。
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { writeFileSync } from 'node:fs'

writeFileSync(
  '.notice-entry.mjs',
  `export { default as BootUpdate } from './src/components/boot/BootUpdate.vue'\n` +
    `export { createApp, nextTick } from 'vue'\n` +
    `export { BOOT_CONFIG, NOTICE_KEY } from './src/config/boot.js'\n`
)

await build({
  configFile: false,
  logLevel: 'error',
  define: {
    'process.env.NODE_ENV': '"development"',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
  },
  build: {
    outDir: '.notice-out',
    emptyOutDir: true,
    minify: false,
    target: 'esnext',
    cssCodeSplit: false,
    lib: { entry: '.notice-entry.mjs', formats: ['es'], fileName: () => 'e.mjs' }
  },
  plugins: [vue()]
})
