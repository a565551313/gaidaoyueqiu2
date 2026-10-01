// 游戏引擎：Canvas 2D 绘制、运动、碰撞、计分、充能与特效。
// 逻辑画布 420 × 720。外部（GameView）负责 requestAnimationFrame 循环，
// 每帧调用 engine.update(dt) 与 engine.render(ctx)，并在合适时机 destroy。

import { Audio } from './audio.js'
import { WeatherSystem } from './weather.js'
import { Scenery } from './scenery.js'
import { getMaterial } from '../data/materials.js'
import { getFloorArt, WINDOW_SRC } from './floorTextures.js'
import { AttackSystem } from './attackSystem.js'
import { durabilityForWidth } from '../data/attacks.js'

const SPRITE_URLS = {
  bird: '/assets/sprites/enemy-bird.svg',
  plane: '/assets/sprites/enemy-plane.svg',
  ufo: '/assets/sprites/enemy-ufo.svg'
}
const SPRITE_CACHE = new Map()
function enemySprite(type) {
  if (!SPRITE_URLS[type] || typeof Image === 'undefined') return null
  if (!SPRITE_CACHE.has(type)) {
    const image = new Image()
    image.src = SPRITE_URLS[type]
    SPRITE_CACHE.set(type, image)
  }
  const image = SPRITE_CACHE.get(type)
  return image.complete && image.naturalWidth ? image : null
}

export const LOGICAL_W = 420
export const LOGICAL_H = 720

const BLOCK_H = 28
const TOWER_TOP_Y = 330 // 顶部楼层在屏幕上的目标位置
const GROUND_BASE_Y = TOWER_TOP_Y + BLOCK_H // 开局时地平线在屏幕上的 y（视差基准线）
const AIM_RISE = 170 // 待落方块在瞄准时高出落点的距离
const PX_PER_POINT = 1.2 // 100 宽度点 = 120 逻辑像素
const DROP_TIME = 0.13 // 落层动画时长（秒）
const FLAME_INTERVAL = 0.22
const AI_DURATION = 10
const SLOW_DURATION = 10

// ---------------- 连击宽度恢复 ----------------
// 每 3 次连续完美触发一次恢复，恢复量随连击档位递进：
// 3 连击 +10%、6 连击 +20%、9 连击 +30%……达到上限后不再增加。
// 百分比相对“本局初始宽度”，所以加宽卡/磐石根基会同步放大恢复量。
const RESTORE_STEP = 0.1 // 每档恢复比例
const RESTORE_MAX = 0.4 // 单次恢复上限比例
const RESTORE_COMBO_STEP = 3 // 每多少次连续完美触发一次

// ---------------- 高空晃动 ----------------
// 本局进度 p 超过 SWAY_START_P 后楼体开始晃动，到 p=1 达到最大摆幅。
const SWAY_START_P = 0.3
const SWAY_MAX_AMP = 7 // 基准最大摆幅（逻辑像素），再乘关卡 sway 系数
const SWAY_PERIOD = 2.2 // 基准摆动周期（秒），越高越快
const SWAY_LAG = 0.06 // 相邻楼层间的相位滞后（鞭式波动感）

