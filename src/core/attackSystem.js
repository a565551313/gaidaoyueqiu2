// 施工危机事件系统：承重切断器、落位封锁器与地基破拆机。
// 事件流程：完整预告 → 最终倒数/承压窗 → 结算或反制 → 恢复。
// 目标绑定楼层对象引用；一次 pointerdown 命中设备只中止事件，不再落层。

import { Audio } from './audio.js'
import { EVENT_CONFIG, EVENT_SCHEDULES } from '../data/attacks.js'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const LOGICAL_W = 420
const BLOCK_H = 28
const EVENT_TITLES = {
  cutter: '承重切断器',
  blocker: '落位封锁器',
  drill: '地基破拆机'
}

export class AttackSystem {
  constructor(engine) {
    this.engine = engine
    this.events = []
    this.seq = 0
    this.paused = false
    this.script = EVENT_SCHEDULES[engine.level.id] || []
    this.scriptIndex = 0
    this.manualDropsSinceEvent = 99
    this.lastEventEndedTime = -Infinity
    this.safeUntil = 0
    this.chainDue = null
    this.chainType = null
    this.inputScale = 1
    this.destroyed = false
    this.lastHudSignature = ''
  }

  get currentEvent() {
    return this.events.find((event) => event.state !== 'done') || null
  }

  setLayoutScale(scale) {
    const wasSafe = this.layoutSafe()
    this.inputScale = Number.isFinite(scale) && scale > 0 ? scale : 1
    if (wasSafe !== this.layoutSafe()) this.engine?._emit()
  }

  layoutSafe() {
    // 窄屏上设备轨道与塔/待落块热区无法充分分离时，宁可延期。
    return this.inputScale >= 0.8
  }

  getVisibleTargets() {
    const e = this.engine
    return e.blocks.filter((block) => {
      const y = e.screenY(e.worldY(block.index))
      return block.index >= 0 && y > -BLOCK_H && y < 760
    })
  }

  update(dt) {
    if (this.destroyed || this.paused || this.engine.status !== 'playing') return
    const e = this.engine
    this._updateDamageFlashes(dt)

    let event = this.currentEvent
    if (!event) {
      event = this._tryStartScheduledEvent()
      if (!event) return
    }

    const pauseReason = this._pauseReason(event)
    if (pauseReason) {
      if (event.pausedReason !== pauseReason) {
        event.pausedReason = pauseReason
        this._emitHudIfChanged()
      }
      return
    }
    if (event.pausedReason) {
      const previousReason = event.pausedReason
      event.pausedReason = ''
      if (previousReason === 'auto') {
        event.state = 'warn'
        event.remaining = event.warning
        event.final = false
        event.phaseLabel = '完整预告'
      } else if (previousReason === 'sequence') {
        event.remaining = Math.max(event.remaining, 1.2)
      } else if (previousReason === 'drop') {
        event.remaining = Math.max(event.remaining, 0.75)
      }
      this._emitHudIfChanged()
    }

    if (event.state === 'warn') {
      event.remaining = Math.max(0, event.remaining - dt)
      event.final = event.remaining <= event.finalWindow
      event.phaseLabel = event.final ? '最终倒数' : '完整预告'
      if (event.remaining <= 0) this._onWarningComplete(event)
    } else if (event.state === 'pressure') {
      event.remaining = Math.max(0, event.remaining - dt)
      if (event.remaining <= 0) this._settleDrill(event)
    }
    this._emitHudIfChanged()
  }

  _updateDamageFlashes(dt) {
    for (const block of this.engine.blocks) {
      if (block.damageFlash > 0) block.damageFlash = Math.max(0, block.damageFlash - dt)
    }
  }

  _pauseReason(event) {
    const e = this.engine
    if (!this.layoutSafe()) return 'layout'
    if (e.dropping) return 'drop'
    if (e.autoRemaining > 0) return 'auto'
    if (e.autoSeqActive) return 'sequence'
    if (e.weather?.hasGameplayThreat) return 'weather'
    return ''
  }

