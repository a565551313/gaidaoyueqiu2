<template>
  <section class="ad-page an-page">
    <header class="ad-page-head">
      <h2>数据分析</h2>
      <el-button class="ad-btn an-refresh" type="primary" :disabled="loading" @click="load">{{ loading ? '刷新中…' : '刷新' }}</el-button>
    </header>

    <p class="an-hint">{{ hint }}</p>
    <AdminError :error="error" context="读取关卡统计" />

    <div class="ad-cards">
      <div class="ad-card">
        <small>累计尝试次数</small>
        <b>{{ hasData ? summary.attempts.toLocaleString() : '—' }}</b>
      </div>
      <div class="ad-card">
        <small>累计通关人次</small>
        <b>{{ hasData ? summary.clears.toLocaleString() : '—' }}</b>
      </div>
      <div class="ad-card">
        <small>整体通关率</small>
        <b>{{ hasData ? pct(summary.clearRate) : '—' }}</b>
      </div>
      <div class="ad-card">
        <small>流失最多的关卡</small>
        <b>{{ summary.worstDrop ? `第 ${summary.worstDrop.id} 关 · ${pct(summary.worstDrop.dropoffRate)}` : '暂无数据' }}</b>
      </div>
    </div>

    <div class="ad-panel an-panel">
      <h3>关卡漏斗（按关卡顺序，到达人数逐关衰减）</h3>
      <p v-if="loading" class="ad-empty">正在汇总关卡数据…</p>
      <el-empty v-else-if="!rows.length" description="还没有对局统计数据。玩家完成对局后，点击右上角刷新即可查看。" />
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
              <el-tag v-if="row.dropoffRate > 0.3" type="danger" effect="light" size="small">流失 {{ pct(row.dropoffRate) }}</el-tag>
              <span v-else>流失 {{ pct(row.dropoffRate) }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="ad-panel an-panel">
      <h3>逐关明细</h3>
      <div v-if="rows.length" class="an-table-scroll">
        <el-table :data="rows" row-key="id" class="ad-table an-detail-table" table-layout="auto">
          <el-table-column label="关卡" min-width="150"><template #default="{ row }">第 {{ row.id }} 关 <small class="an-level-name">{{ row.name }}</small></template></el-table-column>
          <el-table-column prop="chapterName" label="章节" min-width="110" />
          <el-table-column label="尝试次数" min-width="110"><template #default="{ row }"><span class="ad-mono">{{ row.attempts }} 局</span></template></el-table-column>
          <el-table-column label="通关次数" min-width="110"><template #default="{ row }"><span class="ad-mono">{{ row.clears }} 局</span></template></el-table-column>
          <el-table-column label="通关率" min-width="90"><template #default="{ row }"><span class="ad-mono">{{ row.attempts ? pct(row.clears / row.attempts) : '—' }}</span></template></el-table-column>
          <el-table-column label="到达人数" min-width="100"><template #default="{ row }"><span class="ad-mono">{{ row.players }} 人</span></template></el-table-column>
          <el-table-column label="平均星级" min-width="100"><template #default="{ row }"><span class="ad-mono">{{ row.attempts ? `${row.avgStars.toFixed(2)} 星` : '—' }}</span></template></el-table-column>
          <el-table-column label="较上一关流失" min-width="130"><template #default="{ row }"><el-tag v-if="row.dropoffRate !== null && row.dropoffRate > 0.3" type="danger" effect="light" size="small">{{ pct(row.dropoffRate) }}</el-tag><span v-else-if="row.dropoffRate !== null">{{ pct(row.dropoffRate) }}</span><span v-else>—</span></template></el-table-column>
        </el-table>
      </div>
      <el-empty v-else description="暂无数据" />
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
import AdminError from '../components/AdminError.vue'

const loading = ref(true)
const error = ref('')
const funnel = ref([]) // [{ level_id, attempts, clears, players, avg_stars }]

const isMock = computed(() => adminState.mode !== 'supabase')
const hint = computed(() => (isMock.value
  ? '当前展示本机演示玩家的对局统计；真实运营数据需切换到已配置的云端环境。'
  : '数据汇总自全部玩家的历史对局，按关卡顺序统计到达、通关和流失情况。'))

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
  return lastActiveIdx < 0 ? [] : list.slice(0, lastActiveIdx + 1)
})

const hasData = computed(() => rows.value.some((row) => row.attempts > 0))

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
    error.value = e
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.an-page { max-width: 1120px; }
.an-hint { color: #737d67; font-size: 12px; margin: -6px 0 0; }
.an-panel h3 { margin: 0 0 10px; font-size: 13px; color: #4d5549; }

.an-funnel { display: flex; flex-direction: column; gap: 10px; }
.an-funnel-row { display: grid; grid-template-columns: 160px 1fr 170px; align-items: center; gap: 12px; }
@media (max-width: 760px) { .an-funnel-row { grid-template-columns: 1fr; } }
.an-funnel-label { display: flex; flex-direction: column; gap: 2px; }
.an-funnel-label b { font-size: 13px; }
.an-funnel-label small { color: #737d67; font-size: 11px; }
.an-funnel-bar-track { height: 16px; background: #f7f6ef; border-radius: 8px; overflow: hidden; border: 1px solid #e7e6dd; }
.an-funnel-bar { height: 100%; background: linear-gradient(90deg, #899944, #899944); border-radius: 8px; }
.an-funnel-nums { display: flex; gap: 10px; font-size: 12px; color: #4d5549; justify-content: flex-end; }
.an-drop { color: #b74337; }
.an-drop.hot { color: #b74337; font-weight: 800; }
.an-drop-text { color: #b74337; font-weight: 700; }
.an-level-name { display: block; color: #737d67; font-size: 11px; }
.an-table-scroll { max-width: 100%; overflow-x: auto; overscroll-behavior-inline: contain; }
.an-detail-table { min-width: 920px; --el-table-border-color: #e7e6dd; --el-table-header-bg-color: #f7f6ef; --el-table-row-hover-bg-color: #f7f6ef; --el-table-text-color: #4d5549; --el-table-header-text-color: #4d5549; }
.an-detail-table :deep(.el-table__inner-wrapper::before) { background-color: #e7e6dd; }
.an-detail-table :deep(th.el-table__cell) { font-weight: 700; }
.an-refresh { --el-button-bg-color: #899944; --el-button-border-color: #899944; --el-button-hover-bg-color: #748337; --el-button-hover-border-color: #748337; }
</style>
