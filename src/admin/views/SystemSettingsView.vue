<template>
  <section class="ad-page ss-page">
    <header class="ad-page-head">
      <div>
        <h2>系统设置</h2>
        <p class="ss-subtitle">管理员目录（只读）与管理操作审计</p>
      </div>
      <button class="ad-btn" :disabled="refreshing" @click="refreshAll">
        {{ refreshing ? '刷新中…' : '刷新' }}
      </button>
    </header>

    <div class="ad-panel ss-notice">
      <b>{{ isMock ? '本地模拟模式' : '只读范围' }}</b>
      <p v-if="isMock">
        本地模拟环境没有 Supabase 管理员目录或服务端审计记录，因此此页不展示虚构数据；请配置 Supabase 后查看云端数据。
      </p>
      <p v-else>
        管理员账号仍通过 Supabase Dashboard + SQL 登记。本页只读展示账号；当前只有一个 super 管理员，暂不做角色权限管理界面。
      </p>
    </div>

    <section class="ad-panel ss-panel">
      <div class="ss-panel-head">
        <div>
          <h3>管理员账号 <span class="ss-readonly">只读</span></h3>
          <p>展示 admin_users 中已有账号，不提供增删改。</p>
        </div>
        <span class="ss-count">{{ accounts.length }} 个账号</span>
      </div>
      <p v-if="accountError" class="ad-error">读取管理员列表失败：{{ accountError }}</p>
      <p v-if="accountsLoading" class="ad-empty">正在读取管理员账号…</p>
      <p v-else-if="!accountError && isMock" class="ad-empty">本地模拟模式不包含 admin_users 数据。</p>
      <div v-else-if="!accountError && accounts.length" class="ss-table-wrap">
        <table class="ad-table">
          <thead>
            <tr><th>邮箱</th><th>角色</th><th>状态</th><th>创建时间</th></tr>
          </thead>
          <tbody>
            <tr v-for="admin in accounts" :key="admin.id">
              <td class="ss-email">{{ admin.email }}</td>
              <td><span class="ss-role">{{ roleLabel(admin.role) }}</span></td>
              <td><span class="ss-status" :class="admin.status">{{ statusLabel(admin.status) }}</span></td>
              <td class="ss-time">{{ formatTime(admin.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="!accountError" class="ad-empty">admin_users 中暂无账号。</p>
    </section>

    <section class="ad-panel ss-panel">
      <div class="ss-panel-head ss-audit-head">
        <div>
          <h3>审计日志</h3>
          <p>记录成功执行的管理端写操作；纯读取数（如关卡漏斗）不记录。结束日期包含整日。</p>
        </div>
        <span class="ss-count">{{ totalCount.toLocaleString() }} 条</span>
      </div>

      <form class="ss-filters" @submit.prevent="applyFilters">
        <label>
          <span>管理员</span>
          <select v-model="filters.adminId">
            <option value="">全部管理员</option>
            <option v-for="admin in accounts" :key="admin.id" :value="admin.id">
              {{ admin.email }}
            </option>
          </select>
        </label>
        <label>
          <span>开始日期</span>
          <input v-model="filters.from" type="date" />
        </label>
        <label>
          <span>结束日期</span>
          <input v-model="filters.to" type="date" />
        </label>
        <label>
          <span>操作类型</span>
          <select v-model="filters.action">
            <option value="">全部操作</option>
            <option v-for="action in actionOptions" :key="action.value" :value="action.value">
              {{ action.label }}
            </option>
          </select>
        </label>
        <div class="ss-filter-actions">
          <button class="ad-btn ss-primary" type="submit" :disabled="auditLoading">筛选</button>
          <button class="ad-btn" type="button" :disabled="auditLoading" @click="clearFilters">清除</button>
        </div>
      </form>

      <p v-if="auditError" class="ad-error">读取审计日志失败：{{ auditError }}</p>
      <p v-if="auditLoading" class="ad-empty">正在读取审计日志…</p>
      <p v-else-if="!auditError && isMock" class="ad-empty">本地模拟模式没有服务端审计日志。</p>
      <div v-else-if="!auditError && auditRows.length" class="ss-table-wrap">
        <table class="ad-table ss-audit-table">
          <thead>
            <tr><th>时间</th><th>管理员</th><th>操作</th><th>对象</th><th>参数摘要</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in auditRows" :key="row.id">
              <td class="ss-time">{{ formatTime(row.created_at) }}</td>
              <td class="ss-email">{{ row.admin_email || row.admin_id }}</td>
              <td>
                <span class="ss-action-label">{{ actionLabel(row.action) }}</span>
                <code class="ad-mono ss-action-code">{{ row.action }}</code>
              </td>
              <td class="ss-object">
                <span>{{ objectLabel(row.object_type) }}</span>
                <code class="ad-mono">{{ row.object_id || '—' }}</code>
              </td>
              <td>
                <details class="ss-params">
                  <summary>查看</summary>
                  <pre>{{ formatParameters(row.parameters) }}</pre>
                </details>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="!auditError" class="ad-empty">没有符合条件的审计记录。</p>

      <footer v-if="!isMock" class="ss-pagination">
        <span>第 {{ currentPage }} / {{ pageCount }} 页</span>
        <div>
          <button class="ad-btn sm" :disabled="auditLoading || currentPage <= 1" @click="previousPage">上一页</button>
          <button class="ad-btn sm" :disabled="auditLoading || currentPage >= pageCount" @click="nextPage">下一页</button>
        </div>
      </footer>
    </section>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { adminState } from '../api.js'
import { fetchAdminAccounts, fetchAdminAudit } from '../api/system.js'

const PAGE_SIZE = 25
const actionOptions = [
  { value: 'player.grant_coins', label: '玩家 · 补发金币' },
  { value: 'player.rename', label: '玩家 · 修改昵称' },
  { value: 'content.pack.save', label: '内容包 · 保存草稿' },
  { value: 'content.pack.publish', label: '内容包 · 发布' },
  { value: 'content.pack.rollback', label: '内容包 · 回滚' }
]
const roleNames = {
  super: '超级管理员',
  designer: '内容设计',
  ops: '运营',
  cs: '客服',
  viewer: '只读'
}
const isMock = computed(() => adminState.mode !== 'supabase')
const accounts = ref([])
const auditRows = ref([])
const totalCount = ref(0)
const accountsLoading = ref(false)
const auditLoading = ref(false)
const accountError = ref('')
const auditError = ref('')
const currentPage = ref(1)
const filters = reactive({ adminId: '', from: '', to: '', action: '' })
const pageCount = computed(() => Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE)))
const refreshing = computed(() => accountsLoading.value || auditLoading.value)

function roleLabel(role) {
  return roleNames[role] || role || '—'
}

function statusLabel(status) {
  if (status === 'active') return '启用'
  if (status === 'disabled' || status === 'inactive') return '停用'
  return status || '未知'
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date)
}

