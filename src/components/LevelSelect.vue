<template>
  <div class="screen">
    <div class="title-bar">
      <button class="icon-btn" @click="back"><BackIcon /></button>
      <h2>选择关卡</h2>
      <div class="pill" style="margin-left:auto"><span class="coin-dot"></span>{{ store.coins }}</div>
    </div>

    <div class="scroll level-list">
      <div
        v-for="lv in LEVELS"
        :key="lv.id"
        class="level-card card"
        :class="{ locked: !unlocked(lv.id) }"
        @click="pick(lv)"
      >
        <div class="lv-badge" :style="badgeStyle(lv)">
          <span v-if="unlocked(lv.id)">{{ lv.id }}</span>
          <LockIcon v-else :size="22" />
        </div>
        <div class="lv-info">
          <div class="lv-name">{{ lv.name }}</div>
          <div class="lv-meta text-soft">
            目标 {{ lv.target }} 层 · 速度 {{ speedTag(lv.speed) }}
          </div>
          <div class="lv-stars">
            <StarIcon
              v-for="n in 3"
              :key="n"
              :size="18"
              :filled="(store.stars[lv.id] || 0) >= n"
              :style="{ color: (store.stars[lv.id] || 0) >= n ? 'var(--gold)' : 'var(--panel-border)' }"
            />
          </div>
        </div>
        <div class="lv-go">
          <PlayIcon v-if="unlocked(lv.id)" :size="20" />
          <span v-else class="lock-text">未解锁</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useStore } from '../core/store.js'
import { LEVELS } from '../data/levels.js'
import { Audio } from '../core/audio.js'
import { BackIcon, StarIcon, LockIcon, PlayIcon } from './icons.js'

const emit = defineEmits(['nav', 'play'])
const store = useStore()

function unlocked(id) {
  return id <= store.unlocked
}
function back() {
  Audio.click()
  emit('nav', 'menu')
}
function pick(lv) {
  if (!unlocked(lv.id)) return
  Audio.click()
  emit('play', lv.id)
}
function speedTag(s) {
  if (s <= 160) return '慢'
  if (s <= 200) return '中'
  if (s <= 240) return '快'
  return '极快'
}
function badgeStyle(lv) {
  const hue = (200 + lv.id * 22) % 360
  return { background: `linear-gradient(135deg, hsl(${hue},70%,66%), hsl(${hue},65%,48%))` }
}
</script>

<style scoped>
.level-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.level-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  transition: transform 0.08s;
}
.level-card:active {
  transform: scale(0.985);
}
.level-card.locked {
  opacity: 0.55;
  filter: grayscale(0.6);
}
.lv-badge {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 24px;
  font-weight: 900;
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
}
.lv-info {
  flex: 1;
  min-width: 0;
}
.lv-name {
  font-size: 18px;
  font-weight: 800;
}
.lv-meta {
  font-size: 13px;
  margin: 3px 0 6px;
}
.lv-stars {
  display: flex;
  gap: 3px;
}
.lv-go {
  color: var(--primary);
  flex-shrink: 0;
}
.lock-text {
  font-size: 12px;
  color: var(--text-soft);
}
</style>