  _tryStartScheduledEvent() {
    const e = this.engine
    if (e.status !== 'playing' || e.dropping || e.autoSeqActive || e.autoRemaining > 0) return null
    if (e.time < this.safeUntil || !this.layoutSafe() || e.weather?.hasGameplayThreat) return null

    if (this.chainDue != null) {
      if (e.floors / Math.max(1, e.level.target) >= 0.92) {
        this.chainDue = null
        this.chainType = null
        this.scriptIndex = this.script.length
        return null
      }
      if (e.time < this.chainDue) return null
      const type = this.chainType
      this.chainDue = null
      this.chainType = null
      return this.spawn(type, { chain: false })
    }

    if (e.floors / Math.max(1, e.level.target) >= 0.92) {
      this.scriptIndex = this.script.length
      return null
    }
    const next = this.script[this.scriptIndex]
    if (!next || e.floors / Math.max(1, e.level.target) < next.at) return null
    if (e.time - this.lastEventEndedTime < 8 || this.manualDropsSinceEvent < 6) return null
    this.scriptIndex++
    return this.spawn(next.type, { chain: next.chain || false, warning: next.warning })
  }

  spawn(type, options = {}) {
    if (!EVENT_CONFIG[type] || this.currentEvent) return null
    const e = this.engine
    const top = e.blocks[e.blocks.length - 1]
    if (!top) return null
    if (type === 'cutter' && e.floors < 3) return null

    const config = EVENT_CONFIG[type]
    let targetBlock = null
    let window = null
    if (type === 'cutter') {
      const lowestDistance = Math.min(4, Math.max(2, e.floors))
      const distance = 2 + (this.seq % Math.max(1, lowestDistance - 1))
      const targetIndex = Math.max(0, top.index - distance)
      targetBlock = e.blocks.find((block) => block.index === targetIndex) || e.blocks[0]
    } else if (type === 'blocker') {
      const roofX = top.cx + e.swayOffset(top.index)
      const width = clamp(top.width * config.windowFraction, config.windowMin, config.windowMax)
      window = { center: roofX, width, left: roofX - width / 2, right: roofX + width / 2 }
    }

    const side = (this.seq + (e.level.id || 1)) % 2 === 0 ? -1 : 1
    const event = {
      id: ++this.seq,
      type,
      title: EVENT_TITLES[type],
      config,
      state: 'warn',
      phaseLabel: '完整预告',
      t: 0,
      warning: options.warning || config.warning,
      remaining: options.warning || config.warning,
      finalWindow: config.finalWindow,
      final: false,
      side,
      x: side < 0 ? 31 : LOGICAL_W - 31,
      targetBlock,
      targetId: targetBlock ? targetBlock.id ?? null : null,
      window,
      chain: options.chain || false,
      settled: false,
      pausedReason: '',
      hitRadius: config.hitRadius,
      createdAt: e.time
    }
    this.events.push(event)
    Audio.deviceCue(type)
    const topY = e.screenY(e.worldY(top.index))
    e._spawnFloat(event.x, `${event.title} · 已锁定`, config.color, topY - 30)
    e._emit()
    return event
  }

  _onWarningComplete(event) {
    if (!this._isCurrent(event)) return
    if (event.type === 'cutter') {
      this._settleCutter(event)
    } else if (event.type === 'blocker') {
      event.state = 'closed'
      event.phaseLabel = '窗口已封锁 · 等待下一次手动落层'
      event.remaining = 0
      this.engine._spawnFloat(event.window.center, '落点封锁 · 下一次手动落层', event.config.color)
      this.engine._emit()
    } else {
      event.state = 'pressure'
      event.phaseLabel = '绿色承压窗'
      event.remaining = event.config.pressureWindow
      event.final = true
      this.engine._spawnFloat(LOGICAL_W / 2, '精准完美落层可稳住地基!', '#7cf29b')
      this.engine._emit()
    }
  }

  _isCurrent(event) {
    return !!event && !event.settled && this.currentEvent === event
  }

  _targetIsAlive(event) {
    return !!event.targetBlock && this.engine.blocks.includes(event.targetBlock)
  }

  getExpectedLoss(event = this.currentEvent) {
    if (!event || event.type !== 'cutter' || !this._targetIsAlive(event)) return 0
    if (event.targetBlock.index === 0) return this.engine.floors
    return this.engine.blocks.filter((block) => block.index >= event.targetBlock.index && block.index > 0).length
  }

  landingWindowFor(type) {
    const event = this.currentEvent
    if (type !== 'manual' || !event || event.type !== 'blocker' || event.state !== 'closed') return null
    return { ...event.window, eventId: event.id }
  }