function formatParameters(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return String(value)
  }
}

function actionLabel(action) {
  return actionOptions.find((item) => item.value === action)?.label || '管理操作'
}

function objectLabel(type) {
  if (type === 'player') return '玩家'
  if (type === 'content_pack') return '内容包'
  return type || '对象'
}

function localDayStart(value, addDays = 0) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day + addDays, 0, 0, 0, 0).toISOString()
}

async function loadAccounts() {
  accountsLoading.value = true
  accountError.value = ''
  try {
    accounts.value = await fetchAdminAccounts()
  } catch (error) {
    accountError.value = String(error?.message || error)
    accounts.value = []
  } finally {
    accountsLoading.value = false
  }
}

async function loadAudit() {
  if (filters.from && filters.to && filters.from > filters.to) {
    auditError.value = '开始日期不能晚于结束日期。'
    auditRows.value = []
    totalCount.value = 0
    return
  }

  auditLoading.value = true
  auditError.value = ''
  try {
    const result = await fetchAdminAudit({
      adminId: filters.adminId || null,
      from: localDayStart(filters.from),
      to: localDayStart(filters.to, 1),
      action: filters.action || null,
      limit: PAGE_SIZE,
      offset: (currentPage.value - 1) * PAGE_SIZE
    })
    auditRows.value = result.items
    totalCount.value = result.totalCount
  } catch (error) {
    auditError.value = String(error?.message || error)
    auditRows.value = []
    totalCount.value = 0
  } finally {
    auditLoading.value = false
  }
}

async function refreshAll() {
  await Promise.all([loadAccounts(), loadAudit()])
}

function applyFilters() {
  currentPage.value = 1
  loadAudit()
}

function clearFilters() {
  filters.adminId = ''
  filters.from = ''
  filters.to = ''
  filters.action = ''
  currentPage.value = 1
  loadAudit()
}

