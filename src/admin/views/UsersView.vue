<template>
  <section class="ad-page users-page">
    <header class="ad-page-head">
      <h2>用户管理</h2>
      <form class="ad-search" role="search" @submit.prevent="load">
        <input v-model.trim="query" type="search" aria-label="搜索玩家昵称或编号" placeholder="输入昵称或玩家编号" />
        <button class="ad-btn" type="submit" :disabled="loading">{{ loading ? '搜索中…' : '搜索' }}</button>
      </form>
    </header>

    <AdminError :error="error" context="搜索玩家" />

    <div v-if="loading && !rows.length" class="ad-panel ad-empty" role="status">正在查找玩家…</div>
    <div v-else-if="!rows.length" class="ad-list-empty">
      <p>{{ query ? '没有找到符合条件的玩家，请检查昵称或编号。' : '还没有玩家数据。' }}</p>
      <button v-if="query" class="ad-btn" :disabled="loading" @click="clearSearch">清除搜索条件</button>
      <button v-else class="ad-btn" :disabled="loading" @click="load">重新读取</button>
    </div>

    <div v-else class="ad-list" aria-live="polite">
      <article v-for="row in rows" :key="row.id" class="ad-row-card user-card">
        <div class="ad-row-card-head">
          <div class="ad-row-card-title"><b>{{ row.name || '未设置昵称' }}</b><small class="user-id">玩家编号 · {{ shortId(row.id) }}</small></div>
          <button class="ad-btn user-detail-btn" @click="emit('open-user', row.id)">查看详情</button>
        </div>
        <div class="ad-row-card-meta">
          <div><small>金币</small>{{ Number(row.coins || 0).toLocaleString() }}</div>
          <div><small>累计星星</small>{{ Number(row.total_stars || 0) }} / 168 颗</div>
          <div><small>已解锁关卡</small>{{ Number(row.unlocked || 1) }} / 56 关</div>
          <div><small>对局数量</small>{{ Number(row.results || 0) }} 局</div>
          <div><small>最近活跃</small>{{ formatTime(row.last_seen_at) }}</div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { fetchUsers } from '../api.js'
import AdminError from '../components/AdminError.vue'

const emit = defineEmits(['open-user'])
const rows = ref([])
const query = ref('')
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    rows.value = await fetchUsers(query.value)
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}
function clearSearch() {
  query.value = ''
  load()
}
function shortId(id) {
  const s = String(id || '')
  return s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-4)}` : (s || '—')
}
function formatTime(at) {
  if (!at) return '暂无记录'
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return '暂无记录'
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
onMounted(load)
</script>

<style scoped>
.users-page { max-width: 1120px; }
.users-page .ad-search input { flex: 1; }
.user-card { padding: 14px 16px; }
.user-card .ad-row-card-title b { display: block; color: #e1edf8; font-size: 14px; }
.user-id { display: block; margin-top: 4px; color: #7f96ad; font-size: 10px; overflow-wrap: anywhere; }
.user-detail-btn { flex: none; }
.user-card .ad-row-card-meta { grid-template-columns: repeat(5, minmax(0, 1fr)); }
@media (max-width: 900px) { .user-card .ad-row-card-meta { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 768px) {
  .user-card { padding: 12px; }
  .user-card .ad-row-card-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .user-detail-btn { width: 100%; }
}
</style>
