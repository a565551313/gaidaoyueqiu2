// 高空天气系统
// -------------------------------------------------------------
// 随本局高度（进度 p = floors / target）逐步解锁各类天气，天气以“一阵一阵”
// 的方式出现：晴朗间歇 → 天气直接来袭（无预告）→ 持续若干秒 → 转晴。
//
// 各天气的玩法影响：
//   wind  大风：楼体晃动幅度/频率大幅提升，待落方块被阵风持续吹偏
//   rain  暴雨：方块落下时会“打滑”，边下落边横向偏移，需要提前量
//   hail  冰雹：冰雹砸中楼顶会削掉一点宽度（有安全下限），并震屏
//   smog  乌云：厚云飘过遮挡视线，看不清楼顶与方块
//   storm 雷暴：乌云 + 雷电，画面忽明忽暗，闪电有概率劈掉 1—3 层
//
// 所有影响都通过引擎读取的接口暴露，渲染分前景/背景两层。

import { Audio } from './audio.js'
import { CHAPTER, getChapterForLevel } from '../data/levels.js'
import { CloudField, HailField, RainField, SnowField, WindField, drawBolt, drawSkyGlow, makeBolt, makeRng } from './weatherFx.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export const WEATHER_DEFS = {
  wind: {
    id: 'wind',
    name: '强风',
    icon: '🌬',
    color: '#8fd3ff',
    tip: '强风来袭！楼体晃得更厉害',
    unlock: 0.16,
    weight: 3,
    dur: [8, 13]
  },
  rain: {
    id: 'rain',
    name: '暴雨',
    icon: '🌧',
    color: '#69a7ff',
    tip: '暴雨！方块落下会打滑',
    unlock: 0.3,
    weight: 2.6,
    dur: [9, 14]
  },
  hail: {
    id: 'hail',
    name: '冰雹',
    icon: '🧊',
    color: '#b3e5fc',
    tip: '冰雹！砸中楼顶会削掉宽度',
    unlock: 0.45,
    weight: 2.2,
    dur: [7, 11]
  },
  smog: {
    id: 'smog',
    name: '乌云',
    icon: '☁',
    color: '#9aa4b8',
    tip: '乌云压顶！视线受阻',
    unlock: 0.58,
    weight: 2,
    dur: [8, 12]
  },
  storm: {
    id: 'storm',
    name: '雷暴',
    icon: '⚡',
    color: '#ffe066',
    tip: '雷暴！闪电可能劈掉楼层',
    unlock: 0.74,
    weight: 2.4,
    dur: [9, 14]
  }
}

const HAIL_REARM_SECONDS = 0.6
const HAIL_FLOOR = 26 // 冰雹削到这个宽度就不再削（不会直接砸死）
const HAIL_DAMAGE = 3.2 // 单次冰雹命中削掉的宽度（像素）
const LIGHTNING_MAX_FLOORS = 3 // 雷暴命中楼体时，最多劈掉的楼层数（乌金材质为 1）

export class WeatherSystem {
  constructor(engine) {
    this.engine = engine
    this.paused = false
    this.scale = engine.level.weather != null ? engine.level.weather : 1 // 关卡强度系数
    this.chapter = getChapterForLevel(engine.level)
    this.chapterMode = !!engine.level.chapterId && engine.level.chapterId !== CHAPTER.id
    this.chapterStage = engine.level.chapterStage || 1
    this.stageConfig = this.chapter.stages[this.chapterStage - 1] || {}
    this.chapterEventIndex = 0
    this.lastDirection = 1
    this.chapterTimer = 2.6
    this.chapterPhase = 'clear'
    this.chapterCloudOffset = 0
    this.dropPaused = false
    this.hailSafetyNotice = false

    this.current = null // {def, t, dur, intensity, dir}
    this.timer = 6 + Math.random() * 4 // 距离下一次天气

    this.drops = [] // 雨滴 / 冰雹
    this.spawnAcc = 0
    this.gustPhase = Math.random() * 6.28
    this.flash = 0 // 闪电忽明忽暗效果的剩余时间
    this.blind = 0 // 闪电暗场的剩余时间
    this.flashPhase = 0 // 闪烁相位，控制明暗交替
    this.boltT = 0 // 下次闪电倒计时
    this.bolt = null // {segs, life}
    this.fogBands = this._makeFog()
    this.snowflakes = Array.from({ length: 14 }, (_, i) => ({
      x: i % 2 === 0 ? 12 + ((i * 37) % 86) : 322 + ((i * 29) % 86),
      y: (i * 53) % 720,
      speed: 14 + (i % 4) * 4,
      size: 1 + (i % 3) * 0.45,
      drift: ((i % 3) - 1) * 3
    }))
    this.hailHitT = 0
    this.lastTip = ''
    this.pendingTimers = new Set()
    this.pendingStrike = null

    // ---- 表现层粒子场（weatherFx.js）----
    // 只为本关实际会用到的天气分配，避免每局都建一堆用不上的粒子。
    const seed = ((engine.level.id || 1) * 2654435761) >>> 0
    this.fxRng = makeRng(seed ^ 0x5bf03635)
    const kind = this.chapterMode ? this.chapter.weatherKind : 'all'
    const need = (...kinds) => kind === 'all' || kinds.includes(kind)
    this.fx = {
      rain: need('rain') ? new RainField(seed) : null,
      hail: need('hail') ? new HailField(seed ^ 0x9e37) : null,
      snow: need('snow') ? new SnowField(seed ^ 0x85eb) : null,
      wind: need('wind') ? new WindField(seed ^ 0xc2b2) : null,
      cloud: need('cloud', 'lightning') ? new CloudField(seed ^ 0x27d4, kind === 'lightning' ? 3 : 6) : null
    }
    this.skyGlow = 0
    this.skyGlowAt = { x: 210, y: 90 }
  }

