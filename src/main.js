import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { loadFloorTextures } from './core/floorTextures.js'

// 楼层 Kenney 贴图后台预载；进游戏前一般已就绪，未就绪时楼层走旧纹理兜底
loadFloorTextures()

createApp(App).mount('#app')
