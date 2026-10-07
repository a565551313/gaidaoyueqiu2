<template>
  <section class="ad-page user-detail-page">
    <header class="ad-page-head">
      <div><h2>玩家详情</h2><p v-if="detail" class="user-detail-subtitle">查看进度、最近对局与金币流水，并进行必要的客服处理。</p></div>
      <el-button class="ad-btn" @click="emit('back')">返回玩家列表</el-button>
    </header>

    <AdminToast :message="notice" />
    <AdminError :error="error" context="玩家资料操作" />
    <div v-if="loading" class="ad-panel ad-empty" role="status">正在读取玩家资料…</div>
    <div v-else-if="!detail && !error" class="ad-list-empty"><el-empty description="没有找到这位玩家。"><el-button class="ad-btn" @click="emit('back')">返回玩家列表</el-button></el-empty></div>

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
              <el-input-number v-model="grantAmount" :step="100" :min="-1000000" :max="1000000" required controls-position="right" aria-label="金币数量" />
              <small>最多调整 1,000,000 金币，不能填写 0。</small>
            </label>
            <label class="user-field">
              <span>调整原因</span>
              <el-input v-model.trim="grantReason" type="text" maxlength="120" placeholder="例如：客服补发" aria-label="调整原因" />
              <small>会显示在该玩家的金币流水中。</small>
            </label>
            <el-button class="ad-btn user-danger-btn" native-type="submit" :disabled="grantBusy || loading">{{ grantBusy ? '处理中…' : (grantAmount < 0 ? '确认扣回' : '补发金币') }}</el-button>
          </form>
          <p class="ad-note">本地模拟中，调整“我”的金币会同步到本机游戏存档。</p>

          <div class="user-rename">
            <h3>修改昵称</h3>
            <form class="user-action-form" @submit.prevent="doRename">
              <label class="user-field">
                <span>新昵称</span>
                <el-input v-model.trim="renameValue" type="text" :placeholder="playerName(detail) || '输入新昵称'" maxlength="16" aria-label="新昵称" />
                <small>最多 16 个字符。</small>
              </label>
              <el-button class="ad-btn" native-type="submit" :disabled="renameBusy || loading">{{ renameBusy ? '保存中…' : '保存昵称' }}</el-button>
            </form>
          </div>
        </section>

        <section class="ad-panel">
          <h3>最近对局 · {{ (detail.results || []).length }} 局</h3>
          <div class="user-table-wrap" role="region" aria-label="最近对局列表" tabindex="0"><el-table :data="detail.results || []" aria-label="最近对局表格" empty-text="这位玩家还没有对局记录。" table-layout="auto">
            <el-table-column label="关卡" min-width="100"><template #default="{ row }">第 {{ row.levelId }} 关</template></el-table-column>
            <el-table-column label="星星" min-width="90"><template #default="{ row }">{{ row.stars }} 星</template></el-table-column>
            <el-table-column label="通关状态" min-width="110"><template #default="{ row }"><el-tag :type="row.cleared ? 'success' : 'info'" effect="plain">{{ row.cleared ? '已通关' : '未通关' }}</el-tag></template></el-table-column>
            <el-table-column label="得分" min-width="110"><template #default="{ row }">{{ Number(row.score || 0).toLocaleString() }} 分</template></el-table-column>
          </el-table></div>
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
        <div class="user-table-wrap" role="region" aria-label="金币流水列表" tabindex="0"><el-table :data="detail.ledger || []" aria-label="金币流水表格" empty-text="暂无金币流水记录。" table-layout="auto">
          <el-table-column label="原因" min-width="140"><template #default="{ row }">{{ reasonLabel(row.reason) }}</template></el-table-column>
          <el-table-column label="时间" min-width="140"><template #default="{ row }">{{ formatTime(row.at) }}</template></el-table-column>
          <el-table-column label="金币变化" min-width="150"><template #default="{ row }"><el-tag :type="row.deltaCoins < 0 ? 'danger' : 'success'" effect="plain">{{ row.deltaCoins > 0 ? '+' : '' }}{{ Number(row.deltaCoins || 0).toLocaleString() }} 金币</el-tag></template></el-table-column>
        </el-table></div>
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
.user-detail-subtitle { margin: 5px 0 0; color: #737b6e; font-size: 11px; }
.user-detail-stats .ad-card { min-width: 0; }
.user-detail-stats .ad-card b { font-size: 18px; }
.user-action-intro { margin: -3px 0 12px; color: #737b6e; font-size: 11px; line-height: 1.6; }
.user-action-form { display: flex; flex-direction: column; gap: 10px; }
.user-field { display: flex; flex-direction: column; gap: 5px; color: #41483d; font-size: 12px; }
.user-field > span { display: flex; justify-content: space-between; gap: 8px; }
.user-field > span b { color: #737b6e; font-size: 10px; font-weight: 400; }
.user-field :deep(.el-input), .user-field :deep(.el-input-number) { width: 100%; }
.user-field :deep(.el-input__wrapper), .user-field :deep(.el-input-number .el-input__wrapper) { min-height: 40px; background: #f7f6ef; box-shadow: 0 0 0 1px #d8d9cf inset; }
.user-table-wrap { overflow-x: auto; }
.user-table-wrap :deep(.el-table) { min-width: 430px; --el-table-border-color: #d8d9cf; --el-table-header-bg-color: #efeee5; --el-table-row-hover-bg-color: #f3f1e8; --el-table-text-color: #20251f; --el-table-header-text-color: #59604f; }
.user-field small { color: #737b6e; font-size: 10px; line-height: 1.5; }
.user-danger-btn { border-color: #e6bfb4; background: #f6e5e1; color: #b74337; }
.user-danger-btn:hover { background: #f6e5e1; }
.user-rename { margin-top: 20px; padding-top: 14px; border-top: 1px solid #d8d9cf; }
.user-results li, .ledger-list li { flex-wrap: wrap; }
.user-results li small, .ledger-list li small { margin-left: auto; text-align: right; }
@media (max-width: 768px) {
  .user-detail-page .ad-page-head { align-items: flex-start; }
  .user-detail-page .ad-page-head > button { flex: 1 0 100%; }
  .user-results li small, .ledger-list li small { width: 100%; margin-left: 0; text-align: left; }
  .user-results li b, .ledger-list li b { margin-left: auto; }
}
</style>