  // 塔顶命中区：只有真正落在塔顶宽度之内的雨/雹才溅开，
  // 其余继续落到画面底部，不然屏幕下半部分会整片空掉。
  _impactRect() {
    const e = this.engine
    const top = e.blocks?.[e.blocks.length - 1]
    if (!top) return null
    const y = e.screenY(e.worldY(top.index))
    if (!(y > 20 && y < 740)) return null
    const cx = top.cx + e.swayOffset(top.index)
    return { y, x0: cx - top.width / 2, x1: cx + top.width / 2 }
  }

  // 统一推进所有粒子场
  _updateFx(dt) {
    const kind = this.chapterMode ? this.chapter.weatherKind : (this.current?.def.id || '')
    const active = this.chapterMode ? this.current?.phase === 'active' : !!this.current
    const k = active ? (this.current?.intensity || 0.4) : 0
    const dir = this.current?.dir ?? this.lastDirection ?? 1
    const impact = this._impactRect()
    if (this.fx.rain) this.fx.rain.update(dt, { intensity: (kind === 'rain' || kind === 'storm') ? Math.max(0.35, k * 1.6) : 0, dir: dir * 0.55, impact })
    if (this.fx.hail) this.fx.hail.update(dt, { intensity: kind === 'hail' ? Math.max(0.4, k * 1.5) : 0, impact })
    if (this.fx.snow) this.fx.snow.update(dt, { coverage: this.stageConfig.coverage ?? 0.4 })
    if (this.fx.wind) this.fx.wind.update(dt, { intensity: kind === 'wind' ? Math.max(0.18, k * 1.5) : 0.1, dir: dir >= 0 ? 1 : -1 })
    if (this.fx.cloud) this.fx.cloud.update(dt, { dir: this.chapterStage % 2 ? 1 : -1, speed: 1 + (this.current?.intensity || 0) })
    if (this.skyGlow > 0) this.skyGlow = Math.max(0, this.skyGlow - dt * 1.9)
  }

  _makeFog() {
    const arr = []
    for (let i = 0; i < 5; i++) {
      arr.push({
        y: Math.random(), // 相对屏幕高度
        x: Math.random() * 520 - 50,
        s: 0.8 + Math.random() * 0.9,
        v: (Math.random() - 0.5) * 26
      })
    }
    return arr
  }

  // ---------------- 对外状态 ----------------
  // 天气不再预告，出现即生效
  get activeId() {
    if (this.chapterMode && this.chapter.weatherKind === 'snow') return 'snow'
    return this.current ? this.current.def.id : null
  }

  // 蚂蚁在改变塔层、移动轨迹或能见度的天气窗口暂停；纯视觉天气可并行。
  get hasGameplayThreat() {
    if (this.chapterMode) {
      return !!this.current && this.current.phase === 'active' && ['wind', 'rain', 'hail'].includes(this.chapter.weatherKind)
    }
    return !!this.current && ['wind', 'rain', 'hail', 'smog', 'storm'].includes(this.current.def.id)
  }

  hudState() {
    if (this.chapterMode) {
      const kind = this.chapter.weatherKind
      const labels = {
        clear: ['晴天', '☀', '#ffe8a2', '静塔', ''],
        wind: ['风', '🌬', '#a1e8d6', '静风间歇', '读风向提示'],
        cloud: ['低云', '☁', '#b5c9db', '云隙', '轮廓保护'],
        lightning: ['远景雷光', '⚡', '#e9d788', '远景静歇', '仅背景表现'],
        rain: ['雨', '🌧', '#7bc7e5', '雨歇', '只影响落块'],
        hail: ['冰雹', '❄', '#c8dde0', '晴歇', '顶层宽度有下限'],
        snow: ['飘雪', '❄', '#d6edf0', '纯视觉', '不影响玩法']
      }
      const [name, icon, color, clearLabel, hint] = labels[kind] || labels.cloud
      if (kind === 'snow') return { id: kind, name, icon, color, remaining: 0, phase: 'visual', phaseLabel: '纯视觉', hint, dir: 0, intensity: 0 }
      if (kind === 'clear') return { id: kind, name, icon, color, remaining: 0, phase: 'clear', phaseLabel: clearLabel, hint, dir: 0, intensity: 0 }
      if (!this.current) return { id: kind, name: clearLabel, icon, color, remaining: Math.ceil(Math.max(0, this.chapterTimer)), phase: 'clear', phaseLabel: clearLabel, hint, dir: this.lastDirection, intensity: 0 }
      const warning = this.current.phase === 'warning'
      const remaining = Math.ceil(Math.max(0, this.current.phaseTimer))
      const phaseLabel = warning ? `预告 ${remaining}s` : kind === 'hail' ? `冰雹波次 ${remaining}s` : kind === 'rain' ? `降雨 ${remaining}s` : kind === 'wind' ? `阵风 ${remaining}s` : kind === 'cloud' ? `云带 ${remaining}s` : `远景电光 ${remaining}s`
      const direction = kind === 'wind' || kind === 'rain'
        ? `向${this.current.dir < 0 ? '左' : '右'}`
        : kind === 'hail' ? '点击落定后结算' : hint
      return { id: kind, name: warning ? `${name}预告` : name, icon, color, remaining, phase: this.current.phase, phaseLabel, hint: direction, dir: this.current.dir, intensity: this.current.intensity }
    }
    if (!this.current) return null
    return {
      id: this.current.def.id,
      name: this.current.def.name,
      icon: this.current.def.icon,
      color: this.current.def.color,
      remaining: Math.ceil(Math.max(0, this.current.dur - this.current.t)),
      phase: this.current.phase,
      dir: this.current.dir ?? 0,
      intensity: this.current.intensity ?? 0
    }
  }