  onPlacementResolved({ type, isPerfect, windowApplied = false } = {}) {
    if (type === 'manual') this.manualDropsSinceEvent++
    const event = this.currentEvent
    if (!event) return

    if (event.type === 'blocker') {
      if (event.state === 'closed' && windowApplied) {
        this._finishEvent(event, { reward: 1, neutralized: true, message: '封锁窗口落位成功', color: '#7cf29b' })
      } else if (event.state === 'warn' && type === 'manual') {
        this._finishEvent(event, { neutralized: true, message: '抢先落层 · 封锁解除', color: '#9fdcff' })
      }
      return
    }

    if (event.type === 'drill' && event.state === 'pressure' && type === 'manual' && isPerfect) {
      this.engine.petRuntime?.addCharge(1)
      this._finishEvent(event, { reward: 0, neutralized: true, message: '承压成功 · 充能 +1', color: '#7cf29b' })
    }
  }

  afterDrop() {
    const event = this.currentEvent
    if (!event) return
    event.remaining = Math.max(event.remaining, 0.75)
  }

  _settleCutter(event) {
    if (!this._isCurrent(event)) return
    if (!this._targetIsAlive(event)) {
      this._finishEvent(event, { message: '锁定目标已失效 · 危机解除' })
      return
    }
    const target = event.targetBlock
    const fatal = target.index === 0
    if (fatal && this.engine.petRuntime?.tryBlockFatalEvent(event.type)) {
      this._finishEvent(event, { message: '铆钉犬自动中止致命结构事件', neutralized: true, color: '#7cf29b' })
      return
    }
    event.settled = true
    this._removeEvent(event)
    this._markEventEnded()
    this.engine.collapseFromBlock(target, 'cutter')
    this.engine._emit()
  }

  _settleDrill(event) {
    if (!this._isCurrent(event)) return
    if (this.engine.petRuntime?.tryBlockFatalEvent(event.type)) {
      this._finishEvent(event, { message: '铆钉犬自动中止致命结构事件', neutralized: true, color: '#7cf29b' })
      return
    }
    event.settled = true
    this._removeEvent(event)
    this._markEventEnded()
    this.engine.collapseToFoundation('drill')
  }

  hitAt(x, y) {
    const event = this.currentEvent
    if (!event || event.settled) return false
    const e = this.engine
    const sy = e.screenY(this._deviceWorldY(event))
    const petBonus = (e.petRuntime?.effects.deviceHitBonusCss || 0) / this.inputScale
    const radius = Math.max(event.hitRadius * 1.5, 22 / this.inputScale) + petBonus
    if (Math.hypot(x - event.x, y - sy) > radius) return false
    this._finishEvent(event, {
      reward: event.config.cancelCoins,
      neutralized: true,
      message: `${event.title}已中止`,
      color: '#7cf29b'
    })
    Audio.deviceAbort()
    return true
  }

  _finishEvent(event, { reward = 0, neutralized = false, message = '', color = event?.config?.color } = {}) {
    if (!this._isCurrent(event)) return false
    event.settled = true
    const e = this.engine
    if (neutralized) {
      const petReward = e.petRuntime?.onEventNeutralized() || { bonusCoins: 0 }
      reward += petReward.bonusCoins
    }
    if (reward > 0) e.baseCoinSum += reward
    if (message) e._spawnFloat(event.x, reward > 0 ? `${message} · +${reward} 金币` : message, color)
    Audio.deviceResolve()
    this._removeEvent(event)
    this._markEventEnded(event)
    e._emit()
    return true
  }

  _removeEvent(event) {
    const index = this.events.indexOf(event)
    if (index >= 0) this.events.splice(index, 1)
  }

  _markEventEnded(event = null) {
    this.lastEventEndedTime = this.engine.time
    this.manualDropsSinceEvent = 0
    if (event?.chain) {
      this.chainType = 'drill'
      this.chainDue = this.engine.time + 3
    }
  }

  remapAfterTowerChange() {
    const event = this.currentEvent
    if (!event || event.type !== 'cutter') return
    // 永不按重排后的数组索引重定向；目标对象消失就安全撤销。
    if (!this._targetIsAlive(event)) this._finishEvent(event, { message: '锁定楼层已移除 · 危机解除' })
  }

  resetAfterRevive() {
    this.clearEvents()
    this.safeUntil = this.engine.time + 2.5
    this.chainDue = null
    this.chainType = null
    this.manualDropsSinceEvent = 0
    this.lastEventEndedTime = this.engine.time
    this.engine._spawnFloat(LOGICAL_W / 2, '安全重整 · 2.5 秒', '#9fdcff')
  }

  clearEvents() {
    this.events.length = 0
    this.lastHudSignature = ''
  }

