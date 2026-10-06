<template>
  <section class="ad-page ops-page">
    <header class="ad-page-head">
      <div>
        <h2>运营中心</h2>
        <p class="ops-subtitle">公告、远程开关与礼包码 · 不包含 A/B 实验</p>
      </div>
      <button class="ad-btn" :disabled="loading" @click="refreshAll">{{ loading ? '同步中…' : '刷新' }}</button>
    </header>

    <div class="ops-mode-note">
      <b>{{ adminState.mode === 'supabase' ? 'Supabase 云端' : '本地模拟' }}</b>
      <span>公告与开关由单个玩家 RPC 一次读取；配置不可用时公告回退到 app-config.json。无尽模式 / 排位赛暂不接开关。</span>
    </div>

    <p v-if="error" class="ad-error" role="alert">{{ error }}</p>
    <p v-if="message" class="ad-ok" role="status">{{ message }}</p>

    <nav class="ops-tabs" aria-label="运营管理分类">
      <button :class="{ active: tab === 'announcements' }" @click="tab = 'announcements'">公告管理 <small>{{ announcements.length }}</small></button>
      <button :class="{ active: tab === 'flags' }" @click="tab = 'flags'">远程开关 <small>{{ featureFlags.length }}</small></button>
      <button :class="{ active: tab === 'giftCodes' }" @click="tab = 'giftCodes'">礼包码 <small>{{ giftCodes.length }}</small></button>
    </nav>

    <template v-if="tab === 'announcements'">
      <div class="ops-layout">
        <form class="ad-panel ops-editor" @submit.prevent="saveAnnouncement">
          <div class="ops-panel-head">
            <div>
              <h3>{{ editingAnnouncementId ? '编辑公告' : '新建公告' }}</h3>
              <small>玩家启动时展示；按公告 ID 在本机去重。</small>
            </div>
            <button v-if="editingAnnouncementId" class="ad-btn sm" type="button" @click="resetAnnouncementForm">新建</button>
          </div>
          <label class="ops-field">
            <span>公告 ID <i>必填、不可重复；修改 ID 会被视为新公告</i></span>
            <input v-model.trim="announcementForm.id" required maxlength="80" :disabled="!!editingAnnouncementId" placeholder="例如 2026-10-06-1" />
          </label>
          <label class="ops-field">
            <span>标题</span>
            <input v-model.trim="announcementForm.title" required maxlength="120" placeholder="公告标题" />
          </label>
          <label class="ops-field">
            <span>正文</span>
            <textarea v-model.trim="announcementForm.body" required maxlength="4000" rows="5" placeholder="输入公告正文" />
          </label>
          <div class="ops-field-row">
            <label class="ops-field">
              <span>按钮文案 <i>选填</i></span>
              <input v-model.trim="announcementForm.actionLabel" maxlength="80" placeholder="查看详情" />
            </label>
            <label class="ops-field">
              <span>跳转链接 <i>仅 https://</i></span>
              <input v-model.trim="announcementForm.actionUrl" type="url" placeholder="https://example.com" />
            </label>
          </div>
          <div class="ops-field-row">
            <label class="ops-field">
              <span>开始展示 <i>选填</i></span>
              <input v-model="announcementForm.startsAt" type="datetime-local" />
            </label>
            <label class="ops-field">
              <span>结束展示 <i>选填</i></span>
              <input v-model="announcementForm.endsAt" type="datetime-local" />
            </label>
          </div>
          <div class="ops-checks">
            <label><input v-model="announcementForm.pinned" type="checkbox" /> 置顶</label>
            <label><input v-model="announcementForm.enabled" type="checkbox" /> 启用（玩家可见）</label>
          </div>
          <div class="ops-actions">
            <button class="ad-btn primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : (editingAnnouncementId ? '保存修改' : '创建公告') }}</button>
            <button v-if="editingAnnouncementId" class="ad-btn" type="button" @click="resetAnnouncementForm">取消</button>
          </div>
        </form>

        <div class="ad-panel ops-list-panel">
          <div class="ops-panel-head">
            <div><h3>公告列表</h3><small>置顶公告优先；未启用或未到开始时间的公告不会下发。</small></div>
          </div>
          <div v-if="!announcements.length" class="ad-empty">还没有公告。创建后可先保存为停用草稿。</div>
          <article v-for="row in announcements" :key="row.id" class="ops-record">
            <div class="ops-record-top">
              <div class="ops-record-copy">
                <div class="ops-record-title"><b>{{ row.title }}</b><span v-if="row.pinned" class="ops-badge pinned">置顶</span><span class="ops-badge" :class="row.enabled ? 'enabled' : 'disabled'">{{ row.enabled ? '启用中' : '已停用' }}</span></div>
                <small class="ops-id">{{ row.id }}</small>
              </div>
              <div class="ops-record-actions">
                <button class="ad-btn sm" @click="editAnnouncement(row)">编辑</button>
                <button class="ad-btn sm" @click="toggleAnnouncementPin(row)">{{ row.pinned ? '取消置顶' : '置顶' }}</button>
                <button class="ad-btn sm" @click="toggleAnnouncementEnabled(row)">{{ row.enabled ? '停用' : '启用' }}</button>
                <button class="ad-btn sm danger" @click="removeAnnouncement(row)">删除</button>
              </div>
            </div>
            <p class="ops-record-body">{{ row.body }}</p>
            <small class="ops-record-meta">{{ row.actionUrl ? `跳转：${row.actionUrl}` : '无跳转链接' }} · {{ scheduleLabel(row) }}</small>
          </article>
        </div>
      </div>
    </template>

    <template v-else-if="tab === 'flags'">
      <div class="ops-layout">
        <form class="ad-panel ops-editor" @submit.prevent="saveFlag">
          <div class="ops-panel-head">
            <div><h3>{{ editingFlagKey ? '编辑远程开关' : '新增远程开关' }}</h3><small>key 使用小写字母、数字和下划线；新开关默认关闭。</small></div>
            <button v-if="editingFlagKey" class="ad-btn sm" type="button" @click="resetFlagForm">新建</button>
          </div>
          <label class="ops-field">
            <span>开关 key</span>
            <input v-model.trim="flagForm.key" required maxlength="64" pattern="[a-z][a-z0-9_]*" :disabled="!!editingFlagKey" placeholder="例如 ops_demo" />
          </label>
          <label class="ops-field">
            <span>说明</span>
            <textarea v-model.trim="flagForm.description" maxlength="500" rows="3" placeholder="描述该开关用途；本期示例开关不绑定玩法" />
          </label>
          <div class="ops-checks"><label><input v-model="flagForm.enabled" type="checkbox" /> 开启</label></div>
          <div class="ops-actions">
            <button class="ad-btn primary" type="submit" :disabled="saving">{{ saving ? '保存中…' : '保存开关' }}</button>
            <button v-if="editingFlagKey" class="ad-btn" type="button" @click="resetFlagForm">取消</button>
          </div>
        </form>

        <div class="ad-panel ops-list-panel">
          <div class="ops-panel-head"><div><h3>远程开关</h3><small>游戏启动时与公告一起读取；目前只提供框架示例 ops_demo。</small></div></div>
          <div v-if="!featureFlags.length" class="ad-empty">暂无开关</div>
          <article v-for="row in featureFlags" :key="row.key" class="ops-record flag-record">
            <div class="ops-record-top">
              <div class="ops-record-copy"><b>{{ row.key }}</b><small>{{ row.description || '（无说明）' }}</small></div>
              <div class="ops-record-actions">
                <button class="ops-toggle" :class="{ on: row.enabled }" role="switch" :aria-checked="row.enabled" @click="toggleFlag(row)">{{ row.enabled ? '开启' : '关闭' }}</button>
                <button class="ad-btn sm" @click="editFlag(row)">编辑</button>
                <button class="ad-btn sm danger" @click="removeFlag(row)">删除</button>
              </div>
            </div>
            <small class="ops-record-meta">最近更新：{{ formatDate(row.updatedAt) }}</small>
          </article>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="ops-layout">
        <form class="ad-panel ops-editor" @submit.prevent="saveGiftCode">
          <div class="ops-panel-head"><div><h3>生成礼包码</h3><small>奖励写入玩家存档；金币入 wallet_ledger，道具进入 items 库存。</small></div></div>
          <label class="ops-field">
            <span>礼包码</span>
            <div class="ops-input-with-button">
              <input v-model.trim="giftForm.code" required maxlength="32" placeholder="输入或生成礼包码" />
              <button class="ad-btn sm" type="button" @click="giftForm.code = generateGiftCode()">随机生成</button>
            </div>
          </label>
          <label class="ops-field">
            <span>奖励 JSON <i>coins / items</i></span>
            <textarea v-model="giftForm.rewardJson" required rows="4" spellcheck="false" placeholder="{ &quot;coins&quot;: 100, &quot;items&quot;: { &quot;revive&quot;: 1 } }" />
          </label>
          <div class="ops-field-row">
            <label class="ops-field">
              <span>兑换次数上限</span>
              <input v-model.number="giftForm.useLimit" required type="number" min="1" max="1000000" step="1" />
            </label>
            <label class="ops-field">
              <span>过期时间 <i>留空 = 永不过期</i></span>
              <input v-model="giftForm.expiresAt" type="datetime-local" />
            </label>
          </div>
          <div class="ops-checks"><label><input v-model="giftForm.enabled" type="checkbox" /> 创建后立即启用</label></div>
          <div class="ops-actions"><button class="ad-btn primary" type="submit" :disabled="saving">{{ saving ? '创建中…' : '创建礼包码' }}</button></div>
          <p class="ops-help">奖励示例：<code>{"coins":250}</code> 或 <code>{"coins":100,"items":{"revive":1,"double":1}}</code>。</p>
        </form>

        <div class="ad-panel ops-list-panel">
          <div class="ops-panel-head"><div><h3>礼包码列表</h3><small>每位玩家每个码限兑一次；已兑换的码请停用，不可删除。</small></div></div>
          <div v-if="!giftCodes.length" class="ad-empty">还没有礼包码</div>
          <article v-for="row in giftCodes" :key="row.code" class="ops-record gift-record">
            <div class="ops-record-top">
              <div class="ops-record-copy"><b class="ops-code">{{ row.code }}</b><small>{{ JSON.stringify(row.reward) }}</small></div>
              <div class="ops-record-actions">
                <span class="ops-usage">{{ row.usedCount }} / {{ row.useLimit }}</span>
                <button class="ops-toggle" :class="{ on: row.enabled }" role="switch" :aria-checked="row.enabled" @click="toggleGiftCode(row)">{{ row.enabled ? '启用' : '停用' }}</button>
                <button class="ad-btn sm danger" @click="removeGiftCode(row)">删除</button>
              </div>
            </div>
            <small class="ops-record-meta">{{ row.expiresAt ? `过期：${formatDate(row.expiresAt)}` : '永不过期' }} · 创建于 {{ formatDate(row.createdAt) }}</small>
          </article>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { adminState } from '../api.js'