  // 楼体晃动幅度倍率（大风/雷暴加剧）
  swayMult() {
    const id = this.activeId
    if (this.chapterMode) {
      if (id === 'wind' && this.current?.phase === 'active') return 1 + 0.12 * this.current.intensity
      return 1
    }
    if (!this.current) return 1
    const k = this.current.intensity
    const antiWind = this.engine.antiWind || 0
    if (id === 'wind') return 1 + 1.15 * k * (1 - antiWind)
    if (id === 'storm') return 1 + 0.55 * k * (1 - antiWind)
    if (id === 'rain') return 1 + 0.2 * k
    return 1
  }

  // 晃动频率倍率
  swayFreqMult() {
    const id = this.activeId
    if (this.chapterMode) return id === 'wind' && this.current?.phase === 'active' ? 1 + 0.1 * this.current.intensity : 1
    if (!this.current) return 1
    if (id === 'wind') return 1 + 0.45 * this.current.intensity
    if (id === 'storm') return 1 + 0.25 * this.current.intensity
    return 1
  }

  // 对待落方块的横向风力（像素/秒）与速度扰动
  modifiers() {
    const id = this.activeId
    if (this.chapterMode) {
      if (id === 'wind' && this.current?.phase === 'active') {
        const gust = 0.76 + 0.18 * Math.sin(this.gustPhase) + 0.06 * Math.sin(this.gustPhase * 2.1)
        return { windX: this.current.dir * (14 + 24 * this.current.intensity) * gust, speedMod: 1 }
      }
      // Chapter rain is intentionally forbidden from pushing the moving phase
      // or modifying its speed; cloud, lightning, snow and hail are also neutral.
      return { windX: 0, speedMod: 1 }
    }
    if (!id) return { windX: 0, speedMod: 1 }
    const c = this.current
    const k = c.intensity
    if (id === 'wind') {
      // 阵风：方向固定 + 强弱起伏，偶尔有强阵风
      const gust = 0.55 + 0.45 * Math.sin(this.gustPhase) + 0.25 * Math.sin(this.gustPhase * 2.7)
      return { windX: c.dir * 46 * k * gust, speedMod: 1 }
    }
    if (id === 'storm') {
      const gust = 0.5 + 0.5 * Math.sin(this.gustPhase * 1.3)
      return { windX: c.dir * 26 * k * gust, speedMod: 1 }
    }
    if (id === 'rain') {
      return { windX: c.dir * 12 * k, speedMod: 1 + 0.12 * k }
    }
    return { windX: 0, speedMod: 1 }
  }

  // 落块打滑速度（像素/秒），在下落动画期间持续横移，玩家看得见、可预判
  slipVelocity(movingDir) {
    const id = this.activeId
    if (this.chapterMode) {
      if (id !== 'rain' || this.current?.phase !== 'active') return 0
      const antiSlip = this.engine.antiSlip || 0
      return this.current.dir * (42 + 48 * this.current.intensity) * (1 - antiSlip)
    }
    if (id !== 'rain') return 0
    const k = this.current.intensity
    const antiSlip = this.engine.antiSlip || 0
    // 顺着方块原本的运动方向打滑为主，叠加一点风向；混凝土削弱整体滑移。
    const base = movingDir * 70 * k + this.current.dir * 30 * k
    return base * (1 - antiSlip)
  }

  // 视线遮挡强度（0~1），供引擎渲染雾幕
  fogStrength() {
    const id = this.activeId
    if (this.chapterMode) return 0
    if (id === 'smog') return 0.72 * this.current.intensity
    if (id === 'storm') return 0.5 * this.current.intensity
    if (id === 'rain') return 0.16 * this.current.intensity
    return 0
  }

  // ---------------- 更新 ----------------
  update(dt, p) {
    if (this.paused) return
    this.gustPhase += dt * 2.1

    if (this.pendingStrike) {
      const pending = this.pendingStrike
      this.pendingStrike = null
      this._resolveStrike(pending.k, pending.hitTower)
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 1.65)
      this.flashPhase += dt * 31
    }
    if (this.blind > 0) this.blind = Math.max(0, this.blind - dt * 1.8)
    if (this.bolt) {
      this.bolt.life -= dt
      if (this.bolt.life <= 0) this.bolt = null
    }
    for (const f of this.fogBands) {
      f.x += f.v * dt
      if (f.x < -180) f.x = 560
      if (f.x > 560) f.x = -180
    }

    if (this.chapterMode) {
      this._updateChapter(dt, p)
      this._updateFx(dt)
      return
    }

    if (this.current) {
      this.current.t += dt
      this._tick(dt)
      if (this.current.t >= this.current.dur) this._end()
    } else {
      this.timer -= dt
      if (this.timer <= 0) this._tryStart(p)
    }

