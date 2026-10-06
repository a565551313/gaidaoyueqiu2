<template>
  <section class="ad-page">
    <header class="ad-page-head">
      <h2>仪表盘</h2>
      <button class="ad-btn" :disabled="loading" @click="load">{{ loading ? '刷新中…' : '刷新' }}</button>
    </header>

    <p v-if="error" class="ad-error">{{ error }}</p>

    <div class="ad-cards">
      <div class="ad-card">
        <small>玩家数</small>
        <b>{{ data?.playerCount ?? '—' }}</b>
      </div>
      <div class="ad-card">
        <small>对局记录</small>
        <b>{{ data?.resultCount ?? '—' }}</b>
      </div>
      <div class="ad-card">
        <small>玩家持有金币合计</small>
        <b>{{ data ? Number(data.totalCoins).toLocaleString() : '—' }}</b>
      </div>
    </div>

    <div class="ad-grid-2">
      <div class="ad-panel">
        <h3>榜单 Top 5</h3>
        <ol class="ad-top">
          <li v-for="row in data?.top || []" :key="row.playerId">
            <span>{{ row.name }}</span>
            <b>{{ Number(row.score).toLocaleString() }}</b>
          </li>
          <li v-if="!data?.top?.length" class="ad-empty">暂无数据</li>
        </ol>
      </div>
      <div class="ad-panel">
        <h3>最近对局</h3>
        <ul class="ad-recent">
          <li v-for="(row, i) in data?.recent || []" :key="i">
            <span>{{ row.player }}</span>
            <small>第 {{ row.levelId }} 关 · {{ row.stars }}★ · {{ formatTime(row.at) }}</small>
            <b>{{ Number(row.score).toLocaleString() }}</b>
          </li>
          <li v-if="!data?.recent?.length" class="ad-empty">暂无数据 —— 去玩一关再回来看</li>
        </ul>
      </div>
    </div>

    <p class="ad-note">
      本地模拟模式下，这里的玩家/对局数据与右侧同时打开的游戏页面共用同一份本机数据：
      玩一关 → 点刷新，立刻出现。
    </p>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { fetchDashboard } from '../api.js'

const data = ref(null)
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await fetchDashboard()
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    loading.value = false
  }
}
function formatTime(at) {
  if (!at) return ''
  const d = new Date(at)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
onMounted(load)
</script>
