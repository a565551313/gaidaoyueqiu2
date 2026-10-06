<template>
  <section class="ad-page pc-page">
    <header class="ad-page-head">
      <div>
        <h2>发布中心 <span class="pc-subtitle">内容包历史与回滚</span></h2>
        <p class="pc-lead">选择内容包查看每次保存的快照；回滚会以新版本立即发布，玩家下次启动即可收到。</p>
      </div>
      <button class="ad-btn" :disabled="loading || rollingVersion !== null" @click="refresh">{{ loading ? '刷新中…' : '刷新' }}</button>
    </header>

    <p v-if="error" class="ad-error">{{ error }}</p>
    <p v-if="notice" class="ad-ok">{{ notice }}</p>

    <p class="pc-mode" :class="adminState.mode">
      {{ adminState.mode === 'supabase' ? 'Supabase 云端：回滚由原子 RPC 保存新版本并发布。' : '本地模拟：历史快照与玩家内容缓存都在当前浏览器；可直接完成端到端验收。' }}
    </p>

    <div class="pc-layout">
      <aside class="ad-panel pc-packs" aria-label="内容包列表">
        <h3>内容包（{{ packRows.length }}）</h3>
        <p v-if="loading && !packRows.length" class="ad-empty">加载中…</p>
        <button
          v-for="pack in packRows"
          :key="pack.key"
          class="pc-pack"
          :class="{ on: selectedKey === pack.key }"
          @click="selectPack(pack.key)"
        >
          <span class="pc-pack-title">{{ PACK_META[pack.key]?.label || pack.key }}</span>
          <small><code>{{ pack.key }}</code> · {{ statusText(pack.status) }}</small>
          <em :class="pack.status">{{ pack.version ? `v${pack.version}` : '未初始化' }}</em>
        </button>
      </aside>

      <main class="pc-main">
        <section class="ad-panel pc-current">
          <div>
            <h3>{{ selectedMeta.label }} <code>{{ selectedKey }}</code></h3>
            <p>{{ selectedMeta.desc }}</p>
          </div>
          <div class="pc-current-state">
            <b :class="selectedStatus.status">{{ statusText(selectedStatus.status) }}</b>
            <span>{{ selectedStatus.version ? `当前版本 v${selectedStatus.version}` : '尚无草稿' }}</span>
          </div>
        </section>

        <section class="ad-panel pc-history">
          <header class="pc-history-head">
            <div>
              <h3>历史版本</h3>
              <p>每次保存草稿都会生成不可变快照。回滚不会覆盖旧记录，而会创建并发布更高的新版本。</p>
            </div>
            <span class="pc-count">{{ historyRows.length }} 条</span>
          </header>

          <p v-if="historyLoading" class="ad-empty">正在读取历史版本…</p>
          <p v-else-if="!historyRows.length" class="ad-empty">这个内容包还没有历史快照。请先在内容工厂保存草稿。</p>
          <div v-else class="pc-table-wrap">
            <table class="ad-table">
              <thead>
                <tr>
                  <th>历史版本</th>
                  <th>保存时间</th>
                  <th>内容摘要</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in historyRows" :key="`${row.version}:${row.updated_at}`">
                  <td class="ad-mono">v{{ row.version }}</td>
                  <td>{{ formatTime(row.updated_at) }}</td>
                  <td class="pc-summary">{{ dataSummary(row.data) }}</td>
                  <td class="pc-actions">
                    <button class="ad-btn sm" @click="togglePreview(row.version)">{{ previewVersion === row.version ? '收起内容' : '查看内容' }}</button>
                    <button
                      class="ad-btn sm pc-rollback"
                      :disabled="rollingVersion !== null"
                      @click="rollback(row)"
                    >
                      {{ rollingVersion === row.version ? '回滚发布中…' : '回滚并发布' }}
                    </button>
                  </td>
                </tr>
                <tr v-if="previewRow">
                  <td colspan="4" class="pc-preview-cell">
                    <pre class="ad-json">{{ JSON.stringify(previewRow.data, null, 2) }}</pre>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>

    <p class="ad-note">
      回滚影响的是所选内容包；未发布的其它包保持不变。版本号始终递增，避免已启动玩家因缓存版本较高而忽略回滚内容。
    </p>
  </section>
