<template>
  <section class="ad-page">
    <header class="ad-page-head">
      <h2>用户管理</h2>
      <form class="ad-search" @submit.prevent="load">
        <input v-model="query" type="search" placeholder="搜索昵称 / ID" />
        <button class="ad-btn" type="submit">搜索</button>
      </form>
    </header>

    <p v-if="error" class="ad-error">{{ error }}</p>

    <table class="ad-table">
      <thead>
        <tr>
          <th>ID</th><th>昵称</th><th>金币</th><th>总星数</th><th>解锁关</th><th>对局</th><th>最近活跃</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="8" class="ad-empty">加载中…</td>
        </tr>
        <tr v-else-if="!rows.length">
          <td colspan="8" class="ad-empty">没有匹配的用户</td>
        </tr>
        <tr v-for="row in rows" v-else :key="row.id">
          <td class="ad-mono">{{ shortId(row.id) }}</td>
          <td>{{ row.name }}</td>
          <td>{{ Number(row.coins).toLocaleString() }}</td>
          <td>{{ row.total_stars }} / 168</td>
          <td>{{ row.unlocked }} / 56</td>
          <td>{{ row.results }}</td>
          <td>{{ formatTime(row.last_seen_at) }}</td>
          <td><button class="ad-btn sm" @click="emit('open-user', row.id)">详情</button></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { fetchUsers } from '../api.js'

const emit = defineEmits(['open-user'])
const rows = ref([])
const query = ref('')
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    rows.value = await fetchUsers(query.value)
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    loading.value = false
  }
}
function shortId(id) {
  const s = String(id)
  return s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-4)}` : s
}
function formatTime(at) {
  if (!at) return '—'
  const d = new Date(at)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
onMounted(load)
</script>
