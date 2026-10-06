<template>
  <div class="screen game-menu-screen boot-screen">
    <div class="hud-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="boot-hazard" aria-hidden="true"></div>

    <div class="title-bar">
      <h2>星链初始化</h2>
      <span class="season-mark">SECTOR LINK</span>
    </div>

    <div class="page-context">
      <span class="page-kicker">CHECK &amp; LOAD</span>
      <b>正在建立登月链路</b>
    </div>

    <div class="boot-term" :class="{ busy: running }">
      <i class="boot-term-dot" aria-hidden="true"></i>
      <span class="boot-term-text">{{ headline }}</span>
      <i class="boot-caret" aria-hidden="true"></i>
    </div>

    <ul class="boot-steps">
      <li v-for="step in steps" :key="step.key" :class="`st-${step.state}`">
        <span class="st-node" aria-hidden="true"><i>{{ markOf(step) }}</i></span>
        <span class="st-body">
          <span class="st-line">
            <b class="st-name">{{ step.label }}</b>
            <small class="st-detail">{{ detailOf(step) }}</small>
          </span>
          <span class="st-bar" aria-hidden="true"><i></i></span>
        </span>
        <button v-if="step.state === 'error' && step.key === 'server'" class="st-retry" @click="retryConnect">重试</button>
      </li>
    </ul>

    <div class="boot-progress" aria-label="总进度">
      <b class="boot-progress-num">{{ totalProgress }}<i>%</i></b>
      <div class="boot-progress-frame">
        <div class="boot-progress-fill" :style="{ width: `${totalProgress}%` }"></div>
        <div class="boot-progress-ticks" aria-hidden="true"></div>
      </div>
    </div>

    <div class="boot-actions">
      <button class="boot-cta" :class="{ ready: primaryReady }" :disabled="!primaryReady" @click="primaryAction">
        {{ primaryLabel }}
      </button>
      <button class="boot-alt" @click="offline">离线继续（单机模式）</button>
    </div>

    <footer class="boot-foot">
      <i></i><small>官方社区 · 用户协议 · 隐私政策</small><i></i>
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
/* ================= 星链初始化 · 指令甲板风 ================= */
.boot-screen{display:flex;flex-direction:column;gap:13px;padding:calc(var(--safe-top,0px) + 16px) 20px calc(var(--safe-bottom,0px) + 16px)}

/* HUD 四角括号（装饰层，不挡交互） */
.hud-frame{position:absolute;inset:9px;pointer-events:none;z-index:6}
.hud-frame i{position:absolute;width:16px;height:16px;border:0 solid rgba(82,216,255,.5)}
.hud-frame i:nth-child(1){top:0;left:0;border-top-width:2px;border-left-width:2px}
.hud-frame i:nth-child(2){top:0;right:0;border-top-width:2px;border-right-width:2px}
.hud-frame i:nth-child(3){bottom:0;left:0;border-bottom-width:2px;border-left-width:2px}
.hud-frame i:nth-child(4){bottom:0;right:0;border-bottom-width:2px;border-right-width:2px}

