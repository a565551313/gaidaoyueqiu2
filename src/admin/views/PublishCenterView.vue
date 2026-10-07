<template>
  <section class="ad-page pc-page">
    <header class="ad-page-head">
      <h2>发布中心</h2>
      <div class="pc-head-actions">
        <span class="pc-mode-chip" :class="modeClass">{{ modeTitle }}</span>
        <el-button class="ad-btn" :disabled="listLoading" @click="refreshStatus">{{ listLoading ? '同步中…' : '刷新版本' }}</el-button>
      </div>
    </header>

    <p class="pc-hint">{{ modeHint }}</p>
    <AdminToast :message="notice" />
    <AdminError :error="error" context="发布或回退内容" />

    <div class="pc-layout">
      <div class="ad-panel pc-list">
        <h3>内容包版本</h3>
        <p v-if="listLoading" class="ad-empty">正在读取各项内容版本…</p>
        <div v-else class="pc-pack-list">
          <article v-for="row in packRows" :key="row.key" class="pc-pack-row" :class="{ on: activeKey === row.key }">
            <el-button class="pc-pack-summary" native-type="button" :aria-pressed="activeKey === row.key" @click="selectPack(row.key)">
              <span class="pc-pack-summary-top"><b>{{ PACK_META[row.key].label }}</b><el-tag class="pc-status" :type="row.status === 'draft' ? 'warning' : row.status === 'published' ? 'success' : 'info'" effect="light">{{ statusText(row) }}</el-tag></span>
              <span class="pc-pack-meta"><span>第 {{ row.version }} 版</span><time>{{ row.updated_at ? fmtTime(row.updated_at) : '暂无更新时间' }}</time></span>
            </el-button>
            <el-button class="ad-btn sm pc-pack-publish" :disabled="row.status !== 'draft' || !!busyKey" @click="askPublish(row.key)">
              {{ busyKey === row.key && busyAction === 'publish' ? '发布中…' : '发布草稿' }}
            </el-button>
          </article>
        </div>
      </div>

      <div class="ad-panel pc-history">
        <h3>{{ PACK_META[activeKey].label }} · 历史版本</h3>
        <p class="pc-history-hint">{{ historyHint }}</p>
        <p v-if="historyLoading" class="ad-empty">正在读取历史记录…</p>
        <AdminError v-else :error="historyError" context="读取历史版本" />
        <el-empty v-if="!historyLoading && !historyError && !historyRows.length" description="还没有历史版本记录；保存草稿后会显示在这里。" />
        <div v-if="!historyLoading && !historyError && historyRows.length" class="pc-history-table-wrap">
          <el-table :data="historyRows" row-key="version" class="ad-table">
            <el-table-column label="版本" min-width="150"><template #default="{ row }"><span class="ad-mono">第 {{ row.version }} 版</span><el-tag v-if="row.version === publishedVersion" class="pc-current-badge" type="success" effect="light">当前已发布</el-tag></template></el-table-column>
            <el-table-column label="保存时间" min-width="170"><template #default="{ row }">{{ fmtTime(row.updated_at) }}</template></el-table-column>
            <el-table-column label="操作" min-width="210"><template #default="{ row }"><div class="pc-history-op">
              <el-button class="ad-btn sm" @click="previewRow(row)">{{ previewing === row ? '收起摘要' : '查看摘要' }}</el-button>
              <el-button class="ad-btn sm pc-btn-rollback" :disabled="row.version === publishedVersion || !!busyKey" @click="askRollback(row)">回退至此版本</el-button>
            </div></template></el-table-column>
          </el-table>
        </div>
        <p v-if="previewing" class="pc-preview-summary">{{ previewSummary }}</p>
      </div>
    </div>

    <div v-if="confirmPublishKey" class="ad-panel pc-confirm pc-publish-confirm">
      <el-alert :title="`确认发布「${PACK_META[confirmPublishKey].label}」？`" type="warning" :closable="false" />
      <p>发布后玩家下次启动时生效。<template v-if="isMock">本地模拟中，发布内容会同步到当前浏览器的游戏数据。</template></p>
      <div class="pc-confirm-actions">
        <el-button class="ad-btn pc-btn-publish" :disabled="!!busyKey" @click="doQuickPublish">{{ busyKey === confirmPublishKey ? '发布中…' : '确认发布' }}</el-button>
        <el-button class="ad-btn" :disabled="!!busyKey" @click="confirmPublishKey = ''">取消</el-button>
      </div>
    </div>

    <div v-if="confirmRow" class="ad-panel pc-confirm">
      <el-alert :title="`确认将「${PACK_META[activeKey].label}」回退至第 ${confirmRow.version} 版？`" type="warning" :closable="false" />
      <p>系统会把该历史内容复制为新版本并立即发布，旧版本记录会保留。<b>回退后玩家下次启动时生效。</b><template v-if="isMock">本地模拟中，刷新游戏首页即可验证。</template></p>
      <div class="pc-confirm-actions">
        <el-button class="ad-btn pc-btn-rollback" :disabled="!!busyKey" @click="doRollback">{{ busyKey === activeKey && busyAction === 'rollback' ? '回退中…' : '确认回退并发布' }}</el-button>
        <el-button class="ad-btn" :disabled="!!busyKey" @click="confirmRow = null">取消</el-button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { PACK_KEYS, PACK_META, listPacks, publishPack, packHistory, rollbackPack } from '../api/content.js'
