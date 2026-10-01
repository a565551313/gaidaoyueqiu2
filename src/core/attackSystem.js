// 统一的捣乱飞行物系统（唯一的敌人系统）。
// -------------------------------------------------------------
// 五种飞行物（飞鸟/老鹰/无人机/客机/UFO）都走同一套生命周期：
//   warn（入场警示）→ active（捣乱中）→ flee（离场）→ 移除
// 全部可以通过点击击退（判定半径放宽 1.6 倍照顾手指精度），
// 击退奖励与 README 一致：鸟 2 / 鹰 3 / 无人机 3 / 客机 4 / UFO 5 金币，
// UFO 额外奖励 1 点充能。
// 同屏最多 2 个且不重复类型；自动叠层（烈焰/追击）期间不刷新。
// 视觉复用 GameEngine 的绘制方法（_drawBird/_drawEagle/...）。

import { Audio } from './audio.js'
import { ATTACK_CONFIG, MATERIAL_ATTACK_MODIFIERS } from '../data/attacks.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// 待落方块瞄准线高度 = BLOCK_H(28) + AIM_RISE(170)，与 gameEngine 保持一致。
// 客机在这条线上巡航（气流才会真的擦到待落方块）。
const AIM_LINE_OFF = 198

const BURST_COLORS = {
  bird: ['#ff8f3c', '#ffe082'],
  eagle: ['#8d6e63', '#eceff1'],
  drone: ['#90a4ae', '#40c4ff'],
  plane: ['#eceff1', '#ff8f3c'],
  ufo: ['#7cf29b', '#4dd0e1']
}

export class AttackSystem {
  constructor(engine) {
    this.engine = engine
    this.events = []
    this.timer = 4 // 首个捣乱者更早登场
    this.paused = false
    this.seq = 0
    this.hintShown = false
  }

  getVisibleTargets() {
    const e = this.engine
    return e.blocks.filter((b) => {
      const y = e.screenY(e.worldY(b.index))
      return y > -34 && y < 700 && b.index > 0 && b.durability > 0
    })
  }

