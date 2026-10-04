import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { preloadSpritePacks } from './core/spritePacks.js'

// 楼层 Kenney 贴图后台预载；进游戏前一般已就绪，未就绪时楼层走旧纹理兜底
// 第二批：粒子 / 飞行物 / 星空精灵后台预载，未就绪时走程序化兜底
preloadSpritePacks()

createApp(App).mount('#app')
