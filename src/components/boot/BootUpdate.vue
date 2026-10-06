<template>
  <div class="screen game-menu-screen boot-screen">
    <div class="title-bar">
      <h2>星链初始化</h2>
      <span class="season-mark">SECTOR LINK</span>
    </div>

    <div class="page-context">
      <span class="page-kicker">CHECK &amp; LOAD</span>
      <b>正在建立登月链路</b>
    </div>

    <div class="board-note">
      <span class="signal-dot" :class="{ slow: running }"></span>
      {{ headline }}
    </div>

    <ul class="boot-steps">
      <li v-for="step in steps" :key="step.key" :class="`st-${step.state}`">
        <i class="st-mark" aria-hidden="true">{{ markOf(step) }}</i>
        <span class="st-name">{{ step.label }}</span>
        <span class="st-detail">{{ detailOf(step) }}</span>
        <button v-if="step.state === 'error' && step.key === 'server'" class="st-retry" @click="retryConnect">重试</button>
      </li>
    </ul>

    <div class="boot-progress" aria-label="总进度">
      <div class="boot-progress-fill" :style="{ width: `${totalProgress}%` }"></div>
      <small>{{ totalProgress }}%</small>
    </div>

    <div class="boot-actions">
      <button class="btn btn-lg btn-block" :class="{ 'btn-primary': primaryReady }" :disabled="!primaryReady" @click="primaryAction">
        {{ primaryLabel }}
      </button>
      <button class="btn btn-ghost btn-block" @click="offline">离线继续（单机模式）</button>
    </div>

    <footer class="boot-foot">
      <small>官方社区 · 用户协议 · 隐私政策</small>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { CloudSync, cloudState } from '../../core/cloud/index.js'
import { preloadSpritePacks } from '../../core/spritePacks.js'
import { BOOT_CONFIG } from '../../config/boot.js'
import { SERVERS, getRememberedServer, shouldSkipServerSelect } from '../../config/servers.js'

const emit = defineEmits(['ready', 'offline', 'select-server'])

// 步骤行状态机：pending ○ → running ◐ → done ✓ / error ✗
const steps = reactive([
  { key: 'version', label: '检查版本', state: 'pending', detail: '…' },
  { key: 'resource', label: '读取资源', state: 'pending', detail: '…' },
  { key: 'server', label: '连接服务器', state: 'pending', detail: '…' },
  { key: 'session', label: '云端会话', state: 'pending', detail: '…' }
])
const stepOf = (key) => steps.find((s) => s.key === key)

const resource = reactive({ loaded: 0, total: 1 })
const serverLabel = ref('')
const sessionReady = ref(false)
const enterDirect = ref(false) // 无需登录页，直接进主菜单（会话已恢复 / 云端被玩家关闭）
const forceUpdate = ref(false)
const running = ref(true)

const headline = computed(() => {
  if (forceUpdate.value) return '发现新版本，请更新后进入'
  if (steps.some((s) => s.state === 'error')) return '部分链路未就绪，可重试或离线继续'
  if (sessionReady.value) return `欢迎回来 · ${serverLabel.value}`
  return '正在初始化…'
})

const totalProgress = computed(() => {
  const score = steps.reduce((sum, s) => sum + (s.state === 'done' ? 1 : s.state === 'running' ? 0.5 : 0), 0)
  return Math.round((score / steps.length) * 100)
})

const primaryReady = computed(() => !running.value && !forceUpdate.value)
const primaryLabel = computed(() => {
  if (forceUpdate.value) return '前往更新'
  if (sessionReady.value || enterDirect.value) return '进入游戏'
  if (stepOf('server')?.state === 'error') return '重试连接'
  return '前往登录'
})

function markOf(step) {
  return step.state === 'done' ? '✓' : step.state === 'error' ? '✗' : step.state === 'running' ? '◐' : '○'
}
function detailOf(step) {
  if (step.key === 'resource' && step.state === 'running') {
    return `${Math.round((resource.loaded / Math.max(1, resource.total)) * 100)}%`
  }
  return step.detail
}

function primaryAction() {
  if (!primaryReady.value) return
  if (sessionReady.value || enterDirect.value) emit('ready', { hasSession: true })
  else if (stepOf('server')?.state === 'error') retryConnect()
  else emit('ready', { hasSession: false })
}

function offline() {
  emit('offline')
}

async function checkVersion() {
  const step = stepOf('version')
  step.state = 'running'
  step.detail = '…'
  try {
    if (!BOOT_CONFIG.appConfigUrl) {
      step.detail = '已是最新'
      step.state = 'done'
      return
    }
    const res = await fetch(BOOT_CONFIG.appConfigUrl, { cache: 'no-cache' })
    const cfg = res.ok ? await res.json() : null
    if (!cfg) throw new Error('配置不可用')
    if (cfg.minVersion && cfg.latestVersion) {
      step.detail = `v${cfg.latestVersion}`
      step.state = 'done'
    }
  } catch (e) {
    // 版本检查失败不阻断：离线兜底，视为已是最新
    step.detail = '跳过（离线）'
    step.state = 'done'
  }
}

