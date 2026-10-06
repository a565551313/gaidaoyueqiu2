<template>
  <section class="ad-page">
    <header class="ad-page-head">
      <h2>用户详情</h2>
      <button class="ad-btn" @click="emit('back')">← 返回列表</button>
    </header>

    <p v-if="error" class="ad-error">{{ error }}</p>
    <p v-if="!detail && !error" class="ad-empty">加载中…</p>

    <template v-if="detail">
      <div class="ad-cards">
        <div class="ad-card"><small>昵称</small><b>{{ detail.player.name }}</b></div>
        <div class="ad-card"><small>金币</small><b>{{ Number(detail.save?.coins || 0).toLocaleString() }}</b></div>
        <div class="ad-card"><small>解锁关</small><b>{{ detail.save?.unlocked || 1 }} / 56</b></div>
        <div class="ad-card"><small>云存档 rev</small><b>{{ detail.clientRev }}</b></div>
      </div>

      <div class="ad-grid-2">
        <div class="ad-panel">
          <h3>干预 · 补发金币</h3>
          <form class="ad-grant" @submit.prevent="doGrant">
            <input v-model.number="grantAmount" type="number" step="100" placeholder="±金额" required />
            <input v-model="grantReason" type="text" placeholder="原因（写入流水）" />
            <button class="ad-btn" type="submit" :disabled="grantBusy">补发</button>
          </form>
          <p v-if="grantMsg" :class="{ 'ad-error': grantErr, 'ad-ok': !grantErr }">{{ grantMsg }}</p>
          <h3 style="margin-top:18px">改名</h3>
          <form class="ad-grant" @submit.prevent="doRename">
            <input v-model="renameValue" type="text" :placeholder="detail.player.name" maxlength="16" />
            <button class="ad-btn" type="submit" :disabled="renameBusy">保存</button>
          </form>
          <p v-if="renameMsg" :class="{ 'ad-error': renameErr, 'ad-ok': !renameErr }">{{ renameMsg }}</p>
          <p class="ad-note">本地模拟模式下，对「我」补发金币会直接写入本机游戏存档 —— 刷新游戏页面即可看到。</p>
        </div>

        <div class="ad-panel">
          <h3>最近对局（{{ detail.results.length }}）</h3>
          <ul class="ad-recent tall">
            <li v-for="(row, i) in detail.results" :key="i">
              <span>第 {{ row.levelId }} 关</span>
              <small>{{ row.stars }}★ {{ row.cleared ? '通关' : '未通' }}</small>
              <b>{{ Number(row.score).toLocaleString() }}</b>
            </li>
            <li v-if="!detail.results.length" class="ad-empty">暂无对局记录</li>
          </ul>
        </div>
      </div>

      <div class="ad-panel">
        <h3>云存档 JSON（只读）</h3>
        <details>
          <summary>展开查看完整存档</summary>
          <pre class="ad-json">{{ JSON.stringify(detail.save, null, 2) }}</pre>
        </details>
        <div class="ad-save-stats" v-if="detail.save">
          <span>总星：{{ totalStars(detail.save) }} / 168</span>
          <span>材质：{{ ownedMaterials(detail.save) }} / 5</span>
          <span>携带宠物：{{ detail.save.activePetId || '无' }}</span>
          <span>装备材质：{{ detail.save.equippedMaterial }}</span>
        </div>
      </div>

      <div class="ad-panel" v-if="detail.ledger.length">
        <h3>金币流水（{{ detail.ledger.length }}）</h3>
        <ul class="ad-recent">
          <li v-for="(row, i) in detail.ledger" :key="i">
            <span>{{ row.reason }}</span>
            <small>{{ formatTime(row.at) }}</small>
            <b :class="{ neg: row.deltaCoins < 0 }">{{ row.deltaCoins > 0 ? '+' : '' }}{{ row.deltaCoins }}</b>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { fetchUserDetail, grantCoins, renamePlayer } from '../api.js'

const props = defineProps({ userId: { type: String, default: '' } })
const emit = defineEmits(['back'])

const detail = ref(null)
const error = ref('')
const grantAmount = ref(1000)
const grantReason = ref('客服补发')
const grantBusy = ref(false)
const grantMsg = ref('')
const grantErr = ref(false)
const renameValue = ref('')
const renameBusy = ref(false)
const renameMsg = ref('')
const renameErr = ref(false)

async function load() {
  error.value = ''
  detail.value = null
  if (!props.userId) {
    error.value = '未指定用户'
    return
  }
  try {
    detail.value = await fetchUserDetail(props.userId)
    if (!detail.value) error.value = '用户不存在'
  } catch (e) {
    error.value = String(e?.message || e)
  }
}

async function doGrant() {
  grantBusy.value = true
  grantMsg.value = ''
  try {
    const res = await grantCoins(props.userId, grantAmount.value, grantReason.value || 'cs_grant')
    grantErr.value = false
    grantMsg.value = `已补发 ${grantAmount.value} 金币${res?.coins != null ? `，当前余额 ${res.coins}` : ''}`
    await load()
  } catch (e) {
    grantErr.value = true
    grantMsg.value = String(e?.message || e)
  } finally {
    grantBusy.value = false
  }
}

async function doRename() {
  renameBusy.value = true
  renameMsg.value = ''
  try {
    await renamePlayer(props.userId, renameValue.value)
    renameErr.value = false
    renameMsg.value = '已保存'
    renameValue.value = ''
    await load()
  } catch (e) {
    renameErr.value = true
    renameMsg.value = String(e?.message || e)
  } finally {
    renameBusy.value = false
  }
}

function totalStars(save) {
  return Object.values(save?.stars || {}).reduce((a, b) => a + (b || 0), 0)
}
function ownedMaterials(save) {
  return Object.values(save?.materials || {}).filter(Boolean).length
}
function formatTime(at) {
  if (!at) return ''
  const d = new Date(at)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(load)
watch(() => props.userId, load)
</script>
