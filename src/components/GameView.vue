<template>
  <div class="game-root no-select">
    <!-- Canvas 背景 -->
    <div class="canvas-wrap" ref="wrap">
      <canvas ref="cv" class="game-canvas" :style="canvasStyle"></canvas>
    </div>

    <!-- 点击落层层（在按钮之下） -->
    <div
      v-if="phase === 'playing'"
      class="tap-layer"
      @pointerdown.prevent="onTap"
    ></div>

    <!-- ========== 开局准备 ========== -->
    <div v-if="phase === 'prep'" class="prep screen">
      <div class="title-bar">
        <button class="icon-btn" @click="exitToLevels"><BackIcon /></button>
        <h2>开局准备</h2>
        <div class="pill" style="margin-left:auto"><span class="coin-dot"></span>{{ store.coins }}</div>
      </div>

      <div class="prep-card card">
        <div class="prep-lv-name">第 {{ level.id }} 关 · {{ level.name }}</div>
        <div class="prep-meta text-soft">目标 {{ level.target }} 层 · 速度 {{ level.speed }}</div>
        <div class="prep-best">
          历史最佳：
          <StarIcon v-for="n in 3" :key="n" :size="18" :filled="best >= n"
            :style="{ color: best >= n ? 'var(--gold)' : 'var(--panel-border)' }" />
          <span v-if="best === 0" class="text-soft" style="margin-left:6px">尚未通关</span>
        </div>
      </div>

      <div class="prep-cards">
        <div class="prep-title">开局道具</div>
        <label class="opt-card card" :class="{ disabled: (store.items.widen||0) === 0, on: useWiden }">
          <div class="opt-icon" style="background:#ba9bff"><ItemGlyph id="widen" :size="26" /></div>
          <div class="opt-info">
            <div class="opt-name">加宽卡 <span class="opt-count">×{{ store.items.widen || 0 }}</span></div>
            <div class="opt-desc text-soft">初始宽度 +10%，满分同步提高</div>
          </div>
          <input type="checkbox" v-model="useWiden" :disabled="(store.items.widen||0)===0" />
          <span class="check-box"><CheckIcon :size="16" /></span>
        </label>
        <label class="opt-card card" :class="{ disabled: (store.items.double||0) === 0, on: useDouble }">
          <div class="opt-icon" style="background:#ffc93a;color:#5a3d00"><ItemGlyph id="double" :size="26" /></div>
          <div class="opt-info">
            <div class="opt-name">双倍金币卡 <span class="opt-count">×{{ store.items.double || 0 }}</span></div>
            <div class="opt-desc text-soft">本局结算金币 ×2</div>
          </div>
          <input type="checkbox" v-model="useDouble" :disabled="(store.items.double||0)===0" />
          <span class="check-box"><CheckIcon :size="16" /></span>
        </label>
        <div class="prep-equip text-soft">
          <span v-if="(store.items.shield||0)>0">护盾 ×{{ store.items.shield }} 已装备</span>
          <span v-if="(store.items.comboGuard||0)>0">连击保护 ×{{ store.items.comboGuard }} 已装备</span>
          <span v-if="(store.items.revive||0)>0">复活 ×{{ store.items.revive }} 待命</span>
        </div>
      </div>

      <div class="prep-actions">
        <button class="btn btn-ghost" @click="exitToLevels">返回</button>
        <button class="btn btn-primary" @click="startChallenge"><PlayIcon :size="20" /> 开始挑战</button>
      </div>
    </div>

    <!-- ========== 游戏 HUD ========== -->
    <template v-if="phase === 'playing'">
      <div class="hud-top">
        <button class="icon-btn hud-btn" @pointerdown.stop="pause"><PauseIcon /></button>
        <div class="hud-center">
          <div class="hud-lv">第 {{ level.id }} 关 · {{ hud.levelName }}</div>
          <div class="hud-nums">
            <span class="hud-score">{{ hud.score }}</span>
            <span class="hud-coin"><span class="coin-dot"></span>{{ hud.coins }}</span>
          </div>
        </div>
        <div class="hud-floors">
          <div class="floors-num">{{ hud.floors }}<span>/{{ hud.target }}</span></div>
          <div class="floors-label">层</div>
        </div>
      </div>

      <!-- 星级进度条 -->
      <div class="star-bar-wrap">
        <div class="star-bar">
          <div class="star-fill" :style="{ width: Math.min(100, rate * 100) + '%' }"></div>
          <div class="star-mark" style="left:70%"><StarIcon :size="12" /><StarIcon :size="12" /></div>
          <div class="star-mark" style="left:85%"><StarIcon :size="12" /><StarIcon :size="12" /><StarIcon :size="12" /></div>
        </div>
        <div class="star-hint">{{ nextStarHint }}</div>
      </div>

      <!-- 连击徽标 -->
      <transition name="pop">
        <div v-if="hud.combo >= 2" class="combo-badge" :style="comboStyle">
          <FlameIcon :size="18" /> 完美 ×{{ hud.combo }}
        </div>
      </transition>

      <!-- 计时提示 -->
      <div class="timer-hints">
        <div v-if="hud.slowActive" class="timer-chip slow"><ClockIcon :size="15" /> 慢动作 {{ hud.slowRemaining }}s</div>
        <div v-if="hud.autoActive" class="timer-chip auto"><BoltIcon :size="15" /> AI 接管 {{ hud.autoRemaining }}s</div>
      </div>

      <!-- 底部道具与充能 -->
      <div class="hud-bottom">
        <div class="side-items">
          <button
            class="use-btn"
            :class="{ disabled: hud.inv.slow <= 0 || hud.slowActive || hud.autoActive }"
            @pointerdown.stop="useSlow"
          >
            <ItemGlyph id="slow" :size="24" />
            <span class="use-count">{{ hud.inv.slow }}</span>
            <span class="use-name">慢慢</span>
          </button>
          <button
            class="use-btn"
            :class="{ disabled: hud.inv.auto <= 0 || hud.slowActive || hud.autoActive }"
            @pointerdown.stop="useAuto"
          >
            <ItemGlyph id="auto" :size="24" />
            <span class="use-count">{{ hud.inv.auto }}</span>
            <span class="use-name">自动</span>
          </button>
        </div>

        <button
          class="charge-btn"
          :class="{ ready: hud.chargeReady }"
          @pointerdown.stop="releaseFlame"
        >
          <svg viewBox="0 0 72 72" class="charge-ring">
            <circle cx="36" cy="36" r="32" class="ring-bg" />
            <circle
              cx="36" cy="36" r="32"
              class="ring-fill"
              :stroke-dasharray="ringLen"
              :stroke-dashoffset="ringLen * (1 - chargePct)"
            />
          </svg>
          <div class="flame-core" :style="flameCoreStyle">
            <FlameIcon :size="26" />
          </div>
          <div class="charge-label">{{ hud.chargeReady ? '可释放' : hud.charge + '/' + hud.chargeCap }}</div>
        </button>
      </div>
    </template>

    <!-- ========== 暂停弹窗 ========== -->
    <transition name="pop">
      <div v-if="phase === 'paused'" class="overlay" @click.self="() => {}">
        <div class="modal center-modal">
          <h2>已暂停</h2>
          <p class="text-soft">第 {{ level.id }} 关 · {{ level.name }}</p>
          <button class="btn btn-primary btn-block" @click="resume"><PlayIcon :size="18" /> 继续游戏</button>
          <button class="btn btn-ghost btn-block" style="margin-top:10px" @click="exitToLevels">退出关卡</button>
        </div>
      </div>
    </transition>

    <!-- ========== 复活询问 ========== -->
    <transition name="pop">
      <div v-if="showRevive" class="overlay">
        <div class="modal center-modal">
          <div class="revive-icon"><ItemGlyph id="revive" :size="44" /></div>
          <h2>是否使用复活卡？</h2>
          <p class="text-soft">恢复本局初始宽度，从当前高度继续。剩余 {{ store.items.revive || 0 }} 张。</p>
          <button class="btn btn-gold btn-block" @click="acceptRevive">复活并继续</button>
          <button class="btn btn-ghost btn-block" style="margin-top:10px" @click="declineRevive">放弃本局</button>
        </div>
      </div>
    </transition>

    <!-- ========== 结算 ========== -->
    <transition name="pop">
      <div v-if="phase === 'result'" class="overlay">
        <div class="modal result-modal">
          <div class="result-head" :class="result.cleared ? 'ok' : 'bad'">
            <template v-if="result.cleared">
              <div class="stars-row">
                <div
                  v-for="n in 3"
                  :key="n"
                  class="big-star"
                  :class="{ lit: result.stars >= n, show: starShow >= n }"
                >
                  <StarIcon :size="46" :filled="result.stars >= n" />
                </div>
              </div>
              <h2>{{ level.id === 6 ? '成功登月！' : '通关成功' }}</h2>
            </template>
            <template v-else>
              <div class="fail-mark"><FailGlyph /></div>
              <h2>挑战失败</h2>
            </template>
          </div>

          <div class="result-stats">
            <div class="rs-row"><span>得分</span><b>{{ result.score }} / {{ result.theoreticalMax }}</b></div>
            <div class="rs-row"><span>达成率</span><b>{{ (result.rate * 100).toFixed(1) }}%</b></div>
            <div class="rs-row"><span>最高连击</span><b>×{{ result.maxCombo }}</b></div>
            <div class="rs-row" v-if="result.cleared && result.starMult > 1">
              <span>星级金币加成</span><b class="up">+{{ Math.round((result.starMult - 1) * 100) }}%</b>
            </div>
            <div class="rs-row" v-if="result.doubleCoin">
              <span>双倍金币卡</span><b class="up">×2</b>
            </div>
            <div class="rs-row total"><span>获得金币</span><b class="coin-total"><span class="coin-dot"></span>{{ result.coins }}</b></div>
          </div>

          <div class="result-actions">
            <button class="btn btn-ghost" @click="exitToLevels">选关</button>
            <button class="btn btn-ghost" @click="retry">再来一局</button>
            <button
              v-if="result.cleared && level.id < 6"
              class="btn btn-primary"
              @click="nextLevel"
            >下一关</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, h, nextTick } from 'vue'
