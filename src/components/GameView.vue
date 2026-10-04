<template>
  <div class="game-root no-select">
    <!-- Canvas 背景 -->
    <div class="canvas-wrap" ref="wrap">
      <canvas ref="cv" class="game-canvas" :style="canvasStyle"></canvas>
      <div
        v-if="phase === 'playing' && hud.pet"
        class="game-pet-roamer"
        :style="petRoamerStyle"
        aria-hidden="true"
      >
        <span class="pet-roamer-label">{{ hud.pet.name }}·Lv.{{ hud.pet.level }}</span>
        <AnimatedPet :id="hud.pet.id" :size="petSizePx" :trigger="hud.pet.noticeSeq" />
      </div>
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
        <div class="prep-lv-name">第 {{ levelNumber }} 关 · {{ level.city }}</div>
        <div class="prep-meta text-soft">{{ chapter.name }} · {{ level.place }}</div>
        <div class="prep-meta text-soft">目标 {{ level.target }} 层 · 固定速度 {{ level.speed }} · {{ weatherSummary }}</div>
        <div class="prep-material-line">
          <span class="material-mini-swatch" :class="`material-mini-${equippedMaterial.id}`"></span>
          <span>建筑材质：<b>{{ equippedMaterial.name }}</b></span>
          <span class="text-soft">{{ equippedMaterial.effect }}</span>
        </div>
        <div class="prep-topics" aria-label="挑战说明">
          <button
            v-for="topic in prepTopics"
            :key="topic.id"
            class="info-tag"
            :class="`info-tag-${topic.tone}`"
            type="button"
            @click="openPrepInfo(topic.id)"
          >
            <span class="info-tag-icon">{{ topic.icon }}</span>
            <span>{{ topic.label }}</span>
            <span class="info-tag-arrow">›</span>
          </button>
        </div>
        <div v-if="skillBonuses.length" class="prep-skill-bonuses">
          <span v-for="bonus in skillBonuses" :key="bonus">{{ bonus }}</span>
        </div>
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

    <!-- ========== 玩法说明卡片 ========== -->
    <transition name="pop">
      <div v-if="activePrepInfo" class="overlay prep-info-overlay" @click.self="closePrepInfo">
        <div class="modal prep-info-modal">
          <div class="prep-info-head">
            <div class="prep-info-mark" :class="`prep-info-mark-${activePrepInfo.tone}`">
              {{ activePrepInfo.icon }}
            </div>
            <div class="prep-info-heading">
              <div class="prep-info-kicker">挑战提示</div>
              <h2>{{ activePrepInfo.title }}</h2>
            </div>
            <button class="info-close" type="button" aria-label="关闭说明" @click="closePrepInfo">×</button>
          </div>
          <p class="prep-info-copy">{{ activePrepInfo.body }}</p>
          <ul class="prep-info-points">
            <li v-for="point in activePrepInfo.points" :key="point">{{ point }}</li>
          </ul>
          <button class="btn btn-primary btn-block" type="button" @click="closePrepInfo">知道了</button>
        </div>
      </div>
    </transition>

    <!-- ========== 游戏 HUD ========== -->
    <!-- hud-layer 锚定在画布显示矩形上，内部所有偏移量都相对画布而非视口 -->
    <div v-if="phase === 'playing'" class="hud-layer" :style="hudLayerStyle">
      <div class="hud-top">
        <button class="icon-btn hud-btn" @pointerdown.stop="pause"><PauseIcon /></button>
        <div class="hud-center">
          <div class="hud-lv">第 {{ levelNumber }} 关 · {{ level.city }} · {{ level.place }}</div>
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
      </div>

      <div
        v-if="weatherIndicator"
        class="weather-indicator"
        :style="weatherIconStyle"
        role="img"
        :aria-label="weatherAriaLabel"
      >
        <svg v-if="weatherIndicator.id === 'wind'" class="wind-direction-icon" viewBox="0 0 28 20" aria-hidden="true">
          <path d="M3 10h21m-8-7 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span v-else class="weather-symbol" aria-hidden="true">{{ weatherIndicator.icon }}</span>
      </div>

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

      <!-- 最底部：宽度读数（确认技能/道具的加宽是否真的生效） -->
      <div class="width-readout">
        <div class="wr-bar">
          <div class="wr-base" :style="{ width: baseWidthRatio * 100 + '%' }"></div>
          <div class="wr-fill" :style="{ width: Math.min(100, widthPct * 100) + '%' }"></div>
          <div
            v-if="widthBonusPct > 0"
            class="wr-bonus-mark"
            :style="{ left: baseWidthRatio * 100 + '%' }"
          ></div>
        </div>
        <div class="wr-line">
          <span class="wr-label">宽度</span>
          <b class="wr-cur">{{ hud.widthPoints.toFixed(1) }}</b>
          <span class="wr-sep">/</span>
          <span class="wr-max">{{ hud.initialWidthPoints.toFixed(1) }}</span>
          <span class="wr-pct">{{ Math.round(widthPct * 100) }}%</span>
          <span v-if="widthBonusPct > 0" class="wr-bonus">开局加宽 +{{ widthBonusPct }}%</span>
          <span v-else class="wr-bonus muted">基准 100</span>
        </div>
      </div>
    </div>

    <!-- ========== 暂停弹窗 ========== -->
    <transition name="pop">
      <div v-if="phase === 'paused'" class="overlay" @click.self="() => {}">
        <div class="modal center-modal">
          <h2>已暂停</h2>
          <p class="text-soft">第 {{ levelNumber }} 关 · {{ level.city }} · {{ level.place }}</p>
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
              <h2>挑战成功</h2>
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
            <div class="rs-row" v-if="result.midasMult > 1">
              <span>点石成金加成</span><b class="up">+{{ Math.round((result.midasMult - 1) * 100) }}%</b>
            </div>
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
              v-if="result.cleared && level.id < LEVELS.length"
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
import { ref, reactive, computed, onMounted, onBeforeUnmount, h, nextTick, watch } from 'vue'
import { GameEngine, LOGICAL_W, LOGICAL_H } from '../core/gameEngine.js'
import { CHAPTER, LEVELS, getChapterForLevel, getLevel } from '../data/levels.js'
import { getMaterial } from '../data/materials.js'
import { useStore, actions } from '../core/store.js'
import { Audio } from '../core/audio.js'
import { createPetSnapshot } from '../core/petSystem.js'
import { nextPetRoamDelay, nextPetRoamPosition, PET_ROAM_CONFIG } from '../core/petRoaming.js'
import {
  BackIcon, StarIcon, PlayIcon, PauseIcon, FlameIcon, ClockIcon, BoltIcon, CheckIcon
} from './icons.js'
import ItemGlyph from './ItemGlyph.vue'
import AnimatedPet from './AnimatedPet.vue'

