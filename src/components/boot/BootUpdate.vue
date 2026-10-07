<template>
  <div class="screen game-menu-screen boot-screen">
    <div class="hud-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="boot-hazard" aria-hidden="true"></div>

    <div class="title-bar">
      <h2>星链初始化</h2>
      <span class="season-mark">SECTOR LINK</span>
    </div>

    <!-- 顶部滑入公告条 -->
    <transition name="notice-slide">
      <div v-if="activeNotice" class="boot-notice-card" role="alert">
        <div class="notice-head">
          <span class="notice-tag">ANNOUNCEMENT · 公告</span>
          <button class="notice-close" aria-label="关闭公告" @click="dismissNotice">×</button>
        </div>
        <b class="notice-title">{{ activeNotice.title }}</b>
        <p class="notice-body">{{ activeNotice.body }}</p>
        <div v-if="activeNotice.actionUrl" class="notice-actions">
          <a
            class="notice-action-btn"
            :href="activeNotice.actionUrl"
            target="_blank"
            rel="noopener noreferrer"
            @click="onNoticeAction"
          >
            {{ activeNotice.actionLabel || '查看详情' }} →
          </a>
        </div>
      </div>
    </transition>

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
      <button v-if="!forceUpdate" class="boot-alt" @click="offline">离线继续（单机模式）</button>
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
import { BOOT_CONFIG, cmpVersion, parseAppConfig, markNoticeRead, shouldShowNotice } from '../../config/boot.js'
import { fetchPublicOps } from '../../core/remoteOps.js'
import { SERVERS, getRememberedServer, shouldSkipServerSelect, mergeServerStatus } from '../../config/servers.js'
import { bootProgress } from '../../core/bootProgress.js'
import packageInfo from '../../../package.json'

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
const activeNotice = ref(null)
let remoteServers = []

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

const primaryReady = computed(() => !running.value)
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

function dismissNotice() {
  if (activeNotice.value?.id) {
    markNoticeRead(activeNotice.value.id)
  }
  activeNotice.value = null
}

function onNoticeAction() {
  if (activeNotice.value?.id) {
    markNoticeRead(activeNotice.value.id)
  }
}

function primaryAction() {
  if (!primaryReady.value) return
  if (forceUpdate.value) {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
    return
  }
  if (sessionReady.value || enterDirect.value) emit('ready', { hasSession: true })
  else if (stepOf('server')?.state === 'error') retryConnect()
  else emit('ready', { hasSession: false })
}

function offline() {
  emit('offline')
}