import { GameEngine, LOGICAL_W, LOGICAL_H } from '../core/gameEngine.js'
import { getLevel } from '../data/levels.js'
import { useStore, actions } from '../core/store.js'
import { Audio } from '../core/audio.js'
import {
  BackIcon, StarIcon, PlayIcon, PauseIcon, FlameIcon, ClockIcon, BoltIcon, CheckIcon
} from './icons.js'
import ItemGlyph from './ItemGlyph.vue'

const props = defineProps({ levelId: { type: Number, default: 1 } })
const emit = defineEmits(['nav', 'play'])

const store = useStore()
const level = computed(() => getLevel(props.levelId))
const best = computed(() => store.stars[props.levelId] || 0)

const phase = ref('prep') // prep | playing | paused | result
const useWiden = ref(false)
const useDouble = ref(false)
const showRevive = ref(false)
const result = ref(null)
const starShow = ref(0)

const cv = ref(null)
const wrap = ref(null)
let engine = null
let raf = 0
let lastT = 0
let ctx = null
let dpr = 1

const hud = reactive({
  status: 'playing', floors: 0, target: level.value.target, score: 0, theoreticalMax: 1,
  coins: 0, combo: 0, maxCombo: 0, charge: 0, chargeCap: 1, chargeReady: false,
  slowRemaining: 0, autoRemaining: 0, slowActive: false, autoActive: false,
  inv: { slow: 0, auto: 0, shield: 0, comboGuard: 0, revive: 0 },
  levelName: level.value.name, levelId: level.value.id
})

