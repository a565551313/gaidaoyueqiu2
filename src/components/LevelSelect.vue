<template>
  <div class="screen game-menu-screen level-screen">
    <div class="title-bar">
      <button class="icon-btn" @click="back"><BackIcon /></button>
      <h2>远征地图</h2>
      <div class="pill" style="margin-left:auto"><span class="coin-dot"></span>{{ store.coins }}</div>
    </div>

    <div class="page-context">
      <span class="page-kicker">登月路线</span>
      <b>选择你的下一段旅程</b>
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

<style scoped>
/* Expedition chart: mission rows read as a navigation console, not generic cards. */
.level-screen { background: radial-gradient(circle at 84% 14%, rgba(69,205,255,.16), transparent 28%), linear-gradient(180deg,#061a31,#030711 72%); }
.level-screen::after { content:'LUNAR ROUTE // SECTOR 01'; position:absolute; top:86px; right:18px; color:#63dfff55; font:900 9px/1 'Trebuchet MS'; letter-spacing:.2em; writing-mode:vertical-rl; pointer-events:none; }
.level-list { position:relative; padding:10px 0 28px 10px; gap:14px; }
.level-list::before { content:''; position:absolute; left:31px; top:20px; bottom:28px; width:1px; background:linear-gradient(#64e5ff88,#64e5ff12); }
.level-card { min-height:104px; position:relative; padding:13px 12px 13px 0; background:linear-gradient(100deg,rgba(9,39,67,.96),rgba(5,15,32,.96)); border:1px solid rgba(102,225,255,.34); border-left:3px solid rgba(91,218,255,.62); clip-path:polygon(0 0,calc(100% - 13px) 0,100% 13px,100% 100%,0 100%); box-shadow:0 12px 24px #0008,inset 0 1px #fff2; }
.level-card::before { content:''; position:absolute; left:-13px; top:38px; width:17px; height:17px; border:2px solid #61e2ff; background:#07182c; transform:rotate(45deg); z-index:2; }
.level-card.locked { background:linear-gradient(100deg,rgba(25,28,53,.84),rgba(8,11,23,.92)); border-left-color:#7a6d9a; }
.level-card.locked::before { border-color:#716a92; }
.lv-badge { width:58px; height:58px; margin-left:4px; border-radius:3px; clip-path:polygon(0 0,84% 0,100% 16%,100% 100%,0 100%); box-shadow:0 0 18px rgba(70,210,255,.3); }
.lv-info { padding-left:2px; }
.lv-name { font-size:18px; letter-spacing:.08em; text-transform:uppercase; }
.lv-meta { color:#8dc8df; }
.lv-stars { filter:drop-shadow(0 0 5px rgba(255,210,100,.35)); }
.lv-go { color:#ffd467; padding-right:4px; }
</style>
