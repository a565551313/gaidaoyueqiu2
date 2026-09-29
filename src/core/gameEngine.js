// 游戏引擎：Canvas 2D 绘制、运动、碰撞、计分、充能与特效。
// 逻辑画布 420 × 720。外部（GameView）负责 requestAnimationFrame 循环，
// 每帧调用 engine.update(dt) 与 engine.render(ctx)，并在合适时机 destroy。

import { Audio } from './audio.js'

export const LOGICAL_W = 420
export const LOGICAL_H = 720

const BLOCK_H = 28
const TOWER_TOP_Y = 330 // 顶部楼层在屏幕上的目标位置
const AIM_RISE = 170 // 待落方块在瞄准时高出落点的距离
const PX_PER_POINT = 1.2 // 100 宽度点 = 120 逻辑像素
const DROP_TIME = 0.13 // 落层动画时长（秒）
const FLAME_INTERVAL = 0.22
const AI_DURATION = 10
const SLOW_DURATION = 10

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}
function lerp(a, b, t) {
  return a + (b - a) * t
}
function easeInDrop(t) {
  // 先加速再落稳
  return t < 0.6 ? (t / 0.6) * (t / 0.6) * 0.75 : 0.75 + (1 - 0.75) * (1 - Math.pow(1 - (t - 0.6) / 0.4, 2))
}

export class GameEngine {
  constructor(opts) {
    this.level = opts.level
    this.theme = opts.theme || 'light'
    this.onState = opts.onState || (() => {})
    this.onEnd = opts.onEnd || (() => {})
    this.onReviveOffer = opts.onReviveOffer || (() => {})
    this.onInventoryChange = opts.onInventoryChange || (() => {})

    const skills = opts.skills || {}
    this.skills = skills

    // 库存（本局可消耗的副本），由外部传入初始值
    this.inv = Object.assign({ revive: 0, auto: 0, slow: 0, shield: 0, comboGuard: 0 }, opts.inventory || {})

    // ---- 数值派生 ----
    const foundationMult = 1 + (skills.foundation || 0) * 0.01
    const widenMult = opts.widenActive ? 1.1 : 1
    this.initialWidthPoints = 100 * foundationMult * widenMult
    this.initialWidthPx = this.initialWidthPoints * PX_PER_POINT
    this.restoreAmountPx = this.initialWidthPx * 0.15
    this.perfectWindowPx = 10 * (1 + (skills.insight || 0) * 0.01)

    const speedMult = 1 - (skills.stillness || 0) * 0.01
    this.baseSpeed = this.level.speed * Math.max(0.1, speedMult)

    this.goldenBellChance = (skills.goldenBell || 0) * 0.01
    this.unityChance = (skills.unity || 0) * 0.01
    this.pursuitChance = (skills.pursuit || 0) * 0.01
    this.midasMult = 1 + (skills.midas || 0) * 0.02

    this.chargeCap = this.level.chargeNeed
    const startCharge = Math.floor(this.chargeCap * 0.05 * (skills.preemptive || 0))
    this.charge = clamp(startCharge, 0, this.chargeCap)
    this.chargeReady = this.charge >= this.chargeCap

    this.doubleCoin = !!opts.doubleActive

    this.theoreticalMax = this.level.target * this.initialWidthPoints

    // ---- 运行状态 ----
    this.status = 'playing' // playing | win | fail | reviveOffer
    this.floors = 0 // 已放置的真实楼层（不含地基）
    this.score = 0
    this.baseCoinSum = 0
    this.combo = 0
    this.maxCombo = 0
    this.currentWidth = this.initialWidthPx

    this.blocks = [] // {cx,width,index,kind,hue}
    // 地基
    this.blocks.push({ cx: LOGICAL_W / 2, width: this.initialWidthPx, index: 0, kind: 'base', hue: 210 })

    this.camOffset = TOWER_TOP_Y // 初始
    this.camTarget = TOWER_TOP_Y

    this.moving = null
    this.dropping = false
    this.dropElapsed = 0
    this.riseOffset = AIM_RISE

    this.autoQueue = [] // {kind:'flame'|'pursuit', t}
    this.autoSeqActive = false
    this.pendingPursuit = false

    this.slowRemaining = 0
    this.autoRemaining = 0
    this.aiCooldown = 0

    this.reviveOffered = false
    this.revivedThisGame = false

    // 特效
    this.particles = []
    this.floatTexts = []
    this.shake = 0
    this.flashPerfect = 0
    this.restorePulse = null // {y, life}
    this.stars = this._makeStarfield()
    this.clouds = this._makeClouds()
    this.time = 0
    this.winStars = 0
    this.moonLanded = false

    this._camInit()
    this._spawnMoving()
    this._emit()
  }

