<template>
  <section class="ad-page an-page">
    <header class="ad-page-head">
      <div>
        <h2>数据分析 <span class="an-subtitle">关卡漏斗</span></h2>
        <p class="an-lead">基于 <code>level_results</code> 的真实对局记录：进入本关的玩家、尝试次数、通关人数与未通关流失。</p>
      </div>
      <div class="an-filters">
        <label>统计期
          <select v-model.number="days" :disabled="loading" @change="load">
            <option :value="7">近 7 天</option>
            <option :value="30">近 30 天</option>
            <option :value="90">近 90 天</option>
            <option :value="365">近 1 年</option>
          </select>
        </label>
        <button class="ad-btn" :disabled="loading" @click="load">{{ loading ? '刷新中…' : '刷新' }}</button>
      </div>
    </header>

    <p class="an-definition">
      <b>口径：</b>「进入玩家」按关卡与玩家去重；「尝试次数」保留全部上报；「流失」= 统计期内至少尝试过本关、但从未通关的去重玩家。已通关后再次失败不会重复计为流失。
    </p>
    <p v-if="error" class="ad-error">{{ error }}</p>

    <div class="ad-cards an-cards">
      <div class="ad-card"><small>有对局的关卡</small><b>{{ activeLevelCount }} / {{ rows.length }}</b></div>
      <div class="ad-card"><small>尝试次数</small><b>{{ formatCount(totalAttempts) }}</b></div>
      <div class="ad-card"><small>通关人数（按关去重）</small><b>{{ formatCount(totalClears) }}</b></div>
      <div class="ad-card"><small>整体通关率（按关汇总）</small><b>{{ percentage(overallClearRate) }}</b></div>
    </div>

    <section class="ad-panel an-funnel">
      <header class="an-funnel-head">
        <div>
          <h3>每关漏斗</h3>
          <p>进度条按「通关人数 / 进入玩家」绘制；空数据关会保留在列表中，方便识别尚未有样本的内容。</p>
        </div>
        <span class="an-mode" :class="adminState.mode">{{ adminState.mode === 'supabase' ? 'Supabase 云端数据' : '本地模拟数据' }}</span>
      </header>

      <p v-if="loading" class="ad-empty">正在聚合关卡数据…</p>
      <div v-else class="an-table-wrap">
        <table class="ad-table an-table">
          <thead>
            <tr>
              <th>关卡</th>
              <th>章节</th>
              <th>进入玩家</th>
              <th>尝试次数</th>
              <th>通关人数</th>
              <th>流失</th>
              <th>通关率 / 漏斗</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.levelId" :class="{ 'is-empty': !row.startedPlayers, 'is-risk': row.startedPlayers && row.clearRate < 0.5 }">
              <td>
                <b class="an-level">#{{ row.levelId }}</b>
                <small>{{ row.name }}</small>
              </td>
              <td><span class="an-chapter">{{ row.chapter }}</span></td>
              <td>{{ formatCount(row.startedPlayers) }}</td>
              <td>{{ formatCount(row.attempts) }}</td>
              <td class="an-cleared">{{ formatCount(row.clearedPlayers) }}</td>
              <td :class="{ 'an-drop': row.dropoffs > 0 }">{{ formatCount(row.dropoffs) }}</td>
              <td class="an-rate-cell">
                <span>{{ row.startedPlayers ? percentage(row.clearRate) : '—' }}</span>
                <i class="an-bar" aria-hidden="true"><i :style="{ width: `${Math.round(row.clearRate * 100)}%` }"></i></i>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <p class="ad-note">数据在读取时聚合，不会向玩家开放 <code>level_results</code> 表的直读权限；云端模式仅通过受 <code>is_admin()</code> 保护的 <code>admin_level_funnel</code> RPC 查询。</p>
  </section>
</template>

<script setup>
// T6 运营看板：只消费管理端聚合接口，不直接读取 level_results（该表开启 RLS）。
import { computed, onMounted, ref } from 'vue'
import { adminState, fetchLevelFunnel } from '../api.js'
import { getContentBundle } from '../../core/content.js'

const days = ref(30)
const loading = ref(false)
const error = ref('')
const funnelRows = ref([])

const contentBundle = getContentBundle()
const levelMeta = new Map((contentBundle?.levels || []).map((level) => [Number(level.id), level]))
const chapterMeta = new Map((contentBundle?.chapters || []).map((chapter) => [chapter.id, chapter]))