async function loadResources() {
  const step = stepOf('resource')
  step.state = 'running'
  try {
    await preloadSpritePacks((loaded, total) => {
      resource.loaded = loaded
      resource.total = total
    })
    step.detail = '就绪'
    step.state = 'done'
  } catch (e) {
    step.detail = '跳过（程序化兜底）'
    step.state = 'done' // 单张失败有程序化兜底，不算错误
  }
}

async function connectServer() {
  const step = stepOf('server')
  step.state = 'running'
  step.detail = '…'

  // 多服且无记忆 → 由用户在选服页决定
  if (!shouldSkipServerSelect()) {
    step.detail = '待选择'
    step.state = 'done'
    sessionStepPending()
    running.value = false
    emit('select-server')
    return
  }

  const server = getRememberedServer() || SERVERS[0]
  serverLabel.value = server?.name || ''
  const res = await CloudSync.connect(server)
  if (!cloudState.enabled) {
    // 玩家在设置里关闭了云端：不推登录页，直接进入（单机 + 本地存档）
    step.detail = '云端已关闭'
    step.state = 'done'
    const s = stepOf('session')
    s.state = 'done'
    s.detail = '本地模式'
    enterDirect.value = true
    running.value = false
    setTimeout(() => { if (enterDirect.value) emit('ready', { hasSession: true }) }, 500)
    return
  }
  if (res.session) {
    step.detail = serverLabel.value
    step.state = 'done'
    sessionReady.value = true
    const s = stepOf('session')
    s.state = 'done'
    s.detail = cloudState.session === 'account' ? `账号 ${cloudState.accountEmail}` : '游客已恢复'
    running.value = false
    // 回访自动放行（仍可点击提前进入）
    setTimeout(() => {
      if (sessionReady.value && !forceUpdate.value) emit('ready', { hasSession: true })
    }, 600)
  } else if (cloudState.status === 'error') {
    step.detail = cloudState.lastError ? '连接失败' : '连接失败'
    step.state = 'error'
    sessionStepPending()
    running.value = false
  } else {
    // 连接成功但无会话 → 自动放行去登录页（按钮保留可提前点击）
    step.detail = serverLabel.value
    step.state = 'done'
    sessionStepPending()
    running.value = false
    setTimeout(() => {
      if (!sessionReady.value && !enterDirect.value && !forceUpdate.value) emit('ready', { hasSession: false })
    }, 600)
  }
}

function sessionStepPending() {
  const s = stepOf('session')
  s.state = 'pending'
  s.detail = '待登录'
}

async function retryConnect() {
  running.value = true
  await connectServer()
}

onMounted(async () => {
  // 版本与资源并行启动，服务器连接随后（避免与资源抢首屏带宽的感知）
  await Promise.all([checkVersion(), loadResources()])
  await connectServer()
})
</script>

<style scoped>
.boot-screen{display:flex;flex-direction:column;gap:14px;padding:calc(var(--safe-top,0px) + 18px) 20px calc(var(--safe-bottom,0px) + 18px)}
.boot-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.boot-steps li{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(13,32,64,.66);border:1px solid rgba(112,222,255,.22);border-radius:10px;font-size:13px}
.st-mark{width:20px;height:20px;flex:none;display:grid;place-items:center;border-radius:50%;font-size:11px;font-weight:900;font-style:normal;background:#0a1d3b;border:1px solid #70deff33;color:#8da9c8}
.st-pending .st-mark{opacity:.55}
.st-running .st-mark{color:#ffd466;border-color:#ffd46666;animation:boot-pulse 1s ease-in-out infinite}
.st-done .st-mark{color:#7be3ff;border-color:#7be3ff88}
.st-error .st-mark{color:#ff8f8f;border-color:#ff8f8f88}
.st-name{flex:none;font-weight:800;color:#cfe8ff;min-width:5.5em}
.st-detail{flex:1;color:#8da9c8;font-size:12px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-retry{padding:3px 10px;border-radius:6px;border:1px solid #ffd46666;background:#2a2210;color:#ffd466;font-size:11px;font-weight:800;cursor:pointer}
.boot-progress{position:relative;height:14px;border-radius:8px;background:#0a1d3b;border:1px solid #70deff33;overflow:hidden}
.boot-progress-fill{height:100%;background:linear-gradient(90deg,#ffd466,#ffb84d);box-shadow:0 0 10px #ffd46666;transition:width .4s ease}
.boot-progress small{position:absolute;inset:0;display:grid;place-items:center;font-size:9px;font-weight:900;color:#0d1520;mix-blend-mode:normal;text-shadow:0 0 3px #fff8}
.boot-actions{display:flex;flex-direction:column;gap:8px;margin-top:auto}
.boot-foot{text-align:center;color:#5c7288;font-size:10px;letter-spacing:.06em}
.signal-dot.slow{animation-duration:1.6s}
@keyframes boot-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
</style>
