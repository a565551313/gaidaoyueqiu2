<template>
  <section class="ad-page dashboard-page">
    <section class="dashboard-hero" aria-labelledby="dashboard-title">
      <div class="dashboard-hero-copy">
        <div class="dashboard-hero-kicker"><span class="dashboard-live-dot"></span> MOONBASE / LIVE OPERATIONS <span class="dashboard-hero-index">01—09</span></div>
        <h1 id="dashboard-title">月球<br /><em>控制台</em></h1>
        <p>玩家规模、对局表现与游戏经济。<br />先看实时数据，再进入对应工作流。</p>
        <div class="dashboard-hero-meta">
          <el-tag class="dashboard-status-tag dashboard-env" :type="isMock ? 'warning' : 'success'" effect="plain"><i></i>{{ isMock ? '本地演练环境' : '云端运营环境' }}</el-tag>
          <el-tag v-if="updatedAt" class="dashboard-status-tag dashboard-sync-tag" type="info" effect="plain">最近同步 {{ updatedAt }}</el-tag>
          <el-tag v-else class="dashboard-status-tag dashboard-sync-tag" type="info" effect="plain">运营数据总览</el-tag>
        </div>
      </div>
      <div class="dashboard-orbit" aria-hidden="true">
        <div class="orbit-ring orbit-ring-one"></div><div class="orbit-ring orbit-ring-two"></div>
        <div class="orbit-planet"><span>G2</span></div>
        <span class="orbit-label orbit-label-top">PLAYER<br />ACTIVITY</span>
        <span class="orbit-label orbit-label-bottom">LUNAR<br />MISSION</span>
        <span class="orbit-coordinate">28° 12′ N<br />MOONBASE / 01</span>
      </div>
      <div class="dashboard-hero-stamp"><span>G</span><b>OPERATOR<br />DESK</b><i></i></div>
    </section>

    <header class="ad-page-head dashboard-section-head">
      <div><span class="dashboard-section-kicker">01 / SNAPSHOT</span><h2>运营数据</h2><p>当前可用的玩家与对局汇总</p></div>
      <el-button class="ad-btn dashboard-refresh" :disabled="loading" @click="load"><AdminIcon name="refresh" />{{ loading ? '同步中…' : '刷新数据' }}</el-button>
    </header>

    <AdminError :error="error" context="读取仪表盘数据" />

    <div v-if="loading && !data" class="dashboard-loading" role="status"><span class="dashboard-loader"></span><div><b>正在接收运营数据</b><small>连接玩家档案与战局记录…</small></div></div>
    <div v-else-if="!data" class="ad-list-empty dashboard-empty">
      <span class="dashboard-empty-mark"><AdminIcon name="analytics" /></span><p>暂时没有可显示的数据，请刷新后重试。</p>
      <el-button class="ad-btn dashboard-empty-action" :disabled="loading" @click="load">{{ loading ? '读取中…' : '重新读取数据' }}</el-button>
    </div>

    <template v-else>
      <div class="dashboard-metrics">
        <AdminMetricCard label="玩家总数" :value="Number(data.playerCount || 0).toLocaleString('zh-CN')" unit="位玩家" caption="PLAYER BASE" icon="players" serial="01" accent="lime" />
        <AdminMetricCard label="累计对局" :value="Number(data.resultCount || 0).toLocaleString('zh-CN')" unit="场记录" caption="MATCH HISTORY" icon="activity" serial="02" accent="orange" />
        <AdminMetricCard label="玩家持有金币" :value="Number(data.totalCoins || 0).toLocaleString('zh-CN')" unit="枚金币" caption="TOTAL COINS" icon="coin" serial="03" accent="ink" />
      </div>

      <section class="dashboard-shortcuts" aria-labelledby="dashboard-shortcuts-title">
        <header><div><span class="dashboard-section-kicker">QUICK ACCESS</span><h2 id="dashboard-shortcuts-title">常用操作</h2></div><small>从数据概览直接进入工作流</small></header>
        <div class="dashboard-shortcut-grid">
          <AdminQuickAction label="编辑游戏内容" description="调整方块、道具与配置" icon="factory" action="blocks" @navigate="emit('navigate', $event)" />
          <AdminQuickAction label="设计关卡" description="编辑关卡目标与节奏" icon="levels" action="levels" @navigate="emit('navigate', $event)" />
          <AdminQuickAction label="检查发布版本" description="查看草稿、发布或回滚" icon="publish" action="publish" @navigate="emit('navigate', $event)" />
          <AdminQuickAction label="管理运营内容" description="公告、开关与礼包码" icon="broadcast" action="ops" @navigate="emit('navigate', $event)" />
          <AdminQuickAction label="查找玩家" description="查看档案与客服记录" icon="players" action="users" @navigate="emit('navigate', $event)" />
        </div>
      </section>

      <div class="dashboard-content-grid">
        <section class="ad-panel dashboard-panel dashboard-ranking" aria-labelledby="ranking-title">
          <header class="dashboard-panel-head">
            <div><span class="dashboard-section-kicker">02 / LEADERBOARD</span><h3 id="ranking-title">本地高分榜</h3><p>当前记录中的最高分玩家</p></div>
            <el-tag class="dashboard-panel-count dashboard-status-tag" type="warning" effect="plain">TOP <b>05</b></el-tag>
          </header>
          <ol class="dashboard-rank-list">
            <li v-for="(row, index) in data.top || []" :key="row.playerId" class="dashboard-rank-row" :class="`rank-${index + 1}`">
              <span class="dashboard-rank-no">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="dashboard-rank-player"><b>{{ row.name || '未设置昵称' }}</b><span class="dashboard-rank-track"><i :style="{ width: rankWidth(row.score) }"></i></span></span>
              <span class="dashboard-rank-score">{{ Number(row.score || 0).toLocaleString('zh-CN') }}<small>分</small></span>
            </li>
            <li v-if="!data.top?.length" class="dashboard-list-empty">还没有榜单记录。玩家完成一局后会显示在这里。</li>
          </ol>
          <div class="dashboard-panel-foot"><span>榜单按已记录最高分排序</span><span>01—05</span></div>
        </section>

        <section class="ad-panel dashboard-panel dashboard-feed" aria-labelledby="feed-title">
          <header class="dashboard-panel-head">
            <div><span class="dashboard-section-kicker">03 / MATCH FEED</span><h3 id="feed-title">最近对局</h3><p>最近完成并写入的战局记录</p></div>
            <span class="dashboard-feed-pulse" aria-label="记录流"></span>
          </header>
          <ol class="dashboard-feed-list">
            <li v-for="(row, index) in data.recent || []" :key="`${row.at}-${row.player}-${index}`" class="dashboard-feed-row">
              <span class="dashboard-feed-marker"><i></i></span>
              <div class="dashboard-feed-main"><div class="dashboard-feed-title"><b>{{ row.player || '未知玩家' }}</b><time>{{ formatTime(row.at) }}</time></div>
                <div class="dashboard-feed-meta"><span>第 {{ row.levelId }} 关</span><span>{{ row.stars }} 星</span><span class="dashboard-feed-score">{{ Number(row.score || 0).toLocaleString('zh-CN') }} 分</span></div>
              </div>
            </li>
            <li v-if="!data.recent?.length" class="dashboard-list-empty">还没有对局记录。玩家完成一局后刷新查看。</li>
          </ol>
          <div class="dashboard-panel-foot"><span>仅显示最近可用记录</span><span>{{ (data.recent || []).length }} ENTRIES</span></div>
        </section>
      </div>

      <div class="dashboard-source-note"><span class="dashboard-source-mark"><AdminIcon name="broadcast" /></span><p>{{ isMock ? '本地演练环境：后台与同一浏览器中的游戏共用玩家数据。完成一局后刷新即可查看。' : '云端运营环境：此处汇总云端玩家与对局数据。玩家完成一局后刷新即可查看。' }}</p><span class="dashboard-source-code">DATA SOURCE / {{ isMock ? 'LOCAL' : 'CLOUD' }}</span></div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { adminState, fetchDashboard } from '../api.js'