  update(dt) {
    if (this.paused || this.engine.status !== 'playing') return
    const e = this.engine
    for (const block of e.blocks) {
      if (block.damageFlash > 0) block.damageFlash = Math.max(0, block.damageFlash - dt)
    }
    this.timer -= dt
    const p = clamp(e.floors / e.level.target, 0, 1)
    const sched = ATTACK_CONFIG.schedule
    const interval = Math.max(sched.minInterval, (sched.baseInterval - p * 4.5) * (e.level.enemyRate || 1))
    const actives = this.events.filter((ev) => ev.state !== 'flee')
    if (this.timer <= 0 && actives.length < sched.maxConcurrent && !e.dropping && e.moving && !e.autoSeqActive) {
      this.spawnRandom(p)
      this.timer = interval + Math.random() * 2
    }
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i]
      ev.t += dt
      if (ev.hitFlash > 0) ev.hitFlash -= dt
      if (ev.state === 'done') { this.events.splice(i, 1); continue }
      if (ev.state === 'warn') {
        if (ev.t >= ev.warning) { ev.state = 'active'; ev.t = 0; this.activate(ev) }
        continue
      }
      if (ev.state === 'flee') {
        ev.x += ev.vx * dt
        ev.wy += ev.vy * dt
        const sy = e.screenY(ev.wy)
        if (ev.x < -90 || ev.x > 510 || sy < -90 || sy > 810) this.events.splice(i, 1)
        continue
      }
      this.tickActive(ev, dt)
    }
  }

  // ---------------- 生成 ----------------

  spawnRandom(p) {
    const e = this.engine
    const shift = e.level.enemyShift || 0
    const weather = e.weather ? e.weather.activeId : null
    const exist = new Set(this.events.filter((ev) => ev.state !== 'flee').map((ev) => ev.type))
    const pool = []
    for (const [type, def] of Object.entries(ATTACK_CONFIG.enemies)) {
      if (exist.has(type)) continue // 同屏不重复类型
      if (p < Math.max(0, def.unlock - shift)) continue // 未到解锁进度
      if (def.weatherOnly && !def.weatherOnly.includes(weather)) continue
      pool.push(type)
    }
    if (pool.length === 0) return
    let total = 0
    for (const t of pool) total += ATTACK_CONFIG.enemies[t].weight
    let r = Math.random() * total
    let type = pool[0]
    for (const t of pool) {
      r -= ATTACK_CONFIG.enemies[t].weight
      if (r <= 0) { type = t; break }
    }
    this.spawn(type)
  }

  spawn(type) {
    const e = this.engine
    const def = ATTACK_CONFIG.enemies[type]
    if (!def) return
    const topIndex = e.blocks.length - 1
    const dir = Math.random() < 0.5 ? 1 : -1
    const ev = {
      id: ++this.seq,
      type,
      def,
      state: 'warn',
      t: 0,
      warning: def.warning,
      hp: def.hp,
      maxHp: def.hp,
      dir,
      side: Math.random() < 0.5 ? -1 : 1, // 老鹰悬停侧 / 风向
      x: 0,
      wy: 0,
      vx: 0,
      vy: 0,
      bob: Math.random() * Math.PI * 2,
      hitFlash: 0,
      knocked: false, // 一次性冲撞是否已触发
      hit: false, // 一次性攻击是否已触发
      diving: false, // 客机是否正在俯冲
      diveT: 0,
      arrived: false, // 是否到达悬停位
      beamOn: false,
      streakT: 0,
      absorb: 0,
      absorbDuration: type === 'ufo' ? this.absorbDuration() : 0,
      targetIndex: topIndex
    }
    if (type === 'bird' || type === 'plane') {
      const target = this.pickTarget()
      if (!target) return
      ev.targetIndex = target.index
      ev.x = dir > 0 ? -52 : 472
      ev.vx = dir * def.speed
      // 鸟贴着目标层飞（啄击就发生在玩家看到的那一层）；
      // 客机先在与待落方块同高的巡航线上飞，到标记层上方再俯冲坠毁。
      ev.wy = type === 'bird' ? e.worldY(target.index) - 12 : e.worldY(topIndex) - AIM_LINE_OFF
    } else if (type === 'eagle' || type === 'drone') {
      ev.x = dir > 0 ? -52 : 472
      ev.wy = e.worldY(topIndex) - def.hover
    } else if (type === 'ufo') {
      // UFO 从画面上方降临，锁定楼顶
      ev.x = 210 + (Math.random() - 0.5) * 120
      ev.wy = e.worldY(topIndex) - 460
    }
    this.events.push(ev)
    Audio.enemyCue(type)

    if (!this.hintShown) {
      this.hintShown = true
      const top = e.blocks[topIndex]
      if (top) e._spawnFloat(top.cx, '点击捣乱者击退!', '#ffab40')
    }
  }

  pickTarget() {
    const used = new Set(this.events.filter((ev) => ev.state !== 'done').map((ev) => ev.targetIndex))
    const list = this.getVisibleTargets().filter((b) => !used.has(b.index))
    if (!list.length) return null
    return list[Math.floor(Math.random() * list.length)]
  }

  activate(ev) {
    // 入场音已在 warn 前播放；这里留给各类型额外的登场提示
    const e = this.engine
    if (ev.type === 'ufo') {
      const top = e.blocks[e.blocks.length - 1]
      if (top) e._spawnFloat(top.cx, '牵引锁定!', '#7cf29b')
    }
  }

  // ---------------- 行为 ----------------

  tickActive(ev, dt) {
    const e = this.engine
    const def = ev.def
    const topIndex = e.blocks.length - 1
    const top = e.blocks[topIndex]
    const topCx = top ? top.cx + e.swayOffset(topIndex) : 210

    if (ev.type === 'bird' || ev.type === 'plane') {
      // 落块动画期间原地悬停等待：
      //  - 攻击绝不因动画被吞掉（修复“出现了却什么都不做就走了”）
      //  - 也不会在动画中途改变塔身，保证“点击瞬间所见 = 最终判定”
      if (e.dropping) return
      const target = e.blocks.find((b) => b.index === ev.targetIndex)

      if (ev.type === 'bird') {
        // 贴着目标层顶低空掠过：撞击就发生在玩家看到的那一层
        ev.x += ev.vx * dt
        if (target) ev.wy = e.worldY(target.index) - 12
        if (!ev.hit && target && ((ev.dir > 0 && ev.x > target.cx) || (ev.dir < 0 && ev.x < target.cx))) {
          ev.hit = true
          this.damageLayer(ev.targetIndex, def.damage, 'bird')
          this.impactBurst(target.cx + e.swayOffset(target.index), e.worldY(target.index), ['#ff8f3c', '#ffe082'], 8, 120)
        }
        if (ev.x < -90 || ev.x > 510) ev.state = 'done'
        return
      }

      // 客机：先在与待落方块同高的巡航线上掠过（气流推偏方块），
      // 飞到标记楼层正上方时俯冲，坠毁爆炸就落在那一层。
      if (ev.diving) {
        ev.diveT += dt
        const ty = target ? e.worldY(target.index) - 6 : ev.wy - 320
        ev.wy += (ty - ev.wy) * clamp(dt * 9, 0, 1)
        ev.x += ev.vx * dt * 0.25
        if (ev.diveT >= 0.42) this.crashPlane(ev)
        return
      }
      ev.x += ev.vx * dt
      const cruiseY = e.worldY(topIndex) - AIM_LINE_OFF
      ev.wy += (cruiseY - ev.wy) * clamp(dt * 3, 0, 1)
      if (!ev.knocked && e.moving && Math.abs(ev.x - e.moving.cx) < 75) {
        ev.knocked = true
        e._nudgeMoving(ev.dir * 22)
        e.shake = Math.max(e.shake, 6)
        Audio.knock(true)
        if (e.moving) e._spawnFloat(e.moving.cx, '气流!', '#ffab40', ev.wy + 20)
      }
      if (!ev.hit && target && ((ev.dir > 0 && ev.x > target.cx) || (ev.dir < 0 && ev.x < target.cx))) {
        ev.hit = true
        ev.diving = true
        ev.diveT = 0
      }
      if (ev.x < -90 || ev.x > 510) ev.state = 'done'
      return
    }

    if (ev.type === 'eagle' || ev.type === 'drone' || ev.type === 'ufo') {
      // 悬停类始终跟随“当前楼顶”：玩家继续叠层时目标随之更新
      ev.targetIndex = topIndex
    }

    if (ev.type === 'eagle') {
      // 飞到楼顶侧上方悬停盘旋，持续扇风（风压通过 modifiers() 生效）
      const tx = topCx + ev.side * 95 + Math.sin(e.time * 1.5 + ev.bob) * 20
      const ty = e.worldY(topIndex) - def.hover
      ev.x += (tx - ev.x) * clamp(dt * 2.6, 0, 1)
      ev.wy += (ty - ev.wy) * clamp(dt * 2.6, 0, 1)
      if (!ev.arrived && Math.abs(ev.x - tx) < 26) {
        ev.arrived = true
        Audio.windGust()
        e._spawnFloat(ev.x, '狂风!', '#e3f2fd', ev.wy - 20)
      }
      if (ev.arrived) {
        ev.streakT -= dt
        if (ev.streakT <= 0) {
          ev.streakT = 0.12
          e.particles.push({
            wx: topCx + (Math.random() - 0.5) * 130,
            wy: e.worldY(topIndex) - 50 - Math.random() * 90,
            vx: -ev.side * 170,
            vy: 0,
            life: 0.4,
            maxLife: 0.4,
            size: 2,
            color: 'rgba(255,255,255,0.85)',
            gravity: false
          })
        }
      }
    } else if (ev.type === 'drone') {
      // 悬停漂移，发出干扰波让移动速度忽快忽慢（通过 modifiers() 生效）
      const tx = 210 + Math.sin(e.time * 0.7 + ev.bob) * 110
      const ty = e.worldY(topIndex) - def.hover
      ev.x += (tx - ev.x) * clamp(dt * 1.6, 0, 1)
      ev.wy += (ty - ev.wy) * clamp(dt * 1.6, 0, 1) + Math.sin(e.time * 2.4 + ev.bob) * 14 * dt
      if (!ev.arrived && ev.t > 1) {
        ev.arrived = true
        e._spawnFloat(ev.x, '干扰!', '#40c4ff', ev.wy - 20)
      }
    } else if (ev.type === 'ufo') {
      // 降临到楼顶上方，开启牵引光束蓄力吸走楼顶整层。
      // 只锁定楼顶：吸中间层会让楼身出现“上宽下窄”的悬浮结构。
      const ty = e.worldY(topIndex) - def.hover
      if (ev.t < 1.4) {
        ev.x += (topCx - ev.x) * clamp(dt * 1.6, 0, 1)
        ev.wy += (ty - ev.wy) * clamp(dt * 1.6, 0, 1)
      } else {
        ev.x += (topCx + Math.sin(e.time * 0.9 + ev.bob) * 30 - ev.x) * clamp(dt * 2, 0, 1)
        ev.wy = ty + Math.sin(e.time * 2 + ev.bob) * 6
        if (!ev.beamOn) {
          ev.beamOn = true
          Audio.beam()
          e._spawnFloat(topCx, '牵引光束!', '#7cf29b', ty + 24)
        }
        // 只清当前楼顶以外的进度条残留（玩家叠层后旧目标会留下冻结的进度条）
        for (const b of e.blocks) {
          if (b.index !== topIndex && b.attackProgress) b.attackProgress = 0
        }
        if (top && !e.dropping) {
          ev.absorb += dt
          const progress = clamp(ev.absorb / ev.absorbDuration, 0, 1)
          top.attackProgress = progress
          const w = Math.max(def.minWidth, top.width * (1 - (dt / ev.absorbDuration) * 0.5))
          if (w < top.width) {
            top.width = w
            e.currentWidth = Math.min(e.currentWidth, w)
          }
          // 被吸起的碎屑粒子
          ev.streakT -= dt
          if (ev.streakT <= 0) {
            ev.streakT = 0.09
            e.particles.push({
              wx: topCx + (Math.random() - 0.5) * top.width * 0.8,
              wy: e.worldY(topIndex) + Math.random() * 28,
              vx: (Math.random() - 0.5) * 20,
              vy: -90 - Math.random() * 50,
              life: 0.5,
              maxLife: 0.5,
              size: 2.5,
              color: '#7cf29b',
              gravity: false
            })
          }
          if (progress >= 1) {
            e.removeAttackLayer(top.index, 'ufo')
            this.flee(ev)
            return
          }
        }
      }
    }

    // 悬停类到点离场
    if (def.life > 0 && ev.t >= def.life) this.flee(ev)
  }

  flee(ev) {
    ev.state = 'flee'
    ev.beamOn = false
    if (ev.type === 'ufo') {
      // 撤走时清掉光束与进度条残留（目标层可能已被吃走或仍在）
      const t = this.engine.blocks.find((b) => b.index === ev.targetIndex)
      if (t) t.attackProgress = 0
      ev.vx = ev.side * 50
      ev.vy = -150
    } else if (ev.type === 'eagle') {
      ev.vx = ev.side * 70
      ev.vy = -140
    } else {
      ev.vx = ev.side * 60
      ev.vy = -110
    }
  }

  // 汇总对移动方块的影响：老鹰持续风压 + 无人机速度紊乱
  modifiers() {
    const e = this.engine
    let windX = 0
    let speedMod = 1
    for (const ev of this.events) {
      if (ev.state !== 'active' || !ev.arrived) continue // 到位后才开始捣乱
      if (ev.type === 'eagle') {
        windX += -ev.side * 52 // 把方块往远离老鹰的方向推
      } else if (ev.type === 'drone') {
        speedMod *= 1 + 0.55 * Math.sin(e.time * 3.2 + ev.bob)
      }
    }
    return { windX, speedMod }
  }

  // ---------------- 伤害 ----------------

  // 材质对 UFO 的抗性：系数越小，蓄力耗时越长（越抗吸）
  absorbDuration() {
    const id = this.engine.material.id
    const m = MATERIAL_ATTACK_MODIFIERS[id] || MATERIAL_ATTACK_MODIFIERS.soil
    const cfg = ATTACK_CONFIG.enemies.ufo
    const base = cfg.absorbMin + Math.random() * (cfg.absorbMax - cfg.absorbMin)
    return base / (m.ufo || 1)
  }

  // 撞击点粒子爆发（啄击 / 坠毁爆炸共用）
  impactBurst(wx, wy, colors, n, speed) {
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6
      const sp = speed * (0.4 + Math.random() * 0.8)
      this.engine.particles.push({
        wx,
        wy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.45,
        maxLife: 0.45,
        size: 2 + Math.random() * 2.5,
        color: colors[k % colors.length],
        gravity: true
      })
    }
  }

  damageLayer(index, amount, type) {
    const b = this.engine.blocks.find((x) => x.index === index)
    if ((type === 'bird' || type === 'plane') && this.engine.petRuntime?.tryBlockDirectAttack(type === 'plane' ? '客机坠毁' : '飞鸟啄击')) {
      this.engine.shake = Math.max(this.engine.shake, 4)
      this.engine._emit()
      return
    }
    if (!b || b.index <= 0) return // 地基不可破坏
    const mod = MATERIAL_ATTACK_MODIFIERS[this.engine.material.id] || MATERIAL_ATTACK_MODIFIERS.soil
    const actual = amount * (mod[type] || 1)
    b.durability = Math.max(0, b.durability - actual)
    b.damageState = b.durability / b.maxDurability
    b.damageFlash = 0.35
    this.engine.shake = Math.max(this.engine.shake, type === 'bird' ? 4 : 8)
    Audio.hitEnemy()
    this.engine._spawnFloat(b.cx, `耐久 -${Math.round(actual)}`, '#ff9a7a', this.engine.worldY(index) - 16)
    if (b.durability <= 0) this.engine.collapseFrom(index, type)
    this.engine._emit()
  }

  crashPlane(ev) {
    const e = this.engine
    const def = ATTACK_CONFIG.enemies.plane
    const weather = e.weather ? e.weather.activeId : 'rain'
    const loss = def.widthLoss[weather] || 0.12
    const target = e.blocks.find((b) => b.index === ev.targetIndex)
    ev.state = 'done' // 客机已坠毁，不再若无其事地飞出屏幕
    if (!target) return
    // 坠毁爆炸：火光 + 浓烟 + 剧烈震屏，就炸在标记的那一层
    const ix = target.cx + e.swayOffset(target.index)
    const iy = e.worldY(target.index)
    this.impactBurst(ix, iy, ['#ff7043', '#ffd54f', '#cfd8dc'], 26, 200)
    for (let k = 0; k < 10; k++) {
      e.particles.push({
        wx: ix + (Math.random() - 0.5) * 44,
        wy: iy + Math.random() * 10,
        vx: (Math.random() - 0.5) * 60,
        vy: -26 - Math.random() * 55,
        life: 0.9,
        maxLife: 0.9,
        size: 5 + Math.random() * 5,
        color: 'rgba(110,116,128,0.5)',
        gravity: false
      })
    }
    e.shake = Math.max(e.shake, 11)
    e._spawnFloat(ix, '坠毁!', '#ff8a65', iy - 30)
    Audio.knock(true)
    Audio.debris()
    // 耐久伤害：目标层 + 相邻下层（地基不可破坏）
    const below = e.blocks.find((b) => b.index === ev.targetIndex - 1)
    if (below && below.index > 0) {
      this.damageLayer(below.index, Math.max(4, below.maxDurability * loss * def.secondMultiplier), 'plane')
    }
    this.damageLayer(ev.targetIndex, Math.max(4, target.maxDurability * loss), 'plane')
    // 只有目标层是楼顶时才削宽度，避免塔身出现“上宽下窄”的悬浮腰身
    const top = e.blocks[e.blocks.length - 1]
    if (top && top.index === ev.targetIndex) {
      top.width = Math.max(def.minWidth, top.width * (1 - loss))
      e.currentWidth = Math.min(e.currentWidth, top.width)
    }
  }

  // ---------------- 点击击退 ----------------

  hitAt(x, y) {
    const e = this.engine
    let best = null
    let bestD = Infinity
    for (const ev of this.events) {
      if (ev.state !== 'active') continue
      const sy = e.screenY(ev.wy)
      const d = Math.hypot(x - ev.x, y - sy)
      if (d <= ev.def.r * 1.6 && d < bestD) {
        best = ev
        bestD = d
      }
    }
    if (!best) return false

    best.hp -= 1 + (e.petRuntime ? e.petRuntime.rollExtraEnemyDamage() : 0)
    best.hitFlash = 0.14
    best.x += best.x >= x ? 6 : -6 // 被砸得稍微弹开
    Audio.hitEnemy()
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2
      e.particles.push({
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
    if (best.hp <= 0) this.killEvent(best)
    else e._emit()
    return true
  }

  killEvent(ev, zapped = false) {
    const e = this.engine
    const idx = this.events.indexOf(ev)
    if (idx >= 0) this.events.splice(idx, 1)
    const def = ev.def
    if (ev.type === 'ufo' && ev.beamOn) {
      const t = e.blocks.find((b) => b.index === ev.targetIndex)
      if (t) t.attackProgress = 0
    }
    // 掉金币（走本局金币结算，享技能与宠物加成）
    const petReward = e.petRuntime ? e.petRuntime.onEnemyKilled() : { bonusCoins: 0 }
    e.baseCoinSum += def.coins + petReward.bonusCoins
    const burst = BURST_COLORS[ev.type] || ['#ffffff', '#ffd54f']
    const n = 10 + def.hp * 6
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2
      const sp = 60 + Math.random() * 160
      e.particles.push({
        wx: ev.x,
        wy: ev.wy,
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
    if (zapped) e._spawnFloat(ev.x, '闪电击中!', '#fff59d', ev.wy - 24)
    e._spawnFloat(ev.x, `+${def.coins}`, '#ffd54f', ev.wy - 14)
    if (ev.type === 'ufo') {
      // UFO 额外奖励 1 点充能
      e.charge = Math.min(e.chargeCap, e.charge + 1)
      if (e.charge >= e.chargeCap && !e.chargeReady) {
        e.chargeReady = true
        Audio.chargeReady()
      }
      e._spawnFloat(ev.x, '充能+1', '#ff8a65', ev.wy - 40)
    }
    e.shake = Math.max(e.shake, 4)
    Audio.killEnemy()
    e._emit()
  }

  // 雷暴劈中捣乱飞行物（由 WeatherSystem 调用）
  zapRandom() {
    const pool = this.events.filter((ev) => ev.state === 'active')
    if (pool.length === 0) return false
    this.killEvent(pool[Math.floor(Math.random() * pool.length)], true)
    return true
  }

  // 事件是否仍然存活且在场（供雷暴延迟结算校验）
  isAlive(ev) {
    return this.events.includes(ev) && ev.state === 'active'
  }

  // ---------------- 塔体变化后的重定向 ----------------

  remapAfterTowerChange(removedFrom) {
    for (const ev of this.events) {
      if (ev.state === 'flee' || ev.state === 'done') continue
      if (ev.type === 'ufo') {
        // 光束锁定的楼层被劈掉/被吃走：中断蓄力，可见地撤离（不再凭空消失）
        if (ev.state === 'active' && ev.targetIndex >= removedFrom) this.flee(ev)
        continue
      }
      // 穿越类：目标层没了就换一个还在的楼层继续捣乱；实在没有就飞出屏幕
      if ((ev.type === 'bird' || ev.type === 'plane') && !ev.hit && ev.targetIndex >= removedFrom) {
        const t = this.pickTarget()
        ev.targetIndex = t ? t.index : -1
        ev.diving = false
        ev.diveT = 0
      }
    }
  }

  // ---------------- 渲染 ----------------

  render(ctx) {
    const e = this.engine
    for (const ev of this.events) {
      const sy = e.screenY(ev.wy)

      if (ev.state === 'warn') {
        this.renderWarn(ctx, ev, sy)
        continue
      }
      if (sy < -90 || sy > 810 || ev.x < -90 || ev.x > 510) continue

      ctx.save()
      ctx.translate(ev.x, sy)
      // UFO 光束画在机身下层
      if (ev.type === 'ufo' && ev.beamOn) this.renderUfoBeam(ctx, ev)
      const enemy = { def: ev.def, bob: ev.bob, dir: ev.dir, side: ev.side, beamOn: ev.beamOn, t: ev.t }
      if (ev.type === 'bird') e._drawBird(ctx, enemy, ev.dir > 0 ? 1 : -1)
      else if (ev.type === 'plane') e._drawPlane(ctx, enemy, ev.dir > 0 ? 1 : -1)
      else if (ev.type === 'eagle') {
        ctx.save()
        ctx.scale(-ev.side, 1) // 面向塔身
        e._drawEagle(ctx, enemy)
        ctx.restore()
      } else if (ev.type === 'drone') e._drawDrone(ctx, enemy)
      else if (ev.type === 'ufo') e._drawUfo(ctx, enemy)

      // 受击白闪
      if (ev.hitFlash > 0) {
        ctx.globalAlpha = clamp(ev.hitFlash * 6, 0, 0.85)
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(0, 0, ev.def.r + 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
      // 剩余血量点（多血量敌人显示）
      if (ev.maxHp > 1) {
        for (let k = 0; k < ev.maxHp; k++) {
          const px = (k - (ev.maxHp - 1) / 2) * 11
          ctx.beginPath()
          ctx.arc(px, -ev.def.r - 10, 3, 0, Math.PI * 2)
          ctx.fillStyle = k < ev.hp ? '#ffd54f' : 'rgba(0,0,0,0.3)'
          ctx.fill()
        }
      }
      ctx.restore()

      // UFO 蓄力进度条（画在目标楼层上方）
      if (ev.type === 'ufo' && ev.beamOn) {
        const target = e.blocks[e.blocks.length - 1]
        if (target && target.index === ev.targetIndex) {
          const y = e.screenY(e.worldY(target.index)) - 7
          const tx = target.cx + e.swayOffset(target.index)
          const x = tx - target.width / 2
          ctx.fillStyle = 'rgba(0,0,0,.5)'
          ctx.fillRect(x, y, target.width, 3)
          ctx.fillStyle = '#7cf29b'
          ctx.fillRect(x, y, target.width * clamp(target.attackProgress || 0, 0, 1), 3)
        }
      }
    }
  }

  renderWarn(ctx, ev, sy) {
    const e = this.engine
    if (ev.type === 'eagle' || ev.type === 'drone') {
      // 悬停类：屏幕边缘闪烁的感叹号箭头
      const blink = 0.5 + 0.5 * Math.sin(e.time * 14)
      const wx = clamp(ev.x, 22, 398)
      const wy = clamp(sy, 30, 690)
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
      return
    }
    // 目标类：横贯虚线 + 目标框 + 倒计时
    const target = e.blocks.find((b) => b.index === ev.targetIndex)
    ctx.save()
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(e.time * 14)
    ctx.strokeStyle = ev.type === 'ufo' ? '#7cf29b' : '#ff7b67'
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(20, sy)
    ctx.lineTo(400, sy)
    ctx.stroke()
    ctx.setLineDash([])
    if (target) {
      const tx = target.cx + e.swayOffset(target.index)
      const ty = e.screenY(e.worldY(target.index)) + 2
      const hw = Math.max(26, target.width * 0.5 + 6)
      ctx.strokeStyle = ev.type === 'ufo' ? '#7cf29b' : '#ff9a7a'
      ctx.lineWidth = 2
      ctx.strokeRect(tx - hw, ty, hw * 2, 22)
      ctx.fillStyle = ctx.strokeStyle
      ctx.font = 'bold 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`${Math.max(0, ev.warning - ev.t).toFixed(1)}s`, tx, ty - 6)
      ctx.textAlign = 'start'
    }
    ctx.restore()
  }

  renderUfoBeam(ctx, ev) {
    const e = this.engine
    const target = e.blocks.find((b) => b.index === ev.targetIndex)
    if (!target) return
    const targetY = e.screenY(e.worldY(target.index))
    const localTy = targetY - e.screenY(ev.wy)
    if (localTy <= 12) return
    const tx = target.cx + e.swayOffset(target.index) - ev.x
    const width = Math.max(24, target.width * 0.5)
    const flick = 0.72 + 0.28 * Math.sin(e.time * 9 + ev.bob)
    const grad = ctx.createLinearGradient(0, 0, 0, localTy)
    grad.addColorStop(0, `rgba(140,255,180,${0.48 * flick})`)
    grad.addColorStop(1, `rgba(140,255,180,${0.05 * flick})`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(-13, 6)
    ctx.lineTo(13, 6)
    ctx.lineTo(tx + width, localTy)
    ctx.lineTo(tx - width, localTy)
    ctx.closePath()
    ctx.fill()
  }

  pause() { this.paused = true }
  resume() { this.paused = false }
  destroy() { this.events = []; this.engine = null }
}