  // ---------------- 初始化辅助 ----------------
  _camInit() {
    const topIndex = this.blocks.length - 1
    this.camTarget = TOWER_TOP_Y + topIndex * BLOCK_H
    this.camOffset = this.camTarget
  }

  _makeStarfield() {
    const arr = []
    for (let i = 0; i < 80; i++) {
      arr.push({
        x: Math.random() * LOGICAL_W,
        wy: -Math.random() * this.level.target * BLOCK_H - 100,
        r: Math.random() * 1.6 + 0.4,
        tw: Math.random() * Math.PI * 2,
        speed: Math.random() * 2 + 1
      })
    }
    return arr
  }

  _makeClouds() {
    const arr = []
    for (let i = 0; i < 10; i++) {
      arr.push({
        x: Math.random() * LOGICAL_W,
        wy: -Math.random() * this.level.target * BLOCK_H * 0.55 - 60,
        s: Math.random() * 0.6 + 0.7,
        drift: (Math.random() - 0.5) * 8
      })
    }
    return arr
  }

  // ---------------- 坐标 ----------------
  worldY(index) {
    return -index * BLOCK_H
  }
  screenY(wy) {
    return wy + this.camOffset
  }

  _spawnMoving() {
    if (this.status !== 'playing') return
    const width = this.currentWidth
    const half = width / 2
    let minCx = Math.max(LOGICAL_W * 0.15, half + 6)
    let maxCx = Math.min(LOGICAL_W * 0.85, LOGICAL_W - half - 6)
    if (minCx >= maxCx) {
      minCx = maxCx = LOGICAL_W / 2
    }
    const index = this.blocks.length
    const startLeft = Math.random() < 0.5
    this.moving = {
      cx: startLeft ? minCx : maxCx,
      width,
      index,
      dir: startLeft ? 1 : -1,
      minCx,
      maxCx,
      hue: (200 + index * 9) % 360
    }
    this.riseOffset = AIM_RISE
    this.dropping = false
    this.aiCooldown = 0.35
    this.autoSeqActive = false
  }

  // ---------------- 输入 ----------------
  tap() {
    if (this.status !== 'playing') return
    if (this.dropping || this.autoSeqActive || !this.moving) return
    if (this.autoRemaining > 0) {
      // AI 接管期间点击只结束 AI，不落层
      this.autoRemaining = 0
      Audio.click()
      this._emit()
      return
    }
    this._startDrop('manual')
  }

  releaseFlame() {
    if (this.status !== 'playing') return
    if (!this.chargeReady || this.dropping || this.autoSeqActive) return
    this.charge = 0
    this.chargeReady = false
    // 隐藏当前待落方块，进入自动序列
    this.moving = null
    this.autoSeqActive = true
    this.autoQueue.push({ kind: 'flame', t: 0.05 })
    this.autoQueue.push({ kind: 'flame', t: 0.05 + FLAME_INTERVAL })
    this.autoQueue.push({ kind: 'flame', t: 0.05 + FLAME_INTERVAL * 2 })
    this._emit()
  }

  useSlow() {
    if (this.status !== 'playing') return false
    if (this.inv.slow <= 0) return false
    if (this.autoRemaining > 0) return false // 与自动卡互斥
    if (this.slowRemaining > 0) return false
    this.inv.slow--
    this.slowRemaining = SLOW_DURATION
    this.onInventoryChange('slow', this.inv.slow)
    Audio.skill()
    this._emit()
    return true
  }

  useAuto() {
    if (this.status !== 'playing') return false
    if (this.inv.auto <= 0) return false
    if (this.slowRemaining > 0) return false // 与慢慢卡互斥
    if (this.autoRemaining > 0) return false
    this.inv.auto--
    this.autoRemaining = AI_DURATION
    this.aiCooldown = 0.25
    this.onInventoryChange('auto', this.inv.auto)
    Audio.skill()
    this._emit()
    return true
  }

  acceptRevive() {
    if (this.status !== 'reviveOffer') return
    if (this.inv.revive <= 0) return
    this.inv.revive--
    this.revivedThisGame = true
    this.onInventoryChange('revive', this.inv.revive)
    this.currentWidth = this.initialWidthPx
    this.combo = 0
    this.status = 'playing'
    Audio.revive()
    this._spawnRestoreEffect()
    this._spawnMoving()
    this._emit()
  }

  declineRevive() {
    if (this.status !== 'reviveOffer') return
    this._doFail()
  }

  // ---------------- 落层流程 ----------------
  _startDrop(type) {
    this.dropping = true
    this.dropType = type
    this.dropElapsed = 0
  }