</template>

<script setup>
// T6 发布中心：历史只读展示 + 一键回滚。
// rollbackPack 在云端调用 admin_rollback_pack（同一数据库事务完成「存新草稿 + 发布」），
// 在 mock 模式模拟同一语义并同步写入玩家内容缓存。
import { computed, onMounted, ref } from 'vue'
import { adminState } from '../api.js'
import { PACK_KEYS, PACK_META, listPacks, packHistory, rollbackPack } from '../api/content.js'

const packRows = ref([])
const selectedKey = ref('levels')
const historyRows = ref([])
const loading = ref(false)
const historyLoading = ref(false)
const rollingVersion = ref(null)
const previewVersion = ref(null)
const error = ref('')
const notice = ref('')

const selectedMeta = computed(() => PACK_META[selectedKey.value] || { label: selectedKey.value, desc: '' })
const selectedStatus = computed(() => packRows.value.find((row) => row.key === selectedKey.value) || {
  key: selectedKey.value, status: 'empty', version: 0
})
const previewRow = computed(() => historyRows.value.find((row) => row.version === previewVersion.value) || null)

function statusText(status) {
  if (status === 'published') return '已发布'
  if (status === 'draft') return '有未发布草稿'
  return '未初始化'
}

function normaliseRows(rows) {
  const byKey = new Map((rows || []).map((row) => [row.key, row]))
  return PACK_KEYS.map((key) => byKey.get(key) || ({ key, status: 'empty', version: 0, updated_at: null }))
}

async function loadHistory() {
  historyLoading.value = true
  previewVersion.value = null
  try {
    historyRows.value = await packHistory(selectedKey.value, 100)
  } catch (e) {
    historyRows.value = []
    error.value = `读取 ${selectedMeta.value.label} 历史失败：${String(e?.message || e)}`
  } finally {
    historyLoading.value = false
  }
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    packRows.value = normaliseRows(await listPacks())
    if (!packRows.value.some((row) => row.key === selectedKey.value)) selectedKey.value = PACK_KEYS[0]
    await loadHistory()
  } catch (e) {
    error.value = `读取发布状态失败：${String(e?.message || e)}`
  } finally {
    loading.value = false
  }
}

async function selectPack(key) {
  if (key === selectedKey.value) return
  selectedKey.value = key
  error.value = ''
  notice.value = ''
  await loadHistory()
}

function togglePreview(version) {
  previewVersion.value = previewVersion.value === version ? null : version
}

function dataSummary(data) {
  if (Array.isArray(data)) return `数组 · ${data.length} 项`
  if (data && typeof data === 'object') {
    const keys = Object.keys(data)
    return keys.length ? `对象 · ${keys.length} 个字段（${keys.slice(0, 3).join('、')}${keys.length > 3 ? '…' : ''}）` : '空对象'
  }
  return String(data)
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(+date) ? String(value) : date.toLocaleString('zh-CN', { hour12: false })
}

async function rollback(row) {
  const label = selectedMeta.value.label
  const message = `确定回滚「${label}」到历史快照 v${row.version} 吗？\n\n系统会创建并立即发布一个更高的新版本；玩家下次启动将收到该版本。`
  if (!window.confirm(message)) return

  rollingVersion.value = row.version
  error.value = ''
  notice.value = ''
  try {
    const newVersion = await rollbackPack(selectedKey.value, row.version)
    notice.value = adminState.mode === 'supabase'
      ? `已将「${label}」回滚到 v${row.version} 的内容，并发布为新版本 v${newVersion}。`
      : `已将「${label}」回滚到 v${row.version} 的内容，并发布为新版本 v${newVersion}；刷新游戏首页即可验证。`
    await refresh()
  } catch (e) {
    error.value = `回滚失败：${String(e?.message || e)}`
  } finally {
    rollingVersion.value = null
  }
}