const rows = computed(() => {
  const statsByLevel = new Map((funnelRows.value || []).map((row) => [Number(row.level_id), row]))
  const ids = new Set([...levelMeta.keys(), ...statsByLevel.keys()])
  return [...ids].sort((a, b) => a - b).map((levelId) => {
    const stats = statsByLevel.get(levelId) || {}
    const level = levelMeta.get(levelId)
    const chapter = chapterMeta.get(level?.chapterId)
    const startedPlayers = toNumber(stats.started_players)
    const clearedPlayers = toNumber(stats.cleared_players)
    const clearRate = startedPlayers ? clampRate(stats.clear_rate, clearedPlayers / startedPlayers) : 0
    return {
      levelId,
      name: level?.name || '未在当前内容包中定义',
      chapter: chapter ? `${chapter.number} · ${chapter.shortName || chapter.name}` : '—',
      startedPlayers,
      attempts: toNumber(stats.attempts),
      clearedPlayers,
      dropoffs: toNumber(stats.dropoffs),
      clearRate
    }
  })
})

const activeLevelCount = computed(() => rows.value.filter((row) => row.attempts > 0).length)
const totalAttempts = computed(() => rows.value.reduce((sum, row) => sum + row.attempts, 0))
const totalStarts = computed(() => rows.value.reduce((sum, row) => sum + row.startedPlayers, 0))
const totalClears = computed(() => rows.value.reduce((sum, row) => sum + row.clearedPlayers, 0))
const overallClearRate = computed(() => totalStarts.value ? totalClears.value / totalStarts.value : 0)

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function clampRate(value, fallback) {
  const number = Number(value)
  const rate = Number.isFinite(number) ? number : fallback
  return Math.max(0, Math.min(1, rate))
}

function formatCount(value) {
  return toNumber(value).toLocaleString('zh-CN')
}

function percentage(rate) {
  return `${Math.round(clampRate(rate, 0) * 100)}%`
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    funnelRows.value = await fetchLevelFunnel(days.value)
  } catch (e) {
    funnelRows.value = []
    error.value = `读取关卡漏斗失败：${String(e?.message || e)}`
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.an-page { max-width: 1180px; }
.an-subtitle { margin-left: 8px; color: #7d94ac; font-size: 11px; font-weight: 700; vertical-align: 2px; }
.an-lead { margin: 6px 0 0; color: #6fa3c8; font-size: 12px; line-height: 1.6; }
.an-lead code, .an-definition code, .ad-note code { color: #58a6ff; }
.an-filters { display: flex; align-items: end; gap: 8px; }
.an-filters label { display: flex; flex-direction: column; gap: 4px; color: #7d94ac; font-size: 10px; }
.an-filters select { height: 32px; min-width: 104px; padding: 0 8px; border: 1px solid #2b3d52; border-radius: 7px; background: #0d1520; color: #dce6f2; font: inherit; font-size: 12px; }
.an-definition { margin: -7px 0 0; padding: 9px 12px; border-left: 3px solid #2f81f7; border-radius: 0 7px 7px 0; background: #111a26; color: #9db4cc; font-size: 11px; line-height: 1.65; }
.an-definition b { color: #dce6f2; }
.an-cards .ad-card b { color: #dce6f2; }
.an-funnel { min-width: 0; }
.an-funnel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 10px; }
.an-funnel-head h3 { margin: 0 0 4px; }
.an-funnel-head p { margin: 0; color: #6fa3c8; font-size: 11px; line-height: 1.6; }
.an-mode { flex: none; padding: 3px 8px; border: 1px solid #8fb98d55; border-radius: 999px; color: #8fd4a0; font-size: 10px; }
.an-mode.supabase { border-color: #6fc2b055; color: #6fc2b0; }
.an-table-wrap { overflow-x: auto; }
.an-table { min-width: 760px; }
.an-table td { vertical-align: middle; }
.an-table tr.is-empty { opacity: .58; }
.an-table tr.is-risk td:first-child { box-shadow: inset 3px 0 0 #d29922; }
.an-level { display: block; color: #dce6f2; font-size: 12px; }
.an-table td small { display: block; max-width: 160px; overflow: hidden; color: #6fa3c8; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.an-chapter { color: #9db4cc; font-size: 11px; }
.an-cleared { color: #8fd4a0; font-weight: 700; }
.an-drop { color: #ffb0a8; font-weight: 700; }
.an-rate-cell { min-width: 160px; }
.an-rate-cell > span { display: inline-block; width: 35px; color: #9db4cc; font-size: 11px; }
.an-bar { display: inline-block; width: 96px; height: 7px; overflow: hidden; border-radius: 999px; background: #263545; vertical-align: middle; }
.an-bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #2ea043, #66d17b); }
@media (max-width: 700px) {
  .ad-page-head { align-items: flex-start; flex-direction: column; }
  .an-filters { width: 100%; justify-content: space-between; }
  .an-funnel-head { flex-direction: column; }
}
</style>
