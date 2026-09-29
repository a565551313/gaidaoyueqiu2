<template>
  <div class="screen menu">
    <div class="hero card">
      <HeroArt />
      <div class="hero-title">
        <h1>盖到月球<span class="two">2</span></h1>
        <p class="subtitle">一层一层，盖到月球上去</p>
      </div>
    </div>

    <div class="stats-row">
      <div class="pill">
        <span class="coin-dot"></span>{{ store.coins }}
      </div>
      <div class="pill">
        <StarIcon :size="15" /> {{ totalStars }} / {{ TOTAL_STARS }}
      </div>
      <button class="icon-btn" @click="toggleSound" :aria-label="store.settings.sound ? '关闭音效和音乐' : '开启音效和音乐'">
        <SoundIcon :on="store.settings.sound" />
      </button>
    </div>

    <div class="menu-buttons">
      <button class="btn btn-primary btn-lg btn-block" @click="tap('levels')">
        <PlayIcon /> 开始游戏
      </button>
      <div class="menu-grid">
        <button class="btn btn-ghost" @click="tap('shop')"><BagIcon /> 商店</button>
        <button class="btn btn-ghost" @click="tap('skills')"><SkillIcon /> 技能学院</button>
      </div>
      <button class="btn btn-ghost btn-block" @click="showHelp = true"><HelpIcon /> 玩法说明</button>
    </div>

    <div class="theme-row card">
      <span class="theme-label">主题</span>
      <div class="theme-seg">
        <button
          v-for="opt in themes"
          :key="opt.id"
          class="seg-btn"
          :class="{ active: store.settings.theme === opt.id }"
          @click="setTheme(opt.id)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <transition name="pop">
      <div v-if="showHelp" class="overlay" @click.self="showHelp = false">
        <div class="modal help-modal">
          <h2>玩法说明</h2>
          <div class="help-body scroll">
            <p><b>目标：</b>楼层左右移动，点击画面或按空格让它落到上一层，一路盖到月球。</p>
            <p><b>完美：</b>中心几乎对齐即判定“完美”，宽度不减少；连续完美会累积连击，每 3 连击恢复部分宽度。</p>
            <p><b>切除：</b>没对齐时只保留重叠部分，其余被切掉；完全没重叠则失败。</p>
            <p><b>充能：</b>亲手落层积攒充能，充满后点右下角火焰按钮释放“烈焰三连叠”，连叠 3 层且不会失败。</p>
            <p><b>道具：</b>复活、自动、双倍金币、慢慢、加宽、护盾、连击保护，用金币在商店购买。</p>
            <p><b>材质：</b>在商店的建筑材质分类中永久解锁并装备，不同材质可以针对打滑、强风、碎裂或雷劈提供帮助。</p>
            <p><b>技能：</b>在技能学院用金币永久升级 8 项能力。</p>
            <p><b>星级：</b>通关按得分给 1~3 星，得分越接近满分星越多。</p>
          </div>
          <button class="btn btn-primary btn-block" @click="showHelp = false">我知道了</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import HeroArt from './HeroArt.vue'
import { useStore, actions } from '../core/store.js'
import { TOTAL_STARS } from '../data/levels.js'
import { Audio } from '../core/audio.js'
import { StarIcon, SoundIcon, PlayIcon, BagIcon, SkillIcon, HelpIcon } from './icons.js'

const emit = defineEmits(['nav'])
const store = useStore()
const showHelp = ref(false)

const totalStars = computed(() => actions.totalStars())

const themes = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' }
]

function tap(name) {
  Audio.click()
  emit('nav', name)
}
function toggleSound() {
  actions.setSound(!store.settings.sound)
  Audio.click()
}
function setTheme(t) {
  actions.setTheme(t)
  Audio.click()
}
</script>

<style scoped>
.menu {
  gap: 16px;
  overflow-y: auto;
}
.hero {
  position: relative;
  height: 40vh;
  min-height: 260px;
  max-height: 360px;
  overflow: hidden;
  flex-shrink: 0;
}
.hero-title {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 16px;
  text-align: center;
  pointer-events: none;
}
.hero-title h1 {
  margin: 0;
  font-size: 40px;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 3px 16px rgba(0, 0, 0, 0.45);
  letter-spacing: 2px;
}
.hero-title .two {
  color: var(--gold);
  margin-left: 2px;
}
.subtitle {
  margin: 4px 0 0;
  color: rgba(255, 255, 255, 0.92);
  font-size: 15px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.stats-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.stats-row .icon-btn {
  margin-left: auto;
}

.menu-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}
.menu-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.theme-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  flex-shrink: 0;
}
.theme-label {
  font-weight: 700;
  color: var(--text-soft);
}
.theme-seg {
  margin-left: auto;
  display: flex;
  background: var(--panel);
  border-radius: 999px;
  padding: 3px;
  border: 1px solid var(--panel-border);
}
.seg-btn {
  padding: 7px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-soft);
}
.seg-btn.active {
  background: linear-gradient(135deg, var(--primary-2), var(--primary));
  color: #fff;
}

.help-modal h2 {
  margin: 0 0 12px;
}
.help-body {
  max-height: 50vh;
  margin-bottom: 14px;
}
.help-body p {
  margin: 0 0 12px;
  line-height: 1.6;
  font-size: 15px;
  color: var(--text);
}
.help-body b {
  color: var(--primary);
}
</style>