import { adminState } from '../api.js'
import AdminError from '../components/AdminError.vue'
import AdminToast from '../components/AdminToast.vue'
import { useAutoNotice } from '../ui.js'

const isMock = computed(() => adminState.mode !== 'supabase')
const modeClass = computed(() => (isMock.value ? 'mock' : 'supabase'))
const modeTitle = computed(() => (isMock.value ? '本地模拟' : '云端模式'))
const modeHint = computed(() => (isMock.value
  ? '本地模拟：发布会同步到当前浏览器的游戏数据，刷新游戏首页即可查看。'
  : '云端模式：发布后对全部玩家生效，玩家下次启动时读取新内容。'))
const historyHint = computed(() => (isMock.value
  ? '本地模拟会保留草稿的历史记录，可查看摘要或回退到旧版本。'
  : '每次保存草稿都会保留历史版本；回退会创建新版本，不会删除旧记录。'))

const statusMap = ref({})
const activeKey = ref(PACK_KEYS[0])
const error = ref('')
const { notice, showNotice } = useAutoNotice()
const busyKey = ref('')
const busyAction = ref('')
const listLoading = ref(true)
const confirmPublishKey = ref('')
const historyLoading = ref(true)
const historyError = ref('')
const historyRows = ref([])
const previewing = ref(null)
const previewSummary = ref('')
const confirmRow = ref(null)

const packRows = computed(() => PACK_KEYS.map((key) => statusMap.value[key] || { key, status: 'empty', version: 0, updated_at: null }))
const publishedVersion = computed(() => {
  const row = statusMap.value[activeKey.value]
  return row && row.status !== 'draft' ? row.version : -1
})

function statusText(row) {
  if (row.status === 'draft') return `草稿待发布 · 第 ${row.version} 版`
  if (row.status === 'published') return `已发布 · 第 ${row.version} 版`
  return '尚未保存草稿'
}
function fmtTime(value) {
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value))
  return Number.isNaN(+date) ? '时间暂不可用' : date.toLocaleString('zh-CN', { hour12: false })
}

async function refreshStatus() {
  listLoading.value = true
  error.value = ''
  try {
    const rows = await listPacks()
    const map = {}
    for (const row of rows) map[row.key] = row
    statusMap.value = map
  } catch (e) {
    error.value = e
  } finally {
    listLoading.value = false
  }
}

async function loadHistory(key) {
  historyLoading.value = true
  historyError.value = ''
  previewing.value = null
  confirmRow.value = null
  try {
    historyRows.value = (await packHistory(key, 20)).slice().sort((a, b) => b.version - a.version)
  } catch (e) {
    historyError.value = e
    historyRows.value = []
  } finally {
    historyLoading.value = false
  }
}

function selectPack(key) {
  if (activeKey.value === key) return
  activeKey.value = key
  confirmPublishKey.value = ''
  loadHistory(key)
}

function describeVersion(data) {
  if (Array.isArray(data?.materials)) return `包含 ${data.materials.length} 种建筑材质设置。`
  if (Array.isArray(data?.chapters) && Array.isArray(data?.levels)) return `包含 ${data.chapters.length} 个章节和 ${data.levels.length} 个关卡。`
  if (Array.isArray(data?.blockTypes)) return `包含 ${data.blockTypes.length} 种方块及其属性设置。`
  if (Array.isArray(data?.items)) return `包含 ${data.items.length} 种道具设置。`
  if (Array.isArray(data?.skills)) return `包含 ${data.skills.length} 项技能设置。`
  if (Array.isArray(data?.pets)) return `包含 ${data.pets.length} 个伙伴设置。`
  if (Array.isArray(data?.ants)) return `包含 ${data.ants.length} 项敌人设置。`
  return '包含一组完整内容设置。'
}
function previewRow(row) {
  if (previewing.value === row) { previewing.value = null; return }
  previewing.value = row
  previewSummary.value = describeVersion(row.data)
}
function askPublish(key) {
  confirmPublishKey.value = key
  confirmRow.value = null
}
async function doQuickPublish() {
  const key = confirmPublishKey.value
  if (!key) return
  busyKey.value = key
  busyAction.value = 'publish'
  error.value = ''
  confirmPublishKey.value = ''
  try {
    const version = await publishPack(key)
    showNotice(`${PACK_META[key].label}已发布（第 ${version} 版），玩家下次启动时生效。`)
    await refreshStatus()
    if (key === activeKey.value) await loadHistory(key)
  } catch (e) {
    error.value = e
  } finally {
    busyKey.value = ''
    busyAction.value = ''
  }
}

