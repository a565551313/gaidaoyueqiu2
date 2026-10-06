import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { preloadSpritePacks } from './core/spritePacks.js'
import { useStore, actions } from './core/store.js'
import { setCloudHook } from './core/storage.js'
import { CloudSync } from './core/cloud/index.js'

// 楼层 Kenney 贴图后台预载；进游戏前一般已就绪，未就绪时楼层走旧纹理兜底
// 第二批：粒子 / 飞行物 / 星空精灵后台预载，未就绪时走程序化兜底
preloadSpritePacks()

// 云端同步（Phase 1，docs/ADMIN_DESIGN.md）：本地 localStorage 永远是同步源（离线可玩），
// 云端按 LWW + 保底字段合并。未配置 Supabase 环境变量时自动落到本地模拟模式。
// init 是异步的、不 await：不阻塞首屏，失败静默降级为纯本地。
const store = useStore()
setCloudHook(() => CloudSync.enqueue())
CloudSync.init({
  getLocal: () => store,
  applyMerged: (data) => actions.hydrate(data)
})

createApp(App).mount('#app')
