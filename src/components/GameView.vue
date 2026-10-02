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
    <template v-if="phase === 'playing'">
      <div v-if="hud.pet" class="hud-pet-badge" :style="{ '--pet-color': hud.pet.color, '--pet-accent': hud.pet.accent }">
        <AnimatedPet :id="hud.pet.id" :size="52" :trigger="hud.pet.noticeSeq" />
        <div><b>{{ hud.pet.name }} · Lv.{{ hud.pet.level }}</b><small>{{ hud.pet.notice || hud.pet.meter.label }}</small></div>
      </div>
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
        <div
          v-if="hud.weather"
          class="timer-chip weather"
          :style="{ '--wcolor': hud.weather.color }"
        >
          {{ hud.weather.icon }} {{ hud.weather.name }} · {{ hud.weather.phaseLabel || (hud.weather.remaining + 's') }}<span v-if="hud.weather.hint"> · {{ hud.weather.hint }}</span>
        </div>
      </div>

      <div v-if="hud.ants?.hasAnts" class="ant-hud" aria-live="polite">
        <div class="ant-hud-head">
          <b>蚁群 {{ hud.ants.count }}/{{ hud.ants.max }}</b>
          <span v-if="hud.ants.lastQuality">震击 {{ hud.ants.lastQuality }}</span>
        </div>
        <div v-for="ant in hud.ants.entries" :key="ant.id" class="ant-hud-row" :class="{ biting: ant.activeBite }">
          <div class="ant-hud-line">
            <b :style="{ color: ant.color }"><span v-if="ant.personalityId === 'aggressive'" class="ant-heavy-mark" aria-label="暴躁，攻击伤害1.5倍">×1.5</span>{{ ant.shortName }}</b>
            <span>{{ ant.hp }}/{{ ant.maxHp }} HP · {{ ant.personality }} · {{ ant.route }}</span>
          </div>
          <div class="ant-hud-line">
            <b>{{ ant.floor ? `第 ${ant.floor} 层 · ${ant.modeLabel}` : '目标重选中' }}</b>
            <span>{{ ant.phase }} · {{ ant.remaining.toFixed(1) }}s</span>
          </div>
          <small v-if="ant.floor">预计本轮损失 {{ ant.expectedLoss }}；剩余段 {{ ant.segments.join(' + ') || '—' }}</small>
          <small v-if="ant.personalityId === 'impatient'">急躁段间 {{ ant.segmentInterval.toFixed(2) }}s · 加速 {{ ant.accelerationCount }}/4<span v-if="ant.accelerationCount >= 4"> · 封顶</span></small>
          <small v-else-if="ant.personalityId === 'aggressive'">暴躁加重 ×1.5 · 前摇与预计损失已完整显示</small>
          <small v-if="ant.floor && !ant.visible" class="ant-offscreen">屏外目标 · 侧剖面定位</small>
        </div>
        <div class="ant-scan-note">
          候选 {{ hud.ants.candidates.map((item) => `第${item.floor}层×${item.ants.length}`).join('、') || '暂无实际咬击' }}；游标从第 {{ hud.ants.cursorFloor || '—' }} 层{{ hud.ants.direction }}。Perfect / Great / Good / Bad / Miss = 4 / 3 / 2 / 1 / 0 层。
        </div>
        <div v-if="hud.ants.pauseReason" class="ant-scan-note ant-pause-note" role="status">
          {{ hud.ants.pauseReason === 'weather' ? '天气窗口 · 蚁群攻击暂停' : hud.ants.pauseReason === 'layout' ? '布局不可读 · 预告与结算暂停' : hud.ants.pauseReason === 'drop' ? '落层结算中 · 蚁群冻结' : hud.ants.pauseReason === 'auto' ? 'AI接管中 · 蚁群冻结' : '自动落层序列 · 蚁群冻结' }}
        </div>
        <div v-if="hud.ants.queenReinforcement != null" class="ant-scan-note queen-cue">
          蚁后增援预告 · 工蚁将于 {{ hud.ants.queenReinforcement.toFixed(1) }}s 后尝试入场
        </div>
      </div>
      <div v-else-if="hud.ants?.lastQuality" class="ant-quality-toast">
        {{ hud.ants.lastQuality }} · {{ hud.ants.lastShockFloors.length ? `震击第 ${hud.ants.lastShockFloors.join('、')} 层` : '未扫到活动咬击' }}
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
    </template>

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
import { ref, reactive, computed, onMounted, onBeforeUnmount, h, nextTick } from 'vue'
import { GameEngine, LOGICAL_W, LOGICAL_H } from '../core/gameEngine.js'
import { CHAPTER, LEVELS, getChapterForLevel, getLevel } from '../data/levels.js'
import { getMaterial } from '../data/materials.js'
import { useStore, actions } from '../core/store.js'
import { Audio } from '../core/audio.js'
import { createPetSnapshot } from '../core/petSystem.js'
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
      body: '锈腹工蚁会沿塔外侧攀爬，锁定稳定楼层后先完整预告，再分段啃耐久或从两侧削窄。其他关卡会逐步出现斥候、钳甲兵与蚁后；最多同时存活 3 只、每层最多 2 只锁定目标。',
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
  // contain 等比缩放：完整显示 420×720 逻辑画面，绝不裁切游戏区域。
  // （此前用 cover：横屏桌面端待落方块完全在屏幕外，
  //   竖屏手机端方块移动到左右极端时也被切掉约三分之一。）
  const scale = Math.min(cw / LOGICAL_W, ch / LOGICAL_H)
  if (engine?.antSystem) engine.antSystem.setLayoutScale(scale)
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
    onInventoryChange: (key, val) => { store.items[key] = val }
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
    if (!w || !hud.weather || w.id !== hud.weather.id || w.remaining !== hud.weather.remaining || w.phaseLabel !== hud.weather.phaseLabel || w.hint !== hud.weather.hint) {
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
  background: #050914;
}
.canvas-wrap {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 18%, #18295a 0, #0b1534 34%, #050914 82%);
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
  overflow-y: auto;
  overflow-x: hidden;
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
  margin: 6px 0 10px;
}
.prep-material-line {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 5px 7px;
  margin: 10px 0 12px;
  color: var(--text);
  font-size: 12px;
  line-height: 1.45;
}
.prep-material-line b {
  color: var(--primary);
}
.material-mini-swatch {
  width: 18px;
  height: 14px;
  display: inline-block;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.16);
}
.material-mini-soil { background: repeating-linear-gradient(135deg, #b9794a 0 5px, #8e4d2f 6px 8px); }
.material-mini-concrete { background: radial-gradient(circle at 30% 30%, #e1e6eb 0 1px, transparent 1.5px), #8c98a8; }
.material-mini-steel { background: linear-gradient(165deg, #d8e8f2 0 30%, #527b98 31% 70%, #b9d5e8 71%); }
.material-mini-bronze { background: repeating-linear-gradient(135deg, #e2b46b 0 5px, #8b572c 6px 8px); }
.material-mini-blackgold { background: radial-gradient(circle at 65% 35%, #ffd36c 0 1px, transparent 1.5px), #29203e; }
.prep-topics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 14px 0 12px;
}
.info-tag {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 10px 7px;
  border-radius: 13px;
  color: var(--text);
  background: var(--panel-solid);
  border: 1px solid var(--panel-border);
  box-shadow: 0 3px 10px rgba(60, 60, 120, 0.1);
  font-size: 13px;
  font-weight: 800;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.info-tag:active {
  transform: translateY(1px) scale(0.97);
}
.info-tag:hover {
  box-shadow: var(--shadow-sm);
}
.info-tag-purple { border-color: color-mix(in srgb, var(--primary) 42%, var(--panel-border)); }
.info-tag-orange { border-color: color-mix(in srgb, var(--flame) 46%, var(--panel-border)); }
.info-tag-blue { border-color: color-mix(in srgb, #69a7ff 46%, var(--panel-border)); }
.info-tag-icon {
  width: 21px;
  height: 21px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: #fff;
  font-size: 14px;
  line-height: 1;
}
.info-tag-purple .info-tag-icon { background: var(--primary); }
.info-tag-orange .info-tag-icon { background: var(--flame); }
.info-tag-blue .info-tag-icon { background: #69a7ff; }
.info-tag-arrow {
  color: var(--text-soft);
  font-size: 18px;
  line-height: 1;
  margin-left: auto;
}
.prep-skill-bonuses {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin: 0 0 12px;
}
.prep-skill-bonuses span {
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
  font-size: 11px;
  font-weight: 800;
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
  flex-shrink: 0;
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
  background: rgba(20, 48, 48, 0.9);
  border: 1px solid rgba(255, 226, 162, 0.45);
  color: #fff1d1;
  box-shadow: inset 0 1px rgba(255,255,255,.1), 0 4px 0 rgba(0,0,0,.45), 0 0 18px rgba(47,170,255,.12);
  border-radius: 4px;
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
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.28);
  overflow: visible;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.star-fill {
  height: 100%;
  border-radius: 2px;
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

.combo-badge {
  position: absolute;
  right: 16px;
  bottom: calc(var(--safe-bottom) + 142px);
  z-index: 10;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 999px;
  color: #fff;
  font-weight: 900;
  font-size: 15px;
  box-shadow: 0 6px 18px rgba(255, 140, 40, 0.5);
  pointer-events: none;
}

.timer-hints {
  position: absolute;
  top: calc(var(--safe-top) + 158px);
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}
.timer-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 3px;
  background-image: repeating-linear-gradient(135deg, rgba(255,255,255,.08) 0 2px, transparent 2px 5px);
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
.timer-chip.weather {
  background: linear-gradient(135deg, rgba(20, 26, 42, 0.85), rgba(20, 26, 42, 0.6));
  border: 1px solid var(--wcolor);
  color: var(--wcolor);
}
.ant-hud {
  position: absolute;
  top: calc(var(--safe-top) + 112px);
  left: 8px;
  width: min(42vw, 188px);
  max-height: min(35vh, 270px);
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
  z-index: 10;
  padding: 6px 7px;
  border: 1px solid rgba(255, 217, 150, .58);
  border-radius: 4px;
  background: rgba(9, 20, 34, .82);
  color: #f6f7f1;
  font-size: 10px;
  line-height: 1.3;
  text-shadow: 0 1px 3px #000;
  pointer-events: none;
}
.ant-hud-head, .ant-hud-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px;
}
.ant-hud-head {
  padding-bottom: 3px;
  color: #ffe2a0;
  font-size: 10px;
}
.ant-hud-row {
  padding: 3px 0;
  border-top: 1px solid rgba(255,255,255,.15);
}
.ant-hud-row.biting { background: rgba(255, 170, 65, .12); }
.ant-hud-line span, .ant-hud-row small {
  color: rgba(237, 245, 249, .9);
  font-size: 9.5px;
}
.ant-hud-row small { display: block; line-height: 1.35; }
.ant-hud-row .ant-offscreen { color: #8fe7ff; font-weight: 800; }
.ant-hud::-webkit-scrollbar { display: none; }
.ant-heavy-mark {
  display: inline-grid;
  place-items: center;
  min-width: 27px;
  margin-right: 3px;
  padding: 0 2px;
  border: 1px solid #ffbb6d;
  border-radius: 3px;
  background: #612d21;
  color: #ffe09e;
  font-size: 8px;
  vertical-align: 1px;
}
.ant-scan-note {
  margin-top: 3px;
  padding-top: 3px;
  border-top: 1px solid rgba(255,255,255,.18);
  color: #bfe9f5;
  font-size: 8.5px;
}
.ant-pause-note { color: #ffe29b; font-weight: 900; }
.ant-quality-toast {
  position: absolute;
  top: calc(var(--safe-top) + 112px);
  left: 8px;
  z-index: 10;
  padding: 5px 8px;
  border: 1px solid rgba(143, 231, 255, .55);
  border-radius: 4px;
  background: rgba(9, 20, 34, .78);
  color: #c9f3ff;
  font-size: 10px;
  pointer-events: none;
}

/* 最底部宽度读数：看得见技能/道具带来的加宽，也看得见被切掉多少 */
.width-readout {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: calc(var(--safe-bottom) + 8px);
  z-index: 10;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wr-bar {
  position: relative;
  height: 8px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.34);
  border: 1px solid rgba(255, 255, 255, 0.22);
  overflow: hidden;
}
.wr-base {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgba(255, 255, 255, 0.14);
}
.wr-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 2px;
  background: linear-gradient(90deg, #7cf29b, #35c7e8);
  transition: width 0.25s ease;
}
.wr-bonus-mark {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: #ffd86b;
  box-shadow: 0 0 6px rgba(255, 216, 107, 0.9);
}
.wr-line {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.65);
  line-height: 1;
}
.wr-label {
  opacity: 0.75;
}
.wr-cur {
  font-size: 15px;
  font-weight: 900;
  color: #b9ffd0;
}
.wr-sep {
  opacity: 0.5;
}
.wr-max {
  opacity: 0.85;
}
.wr-pct {
  margin-left: 2px;
  opacity: 0.8;
}
.wr-bonus {
  margin-left: auto;
  color: #ffd86b;
  font-size: 11px;
}
.wr-bonus.muted {
  color: rgba(255, 255, 255, 0.55);
}

.hud-bottom {
  position: absolute;
  bottom: calc(var(--safe-bottom) + 42px);
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
  border-radius: 4px;
  background: rgba(20, 48, 48, 0.94);
  border: 1px solid rgba(255, 226, 162, 0.42);
  color: #fff1d1;
  box-shadow: inset 0 1px rgba(255,255,255,.1), 0 4px 0 rgba(0, 0, 0, 0.42), 0 0 16px rgba(51,176,255,.12);
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
  background: radial-gradient(circle at 50% 40%, rgba(255, 130, 50, 0.48), rgba(11, 24, 46, 0.8));
  border: 2px solid rgba(255, 192, 92, .55);
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
.prep-info-overlay {
  z-index: 45;
}
.prep-info-modal {
  padding: 20px;
}
.prep-info-head {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 16px;
}
.prep-info-mark {
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 15px;
  color: #fff;
  font-size: 25px;
  font-weight: 900;
}
.prep-info-mark-purple { background: linear-gradient(135deg, #9e8bff, var(--primary)); }
.prep-info-mark-orange { background: linear-gradient(135deg, #ffae4c, var(--flame)); }
.prep-info-mark-blue { background: linear-gradient(135deg, #8dc8ff, #4f8fe8); }
.prep-info-heading {
  min-width: 0;
  flex: 1;
}
.prep-info-kicker {
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.prep-info-heading h2 {
  margin: 2px 0 0;
  font-size: 22px;
}
.info-close {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 50%;
  color: var(--text-soft);
  background: var(--panel);
  border: 1px solid var(--panel-border);
  font-size: 24px;
  line-height: 1;
}
.info-close:active {
  transform: scale(0.92);
}
.prep-info-copy {
  margin: 0 0 14px;
  line-height: 1.7;
  font-weight: 700;
}
.prep-info-points {
  display: grid;
  gap: 9px;
  margin: 0 0 20px;
  padding: 0;
  list-style: none;
  color: var(--text-soft);
  font-size: 14px;
  line-height: 1.55;
}
.prep-info-points li {
  position: relative;
  padding-left: 19px;
}
.prep-info-points li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.55em;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
}
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

@media (max-width: 420px) {
  .prep { gap: 12px; }
  .prep .title-bar { margin-bottom: 2px; }
  .prep-card { padding: 14px 12px; }
  .prep-lv-name { font-size: 19px; }
  .prep-material-line { font-size: 11px; }
  .prep-topics { gap: 5px; margin-top: 10px; }
  .info-tag { padding: 8px 4px; font-size: 11px; }
  .info-tag-icon { width: 18px; height: 18px; font-size: 12px; }
  .opt-card { padding: 10px; gap: 9px; }
  .opt-icon { width: 40px; height: 40px; }
  .opt-desc { font-size: 11px; }
  .prep-actions { gap: 8px; }
  .prep-actions .btn { min-height: 46px; padding-inline: 8px; }
  .hud-top { left: 8px !important; right: 8px !important; gap: 6px; }
  .hud-score { font-size: 25px; }
  .hud-coin { font-size: 13px; }
  .hud-floors { min-width: 38px; }
  .star-bar-wrap { left: 10px !important; right: 10px !important; }
  .timer-hints {
    top: calc(var(--safe-top) + 92px);
    padding: 0 8px;
    flex-wrap: wrap;
    gap: 4px;
  }
  .timer-chip { padding: 4px 7px; font-size: 11px; }
  .hud-bottom { left: 10px; right: 10px; }
  .use-btn { width: 58px !important; height: 58px !important; }
  .charge-btn { width: 82px !important; height: 82px !important; }
  .width-readout { left: 10px !important; right: 10px !important; }
  .wr-line { font-size: 10px; gap: 3px; }
  .wr-bonus { font-size: 9px; }
  .result-modal { max-height: calc(100dvh - 32px); overflow-y: auto; }
  .result-actions { gap: 6px; }
  .result-actions .btn { font-size: 13px; padding-inline: 4px; }
}</style>

<style scoped>
/* Lightweight HUD companion: the full animated SVG stays in the archive, while the game view uses a small live badge. */
.hud-pet-badge{position:absolute;z-index:12;left:14px;top:calc(var(--safe-top) + 87px);display:flex;align-items:center;gap:3px;min-width:105px;padding:2px 8px 2px 2px;color:#eaf8ff;background:#06172dd9;border:1px solid color-mix(in srgb,var(--pet-color) 55%,transparent);clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%);pointer-events:none}.hud-pet-badge .animated-pet{flex:0 0 52px}.hud-pet-badge div:last-child{display:flex;flex-direction:column;gap:2px;min-width:0}.hud-pet-badge b{color:var(--pet-accent);font-size:9px;white-space:nowrap}.hud-pet-badge small{color:#92b4cd;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:78px}
/* Presentation overhaul: the playfield reads as a cockpit, not a web form. */
.game-root{background:#050817!important;color:#eef7ff}.canvas-wrap{background:#050817 url('/assets/art/orbit-bg.svg') center/cover no-repeat!important;isolation:isolate}.canvas-wrap::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:1;background:linear-gradient(180deg,rgba(2,7,19,.28),transparent 35%,rgba(2,7,19,.22));mix-blend-mode:multiply}.game-canvas{position:relative;z-index:0;filter:saturate(1.12) contrast(1.04)}
.hud-top{left:14px!important;right:14px!important;top:calc(var(--safe-top) + 12px)!important;padding:7px 10px!important;background:linear-gradient(100deg,#07152ce8,#0b2341cc)!important;border:1px solid #6fdfff55!important;clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%)!important;box-shadow:0 8px 24px #0008,inset 0 1px #fff2!important}.hud-center{gap:3px}.hud-lv{color:#7be3ff!important;font-size:10px!important;letter-spacing:.08em}.hud-score{color:#fff!important;text-shadow:0 0 12px #67dfff88}.hud-floors{color:#ffd568!important}.star-bar-wrap{left:16px!important;right:16px!important;top:calc(var(--safe-top) + 76px)!important}.star-bar{height:6px!important;background:#07152b!important;border:1px solid #6fdfff55!important}.star-fill{background:linear-gradient(90deg,#47d8ff,#ffd466)!important}.combo-badge{border-radius:3px!important;background:linear-gradient(100deg,#b64d2e,#f2a942)!important;border:1px solid #ffd77a!important;box-shadow:0 5px 20px #0008!important}.timer-hints{top:calc(var(--safe-top) + 96px)!important}.timer-chip{border-radius:2px!important;border:1px solid #72deff44!important;background:#07172de8!important}.timer-chip.weather{color:var(--wcolor)!important}.hud-bottom{bottom:calc(var(--safe-bottom) + 48px)!important}.use-btn{width:64px!important;height:64px!important;border-radius:2px!important;background:#091a35df!important;border:1px solid #70deff66!important;clip-path:polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,0 100%)!important}.use-name{color:#9ed2e7!important}.charge-btn{width:92px!important;height:92px!important;border-radius:3px!important;background:linear-gradient(145deg,#7b3d2a,#172a48)!important;border:2px solid #ffd46699!important;clip-path:polygon(8% 0,92% 0,100% 8%,100% 92%,92% 100%,8% 100%,0 92%,0 8%)!important}.charge-ring{transform:rotate(-90deg)}.flame-core{color:#ffd466!important}.width-readout{left:16px!important;right:16px!important;bottom:calc(var(--safe-bottom) + 10px)!important}.wr-bar{height:7px!important;border-radius:0!important;background:#061228!important;border-color:#70deff55!important}.wr-fill{background:linear-gradient(90deg,#3bd7ff,#ffd366)!important}.wr-line{color:#dceeff!important}.wr-cur{color:#ffd366!important}.overlay{background:rgba(1,5,17,.86)!important;backdrop-filter:blur(10px)!important}.modal{border-radius:3px!important;background:linear-gradient(160deg,#10264c,#071126)!important;border:1px solid #70deff66!important;box-shadow:0 20px 55px #000b,inset 0 1px #fff2!important}.title-bar h2,.prep-lv-name{color:#eff8ff!important}.prep-card,.opt-card,.result-stats{border-radius:2px!important;background:#081a35cc!important;border-color:#70deff44!important}.prep-actions .btn,.result-actions .btn{border-radius:2px!important}.icon-btn{border-radius:2px!important;background:#071a35dd!important;border-color:#70deff55!important}
</style>
