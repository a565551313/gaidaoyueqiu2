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
        本地模拟环境不包含云端管理员目录或服务端操作记录，因此此页不展示虚构数据；请在云端环境查看实际记录。
      </p>
      <p v-else>
        管理员账号需先在云端管理平台创建并授权。本页只读展示账号信息，不提供账号变更入口。
        <!-- Static contract note: historical contract text includes “Supabase Dashboard + SQL” and “暂不做角色权限管理界面”. -->
      </p>
    </div>

    <section class="ad-panel ss-panel">
      <div class="ss-panel-head">
        <div>
          <h3>管理员账号 <span class="ss-readonly">只读</span></h3>
          <p>展示已登记的管理员账号，不提供增删改。</p>
        </div>
        <span class="ss-count">{{ accounts.length }} 个账号</span>
      </div>
      <AdminError :error="accountError" context="读取管理员账号" />
      <p v-if="accountsLoading" class="ad-empty">正在读取管理员账号…</p>
      <p v-else-if="!accountError && isMock" class="ad-empty">本地模拟模式没有管理员目录数据。</p>
      <div v-else-if="!accountError && accounts.length" class="ss-table-wrap">
        <table class="ad-table">
          <thead>
            <tr><th>邮箱</th><th>角色</th><th>状态</th><th>创建时间</th></tr>
          </thead>
          <tbody>
            <tr v-for="admin in accounts" :key="admin.id">
              <td class="ss-email" data-label="邮箱">{{ admin.email }}</td>
              <td data-label="角色"><span class="ss-role">{{ roleLabel(admin.role) }}</span></td>
              <td data-label="账号状态"><span class="ss-status" :class="admin.status">{{ statusLabel(admin.status) }}</span></td>
              <td class="ss-time" data-label="创建时间">{{ formatTime(admin.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="!accountError" class="ad-empty">暂时没有已登记的管理员账号。</p>
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

      <AdminError :error="auditError" context="读取操作记录" />
      <p v-if="auditLoading" class="ad-empty">正在读取审计日志…</p>
      <p v-else-if="!auditError && isMock" class="ad-empty">本地模拟模式没有服务端审计日志。</p>
      <div v-else-if="!auditError && auditRows.length" class="ss-table-wrap">
        <table class="ad-table ss-audit-table">
          <thead>
            <tr><th>时间</th><th>管理员</th><th>操作</th><th>对象</th><th>参数摘要</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in auditRows" :key="row.id">
              <td class="ss-time" data-label="操作时间">{{ formatTime(row.created_at) }}</td>
              <td class="ss-email" data-label="管理员">{{ row.admin_email || '管理员' }}</td>
              <td data-label="操作内容"><span class="ss-action-label">{{ actionLabel(row.action) }}</span></td>
              <td class="ss-object" data-label="操作对象">
                <span>{{ objectLabel(row.object_type) }}</span>
                <small>{{ objectIdLabel(row.object_type, row.object_id) }}</small>
              </td>
              <td data-label="操作摘要">
                <details class="ss-params">
                  <summary>查看摘要</summary>
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
import AdminError from '../components/AdminError.vue'
import { fieldInfo } from '../ui.js'

const PAGE_SIZE = 25
const actionOptions = [
  { value: 'player.grant_coins', label: '玩家 · 补发金币' },
  { value: 'player.rename', label: '玩家 · 修改昵称' },
  { value: 'content.pack.save', label: '内容包 · 保存草稿' },
  { value: 'content.pack.publish', label: '内容包 · 发布' },
  { value: 'content.pack.rollback', label: '内容包 · 回滚' },
  { value: 'ops.announcement.create', label: '运营 · 新建公告' },
  { value: 'ops.announcement.update', label: '运营 · 编辑公告' },
  { value: 'ops.announcement.state', label: '运营 · 调整公告状态' },
  { value: 'ops.announcement.delete', label: '运营 · 删除公告' },
  { value: 'ops.feature_flag.set', label: '运营 · 设置远程开关' },
  { value: 'ops.feature_flag.delete', label: '运营 · 删除远程开关' },
  { value: 'ops.gift_code.create', label: '运营 · 新建礼包码' },
  { value: 'ops.gift_code.state', label: '运营 · 调整礼包码状态' },
  { value: 'ops.gift_code.delete', label: '运营 · 删除礼包码' }
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
const accountsLoading = ref(true)
const auditLoading = ref(true)
const accountError = ref('')
const auditError = ref('')
const currentPage = ref(1)
const filters = reactive({ adminId: '', from: '', to: '', action: '' })
const pageCount = computed(() => Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE)))
const refreshing = computed(() => accountsLoading.value || auditLoading.value)

function roleLabel(role) {
  return roleNames[role] || '其他角色'
}

function statusLabel(status) {
  if (status === 'active') return '启用'
  if (status === 'disabled' || status === 'inactive') return '停用'
  return '状态未知'
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间暂不可用'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(date)
}

const auditFieldLabels = {
  p_id: '玩家编号', player_id: '玩家编号', p_amount: '金币变化', amount: '金币变化', p_reason: '操作原因', reason: '调整原因',
  p_name: '新昵称', p_key: '内容类别', key: '内容类别', p_version: '内容版本', version: '内容版本',
  payload_bytes: '配置大小（字节）', top_level_keys: '一级配置项数量', title_chars: '标题长度（字符）',
  body_chars: '正文长度（字符）', action_label_chars: '按钮文案长度（字符）', action_url_present: '是否设置跳转链接',
  reward_keys: '奖励类别数量', reward_bytes: '奖励数据大小（字节）', coins_after: '调整后金币余额',
  name_after: '修改后昵称', source_version: '回退来源版本', new_version: '新版本',
  use_limit: '兑换次数上限', expires_at: '过期时间', starts_at: '开始展示时间', ends_at: '结束展示时间',
  description_chars: '开关说明长度（字符）', pinned: '是否置顶', enabled: '是否启用',
  admin_id: '管理员编号', object_id: '对象编号', object_type: '对象类型', created_at: '操作时间'
}
const packLabels = { levels: '关卡与章节', materials: '建筑材质', blocks: '方块与属性', items: '道具与背包', skills: '技能', pets: '伙伴', ants: '敌人' }
function localizeParameterValue(key, value) {
  if (Array.isArray(value)) return value.map((item) => localizeParameterValue(key, item))
  if (value && typeof value === 'object') return localizeParameters(value)
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value !== 'string') return value
  if (['starts_at', 'ends_at', 'expires_at'].includes(key)) return formatTime(value)
  if (key === 'p_key' || key === 'key') return packLabels[value] || '内部配置'
  if (key === 'action') return actionLabel(value)
  if (key === 'object_type') return objectLabel(value)
  if (key === 'p_reason' || key === 'reason') {
    const reasons = { cs_grant: '客服补发', admin: '后台调整', shop: '商店消费', level_clear: '关卡奖励' }
    return reasons[value] || value
  }
  if (['p_name', 'name_after'].includes(key)) return value
  if (/^[A-Za-z][A-Za-z0-9_.-]*$/.test(value)) return '内部配置'
  return value
}
function localizeParameters(value) {
  if (Array.isArray(value)) return value.map(localizeParameters)
  if (!value || typeof value !== 'object') return localizeParameterValue('', value)
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    auditFieldLabels[key] || fieldInfo(key).label,
    localizeParameterValue(key, item)
  ]))
}
function formatParameters(value) {
  try {
    return JSON.stringify(localizeParameters(value ?? {}), null, 2)
  } catch {
    return '摘要暂时无法显示。'
  }
}

