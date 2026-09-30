import { Audio } from './audio.js'
import { ATTACK_CONFIG, MATERIAL_ATTACK_MODIFIERS } from '../data/attacks.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export class AttackSystem {
  constructor(engine) {
    this.engine = engine
    this.events = []
    this.timer = 5
    this.paused = false
    this.seq = 0
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
    const interval = Math.max(ATTACK_CONFIG.schedule.minInterval, (ATTACK_CONFIG.schedule.baseInterval - p * 4.5) * (e.level.enemyRate || 1))
    if (this.timer <= 0 && this.events.length < ATTACK_CONFIG.schedule.maxConcurrent && !e.dropping && e.moving) {
      this.spawnRandom(p)
      this.timer = interval + Math.random() * 2
    }
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i]
      ev.t += dt
      if (ev.state === 'done') { this.events.splice(i, 1); continue }
      if (ev.state === 'warn' && ev.t >= ev.warning) { ev.state = 'active'; ev.t = 0; this.activate(ev) }
      if (ev.state === 'active') this.tick(ev, dt)
    }
  }

  spawnRandom(p) {
    const weather = this.engine.weather?.activeId
    const pool = ['bird']
    if (p >= ATTACK_CONFIG.ufo.unlock) pool.push('ufo')
    if (p >= ATTACK_CONFIG.plane.unlock && ['rain', 'hail', 'storm'].includes(weather)) pool.push('plane')
    const type = pool[Math.floor(Math.random() * pool.length)]
    const target = this.pickTarget(type)
    if (!target) return
    const id = ++this.seq
    const dir = Math.random() < 0.5 ? 1 : -1
    const top = target.index
    const ev = {
      id, type, state: 'warn', t: 0, warning: ATTACK_CONFIG[type].warning,
      targetIndex: top, dir, x: dir > 0 ? -52 : 472, y: this.engine.worldY(top) - (type === 'ufo' ? 100 : 72),
      vx: dir * (type === 'bird' ? ATTACK_CONFIG.bird.speed : ATTACK_CONFIG.plane.speed),
      absorb: 0, absorbDuration: this.absorbDuration(), hit: false, nextTargetAt: 0,
      locked: new Set([top])
    }
    this.events.push(ev)
    Audio.enemyCue(type)
  }

  pickTarget(type) {
    const used = new Set(this.events.filter((e) => e.state !== 'done').map((e) => e.targetIndex))
    const list = this.getVisibleTargets().filter((b) => !used.has(b.index))
    if (!list.length) return null
    return list[Math.floor(Math.random() * list.length)]
  }

  activate(ev) {
    if (ev.type === 'ufo') { ev.absorb = 0; Audio.beam(); this.engine._spawnFloat(this.engine.blocks[ev.targetIndex]?.cx || 210, '牵引锁定!', '#7cf29b') }
  }

  tick(ev, dt) {
    const e = this.engine
    if (ev.type === 'bird' || ev.type === 'plane') {
      ev.x += ev.vx * dt
      const target = e.blocks.find((b) => b.index === ev.targetIndex)
      ev.y = target ? e.worldY(target.index) - (ev.type === 'plane' ? 30 : 65) : ev.y
      if (!ev.hit && ((ev.dir > 0 && ev.x > 210) || (ev.dir < 0 && ev.x < 210))) {
        ev.hit = true
        if (ev.type === 'bird') this.damageLayer(ev.targetIndex, ATTACK_CONFIG.bird.damage, 'bird')
        else this.crashPlane(ev)
      }
      if (ev.x < -90 || ev.x > 510) ev.state = 'done'
      return
    }
    if (ev.type === 'ufo') {
      const target = e.blocks.find((b) => b.index === ev.targetIndex)
      if (!target) { this.acquireNext(ev); return }
      ev.y = e.worldY(target.index) - 100
      ev.absorb += dt
      const progress = clamp(ev.absorb / ev.absorbDuration, 0, 1)
      target.attackProgress = progress
      target.width = Math.max(22, target.width * (1 - dt / ev.absorbDuration * 0.5))
      target.cx += (210 - target.cx) * clamp(dt * 0.45, 0, 1)
      if (progress >= 1) { e.removeAttackLayer(target.index, 'ufo'); this.acquireNext(ev) }
    }
  }

  absorbDuration() {
    const id = this.engine.material.id
    const m = MATERIAL_ATTACK_MODIFIERS[id] || MATERIAL_ATTACK_MODIFIERS.soil
    const base = ATTACK_CONFIG.ufo.absorbMin + Math.random() * (ATTACK_CONFIG.ufo.absorbMax - ATTACK_CONFIG.ufo.absorbMin)
    return base * m.ufo
  }

  acquireNext(ev) {
    const target = this.pickTarget('ufo')
    if (!target) { ev.state = 'done'; return }
    ev.targetIndex = target.index
    ev.absorb = 0
    ev.absorbDuration = this.absorbDuration()
    ev.locked.add(target.index)
  }

  damageLayer(index, amount, type) {
    const b = this.engine.blocks.find((x) => x.index === index)
    if (!b) return
    const mod = MATERIAL_ATTACK_MODIFIERS[this.engine.material.id] || MATERIAL_ATTACK_MODIFIERS.soil
    b.durability = Math.max(0, b.durability - amount * (mod[type] || 1))
    b.damageState = b.durability / b.maxDurability
    b.damageFlash = 0.35
    this.engine.shake = Math.max(this.engine.shake, type === 'bird' ? 4 : 8)
    Audio.hitEnemy()
    this.engine._spawnFloat(b.cx, `耐久 -${Math.round(amount)}`, '#ff9a7a', this.engine.worldY(index) - 16)
    if (b.durability <= 0) this.engine.collapseFrom(index, type)
    this.engine._emit()
  }

  crashPlane(ev) {
    const weather = this.engine.weather?.activeId || 'rain'
    const loss = ATTACK_CONFIG.plane.widthLoss[weather] || 0.1
    this.damageWidth(ev.targetIndex, loss, 'plane')
    this.damageWidth(ev.targetIndex - 1, loss * ATTACK_CONFIG.plane.secondMultiplier, 'plane')
    Audio.knock(true)
  }

  damageWidth(index, ratio, type) {
    const b = this.engine.blocks.find((x) => x.index === index)
    if (!b) return
    b.width = Math.max(22, b.width * (1 - ratio))
    this.engine.currentWidth = Math.min(this.engine.currentWidth, b.width)
    this.damageLayer(index, Math.max(2, b.maxDurability * ratio), type)
  }

  hitAt(x, y) {
    const e = this.engine
    let hit = false
    for (const ev of this.events) {
      if (ev.state !== 'active') continue
      const sy = e.screenY(ev.y)
      const ex = ev.type === 'ufo' ? 210 : ev.x
      const ey = ev.type === 'ufo' ? sy - 55 : sy
      if (Math.hypot(x - ex, y - ey) < (ev.type === 'plane' ? 34 : 24)) {
        ev.state = 'done'
        e.baseCoinSum += ev.type === 'ufo' ? 5 : 2
        Audio.hitEnemy()
        e.shake = Math.max(e.shake, 4)
        hit = true
      }
    }
    if (hit) e._emit()
    return hit
  }

  remapAfterTowerChange(removedFrom) {
    for (const ev of this.events) {
      if (ev.targetIndex >= removedFrom) ev.state = 'done'
    }
  }

  render(ctx) {
    const e = this.engine
    for (const ev of this.events) {
      const target = e.blocks.find((b) => b.index === ev.targetIndex)
      const sy = e.screenY(ev.y)
      ctx.save()
      if (ev.state === 'warn') {
        ctx.globalAlpha = 0.4 + 0.4 * Math.sin(e.time * 14)
        ctx.strokeStyle = ev.type === 'ufo' ? '#7cf29b' : '#ff7b67'
        ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(20, sy); ctx.lineTo(400, sy); ctx.stroke(); ctx.setLineDash([])
      }
      if (ev.type === 'bird' || ev.type === 'plane') {
        ctx.translate(ev.x, sy)
        ctx.fillStyle = ev.type === 'plane' ? '#d8e2ef' : '#ffb347'
        ctx.beginPath(); ctx.ellipse(0, 0, ev.type === 'plane' ? 28 : 15, ev.type === 'plane' ? 9 : 7, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = ev.type === 'plane' ? '#7890a8' : '#d76f36'; ctx.fillRect(-10, -3, 20, 5)
      } else if (ev.type === 'ufo') {
        ctx.translate(210, sy - 55)
        ctx.fillStyle = 'rgba(124,242,155,.16)'; ctx.beginPath(); ctx.moveTo(-42, 10); ctx.lineTo(42, 10); ctx.lineTo(20, 100); ctx.lineTo(-20, 100); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#7cf29b'; ctx.beginPath(); ctx.ellipse(0, 0, 35, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#d9fff0'; ctx.beginPath(); ctx.arc(0, -5, 13, Math.PI, 0); ctx.fill()
      }
      ctx.restore()
      if (target && ev.type === 'ufo') {
        const y = e.screenY(e.worldY(target.index)) - 7
        const x = target.cx + e.swayOffset(target.index) - target.width / 2
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x, y, target.width, 3)
        ctx.fillStyle = '#7cf29b'; ctx.fillRect(x, y, target.width * clamp(target.attackProgress || 0, 0, 1), 3)
      }
    }
  }

  pause() { this.paused = true }
  resume() { this.paused = false }
  destroy() { this.events = []; this.engine = null }
}
