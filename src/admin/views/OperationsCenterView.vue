<template>
  <section class="ad-page ops-page">
    <header class="ad-page-head">
      <div>
        <h2>运营中心</h2>
        <p class="ops-subtitle">公告、远程开关与礼包码管理</p>
      </div>
      <el-button class="ad-btn" :disabled="loading" @click="refreshAll">{{ loading ? '同步中…' : '刷新列表' }}</el-button>
    </header>

    <div class="ops-mode-note">
      <b>{{ adminState.mode === 'supabase' ? '云端模式' : '本地模拟' }}</b>
      <span>公告与远程开关会在玩家启动时读取；云端配置不可用时会使用备用公告内容。当前未接入分组实验功能。</span>
    </div>

    <AdminToast :message="notice" />
    <AdminError :error="error" context="运营操作" />

    <nav class="ops-tabs" aria-label="运营管理分类">
      <el-button native-type="button" :class="{ active: tab === 'announcements' }" :aria-current="tab === 'announcements' ? 'page' : undefined" @click="tab = 'announcements'">公告管理 <small>{{ announcements.length }}</small></el-button>
      <el-button native-type="button" :class="{ active: tab === 'flags' }" :aria-current="tab === 'flags' ? 'page' : undefined" @click="tab = 'flags'">远程开关 <small>{{ featureFlags.length }}</small></el-button>
      <el-button native-type="button" :class="{ active: tab === 'giftCodes' }" :aria-current="tab === 'giftCodes' ? 'page' : undefined" @click="tab = 'giftCodes'">礼包码 <small>{{ giftCodes.length }}</small></el-button>
    </nav>

    <template v-if="tab === 'announcements'">
      <div class="ops-layout">
        <form class="ad-panel ops-editor" @submit.prevent="saveAnnouncement">
          <div class="ops-panel-head">
            <div><h3>{{ editingAnnouncementId ? '编辑公告' : '新建公告' }}</h3><small>玩家启动时展示；可设置展示时段和跳转入口。</small></div>
            <el-button v-if="editingAnnouncementId" class="ad-btn sm" native-type="button" @click="resetAnnouncementForm">新建</el-button>
          </div>
          <label class="ops-field">
            <span>公告编号 <i>系统生成</i></span>
            <el-input v-model.trim="announcementForm.id" required maxlength="80" readonly aria-label="公告编号" placeholder="自动生成" />
            <small>编号由系统按日期自动生成；编辑现有公告时会沿用原编号。</small>
          </label>
          <label class="ops-field">
            <span>标题</span>
            <el-input v-model.trim="announcementForm.title" required maxlength="120" show-word-limit placeholder="输入玩家看到的标题" />
            <small>最多 120 个字符。</small>
          </label>
          <label class="ops-field">
            <span>公告正文</span>
            <el-input v-model.trim="announcementForm.body" type="textarea" required maxlength="4000" :rows="5" show-word-limit placeholder="输入公告正文" />
            <small>最多 4,000 个字符，支持换行。</small>
          </label>
          <div class="ops-field-row">
            <label class="ops-field">
              <span>按钮文案 <i>选填</i></span>
              <el-input v-model.trim="announcementForm.actionLabel" maxlength="80" placeholder="例如：查看详情" />
              <small>玩家点击公告按钮时看到的文字。</small>
            </label>
            <label class="ops-field">
              <span>跳转链接 <i>仅安全网页链接</i></span>
              <el-input v-model.trim="announcementForm.actionUrl" type="url" placeholder="https://…" />
              <small>仅支持以安全网页协议开头的链接。</small>
            </label>
          </div>
          <div class="ops-field-row">
            <label class="ops-field">
              <span>开始展示时间 <i>选填</i></span>
              <el-date-picker v-model="announcementForm.startsAt" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DDTHH:mm" placeholder="选择开始时间" clearable />
              <small>留空表示保存后立即可展示。</small>
            </label>
            <label class="ops-field">
              <span>结束展示时间 <i>选填</i></span>
              <el-date-picker v-model="announcementForm.endsAt" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DDTHH:mm" placeholder="选择结束时间" clearable />
              <small>留空表示不自动结束。</small>
            </label>
          </div>
          <div class="ops-checks">
            <label><el-switch v-model="announcementForm.pinned" /> 置顶显示</label>
            <label><el-switch v-model="announcementForm.enabled" /> 启用（玩家可见）</label>
          </div>
          <div class="ops-actions">
            <el-button class="ad-btn primary" type="primary" native-type="submit" :loading="saving" :disabled="saving">{{ saving ? '保存中…' : (editingAnnouncementId ? '保存修改' : '创建公告') }}</el-button>
            <el-button v-if="editingAnnouncementId" native-type="button" @click="resetAnnouncementForm">取消编辑</el-button>
          </div>
        </form>

        <div class="ad-panel ops-list-panel">
          <div class="ops-panel-head"><div><h3>公告列表</h3><small>置顶公告优先；停用或未到展示时间的公告不会发给玩家。</small></div></div>
          <p v-if="loading" class="ad-empty">正在同步公告列表…</p>
          <div v-else-if="!announcements.length" class="ad-list-empty"><p>还没有公告，请使用左侧表单创建第一条公告。</p></div>
          <div v-else class="ops-table-scroll">
          <el-table :data="announcements" row-key="id" border stripe class="ops-el-table ops-announcement-table">
            <el-table-column label="公告内容" min-width="285">
              <template #default="{ row }">
                <div class="ops-record-title"><b>{{ row.title }}</b><el-tag v-if="row.pinned" size="small" type="warning" effect="plain">置顶</el-tag></div>
                <small class="ops-id">公告编号 · {{ row.id }}</small>
                <el-tooltip :content="row.body" placement="top" :show-after="350">
                  <p class="ops-record-body">{{ row.body }}</p>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="展示时段" min-width="205">
              <template #default="{ row }">
                <span class="ops-table-meta">{{ scheduleLabel(row) }}</span>
                <small class="ops-table-meta">{{ row.actionUrl ? `跳转到：${row.actionUrl}` : '没有跳转链接' }}</small>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="105">
              <template #default="{ row }"><el-tag size="small" :type="row.enabled ? 'success' : 'info'" effect="plain">{{ row.enabled ? '启用中' : '已停用' }}</el-tag></template>
            </el-table-column>
            <el-table-column label="操作" width="276" fixed="right">
              <template #default="{ row }">
                <div class="ops-record-actions">
                  <el-button link type="primary" size="small" :disabled="loading || saving || !!rowBusy" @click="editAnnouncement(row)">编辑</el-button>
                  <el-button link size="small" :disabled="loading || saving || !!rowBusy" @click="toggleAnnouncementPin(row)">{{ row.pinned ? '取消置顶' : '置顶' }}</el-button>
                  <el-button link size="small" :disabled="loading || saving || !!rowBusy" @click="toggleAnnouncementEnabled(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
                  <el-button link type="danger" size="small" :disabled="loading || saving || !!rowBusy" @click="removeAnnouncement(row)">{{ rowBusy === `announcement:${row.id}` ? '处理中…' : '删除' }}</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="tab === 'flags'">
      <div class="ops-layout">
        <form class="ad-panel ops-editor" @submit.prevent="saveFlag">
          <div class="ops-panel-head">
            <div><h3>{{ editingFlagKey ? '编辑远程开关' : '新增远程开关' }}</h3><small>开关名称用于运营识别；程序编号由系统自动生成。</small></div>
            <el-button v-if="editingFlagKey" class="ad-btn sm" native-type="button" @click="resetFlagForm">新建</el-button>
          </div>
          <label class="ops-field">
            <span>开关名称</span>
            <el-input v-model.trim="flagForm.name" required maxlength="100" placeholder="例如：节日活动入口" />
            <small>输入中文用途说明即可，系统会在后台生成识别编号。</small>
          </label>
          <div class="ops-checks"><label><el-switch v-model="flagForm.enabled" /> 开启此功能</label></div>
          <div class="ops-actions">
            <el-button class="ad-btn primary" type="primary" native-type="submit" :loading="saving" :disabled="saving">{{ saving ? '保存中…' : '保存开关' }}</el-button>
            <el-button v-if="editingFlagKey" native-type="button" @click="resetFlagForm">取消编辑</el-button>
          </div>
        </form>

        <div class="ad-panel ops-list-panel">
          <div class="ops-panel-head"><div><h3>远程开关</h3><small>玩家启动时读取；调整后会影响后续启动的玩家。</small></div></div>
          <p v-if="loading" class="ad-empty">正在同步远程开关…</p>
          <div v-else-if="!featureFlags.length" class="ad-list-empty"><p>暂无远程开关，请使用左侧表单新增。</p></div>
          <div v-else class="ops-table-scroll">
          <el-table :data="featureFlags" row-key="key" border stripe class="ops-el-table ops-flags-table">
            <el-table-column label="开关名称" min-width="210">
              <template #default="{ row }"><b class="ops-table-title">{{ row.description || '未命名开关' }}</b><small class="ops-table-meta">程序编号 · {{ row.key }}</small></template>
            </el-table-column>
            <el-table-column label="状态" width="105">
              <template #default="{ row }"><el-tag size="small" :type="row.enabled ? 'success' : 'info'" effect="plain">{{ row.enabled ? '已开启' : '已关闭' }}</el-tag></template>
            </el-table-column>
            <el-table-column label="最近更新" min-width="180">
              <template #default="{ row }"><span class="ops-table-meta">{{ formatDate(row.updatedAt) }}</span></template>
            </el-table-column>
            <el-table-column label="操作" width="210" fixed="right">
              <template #default="{ row }">
                <div class="ops-record-actions">
                  <el-button link :type="row.enabled ? 'warning' : 'success'" size="small" :disabled="loading || saving || !!rowBusy" @click="toggleFlag(row)">{{ rowBusy === `flag:${row.key}` ? '处理中…' : (row.enabled ? '关闭' : '开启') }}</el-button>
                  <el-button link type="primary" size="small" :disabled="loading || saving || !!rowBusy" @click="editFlag(row)">编辑</el-button>
                  <el-button link type="danger" size="small" :disabled="loading || saving || !!rowBusy" @click="removeFlag(row)">{{ rowBusy === `flag:${row.key}` ? '处理中…' : '删除' }}</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="ops-layout">
        <form class="ad-panel ops-editor" @submit.prevent="saveGiftCode">
          <div class="ops-panel-head"><div><h3>生成礼包码</h3><small>创建后，玩家可输入兑换码领取金币或道具。</small></div></div>
          <label class="ops-field">
            <span>礼包兑换码</span>
            <div class="ops-input-with-button">
              <el-input v-model.trim="giftForm.code" required maxlength="32" placeholder="输入或生成兑换码" />
              <el-button size="small" native-type="button" @click="giftForm.code = generateGiftCode()">随机生成</el-button>
            </div>
            <small>使用大写字母、数字或连字符，最多 32 位。</small>
          </label>
          <label class="ops-field">
            <span>金币奖励 <i>金币</i></span>
            <el-input-number v-model="giftForm.coins" :min="0" :max="1000000" :step="1" controls-position="right" />
            <small>每位成功兑换的玩家获得的金币数量；不发金币时填 0。</small>
          </label>
          <div class="ops-field-row">
            <label class="ops-field">
              <span>额外道具 <i>选填</i></span>
              <el-select v-model="giftForm.itemId" placeholder="不赠送道具" clearable>
                <el-option value="" label="不赠送道具" />
                <el-option v-for="item in giftItems" :key="item.value" :value="item.value" :label="item.label" />
              </el-select>
              <small>每个兑换码最多选择一种道具。</small>
            </label>
            <label class="ops-field">
              <span>道具数量 <i>件</i></span>
              <el-input-number v-model="giftForm.itemCount" :min="1" :max="999" :step="1" controls-position="right" :disabled="!giftForm.itemId" />
              <small>仅在选择道具时生效。</small>
            </label>
          </div>
          <div class="ops-field-row">
            <label class="ops-field">
              <span>兑换次数上限 <i>次</i></span>
              <el-input-number v-model="giftForm.useLimit" required :min="1" :max="1000000" :step="1" controls-position="right" />
              <small>该礼包码最多可成功兑换的总次数。</small>
            </label>
            <label class="ops-field">
              <span>过期时间 <i>选填</i></span>
              <el-date-picker v-model="giftForm.expiresAt" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DDTHH:mm" placeholder="选择过期时间" clearable />
              <small>留空表示长期有效。</small>
            </label>
          </div>
          <div class="ops-checks"><label><el-switch v-model="giftForm.enabled" /> 创建后立即启用</label></div>
          <div class="ops-actions"><el-button class="ad-btn primary" type="primary" native-type="submit" :loading="saving" :disabled="saving">{{ saving ? '创建中…' : '创建礼包码' }}</el-button></div>
        </form>

        <div class="ad-panel ops-list-panel">
          <div class="ops-panel-head"><div><h3>礼包码列表</h3><small>每位玩家每个码限兑一次；已经兑换的码请停用，不能删除。</small></div></div>
          <p v-if="loading" class="ad-empty">正在同步礼包码…</p>
          <div v-else-if="!giftCodes.length" class="ad-list-empty"><p>还没有礼包码，请使用左侧表单创建。</p></div>
          <div v-else class="ops-table-scroll">
          <el-table :data="giftCodes" row-key="code" border stripe class="ops-el-table ops-gift-table">
            <el-table-column label="兑换码" min-width="155">
              <template #default="{ row }"><b class="ops-code">{{ row.code }}</b></template>
            </el-table-column>
            <el-table-column label="奖励" min-width="185">
              <template #default="{ row }"><span class="ops-table-meta">{{ rewardSummary(row.reward) }}</span></template>
            </el-table-column>
            <el-table-column label="兑换次数" width="120">
              <template #default="{ row }"><span class="ops-usage">{{ row.usedCount }} / {{ row.useLimit }} 次</span></template>
            </el-table-column>
            <el-table-column label="有效期" min-width="185">
              <template #default="{ row }"><span class="ops-table-meta">{{ row.expiresAt ? `过期：${formatDate(row.expiresAt)}` : '长期有效' }}</span></template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><el-tag size="small" :type="row.enabled ? 'success' : 'info'" effect="plain">{{ row.enabled ? '已启用' : '已停用' }}</el-tag></template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <div class="ops-record-actions">
                  <el-button link :type="row.enabled ? 'warning' : 'success'" size="small" :disabled="loading || saving || !!rowBusy" @click="toggleGiftCode(row)">{{ rowBusy === `gift:${row.code}` ? '处理中…' : (row.enabled ? '停用' : '启用') }}</el-button>
                  <el-button link type="danger" size="small" :disabled="loading || saving || !!rowBusy" @click="removeGiftCode(row)">{{ rowBusy === `gift:${row.code}` ? '处理中…' : '删除' }}</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElButton, ElDatePicker, ElInput, ElInputNumber, ElOption, ElSelect, ElSwitch, ElTable, ElTableColumn, ElTag, ElTooltip } from 'element-plus'