const canvasStyle = reactive({ width: '0px', height: '0px', left: '0px', top: '0px' })

const rate = computed(() => (hud.theoreticalMax > 0 ? hud.score / hud.theoreticalMax : 0))
const chargePct = computed(() => (hud.chargeCap > 0 ? hud.charge / hud.chargeCap : 0))
const ringLen = 2 * Math.PI * 32

const nextStarHint = computed(() => {
  const max = hud.theoreticalMax
  const s = hud.score
  if (rate.value < 0.7) return `距二星还差 ${Math.max(0, Math.ceil(max * 0.7 - s))} 分`
  if (rate.value < 0.85) return `距三星还差 ${Math.max(0, Math.ceil(max * 0.85 - s))} 分`
  return '已达三星水准！'
})

const comboStyle = computed(() => {
  const c = Math.min(hud.combo, 12)
  const hue = 40 - c * 2
  return { background: `linear-gradient(135deg, hsl(${hue},95%,60%), hsl(${hue - 15},90%,52%))` }
})
const flameCoreStyle = computed(() => {
  const p = chargePct.value
  const scale = 0.7 + p * 0.5
  return { transform: `scale(${scale})`, filter: `brightness(${0.9 + p * 0.6})` }
})

// ---------------- 尺寸（cover 铺满） ----------------
function resize() {
  const el = wrap.value
  if (!el || !cv.value) return
  const cw = el.clientWidth
  const ch = el.clientHeight
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  cv.value.width = LOGICAL_W * dpr
  cv.value.height = LOGICAL_H * dpr
  const scale = Math.max(cw / LOGICAL_W, ch / LOGICAL_H)
  const dw = LOGICAL_W * scale
  const dh = LOGICAL_H * scale
  canvasStyle.width = dw + 'px'
  canvasStyle.height = dh + 'px'
  canvasStyle.left = (cw - dw) / 2 + 'px'
  canvasStyle.top = (ch - dh) / 2 + 'px'
  ctx = cv.value.getContext('2d')
}