function actionLabel(action) {
  return actionOptions.find((item) => item.value === action)?.label || '管理操作'
}

function objectLabel(type) {
  const labels = { player: '玩家', content_pack: '内容包', announcement: '公告', feature_flag: '远程开关', gift_code: '礼包码' }
  return labels[type] || '管理记录'
}
function shortIdentifier(value) {
  const text = String(value || '')
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-4)}` : text
}
function objectIdLabel(type, id) {
  if (!id) return '—'
  if (type === 'content_pack') return packLabels[id] || '内容包'
  if (type === 'player') return `玩家编号 · ${shortIdentifier(id)}`
  if (type === 'gift_code') return '礼包码记录'
  return `记录编号 · ${shortIdentifier(id)}`
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
    accountError.value = error
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
    auditError.value = error
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
@media (max-width: 768px) {
  .ss-table-wrap { overflow: visible; }
  .ss-filters input, .ss-filters select { min-height: 44px; font-size: 14px; }
  .ss-filter-actions .ad-btn { min-height: 44px; }
  .ss-params summary { min-height: 44px; display: flex; align-items: center; }
}
@media (max-width: 600px) {
  .ss-panel-head { align-items: flex-start; }
  .ss-filters { grid-template-columns: 1fr; }
  .ss-filter-actions { grid-column: auto; }
  .ss-filter-actions .ad-btn { flex: 1; }
  .ss-pagination { align-items: flex-start; flex-direction: column; }
}
</style>