// ---------------- 捣乱飞行物 ----------------
// r 为碰撞半径（点击判定再放宽 1.6 倍照顾手指）；hover 为相对楼顶的高度偏移。
// life 为主动捣乱时长（秒），0 表示一次性穿越（小鸟/客机），到点自动离场。
const ENEMY_DEFS = {
  bird: { name: '飞鸟', r: 15, hp: 1, coins: 2, speed: 105, hover: 150, life: 0 },
  eagle: { name: '老鹰', r: 24, hp: 2, coins: 3, speed: 0, hover: 180, life: 9 },
  drone: { name: '无人机', r: 19, hp: 2, coins: 3, speed: 0, hover: 215, life: 9 },
  plane: { name: '客机', r: 30, hp: 3, coins: 4, speed: 160, hover: 165, life: 0 },
  ufo: { name: 'UFO', r: 26, hp: 3, coins: 5, speed: 0, hover: 150, life: 10 }
}
// 各类型解锁的本局进度阈值（关卡 enemyShift 会整体提前）
const ENEMY_UNLOCK = { bird: 0.12, eagle: 0.3, drone: 0.42, plane: 0.55, ufo: 0.7 }
const ENEMY_WEIGHTS = { bird: 3, eagle: 2.2, drone: 2.2, plane: 2, ufo: 2.4 }
const ENEMY_MAX_ACTIVE = 2 // 同屏最多
const UFO_BEAM_DRAIN = 3.5 // 牵引光束每秒吸取的楼顶宽度（像素）
const UFO_BEAM_FLOOR = 25 // 吸到这个宽度就收手（不会直接吸死玩家）

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
    this.destroyed = false
    this.level = opts.level
    this.theme = opts.theme || 'light'
    this.material = getMaterial(opts.material)
    const materialEffects = this.material.effects || {}
    this.antiSlip = materialEffects.antiSlip || 0
    this.antiWind = materialEffects.antiWind || 0
    this.antiBreak = materialEffects.antiBreak || 0
    this.lightningMaxFloors = materialEffects.lightningMaxFloors || 5
    // 让落层/切除音效使用当前建筑材质的音色
    Audio.setMaterial(this.material.id)
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
    this.perfectWindowPx = 10 * (1 + (skills.insight || 0) * 0.01)

    const speedMult = 1 - (skills.stillness || 0) * 0.01
    this.baseSpeed = this.level.speed * Math.max(0.1, speedMult)

    // 高空晃动幅度：基础值 × 关卡系数，「以静制动」每级再降 8%（封顶 40%）
    const stillSwayReduce = Math.min(0.4, (skills.stillness || 0) * 0.08)
    this.swayMaxAmp = SWAY_MAX_AMP * (this.level.sway || 1) * (1 - stillSwayReduce)

    this.goldenBellChance = (skills.goldenBell || 0) * 0.01
    this.unityChance = (skills.unity || 0) * 0.01
    this.pursuitChance = (skills.pursuit || 0) * 0.01
    this.midasMult = 1 + (skills.midas || 0) * 0.02

    this.chargeCap = this.level.chargeNeed
    const preemptiveLv = skills.preemptive || 0
    const rawStartCharge = Math.floor(this.chargeCap * 0.05 * preemptiveLv)
    // 避免低关卡/低等级因向下取整长期显示为 0，升级后至少能看到 1 点开局充能。
    const startCharge = preemptiveLv > 0 ? Math.max(1, rawStartCharge) : 0
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
    const baseDurability = durabilityForWidth(this.initialWidthPx, this.material.id)
    this.blocks.push({ cx: LOGICAL_W / 2, width: this.initialWidthPx, index: 0, kind: 'base', hue: 210, maxDurability: baseDurability, durability: baseDurability, damageState: 1 })

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
    // 切片特效：被切下的整块板、切口闪光、白闪
    this.cutSlabs = []
    this.cutFx = []
    this.flashCut = 0
    this.restorePulse = null // {y, life}
    this.stars = this._makeStarfield()
    this.clouds = this._makeClouds()
    // 山体 / 建筑 / 植物的多层视差装饰，随高度逐渐淡出
    this.scenery = new Scenery(this)
    this.time = 0
    this.winStars = 0
    this.moonLanded = false

    // 高空晃动（楼体鞭式摆动，影响判定）
    this.swayPhase = Math.random() * Math.PI * 2
    this.creakT = 4 // 吱呀声计时

    // 捣乱飞行物
    this.enemies = []
    this.enemyTimer = 3.5
    this.enemyHintShown = false
    this.attackSystem = new AttackSystem(this)

    // 高空天气系统（大风/暴雨/冰雹/乌云/雷暴）
    this.weather = new WeatherSystem(this)

    // 战斗曲强度（随高度推进 0/1/2）
    this._battleIntensity = -1

    this._camInit()
    this._spawnMoving()
    this._updateBattleIntensity()
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
        // 云保持在高空，不要贴着地平线糊在城市/山脉上
        wy: -230 - Math.random() * this.level.target * BLOCK_H * 0.55,
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
  // 地平线在屏幕上的 y
  groundScreenY() {
    return this.screenY(this.worldY(0) + BLOCK_H)
  }
  // 视差基准线：系数 f=1 等于真实地面，f 越小移动越慢（越远）
  parallaxBase(f) {
    return GROUND_BASE_Y + (this.groundScreenY() - GROUND_BASE_Y) * f
  }

  // ---------------- 高空晃动 ----------------
  // 楼体鞭式摆动：底部固定，越往上摆幅越大。
  // 摆动同时参与判定（楼顶的实际位置 = 逻辑位置 + 摆动偏移），
  // 玩家需要等楼体荡回原位时再点击。落块动画期间冻结摆动相位，
  // 保证“看到的位置 = 最终判定位置”，绝对公平。
  _swayProgress() {
    const p = clamp(this.floors / this.level.target, 0, 1)
    return clamp((p - SWAY_START_P) / (1 - SWAY_START_P), 0, 1)
  }

  swayAmp() {
    const wm = this.weather ? this.weather.swayMult() : 1
    return this.swayMaxAmp * this._swayProgress() * wm
  }

  // 第 index 层当前的水平摆动偏移
  swayOffset(index) {
    const topIndex = this.blocks.length - 1
    if (index <= 0 || topIndex <= 0) return 0
    const amp = this.swayAmp()
    if (amp <= 0.01) return 0
    const t = Math.min(1, index / topIndex)
    return amp * Math.pow(t, 1.7) * Math.sin(this.swayPhase - index * SWAY_LAG)
  }

  // 战斗曲三段强度：起飞(0) / 交战(1) / 冲刺(2)，与天空、晃动、敌人节奏同步
  _updateBattleIntensity() {
    const p = clamp(this.floors / this.level.target, 0, 1)
    const v = p >= 0.7 ? 2 : p >= 0.35 ? 1 : 0
    if (v !== this._battleIntensity) {
      this._battleIntensity = v
      Audio.setBattleIntensity(v)
    }
  }

  // 轻推移动中的方块（小鸟啄 / 客机气流），钳制在往返范围内
  _nudgeMoving(dx) {
    const mv = this.moving
    if (!mv) return
    mv.cx = clamp(mv.cx + dx, mv.minCx, mv.maxCx)
  }

  _initBlockDurability(block) {
    const max = durabilityForWidth(block.width, this.material.id)
    block.maxDurability = max
    block.durability = max
    block.damageState = 1
    block.damageFlash = 0
    block.attackProgress = 0
    return block
  }

  collapseFrom(index, source = 'damage') {
    if (this.status !== 'playing') return
    const pos = this.blocks.findIndex((b) => b.index === index)
    if (pos <= 0) return
    const falling = this.blocks.slice(pos)
    this.blocks.splice(pos)
    if (this.attackSystem) this.attackSystem.remapAfterTowerChange(index)
    for (const block of falling) {
      this._spawnDebris(block, 1, Math.max(8, block.width * 0.28))
    }
    this.blocks.forEach((block, i) => { block.index = i })
    this.floors = Math.max(0, this.blocks.length - 1)
    const top = this.blocks[this.blocks.length - 1]
    this.currentWidth = top ? top.width : this.initialWidthPx
    this.moving = null
    this.autoQueue = []
    this.autoSeqActive = false
    this.shake = Math.max(this.shake, source === 'ufo' ? 10 : 14)
    this.flashCut = 0.28
    this._spawnFloat(top ? top.cx : LOGICAL_W / 2, '楼体坍塌!', '#ff7b67')
    if (this.blocks.length <= 1) {
      this._handleFail({ cx: LOGICAL_W / 2, index: 1, width: this.initialWidthPx, hue: 210 })
    } else this._spawnMoving()
    this._emit()
  }

  removeAttackLayer(index, source = 'ufo') {
    const pos = this.blocks.findIndex((b) => b.index === index)
    if (pos <= 0) return
    const removed = this.blocks.splice(pos, 1)[0]
    if (this.attackSystem) this.attackSystem.remapAfterTowerChange(index)
    if (removed) this._spawnDebris(removed, 1, Math.max(8, removed.width * 0.45))
    this.blocks.forEach((block, i) => { block.index = i })
    this.floors = Math.max(0, this.blocks.length - 1)
    const top = this.blocks[this.blocks.length - 1]
    this.currentWidth = top ? top.width : this.initialWidthPx
    // Removing a middle layer invalidates the old moving block index. Rebuild
    // it from the new contiguous tower so the next placement cannot overlap.
    this.moving = null
    this.dropping = false
    this.autoQueue = []
    this.autoSeqActive = false
    this.camTarget = TOWER_TOP_Y + Math.max(0, this.blocks.length - 1) * BLOCK_H
    this.camOffset = this.camTarget
    this.shake = Math.max(this.shake, source === 'ufo' ? 8 : 5)
    if (this.status === 'playing') this._spawnMoving()
    this._emit()
  }

  // ---------------- 捣乱飞行物 ----------------

  // 生成节奏：随本局进度缩短间隔，关卡 enemyRate 再作缩放。
  _trySpawnEnemy() {
    const p = clamp(this.floors / this.level.target, 0, 1)
    const shift = this.level.enemyShift || 0
    if (this.autoSeqActive || !this.moving) {
      this.enemyTimer = 2.5
      return
    }
    const actives = this.enemies.filter((e) => e.state !== 'flee')
    if (actives.length >= ENEMY_MAX_ACTIVE) {
      this.enemyTimer = 3
      return
    }
    const pool = Object.keys(ENEMY_DEFS).filter((t) => p >= Math.max(0, ENEMY_UNLOCK[t] - shift))
    if (pool.length === 0) {
      this.enemyTimer = 2
      return
    }
    // 尽量避免同屏出现两只同类型
    let cand = pool
    if (actives.length > 0) {
      const exist = new Set(actives.map((e) => e.type))
      const filtered = pool.filter((t) => !exist.has(t))
      if (filtered.length > 0) cand = filtered
    }
    let total = 0
    for (const t of cand) total += ENEMY_WEIGHTS[t]
    let r = Math.random() * total
    let type = cand[0]
    for (const t of cand) {
      r -= ENEMY_WEIGHTS[t]
      if (r <= 0) {
        type = t
        break
      }
    }

    const def = ENEMY_DEFS[type]
    const topIndex = this.blocks.length - 1
    const dir = Math.random() < 0.5 ? 1 : -1
    const e = {
      type,
      def,
      hp: def.hp,
      maxHp: def.hp,
      state: 'warn', // warn: 入场警示 → active: 捣乱中 → flee: 离场
      t: 0,
      hitFlash: 0,
      dir,
      side: Math.random() < 0.5 ? -1 : 1, // 老鹰悬停侧 / 风向
      x: dir > 0 ? -50 : LOGICAL_W + 50,
      wy: this.worldY(topIndex) - def.hover,
      vx: 0,
      vy: 0,
      bob: Math.random() * Math.PI * 2,
      knocked: false, // 一次性冲撞是否已触发
      arrived: false, // 是否已到达悬停位（老鹰/无人机登场提示用）
      beamOn: false,
      beamT: 0,
      streakT: 0
    }
    if (type === 'ufo') {
      // UFO 从画面上方降临
      e.x = LOGICAL_W / 2 + (Math.random() - 0.5) * 120
      e.wy = this.worldY(topIndex) - 460
    }
    this.enemies.push(e)
    Audio.enemyCue(type)

    if (!this.enemyHintShown) {
      this.enemyHintShown = true
      const top = this.blocks[topIndex]
      this._spawnFloat(top.cx, '点击捣乱者击退!', '#ffab40')
    }

    const base = 11 - 4.5 * p // 越到后期越频繁
    this.enemyTimer = base * (this.level.enemyRate || 1) + Math.random() * 2
  }

  // 汇总敌人对移动方块的影响：老鹰持续风压 + 无人机速度紊乱
  _enemyModifiers() {
    let windX = 0
    let speedMod = 1
    for (const e of this.enemies) {
      if (e.state !== 'active' || e.t < 1) continue
      if (e.type === 'eagle') {
        windX += -e.side * 38 // 把方块往远离老鹰的方向推
      } else if (e.type === 'drone') {
        speedMod *= 1 + 0.45 * Math.sin(this.time * 3.2 + e.bob)
      }
    }
    if (this.weather) {
      const w = this.weather.modifiers()
      windX += w.windX
      speedMod *= w.speedMod
    }
    // 钢材的抗风效果同时削弱强风天气与会吹偏方块的飞行物。
    windX *= 1 - this.antiWind
    return { windX, speedMod }
  }

  _updateEnemies(dt) {
    this.enemyTimer -= dt
    if (this.enemyTimer <= 0) this._trySpawnEnemy()

    const topIndex = this.blocks.length - 1
    const top = this.blocks[topIndex]
    const topCx = top ? top.cx + this.swayOffset(topIndex) : LOGICAL_W / 2

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]
      e.t += dt
      if (e.hitFlash > 0) e.hitFlash -= dt

      if (e.state === 'warn') {
        if (e.t >= 0.75) {
          e.state = 'active'
          e.t = 0
        }
        continue
      }

      if (e.state === 'flee') {
        e.x += e.vx * dt
        e.wy += e.vy * dt
        const sy = this.screenY(e.wy)
        if (e.x < -90 || e.x > LOGICAL_W + 90 || sy < -90 || sy > LOGICAL_H + 90) {
          this.enemies.splice(i, 1)
        }
        continue
      }

      // ---- active：各类型行为 ----
      if (e.type === 'bird' || e.type === 'plane') {
        // 直线穿越，经过移动方块时给一下冲撞
        e.x += e.dir * e.def.speed * dt
        if (e.type === 'bird') {
          e.wy = this.worldY(topIndex) - e.def.hover + Math.sin(this.time * 3 + e.bob) * 10
        }
        if (!e.knocked && !this.dropping && this.moving && Math.abs(e.x - this.moving.cx) < (e.type === 'plane' ? 75 : 30)) {
          e.knocked = true
          const heavy = e.type === 'plane'
          this._nudgeMoving(e.dir * (heavy ? 22 : 16))
          this.shake = Math.max(this.shake, heavy ? 6 : 3)
          Audio.knock(heavy)
          if (this.moving) {
            this._spawnFloat(this.moving.cx, heavy ? '气流!' : '捣乱!', '#ffab40', this.worldY(topIndex + 1) - AIM_RISE + 20)
          }
        }
        if (e.x < -70 || e.x > LOGICAL_W + 70) this.enemies.splice(i, 1)
        continue
      }

      if (e.type === 'eagle') {
        // 飞到楼顶侧上方悬停盘旋，持续扇风
        const tx = topCx + e.side * 95 + Math.sin(this.time * 1.5 + e.bob) * 20
        const ty = this.worldY(topIndex) - e.def.hover
        e.x += (tx - e.x) * clamp(dt * 2.6, 0, 1)
        e.wy += (ty - e.wy) * clamp(dt * 2.6, 0, 1)
        if (!e.arrived && Math.abs(e.x - tx) < 26) {
          e.arrived = true
          Audio.windGust()
          this._spawnFloat(e.x, '强风!', '#e3f2fd', e.wy - 20)
        }
        // 风的流线粒子
        if (e.arrived) {
          e.streakT -= dt
          if (e.streakT <= 0) {
            e.streakT = 0.12
            this.particles.push({
              wx: topCx + (Math.random() - 0.5) * 130,
              wy: this.worldY(topIndex) - 50 - Math.random() * 90,
              vx: -e.side * 170,
              vy: 0,
              life: 0.4,
              maxLife: 0.4,
              size: 2,
              color: 'rgba(255,255,255,0.85)',
              gravity: false
            })
          }
        }
      } else if (e.type === 'drone') {
        // 悬停漂移，发出干扰波让移动速度忽快忽慢
        const tx = LOGICAL_W / 2 + Math.sin(this.time * 0.7 + e.bob) * 110
        const ty = this.worldY(topIndex) - e.def.hover
        e.x += (tx - e.x) * clamp(dt * 1.6, 0, 1)
        e.wy += (ty - e.wy) * clamp(dt * 1.6, 0, 1) + Math.sin(this.time * 2.4 + e.bob) * 14 * dt
        if (!e.arrived && e.t > 1) {
          e.arrived = true
          this._spawnFloat(e.x, '干扰!', '#40c4ff', e.wy - 20)
        }
      } else if (e.type === 'ufo') {
        // 降临到楼顶上方，开启牵引光束持续吸取楼顶宽度
        const ty = this.worldY(topIndex) - e.def.hover
        if (e.t < 1.4) {
          e.x += (topCx - e.x) * clamp(dt * 1.6, 0, 1)
          e.wy += (ty - e.wy) * clamp(dt * 1.6, 0, 1)
        } else {
          e.x += (topCx + Math.sin(this.time * 0.9 + e.bob) * 30 - e.x) * clamp(dt * 2, 0, 1)
          e.wy = ty + Math.sin(this.time * 2 + e.bob) * 6
          if (!e.beamOn) {
            e.beamOn = true
            Audio.beam()
            this._spawnFloat(topCx, '牵引光束!', '#7cf29b', ty + 24)
          }
          if (top) {
            // 吸宽度（有安全下限，不会直接吸死）
            const w = Math.max(UFO_BEAM_FLOOR, top.width - UFO_BEAM_DRAIN * dt)
            if (w < top.width) {
              top.width = w
              this.currentWidth = Math.min(this.currentWidth, w)
            }
            // 被吸起的碎屑粒子
            e.beamT -= dt
            if (e.beamT <= 0) {
              e.beamT = 0.09
              this.particles.push({
                wx: topCx + (Math.random() - 0.5) * top.width * 0.8,
                wy: this.worldY(topIndex) + Math.random() * BLOCK_H,
                vx: (Math.random() - 0.5) * 20,
                vy: -90 - Math.random() * 50,
                life: 0.5,
                maxLife: 0.5,
                size: 2.5,
                color: '#7cf29b',
                gravity: false
              })
            }
          }
        }
      }

      // 到期离场
      if (e.def.life > 0 && e.t >= e.def.life) {
        e.state = 'flee'
        if (e.type === 'ufo') {
          e.vx = e.side * 50
          e.vy = -150
        } else if (e.type === 'eagle') {
          e.vx = e.side * 70
          e.vy = -140
        } else {
          e.vx = e.side * 60
          e.vy = -110
        }
      }
    }
  }

  // 命中测试：点击砸一下（判定半径放宽 1.6 倍照顾手指精度）
  _hitEnemy(x, y) {
    let best = null
    let bestD = Infinity
    for (const e of this.enemies) {
      if (e.state !== 'active') continue
      const sy = this.screenY(e.wy)
      const d = Math.hypot(x - e.x, y - sy)
      if (d <= e.def.r * 1.6 && d < bestD) {
        best = e
        bestD = d
      }
    }
    if (!best) return null

    best.hp -= 1
    best.hitFlash = 0.14
    best.x += best.x >= x ? 6 : -6 // 被砸得稍微弹开
    Audio.hitEnemy()
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2
      this.particles.push({
        wx: best.x,
        wy: best.wy,
        vx: Math.cos(a) * 95,
        vy: Math.sin(a) * 95,
        life: 0.35,
        maxLife: 0.35,
        size: 2.5,
        color: '#fff59d',
        gravity: false
      })
    }
    if (best.hp <= 0) this._killEnemy(best)
    return best
  }

  _killEnemy(e) {
    const idx = this.enemies.indexOf(e)
    if (idx >= 0) this.enemies.splice(idx, 1)
    const def = e.def
    // 掉金币（走本局金币结算，享加点石成金加成）
    this.baseCoinSum += def.coins
    const burst = {
      bird: ['#ff8f3c', '#ffe082'],
      eagle: ['#8d6e63', '#eceff1'],
      drone: ['#90a4ae', '#40c4ff'],
      plane: ['#eceff1', '#ff8f3c'],
      ufo: ['#7cf29b', '#4dd0e1']
    }[e.type] || ['#ffffff', '#ffd54f']
    const n = 10 + def.hp * 6
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2
      const sp = 60 + Math.random() * 160
      this.particles.push({
        wx: e.x,
        wy: e.wy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.7,
        maxLife: 0.7,
        size: 2.5 + Math.random() * 3,
        color: burst[k % 2],
        gravity: true,
        rot: Math.random() * 6,
        spin: (Math.random() - 0.5) * 10
      })
    }
    this._spawnFloat(e.x, `+${def.coins}`, '#ffd54f', e.wy - 14)
    if (e.type === 'ufo') {
      // UFO 额外奖励 1 点充能
      this.charge = Math.min(this.chargeCap, this.charge + 1)
      if (this.charge >= this.chargeCap && !this.chargeReady) {
        this.chargeReady = true
        Audio.chargeReady()
      }
      this._spawnFloat(e.x, '充能+1', '#ff8a65', e.wy - 40)
    }
    this.shake = Math.max(this.shake, 4)
    Audio.killEnemy()
    this._emit()
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

  // 带坐标的点击（移动端/鼠标）：先尝试砸捣乱飞行物，砸中则不落层。
  tapAt(x, y) {
    if (this.status !== 'playing') return
    if (this.attackSystem && this.attackSystem.hitAt(x, y)) return
    this.tap()
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

    // 复活说明是“从当前高度恢复本局初始宽度”。
    // 之前只重置 currentWidth，下一次完美落层又会被上一层旧宽度覆盖。
    // 这里同步扩展当前楼顶，让后续判定、视觉和生成宽度都使用恢复后的宽度。
    this.currentWidth = this.initialWidthPx
    this._expandTopBlockTo(this.currentWidth)

    this.combo = 0
    this.status = 'playing'
    Audio.revive()
    this._spawnRestoreEffect()
    this._spawnFloat(this.blocks[this.blocks.length - 1].cx, '复活恢复!', '#ff8fb0')
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
    // 暴雨打滑：下落过程中方块会持续横向滑移（看得见，可以提前量补偿）
    this.slipV = this.moving ? this.weather.slipVelocity(this.moving.dir) : 0
    if (this.slipV !== 0 && this.moving) {
      this._spawnFloat(this.moving.cx, '打滑!', '#69a7ff', this.worldY(this.moving.index) - AIM_RISE + 24)
    }
  }

  _resolveDrop() {
    const type = this.dropType
    this.dropping = false
    this.slipV = 0
    this.riseOffset = 0
    const prev = this.blocks[this.blocks.length - 1]
    const mv = this.moving
    if (!mv) return
    const width = mv.width
    // 判定以“晃动中的楼顶实际位置”为准（落块期间摆动相位冻结，
    // 因此这里的偏移与玩家点击瞬间所见完全一致）。
    const swayTop = this.swayOffset(prev.index)
    const prevCxNow = prev.cx + swayTop
    const offset = mv.cx - prevCxNow
    const absOff = Math.abs(offset)
    const mvLeft = mv.cx - width / 2
    const mvRight = mv.cx + width / 2
    const prevLeft = prevCxNow - prev.width / 2
    const prevRight = prevCxNow + prev.width / 2
    const overlapLeft = Math.max(mvLeft, prevLeft)
    const overlapRight = Math.min(mvRight, prevRight)
    const overlap = overlapRight - overlapLeft

    let unityTriggered = false
    let isPerfect = absOff <= this.perfectWindowPx
    // 心手合一：直接判定完美（仅玩家/AI 落层）
    if (!isPerfect && (type === 'manual' || type === 'ai') && Math.random() < this.unityChance) {
      isPerfect = true
      unityTriggered = true
    }

    let newWidth
    let newCx
    let failed = false
    let didCut = false
    let saved = false
    let usedShield = false
    let goldenBellTriggered = false
    let cutSide = 0
    let cutAmount = 0

    if (isPerfect) {
      // 完美落点“不减少宽度”。当连击恢复/复活刚扩大过楼顶时，
      // 使用当前有效宽度，避免又被旧的 prev.width 覆盖。
      newWidth = Math.min(this.initialWidthPx, Math.max(prev.width, width, this.currentWidth))
      newCx = clamp(prev.cx, newWidth / 2 + 6, LOGICAL_W - newWidth / 2 - 6)
    } else {
      // 免切判定：金钟罩概率 / 护盾卡
      if (Math.random() < this.goldenBellChance) {
        saved = true
        goldenBellTriggered = true
      } else if (this.inv.shield > 0) {
        saved = true
        usedShield = true
      }
      if (saved) {
        newWidth = Math.min(this.initialWidthPx, Math.max(prev.width, width, this.currentWidth))
        newCx = clamp(prev.cx, newWidth / 2 + 6, LOGICAL_W - newWidth / 2 - 6)
        if (usedShield) {
          this.inv.shield--
          this.onInventoryChange('shield', this.inv.shield)
        }
        Audio.shield()
        this._spawnShieldEffect(newCx)
      } else if (overlap > 0) {
        // 青铜保住一部分原本会被切掉的边缘，表现为材质的韧性。
        const rawCut = Math.max(0, width - overlap)
        cutSide = offset > 0 ? 1 : -1
        const protectedCut = rawCut * this.antiBreak
        cutAmount = Math.max(0, rawCut - protectedCut)
        didCut = cutAmount > 0.05
        newWidth = overlap + protectedCut
        // 重叠区域在“屏幕空间”计算；保留下来的边缘向被切除的一侧延伸，
        // 新方块的逻辑中轴需要减去当前摆动偏移。
        const newCxScreen = (overlapLeft + overlapRight) / 2 + cutSide * protectedCut / 2
        newCx = clamp(newCxScreen - this.swayOffset(mv.index), newWidth / 2 + 6, LOGICAL_W - newWidth / 2 - 6)
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
    this._initBlockDurability(placed)
    this.blocks.push(placed)
    this.currentWidth = newWidth
    this.floors++

    if (unityTriggered) {
      this._spawnFloat(placed.cx, '心手合一!', '#fff176')
      Audio.skill()
    }
    if (goldenBellTriggered) {
      this._spawnFloat(placed.cx, '金钟罩!', '#4dd0e1')
    } else if (usedShield) {
      this._spawnFloat(placed.cx, '护盾!', '#4dd0e1')
    }

    // 切除：整块切片坠落 + 碎块 + 粉尘 + 切口闪光，切得越多反馈越重
    if (didCut) {
      this._spawnDebris(placed, cutSide, cutAmount)
      Audio.cut()
      this.shake = Math.max(this.shake, 6 + Math.min(10, cutAmount * 0.3))
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
        // 每 3 连击恢复一次宽度，恢复量随连击档位递增（3→+10%、6→+20%……封顶 +40%）
        if (this.combo % RESTORE_COMBO_STEP === 0) {
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
    this._initBlockDurability(placed)
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

  // 连击档位（3 连击 = 1 档，6 连击 = 2 档 ……）
  restoreTier() {
    return Math.floor(this.combo / RESTORE_COMBO_STEP)
  }

  // 本档连击一次恢复的比例（相对本局初始宽度），有上限
  restoreRatio(tier = this.restoreTier()) {
    return Math.min(RESTORE_MAX, RESTORE_STEP * Math.max(0, tier))
  }

  _applyRestore() {
    const tier = this.restoreTier()
    const ratio = this.restoreRatio(tier)
    if (ratio <= 0) return
    const before = this.currentWidth
    this.currentWidth = Math.min(this.initialWidthPx, this.currentWidth + this.initialWidthPx * ratio)
    if (this.currentWidth > before + 0.5) {
      // 恢复不只是影响“下一块”的生成宽度，也要立即改变当前楼顶宽度；
      // 否则下一次完美落层会读取旧楼顶宽度，把恢复量又覆盖掉。
      this._expandTopBlockTo(this.currentWidth)
      Audio.restore()
      this._spawnRestoreEffect()
      const gained = Math.round((this.currentWidth - before) / PX_PER_POINT)
      const capped = ratio >= RESTORE_MAX ? ' 满' : ''
      this._spawnFloat(this.blocks[this.blocks.length - 1].cx, `宽度恢复 +${gained}${capped}`, '#4ade80')
    } else if (this.currentWidth >= this.initialWidthPx - 0.5) {
      // 已经是满宽度，给个轻提示而不是静默
      this._spawnFloat(this.blocks[this.blocks.length - 1].cx, '宽度已满', '#7cf29b')
    }
  }

  _expandTopBlockTo(width) {
    const top = this.blocks[this.blocks.length - 1]
    if (!top) return
    top.width = Math.min(width, this.initialWidthPx)
    const half = top.width / 2
    top.cx = clamp(top.cx, half + 6, LOGICAL_W - half - 6)
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
      midasMult: this.midasMult,
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
      midasMult: this.midasMult,
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
    if (this.destroyed) return
    dt = clamp(dt, 0, 0.05) // 限制异常大的帧间隔
    this.time += dt
    if (this.scenery) this.scenery.update(dt)
    this._updateBattleIntensity()

    // 相机跟随
    const topIndex = this.blocks.length - 1
    this.camTarget = TOWER_TOP_Y + topIndex * BLOCK_H
    this.camOffset = lerp(this.camOffset, this.camTarget, clamp(dt * 8, 0, 1))

    // 特效更新
    this._updateEffects(dt)

    if (this.status !== 'playing') {
      return
    }

    // 晃动相位：落块动画期间冻结，保证判定与所见一致；减速道具让摆动也变慢
    if (!this.dropping) {
      const sp = this._swayProgress()
      if (sp > 0) {
        const freq =
          ((Math.PI * 2) / SWAY_PERIOD) *
          (1 + sp * 0.5) *
          (this.slowRemaining > 0 ? 0.5 : 1) *
          this.weather.swayFreqMult()
        this.swayPhase += dt * freq
      }
      // 高空吱呀声（很轻，只做氛围）
      if (this.swayAmp() > 2) {
        this.creakT -= dt
        if (this.creakT <= 0) {
          this.creakT = 1.6 + Math.random() * 2.4
          Audio.creak()
        }
      }
    }

    // 天气（随高度解锁：大风 / 暴雨 / 冰雹 / 乌云 / 雷暴）
    this.weather.update(dt, clamp(this.floors / this.level.target, 0, 1))

    // 捣乱飞行物（生成 + 行为 + 对移动方块的影响）
    if (this.attackSystem) this.attackSystem.update(dt)

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
      if (this.slipV && this.moving) {
        this.moving.cx = clamp(this.moving.cx + this.slipV * dt, this.moving.width / 2 - 40, LOGICAL_W - this.moving.width / 2 + 40)
      }
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
      const mods = this._enemyModifiers()
      const spd = this.baseSpeed * speedMul * mods.speedMod
      this.moving.cx += this.moving.dir * spd * dt + mods.windX * dt
      if (this.moving.cx <= this.moving.minCx) {
        this.moving.cx = this.moving.minCx
        this.moving.dir = 1
      } else if (this.moving.cx >= this.moving.maxCx) {
        this.moving.cx = this.moving.maxCx
        this.moving.dir = -1
      }

      // AI 接管：对齐即落（以晃动中的楼顶实际位置为准）
      if (this.autoRemaining > 0 && this.aiCooldown <= 0) {
        const prev = this.blocks[this.blocks.length - 1]
        const aimWin = Math.max(this.perfectWindowPx * 0.7, 5)
        if (Math.abs(this.moving.cx - (prev.cx + this.swayOffset(prev.index))) <= aimWin) {
          this._startDrop('ai')
        }
      }
    }
  }

  _updateEffects(dt) {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 40)
    if (this.flashPerfect > 0) this.flashPerfect = Math.max(0, this.flashPerfect - dt)
    if (this.flashCut > 0) this.flashCut = Math.max(0, this.flashCut - dt * 1.6)
    const g = 900
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.life -= dt
      if (p.life <= 0) {
        this.particles.splice(i, 1)
        continue
      }
      if (p.gravity) p.vy += g * dt
      if (p.drag) {
        const d = Math.max(0, 1 - p.drag * dt)
        p.vx *= d
        p.vy *= d
        if (p.size != null) p.size += dt * 16
      }
      p.wx += p.vx * dt
      p.wy += p.vy * dt
      if (p.spin != null) p.rot += p.spin * dt
    }

    // 被切下的板材：自由落体 + 翻滚，落出画面后回收
    for (let i = this.cutSlabs.length - 1; i >= 0; i--) {
      const s = this.cutSlabs[i]
      s.vy += g * 0.85 * dt
      s.wx += s.vx * dt
      s.wy += s.vy * dt
      s.rot += s.spin * dt
      s.life -= dt
      if (s.life <= 0 || this.screenY(s.wy) > LOGICAL_H + 120) this.cutSlabs.splice(i, 1)
    }

    // 切口闪光
    for (let i = this.cutFx.length - 1; i >= 0; i--) {
      const f = this.cutFx[i]
      f.life -= dt
      if (f.life <= 0) this.cutFx.splice(i, 1)
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
  // 切片特效：被切下的部分会变成一整块真实板材翻滚坠落，
  // 切口爆出碎块 + 粉尘 + 一道横向的白色切割闪光，并伴随震屏与白闪。
  _spawnDebris(block, side, amount) {
    const wy = this.worldY(block.index)
    // 跟随晃动中的楼体位置
    const bcx = block.cx + this.swayOffset(block.index)
    const x = side > 0 ? bcx + block.width / 2 : bcx - block.width / 2
    const [c1, c2] = this._blockColors(block)
    const bigCut = clamp(amount / 40, 0, 1) // 切得越多，特效越夸张

    // 1) 被切下的整块板（真实掉落物，带旋转与拖影）
    this.cutSlabs.push({
      wx: x + side * amount / 2,
      wy,
      w: Math.max(4, amount),
      h: BLOCK_H,
      vx: side * (55 + Math.random() * 70 + amount * 0.8),
      vy: -70 - Math.random() * 60,
      rot: 0,
      spin: side * (2.4 + Math.random() * 4.5),
      life: 1.5,
      maxLife: 1.5,
      c1,
      c2,
      index: block.index
    })

    // 2) 切口闪光：一道沿切割面的高亮竖条 + 横向冲击波
    this.cutFx.push({
      wx: x,
      wy: wy + BLOCK_H / 2,
      side,
      life: 0.3,
      maxLife: 0.3,
      amount
    })

    // 3) 碎块（材质配色）
    const chunks = 14 + Math.floor(bigCut * 12)
    for (let i = 0; i < chunks; i++) {
      this.particles.push({
        wx: x + (Math.random() - 0.5) * Math.max(6, amount),
        wy: wy + Math.random() * BLOCK_H,
        vx: side * (40 + Math.random() * 170),
        vy: -40 - Math.random() * 150,
        life: 0.9 + Math.random() * 0.5,
        maxLife: 1.4,
        size: 2.5 + Math.random() * 5,
        color: Math.random() < 0.5 ? c1 : c2,
        gravity: true,
        rot: Math.random() * 6,
        spin: (Math.random() - 0.5) * 16
      })
    }

    // 4) 粉尘（切割瞬间从切口喷出，向外扩散后消散）
    const dust = 10 + Math.floor(bigCut * 10)
    for (let i = 0; i < dust; i++) {
      this.particles.push({
        wx: x + (Math.random() - 0.5) * Math.max(10, amount),
        wy: wy + BLOCK_H * Math.random(),
        vx: side * (20 + Math.random() * 80),
        vy: (Math.random() - 0.7) * 40,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        size: 5 + Math.random() * 9,
        color: 'rgba(255,255,255,0.5)',
        gravity: false,
        drag: 2.6
      })
    }

    // 5) 切口火花（高亮小点，强调“切”的瞬间）
    for (let i = 0; i < 9; i++) {
      this.particles.push({
        wx: x,
        wy: wy + Math.random() * BLOCK_H,
        vx: side * (120 + Math.random() * 220),
        vy: (Math.random() - 0.5) * 220,
        life: 0.22 + Math.random() * 0.16,
        maxLife: 0.38,
        size: 1.6 + Math.random() * 1.6,
        color: '#fff6c9',
        gravity: false
      })
    }

    // 切得越多，白闪越强（小幅修边不会满屏闪）
    this.flashCut = Math.max(this.flashCut, 0.08 + bigCut * 0.16)
  }

  _spawnPerfect(block, color = '#ffe082') {
    const wy = this.worldY(block.index) + BLOCK_H / 2
    const bcx = block.cx + this.swayOffset(block.index)
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.3
      const sp = 60 + Math.random() * 120
      this.particles.push({
        wx: bcx + (Math.random() - 0.5) * block.width,
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

  _spawnFloat(cx, text, color, wy) {
    this.floatTexts.push({
      cx,
      wy: wy != null ? wy : this.worldY(this.blocks.length - 1),
      text,
      color,
      life: 1.1,
      maxLife: 1.1
    })
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
      // 宽度读数（底部显示，用来确认技能/道具的加宽是否真的生效）
      widthPoints: this.currentWidth / PX_PER_POINT,
      initialWidthPoints: this.initialWidthPoints,
      baseWidthPoints: 100,
      widthPct: this.initialWidthPx > 0 ? this.currentWidth / this.initialWidthPx : 0,
      nextRestorePct: Math.round(this.restoreRatio(this.restoreTier() + 1) * 100),
      restoreMaxPct: Math.round(RESTORE_MAX * 100),
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
      weather: this.weather ? this.weather.hudState() : null,
      shieldEquipped: this.inv.shield > 0,
      comboGuardEquipped: this.inv.comboGuard > 0
    })
  }

  // ---------------- 渲染 ----------------
  render(ctx) {
    if (this.destroyed) return
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
    this.weather.renderBack(ctx, LOGICAL_W, LOGICAL_H)
    this._drawTower(ctx)
    if (this.attackSystem) this.attackSystem.render(ctx)
    this._drawEffects(ctx)
    // 最近的一层前景剪影盖在塔前面，强化“近处”的纵深
    if (this.scenery) this.scenery.renderFront(ctx, p)
    this.weather.renderFront(ctx, LOGICAL_W, LOGICAL_H)

    if (this.flashPerfect > 0) {
      ctx.fillStyle = `rgba(255,236,150,${this.flashPerfect * 0.35})`
      ctx.fillRect(-20, -20, LOGICAL_W + 40, LOGICAL_H + 40)
    }
    // 切除瞬间的冷色白闪，让“被切掉了”一眼可见
    if (this.flashCut > 0) {
      ctx.fillStyle = `rgba(226,244,255,${clamp(this.flashCut * 1.35, 0, 0.42)})`
      ctx.fillRect(-20, -20, LOGICAL_W + 40, LOGICAL_H + 40)
    }
    ctx.restore()
  }

  _bgPalette(p) {
    // New visual direction: a continuous moonlit space gradient. Progress shifts hue
    // from cobalt to violet while the ground remains a subtle launch-pad silhouette.
    const kf = [
      { p: 0, top: [15, 36, 80], bot: [26, 65, 116] },
      { p: 0.25, top: [16, 31, 76], bot: [25, 53, 112] },
      { p: 0.5, top: [21, 23, 69], bot: [47, 36, 119] },
      { p: 0.75, top: [16, 18, 50], bot: [35, 27, 88] },
      { p: 1, top: [5, 9, 24], bot: [16, 18, 48] }
    ]
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
      topArr: top.map(Math.round),
      botArr: bot.map(Math.round),
      starAlpha: 0.62 + clamp(p, 0, 1) * 0.3,
      cloudAlpha: clamp(1 - Math.abs(p - 0.2) / 0.26, 0, 1) * 0.28
    }
  }

  _drawBackground(ctx, p) {
    const pal = this._bgPalette(p)
    const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H)
    grad.addColorStop(0, pal.top)
    grad.addColorStop(1, pal.bot)
    ctx.fillStyle = grad
    ctx.fillRect(-20, -20, LOGICAL_W + 40, LOGICAL_H + 40)

    // Orbit-station atmosphere: diagonal flight lanes and a distant moon beacon.
    ctx.save()
    ctx.globalAlpha = 0.16
    ctx.strokeStyle = '#6de2ff'
    ctx.lineWidth = 1
    for (let x = -LOGICAL_H; x < LOGICAL_W + LOGICAL_H; x += 34) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + LOGICAL_H * 0.32, LOGICAL_H); ctx.stroke()
    }
    ctx.globalAlpha = 0.22
    ctx.strokeStyle = '#ffd66e'
    ctx.beginPath(); ctx.arc(LOGICAL_W * 0.78, LOGICAL_H * 0.22, 86, 0.25, 2.55); ctx.stroke()
    ctx.restore()

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

    // 远景装饰：山脉 → 远处城市 → 中景楼房（越远移动越慢、越淡）
    if (this.scenery) this.scenery.renderBack(ctx, p, { top: pal.topArr, bot: pal.botArr })

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
    const dark = true
    if (gy < LOGICAL_H + 200) {
      const gGrad = ctx.createLinearGradient(0, gy, 0, gy + 300)
      gGrad.addColorStop(0, dark ? '#2b4a2d' : '#7ec87e')
      gGrad.addColorStop(1, dark ? '#16280f' : '#4e9a4e')
      ctx.fillStyle = gGrad
      ctx.fillRect(-20, gy, LOGICAL_W + 40, LOGICAL_H + 40 - gy + 20)
      // 草地高光
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.18)'
      ctx.fillRect(-20, gy, LOGICAL_W + 40, 6)
      // 远处地面的起伏（贴着地平线的两道缓坡，暗示草原延伸）
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.14)'
      ctx.beginPath()
      ctx.ellipse(LOGICAL_W * 0.22, gy + 16, 150, 20, 0, Math.PI, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(LOGICAL_W * 0.82, gy + 22, 130, 17, 0, Math.PI, Math.PI * 2)
      ctx.fill()
    }

    // 近景装饰：地面上的小屋、树木、灌木和草丛（跟着地面一起滑出视野）
    if (this.scenery) this.scenery.renderNear(ctx, p)
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
      return ['#3b577d', '#17253f']
    }
    if (block.kind === 'flame') {
      return ['#ffc857', '#ee6c32']
    }
    if (block.kind === 'pursuit') {
      return ['#7df3d2', '#2b8fe8']
    }
    const materialColors = this.material.colors || ['#b9794a', '#8e4d2f']
    if (block.kind === 'perfect') {
      return [materialColors[0], materialColors[1]]
    }
    // 材质决定方块的主色与质感，不再用楼层色相覆盖材质识别度。
    if (dark && this.material.id === 'soil') return ['#b8794d', '#4d2f35']
    return materialColors
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

  _drawMaterialTexture(ctx, x, y, width, block) {
    const id = this.material.id
    const seed = (block.index || 0) * 17
    ctx.save()
    ctx.lineWidth = 1

    if (id === 'soil') {
      ctx.fillStyle = 'rgba(66, 34, 21, 0.25)'
      for (let i = 0; i < Math.max(3, Math.floor(width / 16)); i++) {
        const px = x + ((seed + i * 29) % Math.max(8, width - 4)) + 2
        const py = y + 5 + ((seed + i * 11) % 16)
        ctx.beginPath()
        ctx.arc(px, py, 1.2 + (i % 2) * 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (id === 'concrete') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
      ctx.strokeStyle = 'rgba(49, 59, 70, 0.25)'
      for (let i = 0; i < Math.max(4, Math.floor(width / 13)); i++) {
        const px = x + ((seed + i * 23) % Math.max(8, width - 5)) + 2
        const py = y + 5 + ((seed + i * 7) % 16)
        ctx.beginPath()
        ctx.arc(px, py, 1 + (i % 3) * 0.45, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.moveTo(x + 4, y + 19)
      ctx.lineTo(x + Math.min(width - 4, 28 + (seed % 26)), y + 12)
      ctx.stroke()
    } else if (id === 'steel') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)'
      ctx.lineWidth = 1.5
      for (let py = y + 7; py < y + BLOCK_H; py += 9) {
        ctx.beginPath()
        ctx.moveTo(x, py)
        ctx.lineTo(x + width, py - 3)
        ctx.stroke()
      }
    } else if (id === 'bronze') {
      ctx.strokeStyle = 'rgba(92, 49, 24, 0.28)'
      for (let sx = x - BLOCK_H + (seed % 12); sx < x + width; sx += 17) {
        ctx.beginPath()
        ctx.moveTo(sx, y + BLOCK_H)
        ctx.lineTo(sx + BLOCK_H, y)
        ctx.stroke()
      }
    } else if (id === 'blackgold') {
      ctx.fillStyle = 'rgba(255, 213, 108, 0.62)'
      for (let i = 0; i < Math.max(2, Math.floor(width / 22)); i++) {
        const px = x + ((seed + i * 31) % Math.max(8, width - 5)) + 2
        const py = y + 5 + ((seed + i * 13) % 15)
        ctx.beginPath()
        ctx.arc(px, py, 1.1, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.strokeStyle = 'rgba(184, 151, 255, 0.26)'
      ctx.beginPath()
      ctx.moveTo(x, y + BLOCK_H - 4)
      ctx.lineTo(x + width, y + 5)
      ctx.stroke()
    }
    ctx.restore()
  }

  // Kenney 楼层贴图：墙砖横向平铺 + 材质染色 + 拱形窗。
  // 没加载完时返回 false，调用方走旧的程序化纹理兜底。
  _drawKenneyFloor(ctx, x, y, width, block, art) {
    // 墙砖：70x70 tile 按 BLOCK_H 高度横向平铺
    const T = BLOCK_H
    for (let tx = x; tx < x + width; tx += T) {
      ctx.drawImage(art.wall, tx, y, T, T)
    }
    // 材质染色（青铜暖橙 / 乌金紫）
    if (art.tint) {
      ctx.save()
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = art.tint
      ctx.fillRect(x, y, width, BLOCK_H)
      ctx.restore()
    }
    // 拱形窗：等距排列，相位随楼层编号固定，避免闪烁
    const winH = 20
    const winW = (winH * WINDOW_SRC.w) / WINDOW_SRC.h
    const gap = 34
    const phase = ((block.index || 0) * 13) % gap
    const wy = y + (BLOCK_H - winH) / 2
    for (let wx = x + 9 + phase; wx + winW <= x + width - 5; wx += gap) {
      ctx.drawImage(art.window, WINDOW_SRC.x, WINDOW_SRC.y, WINDOW_SRC.w, WINDOW_SRC.h, wx, wy, winW, winH)
    }
    // 暗色主题整体压暗（含窗户）
    if (this.theme === 'dark') {
      ctx.fillStyle = 'rgba(8,14,30,0.38)'
      ctx.fillRect(x, y, width, BLOCK_H)
    }
  }

  _drawBlock(ctx, cx, screenTopY, width, block, extra = {}) {
    const x = cx - width / 2
    const y = screenTopY
    const [c1, c2] = this._blockColors(block)
    const r = 4
    // 材质楼层（普通/完美/护盾保住）用 Kenney 贴图；base/flame/pursuit 保持原样
    const kind = block.kind || 'normal'
    const art = (kind === 'normal' || kind === 'perfect' || kind === 'shield')
      ? getFloorArt(this.material.id)
      : null

    ctx.save()
    // 更厚重的投影，让楼层像实体积木而不是纯色条。
    ctx.shadowColor = 'rgba(0,0,0,0.26)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 4
    this._roundRect(ctx, x, y, width, BLOCK_H, r)
    const grad = ctx.createLinearGradient(0, y, 0, y + BLOCK_H)
    grad.addColorStop(0, c1)
    grad.addColorStop(0.52, c2)
    grad.addColorStop(1, 'rgba(0,0,0,0.28)')
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()

    // 裁剪到方块内部后叠加纹理、斜向高光和底部暗边。
    ctx.save()
    this._roundRect(ctx, x, y, width, BLOCK_H, r)
    ctx.clip()

    if (art) this._drawKenneyFloor(ctx, x, y, width, block, art)

    const bevel = ctx.createLinearGradient(x, y, x, y + BLOCK_H)
    bevel.addColorStop(0, 'rgba(255,255,255,0.42)')
    bevel.addColorStop(0.22, 'rgba(255,255,255,0.12)')
    bevel.addColorStop(0.72, 'rgba(0,0,0,0.05)')
    bevel.addColorStop(1, 'rgba(0,0,0,0.28)')
    ctx.fillStyle = bevel
    ctx.fillRect(x, y, width, BLOCK_H)

    if (!art) {
      this._drawMaterialTexture(ctx, x, y, width, block)

      // 细斜纹：根据楼层编号固定相位，避免闪烁。
      ctx.globalAlpha = 0.16
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1
      const phase = ((block.index || 0) * 7) % 18
      for (let sx = x - BLOCK_H + phase; sx < x + width + BLOCK_H; sx += 18) {
        ctx.beginPath()
        ctx.moveTo(sx, y + BLOCK_H)
        ctx.lineTo(sx + BLOCK_H, y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Engineering-station details: panels, vents and a center seam make each floor read as a built object.
      ctx.fillStyle = 'rgba(5,18,38,0.28)'
      for (let vx = x + 13; vx < x + width - 8; vx += 24) ctx.fillRect(vx, y + BLOCK_H - 13, 10, 4)
      ctx.strokeStyle = 'rgba(111,226,255,0.36)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x + width * 0.5, y + 5); ctx.lineTo(x + width * 0.5, y + BLOCK_H - 5); ctx.stroke()
    }

    // 顶部厚边和底部阴影边，增加“积木”质感。
    const topGrad = ctx.createLinearGradient(0, y, 0, y + 9)
    topGrad.addColorStop(0, 'rgba(255,255,255,0.52)')
    topGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = topGrad
    this._roundRect(ctx, x + 3, y + 3, Math.max(0, width - 6), 8, 4)
    ctx.fill()

    ctx.fillStyle = 'rgba(0,0,0,0.16)'
    ctx.fillRect(x + 4, y + BLOCK_H - 6, Math.max(0, width - 8), 4)

    // 宽楼层增加两颗小铆点/反光点，增强细节但不干扰判定（Kenney 贴图已有窗户，不再叠加）。
    if (!art && width > 46) {
      const rivetOffset = Math.min(18, width * 0.22)
      ctx.fillStyle = 'rgba(255,255,255,0.32)'
      ctx.beginPath()
      ctx.arc(x + rivetOffset, y + 10, 2.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x + width - rivetOffset, y + 10, 2.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(0,0,0,0.15)'
      ctx.beginPath()
      ctx.arc(x + rivetOffset, y + 11.5, 1.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x + width - rivetOffset, y + 11.5, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()

    // 描边
    ctx.lineWidth = block.kind === 'perfect' ? 2.4 : 2
    ctx.strokeStyle = block.kind === 'perfect' ? 'rgba(255,224,130,0.95)' : 'rgba(255,255,255,0.44)'
    this._roundRect(ctx, x, y, width, BLOCK_H, r)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(0,0,0,0.14)'
    ctx.lineWidth = 1
    this._roundRect(ctx, x + 1, y + 1, Math.max(0, width - 2), BLOCK_H - 2, r - 1)
    ctx.stroke()

    // 火焰包边
    if (block.kind === 'flame') {
      const flick = 0.6 + 0.4 * Math.sin(this.time * 20 + cx)
      ctx.strokeStyle = `rgba(255,140,40,${flick})`
      ctx.lineWidth = 3
      this._roundRect(ctx, x - 1, y - 1, width + 2, BLOCK_H + 2, 8)
      ctx.stroke()
    }

    // 攻击耐久：只在可受损楼层显示紧凑血条与受损裂纹。
    if (block.index > 0 && block.maxDurability) {
      const ratio = clamp((block.durability ?? block.maxDurability) / block.maxDurability, 0, 1)
      const barW = Math.min(width, 92)
      const barX = cx - barW / 2
      const barY = y - 7
      ctx.fillStyle = 'rgba(0,0,0,0.48)'
      ctx.fillRect(barX, barY, barW, 3)
      ctx.fillStyle = ratio > 0.55 ? '#7cf29b' : ratio > 0.25 ? '#ffd36b' : '#ff6b73'
      ctx.fillRect(barX, barY, barW * ratio, 3)
      if (ratio < 0.72) {
        ctx.strokeStyle = `rgba(34,18,24,${0.25 + (1 - ratio) * 0.55})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(cx - width * 0.18, y + 4)
        ctx.lineTo(cx - width * 0.04, y + 14)
        ctx.lineTo(cx + width * 0.12, y + 8)
        ctx.stroke()
      }
      if (block.damageFlash > 0) {
        ctx.fillStyle = `rgba(255, 90, 105, ${Math.min(0.36, block.damageFlash)})`
        this._roundRect(ctx, x, y, width, BLOCK_H, r)
        ctx.fill()
      }
    }
  }

  _drawTower(ctx) {
    // 已放置方块（带高空晃动：底部固定，越往上摆幅越大）
    for (const b of this.blocks) {
      const wy = this.worldY(b.index)
      const sy = this.screenY(wy)
      if (sy < -BLOCK_H - 10 || sy > LOGICAL_H + 20) continue
      this._drawBlock(ctx, b.cx + this.swayOffset(b.index), sy, b.width, b)
    }

    // 被切下的板材（翻滚坠落的切片）
    for (const s of this.cutSlabs) {
      const sy = this.screenY(s.wy)
      if (sy < -80 || sy > LOGICAL_H + 120) continue
      const a = clamp(s.life / s.maxLife, 0, 1)
      ctx.save()
      ctx.globalAlpha = Math.min(1, a * 1.6)
      ctx.translate(s.wx, sy + s.h / 2)
      ctx.rotate(s.rot)
      // 板材本体
      const grad = ctx.createLinearGradient(0, -s.h / 2, 0, s.h / 2)
      grad.addColorStop(0, s.c1)
      grad.addColorStop(0.55, s.c2)
      grad.addColorStop(1, 'rgba(0,0,0,0.35)')
      ctx.fillStyle = grad
      this._roundRect(ctx, -s.w / 2, -s.h / 2, s.w, s.h, Math.min(4, s.w / 2))
      ctx.fill()
      // 切口断面高光
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.restore()
      ctx.globalAlpha = 1
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

    // 待落方块（吊在半空，不随楼体摆动——玩家要掐楼体荡回来的时机）
    if (this.moving && this.status === 'playing') {
      const wy = this.worldY(this.moving.index)
      const sy = this.screenY(wy) - this.riseOffset
      this._drawBlock(ctx, this.moving.cx, sy, this.moving.width, this.moving)
      // 落点指示线（跟随晃动中的楼顶）
      const prev = this.blocks[this.blocks.length - 1]
      const prevCxNow = prev.cx + this.swayOffset(prev.index)
      ctx.save()
      ctx.globalAlpha = 0.25
      ctx.strokeStyle = '#ffffff'
      ctx.setLineDash([4, 6])
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(prevCxNow, sy + BLOCK_H)
      ctx.lineTo(prevCxNow, this.screenY(this.worldY(prev.index)))
      ctx.stroke()
      ctx.restore()
    }
  }

  // ---------------- 飞行物绘制 ----------------
  _drawEnemies(ctx) {
    for (const e of this.enemies) {
      const sy = this.screenY(e.wy)
      if (e.state === 'warn') {
        // 入场警示：边缘闪烁的感叹号箭头
        const blink = 0.5 + 0.5 * Math.sin(this.time * 14)
        const wx = clamp(e.x, 22, LOGICAL_W - 22)
        const wy = clamp(sy, 30, LOGICAL_H - 30)
        ctx.save()
        ctx.globalAlpha = 0.35 + 0.65 * blink
        ctx.fillStyle = '#ff5d73'
        ctx.beginPath()
        ctx.moveTo(wx, wy - 14)
        ctx.lineTo(wx + 10, wy + 4)
        ctx.lineTo(wx - 10, wy + 4)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 11px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('!', wx, wy + 1)
        ctx.textAlign = 'start'
        ctx.restore()
        continue
      }
      if (sy < -90 || sy > LOGICAL_H + 90 || e.x < -90 || e.x > LOGICAL_W + 90) continue
      this._drawEnemy(ctx, e, sy)
    }
  }

  _drawEnemy(ctx, e, sy) {
    ctx.save()
    ctx.translate(e.x, sy)
    // UFO 光束画在机身下层
    if (e.type === 'ufo' && e.beamOn) this._drawUfoBeam(ctx, e, sy)
    const flip = e.dir >= 0 ? 1 : -1
    if (e.type === 'bird') this._drawBird(ctx, e, flip)
    else if (e.type === 'eagle') {
      ctx.save()
      ctx.scale(-e.side, 1) // 面向塔身
      this._drawEagle(ctx, e)
      ctx.restore()
    } else if (e.type === 'drone') this._drawDrone(ctx, e)
    else if (e.type === 'plane') this._drawPlane(ctx, e, flip)
    else if (e.type === 'ufo') this._drawUfo(ctx, e)

    // 受击白闪
    if (e.hitFlash > 0) {
      ctx.globalAlpha = clamp(e.hitFlash * 6, 0, 0.85)
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(0, 0, e.def.r + 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    // 剩余血量点（多血量敌人显示）
    if (e.maxHp > 1) {
      for (let k = 0; k < e.maxHp; k++) {
        const px = (k - (e.maxHp - 1) / 2) * 11
        ctx.beginPath()
        ctx.arc(px, -e.def.r - 10, 3, 0, Math.PI * 2)
        ctx.fillStyle = k < e.hp ? '#ffd54f' : 'rgba(0,0,0,0.3)'
        ctx.fill()
      }
    }
    ctx.restore()
  }

  _drawBird(ctx, e, flip) {
    const sprite = enemySprite('bird')
    if (sprite) {
      ctx.save()
      ctx.scale(flip, 1)
      ctx.drawImage(sprite, -48, -31, 96, 62)
      ctx.restore()
      return
    }
    const flap = Math.sin(this.time * 15 + e.bob)
    ctx.save()
    ctx.scale(flip, 1)
    // Readable sprite silhouette: swept wings, helmet head and bright attack trail.
    ctx.strokeStyle = 'rgba(255,196,93,0.5)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-31, 4); ctx.lineTo(-47, 9); ctx.stroke()
    ctx.fillStyle = '#7a3d2b'
    ctx.beginPath()
    ctx.moveTo(-2, -2)
    ctx.quadraticCurveTo(-14, -6 + flap * 12, -26, -2 + flap * 16)
    ctx.quadraticCurveTo(-13, 2 + flap * 4, -2, 3)
    ctx.closePath()
    ctx.fill()
    // 身体
    ctx.fillStyle = '#f6a34b'
    ctx.beginPath()
    ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2)
    ctx.fill()
    // 头
    ctx.beginPath()
    ctx.arc(11, -3, 5.5, 0, Math.PI * 2)
    ctx.fill()
    // 喙
    ctx.fillStyle = '#ffdc6b'
    ctx.beginPath()
    ctx.moveTo(15, -3)
    ctx.lineTo(21, -1.5)
    ctx.lineTo(15, 0)
    ctx.closePath()
    ctx.fill()
    // 眼
    ctx.fillStyle = '#26221c'
    ctx.beginPath()
    ctx.arc(12.5, -4, 1.2, 0, Math.PI * 2)
    ctx.fill()
    // 前翅膀
    ctx.fillStyle = '#ffd276'
    ctx.beginPath()
    ctx.moveTo(0, -1)
    ctx.quadraticCurveTo(-8, -10 - flap * 10, -20, -6 - flap * 14)
    ctx.quadraticCurveTo(-9, -flap * 2, 0, 2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  _drawEagle(ctx, e) {
    const flap = Math.sin(this.time * 5 + e.bob)
    // 展开的宽翅膀
    ctx.fillStyle = '#6d4c41'
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, -2)
      ctx.quadraticCurveTo(s * 20, -14 + flap * 6, s * 44, -6 + flap * 12)
      ctx.quadraticCurveTo(s * 30, 4 + flap * 4, s * 12, 5)
      ctx.closePath()
      ctx.fill()
    }
    // 身体
    ctx.fillStyle = '#795548'
    ctx.beginPath()
    ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    // 尾羽
    ctx.fillStyle = '#5d4037'
    ctx.beginPath()
    ctx.moveTo(-12, -2)
    ctx.lineTo(-27, -6)
    ctx.lineTo(-27, 6)
    ctx.lineTo(-12, 3)
    ctx.closePath()
    ctx.fill()
    // 白头
    ctx.fillStyle = '#eceff1'
    ctx.beginPath()
    ctx.arc(13, -4, 6, 0, Math.PI * 2)
    ctx.fill()
    // 喙
    ctx.fillStyle = '#ffb300'
    ctx.beginPath()
    ctx.moveTo(17, -5)
    ctx.lineTo(24, -3)
    ctx.lineTo(17, -1)
    ctx.closePath()
    ctx.fill()
    // 眼
    ctx.fillStyle = '#26221c'
    ctx.beginPath()
    ctx.arc(14.5, -5.5, 1.4, 0, Math.PI * 2)
    ctx.fill()
  }

  _drawDrone(ctx, e) {
    const spin = Math.abs(Math.sin(this.time * 26 + e.bob))
    // 干扰波纹
    if (e.t > 1) {
      const pr = (this.time * 42 + e.bob * 20) % 46
      ctx.globalAlpha = clamp(1 - pr / 46, 0, 1) * 0.5
      ctx.strokeStyle = '#40c4ff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(0, 4, 10 + pr, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    // 机臂 + 旋翼
    ctx.strokeStyle = '#78909c'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-14, -3)
    ctx.lineTo(14, -3)
    ctx.stroke()
    ctx.fillStyle = 'rgba(176,190,197,0.55)'
    ctx.beginPath()
    ctx.ellipse(-15, -6, 10 * spin + 3, 2.4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(15, -6, 10 * spin + 3, 2.4, 0, 0, Math.PI * 2)
    ctx.fill()
    // 机身
    ctx.fillStyle = '#90a4ae'
    this._roundRect(ctx, -11, -5, 22, 11, 4)
    ctx.fill()
    ctx.fillStyle = '#607d8b'
    this._roundRect(ctx, -11, 2, 22, 4, 2)
    ctx.fill()
    // 警示灯
    const blink = Math.sin(this.time * 8 + e.bob) > 0
    ctx.fillStyle = blink ? '#ff5252' : 'rgba(255,82,82,0.25)'
    ctx.beginPath()
    ctx.arc(0, -5, 2.2, 0, Math.PI * 2)
    ctx.fill()
    // 摄像头
    ctx.fillStyle = '#263238'
    ctx.beginPath()
    ctx.arc(0, 7, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  _drawPlane(ctx, e, flip) {
    const sprite = enemySprite('plane')
    if (sprite) {
      ctx.save()
      ctx.scale(flip, 1)
      ctx.drawImage(sprite, -66, -35, 132, 70)
      ctx.restore()
      return
    }
    ctx.save()
    ctx.scale(flip, 1)
    // 尾迹
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = 0.28 - k * 0.08
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(-38 - k * 13, -2 + k * 2, 5 - k, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    // 机身
    const grad = ctx.createLinearGradient(0, -9, 0, 9)
    grad.addColorStop(0, '#dff7ff')
    grad.addColorStop(0.45, '#4ea2d8')
    grad.addColorStop(1, '#183c72')
    ctx.fillStyle = grad
    this._roundRect(ctx, -32, -8, 60, 16, 8)
    ctx.fill()
    // 机头
    ctx.beginPath()
    ctx.moveTo(26, -8)
    ctx.quadraticCurveTo(42, 0, 26, 8)
    ctx.closePath()
    ctx.fill()
    // 尾翼
    ctx.fillStyle = '#ffb852'
    ctx.beginPath()
    ctx.moveTo(-30, -6)
    ctx.lineTo(-38, -20)
    ctx.lineTo(-26, -18)
    ctx.lineTo(-22, -6)
    ctx.closePath()
    ctx.fill()
    // 主翼
    ctx.fillStyle = '#77dfff'
    ctx.beginPath()
    ctx.moveTo(-4, 0)
    ctx.lineTo(-18, 12)
    ctx.lineTo(12, 12)
    ctx.lineTo(8, 0)
    ctx.closePath()
    ctx.fill()
    // 舷窗
    ctx.fillStyle = '#fff4ae'
    for (let k = 0; k < 5; k++) {
      ctx.beginPath()
      ctx.arc(-16 + k * 8, -2, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  _drawUfoBeam(ctx, e, sy) {
    const top = this.blocks[this.blocks.length - 1]
    if (!top) return
    const ty = this.screenY(this.worldY(top.index))
    if (ty <= sy + 10) return
    const localTy = ty - sy
    const hw = Math.max(22, top.width * 0.5)
    const flick = 0.7 + 0.3 * Math.sin(this.time * 9 + e.bob)
    const grad = ctx.createLinearGradient(0, 0, 0, localTy)
    grad.addColorStop(0, `rgba(140,255,180,${0.42 * flick})`)
    grad.addColorStop(1, `rgba(140,255,180,${0.06 * flick})`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(-13, -2)
    ctx.lineTo(13, -2)
    ctx.lineTo(hw, localTy)
    ctx.lineTo(-hw, localTy)
    ctx.closePath()
    ctx.fill()
  }

  _drawUfo(ctx, e) {
    const sprite = enemySprite('ufo')
    if (sprite) {
      ctx.drawImage(sprite, -68, -44, 136, 88)
      return
    }
    // Disc hull with a cockpit, antenna and segmented lights; avoids the old green blob silhouette.
    const grad = ctx.createLinearGradient(0, -6, 0, 8)
    grad.addColorStop(0, '#e8f8ff')
    grad.addColorStop(0.5, '#4d8bd0')
    grad.addColorStop(1, '#142d5a')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(0, 2, 27, 9, 0, 0, Math.PI * 2)
    ctx.fill()
    // 玻璃罩
    ctx.fillStyle = 'rgba(160,240,255,0.75)'
    ctx.beginPath()
    ctx.arc(0, -2, 12, Math.PI, 0)
    ctx.closePath()
    ctx.fill()
    // 小外星人
    ctx.fillStyle = '#ffd36e'
    ctx.beginPath()
    ctx.arc(0, -5, 5, Math.PI, 0)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#26221c'
    ctx.beginPath()
    ctx.arc(-2, -6.5, 1.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(2, -6.5, 1.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#76e5ff'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, -16); ctx.stroke()
    ctx.fillStyle = '#ff7a69'; ctx.beginPath(); ctx.arc(0, -17, 2, 0, Math.PI * 2); ctx.fill()
    // 旋转彩灯
    for (let k = 0; k < 3; k++) {
      const hue = (this.time * 140 + k * 120) % 360
      ctx.fillStyle = `hsl(${hue},95%,62%)`
      ctx.beginPath()
      ctx.arc(-14 + k * 14, 5, 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  _drawEffects(ctx) {
    // 切口闪光：沿切割面的高亮竖条 + 向外扩散的冲击弧
    for (const f of this.cutFx) {
      const t = 1 - f.life / f.maxLife
      const a = clamp(f.life / f.maxLife, 0, 1)
      const sy = this.screenY(f.wy)
      ctx.save()
      ctx.globalAlpha = a
      // 竖向高亮切割线
      const lg = ctx.createLinearGradient(f.wx - 6, 0, f.wx + 6, 0)
      lg.addColorStop(0, 'rgba(255,255,255,0)')
      lg.addColorStop(0.5, 'rgba(255,255,255,0.95)')
      lg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = lg
      const hh = BLOCK_H / 2 + 6 + t * 14
      ctx.fillRect(f.wx - 6, sy - hh, 12, hh * 2)
      // 向切除方向扩散的冲击弧
      ctx.globalAlpha = a * 0.75
      ctx.strokeStyle = '#fff3c4'
      ctx.lineWidth = 2.4 * (1 - t) + 0.6
      ctx.beginPath()
      ctx.ellipse(f.wx + f.side * t * 26, sy, 8 + t * 46, BLOCK_H * 0.6 + t * 20, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
    ctx.globalAlpha = 1

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
    this.destroyed = true
    this.status = 'destroyed'
    this.onState = () => {}
    this.onEnd = () => {}
    this.onReviveOffer = () => {}
    this.onInventoryChange = () => {}
    this.particles = []
    this.floatTexts = []
    this.blocks = []
    this.moving = null
    this.autoQueue = []
    this.enemies = []
    if (this.attackSystem) this.attackSystem.destroy()
    this.cutSlabs = []
    this.cutFx = []
    this.scenery = null
    if (this.weather) this.weather.destroy()
  }
}