onMounted(refresh)
</script>

<style scoped>
.pc-page { max-width: 1180px; }
.pc-subtitle { margin-left: 8px; color: #7d94ac; font-size: 11px; font-weight: 700; vertical-align: 2px; }
.pc-lead { margin: 6px 0 0; color: #6fa3c8; font-size: 12px; line-height: 1.6; }
.pc-mode { margin: -7px 0 0; color: #8fb98d; font-size: 11px; }
.pc-mode.supabase { color: #6fc2b0; }
.pc-layout { display: grid; grid-template-columns: 232px minmax(0, 1fr); gap: 12px; align-items: start; }
.pc-packs { display: flex; flex-direction: column; gap: 6px; padding: 12px; position: sticky; top: 16px; }
.pc-packs h3 { margin: 1px 4px 6px; }
.pc-pack { position: relative; display: flex; flex-direction: column; gap: 3px; width: 100%; padding: 10px 11px; border: 1px solid #1e2a3a; border-radius: 8px; background: #0d1520; color: #b9c9db; text-align: left; cursor: pointer; }
.pc-pack:hover { background: #14202e; }
.pc-pack.on { border-color: #2f81f7; background: #1b2c41; box-shadow: inset 2px 0 0 #2f81f7; }
.pc-pack-title { padding-right: 46px; color: #dce6f2; font-size: 12px; font-weight: 800; }
.pc-pack small { color: #6fa3c8; font-size: 10px; }
.pc-pack code, .pc-current code { color: #58a6ff; font-size: 10px; }
.pc-pack em { position: absolute; right: 8px; top: 10px; border-radius: 4px; padding: 2px 5px; font-size: 9px; font-style: normal; font-weight: 800; }
.pc-pack em.empty { color: #7d94ac; background: #1a2534; }
.pc-pack em.draft { color: #ffd36e; background: #2b2613; }
.pc-pack em.published { color: #8fd4a0; background: #14201a; }
.pc-main { display: flex; min-width: 0; flex-direction: column; gap: 12px; }
.pc-current { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.pc-current h3 { margin: 0 0 5px; color: #dce6f2; }
.pc-current p { max-width: 600px; margin: 0; color: #9db4cc; font-size: 12px; line-height: 1.6; }
.pc-current-state { display: flex; min-width: 104px; flex-direction: column; align-items: flex-end; gap: 4px; color: #7d94ac; font-size: 11px; text-align: right; }
.pc-current-state b { color: #7d94ac; font-size: 12px; }
.pc-current-state b.draft { color: #e3b341; }
.pc-current-state b.published { color: #8fd4a0; }
.pc-history-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.pc-history-head h3 { margin: 0 0 4px; }
.pc-history-head p { margin: 0; color: #6fa3c8; font-size: 11px; line-height: 1.6; }
.pc-count { flex: none; padding: 3px 8px; border: 1px solid #2b3d52; border-radius: 999px; color: #9db4cc; font-size: 10px; }
.pc-table-wrap { overflow-x: auto; }
.pc-history .ad-table { min-width: 660px; }
.pc-summary { max-width: 300px; color: #9db4cc; font-size: 11px; }
.pc-actions { display: flex; gap: 6px; white-space: nowrap; }
.pc-rollback { border-color: #2ea043; color: #9fdca8; }
.pc-rollback:hover { background: #153421; }
.pc-preview-cell { padding: 0 !important; background: #0d1520; }
.pc-preview-cell .ad-json { max-height: 300px; margin: 10px 12px; }
@media (max-width: 800px) {
  .pc-layout { grid-template-columns: 1fr; }
  .pc-packs { position: static; display: grid; grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); }
  .pc-packs h3, .pc-packs .ad-empty { grid-column: 1 / -1; }
  .pc-current { flex-direction: column; }
  .pc-current-state { align-items: flex-start; text-align: left; }
}
</style>
