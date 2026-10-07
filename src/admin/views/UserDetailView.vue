<template>
  <section class="ad-page user-detail-page">
    <header class="ad-page-head">
      <div><h2>玩家详情</h2><p v-if="detail" class="user-detail-subtitle">查看进度、最近对局与金币流水，并进行必要的客服处理。</p></div>
      <button class="ad-btn" @click="emit('back')">返回玩家列表</button>
    </header>

    <AdminToast :message="notice" />
    <AdminError :error="error" context="玩家资料操作" />
    <div v-if="loading" class="ad-panel ad-empty" role="status">正在读取玩家资料…</div>
    <div v-else-if="!detail && !error" class="ad-list-empty"><p>没有找到这位玩家。</p><button class="ad-btn" @click="emit('back')">返回玩家列表</button></div>

    <template v-if="detail">
      <div class="ad-cards user-detail-stats">
        <div class="ad-card"><small>玩家昵称</small><b>{{ playerName(detail) || '未设置' }}</b></div>
        <div class="ad-card"><small>当前金币</small><b>{{ Number(detail.save?.coins || 0).toLocaleString() }} 金币</b></div>
        <div class="ad-card"><small>已解锁关卡</small><b>第 {{ detail.save?.unlocked || 1 }} / 56 关</b></div>
        <div class="ad-card"><small>云存档版本</small><b>{{ detail.clientRev ?? 0 }}</b></div>
      </div>

      <div class="ad-grid-2">
        <section class="ad-panel user-action-panel">
          <h3>金币调整</h3>
          <p class="user-action-intro">正数为补发，负数为扣回；每次调整都会记录原因和时间。</p>
          <form class="user-action-form" @submit.prevent="doGrant">
            <label class="user-field">
              <span>金币数量 <b>金币，可正可负</b></span>
              <input v-model.number="grantAmount" type="number" step="100" min="-1000000" max="1000000" required inputmode="numeric" />
              <small>最多调整 1,000,000 金币，不能填写 0。</small>
            </label>
            <label class="user-field">
              <span>调整原因</span>
              <input v-model.trim="grantReason" type="text" maxlength="120" placeholder="例如：客服补发" />
              <small>会显示在该玩家的金币流水中。</small>
            </label>
            <button class="ad-btn user-danger-btn" type="submit" :disabled="grantBusy || loading">{{ grantBusy ? '处理中…' : (grantAmount < 0 ? '确认扣回' : '补发金币') }}</button>
          </form>
          <p class="ad-note">本地模拟中，调整“我”的金币会同步到本机游戏存档。</p>

          <div class="user-rename">
            <h3>修改昵称</h3>
            <form class="user-action-form" @submit.prevent="doRename">
              <label class="user-field">
                <span>新昵称</span>
                <input v-model.trim="renameValue" type="text" :placeholder="playerName(detail) || '输入新昵称'" maxlength="16" />
                <small>最多 16 个字符。</small>
              </label>
              <button class="ad-btn" type="submit" :disabled="renameBusy || loading">{{ renameBusy ? '保存中…' : '保存昵称' }}</button>
            </form>
          </div>
        </section>

        <section class="ad-panel">
          <h3>最近对局 · {{ (detail.results || []).length }} 局</h3>
          <ul class="ad-recent tall user-results">
            <li v-for="(row, i) in detail.results || []" :key="i">
              <span>第 {{ row.levelId }} 关</span>
              <small>{{ row.stars }} 星 · {{ row.cleared ? '已通关' : '未通关' }}</small>
              <b>{{ Number(row.score || 0).toLocaleString() }} 分</b>
            </li>
            <li v-if="!(detail.results || []).length" class="ad-empty">这位玩家还没有对局记录。</li>
          </ul>
        </section>
      </div>

      <section class="ad-panel">
        <h3>游戏进度摘要</h3>
        <div class="ad-save-stats">
          <span>累计星星：{{ totalStars(detail.save) }} / 168 颗</span>
          <span>已拥有材质：{{ ownedMaterials(detail.save) }} / 5 种</span>
          <span>当前伙伴：{{ petLabel(detail.save?.activePetId) }}</span>
          <span>当前材质：{{ materialLabel(detail.save?.equippedMaterial) }}</span>
        </div>
        <p class="ad-note">为避免展示难以阅读的存档字段，这里只显示玩家可理解的进度摘要。</p>
      </section>

      <section class="ad-panel">
        <h3>金币流水 · {{ (detail.ledger || []).length }} 条</h3>
        <ul class="ad-recent ledger-list">
          <li v-for="(row, i) in detail.ledger || []" :key="i">
            <span>{{ reasonLabel(row.reason) }}</span>
            <small>{{ formatTime(row.at) }}</small>
            <b :class="{ neg: row.deltaCoins < 0 }">{{ row.deltaCoins > 0 ? '+' : '' }}{{ Number(row.deltaCoins || 0).toLocaleString() }} 金币</b>
          </li>
          <li v-if="!(detail.ledger || []).length" class="ad-empty">暂无金币流水记录。</li>
        </ul>
      </section>
    </template>
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { fetchUserDetail, grantCoins, renamePlayer } from '../api.js'
import AdminError from '../components/AdminError.vue'
import AdminToast from '../components/AdminToast.vue'
import { useAutoNotice } from '../ui.js'

const props = defineProps({ userId: { type: String, default: '' } })
const emit = defineEmits(['back'])