function askRollback(row) {
  confirmPublishKey.value = ''
  confirmRow.value = row
}
async function doRollback() {
  if (!confirmRow.value) return
  const key = activeKey.value
  const version = confirmRow.value.version
  busyKey.value = key
  busyAction.value = 'rollback'
  error.value = ''
  try {
    const newVersion = await rollbackPack(key, version)
    showNotice(`${PACK_META[key].label}已回退到第 ${version} 版内容，并发布为新版本 ${newVersion}。`)
    confirmRow.value = null
    await refreshStatus()
    await loadHistory(key)
  } catch (e) {
    error.value = e
  } finally {
    busyKey.value = ''
    busyAction.value = ''
  }
}

onMounted(() => {
  refreshStatus()
  loadHistory(activeKey.value)
})
</script>

<style scoped>
.pc-page { max-width: 1120px; }
.pc-head-actions { display: flex; align-items: center; gap: 8px; }
.pc-mode-chip {
  padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: .04em;
  border: 1px solid #dbe4c9; color: #5c784b; background: #e8efe1;
}
.pc-mode-chip.supabase { border-color: #dbe4c9; color: #8da779; background: #edf1e6; }
.pc-hint { color: #737d67; font-size: 12px; margin: -6px 0 0; }

.pc-layout { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 14px; align-items: start; }
@media (max-width: 1000px) { .pc-layout { grid-template-columns: 1fr; } }

.pc-list h3, .pc-history h3 { margin: 0 0 10px; font-size: 13px; color: #4d5549; }
.pc-pack-list { display: grid; gap: 7px; }
.pc-pack-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 9px; min-width: 0; padding: 9px 10px; border: 1px solid #e2e2d8; border-radius: 3px; background: #fbfaf5; transition: border-color .15s, background .15s; }
.pc-pack-row:hover { border-color: #bec2b5; background: #fff; }
.pc-pack-row.on { border-color: #aab681; background: #eef0e4; }
.pc-pack-summary { display: flex; flex-direction: column; gap: 5px; min-width: 0; padding: 0; border: 0; color: inherit; background: transparent; cursor: pointer; text-align: left; }
.pc-pack-summary-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.pc-pack-summary-top > b { overflow: hidden; color: #20251f; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.pc-pack-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; color: #737b6e; font-size: 9px; line-height: 1.45; }
.pc-pack-meta time { font: inherit; }
.pc-pack-publish { flex: none; min-width: 76px; white-space: nowrap; }

.pc-status {
  flex: none; font-style: normal; font-size: 10px; line-height: 1.35; font-weight: 800; padding: 3px 7px; border-radius: 999px;
  background: #e7e6dd; color: #4d5549;
}
.pc-status.draft { background: #f5ebdc; color: #98602d; }
.pc-status.published { background: #e8efe1; color: #5c784b; }

.pc-history-hint { color: #838a7b; font-size: 11px; margin: 0 0 10px; }
.pc-history-table-wrap { max-width: 100%; min-width: 0; overflow-x: auto; overscroll-behavior-inline: contain; }
.pc-history-table-wrap :deep(.el-table) { min-width: 530px; }
.pc-current-badge {
  font-style: normal; margin-left: 6px; font-size: 10px; font-weight: 800; color: #5c784b;
  background: #e8efe1; border-radius: 4px; padding: 1px 6px;
}
.pc-history-op { display: flex; gap: 6px; }
.pc-btn-rollback { border-color: #e6bfb4; color: #b74337; }
.pc-btn-rollback:hover { background: #f6e5e1; }
.pc-preview-summary { margin: 10px 0 0; padding: 11px 12px; border-radius: 8px; border: 1px solid #d8d9cf; background: #f7f6ef; color: #4d5549; font-size: 12px; line-height: 1.7; }
.pc-btn-publish { border-color: #dbe4c9; color: #5c784b; }
.pc-btn-publish:hover { background: #e8efe1; }

.pc-confirm { border-color: #e6bfb4; display: flex; flex-direction: column; gap: 8px; }
.pc-confirm p { margin: 0; color: #41483d; font-size: 12px; line-height: 1.7; }
.pc-confirm-actions { display: flex; flex-wrap: wrap; gap: 8px; }

@media (max-width: 768px) {
  .pc-head-actions { margin-left: auto; }
  .pc-mode-chip { min-height: 36px; display: inline-flex; align-items: center; }
  .pc-pack-row { padding: 9px; }
  .pc-history-op { flex-wrap: wrap; }
  .pc-history-op .ad-btn { min-height: 44px; }
}
@media (max-width: 480px) {
  .pc-head-actions { width: 100%; justify-content: space-between; }
  .pc-head-actions .ad-btn { flex: 1; }
  .pc-history-op .ad-btn { flex: 1 1 100%; }
  .pc-confirm-actions .ad-btn { flex: 1 1 100%; }
}
</style>