function previousPage() {
  if (currentPage.value <= 1) return
  currentPage.value -= 1
  loadAudit()
}

function nextPage() {
  if (currentPage.value >= pageCount.value) return
  currentPage.value += 1
  loadAudit()
}

onMounted(refreshAll)
</script>

<style scoped>
.ss-page { max-width: 1180px; }
.ss-subtitle { margin: 5px 0 0; color: #6fa3c8; font-size: 12px; }
.ss-notice { border-color: #2b4560; background: linear-gradient(120deg, #122033, #111a26); }
.ss-notice b { color: #9dc8f1; font-size: 12px; }
.ss-notice p { margin: 6px 0 0; color: #91a8bf; font-size: 12px; line-height: 1.65; }
.ss-panel { min-width: 0; }
.ss-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.ss-panel-head h3 { margin: 0; color: #dce6f2; font-size: 14px; }
.ss-panel-head p { margin: 5px 0 0; color: #6f849a; font-size: 11px; line-height: 1.6; }
.ss-readonly { margin-left: 5px; padding: 2px 6px; border: 1px solid #365069; border-radius: 999px; color: #82acd0; font-size: 10px; font-weight: 600; vertical-align: 1px; }
.ss-count { flex: 0 0 auto; color: #8fa8c1; font-size: 11px; }
.ss-table-wrap { width: 100%; overflow-x: auto; }
.ss-email { overflow-wrap: anywhere; }
.ss-role, .ss-status { display: inline-block; padding: 2px 8px; border: 1px solid #28425b; border-radius: 999px; color: #b6d5f0; background: #142337; font-size: 11px; white-space: nowrap; }
.ss-status.active { border-color: #27513d; color: #8fd4a0; background: #14241c; }
.ss-status.disabled, .ss-status.inactive { border-color: #54343a; color: #e59b9b; background: #281a1d; }
.ss-time { min-width: 150px; white-space: nowrap; color: #9db4cc; font-size: 12px !important; }
.ss-audit-head { margin-bottom: 14px; }
.ss-filters { display: grid; grid-template-columns: repeat(4, minmax(130px, 1fr)) auto; align-items: end; gap: 9px; margin-bottom: 14px; }
.ss-filters label { display: flex; flex-direction: column; gap: 5px; color: #9db4cc; font-size: 11px; }
.ss-filters input, .ss-filters select {
  width: 100%; min-height: 34px; padding: 0 9px; border: 1px solid #2b3d52; border-radius: 7px;
  background: #0d1520; color: #dce6f2; font: inherit; font-size: 12px;
}
.ss-filters input:focus, .ss-filters select:focus { outline: 1px solid #2f81f7; border-color: #2f81f7; }
.ss-filter-actions { display: flex; gap: 7px; }
.ss-primary { border-color: #347ed4; background: #1b4c80; color: #fff; }
.ss-primary:hover { background: #225d98; }
.ss-action-label { display: block; min-width: 130px; color: #dce6f2; font-size: 12px; }
.ss-action-code { display: block; margin-top: 3px; }
.ss-object { min-width: 125px; }
.ss-object span, .ss-object code { display: block; }
.ss-object code { margin-top: 3px; overflow-wrap: anywhere; }
.ss-params { min-width: 60px; color: #9db4cc; font-size: 11px; }
.ss-params summary { cursor: pointer; color: #58a6ff; }
.ss-params pre { min-width: 190px; max-width: 320px; max-height: 180px; overflow: auto; margin: 7px 0 2px; padding: 8px; border: 1px solid #1e2a3a; border-radius: 6px; background: #0d1520; color: #b9c9db; font-size: 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
.ss-pagination { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 12px; color: #7f95ab; font-size: 11px; }
.ss-pagination > div { display: flex; gap: 7px; }
@media (max-width: 950px) {
  .ss-filters { grid-template-columns: repeat(2, minmax(130px, 1fr)); }
  .ss-filter-actions { grid-column: 1 / -1; }
}
@media (max-width: 600px) {
  .ss-panel-head { align-items: flex-start; }
  .ss-filters { grid-template-columns: 1fr; }
  .ss-filter-actions { grid-column: auto; }
  .ss-filter-actions .ad-btn { flex: 1; }
  .ss-pagination { align-items: flex-start; flex-direction: column; }
}
</style>
