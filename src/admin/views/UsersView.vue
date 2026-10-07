<template>
  <section class="ad-page users-page">
    <header class="ad-page-head users-page-head">
      <div class="users-head-copy"><h2>玩家档案</h2><p>按昵称或玩家编号查找账号、进度与最近活跃情况。</p></div>
      <form class="ad-search" role="search" @submit.prevent="load">
        <el-input v-model.trim="query" type="search" aria-label="搜索玩家昵称或编号" placeholder="输入昵称或玩家编号" />
        <el-button v-if="query" class="ad-btn" native-type="button" :disabled="loading" @click="clearSearch">清除</el-button>
        <el-button class="ad-btn" native-type="submit" :disabled="loading">{{ loading ? '搜索中…' : '搜索' }}</el-button>
      </form>
    </header>

    <AdminError :error="error" context="搜索玩家" />
    <div v-if="!loading && rows.length" class="users-result-line" aria-live="polite"><span>搜索结果</span><b>{{ rows.length }}</b><span>位玩家</span><small v-if="query">匹配「{{ query }}」</small></div>

    <div v-if="loading && !rows.length" class="ad-panel ad-empty" role="status">正在查找玩家…</div>
    <div v-else-if="!rows.length" class="ad-list-empty">
      <el-empty :description="query ? '没有找到符合条件的玩家，请检查昵称或编号。' : '还没有玩家数据。'" />
      <el-button v-if="query" class="ad-btn" :disabled="loading" @click="clearSearch">清除搜索条件</el-button>
      <el-button v-else class="ad-btn" :disabled="loading" @click="load">重新读取</el-button>
    </div>

    <div v-else class="ad-list users-table-wrap" aria-live="polite" role="region" aria-label="玩家档案列表" tabindex="0">
      <el-table :data="rows" row-key="id" aria-label="玩家档案表格" table-layout="auto">
        <el-table-column label="昵称" min-width="150"><template #default="{ row }"><b>{{ row.name || '未设置昵称' }}</b></template></el-table-column>
        <el-table-column label="玩家编号" min-width="180"><template #default="{ row }"><span class="user-id">{{ shortId(row.id) }}</span></template></el-table-column>
        <el-table-column label="金币" min-width="110"><template #default="{ row }">{{ Number(row.coins || 0).toLocaleString() }}</template></el-table-column>
        <el-table-column label="星星" min-width="130"><template #default="{ row }">{{ Number(row.total_stars || 0) }} / 168 颗</template></el-table-column>
        <el-table-column label="解锁进度" min-width="130"><template #default="{ row }">{{ Number(row.unlocked || 1) }} / 56 关</template></el-table-column>
        <el-table-column label="对局" min-width="90"><template #default="{ row }">{{ Number(row.results || 0) }} 局</template></el-table-column>
        <el-table-column label="最近活跃" min-width="130"><template #default="{ row }">{{ formatTime(row.last_seen_at) }}</template></el-table-column>
        <el-table-column label="操作" fixed="right" min-width="112"><template #default="{ row }"><el-button class="ad-btn user-detail-btn" @click="emit('open-user', row.id)">查看详情</el-button></template></el-table-column>
      </el-table>
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
.users-page-head { align-items: flex-end; }
.users-head-copy { min-width: 0; }
.users-head-copy h2 { margin: 0; color: #171c18; font-size: 29px; line-height: 1.15; letter-spacing: -.055em; }
.users-head-copy p { margin: 6px 0 0; color: #777e73; font-size: 11px; line-height: 1.55; }
.users-page .ad-search :deep(.el-input) { flex: 1; min-width: 220px; }
.users-result-line { display: flex; align-items: baseline; gap: 5px; margin-top: -9px; color: #777e73; font-size: 11px; }
.users-result-line b { color: #20251f; font-size: 15px; }
.users-result-line small { margin-left: 7px; overflow: hidden; color: #777e73; text-overflow: ellipsis; white-space: nowrap; }
.users-table-wrap { overflow-x: auto; }
.users-table-wrap :deep(.el-table) { min-width: 980px; --el-table-border-color: #d8d9cf; --el-table-header-bg-color: #efeee5; --el-table-row-hover-bg-color: #f3f1e8; --el-table-text-color: #20251f; --el-table-header-text-color: #59604f; }
.user-id { display: block; color: #737b6e; font-size: 10px; overflow-wrap: anywhere; }
.user-detail-btn { flex: none; }
@media (max-width: 768px) {
  .user-detail-btn { width: auto; }
  .users-page-head { align-items: flex-start; }
  .users-head-copy h2 { font-size: 23px; }
  .users-page .ad-search { flex-wrap: wrap; }
  .users-page .ad-search :deep(.el-input) { flex-basis: 100%; }
  .users-page .ad-search .ad-btn { flex: 1; }
}
</style>
