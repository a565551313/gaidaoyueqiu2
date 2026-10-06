import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { preloadSpritePacks } from './core/spritePacks.js'
import { useStore, actions } from './core/store.js'
import { setCloudHook } from './core/storage.js'
import { CloudSync } from './core/cloud/index.js'

// 楼层 Kenney 贴图后台预载；进游戏前一般已就绪，未就绪时楼层走旧纹理兜底
// 第二批：粒子 / 飞行物 / 星空精灵后台预载，未就绪时走程序化兜底
// 启动链路（2026-10-06 第一批）：预载改由启动页驱动并显示真实进度（BootUpdate），
// 这里保留兜底调用（链路异常中断时也保证资源就绪）
preloadSpritePacks()

// 云端同步（Phase 1 + 启动链路）：本地 localStorage 永远是同步源（离线可玩）。
// main.js 只做接线（wire），连接与登录由启动链路显式驱动：
// 更新页 connect → 登录页 guest/login/register/upgrade；「离线继续」= 不连接。
// 未配置 Supabase 环境变量时自动落到本地模拟模式。
const store = useStore()
setCloudHook(() => CloudSync.enqueue())
CloudSync.wire({
  getLocal: () => store,
  applyMerged: (data) => actions.hydrate(data)
})

createApp(App).mount('#app')