const props = defineProps({ levelId: { type: Number, default: 1 } })
const emit = defineEmits(['nav', 'play'])

const store = useStore()
const level = computed(() => getLevel(props.levelId))
const chapter = computed(() => getChapterForLevel(level.value))
const levelNumber = computed(() => level.value.chapterStage || level.value.id)
const weatherSummary = computed(() => level.value.weatherHint || '晴天 · 静塔')
const best = computed(() => store.stars[props.levelId] || 0)
const equippedMaterial = computed(() => getMaterial(store.equippedMaterial))

const phase = ref('prep') // prep | playing | paused | result
const infoTopic = ref(null)
const useWiden = ref(false)

const prepTopics = computed(() => [
  { id: 'height', label: '目标递增', icon: '↗', tone: 'purple' },
  { id: 'ants', label: '蚂蚁敌人', icon: '🐜', tone: 'orange' },
  { id: 'weather', label: chapter.value.weatherKind === 'clear' ? '晴天 · 静塔' : `天气 · ${chapter.value.name}`, icon: chapter.value.weatherKind === 'clear' ? '晴' : chapter.value.weatherKind === 'wind' ? '风' : chapter.value.weatherKind === 'cloud' ? '云' : chapter.value.weatherKind === 'lightning' ? '雷' : chapter.value.weatherKind === 'rain' ? '雨' : chapter.value.weatherKind === 'snow' ? '雪' : '雹', tone: 'blue' }
])
const activePrepInfo = computed(() => {
  const specialWeather = {
    wind: {
      title: '预告风向 · 等待静风', icon: '风', tone: 'blue',
      body: `${level.value.weatherHint} 风向与强弱提示先于实际推力出现；提示期不会提前推移方块。`,
      points: ['前段只推移动方块，后段才逐步加入轻微摆塔。', '事件之间会回到静风；不要把预告当成已经生效的推力。']
    },
    cloud: {
      title: '云来云散 · 保持轮廓', icon: '云', tone: 'blue',
      body: `${level.value.weatherHint} 云层只改变背景能见度，不改变方块速度、塔体位置或落层判定。`,
      points: ['云带到达操作区前会提前显现；移动方块外轮廓保持可见。', '塔顶与方块不会同时被云层完全遮住，等待云隙不受惩罚。']
    },
    lightning: {
      title: '远处雷光 · 仅作氛围', icon: '雷', tone: 'blue',
      body: `${level.value.weatherHint} 电光与雷声只表现远景天气，不会命中塔体或蚂蚁。`,
      points: ['不会改变方块轨迹、塔层、宽度、分数或关卡结果。', '电光局限于天空和远景，不使用全屏白闪或快速闪烁。']
    },
    rain: {
      title: '雨向预告 · 只影响落块', icon: '雨', tone: 'blue',
      body: `${level.value.weatherHint} 雨向在本关固定；只有点击释放后的下落阶段会产生可预判侧滑。`,
      points: ['移动中的方块不会被雨横推，也不会因雨势改变速度。', '雨歇时没有雨滑移；雨势恢复前会再次预告同一方向。']
    },
    snow: {
      title: '冬日积雪 · 纯视觉效果', icon: '雪', tone: 'blue',
      body: `${level.value.weatherHint} 积雪和轻柔飘雪只改变画面材质，不加入天气玩法。`,
      points: ['不改变方块原色、大小、速度、碰撞、点击或落层判定。', '雪花限制在画面边缘，塔顶和操作通道保持清楚。']
    },
    hail: {
      title: '冰雹预警 · 顶层宽度有下限', icon: '雹', tone: 'blue',
      body: `${level.value.weatherHint} 完整预警结束后，冰雹只会削减已经落定的当前顶层宽度。`,
      points: ['点击开始落块直到落定期间完全不会结算冰雹；重叠时序会暂停并重新预警。', '不删层、不扣分、不扣耐久、不倒塔；宽度到达安全下限后不再下降。', '晴歇只停止冰雹，不会返还已经损失的宽度。']
    }
  }
  const info = {
    height: {
      title: '目标逐关递增',
      icon: '↗',
      tone: 'purple',
      body: `这是“${chapter.value.name}”第 ${levelNumber.value} 关，目标为 ${level.value.target} 层。各章八关基础移动速度相同，关卡目标高度逐关增加。`,
      points: ['点击画面或按空格落层；未对齐的部分会被切除。', '每一关独立开始与结算，按顺序解锁，已通关关卡可重玩。']
    },
    ants: {
      title: '蚂蚁敌人 · 读预告再震击',
      icon: '🐜',
      tone: 'orange',
      body: '锈腹工蚁会沿塔外侧攀爬，锁定稳定楼层后先完整预告，再分段啃耐久或从两侧削窄。其他关卡会逐步出现斥候、钳甲兵与蚁后；同时存活上限 5 只、每层最多 3 只锁定目标（原型起点，未试玩）。',
      points: [
        '手动有效落层按原始重叠与确定性几何完美窗得到 Perfect / Great / Good / Bad / Miss；盾牌与随机完美不会改变蚁群震击档位。',
        'Perfect / Great / Good / Bad 分别扫描 4 / 3 / 2 / 1 个正在实际咬击的楼层；每层所有目标蚂蚁各受 2 HP，同一层只占一个名额。',
        '扫描从稳定楼层游标向下环绕并跳过空层；自动落层不伤蚂蚁。屏外目标会显示层号、模式和倒数，不会拉动镜头。',
        '受击会中断咬击并重新完整预告；胆小/懦弱会按受击次数撤退。天气威胁、暂停、自动接管和 0.13 秒落层期间敌人冻结。'
      ]
    },
    weather: {
      title: '晴天 · 静塔',
      icon: '晴',
      tone: 'blue',
      body: chapter.value.weatherKind === 'clear' ? '澄河都会圈第一章全程晴天，天气系统在这些关卡中关闭；塔体保持静止，不会因天气或高度摆动。' : `本章主题为“${chapter.value.name}”。${level.value.weatherHint}`,
      points: ['八关基础落层速度固定。', '城市轮廓按关卡固定，并只绘制在屏幕底边两侧。']
    }
  }
  info.weather = specialWeather[chapter.value.weatherKind] || info.weather
  return info[infoTopic.value] || null
})