import {
  listAnnouncements, createAnnouncement, updateAnnouncement, setAnnouncementState, deleteAnnouncement,
  listFeatureFlags, saveFeatureFlag, deleteFeatureFlag,
  listGiftCodes, createGiftCode, setGiftCodeEnabled, deleteGiftCode
} from '../api/ops.js'

const tab = ref('announcements')
const announcements = ref([])
const featureFlags = ref([])
const giftCodes = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')
const editingAnnouncementId = ref('')
const editingFlagKey = ref('')

const announcementForm = reactive({
  id: '', title: '', body: '', actionLabel: '', actionUrl: '',
  pinned: false, enabled: false, startsAt: '', endsAt: ''
})
const flagForm = reactive({ key: '', description: '', enabled: false })
const giftForm = reactive({ code: '', rewardJson: '{\n  "coins": 100\n}', useLimit: 100, expiresAt: '', enabled: true })

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
    error.value = String(e?.message || e)
  } finally {
    loading.value = false
  }
}

function setMessage(text) {
  message.value = text
  window.clearTimeout(setMessage.timer)
  setMessage.timer = window.setTimeout(() => { message.value = '' }, 2600)
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
    const match = String(row.id).match(new RegExp(`^${prefix}(\\d+)$`))
    return match ? Math.max(max, Number(match[1])) : max
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
    setMessage('公告已保存')
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    saving.value = false
  }
}
async function changeAnnouncementState(row, patch) {
  error.value = ''
  try {
    await setAnnouncementState(row.id, {
      pinned: patch.pinned ?? row.pinned,
      enabled: patch.enabled ?? row.enabled
    })
    await refreshAll()
  } catch (e) { error.value = String(e?.message || e) }
}
function toggleAnnouncementPin(row) { return changeAnnouncementState(row, { pinned: !row.pinned }) }
function toggleAnnouncementEnabled(row) { return changeAnnouncementState(row, { enabled: !row.enabled }) }
async function removeAnnouncement(row) {
  if (!window.confirm(`确定删除公告「${row.title}」？`)) return
  error.value = ''
  try {
    await deleteAnnouncement(row.id)
    if (editingAnnouncementId.value === row.id) resetAnnouncementForm()
    await refreshAll()
    setMessage('公告已删除')
  } catch (e) { error.value = String(e?.message || e) }
}

