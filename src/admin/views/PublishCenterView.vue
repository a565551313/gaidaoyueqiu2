<template>
  <section class="ad-page pc-page">
    <header class="ad-page-head">
      <h2>发布中心</h2>
      <span class="pc-mode-chip" :class="modeClass">{{ modeTitle }}</span>
    </header>

    <p class="pc-hint">{{ modeHint }}</p>
    <p v-if="error" class="ad-error">{{ error }}</p>
    <p v-if="notice" class="ad-ok">{{ notice }}</p>

    <div class="pc-layout">
      <!-- 左：7 个内容包总览（状态 + 快捷发布） -->
      <div class="ad-panel pc-list">
        <h3>内容包总览</h3>
        <table class="ad-table">
          <thead>
            <tr><th>包</th><th>状态</th><th>版本</th><th>更新时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in packRows" :key="row.key" :class="{ on: activeKey === row.key }" @click="selectPack(row.key)">
              <td>
                <b>{{ PACK_META[row.key].label }}</b>
                <code class="ad-mono">{{ row.key }}</code>
              </td>
              <td><em class="pc-status" :class="row.status">{{ statusText(row) }}</em></td>
              <td class="ad-mono">v{{ row.version }}</td>
              <td>{{ row.updated_at ? fmtTime(row.updated_at) : '—' }}</td>
              <td>
                <button
                  class="ad-btn sm"
                  :disabled="row.status !== 'draft' || busyKey === row.key"
                  @click.stop="quickPublish(row.key)"
                >
                  {{ busyKey === row.key && busyAction === 'publish' ? '发布中…' : '发布草稿' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 右：选中包的历史版本 + 一键回滚 -->
      <div class="ad-panel pc-history">
        <h3>{{ PACK_META[activeKey].label }} · 历史版本</h3>
        <p class="pc-history-hint">{{ historyHint }}</p>
        <p v-if="historyLoading" class="ad-empty">载入中…</p>
        <p v-else-if="historyError" class="ad-error">{{ historyError }}</p>
        <p v-else-if="!historyRows.length" class="ad-empty">还没有任何版本记录</p>
        <table v-else class="ad-table">
          <thead>
            <tr><th>版本</th><th>时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in historyRows" :key="row.version">
              <td class="ad-mono">
                v{{ row.version }}
                <em v-if="row.version === publishedVersion" class="pc-current-badge">当前已发布</em>
              </td>
              <td>{{ fmtTime(row.updated_at) }}</td>
              <td class="pc-history-op">
                <button class="ad-btn sm" @click="previewRow(row)">{{ previewing === row ? '收起' : '查看' }}</button>
                <button
                  class="ad-btn sm pc-btn-rollback"
                  :disabled="row.version === publishedVersion || (busyKey === activeKey && busyAction === 'rollback')"
                  @click="askRollback(row)"
                >
                  回滚到此版本
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <pre v-if="previewing" class="ad-json pc-preview-json">{{ previewJson }}</pre>
      </div>
    </div>

    <!-- 回滚二次确认 -->
    <div v-if="confirmRow" class="ad-panel pc-confirm">
      <b>确认把「{{ PACK_META[activeKey].label }}」回滚到 v{{ confirmRow.version }}？</b>
      <p>
        将把 v{{ confirmRow.version }} 的内容立即变成新草稿并同步发布（新版本号自动递增，历史版本不会丢失）。
        <b>回滚后玩家下次启动生效。</b>
        <template v-if="isMock">（本地模拟模式：回滚会同步写入本机玩家内容缓存，刷新游戏首页 / 立即可验证）</template>
      </p>
      <div class="pc-confirm-actions">
        <button class="ad-btn pc-btn-rollback" :disabled="busyKey === activeKey && busyAction === 'rollback'" @click="doRollback">
          {{ busyKey === activeKey && busyAction === 'rollback' ? '回滚中…' : '确认回滚' }}
        </button>
        <button class="ad-btn" @click="confirmRow = null">取消</button>
      </div>
    </div>
  </section>
</template>

<script setup>
// 发布中心（T6）：内容包历史版本列表 + 一键回滚。
// 数据层只调用 ../api/content.js 的导出（PACK_KEYS/PACK_META/listPacks/publishPack/
// packHistory/rollbackPack），不自己发 RPC、不自己读写 localStorage —— 与内容工厂（T4）同规则。
import { computed, onMounted, ref } from 'vue'
import { PACK_KEYS, PACK_META, listPacks, publishPack, packHistory, rollbackPack } from '../api/content.js'
import { adminState } from '../api.js'

const isMock = computed(() => adminState.mode !== 'supabase')
const modeClass = computed(() => (isMock.value ? 'mock' : 'supabase'))
const modeTitle = computed(() => (isMock.value ? '本地模拟（mock）' : 'Supabase 云端'))
const modeHint = computed(() => (isMock.value
  ? '本地模拟模式：回滚会直接写入本机草稿与已发布区，并同步写入玩家内容缓存 —— 刷新游戏首页（/）立即可验证。'
  : 'Supabase 云端模式：回滚走 admin_rollback_pack RPC（0004 迁移）；回滚后对全部玩家下次启动生效。'))
const historyHint = computed(() => (isMock.value
  ? '本地模拟模式下每次「保存草稿」都会落一条历史快照（见 api/content.js），可完整回滚。'
  : '每次保存草稿都会在 content_pack_versions 落一条快照，回滚不会覆盖或删除历史行。'))

const statusMap = ref({})
const activeKey = ref(PACK_KEYS[0])
const error = ref('')
const notice = ref('')
const busyKey = ref('')
const busyAction = ref('')

const historyLoading = ref(false)
const historyError = ref('')
const historyRows = ref([])
const previewing = ref(null)
const previewJson = ref('')
const confirmRow = ref(null)

const packRows = computed(() => PACK_KEYS.map((key) => statusMap.value[key] || { key, status: 'empty', version: 0, updated_at: null }))
const publishedVersion = computed(() => {
  const row = statusMap.value[activeKey.value]
  // status === 'published' 时草稿即已发布，版本号就是已发布版本；
  // status === 'draft' 时已发布版本比草稿低，这里的 row.version 取的是两者较大值（草稿），
  // 所以只在非 draft 时把它当「当前已发布版本」用于历史表里标「当前已发布」徽标。
  return row && row.status !== 'draft' ? row.version : -1
})

function statusText(row) {
  if (row.status === 'draft') return `草稿 v${row.version}`
  if (row.status === 'published') return `已发布 v${row.version}`
  return '未初始化'
}
function fmtTime(v) {
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  return Number.isNaN(+d) ? String(v) : d.toLocaleString('zh-CN', { hour12: false })
}

async function refreshStatus() {
  try {
    const rows = await listPacks()
    const m = {}
    for (const r of rows) m[r.key] = r
    statusMap.value = m
  } catch (e) {
    error.value = `读取包列表失败：${e?.message || e}`
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
    historyError.value = String(e?.message || e)
    historyRows.value = []
  } finally {
    historyLoading.value = false
  }
}

function selectPack(key) {
  if (activeKey.value === key) return
  activeKey.value = key
  loadHistory(key)
}

function previewRow(row) {
  if (previewing.value === row) { previewing.value = null; return }
  previewing.value = row
  previewJson.value = JSON.stringify(row.data, null, 2)
}

async function quickPublish(key) {
  busyKey.value = key
  busyAction.value = 'publish'
  error.value = ''
  notice.value = ''
  try {
    const version = await publishPack(key)
    notice.value = `${PACK_META[key].label} 已发布 v${version}`
    await refreshStatus()
    if (key === activeKey.value) await loadHistory(key)
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    busyKey.value = ''
    busyAction.value = ''
  }
}

function askRollback(row) {
  confirmRow.value = row
}

async function doRollback() {
  if (!confirmRow.value) return
  const key = activeKey.value
  const version = confirmRow.value.version
  busyKey.value = key
  busyAction.value = 'rollback'
  error.value = ''
  notice.value = ''
  try {
    const newVersion = await rollbackPack(key, version)
    notice.value = `${PACK_META[key].label} 已回滚到 v${version} 的内容（新版本 v${newVersion}，已发布）`
    confirmRow.value = null
    await refreshStatus()
    await loadHistory(key)
  } catch (e) {
    error.value = String(e?.message || e)
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
.pc-mode-chip {
  padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: .04em;
  border: 1px solid #8fb98d55; color: #8fd4a0; background: #14201a;
}
.pc-mode-chip.supabase { border-color: #6fc2b055; color: #6fc2b0; background: #0f1e1b; }
.pc-hint { color: #6fa3c8; font-size: 12px; margin: -6px 0 0; }

.pc-layout { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; align-items: start; }
@media (max-width: 1000px) { .pc-layout { grid-template-columns: 1fr; } }

.pc-list h3, .pc-history h3 { margin: 0 0 10px; font-size: 13px; color: #9db4cc; }
.pc-list tbody tr { cursor: pointer; }
.pc-list tbody tr:hover { background: #0f1826; }
.pc-list tbody tr.on { background: #16283f; }

.pc-status {
  font-style: normal; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 999px;
  background: #1a2534; color: #9db4cc;
}
.pc-status.draft { background: #332a14; color: #e0b95c; }
.pc-status.published { background: #14241c; color: #8fd4a0; }

.pc-history-hint { color: #5c7288; font-size: 11px; margin: 0 0 10px; }
.pc-current-badge {
  font-style: normal; margin-left: 6px; font-size: 10px; font-weight: 800; color: #8fd4a0;
  background: #14241c; border-radius: 4px; padding: 1px 6px;
}
.pc-history-op { display: flex; gap: 6px; }
.pc-btn-rollback { border-color: #7a3a3a; color: #ffb3b3; }
.pc-btn-rollback:hover { background: #2a1414; }
.pc-preview-json { margin-top: 10px; max-height: 260px; }

.pc-confirm { border-color: #7a3a3a; display: flex; flex-direction: column; gap: 8px; }
.pc-confirm p { margin: 0; color: #cdd9e6; font-size: 12px; line-height: 1.7; }
.pc-confirm-actions { display: flex; gap: 8px; }
</style>