function openPrepInfo(topic) {
  infoTopic.value = topic
  Audio.click()
}
function closePrepInfo() {
  infoTopic.value = null
}

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
let starRevealTimer = 0

const hud = reactive({
  status: 'playing', floors: 0, target: level.value.target, score: 0, theoreticalMax: 1,
  coins: 0, combo: 0, maxCombo: 0, charge: 0, chargeCap: 1, chargeReady: false,
  slowRemaining: 0, autoRemaining: 0, slowActive: false, autoActive: false,
  inv: { slow: 0, auto: 0, shield: 0, comboGuard: 0, revive: 0 },
  levelName: level.value.name, levelId: level.value.id,
  weather: null,
  pet: null,
  widthPoints: 100, initialWidthPoints: 100, baseWidthPoints: 100, widthPct: 1,
  nextRestorePct: 10, restoreMaxPct: 40
})

const canvasStyle = reactive({ width: '0px', height: '0px', left: '0px', top: '0px' })
const canvasViewport = reactive({ left: 0, top: 0, scale: 1, width: LOGICAL_W, height: LOGICAL_H })

// HUD 层锚定在画布实际显示矩形上，而不是视口上。
// 否则在「高度受限」的视口（手机浏览器工具栏展开、平板、折叠屏、横屏）里，
// 画布两侧出现 letterbox 空白，而 HUD 仍贴着视口左右边，于是 HUD 悬在空白里、
// 和游戏画面对不齐，窄屏下还会把顶栏内容挤到显示不全。
const hudLayerStyle = computed(() => ({
  left: `${canvasViewport.left}px`,
  top: `${canvasViewport.top}px`,
  width: `${canvasViewport.width}px`,
  height: `${canvasViewport.height}px`,
  '--cv-top': `${canvasViewport.top}px`,
}))
const petRoamPosition = reactive({ ...PET_ROAM_CONFIG.start })
let petRoamTimer = 0