  _resolveDrop() {
    const type = this.dropType
    this.dropping = false
    this.riseOffset = 0
    const prev = this.blocks[this.blocks.length - 1]
    const mv = this.moving
    if (!mv) return
    const width = mv.width
    const offset = mv.cx - prev.cx
    const absOff = Math.abs(offset)

    let isPerfect = absOff <= this.perfectWindowPx
    // 心手合一：直接判定完美（仅玩家/AI 落层）
    if (!isPerfect && (type === 'manual' || type === 'ai') && Math.random() < this.unityChance) {
      isPerfect = true
    }

    let newWidth
    let newCx
    let failed = false
    let didCut = false
    let saved = false
    let cutSide = 0
    let cutAmount = 0

    if (isPerfect) {
      newWidth = prev.width
      newCx = prev.cx
    } else {
      const overlap = width - absOff
      // 免切判定：金钟罩概率 / 护盾卡
      let usedShield = false
      if (Math.random() < this.goldenBellChance) {
        saved = true
      } else if (this.inv.shield > 0) {
        saved = true
        usedShield = true
      }
      if (saved) {
        newWidth = prev.width
        newCx = prev.cx
        if (usedShield) {
          this.inv.shield--
          this.onInventoryChange('shield', this.inv.shield)
        }
        Audio.shield()
        this._spawnShieldEffect(prev.cx)
      } else if (overlap > 0) {
        didCut = true
        newWidth = overlap
        newCx = prev.cx + offset / 2
        cutSide = offset > 0 ? 1 : -1
        cutAmount = absOff
      } else {
        failed = true
      }
    }

    if (failed) {
      this._handleFail(mv)
      return
    }

    // 生成放置好的方块
    const placed = {
      cx: newCx,
      width: newWidth,
      index: mv.index,
      kind: isPerfect ? 'perfect' : saved ? 'shield' : 'normal',
      hue: mv.hue
    }
    this.blocks.push(placed)
    this.currentWidth = newWidth
    this.floors++

    // 切除碎片
    if (didCut) {
      this._spawnDebris(placed, cutSide, cutAmount)
      Audio.cut()
      this.shake = Math.max(this.shake, 6)
    }

    // 计分（玩家/AI）
    if (type === 'manual' || type === 'ai') {
      const points = newWidth / PX_PER_POINT
      this.score += points
      this.baseCoinSum += Math.floor(points / 10)
    }

    // 连击 / 充能（区分类型）
    if (type === 'manual') {
      this.charge = Math.min(this.chargeCap, this.charge + 1)
      if (this.charge >= this.chargeCap && !this.chargeReady) {
        this.chargeReady = true
        Audio.chargeReady()
      }
      if (isPerfect) {
        this.combo++
        this.maxCombo = Math.max(this.maxCombo, this.combo)
        Audio.perfect(this.combo)
        this._spawnPerfect(placed)
        this.flashPerfect = 0.35
        this._spawnFloat(placed.cx, `完美 x${this.combo}`, '#ffd54f')
        // 每 3 连击恢复宽度
        if (this.combo % 3 === 0) {
          this._applyRestore()
        }
      } else {
        Audio.drop()
        // 断连（连击保护卡）
        if (this.combo > 0) {
          if (this.inv.comboGuard > 0) {
            this.inv.comboGuard--
            this.onInventoryChange('comboGuard', this.inv.comboGuard)
            this._spawnFloat(placed.cx, '连击保护!', '#ffb74d')
          } else {
            this.combo = 0
          }
        }
      }
    } else if (type === 'ai') {
      // AI：连击冻结、无充能
      if (isPerfect) {
        Audio.perfect(1)
        this._spawnPerfect(placed)
      } else {
        Audio.drop()
      }
    }

    this._afterPlacement(type, isPerfect)
  }

  _afterPlacement(type, isPerfect) {
    if (this.floors >= this.level.target) {
      this._win()
      return
    }
    // 乘胜追击（仅玩家完美，且非自动层）
    if (type === 'manual' && isPerfect && Math.random() < this.pursuitChance) {
      this.pendingPursuit = true
    }
    if (this.pendingPursuit) {
      this.pendingPursuit = false
      this.moving = null
      this.autoSeqActive = true
      this.autoQueue.push({ kind: 'pursuit', t: 0.12 })
    }
    if (this.autoQueue.length > 0) {
      this.autoSeqActive = true
      this.moving = null
    } else {
      this._spawnMoving()
    }
    this._emit()
  }

  _placeAuto(kind) {
    if (this.status !== 'playing') return
    const prev = this.blocks[this.blocks.length - 1]
    const placed = {
      cx: prev.cx,
      width: this.currentWidth,
      index: this.blocks.length,
      kind,
      hue: kind === 'flame' ? 25 : 140
    }
    this.blocks.push(placed)
    this.floors++
    if (kind === 'flame') {
      Audio.flame(this.blocks.length % 3)
      this._spawnFlame(placed)
      this.shake = Math.max(this.shake, 4)
    } else {
      Audio.skill()
      this._spawnPerfect(placed, '#7cf29b')
      this._spawnFloat(placed.cx, '追击!', '#7cf29b')
    }
    if (this.floors >= this.level.target) {
      this._win()
    }
    this._emit()
  }