async function fetchStaticAppConfig() {
  if (!BOOT_CONFIG.appConfigUrl) return null
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null
  try {
    const response = await fetch(BOOT_CONFIG.appConfigUrl, {
      cache: 'no-cache',
      signal: controller?.signal
    })
    if (!response?.ok) return null
    const cfg = parseAppConfig(await response.json())
    return cfg || null
  } catch (e) {
    return null
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

async function checkVersion() {
  const step = stepOf('version')
  bootProgress.version.state = 'running'
  bootProgress.version.detail = '检查中'
  step.state = 'running'
  step.detail = '…'

  // 版本 / 服务器仍由现有 app-config.json 管理；公告与 feature flags 优先从
  // 同一个公开 RPC 读取。RPC 不可用、未配置 Supabase 或未执行迁移时公告退回 JSON。
  const [cfg, opsResult] = await Promise.all([
    fetchStaticAppConfig(),
    fetchPublicOps({ timeoutMs: 1500 })
  ])

  if (opsResult.ok) {
    const notice = opsResult.data.announcements.find((item) => shouldShowNotice(item))
    activeNotice.value = notice || null
  } else if (cfg?.notice && shouldShowNotice(cfg.notice)) {
    activeNotice.value = cfg.notice
  }

  if (!cfg) {
    // 版本检查失败或被配置为跳过时不阻断；远程公告 RPC 仍独立生效。
    step.detail = BOOT_CONFIG.appConfigUrl ? '跳过（离线）' : '已跳过'
    step.state = 'done'
    bootProgress.version.state = 'done'
    bootProgress.version.detail = step.detail
    return
  }

  if (cfg.servers && cfg.servers.length) {
    remoteServers = cfg.servers
  }

  const currentVer = packageInfo.version || '1.0.0'
  if (cmpVersion(currentVer, cfg.minVersion) < 0) {
    forceUpdate.value = true
    step.detail = `需更新至 v${cfg.minVersion}`
    step.state = 'error'
    bootProgress.version.state = 'error'
    bootProgress.version.detail = step.detail
    return
  }

  if (cmpVersion(currentVer, cfg.latestVersion) < 0) {
    step.detail = `v${cfg.latestVersion}`
  } else {
    step.detail = '已是最新'
  }
  step.state = 'done'
  bootProgress.version.state = 'done'
  bootProgress.version.detail = step.detail
}

async function loadResources() {
  const step = stepOf('resource')
  bootProgress.resource.state = 'running'
  bootProgress.resource.detail = '加载中'
  step.state = 'running'
  try {
    await preloadSpritePacks((loaded, total) => {
      resource.loaded = loaded
      resource.total = total
      bootProgress.resource.loaded = loaded
      bootProgress.resource.total = total
    })
    step.detail = '就绪'
    step.state = 'done'
    bootProgress.resource.state = 'done'
    bootProgress.resource.detail = '就绪'
  } catch (e) {
    step.detail = '跳过（程序化兜底）'
    step.state = 'done' // 单张失败有程序化兜底，不算错误
    bootProgress.resource.state = 'done'
    bootProgress.resource.detail = step.detail
  }
}

async function connectServer() {
  const step = stepOf('server')
  bootProgress.server.state = 'running'
  bootProgress.server.detail = '连接中'
  step.state = 'running'
  step.detail = '…'

  const serverList = remoteServers.length
    ? mergeServerStatus(SERVERS, remoteServers)
    : SERVERS

  // 多服且无记忆 → 由用户在选服页决定
  if (!shouldSkipServerSelect()) {
    step.detail = '待选择'
    step.state = 'done'
    bootProgress.server.state = 'done'
    bootProgress.server.detail = step.detail
    sessionStepPending()
    running.value = false
    bootProgress.server.state = 'done'
    bootProgress.server.detail = step.detail
    emit('select-server')
    return
  }

  const remembered = getRememberedServer()
  const server = (remembered ? serverList.find((s) => s.id === remembered.id) : null) || serverList[0]
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
    setTimeout(() => { if (enterDirect.value && !forceUpdate.value) emit('ready', { hasSession: true }) }, 500)
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
    bootProgress.server.state = 'error'
    bootProgress.server.detail = step.detail
    sessionStepPending()
    running.value = false
  } else {
    // 连接成功但无会话 → 自动放行去登录页（按钮保留可提前点击）
    step.detail = serverLabel.value
    step.state = 'done'
    bootProgress.server.state = 'done'
    bootProgress.server.detail = step.detail
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
  if (forceUpdate.value) {
    running.value = false
    sessionStepPending()
    return
  }
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

/* 公告卡片：顶部滑入条 */
.boot-notice-card{position:relative;display:flex;flex-direction:column;gap:6px;padding:10px 12px;background:linear-gradient(160deg,rgba(14,38,72,.96),rgba(6,18,38,.98));border:1px solid rgba(255,211,110,.45);border-radius:4px;box-shadow:0 8px 24px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.12);z-index:10}
.notice-head{display:flex;align-items:center;justify-content:space-between}
.notice-tag{font-size:9px;font-weight:900;letter-spacing:.16em;color:#ffd36e}
.notice-close{width:22px;height:22px;display:grid;place-items:center;padding:0;font-size:16px;line-height:1;color:#8ab2d4;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:3px;cursor:pointer;transition:all .15s}
.notice-close:hover{color:#ffd36e;border-color:rgba(255,211,110,.4)}
.notice-title{color:#e8f4ff;font-size:13px;font-weight:900;letter-spacing:.04em}
.notice-body{margin:0;color:#9fc2de;font-size:11px;line-height:1.45;word-break:break-word}
.notice-actions{display:flex;justify-content:flex-end;margin-top:2px}
.notice-action-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:11px;font-weight:900;color:#241b0c;background:linear-gradient(180deg,#ffd36e,#ffb84d);border:1px solid #ffe48a;border-radius:3px;text-decoration:none;box-shadow:0 2px 0 #8f5a12}
.notice-action-btn:active{transform:translateY(1px);box-shadow:none}

.notice-slide-enter-active,.notice-slide-leave-active{transition:all .3s cubic-bezier(.2,.8,.2,1)}
.notice-slide-enter-from,.notice-slide-leave-to{opacity:0;transform:translateY(-10px)}

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
  .boot-term-dot,.boot-caret,.st-running .st-node i,.st-running::before,.st-running .st-bar i,.boot-progress-fill::after,.boot-cta.ready,.notice-slide-enter-active,.notice-slide-leave-active{animation:none}
}
</style>
