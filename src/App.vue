<template>
  <transition name="fade" mode="out-in">
    <MainMenu
      v-if="route.name === 'menu'"
      key="menu"
      @nav="go"
    />
    <ChapterSelect
      v-else-if="route.name === 'chapters'"
      key="chapters"
      @nav="go"
      @select-chapter="selectChapter"
    />
    <LevelSelect
      v-else-if="route.name === 'levels'"
      key="levels"
      :chapter-id="route.chapterId"
      @nav="go"
      @play="startPrep"
    />
    <Shop v-else-if="route.name === 'shop'" key="shop" @nav="go" />
    <Codex v-else-if="route.name === 'codex'" key="codex" @nav="go" />
    <Inventory v-else-if="route.name === 'inventory'" key="inventory" @nav="go" />
    <PetCenter v-else-if="route.name === 'pets'" key="pets" @nav="go" />
    <SkillAcademy v-else-if="route.name === 'skills'" key="skills" @nav="go" />
    <Leaderboard v-else-if="route.name === 'leaderboard'" key="leaderboard" @nav="go" />
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
import { reactive, onMounted } from 'vue'
import MainMenu from './components/MainMenu.vue'
import ChapterSelect from './components/ChapterSelect.vue'
import Codex from './components/Codex.vue'
import LevelSelect from './components/LevelSelect.vue'
import Shop from './components/Shop.vue'
import Inventory from './components/Inventory.vue'
import PetCenter from './components/PetCenter.vue'
import SkillAcademy from './components/SkillAcademy.vue'
import Leaderboard from './components/Leaderboard.vue'
import GameView from './components/GameView.vue'
import { useStore } from './core/store.js'
import { CHAPTER, getChapterForLevel } from './data/levels.js'
import { Audio } from './core/audio.js'

const store = useStore()
const route = reactive({ name: 'menu', levelId: 1, chapterId: CHAPTER.id })

function go(name, chapterId) {
  if (chapterId) route.chapterId = chapterId
  route.name = name
}
function selectChapter(chapterId) {
  route.chapterId = chapterId
  route.name = 'levels'
}
function startPrep(levelId) {
  route.levelId = levelId
  route.chapterId = getChapterForLevel(levelId).id
  route.name = 'game'
}

// The game uses a fixed dark palette.
function applyTheme() {
  document.documentElement.setAttribute('data-theme', 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', '#10142e')
}

onMounted(() => {
  Audio.init(store.settings.musicOn, store.settings.sfxOn, store.settings.musicVolume, store.settings.effectsVolume)
  applyTheme()
  // 首次交互解锁音频
  const unlock = () => {
    Audio.unlock()
    Audio.startMusic('menu')
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

</script>