const detail = ref(null)
const loading = ref(true)
const error = ref('')
const grantAmount = ref(1000)
const grantReason = ref('客服补发')
const grantBusy = ref(false)
const renameValue = ref('')
const renameBusy = ref(false)
const { notice, showNotice } = useAutoNotice()

async function load() {
  loading.value = true
  error.value = ''
  detail.value = null
  if (!props.userId) {
    error.value = '未指定玩家，请返回列表重新选择。'
    loading.value = false
    return
  }
  try {
    detail.value = await fetchUserDetail(props.userId)
    if (!detail.value) error.value = '没有找到这位玩家，请确认搜索条件。'
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}

async function doGrant() {
  const amount = Number(grantAmount.value)
  if (!Number.isFinite(amount) || Math.floor(amount) !== amount || amount === 0 || Math.abs(amount) > 1000000) {
    error.value = '请输入 1 至 1,000,000 之间的非零金币数量。'
    return
  }
  const action = amount < 0 ? '扣回' : '补发'
  const consequence = amount < 0 ? '这会立即从该玩家余额中扣除金币' : '这会立即增加该玩家的金币余额'
  const currentName = playerName(detail.value) || '这位玩家'
  if (amount < 0 && Math.abs(amount) > Number(detail.value?.save?.coins || 0)) {
    error.value = '扣回金额不能超过该玩家当前金币余额。'
    return
  }
  if (!window.confirm(`确定为「${currentName}」${action} ${Math.abs(amount).toLocaleString()} 金币吗？\n${consequence}，并写入金币流水；此操作无法自动撤销。`)) return

  grantBusy.value = true
  error.value = ''
  try {
    const res = await grantCoins(props.userId, amount, grantReason.value || '客服补发')
    showNotice(`已${action} ${Math.abs(amount).toLocaleString()} 金币${res?.coins != null ? `，当前余额 ${Number(res.coins).toLocaleString()} 金币` : ''}。`)
    await load()
  } catch (e) {
    error.value = e
  } finally {
    grantBusy.value = false
  }
}

async function doRename() {
  if (!renameValue.value.trim()) {
    error.value = '请输入新的昵称。'
    return
  }
  renameBusy.value = true
  error.value = ''
  try {
    await renamePlayer(props.userId, renameValue.value)
    renameValue.value = ''
    showNotice('玩家昵称已保存。')
    await load()
  } catch (e) {
    error.value = e
  } finally {
    renameBusy.value = false
  }
}

function playerName(data) {
  return String(data?.player?.name ?? data?.player?.display_name ?? '').trim()
}
function totalStars(save) {
  return Object.values(save?.stars || {}).reduce((sum, value) => sum + (Number(value) || 0), 0)
}
function ownedMaterials(save) {
  return Object.values(save?.materials || {}).filter(Boolean).length
}
function materialLabel(id) {
  return ({ soil: '泥土', concrete: '混凝土', steel: '钢材', bronze: '青铜', blackgold: '乌金' })[id] || '无'
}
function petLabel(id) {
  return ({ moonRabbit: '月岩兔', cloudWisp: '云母精灵', rivetHound: '铆钉犬', emberFox: '燧星狐', starCat: '星辉猫' })[id] || '无'
}
function reasonLabel(reason) {
  const labels = { '客服补发': '客服补发', cs_grant: '客服补发', admin: '后台金币调整', shop: '商店消费', level_clear: '关卡奖励' }
  return labels[reason] || '金币调整'
}
function formatTime(at) {
  if (!at) return '—'
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(load)
watch(() => props.userId, load)
</script>

<style scoped>
.user-detail-page { max-width: 1120px; }
.user-detail-subtitle { margin: 5px 0 0; color: #8298ae; font-size: 11px; }
.user-detail-stats .ad-card { min-width: 0; }
.user-detail-stats .ad-card b { font-size: 18px; }
.user-action-intro { margin: -3px 0 12px; color: #849bb2; font-size: 11px; line-height: 1.6; }
.user-action-form { display: flex; flex-direction: column; gap: 10px; }
.user-field { display: flex; flex-direction: column; gap: 5px; color: #bdd0e1; font-size: 12px; }
.user-field > span { display: flex; justify-content: space-between; gap: 8px; }
.user-field > span b { color: #8298ae; font-size: 10px; font-weight: 400; }
.user-field input { width: 100%; min-height: 44px; padding: 8px 10px; border: 1px solid #2b3d52; border-radius: 7px; background: #0d1520; color: #dce6f2; font-size: 13px; }
.user-field small { color: #7890a8; font-size: 10px; line-height: 1.5; }
.user-danger-btn { border-color: #744243; background: #2d1b20; color: #ffbaba; }
.user-danger-btn:hover { background: #3a2025; }
.user-rename { margin-top: 20px; padding-top: 14px; border-top: 1px solid #243348; }
.user-results li, .ledger-list li { flex-wrap: wrap; }
.user-results li small, .ledger-list li small { margin-left: auto; text-align: right; }
@media (max-width: 768px) {
  .user-detail-page .ad-page-head { align-items: flex-start; }
  .user-detail-page .ad-page-head > button { flex: 1 0 100%; }
  .user-results li small, .ledger-list li small { width: 100%; margin-left: 0; text-align: left; }
  .user-results li b, .ledger-list li b { margin-left: auto; }
}
</style>