  hudState() {
    const event = this.currentEvent
    if (!event) return null
    const remaining = Math.max(0, event.remaining)
    let consequence = ''
    if (event.type === 'cutter') {
      const loss = this.getExpectedLoss(event)
      const start = event.targetBlock?.index ?? 0
      consequence = start === 0 ? `命中地基：预计全塔坍塌 ${loss} 层` : `命中：从第 ${start} 层起，预计坍塌 ${loss} 层`
    } else if (event.type === 'blocker') {
      consequence = event.state === 'closed'
        ? `下一次手动落层只保留框内重叠 · 窗宽 ${Math.round((event.window?.width || 0) / 1.2)}`
        : '可抢先落层解除，或中止设备'
    } else {
      consequence = event.state === 'pressure'
        ? '承压窗内手动完美落层可阻止全塔坍塌'
        : '倒数归零：从地基起全塔坍塌'
    }
    const hud = {
      id: event.id,
      type: event.type,
      title: event.title,
      state: event.state,
      phase: event.pausedReason ? 'paused' : event.phaseLabel,
      pausedReason: event.pausedReason,
      remaining: event.state === 'closed' ? 0 : Number(remaining.toFixed(1)),
      consequence,
      expectedLoss: this.getExpectedLoss(event),
      targetFloor: event.targetBlock?.index ?? null,
      chainText: event.chain ? '本段结束后至少 3 秒进入地基破拆机' : '',
      windowWidth: event.window?.width || 0
    }
    return hud
  }

  _emitHudIfChanged() {
    const state = this.hudState()
    const signature = state ? JSON.stringify(state) : ''
    if (signature !== this.lastHudSignature) {
      this.lastHudSignature = signature
      this.engine._emit()
    }
  }

  _deviceWorldY(event) {
    const e = this.engine
    if (event.type === 'cutter' && this._targetIsAlive(event)) {
      return e.worldY(event.targetBlock.index) + BLOCK_H / 2
    }
    if (event.type === 'blocker') {
      const roof = e.blocks[e.blocks.length - 1]
      return roof ? e.worldY(roof.index) + BLOCK_H + 18 : e.worldY(0)
    }
    return e.worldY(0) + BLOCK_H - 4
  }

  render(ctx) {
    const event = this.currentEvent
    if (!event) return
    const e = this.engine
    const y = e.screenY(this._deviceWorldY(event))
    if (event.type === 'cutter') this._renderCutterTarget(ctx, event)
    else if (event.type === 'blocker') this._renderLandingWindow(ctx, event)
    else this._renderFoundationPath(ctx, event)
    this._renderCountdown(ctx, event, y)
    this._renderDevice(ctx, event, y)
  }