  _applyRestore() {
    const before = this.currentWidth
    this.currentWidth = Math.min(this.initialWidthPx, this.currentWidth + this.restoreAmountPx)
    if (this.currentWidth > before + 0.5) {
      Audio.restore()
      this._spawnRestoreEffect()
      this._spawnFloat(this.blocks[this.blocks.length - 1].cx, '宽度恢复', '#4ade80')
    }
  }

  _handleFail(mv) {
    // 触发坠落特效
    this._spawnFallingBlock(mv)
    this.shake = Math.max(this.shake, 12)
    if (this.inv.revive > 0 && !this.revivedThisGame && !this.reviveOffered) {
      this.reviveOffered = true
      this.status = 'reviveOffer'
      this.onReviveOffer()
      this._emit()
      return
    }
    this._doFail()
  }

  _win() {
    this.status = 'win'
    const rate = this.theoreticalMax > 0 ? this.score / this.theoreticalMax : 0
    const stars = rate >= 0.85 ? 3 : rate >= 0.7 ? 2 : 1
    this.winStars = stars
    const starMult = stars === 3 ? 1.5 : stars === 2 ? 1.2 : 1
    const finalCoins = Math.floor(this.baseCoinSum * this.midasMult * starMult * (this.doubleCoin ? 2 : 1))
    this.moving = null
    this.autoQueue = []
    this.autoSeqActive = false
    Audio.win()
    this._spawnConfetti()
    if (this.level.id === 6) this.moonLanded = true
    const result = {
      cleared: true,
      score: Math.round(this.score),
      theoreticalMax: Math.round(this.theoreticalMax),
      rate,
      stars,
      starMult,
      doubleCoin: this.doubleCoin,
      maxCombo: this.maxCombo,
      coins: finalCoins,
      baseCoins: Math.floor(this.baseCoinSum * this.midasMult),
      level: this.level
    }
    this._emit()
    this.onEnd(result)
  }

  _doFail() {
    this.status = 'fail'
    this.moving = null
    this.autoQueue = []
    this.autoSeqActive = false
    const finalCoins = Math.floor(this.baseCoinSum * this.midasMult * (this.doubleCoin ? 2 : 1))
    Audio.fail()
    const result = {
      cleared: false,
      score: Math.round(this.score),
      theoreticalMax: Math.round(this.theoreticalMax),
      rate: this.theoreticalMax > 0 ? this.score / this.theoreticalMax : 0,
      stars: 0,
      starMult: 1,
      doubleCoin: this.doubleCoin,
      maxCombo: this.maxCombo,
      coins: finalCoins,
      baseCoins: Math.floor(this.baseCoinSum * this.midasMult),
      level: this.level
    }
    this._emit()
    this.onEnd(result)
  }

  // ---------------- 更新 ----------------
  update(dt) {
    dt = clamp(dt, 0, 0.05) // 限制异常大的帧间隔
    this.time += dt

    // 相机跟随
    const topIndex = this.blocks.length - 1
    this.camTarget = TOWER_TOP_Y + topIndex * BLOCK_H
    this.camOffset = lerp(this.camOffset, this.camTarget, clamp(dt * 8, 0, 1))

    // 特效更新
    this._updateEffects(dt)

    if (this.status !== 'playing') {
      return
    }

    // 计时器
    if (this.slowRemaining > 0) {
      this.slowRemaining = Math.max(0, this.slowRemaining - dt)
      if (this.slowRemaining === 0) this._emit()
    }
    if (this.autoRemaining > 0) {
      this.autoRemaining = Math.max(0, this.autoRemaining - dt)
      if (this.autoRemaining === 0) this._emit()
    }
    if (this.aiCooldown > 0) this.aiCooldown -= dt

    // 自动序列（烈焰 / 追击）
    if (this.autoQueue.length > 0) {
      for (let i = 0; i < this.autoQueue.length; i++) this.autoQueue[i].t -= dt
      // 依次触发到时的
      while (this.autoQueue.length > 0 && this.autoQueue[0].t <= 0) {
        const item = this.autoQueue.shift()
        this._placeAuto(item.kind)
        if (this.status !== 'playing') {
          this.autoQueue = []
          break
        }
      }
      if (this.status === 'playing' && this.autoQueue.length === 0 && !this.moving) {
        this.autoSeqActive = false
        this._spawnMoving()
        this._emit()
      }
      return
    }

    // 落层动画
    if (this.dropping) {
      this.dropElapsed += dt
      const t = clamp(this.dropElapsed / DROP_TIME, 0, 1)
      this.riseOffset = AIM_RISE * (1 - easeInDrop(t))
      if (t >= 1) {
        this.riseOffset = 0
        this._resolveDrop()
      }
      return
    }

    // 瞄准：水平移动
    if (this.moving) {
      const speedMul = this.slowRemaining > 0 ? 0.5 : 1
      const spd = this.baseSpeed * speedMul
      this.moving.cx += this.moving.dir * spd * dt
      if (this.moving.cx <= this.moving.minCx) {
        this.moving.cx = this.moving.minCx
        this.moving.dir = 1
      } else if (this.moving.cx >= this.moving.maxCx) {
        this.moving.cx = this.moving.maxCx
        this.moving.dir = -1
      }

      // AI 接管：对齐即落
      if (this.autoRemaining > 0 && this.aiCooldown <= 0) {
        const prev = this.blocks[this.blocks.length - 1]
        const aimWin = Math.max(this.perfectWindowPx * 0.7, 5)
        if (Math.abs(this.moving.cx - prev.cx) <= aimWin) {
          this._startDrop('ai')
        }
      }
    }
  }

