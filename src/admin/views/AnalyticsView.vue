<template>
  <section class="ad-page an-page">
    <header class="ad-page-head">
      <h2>数据分析</h2>
      <button class="ad-btn" :disabled="loading" @click="load">{{ loading ? '刷新中…' : '刷新' }}</button>
    </header>

    <p class="an-hint">{{ hint }}</p>
    <p v-if="error" class="ad-error">{{ error }}</p>

    <div class="ad-cards">
      <div class="ad-card">
        <small>累计尝试次数</small>
        <b>{{ summary.attempts.toLocaleString() }}</b>
      </div>
      <div class="ad-card">
        <small>累计通关人次</small>
        <b>{{ summary.clears.toLocaleString() }}</b>
      </div>
      <div class="ad-card">
        <small>整体通关率</small>
        <b>{{ pct(summary.clearRate) }}</b>
      </div>
      <div class="ad-card">
        <small>流失最多的关卡</small>
        <b>{{ summary.worstDrop ? `第 ${summary.worstDrop.id} 关 · ${pct(summary.worstDrop.dropoffRate)}` : '—' }}</b>
      </div>
    </div>

    <div class="ad-panel an-panel">
      <h3>关卡漏斗（按关卡顺序，到达人数逐关衰减）</h3>
      <p v-if="!rows.length" class="ad-empty">暂无对局数据 —— 去玩几关再回来看</p>
      <div v-else class="an-funnel">
        <div v-for="row in rows" :key="row.id" class="an-funnel-row">
          <div class="an-funnel-label">
            <b>第 {{ row.id }} 关</b>
            <small>{{ row.chapterName }} · {{ row.name }}</small>
          </div>
          <div class="an-funnel-bar-track">
            <div class="an-funnel-bar" :style="{ width: barWidth(row) }"></div>
          </div>
          <div class="an-funnel-nums">
            <span>到达 {{ row.players }}</span>
            <span v-if="row.dropoffRate !== null" class="an-drop" :class="{ hot: row.dropoffRate > 0.3 }">
              流失 {{ pct(row.dropoffRate) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="ad-panel an-panel">
      <h3>逐关明细</h3>
      <table v-if="rows.length" class="ad-table">
        <thead>
          <tr><th>关卡</th><th>章节</th><th>尝试次数</th><th>通关次数</th><th>通关率</th><th>到达人数</th><th>平均星级</th><th>较上一关流失</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>第 {{ row.id }} 关 <small class="an-level-name">{{ row.name }}</small></td>
            <td>{{ row.chapterName }}</td>
            <td class="ad-mono">{{ row.attempts }}</td>
            <td class="ad-mono">{{ row.clears }}</td>
            <td class="ad-mono">{{ row.attempts ? pct(row.clears / row.attempts) : '—' }}</td>
            <td class="ad-mono">{{ row.players }}</td>
            <td class="ad-mono">{{ row.attempts ? row.avgStars.toFixed(2) : '—' }}</td>
            <td class="ad-mono">
              <span v-if="row.dropoffRate !== null" :class="{ 'an-drop-text': row.dropoffRate > 0.3 }">{{ pct(row.dropoffRate) }}</span>
              <span v-else>—</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="ad-empty">暂无数据</p>
    </div>
  </section>
</template>

<script setup>
// 数据分析（T6）：基于 level_results 的关卡漏斗。
// 数据层只调用 ../api.js 的 fetchLevelFunnel（与 fetchDashboard/fetchUsers 同一约定），
// 关卡名称 / 章节归属从打包默认内容（core/content.js 的 DEFAULT_BUNDLE）里取，仅做展示用，
// 不随内容工厂的已发布内容变化（关卡结构改动走 T5 关卡编辑器，不影响这里的统计口径）。
import { computed, onMounted, ref } from 'vue'
import { fetchLevelFunnel, adminState } from '../api.js'
import { DEFAULT_BUNDLE } from '../../core/content.js'

const loading = ref(false)
const error = ref('')
const funnel = ref([]) // [{ level_id, attempts, clears, players, avg_stars }]

const isMock = computed(() => adminState.mode !== 'supabase')
const hint = computed(() => (isMock.value
  ? '本地模拟模式：统计口径取自本机模拟后端的演示对局（含 4 个种子玩家），与游戏本机 level_results 等效数据。'
  : '数据来自 level_results 表（admin_level_funnel RPC，0004 迁移），覆盖全部玩家的历史对局。'))

const chapterNameById = computed(() => {
  const m = {}
  for (const c of DEFAULT_BUNDLE.chapters || []) m[c.id] = c.shortName || c.name
  return m
})

const rows = computed(() => {
  const byId = new Map(funnel.value.map((r) => [r.level_id, r]))
  const list = [...(DEFAULT_BUNDLE.levels || [])]
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((lv) => {
      const f = byId.get(lv.id)
      return {
        id: lv.id,
        name: lv.name || lv.place || '',
        chapterName: chapterNameById.value[lv.chapterId] || '',
        attempts: f?.attempts || 0,
        clears: f?.clears || 0,
        players: f?.players || 0,
        avgStars: f?.avg_stars || 0
      }
    })
  // 流失率 = 相对上一关「到达人数」的衰减；首关或上一关到达 0 人时记为 null（无法计算）
  for (let i = 0; i < list.length; i++) {
    if (i === 0) {
      list[i].dropoffRate = null
      continue
    }
    const prevPlayers = list[i - 1].players
    list[i].dropoffRate = prevPlayers > 0 ? (prevPlayers - list[i].players) / prevPlayers : null
  }
  // 漏斗图只展示有过对局记录（或其前置关卡有记录）的部分，避免 56 行空数据刷屏
  const lastActiveIdx = (() => {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].attempts > 0) return i
    return -1
  })()
  return lastActiveIdx < 0 ? list.slice(0, 8) : list.slice(0, lastActiveIdx + 1)
})