    this._updateFx(dt)
  }

  _chapterWeatherId() {
    return ({ wind: 'wind', cloud: 'smog', lightning: 'storm', rain: 'rain', hail: 'hail' })[this.chapter.weatherKind] || null
  }

  _updateChapter(dt, p) {
    const kind = this.chapter.weatherKind
    this.chapterCloudOffset = (this.chapterCloudOffset + dt * (18 + this.chapterStage * 1.4)) % 540
    if (kind === 'snow') return // 飘雪由 weatherFx 的 SnowField 推进

    // 落块期间冰雹必须停手（安全规则），但只是「冻结」——
    // 旧实现每次落块都把 phase 推回 warning 且 phaseTimer 重置成整整 3s、
    // t 归零，而玩家约每 1.1s 落一块，于是倒计时永远走不到 0，
    // 整个砺川章的冰雹实测 0% 时间处于 active。现在保留进度，只付一次短促再预警。
    if (kind === 'hail' && this.engine.dropping) {
      if (!this.dropPaused) {
        this.dropPaused = true
        this.drops.length = 0
        if (this.current) {
          this.current.suspended = this.current.phase
          this.current.phase = 'warning'
          this.chapterPhase = 'warning'
          // 冻结：不动 t，不重置总时长，只保证解冻时至少还有一个再预警
          this.current.phaseTimer = Math.max(this.current.phaseTimer, HAIL_REARM_SECONDS)
        } else this.chapterTimer = 0
      }
      return
    }
    if (this.dropPaused) {
      this.dropPaused = false
      if (this.current) {
        const wasActive = this.current.suspended === 'active'
        this.current.suspended = null
        this.current.phase = 'warning'
        this.chapterPhase = 'warning'
        // 已经在下雹的事件：短促再架起，并记住要续上原来的剩余时长
        this.current.phaseTimer = wasActive ? HAIL_REARM_SECONDS : Math.max(this.current.phaseTimer, HAIL_REARM_SECONDS)
        this.current.resumed = wasActive
        this.engine._spawnFloat(this.engine.blocks.at(-1)?.cx || 210, wasActive ? '冰雹继续' : '冰雹预警', '#c8dde0', this.engine.worldY(this.engine.blocks.length - 1) - 92)
        this.engine._emit()
      } else {
        this._startChapterEvent()
      }
      return
    }

    if (this.current) {
      const event = this.current
      if (event.phase === 'warning') {
        event.phaseTimer = Math.max(0, event.phaseTimer - dt)
        if (event.phaseTimer <= 0) {
          event.phase = 'active'
          // resumed：落块打断后续上原来的剩余时长，不白送一整轮
          if (!event.resumed) event.t = 0
          event.resumed = false
          event.phaseTimer = Math.max(0.2, event.dur - event.t)
          this.chapterPhase = 'active'
          if (kind === 'rain') Audio.weatherRain()
          else if (kind === 'cloud') Audio.weatherSmog()
          else if (kind === 'lightning') this.boltT = 0.65
          this.engine._emit()
        }
      } else {
        event.t += dt
        event.phaseTimer = Math.max(0, event.dur - event.t)
        this._tickChapterActive(dt)
        if (event.phaseTimer <= 0) this._endChapterEvent()
      }
      return
    }

    this.chapterTimer = Math.max(0, this.chapterTimer - dt)
    if (this.chapterTimer <= 0 && this.engine.status === 'playing') this._startChapterEvent()
  }

  _startChapterEvent() {
    if (this.engine.status !== 'playing') return
    const kind = this.chapter.weatherKind
    const weatherId = this._chapterWeatherId()
    const directions = this.stageConfig.directions || [1]
    const dir = kind === 'rain'
      ? this.stageConfig.rainDir || 1
      : kind === 'wind'
        ? directions[this.chapterEventIndex % directions.length]
        : kind === 'cloud'
          ? (this.chapterStage % 2 ? 1 : -1)
          : kind === 'hail' ? 0 : 1
    const duration = this.stageConfig.active || 4.5
    this.current = {
      def: WEATHER_DEFS[weatherId],
      t: 0,
      dur: duration,
      intensity: this.stageConfig.intensity || this.stageConfig.density || 0.3,
      dir,
      phase: 'warning',
      phaseTimer: this.stageConfig.warning || (kind === 'hail' ? 3 : 2.8)
    }
    this.lastDirection = dir || this.lastDirection
    this.chapterEventIndex += 1
    this.chapterPhase = 'warning'
    this.hailHitT = this.stageConfig.interval || 1.7
    this.boltT = 0.7
    const cue = kind === 'wind'
      ? `风向预告 ${dir < 0 ? '←' : '→'}`
      : kind === 'rain'
        ? `雨向预告 ${dir < 0 ? '←' : '→'}`
        : kind === 'cloud' ? '云墙即将到达'
          : kind === 'lightning' ? '远处雷光'
            : '冰雹预警'
    this.engine._spawnFloat(this.engine.blocks.at(-1)?.cx || 210, cue, WEATHER_DEFS[weatherId].color, this.engine.worldY(this.engine.blocks.length - 1) - 92)
    if (kind === 'wind') Audio.weatherWind()
    else if (kind === 'hail') Audio.weatherHail()
    this.engine._emit()
  }

  _tickChapterActive(dt) {
    const kind = this.chapter.weatherKind
    if (kind === 'hail') {
      this.hailHitT -= dt
      if (this.hailHitT <= 0) {
        this.hailHitT = this.stageConfig.interval || 1.7
        this._hitHail(HAIL_DAMAGE)
      }
    } else if (kind === 'lightning') {
      this.boltT -= dt
      if (this.boltT <= 0) {
        this.boltT = 1.7 + (this.chapterStage >= 6 ? 0.35 : 0)
        this._chapterLightningPulse()
      }
    }
  }

  _endChapterEvent() {
    this.current = null
    this.drops.length = 0
    this.chapterPhase = 'clear'
    this.chapterTimer = this.stageConfig.calm || 5
    this.engine._emit()
  }

  _updateSnow(dt) {
    for (const flake of this.snowflakes) {
      flake.x += flake.drift * dt
      flake.y += flake.speed * dt
      const minX = flake.x < 210 ? 8 : 312
      const maxX = flake.x < 210 ? 104 : 412
      if (flake.y > 730) {
        flake.y = -8
        flake.x = minX + ((Math.floor(flake.x * 13) + this.chapterStage * 11) % (maxX - minX))
      }
      if (flake.x < minX) flake.x = minX
      if (flake.x > maxX) flake.x = maxX
    }
  }

  _pool(p) {
    return Object.values(WEATHER_DEFS).filter((d) => p >= d.unlock)
  }

  _tryStart(p) {
    const engine = this.engine
    if (engine.status !== 'playing' || this.scale <= 0) {
      this.timer = 3
      return
    }
    const pool = this._pool(p)
    if (pool.length === 0) {
      this.timer = 2.5
      return
    }
    let total = 0
    for (const d of pool) total += d.weight
    let r = Math.random() * total
    let def = pool[pool.length - 1]
    for (const d of pool) {
      r -= d.weight
      if (r <= 0) {
        def = d
        break
      }
    }
    const k = clamp((0.45 + p * 0.85) * this.scale, 0.3, 1.6)
    this.current = {
      def,
      t: 0,
      dur: (def.dur[0] + Math.random() * (def.dur[1] - def.dur[0])) * clamp(this.scale, 0.5, 1.4) * (this.engine.petRuntime?.effects.weatherDurationMult || 1),
      intensity: k * (this.engine.petRuntime?.weatherIntensityMult(0) || 1),
      dir: Math.random() < 0.5 ? -1 : 1
    }
    this.boltT = 1.5 + Math.random() * 2.5
    this.hailHitT = 0.8
    // 不预告，直接生效
    this._onStart()
  }

  _onStart() {
    const def = this.current.def
    const engine = this.engine
    engine._spawnFloat(
      engine.blocks[engine.blocks.length - 1].cx,
      def.tip,
      def.color,
      engine.worldY(engine.blocks.length - 1) - 90
    )
    if (def.id === 'wind') Audio.weatherWind()
    else if (def.id === 'rain') Audio.weatherRain()
    else if (def.id === 'hail') Audio.weatherHail()
    else if (def.id === 'smog') Audio.weatherSmog()
    else if (def.id === 'storm') Audio.thunder(0.6)
    engine._emit()
  }

  _end() {
    this.current = null
    this.drops.length = 0
    this.timer = 7 + Math.random() * 7
    this.engine._emit()
  }

  _tick(dt) {
    const id = this.current.def.id
    const k = this.current.intensity
    if (id === 'hail') {
      this.hailHitT -= dt
      if (this.hailHitT <= 0) {
        this.hailHitT = (1.5 + Math.random() * 1.6) / clamp(k, 0.4, 1.6)
        this._hitHail(HAIL_DAMAGE * k)
      }
    } else if (id === 'storm') {
      this.boltT -= dt
      if (this.boltT <= 0) {
        this.boltT = (3.2 + Math.random() * 3.4) / clamp(k, 0.4, 1.5)
        this._strike(k)
      }
    }
  }

  // 冰雹削楼顶宽度。落块动画期间不结算（宽度在下落途中变化会破坏
  // “点击瞬间所见 = 最终判定”的公平性），该次命中直接跳过。
  _hitHail(amount) {
    const engine = this.engine
    if (engine.dropping) return
    const top = engine.blocks[engine.blocks.length - 1]
    if (!top) return
    if (this.chapterMode && this.chapter.weatherKind === 'hail') {
      // 原来写死 HAIL_DAMAGE，整章八关强度完全一样；现在按关卡强度缩放
      const scale = clamp(this.stageConfig?.intensity ?? 1, 0.5, 2)
      const cut = HAIL_DAMAGE * scale * (1 - (engine.antiBreak || 0))
      const w = Math.max(HAIL_FLOOR, top.width - cut)
      if (w >= top.width - 0.05) {
        if (!this.hailSafetyNotice) {
          this.hailSafetyNotice = true
          engine._spawnFloat(top.cx, '安全下限 · 宽度不再下降', '#c8dde0', engine.worldY(top.index) - 8)
          engine._emit()
        }
        return
      }
      top.width = w
      engine.currentWidth = Math.min(engine.currentWidth, w)
      const cx = top.cx + engine.swayOffset(top.index)
      const wy = engine.worldY(top.index)
      for (let i = 0; i < 5; i++) {
        engine.particles.push({
          wx: cx + (Math.random() - 0.5) * Math.min(top.width, 28),
          wy: wy + Math.random() * 5,
          vx: (Math.random() - 0.5) * 35,
          vy: -14 - Math.random() * 22,
          life: 0.22,
          maxLife: 0.22,
          size: 1.5 + Math.random() * 1.5,
          color: '#c8dde0',
          gravity: false
        })
      }
      engine._spawnFloat(cx, w <= HAIL_FLOOR + 0.05 ? '冰雹 · 已达安全下限' : '冰雹 · 顶层宽度-', '#c8dde0', wy - 7)
      this.fx.hail?.impact(cx, engine.screenY(wy), 1)
      engine.shake = Math.max(engine.shake, 3.5)
      Audio.hailImpact()
      engine._emit()
      return
    }
    const cut = amount * (1 - (engine.antiBreak || 0))
    const w = Math.max(HAIL_FLOOR, top.width - cut)
    if (w >= top.width - 0.05) return
    top.width = w
    engine.currentWidth = Math.min(engine.currentWidth, w)
    engine.shake = Math.max(engine.shake, 5)
    const cx = top.cx + engine.swayOffset(top.index)
    const wy = engine.worldY(top.index)
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2
      engine.particles.push({
        wx: cx + (Math.random() - 0.5) * top.width,
        wy: wy + Math.random() * 10,
        vx: Math.cos(a) * 110,
        vy: Math.sin(a) * 90 - 60,
        life: 0.5,
        maxLife: 0.5,
        size: 2 + Math.random() * 2.5,
        color: '#b3e5fc',
        gravity: true
      })
    }
    engine._spawnFloat(cx, '冰雹! 宽度-', '#b3e5fc', wy - 6)
    this.fx.hail?.impact(cx, engine.screenY(wy), 1.3)
    Audio.hailImpact()
    engine._emit()
  }

  // 雷电由天气系统独立处理，只能选择天气自己的视觉落点或楼体落点。
  _strike(k) {
    if (this.chapterMode && this.chapter.weatherKind === 'lightning') {
      this._chapterLightningPulse()
      return
    }
    const engine = this.engine
    const hitTower = engine.floors > 0 && Math.random() < 0.34 + 0.1 * k

    // 用多个明暗脉冲代替一次性白屏，模拟雷声伴随的忽明忽暗。
    this.flash = 0.78
    this.blind = 0.78
    this.flashPhase = Math.random() * Math.PI * 2

    const x0 = 40 + Math.random() * 340
    const targetY = 200 + Math.random() * 380
    this.bolt = makeBolt(this.fxRng, { x0, y0: -10, y1: targetY, width: 70, forks: 4, steps: 10 })
    this.bolt.life = 0.34
    this.skyGlow = 1
    this.skyGlowAt = { x: x0, y: 70 }
    Audio.thunder(1)

    // 给闪电一点落点延迟，让玩家先看见明暗闪烁，再看到破坏结果。
    const strike = { k, hitTower }
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer)
      if (this.engine.status !== 'playing') return
      if (this.paused) this.pendingStrike = strike
      else this._resolveStrike(k, hitTower)
    }, 150)
    this.pendingTimers.add(timer)
  }

  _resolveStrike(k, hitTower) {
    if (this.chapterMode && this.chapter.weatherKind === 'lightning') return
    const engine = this.engine
    let hit = false
    if (hitTower && !engine.dropping) {
      if (engine.petRuntime?.tryBlockLightning()) hit = true
      else hit = this._strikeTower() || hit
    }
    if (!hit) engine.shake = Math.max(engine.shake, 6)
  }

  // 雷击楼体：随机劈掉 1—3 层（乌金材质最多 1 层），保留地基，
  // 之后从新的楼顶继续堆叠。被劈掉的楼层会扣回其已计入的分数。
  _strikeTower() {
    const engine = this.engine
    const available = Math.min(engine.lightningMaxFloors || LIGHTNING_MAX_FLOORS, engine.floors)
    if (available <= 0) return false

    const count = 1 + Math.floor(Math.random() * available)
    const removed = []
    engine.antSystem?.beforeTowerChange()
    for (let i = 0; i < count; i++) {
      const block = engine.blocks.pop()
      if (block) removed.push(block)
    }
    if (removed.length === 0) return false

    if (engine.antSystem) engine.antSystem.remapAfterTowerChange()
    for (const block of removed) {
      engine.score = Math.max(0, engine.score - (block.scorePts || 0))
      const cx = block.cx + engine.swayOffset(block.index)
      const wy = engine.worldY(block.index) + 8
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2
        engine.particles.push({
          wx: cx + (Math.random() - 0.5) * block.width,
          wy,
          vx: Math.cos(a) * (70 + Math.random() * 100),
          vy: Math.sin(a) * 75 - 40,
          life: 0.65,
          maxLife: 0.65,
          size: 2 + Math.random() * 2,
          color: i % 2 ? '#ffe066' : '#fff7bd',
          gravity: true
        })
      }
    }

    engine.floors = Math.max(0, engine.blocks.length - 1)
    const top = engine.blocks[engine.blocks.length - 1]
    engine.currentWidth = top ? top.width : engine.initialWidthPx
    engine.shake = Math.max(engine.shake, 15 + count * 2)
    engine._spawnFloat(
      top ? top.cx : engine.initialWidthPx / 2,
      `雷击! 楼层-${removed.length}`,
      '#ffe066',
      top ? engine.worldY(top.index) - 8 : -20
    )

    // 非落层/非自动序列时，立即按新的楼顶生成待落方块。
    if (!engine.dropping && !engine.autoSeqActive && engine.status === 'playing') {
      engine._spawnMoving()
    }
    engine._emit()
    return true
  }


  // ---------------- 雨滴 / 冰雹粒子 ----------------
  _updateDrops(dt) {
    const id = this.activeId
    const k = this.current ? this.current.intensity : 0
    if (this.chapterMode && !['rain', 'hail'].includes(this.chapter.weatherKind)) {
      this.spawnAcc = 0
      this.drops.length = 0
      return
    }
    if (this.chapterMode && this.current?.phase !== 'active') {
      this.spawnAcc = 0
      this.drops.length = 0
      return
    }
    if (id === 'rain' || id === 'storm' || id === 'hail') {
      const rate = id === 'hail' ? 42 * k : (id === 'storm' ? 150 : 190) * k
      this.spawnAcc += rate * dt
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1
        this._spawnDrop(id, k)
      }
    } else {
      this.spawnAcc = 0
    }
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.life -= dt
      if (d.life <= 0 || d.y > 760) this.drops.splice(i, 1)
    }
  }

  _spawnDrop(id, k) {
    const dir = this.current ? this.current.dir : 1
    if (id === 'hail') {
      this.drops.push({
        kind: 'hail',
        x: Math.random() * 480 - 30,
        y: -20,
        vx: dir * (20 + Math.random() * 40),
        vy: 520 + Math.random() * 260,
        r: 2.6 + Math.random() * 3,
        life: 3
      })
    } else {
      this.drops.push({
        kind: 'rain',
        x: Math.random() * 520 - 50,
        y: -20,
        vx: dir * (60 + 90 * k) + (Math.random() - 0.5) * 20,
        vy: 700 + Math.random() * 380,
        len: 10 + Math.random() * 16,
        life: 3
      })
    }
  }

  // ---------------- 渲染 ----------------
  // 背景层：压暗天空 + 厚云（在塔之前绘制的部分）
  renderBack(ctx, W, H) {
    if (this.chapterMode) {
      this._renderChapterBack(ctx, W, H)
      return
    }
    if (!this.current) return
    const id = this.current.def.id
    const k = this.current.intensity
    if (id === 'smog' || id === 'storm' || id === 'rain' || id === 'hail') {
      const darken = (id === 'smog' ? 0.34 : id === 'storm' ? 0.4 : 0.2) * k
      ctx.fillStyle = `rgba(20,24,38,${clamp(darken, 0, 0.6)})`
      ctx.fillRect(-20, -20, W + 40, H + 40)
    }
  }

  // 前景层：雨/雹、雾幕遮挡、闪电线与明暗闪烁
  renderFront(ctx, W, H) {
    if (this.chapterMode) {
      this._renderChapterFront(ctx, W, H)
      return
    }
    const id = this.activeId
    // 雨 / 雹 / 风：统一走 weatherFx 的分层粒子场
    if (id === 'rain' || id === 'storm') this.fx.rain?.draw(ctx)
    if (id === 'hail') this.fx.hail?.draw(ctx)
    if (id === 'wind' || id === 'storm') this.fx.wind?.draw(ctx)

    // 乌云遮挡视线：几条厚云带压在画面上
    const fog = this.fogStrength()
    if (fog > 0.02) {
      ctx.save()
      for (const f of this.fogBands) {
        const y = f.y * H
        const g = ctx.createLinearGradient(0, y - 70 * f.s, 0, y + 70 * f.s)
        g.addColorStop(0, 'rgba(60,66,86,0)')
        g.addColorStop(0.5, `rgba(60,66,86,${clamp(fog * 0.95, 0, 0.9)})`)
        g.addColorStop(1, 'rgba(60,66,86,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.ellipse(f.x, y, 210 * f.s, 66 * f.s, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      // 整体灰幕
      ctx.fillStyle = `rgba(70,76,96,${clamp(fog * 0.3, 0, 0.35)})`
      ctx.fillRect(-20, -20, W + 40, H + 40)
      ctx.restore()
    }

    // 闪电：分叉主干 + 云层辉光 + 快速明灭
    if (this.skyGlow > 0) drawSkyGlow(ctx, this.skyGlowAt.x, this.skyGlowAt.y, 220, this.skyGlow)
    if (this.bolt) {
      const a = clamp(this.bolt.life / 0.32, 0, 1)
      const flicker = 0.5 + 0.5 * Math.abs(Math.sin(this.bolt.life * 46))
      drawBolt(ctx, this.bolt, { alpha: a * flicker, width: 3.2, glowBlur: 20 })
    }

    // 忽明忽暗的雷光：同一段效果里交替出现亮闪和暗场，避免一闪即逝的白屏感。
    if (this.flash > 0) {
      const fade = clamp(this.flash / 0.78, 0, 1)
      const pulse = 0.5 + 0.5 * Math.sin(this.flashPhase)
      const bright = clamp((0.12 + pulse * 0.72) * fade, 0, 0.86)
      const dark = clamp((0.06 + (1 - pulse) * 0.42) * fade, 0, 0.48)
      if (bright > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${bright})`
        ctx.fillRect(-20, -20, W + 40, H + 40)
      }
      if (this.blind > 0 && dark > 0.01) {
        ctx.fillStyle = `rgba(8,10,20,${dark})`
        ctx.fillRect(-20, -20, W + 40, H + 40)
      }
    }

    void id
  }

  _renderChapterBack(ctx, W, H) {
    const kind = this.chapter.weatherKind
    if (kind === 'wind') {
      const directions = this.stageConfig.directions || [1]
      const dir = this.current?.dir || directions[this.chapterEventIndex % directions.length]
      // 会迎风飘动的旗，取代原来固定不动的三角形
      this.fx.wind?.drawFlag(ctx, 62, 132, dir >= 0 ? 1 : -1, 'rgba(181,234,218,.9)')
    }
    if (kind === 'cloud') {
      const density = Math.max(this.current?.intensity || 0, this.stageConfig.density || 0.15)
      // 背景层云可以更实一些：有体积的团块，带受光面与暗底
      this.fx.cloud?.draw(ctx, {
        alpha: Math.min(0.3, 0.1 + density * 0.3),
        tint: '86,107,131',
        yOffset: (this.chapterStage % 3) * 12
      })
    }
    if (kind === 'lightning') {
      const strength = this.current?.phase === 'active' ? Math.min(0.16, 0.08 + this.current.intensity * 0.16) : 0.07
      // 远景雷云：有体积的暗云团 + 被电光点亮时的辉光
      this.fx.cloud?.draw(ctx, { alpha: Math.min(0.34, 0.14 + strength * 1.3), tint: '38,49,74' })
      if (this.skyGlow > 0) drawSkyGlow(ctx, this.skyGlowAt.x, this.skyGlowAt.y, 170, this.skyGlow)
    }
    // No storm-wide dark overlay is used by any new chapter.
    void H
  }

  _renderChapterFront(ctx, W, H) {
    const kind = this.chapter.weatherKind
    if (kind === 'snow') {
      // 三层景深飘雪 + 近景六角冰晶；中央操作通道自动降低存在感
      this.fx.snow?.draw(ctx)
      return
    }
    if (kind === 'cloud') {
      const density = this.current?.intensity || this.stageConfig.density || 0.15
      // 前景云必须保持半透明（方块轮廓要透出来），所以体积感靠形状而不是靠加深。
      const alpha = Math.min(0.13, 0.045 + density * 0.14)
      for (const baseY of [206, 496]) {
        const x = ((this.chapterCloudOffset * (baseY < 300 ? 1 : -0.72)) % (W + 210)) - 100
        this._wisp(ctx, x, baseY, alpha)
      }
    }
    if (kind === 'rain') this.fx.rain?.draw(ctx)
    if (kind === 'hail') this.fx.hail?.draw(ctx)
    if (kind === 'wind') this.fx.wind?.draw(ctx)
    if (kind === 'lightning' && this.bolt) {
      const a = clamp(this.bolt.life / (this.bolt.final ? 0.9 : 0.32), 0, 1)
      // 多次闪烁：同一道电光在消失前快速明灭两三下
      const flicker = 0.55 + 0.45 * Math.abs(Math.sin(this.bolt.life * 34))
      drawBolt(ctx, this.bolt, { alpha: a * flicker, core: '#fdf6dc', glow: '#f2d98a', width: 1.9, glowBlur: 11 })
    }
    void H
  }

  // 前景薄云团：必须保持 alpha <= 0.13（方块轮廓要透出来），
  // 所以体积感完全靠多个带径向渐变的球叠加，而不是靠提高不透明度。
  _wisp(ctx, x, y, alpha) {
    ctx.save()
    ctx.globalAlpha = alpha
    const g = ctx.createRadialGradient(0, -0.3, 0.12, 0, 0, 1)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.5, 'rgba(227,234,240,0.7)')
    g.addColorStop(1, 'rgba(227,234,240,0)')
    ctx.fillStyle = g
    const blobs = [[0, 0, 46], [40, -9, 32], [84, 3, 42], [-34, 5, 28], [126, -4, 26]]
    for (const [dx, dy, rr] of blobs) {
      ctx.save()
      ctx.translate(x + dx, y + dy)
      ctx.scale(rr, rr * 0.62)
      ctx.beginPath()
      ctx.arc(0, 0, 1, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.restore()
  }

  _chapterLightningPulse(finale = false) {
    if (!this.chapterMode || this.chapter.weatherKind !== 'lightning') return
    if (!finale && this.engine.status !== 'playing') return
    const side = Math.random() < 0.5 ? 1 : -1
    const x0 = side > 0 ? 32 + Math.random() * 28 : 342 + Math.random() * 28
    // 带分叉的远景电光；只点亮云层，绝不接触塔体（不设 flash/blind）
    this.bolt = makeBolt(this.fxRng, { x0, y0: 12, y1: finale ? 132 : 96, width: 26, forks: finale ? 4 : 2, steps: 6 })
    this.bolt.life = finale ? 0.9 : 0.3
    this.bolt.final = finale
    this.skyGlow = finale ? 1 : 0.7
    this.skyGlowAt = { x: x0, y: 58 }
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer)
      if (finale || this.engine.status === 'playing') Audio.thunder(0.34)
    }, 560)
    this.pendingTimers.add(timer)
    if (finale) {
      const clear = setTimeout(() => {
        this.pendingTimers.delete(clear)
        if (this.bolt?.final) this.bolt = null
      }, 1050)
      this.pendingTimers.add(clear)
    }
  }

  playFinalBackdropPulse() {
    if (this.chapterMode && this.chapter.weatherKind === 'lightning' && this.chapterStage === 8) {
      this._chapterLightningPulse(true)
    }
  }

  destroy() {
    for (const timer of this.pendingTimers) clearTimeout(timer)
    this.pendingTimers.clear()
    this.drops.length = 0
    this.bolt = null
    this.current = null
    this.pendingStrike = null
  }

  pause() { this.paused = true }
  resume() { this.paused = false }
}