const weatherIndicator = computed(() => hud.weather || (chapter.value.weatherKind === 'clear'
  ? { id: 'clear', icon: '☀', color: '#ffe8a2', name: '晴天', dir: 0, intensity: 0 }
  : null))
const weatherIconStyle = computed(() => {
  const strength = Math.max(0, Math.min(1, Number(weatherIndicator.value?.intensity) || 0))
  return {
    '--weather-color': weatherIndicator.value?.color || '#a1e8d6',
    '--weather-icon-size': `${20 + strength * 6}px`,
    '--weather-glow': `${2 + strength * 6}px`,
    '--weather-flip': weatherIndicator.value?.id === 'wind' && weatherIndicator.value.dir < 0 ? 'scaleX(-1)' : 'none'
  }
})
const weatherAriaLabel = computed(() => {
  const weather = weatherIndicator.value
  if (!weather) return ''
  if (weather.id === 'wind') {
    const strength = Number(weather.intensity) || 0
    const level = strength >= 0.7 ? '强' : strength >= 0.35 ? '中' : '弱'
    return `风向${weather.dir < 0 ? '左' : '右'}，${level}风`
  }
  return weather.name || '天气'
})
const petSizePx = computed(() => Math.max(26, Math.min(48, 50 * canvasViewport.scale)))
const petRoamerStyle = computed(() => ({
  left: `${canvasViewport.left + petRoamPosition.x * canvasViewport.scale}px`,
  top: `${canvasViewport.top + petRoamPosition.y * canvasViewport.scale}px`,
  '--roam-duration': `${PET_ROAM_CONFIG.transitionMs}ms`,
  '--pet-tag-font': `${Math.max(8.5, Math.min(10, 10 * canvasViewport.scale))}px`,
  '--pet-accent': hud.pet?.accent || '#ffd66e'
}))

function schedulePetRoam() {
  if (phase.value !== 'playing' || !hud.pet) return
  petRoamTimer = window.setTimeout(() => {
    Object.assign(petRoamPosition, nextPetRoamPosition(petRoamPosition))
    schedulePetRoam()
  }, nextPetRoamDelay())
}

watch(() => [phase.value, hud.pet?.id], ([currentPhase, petId]) => {
  clearTimeout(petRoamTimer)
  petRoamTimer = 0
  if (currentPhase === 'playing' && petId) {
    Object.assign(petRoamPosition, PET_ROAM_CONFIG.start)
    schedulePetRoam()
  }
})