function resetFlagForm() {
  editingFlagKey.value = ''
  Object.assign(flagForm, { key: '', description: '', enabled: false })
}
function editFlag(row) {
  editingFlagKey.value = row.key
  Object.assign(flagForm, { key: row.key, description: row.description, enabled: row.enabled })
  error.value = ''
}
async function saveFlag() {
  saving.value = true
  error.value = ''
  try {
    await saveFeatureFlag(flagForm)
    await refreshAll()
    resetFlagForm()
    setMessage('远程开关已保存')
  } catch (e) { error.value = String(e?.message || e) }
  finally { saving.value = false }
}
async function toggleFlag(row) {
  error.value = ''
  try {
    await saveFeatureFlag({ ...row, enabled: !row.enabled })
    await refreshAll()
  } catch (e) { error.value = String(e?.message || e) }
}
async function removeFlag(row) {
  if (!window.confirm(`删除远程开关 ${row.key}？`)) return
  error.value = ''
  try {
    await deleteFeatureFlag(row.key)
    if (editingFlagKey.value === row.key) resetFlagForm()
    await refreshAll()
    setMessage('远程开关已删除')
  } catch (e) { error.value = String(e?.message || e) }
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
  saving.value = true
  error.value = ''
  try {
    await createGiftCode({
      code: giftForm.code,
      reward: JSON.parse(giftForm.rewardJson),
      useLimit: giftForm.useLimit,
      expiresAt: giftForm.expiresAt ? dateForApi(giftForm.expiresAt) : null,
      enabled: giftForm.enabled
    })
    await refreshAll()
    giftForm.code = ''
    setMessage('礼包码已创建')
  } catch (e) { error.value = String(e?.message || e) }
  finally { saving.value = false }
}
async function toggleGiftCode(row) {
  error.value = ''
  try {
    await setGiftCodeEnabled(row.code, !row.enabled)
    await refreshAll()
  } catch (e) { error.value = String(e?.message || e) }
}
async function removeGiftCode(row) {
  if (!window.confirm(`确定删除礼包码 ${row.code}？已有兑换记录的礼包码不可删除。`)) return
  error.value = ''
  try {
    await deleteGiftCode(row.code)
    await refreshAll()
    setMessage('礼包码已删除')
  } catch (e) { error.value = String(e?.message || e) }
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
.ops-page { gap: 14px; }
.ops-subtitle { margin: 5px 0 0; color: #6f879f; font-size: 11px; }
.ops-mode-note { display: flex; gap: 9px; align-items: center; padding: 10px 12px; background: #0f1b29; border: 1px solid #1e2d40; border-radius: 8px; color: #91a9c0; font-size: 11px; line-height: 1.6; }
.ops-mode-note b { flex: none; color: #65c8dc; }
.ops-tabs { display: flex; gap: 7px; border-bottom: 1px solid #1e2a3a; }
.ops-tabs button { display: flex; align-items: center; gap: 7px; min-height: 36px; padding: 0 12px; color: #8fa4ba; border: 0; border-bottom: 2px solid transparent; background: transparent; cursor: pointer; font-weight: 700; }
.ops-tabs button.active { color: #e5f4ff; border-bottom-color: #58a6ff; }
.ops-tabs small { min-width: 18px; padding: 2px 5px; border-radius: 10px; background: #1b2b3d; color: #92abc4; font-size: 10px; text-align: center; }
.ops-layout { display: grid; grid-template-columns: minmax(290px, .84fr) minmax(360px, 1.16fr); gap: 12px; align-items: start; }
.ops-editor, .ops-list-panel { min-width: 0; }
.ops-panel-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
.ops-panel-head h3 { margin: 0 0 4px; color: #d5e6f6; font-size: 14px; }
.ops-panel-head small { color: #627b94; font-size: 10px; line-height: 1.5; }
.ops-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; margin: 0 0 12px; color: #a8bfd5; font-size: 11px; }
.ops-field > span { display: flex; justify-content: space-between; gap: 6px; }
.ops-field i { color: #627b94; font-size: 10px; font-style: normal; font-weight: 400; }
.ops-field input, .ops-field textarea { width: 100%; min-height: 34px; padding: 8px 10px; color: #e0edf8; background: #0b1420; border: 1px solid #293b50; border-radius: 6px; font: inherit; font-size: 12px; }
.ops-field textarea { min-height: 78px; resize: vertical; line-height: 1.6; }
.ops-field input:focus, .ops-field textarea:focus { border-color: #4ba8df; outline: 1px solid #4ba8df55; }
.ops-field input:disabled { opacity: .6; cursor: not-allowed; }
.ops-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.ops-field-row .ops-field { min-width: 0; }
.ops-checks { display: flex; flex-wrap: wrap; gap: 16px; margin: 3px 0 15px; color: #b4c9dc; font-size: 11px; }
.ops-checks label { display: inline-flex; gap: 7px; align-items: center; cursor: pointer; }
.ops-checks input { accent-color: #42b7e8; }
.ops-actions { display: flex; gap: 8px; }
.ad-btn.primary { border-color: #2f81f7; background: #1b65ba; color: #fff; }
.ad-btn.danger { color: #ff9d9d; }
.ops-record { padding: 12px 0; border-top: 1px solid #1a2838; }
.ops-record:first-of-type { border-top: 0; padding-top: 0; }
.ops-record-top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.ops-record-copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.ops-record-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: #dceafa; font-size: 12px; }
.ops-record-copy > small, .ops-id, .ops-record-meta { overflow-wrap: anywhere; color: #6c849c; font-size: 10px; line-height: 1.5; }
.ops-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.ops-badge { padding: 2px 6px; border-radius: 99px; background: #202d3c; color: #8197ad; font-size: 9px; }
.ops-badge.pinned { background: #40321a; color: #ffd36e; }
.ops-badge.enabled { background: #123c35; color: #78d8aa; }
.ops-badge.disabled { background: #2b2830; color: #a59aab; }
.ops-record-actions { display: flex; flex: none; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }
.ops-record-body { margin: 8px 0 5px; color: #a9bed2; font-size: 11px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.ops-record-meta { display: block; }
.ops-toggle { min-width: 54px; min-height: 27px; padding: 0 8px; border: 1px solid #394557; border-radius: 6px; background: #222c39; color: #a5b4c6; cursor: pointer; font-size: 10px; font-weight: 800; }
.ops-toggle.on { border-color: #2a8268; background: #114638; color: #93ebc2; }
.ops-input-with-button { display: flex; gap: 7px; }
.ops-input-with-button input { min-width: 0; flex: 1; }
.ops-usage { align-self: center; color: #8fa9c2; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; white-space: nowrap; }
.ops-code { color: #ffd36e; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .04em; }
.ops-help { margin: 12px 0 0; color: #667e96; font-size: 10px; line-height: 1.7; overflow-wrap: anywhere; }
.ops-help code { color: #91b8dc; }
@media (max-width: 920px) { .ops-layout { grid-template-columns: 1fr; } }
@media (max-width: 560px) {
  .ops-field-row { grid-template-columns: 1fr; gap: 0; }
  .ops-record-top { flex-direction: column; }
  .ops-record-actions { justify-content: flex-start; }
  .ops-mode-note { align-items: flex-start; flex-direction: column; gap: 3px; }
}
</style>