let ro = null

// ---------------- 引擎生命周期 ----------------
function startChallenge() {
  // 消耗开局道具（仅当勾选且确有库存时才生效并扣除）
  const canWiden = useWiden.value && (store.items.widen || 0) > 0
  const canDouble = useDouble.value && (store.items.double || 0) > 0
  if (canWiden) store.items.widen--
  if (canDouble) store.items.double--

  const inventory = {
    revive: store.items.revive || 0,
    auto: store.items.auto || 0,
    slow: store.items.slow || 0,
    shield: store.items.shield || 0,
    comboGuard: store.items.comboGuard || 0
  }

  const resolvedTheme = getResolvedTheme()

  engine = new GameEngine({
    level: level.value,
    theme: resolvedTheme,
    skills: { ...store.skills },
    inventory,
    widenActive: canWiden,
    doubleActive: canDouble,
    onState: (s) => Object.assign(hud, s),
    onEnd: onGameEnd,
    onReviveOffer: () => { showRevive.value = true },
    onInventoryChange: (key, val) => { store.items[key] = val }
  })
  phase.value = 'playing'
  Audio.click()
  nextTick(() => {
    resize()
    lastT = performance.now()
  })
}

function getResolvedTheme() {
  const t = store.settings.theme
  if (t === 'system') {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return t
}

function loop(now) {
  raf = requestAnimationFrame(loop)
  if (!ctx) return
  const dt = (now - lastT) / 1000
  lastT = now
  if (engine) {
    // 仅在“暂停”时冻结（此时引擎 status 仍为 playing）。
    // 结算/失败/复活询问时引擎自身会冻结逻辑，但特效仍需缓动，故照常传 dt。
    engine.update(phase.value === 'paused' ? 0 : dt)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    engine.render(ctx)
  }
}

// ---------------- 输入 ----------------
function onTap() {
  if (phase.value !== 'playing' || !engine) return
  engine.tap()
}
function onKey(e) {
  if (e.code === 'Space') {
    e.preventDefault()
    if (phase.value === 'playing' && engine) engine.tap()
  } else if (e.code === 'Escape') {
    if (phase.value === 'playing') pause()
  }
}
function releaseFlame() {
  if (engine) engine.releaseFlame()
}
function useSlow() {
  if (engine) engine.useSlow()
}
function useAuto() {
  if (engine) engine.useAuto()
}

// ---------------- 暂停 ----------------
function pause() {
  if (phase.value !== 'playing') return
  phase.value = 'paused'
  Audio.click()
}
function resume() {
  if (phase.value !== 'paused') return
  phase.value = 'playing'
  lastT = performance.now()
  Audio.click()
}
function onVisibility() {
  if (document.hidden && phase.value === 'playing') {
    pause()
  }
}

// ---------------- 复活 ----------------
function acceptRevive() {
  showRevive.value = false
  lastT = performance.now()
  if (engine) engine.acceptRevive()
}
function declineRevive() {
  showRevive.value = false
  if (engine) engine.declineRevive()
}

// ---------------- 结算 ----------------
function onGameEnd(r) {
  result.value = r
  actions.settle(r)
  phase.value = 'result'
  showRevive.value = false
  if (r.cleared) {
    starShow.value = 0
    let i = 0
    const reveal = () => {
      if (i >= r.stars) return
      i++
      starShow.value = i
      Audio.star(i - 1)
      if (i < r.stars) setTimeout(reveal, 380)
    }
    setTimeout(reveal, 400)
  }
}

function retry() {
  Audio.click()
  cleanupEngine()
  result.value = null
  // 重新按当前库存决定是否可勾选
  if ((store.items.widen || 0) === 0) useWiden.value = false
  if ((store.items.double || 0) === 0) useDouble.value = false
  phase.value = 'prep'
}
function nextLevel() {
  Audio.click()
  cleanupEngine()
  result.value = null
  emit('play', Math.min(6, level.value.id + 1))
}
function exitToLevels() {
  Audio.click()
  cleanupEngine()
  emit('nav', 'levels')
}

function cleanupEngine() {
  if (engine) {
    engine.destroy()
    engine = null
  }
}

// ---------------- 挂载 ----------------
onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.addEventListener('visibilitychange', onVisibility)
  nextTick(() => {
    resize()
    ro = new ResizeObserver(() => resize())
    if (wrap.value) ro.observe(wrap.value)
  })
  lastT = performance.now()
  raf = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('visibilitychange', onVisibility)
  if (ro) ro.disconnect()
  cleanupEngine()
})

