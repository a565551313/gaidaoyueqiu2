<template>
  <div class="loading-screen" role="status" aria-live="polite">
    <div class="loading-backdrop" aria-hidden="true"></div>
    <div class="loading-shade" aria-hidden="true"></div>

    <div class="loading-copy">
      <span class="loading-kicker">MOONBASE SYSTEM</span>
      <h1>正在准备登月设备</h1>
      <p>{{ statusText }}</p>
    </div>

    <div class="loading-progress">
      <div class="loading-progress-meta">
        <span>{{ activeLabel }}</span>
        <b>{{ progress }}%</b>
      </div>
      <div class="loading-progress-track" aria-hidden="true">
        <div class="loading-progress-fill" :style="{ width: `${progress}%` }"></div>
        <i class="loading-progress-glow"></i>
      </div>
      <div class="loading-progress-detail">{{ detailText }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { bootProgress } from '../../core/bootProgress.js'

const stages = computed(() => [
  bootProgress.version,
  bootProgress.resource,
  bootProgress.server
])

const progress = computed(() => {
  const score = stages.value.reduce((sum, stage) => {
    if (stage.state === 'done') return sum + 1
    if (stage.state === 'running') {
      if (stage === bootProgress.resource) {
        return sum + stage.loaded / Math.max(1, stage.total)
      }
      return sum + 0.45
    }
    return sum
  }, 0)
  return Math.min(100, Math.round((score / stages.value.length) * 100))
})

const activeStage = computed(() =>
  stages.value.find((stage) => stage.state === 'running') ||
  stages.value.find((stage) => stage.state === 'pending')
)

const activeLabel = computed(() => {
  if (activeStage.value === bootProgress.version) return 'CHECKING VERSION'
  if (activeStage.value === bootProgress.resource) return 'CHECKING & DOWNLOADING RESOURCES'
  if (activeStage.value === bootProgress.server) return 'CONNECTING SERVER'
  return 'BOOT SEQUENCE COMPLETE'
})

const statusText = computed(() => {
  if (bootProgress.version.state === 'running') return '正在检查游戏版本…'
  if (bootProgress.resource.state === 'running') return '正在检查并下载游戏资源…'
  if (bootProgress.server.state === 'running') return '正在连接服务器…'
  if (progress.value >= 100) return '启动检查完成，正在进入系统…'
  return '正在准备登月设备…'
})

const detailText = computed(() => {
  if (bootProgress.version.state === 'running') return '正在读取版本配置'
  if (bootProgress.server.state === 'running') return bootProgress.server.detail
  if (bootProgress.resource.state === 'running' || bootProgress.resource.state === 'done') {
    return `${bootProgress.resource.loaded} / ${bootProgress.resource.total} 个资源已就绪`
  }
  return bootProgress.version.detail
})
</script>

<style scoped>
.loading-screen{position:relative;display:flex;flex-direction:column;justify-content:flex-end;min-height:100%;overflow:hidden;background:#070d1d;color:#eff8ff}
.loading-backdrop,.loading-shade{position:absolute;inset:0}
.loading-backdrop{background:url('/assets/art/loading-bg.png') center/cover no-repeat;transform:scale(1.015)}
.loading-shade{background:linear-gradient(180deg,rgba(3,8,22,.08) 0%,rgba(4,10,27,.1) 42%,rgba(3,8,22,.76) 75%,rgba(2,6,18,.98) 100%)}
.loading-copy{position:relative;z-index:1;margin:0 auto clamp(130px,18vh,190px);width:min(calc(100% - 40px),620px);text-align:center;text-shadow:0 2px 14px rgba(0,0,0,.75)}
.loading-kicker{color:#7fe7ff;font-size:10px;font-weight:900;letter-spacing:.28em}
.loading-copy h1{margin:12px 0 8px;font-size:clamp(22px,5vw,34px);letter-spacing:.12em}
.loading-copy p{margin:0;color:#c4e6fa;font-size:12px;letter-spacing:.12em}
.loading-progress{position:relative;z-index:1;width:min(calc(100% - 32px),680px);margin:0 auto calc(var(--safe-bottom,0px) + 30px);padding:12px 14px 11px;background:rgba(3,13,31,.76);border:1px solid rgba(92,218,255,.48);box-shadow:0 0 0 1px rgba(255,211,110,.12),0 12px 30px rgba(0,0,0,.5),inset 0 1px rgba(255,255,255,.12);backdrop-filter:blur(5px)}
.loading-progress-meta,.loading-progress-detail{display:flex;justify-content:space-between;gap:12px;font-size:9px;font-weight:900;letter-spacing:.12em}
.loading-progress-meta{color:#9fdcf3}.loading-progress-meta b{color:#72e7ff;font-size:12px}
.loading-progress-track{position:relative;height:10px;margin-top:9px;overflow:hidden;background:#071326;border:1px solid rgba(118,211,255,.55);box-shadow:inset 0 2px 5px rgba(0,0,0,.55)}
.loading-progress-fill{height:100%;background:linear-gradient(90deg,#1268c9,#4ce4ff);box-shadow:0 0 12px #35dfff;transition:width .18s ease}
.loading-progress-glow{position:absolute;top:0;bottom:0;width:72px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.65),transparent);transform:translateX(-100%);animation:progress-sweep 1.4s linear infinite;pointer-events:none}
.loading-progress-detail{margin-top:7px;color:#6e91ad;font-weight:700;letter-spacing:.06em}
@keyframes progress-sweep{to{transform:translateX(calc(min(100vw,680px) + 72px))}}
@media (max-width:520px){
  .loading-copy{margin-bottom:clamp(120px,16vh,160px)}
  .loading-copy h1{font-size:21px;letter-spacing:.08em}
  .loading-progress-meta{font-size:8px}
}
@media (prefers-reduced-motion:reduce){.loading-progress-glow{animation:none}}
</style>
