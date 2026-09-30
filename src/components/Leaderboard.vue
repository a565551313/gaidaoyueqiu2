<template>
  <div class="screen game-menu-screen leaderboard-screen">
    <div class="title-bar">
      <button class="icon-btn" aria-label="返回首页" @click="back"><BackIcon /></button>
      <h2>远征排行榜</h2>
      <span class="season-mark">SEASON 01</span>
    </div>

    <div class="page-context">
      <span class="page-kicker">登月积分榜</span>
      <b>与远征者一较高下</b>
    </div>

    <div class="board-note"><span class="signal-dot"></span>本地榜单预览 · 線上排名即将开放</div>

    <div class="podium" aria-label="前三名">
      <div v-for="entry in podium" :key="entry.name" class="podium-place" :class="`place-${entry.rank}`">
        <span class="podium-medal">{{ entry.rank }}</span>
        <b>{{ entry.name }}</b>
        <small>{{ entry.score.toLocaleString() }} 分</small>
      </div>
    </div>

    <div class="board-heading"><b>远征者</b><span>最高纪录</span></div>
    <div class="scroll ranking-list">
      <div v-for="entry in rankings" :key="entry.rank" class="rank-row" :class="{ 'player-row': entry.player }">
        <span class="rank-number">{{ String(entry.rank).padStart(2, '0') }}</span>
        <span class="pilot-mark" :class="`pilot-${entry.color}`">{{ entry.name.slice(0, 1) }}</span>
        <span class="pilot-name">{{ entry.name }}<small v-if="entry.player">我的记录</small></span>
        <b class="pilot-score">{{ entry.score.toLocaleString() }}</b>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useStore, actions } from '../core/store.js'
import { Audio } from '../core/audio.js'
import { BackIcon } from './icons.js'

const emit = defineEmits(['nav'])
const store = useStore()
const samplePilots = [
  { name: '星际面包', score: 18640, color: 'gold' },
  { name: '月兔号', score: 17280, color: 'mint' },
  { name: '轨道漫游者', score: 15950, color: 'rose' },
  { name: '小行星矿工', score: 14220, color: 'blue' },
  { name: '云端搭建师', score: 12880, color: 'violet' },
  { name: '火箭邮差', score: 11530, color: 'mint' },
  { name: '环形山专家', score: 9800, color: 'rose' },
  { name: '银河旅人', score: 8640, color: 'blue' }
]
const playerScore = computed(() => Math.max(0, (store.unlocked - 1) * 1000 + actions.totalStars() * 250))
const rankings = computed(() => [
  ...samplePilots.map((pilot) => ({ ...pilot, player: false })),
  { name: '你', score: playerScore.value, color: 'player', player: true }
].sort((a, b) => b.score - a.score).map((entry, index) => ({ ...entry, rank: index + 1 })))
const podium = computed(() => [rankings.value[1], rankings.value[0], rankings.value[2]])

function back() {
  Audio.click()
  emit('nav', 'menu')
}
</script>

<style scoped>
.leaderboard-screen{gap:0;overflow:hidden}
.title-bar h2{flex:1}
.season-mark{color:#ffd36b;font-size:10px;font-weight:900;letter-spacing:1px}
.page-context{padding-top:18px}
.board-note{display:flex;align-items:center;gap:8px;min-height:36px;color:var(--text-soft);font-size:12px;font-weight:700}
.signal-dot{width:8px;height:8px;border-radius:50%;background:#e8a34f;box-shadow:0 0 9px rgba(232,163,79,.6)}
.podium{display:grid;grid-template-columns:1fr 1.1fr 1fr;align-items:end;gap:8px;min-height:156px;padding:12px 4px 18px;border-bottom:1px solid rgba(255,224,162,.2)}
.podium-place{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;min-width:0;padding:12px 4px 10px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(0,0,0,.15));border-top:2px solid #7e9a90;color:#fff1d1;text-align:center;overflow:hidden}
.place-1{min-height:122px;border-color:#ffd36b;background:linear-gradient(180deg,rgba(227,174,78,.22),rgba(0,0,0,.17))}.place-2{min-height:98px;border-color:#aab9c0}.place-3{min-height:82px;border-color:#ca8d62}
.podium-medal{width:26px;height:26px;display:grid;place-items:center;color:#372719;background:#ffd36b;border-radius:50%;font-size:13px;font-weight:1000}.place-2 .podium-medal{background:#b9c5c7}.place-3 .podium-medal{background:#ce966e}
.podium-place b{max-width:100%;font-size:12px;text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.podium-place small{color:var(--text-soft);font-size:10px;font-weight:800}
.board-heading{display:flex;justify-content:space-between;padding:14px 8px 7px;color:var(--text-soft);font-size:12px;font-weight:900}
.ranking-list{margin:0 -2px;padding:0 2px}
.rank-row{display:flex;align-items:center;gap:11px;min-height:56px;padding:6px 9px;border-bottom:1px solid rgba(255,224,162,.12)}
.player-row{background:rgba(74,183,148,.12);border-left:2px solid #67d0a4}
.rank-number{width:24px;color:var(--text-soft);font-size:12px;font-weight:900;text-align:center}
.pilot-mark{width:34px;height:34px;display:grid;place-items:center;color:#fff;font-size:14px;font-weight:900;border-radius:50%;background:#318b8d}.pilot-gold{background:#aa7e36}.pilot-rose{background:#a64e5d}.pilot-blue{background:#4c72a8}.pilot-violet{background:#7664a3}.pilot-player{background:#258d6b}
.pilot-name{display:flex;flex:1;align-items:center;gap:7px;min-width:0;color:var(--text);font-size:14px;font-weight:800}.pilot-name small{color:#77d6aa;font-size:10px;white-space:nowrap}.pilot-score{color:#ffd36b;font-size:14px;font-variant-numeric:tabular-nums}
</style>
