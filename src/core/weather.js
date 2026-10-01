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
//   storm 雷暴：乌云 + 雷电，画面忽明忽暗，闪电有概率劈掉 1—3 层或击落飞行物
//
// 所有影响都通过引擎读取的接口暴露，渲染分前景/背景两层。

import { Audio } from './audio.js'

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
    tip: '雷暴！闪电可能劈掉楼层或飞行物',
    unlock: 0.74,
    weight: 2.4,
    dur: [9, 14]
  }
}

const HAIL_FLOOR = 26 // 冰雹削到这个宽度就不再削（不会直接砸死）
const HAIL_DAMAGE = 3.2 // 单次冰雹命中削掉的宽度（像素）
const LIGHTNING_MAX_FLOORS = 3 // 雷暴命中楼体时，最多劈掉的楼层数（乌金材质为 1）

export class WeatherSystem {
  constructor(engine) {
    this.engine = engine
    this.paused = false
    this.scale = engine.level.weather != null ? engine.level.weather : 1 // 关卡强度系数

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
    this.hailHitT = 0
    this.lastTip = ''
    this.pendingTimers = new Set()
    this.pendingStrike = null
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
    return this.current ? this.current.def.id : null
  }

  hudState() {
    if (!this.current) return null
    return {
      id: this.current.def.id,
      name: this.current.def.name,
      icon: this.current.def.icon,
      color: this.current.def.color,
      remaining: Math.ceil(Math.max(0, this.current.dur - this.current.t))
    }
  }

  // 楼体晃动幅度倍率（大风/雷暴加剧）
  swayMult() {
    const id = this.activeId
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
    if (!this.current) return 1
    if (id === 'wind') return 1 + 0.45 * this.current.intensity
    if (id === 'storm') return 1 + 0.25 * this.current.intensity
    return 1
  }

  // 对待落方块的横向风力（像素/秒）与速度扰动
  modifiers() {
    const id = this.activeId
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
      this._resolveStrike(pending.k, pending.targetEnemy, pending.hitTower)
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

    if (this.current) {
      this.current.t += dt
      this._tick(dt)
      if (this.current.t >= this.current.dur) this._end()
    } else {
      this.timer -= dt
      if (this.timer <= 0) this._tryStart(p)
    }

    this._updateDrops(dt)
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
    const cut = amount * (1 - (engine.antiBreak || 0))
    const w = Math.max(HAIL_FLOOR, top.width - cut)
    if (w >= top.width - 0.05) return
    top.width = w
    engine.currentWidth = Math.min(engine.currentWidth, w)
    if (engine.attackSystem) {
      engine.attackSystem.damageLayer(top.index, amount * 0.65, 'bird')
    }
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
    Audio.hailImpact()
    engine._emit()
  }

  // 雷电落点：同一道闪电既可能劈掉楼层，也可能击中捣乱飞行物。
  _strike(k) {
    const engine = this.engine
    const enemyPool = engine.attackSystem
      ? engine.attackSystem.events.filter((ev) => ev.state === 'active')
      : []
    const targetEnemy = enemyPool.length > 0 && Math.random() < 0.28 + 0.08 * k
      ? enemyPool[Math.floor(Math.random() * enemyPool.length)]
      : null
    const hitTower = engine.floors > 0 && Math.random() < 0.34 + 0.1 * k

    // 用多个明暗脉冲代替一次性白屏，模拟雷声伴随的忽明忽暗。
    this.flash = 0.78
    this.blind = 0.78
    this.flashPhase = Math.random() * Math.PI * 2

    const x0 = targetEnemy ? targetEnemy.x + (Math.random() - 0.5) * 80 : 40 + Math.random() * 340
    const targetY = targetEnemy
      ? clamp(engine.screenY(targetEnemy.wy), 100, 620)
      : 200 + Math.random() * 380
    const segs = [{ x: x0, y: -10 }]
    let x = x0
    let y = -10
    while (y < targetY) {
      y += 24 + Math.random() * 40
      x += (Math.random() - 0.5) * 70
      segs.push({ x, y })
    }
    this.bolt = { segs, life: 0.34 }
    Audio.thunder(1)

    // 给闪电一点落点延迟，让玩家先看见明暗闪烁，再看到破坏结果。
    const strike = { k, targetEnemy, hitTower }
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer)
      if (this.engine.status !== 'playing') return
      if (this.paused) this.pendingStrike = strike
      else this._resolveStrike(k, targetEnemy, hitTower)
    }, 150)
    this.pendingTimers.add(timer)
  }

  _resolveStrike(k, targetEnemy, hitTower) {
    const engine = this.engine
    let hit = false
    if (hitTower && !engine.dropping) {
      if (engine.petRuntime?.tryBlockLightning()) hit = true
      else hit = this._strikeTower() || hit
    }
    if (targetEnemy && engine.attackSystem && engine.attackSystem.isAlive(targetEnemy)) {
      engine.attackSystem.killEvent(targetEnemy, true)
      hit = true
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
    for (let i = 0; i < count; i++) {
      const block = engine.blocks.pop()
      if (block) removed.push(block)
    }
    if (removed.length === 0) return false

    if (engine.attackSystem) engine.attackSystem.remapAfterTowerChange(engine.blocks.length)
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
    const id = this.activeId
    // 雨雹
    if (this.drops.length) {
      ctx.save()
      for (const d of this.drops) {
        if (d.kind === 'rain') {
          ctx.strokeStyle = 'rgba(190,220,255,0.55)'
          ctx.lineWidth = 1.4
          ctx.beginPath()
          ctx.moveTo(d.x, d.y)
          ctx.lineTo(d.x - d.vx * 0.022, d.y - d.len)
          ctx.stroke()
        } else {
          ctx.fillStyle = 'rgba(225,245,255,0.92)'
          ctx.beginPath()
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = 'rgba(255,255,255,0.6)'
          ctx.beginPath()
          ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.restore()
    }

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

    // 闪电线
    if (this.bolt) {
      const a = clamp(this.bolt.life / 0.32, 0, 1)
      ctx.save()
      ctx.globalAlpha = a
      ctx.strokeStyle = '#fffde7'
      ctx.shadowColor = '#fff59d'
      ctx.shadowBlur = 18
      ctx.lineWidth = 3.2
      ctx.beginPath()
      const s = this.bolt.segs
      ctx.moveTo(s[0].x, s[0].y)
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y)
      ctx.stroke()
      ctx.restore()
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
