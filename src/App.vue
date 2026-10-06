<template>
  <!-- 启动链路（docs/BOOT_FLOW_DESIGN.md）：LOGO → 检查更新 → 选服 → 登录/注册 → 主菜单 -->
  <SplashScreen
    v-if="boot.phase === 'splash'"
    :duration="splashDuration"
    @done="boot.phase = 'update'"
  />
  <BootUpdate
    v-else-if="boot.phase === 'update'"
    @ready="onUpdateReady"
    @offline="bootDone"
    @select-server="boot.phase = 'server'"
  />
  <ServerSelect
    v-else-if="boot.phase === 'server'"
    :can-cancel="boot.launched"
    @chosen="boot.phase = 'update'"
    @cancel="bootDone"
    @offline="bootDone"
  />
  <AuthScreen
    v-else-if="boot.phase === 'auth'"
    :can-cancel="boot.launched"
    @done="bootDone"
    @cancel="bootDone"
    @offline="bootDone"
  />

  <transition v-else name="fade" mode="out-in">
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
import SplashScreen from './components/boot/SplashScreen.vue'
import BootUpdate from './components/boot/BootUpdate.vue'
import ServerSelect from './components/boot/ServerSelect.vue'
import AuthScreen from './components/boot/AuthScreen.vue'
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
import { CloudSync } from './core/cloud/index.js'
import { BOOT_CONFIG } from './config/boot.js'
import { Audio } from './core/audio.js'

const store = useStore()
const route = reactive({ name: 'menu', levelId: 1, chapterId: CHAPTER.id })

// —— 启动链路状态机（splash → update → server → auth → done，docs/BOOT_FLOW_DESIGN.md）——
// launched = 已经进过主菜单（从设置重进链路），决定各页返回按钮是否显示
const boot = reactive({ phase: 'splash', launched: false })
// 回访（本机已有存档或云端会话记忆）LOGO 时长更短，保证回访 <3s 进主菜单
const RETURNING_KEYS = ['gaidaoyueqiu2:save:v1', 'gaidaoyueqiu2:cloud-mock:v1']
const isReturning = RETURNING_KEYS.some((k) => {
  try { return !!localStorage.getItem(k) } catch { return false }
})
const splashDuration = isReturning ? BOOT_CONFIG.splashMsReturning : BOOT_CONFIG.splashMsFirst

function bootDone() {
  boot.launched = true
  boot.phase = 'done'
}

function onUpdateReady(payload) {
  if (payload?.hasSession) bootDone()
  else boot.phase = 'auth'
}

function go(name, chapterId) {
  if (name === 'relogin') {
    // 设置页「切换账号/服务器」：登出当前会话，回启动链路的选服页
    CloudSync.logout()
    boot.phase = 'server'
    return
  }
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
