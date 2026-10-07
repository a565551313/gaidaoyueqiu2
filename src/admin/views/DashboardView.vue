<template>
  <section class="ad-page dashboard-page">
    <header class="ad-page-head">
      <h2>仪表盘</h2>
      <button class="ad-btn" :disabled="loading" @click="load">{{ loading ? '刷新中…' : '刷新数据' }}</button>
    </header>

    <AdminError :error="error" context="读取仪表盘数据" />

    <div v-if="loading && !data" class="ad-panel ad-empty" role="status">正在汇总玩家和对局数据…</div>
    <div v-else-if="!data" class="ad-list-empty">
      <p>暂时没有可显示的数据，请刷新后重试。</p>
      <button class="ad-btn" :disabled="loading" @click="load">{{ loading ? '读取中…' : '重新读取' }}</button>
    </div>

    <template v-else>
      <div class="ad-cards">
        <div class="ad-card"><small>玩家数量</small><b>{{ Number(data.playerCount || 0).toLocaleString() }} 人</b></div>
        <div class="ad-card"><small>对局记录</small><b>{{ Number(data.resultCount || 0).toLocaleString() }} 局</b></div>
        <div class="ad-card"><small>玩家持有金币</small><b>{{ Number(data.totalCoins || 0).toLocaleString() }} 金币</b></div>
      </div>

      <div class="ad-grid-2">
        <div class="ad-panel">
          <h3>高分榜 · 前五名</h3>
          <ol class="ad-top">
            <li v-for="row in data.top || []" :key="row.playerId">
              <span>{{ row.name }}</span>
              <b>{{ Number(row.score).toLocaleString() }} 分</b>
            </li>
            <li v-if="!data.top?.length" class="ad-empty">还没有榜单记录，玩家完成一局后会显示在这里。</li>
          </ol>
        </div>
        <div class="ad-panel">
          <h3>最近对局</h3>
          <ul class="ad-recent">
            <li v-for="(row, i) in data.recent || []" :key="i">
              <span>{{ row.player }}</span>
              <small>第 {{ row.levelId }} 关 · {{ row.stars }} 星 · {{ formatTime(row.at) }}</small>
              <b>{{ Number(row.score).toLocaleString() }} 分</b>
            </li>
            <li v-if="!data.recent?.length" class="ad-empty">还没有对局记录，玩家完成一局后点击刷新查看。</li>
          </ul>
        </div>
      </div>

      <p class="ad-note">{{ isMock ? '本地模拟与同一浏览器中的游戏共用玩家数据；完成一局后刷新即可查看。' : '此处汇总云端玩家与对局数据；玩家完成一局后刷新即可查看。' }}</p>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { adminState, fetchDashboard } from '../api.js'
import AdminError from '../components/AdminError.vue'

const data = ref(null)
const loading = ref(true)
const error = ref('')
const isMock = computed(() => adminState.mode !== 'supabase')

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await fetchDashboard()
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}
function formatTime(at) {
  if (!at) return '—'
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
onMounted(load)
</script>

<style scoped>
.dashboard-page { max-width: 1120px; }
@media (max-width: 768px) {
  .dashboard-page .ad-recent li { align-items: flex-start; }
  .dashboard-page .ad-recent li small { width: 100%; margin: 0; text-align: left; }
}
</style>