  _renderCutterTarget(ctx, event) {
    if (!this._targetIsAlive(event)) return
    const e = this.engine
    const block = event.targetBlock
    const tx = block.cx + e.swayOffset(block.index)
    const ty = e.screenY(e.worldY(block.index))
    const lineEndX = event.side < 0 ? tx - block.width / 2 : tx + block.width / 2
    const deviceX = event.x + (event.side < 0 ? 20 : -20)
    ctx.save()
    ctx.strokeStyle = event.final ? '#ff7169' : '#ffd36b'
    ctx.lineWidth = event.final ? 3 : 2
    ctx.setLineDash(event.final ? [] : [7, 5])
    ctx.beginPath(); ctx.moveTo(deviceX, ty + BLOCK_H / 2); ctx.lineTo(lineEndX, ty + BLOCK_H / 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.lineWidth = 2
    ctx.strokeRect(tx - block.width / 2 - 4, ty - 3, block.width + 8, BLOCK_H + 6)
    ctx.fillStyle = '#fff4cf'
    ctx.font = 'bold 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`第 ${block.index} 层`, tx, ty - 8)
    ctx.restore()
  }

  _renderLandingWindow(ctx, event) {
    const roof = this.engine.blocks.at(-1)
    if (!roof || !event.window) return
    const e = this.engine
    const y = e.screenY(e.worldY(roof.index))
    const x = event.window.left
    const width = event.window.width
    ctx.save()
    ctx.fillStyle = 'rgba(56,255,177,0.22)'
    ctx.fillRect(x, y - 7, width, BLOCK_H + 14)
    ctx.strokeStyle = event.state === 'closed' ? '#72ffc0' : '#ffcf6b'
    ctx.lineWidth = event.final || event.state === 'closed' ? 3 : 2
    ctx.setLineDash(event.state === 'closed' ? [] : [6, 4])
    ctx.strokeRect(x, y - 7, width, BLOCK_H + 14)
    ctx.setLineDash([])
    ctx.fillStyle = '#eafff4'
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(event.state === 'closed' ? '封锁窗口' : '可承接窗口', event.window.center, y - 12)
    ctx.restore()
  }

  _renderFoundationPath(ctx, event) {
    const e = this.engine
    const base = e.blocks[0]
    if (!base) return
    const bx = base.cx
    const by = e.screenY(e.worldY(0)) + BLOCK_H / 2
    const dx = event.x
    const dy = e.screenY(this._deviceWorldY(event))
    ctx.save()
    ctx.strokeStyle = event.state === 'pressure' ? '#6dff9c' : '#ff6f6f'
    ctx.lineWidth = event.state === 'pressure' ? 4 : 2
    ctx.setLineDash(event.state === 'pressure' ? [] : [8, 6])
    ctx.beginPath(); ctx.moveTo(dx, dy + 20); ctx.lineTo(bx, by); ctx.stroke()
    ctx.setLineDash([])
    ctx.strokeStyle = '#7cffb2'
    ctx.lineWidth = 3
    ctx.strokeRect(bx - base.width / 2 - 7, by - BLOCK_H / 2 - 5, base.width + 14, BLOCK_H + 10)
    ctx.fillStyle = '#effff5'
    ctx.font = 'bold 12px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(event.state === 'pressure' ? '承压窗 · 完美落层' : '不可破坏地基', bx, by - 20)
    ctx.restore()
  }

  _renderDevice(ctx, event, y) {
    const x = event.x
    const pulse = 0.5 + 0.5 * Math.sin(this.engine.time * (event.final ? 16 : 7))
    const color = event.type === 'drill' ? (event.state === 'pressure' ? '#70ffa4' : '#ff6c68')
      : event.type === 'blocker' ? '#71f5c2' : '#ffd36b'
    ctx.save()
    ctx.translate(x, y + Math.sin(this.engine.time * 3 + event.id) * 2)
    ctx.shadowColor = color
    ctx.shadowBlur = event.final ? 16 + pulse * 8 : 8
    ctx.fillStyle = '#10253c'
    ctx.strokeStyle = color
    ctx.lineWidth = event.final ? 3 : 2
    ctx.beginPath(); ctx.rect(-18, -15, 36, 30); ctx.fill(); ctx.stroke()
    ctx.shadowBlur = 0
    if (event.type === 'cutter') {
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(0, 0, 8 + pulse * 1.5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#fff5cc'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke()
    } else if (event.type === 'blocker') {
      ctx.strokeStyle = color; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(-11, -7); ctx.lineTo(-3, 0); ctx.lineTo(-11, 7); ctx.moveTo(11, -7); ctx.lineTo(3, 0); ctx.lineTo(11, 7); ctx.stroke()
    } else {
      ctx.strokeStyle = color; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(-10, -7); ctx.lineTo(10, -7); ctx.moveTo(-6, -1); ctx.lineTo(6, -1); ctx.moveTo(-2, 5); ctx.lineTo(2, 5); ctx.stroke()
    }
    ctx.fillStyle = '#f4fbff'
    ctx.font = 'bold 9px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(event.type === 'cutter' ? '切' : event.type === 'blocker' ? '封' : '钻', 0, 27)
    // 可点击区域外扩且视觉上保持设备实体大小；焦点在命中语义，不是小弱点。
    ctx.restore()
  }

  _renderCountdown(ctx, event, y) {
    if (event.state === 'closed') return
    const text = event.state === 'pressure' ? `承压 ${event.remaining.toFixed(1)}s` : `${event.remaining.toFixed(1)}s`
    ctx.save()
    ctx.fillStyle = event.state === 'pressure' ? '#65ff98' : event.final ? '#ff7169' : '#fff2c6'
    ctx.font = event.final ? 'bold 16px system-ui, sans-serif' : 'bold 13px system-ui, sans-serif'
    ctx.textAlign = event.side < 0 ? 'left' : 'right'
    ctx.fillText(text, event.x + (event.side < 0 ? 24 : -24), y - 22)
    ctx.restore()
  }

  pause() { this.paused = true }
  resume() { this.paused = false }
  destroy() {
    this.clearEvents()
    this.destroyed = true
    this.engine = null
  }
}