import AdminError from '../components/AdminError.vue'
import AdminIcon from '../components/AdminIcon.vue'
import AdminMetricCard from '../components/AdminMetricCard.vue'
import AdminQuickAction from '../components/AdminQuickAction.vue'

const emit = defineEmits(['navigate'])

const data = ref(null)
const loading = ref(true)
const error = ref('')
const updatedAt = ref('')
const isMock = computed(() => adminState.mode !== 'supabase')

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await fetchDashboard()
    updatedAt.value = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}
function rankWidth(score) {
  const rows = data.value?.top || []
  const top = Math.max(1, ...rows.map((row) => Number(row.score || 0)))
  return `${Math.max(8, Math.round(Number(score || 0) / top * 100))}%`
}
function formatTime(at) {
  if (!at) return '—'
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}
onMounted(load)
</script>

<style scoped>
.dashboard-status-tag {
  --el-tag-bg-color: rgba(225, 237, 186, 0.08);
  --el-tag-border-color: rgba(225, 237, 186, 0.24);
  --el-tag-text-color: #dce9b8;
  height: auto;
  min-height: 24px;
  border-radius: 2px;
  font-family: inherit;
  letter-spacing: 0.04em;
}

.dashboard-env {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.dashboard-env :deep(i) {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.dashboard-sync-tag {
  --el-tag-bg-color: rgba(255, 255, 255, 0.035);
  --el-tag-border-color: rgba(255, 255, 255, 0.12);
  --el-tag-text-color: #aab1a4;
}

.dashboard-panel-count {
  --el-tag-bg-color: rgba(218, 157, 91, 0.08);
  --el-tag-border-color: rgba(218, 157, 91, 0.3);
  --el-tag-text-color: #d9a66f;
  align-self: flex-start;
}

.dashboard-refresh,
.dashboard-empty-action {
  font-family: inherit;
}

.dashboard-refresh :deep(.el-icon),
.dashboard-refresh :deep(svg) {
  margin-right: 6px;
}
</style>