  _updateEffects(dt) {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40)
    if (this.flashPerfect > 0) this.flashPerfect = Math.max(0, this.flashPerfect - dt)
    const g = 900
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life -= dt
      if (p.life <= 0) {
        this.particles.splice(i, 1)
        continue
      }
      if (p.gravity) p.vy += g * dt
      p.wx += p.vx * dt
      p.wy += p.vy * dt
      if (p.spin != null) p.rot += p.spin * dt
    }
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const f = this.floatTexts[i]
      f.life -= dt
      f.wy -= 30 * dt
      if (f.life <= 0) this.floatTexts.splice(i, 1)
    }
    if (this.restorePulse) {
      this.restorePulse.life -= dt
      if (this.restorePulse.life <= 0) this.restorePulse = null
    }
    // 星星闪烁
    for (const s of this.stars) s.tw += dt * s.speed
    for (const c of this.clouds) c.x += c.drift * dt
    // 坠落方块
    if (this.fallingBlock) {
      this.fallingBlock.vy += g * dt
      this.fallingBlock.wy += this.fallingBlock.vy * dt
      this.fallingBlock.rot += this.fallingBlock.spin * dt
      this.fallingBlock.life -= dt
      if (this.fallingBlock.life <= 0) this.fallingBlock = null
    }
  }

  // ---------------- 特效生成 ----------------
  _spawnDebris(block, side, amount) {
    const wy = this.worldY(block.index)
    const x = side > 0 ? block.cx + block.width / 2 : block.cx - block.width / 2
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        wx: x + (Math.random() - 0.5) * amount,
        wy: wy + Math.random() * BLOCK_H,
        vx: side * (30 + Math.random() * 90),
        vy: -Math.random() * 60,
        life: 0.9,
        maxLife: 0.9,
        size: 3 + Math.random() * 4,
        color: `hsl(${block.hue},60%,60%)`,
        gravity: true,
        rot: 0,
        spin: (Math.random() - 0.5) * 12
      })
    }
  }

  _spawnPerfect(block, color = '#ffe082') {
    const wy = this.worldY(block.index) + BLOCK_H / 2
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.3
      const sp = 60 + Math.random() * 120
      this.particles.push({
        wx: block.cx + (Math.random() - 0.5) * block.width,
        wy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.6,
        maxLife: 0.6,
        size: 2 + Math.random() * 3,
        color,
        gravity: false
      })
    }
  }

  _spawnFlame(block) {
    const wy = this.worldY(block.index)
    for (let i = 0; i < 18; i++) {
      this.particles.push({
        wx: block.cx + (Math.random() - 0.5) * block.width,
        wy: wy + Math.random() * BLOCK_H,
        vx: (Math.random() - 0.5) * 60,
        vy: -80 - Math.random() * 120,
        life: 0.7,
        maxLife: 0.7,
        size: 3 + Math.random() * 5,
        color: `hsl(${18 + Math.random() * 25},100%,${55 + Math.random() * 15}%)`,
        gravity: false
      })
    }
  }

  _spawnShieldEffect(cx) {
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16
      this.particles.push({
        wx: cx + Math.cos(a) * 20,
        wy: this.worldY(this.blocks.length - 1) + BLOCK_H / 2 + Math.sin(a) * 20,
        vx: Math.cos(a) * 50,
        vy: Math.sin(a) * 50,
        life: 0.5,
        maxLife: 0.5,
        size: 3,
        color: '#4dd0e1',
        gravity: false
      })
    }
  }

  _spawnRestoreEffect() {
    const top = this.blocks[this.blocks.length - 1]
    this.restorePulse = { wy: this.worldY(top.index) + BLOCK_H / 2, cx: top.cx, life: 0.6, maxLife: 0.6 }
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1
      this.particles.push({
        wx: top.cx + side * top.width / 2,
        wy: this.worldY(top.index) + BLOCK_H / 2,
        vx: side * (60 + Math.random() * 80),
        vy: (Math.random() - 0.5) * 40,
        life: 0.6,
        maxLife: 0.6,
        size: 3 + Math.random() * 3,
        color: '#4ade80',
        gravity: false
      })
    }
  }

  _spawnConfetti() {
    for (let i = 0; i < 60; i++) {
      this.particles.push({
        wx: Math.random() * LOGICAL_W,
        wy: this.worldY(this.blocks.length - 1) - Math.random() * 300,
        vx: (Math.random() - 0.5) * 120,
        vy: Math.random() * 60 + 20,
        life: 1.6,
        maxLife: 1.6,
        size: 4 + Math.random() * 5,
        color: `hsl(${Math.random() * 360},90%,60%)`,
        gravity: true,
        rot: Math.random() * 6,
        spin: (Math.random() - 0.5) * 10
      })
    }
  }

  _spawnFloat(cx, text, color) {
    this.floatTexts.push({ cx, wy: this.worldY(this.blocks.length - 1), text, color, life: 1.1, maxLife: 1.1 })
  }

  _spawnFallingBlock(mv) {
    this.fallingBlock = {
      cx: mv.cx,
      wy: this.worldY(mv.index),
      width: mv.width,
      vy: 40,
      rot: 0,
      spin: (Math.random() - 0.5) * 6,
      hue: mv.hue,
      life: 2
    }
    this.moving = null
  }

  // ---------------- 状态广播 ----------------
  _emit() {
    this.onState({
      status: this.status,
      floors: this.floors,
      target: this.level.target,
      score: Math.round(this.score),
      theoreticalMax: Math.round(this.theoreticalMax),
      coins: Math.floor(this.baseCoinSum * this.midasMult),
      combo: this.combo,
      maxCombo: this.maxCombo,
      charge: this.charge,
      chargeCap: this.chargeCap,
      chargeReady: this.chargeReady,
      slowRemaining: Math.ceil(this.slowRemaining),
      autoRemaining: Math.ceil(this.autoRemaining),
      slowActive: this.slowRemaining > 0,
      autoActive: this.autoRemaining > 0,
      inv: { ...this.inv },
      levelName: this.level.name,
      levelId: this.level.id,
      shieldEquipped: this.inv.shield > 0,
      comboGuardEquipped: this.inv.comboGuard > 0
    })
  }

  // ---------------- 渲染 ----------------
  render(ctx) {
    const p = clamp(this.floors / this.level.target, 0, 1)
    ctx.save()
    // 震动
    let sx = 0
    let sy = 0
    if (this.shake > 0) {
      sx = (Math.random() - 0.5) * this.shake
      sy = (Math.random() - 0.5) * this.shake
    }
    ctx.translate(sx, sy)

    this._drawBackground(ctx, p)
    this._drawTower(ctx)
    this._drawEffects(ctx)

    if (this.flashPerfect > 0) {
      ctx.fillStyle = `rgba(255,236,150,${this.flashPerfect * 0.35})`
      ctx.fillRect(-20, -20, LOGICAL_W + 40, LOGICAL_H + 40)
    }
    ctx.restore()
  }

  _bgPalette(p) {
    const dark = this.theme === 'dark'
    // 关键帧：地面 → 云层 → 黄昏 → 星空 → 深空 → 月球
    const kfLight = [
      { p: 0, top: [120, 195, 255], bot: [205, 235, 255] },
      { p: 0.2, top: [140, 190, 245], bot: [225, 240, 255] },
      { p: 0.4, top: [120, 120, 200], bot: [250, 180, 170] },
      { p: 0.6, top: [70, 70, 150], bot: [120, 100, 190] },
      { p: 0.8, top: [40, 40, 95], bot: [70, 60, 130] },
      { p: 1, top: [18, 20, 55], bot: [45, 45, 90] }
    ]
    const kfDark = [
      { p: 0, top: [40, 70, 130], bot: [70, 110, 170] },
      { p: 0.2, top: [45, 65, 120], bot: [80, 100, 150] },
      { p: 0.4, top: [50, 45, 100], bot: [110, 70, 90] },
      { p: 0.6, top: [35, 35, 85], bot: [60, 50, 110] },
      { p: 0.8, top: [22, 22, 60], bot: [40, 35, 80] },
      { p: 1, top: [10, 12, 35], bot: [25, 25, 55] }
    ]
    const kf = dark ? kfDark : kfLight
    let a = kf[0]
    let b = kf[kf.length - 1]
    for (let i = 0; i < kf.length - 1; i++) {
      if (p >= kf[i].p && p <= kf[i + 1].p) {
        a = kf[i]
        b = kf[i + 1]
        break
      }
    }
    const t = (p - a.p) / Math.max(0.0001, b.p - a.p)
    const mix = (c1, c2) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]
    const top = mix(a.top, b.top)
    const bot = mix(a.bot, b.bot)
    return {
      top: `rgb(${top.map(Math.round).join(',')})`,
      bot: `rgb(${bot.map(Math.round).join(',')})`,
      starAlpha: clamp((p - 0.28) / 0.5, 0, 1),
      cloudAlpha: clamp(1 - Math.abs(p - 0.25) / 0.3, 0, 1)
    }
  }

  _drawBackground(ctx, p) {
    const pal = this._bgPalette(p)
    const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H)
    grad.addColorStop(0, pal.top)
    grad.addColorStop(1, pal.bot)
    ctx.fillStyle = grad
    ctx.fillRect(-20, -20, LOGICAL_W + 40, LOGICAL_H + 40)

    // 星星
    if (pal.starAlpha > 0.02) {
      for (const s of this.stars) {
        const sy = this.screenY(s.wy)
        if (sy < -10 || sy > LOGICAL_H + 10) continue
        const tw = 0.5 + 0.5 * Math.sin(s.tw)
        ctx.globalAlpha = pal.starAlpha * tw
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(s.x, sy, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // 月亮：接近顶部时出现
    this._drawMoon(ctx, p)

    // 云层
    if (pal.cloudAlpha > 0.02) {
      for (const c of this.clouds) {
        const sy = this.screenY(c.wy)
        if (sy < -60 || sy > LOGICAL_H + 60) continue
        ctx.globalAlpha = pal.cloudAlpha * 0.85
        this._drawCloud(ctx, c.x, sy, c.s)
      }
      ctx.globalAlpha = 1
    }

    // 地面
    const groundWy = this.worldY(0) + BLOCK_H
    const gy = this.screenY(groundWy)
    if (gy < LOGICAL_H + 200) {
      const gGrad = ctx.createLinearGradient(0, gy, 0, gy + 300)
      const dark = this.theme === 'dark'
      gGrad.addColorStop(0, dark ? '#3a5f3a' : '#7ec87e')
      gGrad.addColorStop(1, dark ? '#25401f' : '#4e9a4e')
      ctx.fillStyle = gGrad
      ctx.fillRect(-20, gy, LOGICAL_W + 40, LOGICAL_H + 40 - gy + 20)
      // 草地高光
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.18)'
      ctx.fillRect(-20, gy, LOGICAL_W + 40, 6)
    }
  }

  _drawCloud(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.beginPath()
    ctx.ellipse(x, y, 42 * s, 22 * s, 0, 0, Math.PI * 2)
    ctx.ellipse(x - 34 * s, y + 6 * s, 26 * s, 16 * s, 0, 0, Math.PI * 2)
    ctx.ellipse(x + 34 * s, y + 6 * s, 30 * s, 18 * s, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  _drawMoon(ctx, p) {
    // 月亮世界坐标在塔顶之上
    const moonWy = this.worldY(this.level.target) - 160
    const my = this.screenY(moonWy)
    if (my > LOGICAL_H + 120 || my < -260) return
    const appear = clamp((p - 0.45) / 0.4, 0, 1)
    if (appear <= 0.02) return
    const r = 60 + appear * 24
    const cx = LOGICAL_W * 0.72
    ctx.save()
    ctx.globalAlpha = appear
    // 光晕
    const glow = ctx.createRadialGradient(cx, my, r * 0.6, cx, my, r * 2)
    glow.addColorStop(0, 'rgba(255,245,200,0.5)')
    glow.addColorStop(1, 'rgba(255,245,200,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, my, r * 2, 0, Math.PI * 2)
    ctx.fill()
    // 月球本体
    const mg = ctx.createRadialGradient(cx - r * 0.3, my - r * 0.3, r * 0.2, cx, my, r)
    mg.addColorStop(0, '#fff9e6')
    mg.addColorStop(1, '#e6d9a8')
    ctx.fillStyle = mg
    ctx.beginPath()
    ctx.arc(cx, my, r, 0, Math.PI * 2)
    ctx.fill()
    // 环形山
    ctx.fillStyle = 'rgba(180,165,120,0.5)'
    const craters = [
      [-0.3, -0.2, 0.18],
      [0.25, 0.1, 0.22],
      [0.05, 0.4, 0.14],
      [-0.4, 0.3, 0.1],
      [0.4, -0.35, 0.12]
    ]
    for (const [dx, dy, cr] of craters) {
      ctx.beginPath()
      ctx.arc(cx + dx * r, my + dy * r, cr * r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  _blockColors(block) {
    const dark = this.theme === 'dark'
    if (block.kind === 'base') {
      return dark ? ['#6b7a99', '#465066'] : ['#9fb0cc', '#6d7d9c']
    }
    if (block.kind === 'flame') {
      return ['#ffb347', '#ff6a2b']
    }
    if (block.kind === 'pursuit') {
      return ['#8ef5a8', '#39c46a']
    }
    if (block.kind === 'perfect') {
      const h = block.hue
      return [`hsl(${h},75%,72%)`, `hsl(${h},70%,52%)`]
    }
    const h = block.hue
    const l = dark ? 55 : 65
    return [`hsl(${h},60%,${l}%)`, `hsl(${h},55%,${l - 18}%)`]
  }

  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  _drawBlock(ctx, cx, screenTopY, width, block, extra = {}) {
    const x = cx - width / 2
    const y = screenTopY
    const [c1, c2] = this._blockColors(block)
    const grad = ctx.createLinearGradient(0, y, 0, y + BLOCK_H)
    grad.addColorStop(0, c1)
    grad.addColorStop(1, c2)
    ctx.fillStyle = grad
    // 阴影
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.25)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 3
    this._roundRect(ctx, x, y, width, BLOCK_H, 7)
    ctx.fill()
    ctx.restore()
    // 描边
    ctx.lineWidth = 2
    ctx.strokeStyle = block.kind === 'perfect' ? 'rgba(255,224,130,0.95)' : 'rgba(255,255,255,0.35)'
    this._roundRect(ctx, x, y, width, BLOCK_H, 7)
    ctx.stroke()
    // 顶部高光
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    this._roundRect(ctx, x + 3, y + 3, Math.max(0, width - 6), 6, 3)
    ctx.fill()

    // 火焰包边
    if (block.kind === 'flame') {
      const flick = 0.6 + 0.4 * Math.sin(this.time * 20 + cx)
      ctx.strokeStyle = `rgba(255,140,40,${flick})`
      ctx.lineWidth = 3
      this._roundRect(ctx, x - 1, y - 1, width + 2, BLOCK_H + 2, 8)
      ctx.stroke()
    }
  }

  _drawTower(ctx) {
    // 已放置方块
    for (const b of this.blocks) {
      const wy = this.worldY(b.index)
      const sy = this.screenY(wy)
      if (sy < -BLOCK_H - 10 || sy > LOGICAL_H + 20) continue
      this._drawBlock(ctx, b.cx, sy, b.width, b)
    }

    // 坠落方块
    if (this.fallingBlock) {
      const fb = this.fallingBlock
      const sy = this.screenY(fb.wy)
      ctx.save()
      ctx.translate(fb.cx, sy + BLOCK_H / 2)
      ctx.rotate(fb.rot)
      ctx.globalAlpha = clamp(fb.life, 0, 1)
      this._drawBlock(ctx, 0, -BLOCK_H / 2, fb.width, { kind: 'normal', hue: fb.hue })
      ctx.restore()
      ctx.globalAlpha = 1
    }

    // 待落方块
    if (this.moving && this.status === 'playing') {
      const wy = this.worldY(this.moving.index)
      const sy = this.screenY(wy) - this.riseOffset
      this._drawBlock(ctx, this.moving.cx, sy, this.moving.width, this.moving)
      // 落点指示线
      const prev = this.blocks[this.blocks.length - 1]
      ctx.save()
      ctx.globalAlpha = 0.25
      ctx.strokeStyle = '#ffffff'
      ctx.setLineDash([4, 6])
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(prev.cx, sy + BLOCK_H)
      ctx.lineTo(prev.cx, this.screenY(this.worldY(prev.index)))
      ctx.stroke()
      ctx.restore()
    }
  }

  _drawEffects(ctx) {
    // 恢复脉冲
    if (this.restorePulse) {
      const rp = this.restorePulse
      const t = 1 - rp.life / rp.maxLife
      const sy = this.screenY(rp.wy)
      ctx.save()
      ctx.globalAlpha = rp.life / rp.maxLife
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(rp.cx, sy, 40 + t * 120, 16 + t * 30, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    // 粒子
    for (const p of this.particles) {
      const sy = this.screenY(p.wy)
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1)
      ctx.fillStyle = p.color
      if (p.rot != null) {
        ctx.save()
        ctx.translate(p.wx, sy)
        ctx.rotate(p.rot)
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        ctx.restore()
      } else {
        ctx.beginPath()
        ctx.arc(p.wx, sy, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1

    // 浮动文字
    ctx.textAlign = 'center'
    for (const f of this.floatTexts) {
      const sy = this.screenY(f.wy)
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1)
      ctx.font = 'bold 20px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillText(f.text, f.cx + 1, sy + 1)
      ctx.fillStyle = f.color
      ctx.fillText(f.text, f.cx, sy)
    }
    ctx.globalAlpha = 1
    ctx.textAlign = 'start'
  }

  destroy() {
    this.particles = []
    this.floatTexts = []
    this.blocks = []
    this.moving = null
    this.autoQueue = []
  }
}