import { adminState } from '../api.js'
import AdminError from '../components/AdminError.vue'
import AdminToast from '../components/AdminToast.vue'
import { useAutoNotice } from '../ui.js'
import {
  listAnnouncements, createAnnouncement, updateAnnouncement, setAnnouncementState, deleteAnnouncement,
  listFeatureFlags, saveFeatureFlag, deleteFeatureFlag,
  listGiftCodes, createGiftCode, setGiftCodeEnabled, deleteGiftCode
} from '../api/ops.js'

const tab = ref('announcements')
const announcements = ref([])
const featureFlags = ref([])
const giftCodes = ref([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const rowBusy = ref('')
const editingAnnouncementId = ref('')
const editingFlagKey = ref('')
const { notice, showNotice } = useAutoNotice()

const giftItems = [
  { value: 'revive', label: '复活卡' }, { value: 'auto', label: '自动卡' }, { value: 'double', label: '双倍金币卡' },
  { value: 'slow', label: '慢慢卡' }, { value: 'widen', label: '加宽卡' }, { value: 'shield', label: '护盾卡' },
  { value: 'comboGuard', label: '连击保护卡' }, { value: 'bagExpand', label: '背包扩容卡' }
]
const announcementForm = reactive({
  id: '', title: '', body: '', actionLabel: '', actionUrl: '',
  pinned: false, enabled: false, startsAt: '', endsAt: ''
})
const flagForm = reactive({ key: '', name: '', enabled: false })
const giftForm = reactive({ code: '', coins: 100, itemId: '', itemCount: 1, useLimit: 100, expiresAt: '', enabled: true })

async function refreshAll() {
  loading.value = true
  error.value = ''
  try {
    const [noticeRows, flagRows, codeRows] = await Promise.all([
      listAnnouncements(), listFeatureFlags(), listGiftCodes()
    ])
    announcements.value = noticeRows || []
    featureFlags.value = flagRows || []
    giftCodes.value = codeRows || []
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

function dateForInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
function dateForApi(value) {
  return value ? new Date(value).toISOString() : null
}
function announcementPayload() {
  return {
    ...announcementForm,
    startsAt: dateForApi(announcementForm.startsAt),
    endsAt: dateForApi(announcementForm.endsAt)
  }
}
function makeAnnouncementId() {
  const day = new Date().toISOString().slice(0, 10)
  const prefix = `${day}-`
  const sequence = announcements.value.reduce((max, row) => {
    const id = String(row.id || '')
    const suffix = id.startsWith(prefix) ? id.slice(prefix.length) : ''
    const number = /^\d+$/.test(suffix) ? Number(suffix) : 0
    return Math.max(max, number)
  }, 0) + 1
  return `${day}-${sequence}`
}
function resetAnnouncementForm() {
  editingAnnouncementId.value = ''
  Object.assign(announcementForm, {
    id: makeAnnouncementId(), title: '', body: '', actionLabel: '', actionUrl: '',
    pinned: false, enabled: false, startsAt: '', endsAt: ''
  })
}
function editAnnouncement(row) {
  editingAnnouncementId.value = row.id
  Object.assign(announcementForm, {
    id: row.id, title: row.title, body: row.body, actionLabel: row.actionLabel,
    actionUrl: row.actionUrl, pinned: row.pinned, enabled: row.enabled,
    startsAt: dateForInput(row.startsAt), endsAt: dateForInput(row.endsAt)
  })
  error.value = ''
}
async function saveAnnouncement() {
  saving.value = true
  error.value = ''
  try {
    const payload = announcementPayload()
    if (editingAnnouncementId.value) await updateAnnouncement(editingAnnouncementId.value, payload)
    else await createAnnouncement(payload)
    await refreshAll()
    resetAnnouncementForm()
    showNotice('公告已保存。')
  } catch (e) {
    error.value = e
  } finally {
    saving.value = false
  }
}
async function changeAnnouncementState(row, patch) {
  const busyId = `announcement:${row.id}`
  rowBusy.value = busyId
  error.value = ''
  try {
    await setAnnouncementState(row.id, {
      pinned: patch.pinned ?? row.pinned,
      enabled: patch.enabled ?? row.enabled
    })
    await refreshAll()
    showNotice(patch.pinned !== undefined ? (patch.pinned ? '公告已置顶。' : '已取消公告置顶。') : (patch.enabled ? '公告已启用，玩家可见。' : '公告已停用。'))
  } catch (e) {
    error.value = e
  } finally {
    rowBusy.value = ''
  }
}
function toggleAnnouncementPin(row) { return changeAnnouncementState(row, { pinned: !row.pinned }) }
function toggleAnnouncementEnabled(row) { return changeAnnouncementState(row, { enabled: !row.enabled }) }
async function removeAnnouncement(row) {
  if (!window.confirm(`确定删除公告「${row.title}」吗？删除后玩家将不再看到此公告，无法直接恢复。`)) return
  rowBusy.value = `announcement:${row.id}`
  error.value = ''
  try {
    await deleteAnnouncement(row.id)
    if (editingAnnouncementId.value === row.id) resetAnnouncementForm()
    await refreshAll()
    showNotice('公告已删除。')
  } catch (e) {
    error.value = e
  } finally {
    rowBusy.value = ''
  }
}

function resetFlagForm() {
  editingFlagKey.value = ''
  Object.assign(flagForm, { key: '', name: '', enabled: false })
}
function editFlag(row) {
  editingFlagKey.value = row.key
  Object.assign(flagForm, { key: row.key, name: row.description || '', enabled: row.enabled })
  error.value = ''
}
async function saveFlag() {
  saving.value = true
  error.value = ''
  try {
    const key = editingFlagKey.value || `ops_${Date.now().toString(36)}`
    await saveFeatureFlag({ key, description: flagForm.name.trim(), enabled: flagForm.enabled })
    await refreshAll()
    resetFlagForm()
    showNotice('远程开关已保存。')
  } catch (e) {
    error.value = e
  } finally {
    saving.value = false
  }
}
async function toggleFlag(row) {
  rowBusy.value = `flag:${row.key}`
  error.value = ''
  try {
    await saveFeatureFlag({ ...row, enabled: !row.enabled })
    await refreshAll()
    showNotice(row.enabled ? '远程开关已关闭。' : '远程开关已开启。')
  } catch (e) {
    error.value = e
  } finally {
    rowBusy.value = ''
  }
}
async function removeFlag(row) {
  if (!window.confirm(`确定删除「${row.description || '未命名开关'}」吗？删除后将不再向玩家下发此开关。`)) return
  rowBusy.value = `flag:${row.key}`
  error.value = ''
  try {
    await deleteFeatureFlag(row.key)
    if (editingFlagKey.value === row.key) resetFlagForm()
    await refreshAll()
    showNotice('远程开关已删除。')
  } catch (e) {
    error.value = e
  } finally {
    rowBusy.value = ''
  }
}

function generateGiftCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(12)
  try {
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  } catch (e) {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  const token = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
  return `MOON-${token}`
}
async function saveGiftCode() {
  const reward = {}
  const coinAmount = Math.floor(Number(giftForm.coins) || 0)
  const itemAmount = Math.floor(Number(giftForm.itemCount) || 0)
  if (coinAmount > 0) reward.coins = coinAmount
  if (giftForm.itemId && itemAmount > 0) reward.items = { [giftForm.itemId]: itemAmount }
  if (!Object.keys(reward).length) {
    error.value = '请至少填写金币奖励或选择一种道具。'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await createGiftCode({
      code: giftForm.code,
      reward,
      useLimit: giftForm.useLimit,
      expiresAt: giftForm.expiresAt ? dateForApi(giftForm.expiresAt) : null,
      enabled: giftForm.enabled
    })
    await refreshAll()
    Object.assign(giftForm, { code: '', coins: 100, itemId: '', itemCount: 1, useLimit: 100, expiresAt: '', enabled: true })
    showNotice('礼包码已创建。')
  } catch (e) {
    error.value = e
  } finally {
    saving.value = false
  }
}
async function toggleGiftCode(row) {
  rowBusy.value = `gift:${row.code}`
  error.value = ''
  try {
    await setGiftCodeEnabled(row.code, !row.enabled)
    await refreshAll()
    showNotice(row.enabled ? '礼包码已停用。' : '礼包码已启用。')
  } catch (e) {
    error.value = e
  } finally {
    rowBusy.value = ''
  }
}
async function removeGiftCode(row) {
  if (!window.confirm(`确定删除礼包码「${row.code}」吗？删除后新玩家将无法兑换；已有兑换记录时系统会阻止删除。`)) return
  rowBusy.value = `gift:${row.code}`
  error.value = ''
  try {
    await deleteGiftCode(row.code)
    await refreshAll()
    showNotice('礼包码已删除。')
  } catch (e) {
    error.value = e
  } finally {
    rowBusy.value = ''
  }
}

function rewardSummary(reward) {
  const parts = []
  if (Number(reward?.coins) > 0) parts.push(`${Number(reward.coins).toLocaleString()} 金币`)
  const itemLabels = Object.fromEntries(giftItems.map((item) => [item.value, item.label]))
  for (const [id, count] of Object.entries(reward?.items || {})) parts.push(`${itemLabels[id] || '其他道具'} × ${count} 件`)
  return parts.join(' · ') || '没有奖励内容'
}
function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', { hour12: false })
}
function scheduleLabel(row) {
  const start = row.startsAt ? `开始 ${formatDate(row.startsAt)}` : '立即可展示'
  const end = row.endsAt ? `结束 ${formatDate(row.endsAt)}` : '无结束时间'
  return `${start} · ${end}`
}

onMounted(async () => {
  await refreshAll()
  resetAnnouncementForm()
})
</script>

<style scoped>
.ops-page { min-width: 0; max-width: 100%; gap: 14px; overflow-x: clip; }
.ops-subtitle { margin: 5px 0 0; color: #737b6e; font-size: 11px; }
.ops-mode-note { display: flex; gap: 9px; align-items: center; padding: 10px 12px; background: #e9ebdd; border: 1px solid #d8d9cf; border-radius: 8px; color: #687060; font-size: 11px; line-height: 1.6; }
.ops-mode-note b { flex: none; color: #899944; }
.ops-tabs { display: flex; gap: 7px; border-bottom: 1px solid #d8d9cf; }
.ops-tabs button { display: flex; align-items: center; gap: 7px; min-height: 36px; padding: 0 12px; color: #737b6e; border: 0; border-bottom: 2px solid transparent; background: transparent; cursor: pointer; font-weight: 700; }
.ops-tabs button.active { color: #20251f; border-bottom-color: #899944; }
.ops-tabs small { min-width: 18px; padding: 2px 5px; border-radius: 10px; background: #eeede6; color: #737b6e; font-size: 10px; text-align: center; }
.ops-layout { display: grid; width: 100%; max-width: 100%; min-width: 0; grid-template-columns: minmax(290px, .84fr) minmax(360px, 1.16fr); gap: 12px; align-items: start; }
.ops-editor, .ops-list-panel { min-width: 0; }
.ops-panel-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
.ops-panel-head h3 { margin: 0 0 4px; color: #20251f; font-size: 14px; }
.ops-panel-head small { color: #838a7b; font-size: 10px; line-height: 1.5; }
.ops-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; margin: 0 0 12px; color: #4d5549; font-size: 11px; }
.ops-field > span { display: flex; justify-content: space-between; gap: 6px; }
.ops-field i { color: #838a7b; font-size: 10px; font-style: normal; font-weight: 400; }
.ops-field .el-input, .ops-field .el-select, .ops-field .el-date-editor, .ops-field .el-input-number { width: 100%; }
.ops-field :deep(.el-input__wrapper), .ops-field :deep(.el-select__wrapper) {
  min-height: 42px; padding: 0 10px; border-radius: 4px; background: #f7f6ef;
  box-shadow: 0 0 0 1px #d8d9cf inset;
}
.ops-field :deep(.el-input__wrapper.is-focus), .ops-field :deep(.el-select__wrapper.is-focused) { box-shadow: 0 0 0 1px #899944 inset; }
.ops-field :deep(.el-input__inner), .ops-field :deep(.el-textarea__inner) { color: #20251f; font-size: 13px; }
.ops-field :deep(.el-textarea__inner) { min-height: 88px; padding: 10px; border: 0; border-radius: 4px; background: #f7f6ef; box-shadow: 0 0 0 1px #d8d9cf inset; line-height: 1.6; }
.ops-field :deep(.el-textarea__inner:focus) { box-shadow: 0 0 0 1px #899944 inset; }
.ops-field :deep(.el-input-number .el-input__wrapper) { width: 100%; }
.ops-field > small { color: #737b6e; font-size: 10px; line-height: 1.55; }
.ops-field :deep(.is-disabled .el-input__wrapper), .ops-field :deep(.is-disabled .el-select__wrapper) { opacity: .65; cursor: not-allowed; }
.ops-field :deep(input[readonly]) { color: #687060; }
.ops-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ops-field-row .ops-field { min-width: 0; }
.ops-checks { display: flex; flex-wrap: wrap; gap: 16px; margin: 3px 0 15px; color: #4d5549; font-size: 11px; }
.ops-checks label { display: inline-flex; gap: 7px; align-items: center; min-height: 44px; cursor: pointer; }
.ops-checks :deep(.el-switch) { --el-switch-on-color: #899944; }
.ops-actions { display: flex; gap: 8px; }
.ops-actions :deep(.el-button) { min-height: 39px; margin: 0; }
.ad-btn.primary { border-color: #899944; background: #899944; color: #fbfaf5; }
.ad-btn.danger { color: #b74337; }
.ops-table-scroll { width: 100%; max-width: 100%; min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; }
.ops-el-table { --el-table-border-color: #e2e2d8; --el-table-header-bg-color: #f1f0e8; --el-table-row-hover-bg-color: #f6f8eb; width: 100%; color: #343a32; font-size: 12px; }
.ops-el-table :deep(.el-table__cell) { padding: 9px 0; }
.ops-el-table :deep(.el-table__header th.el-table__cell) { color: #737b6e; font-size: 10px; font-weight: 800; }
.ops-el-table :deep(.el-table__body .cell) { line-height: 1.5; }
.ops-el-table :deep(.el-table__inner-wrapper::before) { display: none; }
.ops-announcement-table { min-width: 850px; }
.ops-flags-table { min-width: 650px; }
.ops-gift-table { min-width: 900px; }
.ops-el-table .ops-record-actions { justify-content: flex-start; flex-wrap: nowrap; gap: 0; }
.ops-el-table :deep(.el-button + .el-button) { margin-left: 0; }
.ops-el-table :deep(.el-button) { min-height: 34px; padding: 4px 6px; }
.ops-table-title { display: block; color: #20251f; font-size: 12px; }
.ops-table-meta { display: block; color: #737b6e; font-size: 10px; line-height: 1.55; overflow-wrap: anywhere; }
.ops-record { padding: 12px 0; border-top: 1px solid #f1f0e8; }
.ops-record:first-of-type { border-top: 0; padding-top: 0; }
.ops-record-top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.ops-record-copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.ops-record-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: #20251f; font-size: 12px; }
.ops-record-copy > small, .ops-id, .ops-record-meta { overflow-wrap: anywhere; color: #737b6e; font-size: 10px; line-height: 1.5; }
.ops-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.ops-badge { padding: 2px 6px; border-radius: 99px; background: #e9e8df; color: #878e80; font-size: 9px; }
.ops-badge.pinned { background: #f5ebdc; color: #98602d; }
.ops-badge.enabled { background: #e8efe1; color: #5c784b; }
.ops-badge.disabled { background: #e9e8df; color: #70776a; }
.ops-record-actions { display: flex; flex: none; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }
.ops-record-body { display: -webkit-box; max-width: 520px; overflow: hidden; margin: 7px 0 2px; color: #4d5549; font-size: 11px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.ops-record-meta { display: block; }
.ops-toggle { min-width: 54px; min-height: 27px; padding: 0 8px; border: 1px solid #d8d9cf; border-radius: 6px; background: #e9e8df; color: #9da598; cursor: pointer; font-size: 10px; font-weight: 800; }
.ops-toggle.on { border-color: #5c784b; background: #e8efe1; color: #5c784b; }
.ops-input-with-button { display: flex; gap: 7px; }
.ops-input-with-button .el-input { min-width: 0; flex: 1; }
.ops-input-with-button :deep(.el-button) { min-height: 42px; margin: 0; }
.ops-usage { align-self: center; color: #737b6e; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; white-space: nowrap; }
.ops-code { color: #98602d; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .04em; }
.ops-help { margin: 12px 0 0; color: #838a7b; font-size: 10px; line-height: 1.7; overflow-wrap: anywhere; }
.ops-help code { color: #737d67; }
@media (max-width: 920px) { .ops-layout { grid-template-columns: 1fr; } }
@media (max-width: 768px) {
  .ops-layout { grid-template-columns: 1fr; }
  .ops-list-panel { order: -1; }
  .ops-field :deep(.el-input__wrapper), .ops-field :deep(.el-select__wrapper) { min-height: 44px; }
  .ops-field :deep(.el-textarea__inner) { min-height: 112px; font-size: 14px; }
  .ops-tabs { overflow-x: auto; }
  .ops-tabs button { min-height: 44px; flex: 0 0 auto; }
  .ops-el-table :deep(.el-button) { min-height: 42px; }
}
@media (max-width: 560px) {
  .ops-field-row { grid-template-columns: 1fr; gap: 0; }
  .ops-record-top { flex-direction: column; }
  .ops-record-actions { justify-content: flex-start; width: 100%; }
  .ops-record-actions :deep(.el-button) { flex: 1 1 auto; }
  .ops-mode-note { align-items: flex-start; flex-direction: column; gap: 3px; }
  .ops-input-with-button { align-items: stretch; }
  .ops-input-with-button :deep(.el-button) { min-height: 44px; }
  .ops-usage { width: 100%; }
}
</style>