// 失败图标
const FailGlyph = () =>
  h('svg', { width: 52, height: 52, viewBox: '0 0 24 24', fill: 'none' }, [
    h('circle', { cx: 12, cy: 12, r: 9, fill: '#ff5d73' }),
    h('path', { d: 'M8.5 8.5l7 7M15.5 8.5l-7 7', stroke: '#fff', 'stroke-width': 2.2, 'stroke-linecap': 'round' })
  ])
</script>

<style scoped>
.game-root {
  position: fixed;
  inset: 0;
  overflow: hidden;
  touch-action: none;
}
.canvas-wrap {
  position: absolute;
  inset: 0;
  background: #10142e;
  overflow: hidden;
}
.game-canvas {
  position: absolute;
  display: block;
}
.tap-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
}

/* prep 复用 screen，需要在 canvas 之上 */
.prep {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: linear-gradient(160deg, var(--bg-grad-top), var(--bg-grad-bot));
  gap: 16px;
}
.prep-card {
  padding: 18px;
  text-align: center;
}
.prep-lv-name {
  font-size: 22px;
  font-weight: 900;
}
.prep-meta {
  margin: 6px 0 12px;
}
.prep-best {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-weight: 700;
}
.prep-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.prep-title {
  font-weight: 800;
  color: var(--text-soft);
  font-size: 14px;
}
.opt-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  position: relative;
  cursor: pointer;
}
.opt-card.disabled {
  opacity: 0.45;
  pointer-events: none;
}
.opt-card.on {
  outline: 2px solid var(--primary);
}
.opt-card input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.opt-icon {
  width: 46px;
  height: 46px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.opt-info {
  flex: 1;
}
.opt-name {
  font-weight: 800;
}
.opt-count {
  color: var(--text-soft);
  font-size: 13px;
  font-weight: 600;
}
.opt-desc {
  font-size: 12px;
  margin-top: 2px;
}
.check-box {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 2px solid var(--panel-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  flex-shrink: 0;
}
.opt-card.on .check-box {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.prep-equip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  font-size: 12px;
  margin-top: 2px;
}
.prep-actions {
  margin-top: auto;
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 12px;
}

/* HUD */
.hud-top {
  position: absolute;
  top: calc(var(--safe-top) + 10px);
  left: 12px;
  right: 12px;
  z-index: 10;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.hud-btn {
  background: rgba(255, 255, 255, 0.9);
  color: #26305a;
}
:root[data-theme='dark'] .hud-btn {
  background: rgba(40, 46, 90, 0.85);
  color: #eef1ff;
}
.hud-center {
  flex: 1;
  text-align: center;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}
.hud-lv {
  font-size: 13px;
  opacity: 0.92;
  font-weight: 600;
}
.hud-nums {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 14px;
  margin-top: 2px;
}
.hud-score {
  font-size: 30px;
  font-weight: 900;
  line-height: 1;
}
.hud-coin {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 16px;
  font-weight: 800;
}
.hud-floors {
  text-align: center;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  min-width: 44px;
}
.floors-num {
  font-size: 22px;
  font-weight: 900;
  line-height: 1;
}
.floors-num span {
  font-size: 13px;
  opacity: 0.85;
}
.floors-label {
  font-size: 12px;
  opacity: 0.85;
}

.star-bar-wrap {
  position: absolute;
  top: calc(var(--safe-top) + 78px);
  left: 16px;
  right: 16px;
  z-index: 10;
}
.star-bar {
  position: relative;
  height: 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  overflow: visible;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.star-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #ffd86b, #ff9e2c);
  transition: width 0.25s ease;
}
.star-mark {
  position: absolute;
  top: -7px;
  transform: translateX(-50%);
  display: flex;
  color: var(--gold);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}
.star-hint {
  margin-top: 6px;
  text-align: center;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}

.combo-badge {
  position: absolute;
  top: calc(var(--safe-top) + 120px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: 999px;
  color: #fff;
  font-weight: 900;
  font-size: 16px;
  box-shadow: 0 6px 18px rgba(255, 140, 40, 0.5);
}

.timer-hints {
  position: absolute;
  top: calc(var(--safe-top) + 158px);
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  justify-content: center;
  gap: 8px;
}
.timer-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 13px;
  color: #fff;
  box-shadow: var(--shadow-sm);
}
.timer-chip.slow {
  background: linear-gradient(135deg, #7fd88a, #40a86a);
}
.timer-chip.auto {
  background: linear-gradient(135deg, #67c7ff, #3a8fe0);
}

.hud-bottom {
  position: absolute;
  bottom: calc(var(--safe-bottom) + 18px);
  left: 16px;
  right: 16px;
  z-index: 10;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}
.side-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.use-btn {
  width: 60px;
  height: 60px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  color: #26305a;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  position: relative;
}
:root[data-theme='dark'] .use-btn {
  background: rgba(40, 46, 90, 0.9);
  color: #eef1ff;
}
.use-btn:active {
  transform: scale(0.94);
}
.use-btn.disabled {
  opacity: 0.4;
  pointer-events: none;
}
.use-count {
  position: absolute;
  top: -6px;
  right: -6px;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  min-width: 20px;
  height: 20px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
}
.use-name {
  font-size: 11px;
  font-weight: 700;
}

.charge-btn {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 40%, rgba(255, 130, 50, 0.35), rgba(20, 20, 40, 0.55));
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}
.charge-btn:active {
  transform: scale(0.95);
}
.charge-btn.ready {
  animation: chargePulse 0.9s ease-in-out infinite;
}
@keyframes chargePulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 150, 40, 0.7), 0 6px 20px rgba(0, 0, 0, 0.4);
  }
  50% {
    box-shadow: 0 0 0 12px rgba(255, 150, 40, 0), 0 6px 20px rgba(0, 0, 0, 0.4);
  }
}
.charge-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.ring-bg {
  fill: none;
  stroke: rgba(255, 255, 255, 0.18);
  stroke-width: 5;
}
.ring-fill {
  fill: none;
  stroke: url(#g);
  stroke: #ffb347;
  stroke-width: 5;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.2s ease;
}
.flame-core {
  color: #ff7a2b;
  filter: drop-shadow(0 0 6px rgba(255, 130, 40, 0.8));
  transition: transform 0.2s ease, filter 0.2s ease;
}
.charge-btn.ready .flame-core {
  color: #ffd24d;
}
.charge-label {
  position: absolute;
  bottom: -18px;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
  white-space: nowrap;
}

/* 弹窗 */
.center-modal {
  text-align: center;
}
.center-modal h2 {
  margin: 8px 0 6px;
}
.center-modal p {
  margin: 0 0 16px;
}
.revive-icon {
  color: var(--danger);
  display: flex;
  justify-content: center;
  margin-bottom: 6px;
}

.result-modal {
  text-align: center;
}
.result-head {
  margin-bottom: 16px;
}
.result-head h2 {
  margin: 10px 0 0;
  font-size: 24px;
}
.result-head.ok h2 {
  color: var(--success);
}
.result-head.bad h2 {
  color: var(--danger);
}
.stars-row {
  display: flex;
  justify-content: center;
  gap: 6px;
}
.big-star {
  color: var(--panel-border);
  transform: scale(0.4);
  opacity: 0;
  transition: transform 0.35s cubic-bezier(0.2, 1.4, 0.4, 1), opacity 0.35s;
}
.big-star.lit {
  color: var(--gold);
}
.big-star.lit:nth-child(2) {
  margin-top: -10px;
}
.big-star.show {
  transform: scale(1);
  opacity: 1;
}
.fail-mark {
  display: flex;
  justify-content: center;
}
.result-stats {
  background: var(--panel);
  border-radius: var(--radius-sm);
  padding: 6px 14px;
  margin-bottom: 16px;
  border: 1px solid var(--panel-border);
}
.rs-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 0;
  font-size: 15px;
  border-bottom: 1px dashed var(--panel-border);
}
.rs-row:last-child {
  border-bottom: none;
}
.rs-row span {
  color: var(--text-soft);
}
.rs-row b {
  font-weight: 800;
}
.rs-row .up {
  color: var(--success);
}
.rs-row.total b {
  font-size: 19px;
}
.coin-total {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #f5a623;
}
.result-actions {
  display: flex;
  gap: 10px;
}
.result-actions .btn {
  flex: 1;
  padding: 13px 6px;
  font-size: 15px;
}
</style>
