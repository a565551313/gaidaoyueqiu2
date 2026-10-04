// 把整个 App 打成一个可在 Node 里挂载的 bundle，供 verify-ui-flow.mjs 使用。
// 必须单独一个进程跑：vite 会先加载 vue 的 runtime-dom，它在模块加载时就把
// document 缓存成 null，之后再注入 jsdom 也救不回来。
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { writeFileSync } from 'node:fs'
writeFileSync('.uiflow-entry.mjs', `export { default as App } from './src/App.vue'\nexport { createApp, nextTick } from 'vue'\n`)
await build({
  configFile:false, logLevel:'error',
  define: { 'process.env.NODE_ENV': '"development"', __VUE_PROD_DEVTOOLS__:'false', __VUE_OPTIONS_API__:'true', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false' },
  build:{
    outDir:'.uiflow-out', emptyOutDir:true, minify:false, target:'esnext', cssCodeSplit:false,
    lib:{ entry:'.uiflow-entry.mjs', formats:['es'], fileName:()=>'e.mjs' }
  },
  plugins:[vue()]
})