/* 顶部警示条纹（航空检查位意象） */
.boot-hazard{flex:none;height:6px;border-radius:2px;opacity:.55;background:repeating-linear-gradient(-45deg,#ffd36e 0 9px,#0b1830 9px 18px);box-shadow:inset 0 0 0 1px rgba(255,211,110,.3)}

.boot-screen .title-bar{margin-bottom:2px;padding-bottom:10px}
.boot-screen .title-bar h2{font-size:23px;letter-spacing:.08em;text-shadow:0 2px 0 rgba(4,16,34,.9),0 0 20px rgba(82,216,255,.28)}
.season-mark{margin-left:auto;padding:4px 9px;font-size:9px;font-weight:900;letter-spacing:.22em;color:#52d8ff;background:rgba(6,20,42,.85);border:1px solid rgba(82,216,255,.4);clip-path:polygon(0 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%)}

/* 终端状态行：信号点 + 文案 + 闪烁光标 */
.boot-term{flex:none;display:flex;align-items:center;gap:9px;min-height:42px;padding:9px 12px;background:rgba(4,13,29,.88);border:1px solid rgba(99,210,255,.26);border-left:3px solid #ffd36e;border-radius:3px}
.boot-term-dot{width:7px;height:7px;flex:none;border-radius:50%;background:#ffd36e;box-shadow:0 0 10px #ffd36e}
.boot-term.busy .boot-term-dot{animation:term-blink 1s steps(2) infinite}
.boot-term-text{flex:1;color:#d7ecff;font-size:13px;font-weight:700;letter-spacing:.04em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.boot-caret{width:7px;height:15px;flex:none;background:#52d8ff;animation:term-blink 1s steps(2) infinite}

/* 任务清单：左侧竖轨 + 菱形节点 + 每步迷你进度 */
.boot-steps{list-style:none;margin:0;padding:0 0 0 2px;display:flex;flex-direction:column;gap:9px;position:relative}
.boot-steps::before{content:'';position:absolute;left:12px;top:14px;bottom:14px;width:1px;background:repeating-linear-gradient(180deg,rgba(99,210,255,.35) 0 5px,transparent 5px 10px)}
.boot-steps li{position:relative;display:flex;align-items:center;gap:11px;min-height:54px;padding:8px 11px;background:linear-gradient(150deg,rgba(14,36,68,.92),rgba(6,16,34,.94));border:1px solid rgba(99,210,255,.24);border-radius:3px;overflow:hidden}
.boot-steps li::after{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(146,231,255,.65),transparent);opacity:.55}

.st-node{position:relative;z-index:1;width:21px;height:21px;flex:none;transform:rotate(45deg);display:grid;place-items:center;background:#0a1d3b;border:1px solid rgba(99,210,255,.4);border-radius:3px;transition:all .2s}
.st-node i{transform:rotate(-45deg);font-style:normal;font-size:10px;font-weight:900;color:#7ea8c9;line-height:1}
.st-pending{opacity:.72}
.st-pending .st-node{opacity:.6}
.st-running .st-node{border-color:#ffd36e;background:#2a2210}
.st-running .st-node i{color:#ffd36e;animation:term-blink 1s steps(2) infinite}
.st-running{border-color:rgba(255,211,110,.45)}
.st-running::before{content:'';position:absolute;inset:0;background:linear-gradient(100deg,transparent 20%,rgba(255,211,110,.08) 50%,transparent 80%);background-size:220% 100%;animation:st-scan 1.6s linear infinite}
.st-done .st-node{border-color:rgba(82,216,255,.9);background:linear-gradient(180deg,#51d9ff,#2467db)}
.st-done .st-node i{color:#04121f}
.st-error .st-node{border-color:rgba(255,143,143,.9);background:#3a1116}
.st-error .st-node i{color:#ff8f8f}

.st-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.st-line{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.st-name{flex:none;color:#d7ecff;font-size:13px;font-weight:900;letter-spacing:.06em}
.st-detail{flex:1;color:#7ea3c4;font-size:11px;font-weight:700;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.st-bar{display:block;height:3px;border-radius:2px;background:rgba(147,191,218,.14);overflow:hidden}
.st-bar i{display:block;height:100%;width:0;border-radius:2px;background:linear-gradient(90deg,#51d9ff,#7be3ff)}
.st-running .st-bar i{width:38%;background:linear-gradient(90deg,#ffd36e,#ffb84d);animation:st-slide 1.1s ease-in-out infinite alternate}
.st-done .st-bar i{width:100%;box-shadow:0 0 8px rgba(82,216,255,.55)}
.st-error .st-bar i{width:100%;background:#ff8f8f}
.st-pending .st-bar{opacity:.4}
.st-retry{position:relative;z-index:1;flex:none;padding:6px 11px;font-size:11px;font-weight:900;letter-spacing:.08em;color:#ffd36e;background:#241b0c;border:1px solid rgba(255,211,110,.5);border-radius:3px;clip-path:polygon(0 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%)}
.st-retry:active{transform:translateY(1px)}

/* 总进度：大数字 + 分段能量条 */
.boot-progress{flex:none;display:flex;align-items:center;gap:12px}
.boot-progress-num{flex:none;min-width:58px;font-size:30px;font-weight:900;letter-spacing:.02em;color:#ffd36e;text-align:right;font-variant-numeric:tabular-nums;text-shadow:0 0 18px rgba(255,211,110,.35),0 2px 0 rgba(77,44,5,.8)}
.boot-progress-num i{font-style:normal;font-size:14px;margin-left:1px}
.boot-progress-frame{position:relative;flex:1;height:20px;border-radius:3px;background:#0a1d3b;border:1px solid rgba(99,210,255,.35);overflow:hidden;box-shadow:inset 0 2px 6px rgba(0,0,0,.5)}
.boot-progress-fill{height:100%;background:linear-gradient(90deg,#ffd36e,#ffb84d);box-shadow:0 0 14px rgba(255,200,90,.55);transition:width .4s ease}
.boot-progress-fill::after{content:'';position:absolute;top:0;bottom:0;width:26px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);animation:pg-sheen 1.4s linear infinite}
.boot-progress-ticks{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 17px,rgba(3,8,20,.55) 17px 20px)}

/* 主按钮：街机 3D 厚按键（金） + 次按钮（蓝幽灵） */
.boot-actions{display:flex;flex-direction:column;gap:9px;margin-top:auto;padding-top:4px}
.boot-cta{min-height:52px;border-radius:4px;font-size:17px;font-weight:900;letter-spacing:.14em;color:#231604;background:linear-gradient(180deg,#ffe48a,#f0a742);border:1px solid #ffe9a8;box-shadow:0 5px 0 #8f5a12,0 14px 28px rgba(255,180,60,.22),inset 0 2px 0 rgba(255,255,255,.55);transition:transform .08s ease,box-shadow .08s ease,filter .2s}
.boot-cta.ready{animation:cta-glow 2.2s ease-in-out infinite}
.boot-cta:active{transform:translateY(3px);box-shadow:0 2px 0 #8f5a12,0 6px 14px rgba(255,180,60,.18),inset 0 2px 0 rgba(255,255,255,.55)}
.boot-cta:disabled{filter:grayscale(.6) brightness(.72);animation:none;cursor:not-allowed}
.boot-alt{min-height:44px;border-radius:4px;font-size:13px;font-weight:800;letter-spacing:.1em;color:#9fc6e8;background:linear-gradient(180deg,rgba(20,44,78,.92),rgba(9,22,44,.95));border:1px solid rgba(99,210,255,.38);box-shadow:0 4px 0 rgba(4,14,30,.95),inset 0 1px 0 rgba(255,255,255,.08);transition:transform .08s ease,box-shadow .08s ease}
.boot-alt:active{transform:translateY(2px);box-shadow:0 2px 0 rgba(4,14,30,.95),inset 0 1px 0 rgba(255,255,255,.08)}

.boot-foot{flex:none;display:flex;align-items:center;justify-content:center;gap:9px}
.boot-foot i{flex:none;width:30px;height:1px;background:repeating-linear-gradient(90deg,rgba(99,210,255,.4) 0 4px,transparent 4px 8px)}
.boot-foot small{color:#5c7288;font-size:10px;letter-spacing:.12em}

@keyframes term-blink{0%,49%{opacity:1}50%,100%{opacity:.15}}
@keyframes st-scan{0%{background-position:120% 0}100%{background-position:-120% 0}}
@keyframes st-slide{0%{transform:translateX(-60%)}100%{transform:translateX(160%)}}
@keyframes pg-sheen{0%{left:-30px}100%{left:100%}}
@keyframes cta-glow{0%,100%{box-shadow:0 5px 0 #8f5a12,0 14px 28px rgba(255,180,60,.2),inset 0 2px 0 rgba(255,255,255,.55)}50%{box-shadow:0 5px 0 #8f5a12,0 16px 42px rgba(255,190,70,.5),inset 0 2px 0 rgba(255,255,255,.55)}}

@media (prefers-reduced-motion: reduce){
  .boot-term-dot,.boot-caret,.st-running .st-node i,.st-running::before,.st-running .st-bar i,.boot-progress-fill::after,.boot-cta.ready{animation:none}
}
</style>