const rate = computed(() => (hud.theoreticalMax > 0 ? hud.score / hud.theoreticalMax : 0))
const chargePct = computed(() => (hud.chargeCap > 0 ? hud.charge / hud.chargeCap : 0))
const ringLen = 2 * Math.PI * 32

// 底部宽度读数：当前宽度 / 本局初始宽度（含磐石根基与加宽卡的加成）
const widthPct = computed(() =>
  hud.initialWidthPoints > 0 ? hud.widthPoints / hud.initialWidthPoints : 0
)
// 本局初始宽度相对基准 100 的加成百分比
const widthBonusPct = computed(() =>
  Math.round((hud.initialWidthPoints / (hud.baseWidthPoints || 100) - 1) * 100)
)
// 基准宽度 100 在进度条上的位置，用来直观看出“加宽了多少”
const baseWidthRatio = computed(() =>
  hud.initialWidthPoints > 0 ? Math.min(1, (hud.baseWidthPoints || 100) / hud.initialWidthPoints) : 1
)

const skillBonuses = computed(() => {
  const s = store.skills || {}
  const arr = []
  if ((s.foundation || 0) > 0) arr.push(`根基宽度 +${s.foundation}%`)
  if ((s.stillness || 0) > 0) arr.push(`移动速度 -${s.stillness}% · 晃动 -${Math.min(40, s.stillness * 8)}%`)
  if ((s.insight || 0) > 0) arr.push(`完美窗口 +${s.insight}%`)
  if ((s.midas || 0) > 0) arr.push(`金币 +${s.midas * 2}%`)
  if ((s.preemptive || 0) > 0) {
    const charge = Math.max(1, Math.floor(level.value.chargeNeed * 0.05 * s.preemptive))
    arr.push(`开局充能 +${charge}`)
  }
  if ((s.goldenBell || 0) > 0) arr.push(`金钟罩 ${s.goldenBell}%`)
  if ((s.unity || 0) > 0) arr.push(`心手合一 ${s.unity}%`)
  if ((s.pursuit || 0) > 0) arr.push(`追击 ${s.pursuit}%`)
  return arr
})

const flameCoreStyle = computed(() => {
  const p = chargePct.value
  const scale = 0.7 + p * 0.5
  return { transform: `scale(${scale})`, filter: `brightness(${0.9 + p * 0.6})` }
})

// ---------------- 尺寸（按宽适配，纵向伸展填满） ----------------
const MAX_VIEW_H = 1180

function resize() {
  const el = wrap.value
  if (!el || !cv.value) return
  const cw = el.clientWidth
  const ch = el.clientHeight
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  // 横向永远完整显示 420 逻辑宽（绝不裁切游戏区域：此前用 cover 时，
  // 横屏桌面端待落方块完全在屏幕外，竖屏手机端方块移到左右极端会被切掉三分之一）。
  const scale = Math.min(cw / LOGICAL_W, ch / LOGICAL_H)
  // 纵向不再固定 720，而是按视口实际高度换算成逻辑高度，把上下黑边吃掉。
  // 窄高屏（手机）→ scale 由宽度决定，viewH > 720，多出来的是可见的塔身与天空；
  // 矮宽屏（平板/横屏）→ scale 由高度决定，viewH 恰为 720，退化成原来的行为。
  const viewH = Math.min(MAX_VIEW_H, Math.max(LOGICAL_H, ch / scale))
  cv.value.width = LOGICAL_W * dpr
  cv.value.height = viewH * dpr
  engine?.setViewHeight(viewH)
  const dw = LOGICAL_W * scale
  const dh = viewH * scale
  canvasViewport.left = (cw - dw) / 2
  canvasViewport.top = (ch - dh) / 2
  canvasViewport.scale = scale
  canvasViewport.width = dw
  canvasViewport.height = dh
  if (engine?.antSystem) engine.antSystem.setLayoutScale(scale)
  canvasStyle.width = dw + 'px'
  canvasStyle.height = dh + 'px'
  canvasStyle.left = (cw - dw) / 2 + 'px'
  canvasStyle.top = (ch - dh) / 2 + 'px'
  ctx = cv.value.getContext('2d')
}

let ro = null