const summary = computed(() => {
  const attempts = rows.value.reduce((s, r) => s + r.attempts, 0)
  const clears = rows.value.reduce((s, r) => s + r.clears, 0)
  let worstDrop = null
  for (const row of rows.value) {
    if (row.dropoffRate !== null && row.dropoffRate > 0 && (!worstDrop || row.dropoffRate > worstDrop.dropoffRate)) {
      worstDrop = row
    }
  }
  return { attempts, clears, clearRate: attempts ? clears / attempts : 0, worstDrop }
})

const maxPlayers = computed(() => Math.max(1, ...rows.value.map((r) => r.players)))

function barWidth(row) {
  return `${Math.max(2, Math.round((row.players / maxPlayers.value) * 100))}%`
}
function pct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return `${Math.round(n * 1000) / 10}%`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    funnel.value = await fetchLevelFunnel()
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.an-page { max-width: 1120px; }
.an-hint { color: #6fa3c8; font-size: 12px; margin: -6px 0 0; }
.an-panel h3 { margin: 0 0 10px; font-size: 13px; color: #9db4cc; }

.an-funnel { display: flex; flex-direction: column; gap: 10px; }
.an-funnel-row { display: grid; grid-template-columns: 160px 1fr 170px; align-items: center; gap: 12px; }
@media (max-width: 760px) { .an-funnel-row { grid-template-columns: 1fr; } }
.an-funnel-label { display: flex; flex-direction: column; gap: 2px; }
.an-funnel-label b { font-size: 13px; }
.an-funnel-label small { color: #6fa3c8; font-size: 11px; }
.an-funnel-bar-track { height: 16px; background: #0d1520; border-radius: 8px; overflow: hidden; border: 1px solid #1a2534; }
.an-funnel-bar { height: 100%; background: linear-gradient(90deg, #2f81f7, #58a6ff); border-radius: 8px; }
.an-funnel-nums { display: flex; gap: 10px; font-size: 12px; color: #9db4cc; justify-content: flex-end; }
.an-drop { color: #ffb3b3; }
.an-drop.hot { color: #ff6a6a; font-weight: 800; }
.an-drop-text { color: #ff8f8f; font-weight: 700; }
.an-level-name { display: block; color: #6fa3c8; font-size: 11px; }
</style>
