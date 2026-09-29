<template>
  <transition name="fade" mode="out-in">
    <MainMenu
      v-if="route.name === 'menu'"
      key="menu"
      @nav="go"
    />
    <LevelSelect
      v-else-if="route.name === 'levels'"
      key="levels"
      @nav="go"
      @play="startPrep"
    />
    <Shop v-else-if="route.name === 'shop'" key="shop" @nav="go" />
    <SkillAcademy v-else-if="route.name === 'skills'" key="skills" @nav="go" />
    <GameView
      v-else-if="route.name === 'game'"
      :key="`game-${route.levelId}`"
      :level-id="route.levelId"
      @nav="go"
      @play="startPrep"
    />
  </transition>
</template>

<script setup>
import { reactive, onMounted, watch, onBeforeUnmount } from 'vue'
import MainMenu from './components/MainMenu.vue'
import LevelSelect from './components/LevelSelect.vue'
import Shop from './components/Shop.vue'
import SkillAcademy from './components/SkillAcademy.vue'
import GameView from './components/GameView.vue'
import { useStore } from './core/store.js'
import { Audio } from './core/audio.js'

const store = useStore()
const route = reactive({ name: 'menu', levelId: 1 })

function go(name) {
  route.name = name
}
function startPrep(levelId) {
  route.levelId = levelId
  route.name = 'game'
}

// ---- 主题应用 ----
let media = null
function resolveTheme() {
  const t = store.settings.theme
  if (t === 'system') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    return prefersDark ? 'dark' : 'light'
  }
  return t
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', resolveTheme())
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolveTheme() === 'dark' ? '#10142e' : '#6a5bff')
}

watch(() => store.settings.theme, applyTheme)

onMounted(() => {
  Audio.init(store.settings.sound)
  applyTheme()
  media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')
  if (media && media.addEventListener) {
    media.addEventListener('change', applyTheme)
  }
  // 首次交互解锁音频
  const unlock = () => {
    Audio.unlock()
    Audio.startMusic()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  // 阻止双击缩放
  document.addEventListener(
    'dblclick',
    (e) => {
      e.preventDefault()
    },
    { passive: false }
  )
})

onBeforeUnmount(() => {
  if (media && media.removeEventListener) media.removeEventListener('change', applyTheme)
})
</script>