// ---------------- 引擎生命周期 ----------------
function startChallenge() {
  closePrepInfo()
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

  engine = new GameEngine({
    level: level.value,
    theme: 'dark', // 游戏整体为固定深色视觉
    skills: { ...store.skills },
    material: store.equippedMaterial,
    inventory,
    pet: createPetSnapshot(store.activePetId, store.pets),
    widenActive: canWiden,
    doubleActive: canDouble,
    onState: (s) => Object.assign(hud, s),
    onEnd: onGameEnd,
    onReviveOffer: () => { showRevive.value = true },
    onInventoryChange: (key, val) => { store.items[key] = val },
    onSeen: (group, id) => actions.markSeen(group, id)
  })
  phase.value = 'playing'
  Audio.click()
  // 进入游戏：切换紧张刺激的战斗曲（交叉淡化）
  Audio.startMusic('battle')
  nextTick(() => {
    resize()
    lastT = performance.now()
  })
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
    // 天气倒计时每帧刷新（避免只在事件时才更新导致读秒卡住）
    const w = engine.weather ? engine.weather.hudState() : null
    if (!w || !hud.weather || w.id !== hud.weather.id || w.remaining !== hud.weather.remaining || w.phaseLabel !== hud.weather.phaseLabel || w.hint !== hud.weather.hint || w.dir !== hud.weather.dir || w.intensity !== hud.weather.intensity || w.icon !== hud.weather.icon || w.color !== hud.weather.color) {
      hud.weather = w
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    engine.render(ctx)
  }
}

// ---------------- 输入 ----------------
function onTap() {
  if (phase.value !== 'playing' || !engine) return
  // 所有画布区域均执行一次落层；蚂蚁预告没有独立的点击/中止热区。
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
  if (showRevive.value) return // 复活询问期间不叠加暂停弹窗
  phase.value = 'paused'
  if (engine?.antSystem) engine.antSystem.pause()
  if (engine?.weather) engine.weather.pause()
  Audio.duckMusic(true)
  Audio.click()
}
function resume() {
  if (phase.value !== 'paused') return
  phase.value = 'playing'
  if (engine?.antSystem) engine.antSystem.resume()
  if (engine?.weather) engine.weather.resume()
  lastT = performance.now()
  Audio.duckMusic(false)
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
  clearStarReveal()
  result.value = r
  actions.settle(r)
  phase.value = 'result'
  showRevive.value = false
  if (r.cleared && chapter.value.weatherKind === 'lightning' && levelNumber.value === 8) {
    engine?.weather?.playFinalBackdropPulse()
  }
  // 音乐骤停（失败更急促），让位给胜利/失败音效
  Audio.stopMusic(r.cleared ? 0.5 : 0.18)
  if (r.cleared) {
    starShow.value = 0
    let i = 0
    const reveal = () => {
      if (i >= r.stars) return
      i++
      starShow.value = i
      Audio.star(i - 1)
      if (i < r.stars) starRevealTimer = setTimeout(reveal, 380)
    }
    starRevealTimer = setTimeout(reveal, 400)
  }
}

function clearStarReveal() {
  if (starRevealTimer) {
    clearTimeout(starRevealTimer)
    starRevealTimer = 0
  }
}

function retry() {
  clearStarReveal()
  Audio.click()
  phase.value = 'prep'
  showRevive.value = false
  starShow.value = 0
  cleanupEngine()
  result.value = null
  // 回到准备页：换回轻快的菜单曲
  Audio.startMusic('menu')
  // 重新按当前库存决定是否可勾选
  if ((store.items.widen || 0) === 0) useWiden.value = false
  if ((store.items.double || 0) === 0) useDouble.value = false
}
function nextLevel() {
  clearStarReveal()
  Audio.click()
  const nextId = Math.min(LEVELS.length, level.value.id + 1)
  // 先离开 result 渲染分支再清空 result，避免同组件切关时读取 null 卡住。
  phase.value = 'prep'
  showRevive.value = false
  starShow.value = 0
  cleanupEngine()
  result.value = null
  Audio.startMusic('menu')
  emit('play', nextId)
}
function exitToLevels() {
  clearStarReveal()
  Audio.click()
  // 中途退出按“放弃本局”结算：局内已消耗的道具不退还，
  // 但已赚金币照发（与失败结算一致），避免“扣了道具又不给金币”的不对称。
  if (engine && (engine.status === 'playing' || engine.status === 'reviveOffer')) {
    actions.settle(engine.abandonResult())
  }
  cleanupEngine()
  Audio.startMusic('menu')
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
  clearStarReveal()
  clearTimeout(petRoamTimer)
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

<!-- 样式见同目录 GameView.css（scoped 语义不变） -->
<style scoped src="./GameView.css"></style>
