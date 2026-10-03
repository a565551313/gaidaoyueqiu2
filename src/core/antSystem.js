import { ANT_PERSONALITIES, ANT_PROTOTYPE_CONFIG, ANT_SPECIES, FLOOR_WIDTH_MIN, antWavesForLevel } from '../data/ants.js'
import { ANT_ART, drawAnt, drawBiteSparks } from './antArt.js'

const BLOCK_H = 28
const LOGICAL_W = 420
const LOGICAL_H = 720
const {
  maxAlive: MAX_ANTS,
  maxTargetsPerFloor: MAX_TARGETS_PER_FLOOR,
  spawnGapSeconds: SPAWN_GAP_SECONDS,
  warningStaggerSeconds: WARNING_STAGGER_SECONDS,
  maxFloorBurstDamage: MAX_FLOOR_BURST_DAMAGE,
  floorDamageWindowSeconds: FLOOR_DAMAGE_WINDOW_SECONDS,
  minFloorAttackGapSeconds: MIN_FLOOR_ATTACK_GAP_SECONDS
} = ANT_PROTOTYPE_CONFIG
const WARNING_SECONDS = 1.2
const SEGMENT_INTERVAL = 1.8
// 受击后重新架起只付一个短促的再预备，而不是整轮从头来过
const REGRIP_SECONDS = 0.5
// 一轮里的第一段啃咬来得快一些，否则蚂蚁爬到位后还要干等满一个 SEGMENT_INTERVAL
const OPENING_INTERVAL = 0.9
const WIDTH_MIN = FLOOR_WIDTH_MIN

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const lerp = (a, b, t) => a + (b - a) * t

export const LANDING_QUALITY = Object.freeze({
  Perfect: { name: 'Perfect', hitFloors: 4 },
  Great: { name: 'Great', hitFloors: 3 },
  Good: { name: 'Good', hitFloors: 2 },
  Bad: { name: 'Bad', hitFloors: 1 },
  Miss: { name: 'Miss', hitFloors: 0 }
})

export function classifyLandingQuality({ rawOverlap, movingWidth, topWidth, centerOffset, perfectWindow }) {
  if (!(rawOverlap > 0)) return 'Miss'
  if (Math.abs(centerOffset) <= Math.max(0, perfectWindow)) return 'Perfect'
  const denominator = Math.min(movingWidth, topWidth)
  const ratio = denominator > 0 ? clamp(rawOverlap / denominator, 0, 1) : 0
  if (ratio >= 0.85) return 'Great'
  if (ratio >= 0.6) return 'Good'
  return 'Bad'
}

function progressOf(engine) {
  return engine.level.target > 0 ? engine.floors / engine.level.target : 0
}

export class AntSystem {
  constructor(engine) {
    this.engine = engine
    this.ants = []
    this.seq = 0
    this.landingSeq = 0
    this.paused = false
    this.attackClock = 0
    this.destroyed = false
    this.layoutScale = 1
    this.unreadableFor = 0
    this.lastHudSignature = ''
    this.waves = antWavesForLevel(engine.level).map((wave) => ({ ...wave, species: [...wave.species] }))
    this.waveIndex = 0
    this.waveGroupSeq = 0
    this.pendingWaveSpawns = []
    this.lastSpawnTime = -Infinity
    this.pendingQueenReinforcements = []
    this.cursorId = null
    this.cursorIndexHint = null
    this.settledSegments = new Set()
    this.hitKeys = new Set()
    this.floorAttackBudgets = new Map()
    this.rngState = ((Math.imul(engine.level.id || 1, 0x9e3779b1) ^ (engine.level.target || 0x85ebca6b)) >>> 0) || 1
    this.lastLandingQuality = ''
    this.lastLandingAt = -Infinity
    this.lastShockFloors = []
    this._towerSnapshot = null
  }

  random() {
    // Per-run xorshift32: target choice, species modifiers and route are reproducible.
    let x = this.rngState >>> 0
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.rngState = x >>> 0
    return this.rngState / 0x100000000
  }

  setLayoutScale(scale) {
    const wasSafe = this.layoutSafe()
    this.layoutScale = Number.isFinite(scale) && scale > 0 ? scale : 1
    if (wasSafe !== this.layoutSafe()) this.engine?._emit()
  }

  layoutSafe() {
    // 320 CSS px / 420 logical px is about 0.762; low-height phones may scale lower but remain legible.
    return this.layoutScale >= 0.58
  }

  pause() { this.paused = true }
  resume() { this.paused = false }

  _pauseReason() {
    const e = this.engine
    if (!this.layoutSafe()) return 'layout'
    if (e.dropping) return 'drop'
    if (e.autoRemaining > 0) return 'auto'
    if (e.autoSeqActive) return 'autoSequence'
    if (e.weather?.hasGameplayThreat) return 'weather'
    return ''
  }

  update(dt) {
    if (this.destroyed || this.paused || this.engine.status !== 'playing') return
    this.attackClock += Math.max(0, dt)
    const e = this.engine
    const reason = this._pauseReason()
    if (reason) {
      if (reason === 'layout') {
        this.unreadableFor += dt
        if (this.unreadableFor >= 1.2) this._cancelUnreadableWarnings()
      }
      return
    }
    this.unreadableFor = 0

    this._processWaveTriggers()
    this._processScheduledSpawns()
    this._processQueenReinforcements(dt)

    const atFinale = progressOf(e) >= 0.92
    for (const ant of [...this.ants]) {
      if (ant.hp <= 0 || ant.state === 'dead') continue
      if (atFinale && ['wait', 'rehang'].includes(ant.state)) {
        this._clearTarget(ant)
        ant.state = 'hold'
        ant.warningRemaining = 0
        ant.segmentRemaining = 0
        continue
      }
      this._updateAnt(ant, dt, atFinale)
    }
    this.ants = this.ants.filter((ant) => ant.hp > 0 && ant.state !== 'dead' && ant.state !== 'departed')
    this._emitHudIfChanged()
  }

  _cancelUnreadableWarnings() {
    for (const ant of this.ants) {
      if (ant.state === 'windup' || ant.state === 'bite' || ant.state === 'climb') {
        this._clearTarget(ant)
        ant.state = 'rehang'
        ant.rehangRemaining = 0.35
        ant.rehangFrom = ant.position
        ant.rehangReason = '布局不可读 · 重新定位'
      }
    }
    this.engine._emit()
  }

  _processWaveTriggers() {
    if (progressOf(this.engine) >= 0.92) {
      this.waveIndex = this.waves.length
      this.pendingWaveSpawns.length = 0
      return
    }
    while (this.waveIndex < this.waves.length && progressOf(this.engine) >= this.waves[this.waveIndex].at) {
      const wave = this.waves[this.waveIndex++]
      if (!wave.species.length) continue
      this.pendingWaveSpawns.push({
        species: wave.species[0],
        groupSpecies: [...wave.species],
        groupId: ++this.waveGroupSeq,
        index: 0,
        due: this.engine.time,
        source: 'wave'
      })
    }
  }

  _processScheduledSpawns() {
    const now = this.engine.time
    const pending = []
    for (const slot of this.pendingWaveSpawns) {
      if (now < slot.due) {
        pending.push(slot)
        continue
      }
      if (progressOf(this.engine) >= 0.92 || this.ants.length >= MAX_ANTS || now - this.lastSpawnTime < SPAWN_GAP_SECONDS) continue
      if (!this.spawn(slot.species, { source: slot.source })) continue
      this.lastSpawnTime = now
      const nextIndex = slot.index + 1
      if (nextIndex < slot.groupSpecies.length) {
        pending.push({ ...slot, species: slot.groupSpecies[nextIndex], index: nextIndex, due: now + SPAWN_GAP_SECONDS })
      }
    }
    this.pendingWaveSpawns = pending
  }

  _processQueenReinforcements(dt) {
    for (let i = this.pendingQueenReinforcements.length - 1; i >= 0; i--) {
      const pending = this.pendingQueenReinforcements[i]
      pending.remaining = Math.max(0, pending.remaining - dt)
      if (pending.remaining > 0) continue
      this.pendingQueenReinforcements.splice(i, 1)
      const now = this.engine.time
      if (progressOf(this.engine) >= 0.92 || this.ants.length >= MAX_ANTS || now - this.lastSpawnTime < SPAWN_GAP_SECONDS) continue
      if (this.spawn('worker', { source: 'queen-reinforcement', route: 'up', position: 1 })) this.lastSpawnTime = now
    }
  }

  spawn(speciesId = 'worker', options = {}) {
    const species = ANT_SPECIES[speciesId]
    if (!species || this.destroyed || this.engine.status !== 'playing') return null
    if (this.ants.length >= MAX_ANTS || (progressOf(this.engine) >= 0.92 && !options.force)) return null
    const floors = this.engine.blocks.filter((block) => block.index > 0)
    if (!floors.length) return null
    const route = options.route || (this.random() < 0.72 ? 'up' : 'down')
    const top = floors[floors.length - 1]
    // 'up' 的蚂蚁原本一律从第 1 层起步，而镜头只跟着塔顶。
    // 六十层的塔按 1.8 层/秒要爬三十多秒，整段都在屏幕外 ——
    // 实测蚂蚁 53.5% 的在场时间耗在赶路上，玩家连它们都看不见。
    // 改为从画面下沿进场：既缩短通勤，也让威胁在玩家眼皮底下逼近。
    const visibleFloors = Math.ceil(LOGICAL_H / BLOCK_H)
    const entry = route === 'up'
      ? Math.max(floors[0].index, top.index - visibleFloors + 3)
      : top.index
    const pos = clamp(options.position ?? entry, 0, top.index)
    const personalityId = Object.hasOwn(options, 'personality')
      ? options.personality
      : this._rollPersonality()
    const personality = ANT_PERSONALITIES[personalityId] || null
    const ant = {
      id: ++this.seq,
      speciesId,
      species,
      hp: species.hp,
      maxHp: species.hp,
      personalityId: personality?.id || '',
      personality,
      hitCount: 0,
      routeIntent: route,
      side: options.side || (this.random() < 0.5 ? -1 : 1),
      position: pos,
      state: 'wait',
      waitRemaining: 0,
      targetFloorId: null,
      targetMode: '',
      previousTargetId: null,
      attackRound: 0,
      segmentIndex: 0,
      segmentRemaining: 0,
      warningRemaining: 0,
      attackStreak: 0,
      stunRemaining: 0,
      regrip: false,
      rehangRemaining: 0,
      rehangFrom: pos,
      rehangReason: '',
      retreatReason: '',
      departRemaining: 0,
      damageFlash: 0,
      source: options.source || 'debug',
      queenReinforcementDone: false,
      deathAt: null
    }
    this.ants.push(ant)
    ant.waitRemaining = 0
    if (route === 'down') ant.position = top.index
    if (options.targetId != null && options.mode) this.assignTarget(ant.id, options.targetId, options.mode)
    this.engine._spawnFloat(this.engine.blocks.at(-1)?.cx || LOGICAL_W / 2, `${species.shortName} · ${personality?.name || (route === 'up' ? '上爬路线' : '退守路线')}`, species.color, this.engine.worldY(Math.max(1, Math.round(ant.position))) - 18)
    this.engine._emit()
    return ant
  }

  _rollPersonality() {
    const roll = this.random()
    if (roll < 0.18) return 'timid'
    if (roll < 0.36) return 'coward'
    if (roll < 0.55) return 'impatient'
    if (roll < 0.72) return 'aggressive'
    return ''
  }

  _validTarget(block, mode) {
    if (!block || block.index <= 0 || !this.engine.blocks.includes(block)) return false
    if ((block.durability ?? 0) <= 0 || block.width < WIDTH_MIN) return false
    if (mode === 'width' && block.width <= WIDTH_MIN) return false
    return mode === 'durability' || mode === 'width'
  }

  _targetCount(floorId, exceptId = null) {
    return this.ants.filter((ant) => ant.id !== exceptId && ant.targetFloorId === floorId && ['climb', 'windup', 'bite'].includes(ant.state)).length
  }

  _targetWeight(ant, block) {
    // 站在哪就倾向于继续啃同一层。没有这一项时，蚂蚁每啃完一轮就换一层，
    // 伤害平摊到六十多层上，单层永远啃不穿 —— 实测整局只掉 9 点耐久。
    const standingHere = Math.abs(block.index - ant.position) < 0.01 ? 2.6 : 1
    if (ant.species.preference === 'high') {
      const health = (block.durability || 0) / Math.max(1, block.maxDurability || 1)
      return (0.35 + 1.8 * (block.index / Math.max(1, this.engine.floors)) + 0.45 * health) * standingHere
    }
    if (ant.species.preference === 'damaged') {
      const durabilityLoss = 1 - (block.durability || 0) / Math.max(1, block.maxDurability || 1)
      const widthLoss = 1 - block.width / Math.max(1, this.engine.initialWidthPx)
      // 原来是线性加权，残破层只占全塔权重的几个百分点，「偏好残破」形同虚设。
      // 改成超线性，已经啃出缺口的楼层才真的压得过几十层完好楼层。
      const wear = durabilityLoss * 2.5 + widthLoss * 1.5
      return (0.2 + wear * wear * 6) * standingHere
    }
    return standingHere
  }

  _chooseTarget(ant) {
    if (!ant || ant.hp <= 0 || progressOf(this.engine) >= 0.92) {
      if (ant) ant.state = 'hold'
      return false
    }
    const direction = ant.routeIntent === 'up' ? 1 : -1
    const eligible = []
    for (const block of this.engine.blocks) {
      if (block.index <= 0 || block.width < WIDTH_MIN || (block.durability ?? 0) <= 0) continue
      if (direction > 0 && block.index < Math.floor(ant.position + 0.01)) continue
      if (direction < 0 && block.index > Math.ceil(ant.position - 0.01)) continue
      if (this._targetCount(block.id, ant.id) >= MAX_TARGETS_PER_FLOOR) continue
      const modes = ['durability']
      if (block.width > WIDTH_MIN) modes.push('width')
      eligible.push({ block, modes, weight: this._targetWeight(ant, block) })
    }
    if (!eligible.length) {
      ant.state = 'wait'
      ant.waitRemaining = 0.5
      return false
    }
    const total = eligible.reduce((sum, candidate) => sum + candidate.weight, 0)
    let pick = this.random() * total
    let chosen = eligible[0]
    for (const candidate of eligible) {
      pick -= candidate.weight
      if (pick <= 0) { chosen = candidate; break }
    }
    const mode = chosen.modes[Math.floor(this.random() * chosen.modes.length)]
    return this.assignTarget(ant.id, chosen.block.id, mode)
  }

  assignTarget(antId, floorId, mode) {
    const ant = this.ants.find((candidate) => candidate.id === antId)
    const block = this.engine.blocks.find((candidate) => candidate.id === floorId)
    if (!ant || !this._validTarget(block, mode) || this._targetCount(floorId, antId) >= MAX_TARGETS_PER_FLOOR) return false
    const direction = ant.routeIntent === 'up' ? 1 : -1
    if ((direction > 0 && block.index < Math.floor(ant.position + 0.01)) || (direction < 0 && block.index > Math.ceil(ant.position - 0.01))) return false
    ant.previousTargetId = ant.targetFloorId
    ant.targetFloorId = block.id
    ant.targetMode = mode
    ant.attackRound++
    ant.segmentIndex = 0
    ant.segmentRemaining = 0
    ant.warningRemaining = 0
    ant.attackStreak = 0
    ant.state = Math.abs(block.index - ant.position) < 0.01 ? 'windup' : 'climb'
    if (ant.state === 'windup') this._beginWarning(ant)
    this.engine._emit()
    return true
  }

  _beginWarning(ant) {
    ant.state = 'windup'
    const earlierAttackers = this.ants.filter((other) =>
      other.id < ant.id && other.targetFloorId === ant.targetFloorId && ['windup', 'bite'].includes(other.state)
    ).length
    ant.warningRemaining = WARNING_SECONDS + (ant.personalityId === 'aggressive' ? 0.8 : 0) + earlierAttackers * WARNING_STAGGER_SECONDS
    ant.segmentIndex = 0
    ant.segmentRemaining = 0
    ant.attackStreak = 0
  }

  // 受击后重新架起：保留 targetFloorId / segmentIndex / segmentRemaining，
  // 只付一个短促的再预备。震击因此是"打断"，不再是"清零"。
  _regrip(ant) {
    ant.state = 'windup'
    ant.regrip = true
    ant.warningRemaining = REGRIP_SECONDS
    ant.segmentRemaining = Math.max(ant.segmentRemaining, 0.12)
    this.engine._emit()
  }

  _clearTarget(ant) {
    if (!ant) return
    if (ant.targetFloorId != null) ant.previousTargetId = ant.targetFloorId
    ant.targetFloorId = null
    ant.targetMode = ''
    ant.warningRemaining = 0
    ant.segmentRemaining = 0
    ant.segmentIndex = 0
    ant.attackStreak = 0
  }

  _enterRehang(ant, reason = '目标失效 · 重挂') {
    this._clearTarget(ant)
    ant.state = 'rehang'
    ant.rehangRemaining = 0.35
    ant.rehangFrom = ant.position
    ant.rehangReason = reason
  }

  _updateAnt(ant, dt, atFinale) {
    ant.damageFlash = Math.max(0, ant.damageFlash - dt)
    if (ant.state === 'hold') return
    if (ant.state === 'dead' || ant.state === 'departed') return
    if (ant.state === 'retreat') {
      ant.position = Math.max(0, ant.position - ant.species.climbSpeed * dt)
      if (ant.position <= 0) {
        ant.state = 'depart'
        ant.departRemaining = 0.5
      }
      return
    }
    if (ant.state === 'depart') {
      ant.departRemaining -= dt
      if (ant.departRemaining <= 0) ant.state = 'departed'
      return
    }
    if (ant.state === 'recover') {
      const elapsed = Math.min(0.55, ant.recoverElapsed + dt)
      ant.recoverElapsed = elapsed
      const t = clamp(elapsed / 0.55, 0, 1)
      ant.position = lerp(ant.recoverFrom, ant.recoverTo, t)
      ant.recoveryRemaining = Math.max(0, ant.recoveryRemaining - dt)
      if (ant.recoveryRemaining <= 0) {
        ant.state = 'wait'
        ant.waitRemaining = 0
      }
      return
    }
    if (ant.state === 'stunned') {
      ant.stunRemaining = Math.max(0, ant.stunRemaining - dt)
      if (ant.stunRemaining <= 0) {
        // 目标还在、自己也还挂在那一层，就续咬；否则才回到重选流程
        const held = this.engine.blocks.find((block) => block.id === ant.targetFloorId)
        if (held && this._validTarget(held, ant.targetMode) && Math.abs(held.index - ant.position) < 0.01) {
          this._regrip(ant)
        } else {
          this._clearTarget(ant)
          ant.state = 'wait'
          ant.waitRemaining = 0
        }
      }
      return
    }
    if (ant.state === 'rehang') {
      ant.rehangRemaining = Math.max(0, ant.rehangRemaining - dt)
      if (ant.rehangRemaining <= 0) {
        ant.state = 'wait'
        ant.waitRemaining = 0
      }
      return
    }
    if (ant.state === 'wait') {
      ant.waitRemaining = Math.max(0, ant.waitRemaining - dt)
      if (ant.waitRemaining <= 0 && !atFinale) this._chooseTarget(ant)
      return
    }

    const target = this.engine.blocks.find((block) => block.id === ant.targetFloorId)
    if (!this._validTarget(target, ant.targetMode)) {
      this._enterRehang(ant)
      return
    }
    if (ant.state === 'climb') {
      const direction = Math.sign(target.index - ant.position)
      if (!direction) {
        ant.position = target.index
        this._beginWarning(ant)
        this.engine._emit()
        return
      }
      ant.position += direction * ant.species.climbSpeed * dt
      if ((direction > 0 && ant.position >= target.index) || (direction < 0 && ant.position <= target.index)) {
        ant.position = target.index
        this._beginWarning(ant)
        this.engine._emit()
      }
      return
    }
    if (ant.state === 'windup') {
      ant.warningRemaining = Math.max(0, ant.warningRemaining - dt)
      if (ant.warningRemaining <= 0) {
        ant.state = 'bite'
        // regrip：被震退后重新咬上，续上原先那一段剩下的时间
        if (ant.regrip) ant.regrip = false
        else ant.segmentRemaining = ant.segmentIndex === 0 ? OPENING_INTERVAL : this._segmentInterval(ant)
        this.engine._emit()
      }
      return
    }
    if (ant.state === 'bite') {
      ant.segmentRemaining = Math.max(0, ant.segmentRemaining - dt)
      if (ant.segmentRemaining <= 1e-6) this._settleSegment(ant, target)
    }
  }

  _segmentDamage(ant, segment) {
    return segment * (ant.personalityId === 'aggressive' ? 1.5 : 1)
  }

  _segmentInterval(ant) {
    const impatience = ant.personalityId === 'impatient' ? Math.min(4, ant.attackStreak) : 0
    return Math.max(1.2, SEGMENT_INTERVAL - impatience * 0.15)
  }

  _settleSegment(ant, target) {
    const segments = ant.species[ant.targetMode]
    const baseDamage = segments?.[ant.segmentIndex]
    if (baseDamage == null) {
      this._enterRehang(ant, '本轮啃咬完成 · 重选目标')
      return
    }
    const damage = this._segmentDamage(ant, baseDamage)
    const now = this.attackClock
    let budget = this.floorAttackBudgets.get(target.id)
    if (!budget || now - budget.windowStart >= FLOOR_DAMAGE_WINDOW_SECONDS) {
      budget = { windowStart: now, damage: 0, nextAttackAt: now }
      this.floorAttackBudgets.set(target.id, budget)
    }
    const nextAttackDelay = budget.nextAttackAt - now
    const windowRemaining = budget.windowStart + FLOOR_DAMAGE_WINDOW_SECONDS - now
    if (nextAttackDelay > 0.01) {
      ant.segmentRemaining = Math.max(0.05, nextAttackDelay)
      return
    }
    if (budget.damage + damage > MAX_FLOOR_BURST_DAMAGE + 1e-9) {
      ant.segmentRemaining = Math.max(0.05, windowRemaining)
      return
    }
    const token = `${ant.id}:${ant.attackRound}:${ant.segmentIndex}`
    if (this.settledSegments.has(token)) return
    this.settledSegments.add(token)
    const applied = ant.targetMode === 'durability'
      ? this.engine.damageFloorById(target.id, damage, 'ant')
      : this.engine.damageFloorWidthById(target.id, damage, 'ant')
    if (!applied) {
      if (ant.targetFloorId != null) this._enterRehang(ant)
      return
    }
    budget.damage += damage
    budget.nextAttackAt = now + MIN_FLOOR_ATTACK_GAP_SECONDS
    ant.segmentIndex++
    ant.attackStreak++
    ant.lastSegmentDamage = damage
    ant.lastSegmentToken = token
    const stillThere = this.engine.blocks.find((block) => block.id === target.id)
    if (ant.state !== 'bite' || ant.targetFloorId !== target.id || !this._validTarget(stillThere, ant.targetMode)) {
      if (ant.targetFloorId === target.id) this._enterRehang(ant, '楼层失效 · 重挂')
      return
    }
    if (ant.segmentIndex >= segments.length) {
      this._enterRehang(ant, '本轮啃咬完成 · 重选目标')
      return
    }
    ant.segmentRemaining = this._segmentInterval(ant)
    this.engine._spawnFloat(stillThere.cx, `${ant.species.shortName} · ${ant.targetMode === 'durability' ? '耐久' : '宽度'} -${damage}`, ant.species.color, this.engine.worldY(stillThere.index) - 12)
    this.engine._emit()
  }

  _activeBiteGroups() {
    const groups = new Map()
    for (const ant of this.ants) {
      if (ant.state !== 'bite' || ant.targetFloorId == null || ant.hp <= 0) continue
      const block = this.engine.blocks.find((candidate) => candidate.id === ant.targetFloorId)
      if (!this._validTarget(block, ant.targetMode)) continue
      if (!groups.has(block.id)) groups.set(block.id, [])
      groups.get(block.id).push(ant)
    }
    return groups
  }

  _livingFloorRing() {
    return this.engine.blocks.filter((block) => block.index > 0).sort((a, b) => b.index - a.index)
  }

  _ensureCursor(ring = this._livingFloorRing()) {
    if (!ring.length) {
      this.cursorId = null
      return null
    }
    let index = ring.findIndex((block) => block.id === this.cursorId)
    if (index < 0 && this.cursorIndexHint != null) index = ring.findIndex((block) => block.index <= this.cursorIndexHint)
    if (index < 0) index = 0
    this.cursorId = ring[index].id
    this.cursorIndexHint = ring[index].index
    return index
  }

  scanPreview() {
    const ring = this._livingFloorRing()
    const start = this._ensureCursor(ring)
    const groups = this._activeBiteGroups()
    const candidates = []
    if (start != null && ring.length) {
      for (let offset = 0; offset < ring.length; offset++) {
        const block = ring[(start + offset) % ring.length]
        if (groups.has(block.id)) candidates.push({ id: block.id, floor: block.index, ants: groups.get(block.id).map((ant) => ant.id) })
      }
    }
    return {
      cursorId: this.cursorId,
      cursorFloor: ring.find((block) => block.id === this.cursorId)?.index ?? null,
      direction: '向下，至第1层后环绕塔冠',
      candidates
    }
  }

  onManualLanding(quality) {
    if (!Object.hasOwn(LANDING_QUALITY, quality)) return { hitFloors: [], hitAnts: [] }
    this.lastLandingQuality = quality
    this.lastLandingAt = this.engine.time
    this.lastShockFloors = []
    if (quality === 'Miss') {
      this.engine._emit()
      return { hitFloors: [], hitAnts: [] }
    }
    const serial = ++this.landingSeq
    const quota = LANDING_QUALITY[quality].hitFloors
    const ring = this._livingFloorRing()
    const start = this._ensureCursor(ring)
    if (start == null || !ring.length) return { hitFloors: [], hitAnts: [] }
    const activeAtStart = this._activeBiteGroups()
    const hitFloors = []
    const hitAnts = []
    let lastChecked = start
    for (let offset = 0; offset < ring.length; offset++) {
      const ringIndex = (start + offset) % ring.length
      const block = ring[ringIndex]
      lastChecked = ringIndex
      const targets = activeAtStart.get(block.id)
      if (!targets?.length) continue
      hitFloors.push(block.index)
      for (const ant of targets) {
        const hitKey = `${serial}:${ant.id}`
        if (this.hitKeys.has(hitKey)) continue
        this.hitKeys.add(hitKey)
        if (ant.state !== 'bite' || ant.hp <= 0) continue
        this._takeShock(ant, serial)
        hitAnts.push(ant.id)
      }
      if (hitFloors.length >= quota) break
    }
    const next = ring[(lastChecked + 1) % ring.length]
    this.cursorId = next?.id ?? null
    this.cursorIndexHint = next?.index ?? null
    this.lastShockFloors = [...hitFloors]
    this.ants = this.ants.filter((ant) => ant.hp > 0 && ant.state !== 'dead' && ant.state !== 'departed')
    const top = this.engine.blocks.at(-1)
    if (top) this.engine._spawnFloat(top.cx, quality, quality === 'Perfect' ? '#ffd66e' : '#a7e8ff', this.engine.worldY(top.index) - 28)
    this.engine._emit()
    return { hitFloors, hitAnts }
  }

  _takeShock(ant, landingSerial) {
    const beforeHp = ant.hp
    ant.hp = Math.max(0, ant.hp - 2)
    ant.hitCount++
    ant.damageFlash = 0.6
    ant.lastShockSerial = landingSerial
    ant.attackStreak = 0
    const target = this.engine.blocks.find((block) => block.id === ant.targetFloorId)
    const x = target?.cx ?? LOGICAL_W / 2
    const y = target ? this.engine.worldY(target.index) - 10 : this.engine.worldY(Math.max(1, Math.round(ant.position)))
    if (ant.hp <= 0) {
      this._clearTarget(ant)
      ant.state = 'dead'
      ant.deathAt = this.engine.time
      this.engine._spawnFloat(x, `${ant.species.shortName} 击退`, '#d7f7ff', y)
      return
    }
    if (ant.speciesId === 'queen' && beforeHp > ant.maxHp / 2 && ant.hp <= ant.maxHp / 2 && !ant.queenReinforcementDone) {
      ant.queenReinforcementDone = true
      this.pendingQueenReinforcements.push({ queenId: ant.id, remaining: 1.2 })
      this.engine._spawnFloat(x, '蚁后半血 · 工蚁增援预告 1.2s', '#f1c8ff', y)
    }
    const retreatHits = ant.personality?.retreatHits || 0
    if (retreatHits > 0 && ant.hitCount >= retreatHits) {
      this._clearTarget(ant)
      ant.state = 'retreat'
      ant.retreatReason = `${ant.personality.name} · 受击撤退`
      this.engine._spawnFloat(x, `${ant.personality.name} · 撤退`, '#c3ecff', y)
    } else {
      ant.state = 'stunned'
      ant.stunRemaining = 0.45
      this.engine._spawnFloat(x, `${ant.species.shortName} -2 HP`, '#b9efff', y)
    }
  }

  _nearestAnchor(position) {
    const floors = this.engine.blocks
    const below = floors.filter((block) => block.index <= position).sort((a, b) => b.index - a.index)[0]
    return below || floors[0] || null
  }

  beforeTowerChange() {
    const data = new Map()
    for (const ant of this.ants) {
      const anchor = this._nearestAnchor(ant.position)
      data.set(ant.id, {
        anchorId: anchor?.id ?? 0,
        offset: anchor ? ant.position - anchor.index : 0,
        position: ant.position
      })
    }
    this._towerSnapshot = data
  }

  remapAfterTowerChange() {
    const snapshot = this._towerSnapshot
    this._towerSnapshot = null
    if (snapshot) {
      for (const ant of this.ants) {
        const before = snapshot.get(ant.id)
        if (!before) continue
        const anchor = this.engine.blocks.find((block) => block.id === before.anchorId)
        if (anchor) ant.position = clamp(anchor.index + before.offset, 0, this.engine.blocks.length - 1)
        else ant.position = clamp(before.position, 0, this.engine.blocks.length - 1)
      }
    }
    for (const ant of this.ants) {
      const target = this.engine.blocks.find((block) => block.id === ant.targetFloorId)
      if (ant.targetFloorId != null && !this._validTarget(target, ant.targetMode)) {
        this._enterRehang(ant, '锁定楼层失效 · 滑落重挂')
      }
      const maxFloor = Math.max(0, this.engine.blocks.length - 1)
      ant.position = clamp(ant.position, 0, maxFloor)
    }
    if (this.cursorId != null && !this.engine.blocks.some((block) => block.id === this.cursorId && block.index > 0)) {
      this.cursorId = null
    }
    this._emitHudIfChanged()
  }

  onFloorWidthChanged(floorId) {
    for (const ant of this.ants) {
      if (ant.targetFloorId !== floorId || ant.targetMode !== 'width') continue
      const block = this.engine.blocks.find((candidate) => candidate.id === floorId)
      if (!this._validTarget(block, 'width')) this._enterRehang(ant, '宽度到达安全下限 · 重选目标')
    }
    this._emitHudIfChanged()
  }

  resetAfterRevive() {
    const topIndex = Math.max(1, this.engine.blocks.length - 1)
    const nextSpawnTime = this.engine.time + 6
    for (const slot of this.pendingWaveSpawns) slot.due = Math.max(slot.due, nextSpawnTime)
    for (const pending of this.pendingQueenReinforcements) pending.remaining = Math.max(pending.remaining, 6)
    for (const ant of this.ants) {
      ant.targetFloorId = null
      ant.targetMode = ''
      ant.warningRemaining = 0
      ant.segmentRemaining = 0
      ant.segmentIndex = 0
      ant.attackStreak = 0
      ant.state = 'recover'
      ant.recoverFrom = ant.position
      ant.recoverTo = Math.max(1, ant.position - 2.5)
      ant.recoverElapsed = 0
      ant.recoveryRemaining = 2.5
    }
    this.lastSpawnTime = this.engine.time
    this.engine._emit()
  }

  clear() {
    this.ants.length = 0
    this.pendingWaveSpawns.length = 0
    this.pendingQueenReinforcements.length = 0
    this.lastHudSignature = ''
  }

  _displayPosition(ant) {
    if (ant.state !== 'rehang' || ant.rehangRemaining <= 0) return ant.position
    const t = 1 - clamp(ant.rehangRemaining / 0.35, 0, 1)
    return lerp(ant.rehangFrom, ant.position, t)
  }

  _phaseLabel(ant) {
    if (ant.state === 'climb') return '沿塔外侧攀爬'
    if (ant.state === 'windup') return '预备咬合'
    if (ant.state === 'bite') return `实际咬击 · 第 ${ant.segmentIndex + 1} 段`
    if (ant.state === 'stunned') return '受击停顿'
    if (ant.state === 'retreat' || ant.state === 'depart') return ant.retreatReason || '向下撤退'
    if (ant.state === 'recover') return '复活重整'
    if (ant.state === 'rehang') return ant.rehangReason || '滑落重挂'
    if (ant.state === 'hold') return '终盘收束 · 不再开新目标'
    return '等待可用楼层'
  }

  hudState() {
    const preview = this.scanPreview()
    const entries = this.ants.filter((ant) => ant.hp > 0).map((ant) => {
      const target = this.engine.blocks.find((block) => block.id === ant.targetFloorId)
      const floor = target?.index ?? null
      const screenY = target ? this.engine.screenY(this.engine.worldY(target.index)) : null
      const baseSegments = target && ant.targetMode ? ant.species[ant.targetMode]?.slice(ant.segmentIndex) || [] : []
      let segments = baseSegments.map((value) => this._segmentDamage(ant, value))
      if (target && ant.targetMode === 'width') {
        let remainingWidth = Math.max(0, target.width - WIDTH_MIN)
        segments = segments.reduce((preview, value) => {
          if (remainingWidth <= 0) return preview
          const applied = Math.min(value, remainingWidth)
          preview.push(Math.round(applied * 10) / 10)
          remainingWidth -= applied
          return preview
        }, [])
      }
      const damage = segments.reduce((sum, value) => sum + value, 0)
      const remaining = ant.state === 'windup' ? ant.warningRemaining
        : ant.state === 'bite' ? ant.segmentRemaining
          : ant.state === 'climb' && target ? Math.abs(target.index - ant.position) / ant.species.climbSpeed
            : ant.state === 'stunned' ? ant.stunRemaining
              : ant.state === 'rehang' ? ant.rehangRemaining
                : ant.state === 'recover' ? ant.recoveryRemaining : ant.waitRemaining
      return {
        id: ant.id,
        speciesId: ant.speciesId,
        speciesName: ant.species.name,
        shortName: ant.species.shortName,
        color: ant.species.color,
        hp: ant.hp,
        maxHp: ant.maxHp,
        personality: ant.personality?.name || '无战斗性格',
        personalityId: ant.personalityId,
        route: ant.routeIntent === 'up' ? '上爬' : '退守',
        state: ant.state,
        phase: this._phaseLabel(ant),
        remaining: Number(Math.max(0, remaining || 0).toFixed(1)),
        floor,
        floorId: target?.id ?? null,
        mode: ant.targetMode,
        modeLabel: ant.targetMode === 'durability' ? '耐久啃裂' : ant.targetMode === 'width' ? '宽度啃窄' : '',
        segments,
        expectedLoss: Math.round(damage * 10) / 10,
        segmentInterval: Number(this._segmentInterval(ant).toFixed(2)),
        accelerationCount: ant.personalityId === 'impatient' ? Math.min(4, ant.attackStreak) : 0,
        visible: screenY != null && screenY >= 38 && screenY <= LOGICAL_H - 46,
        activeBite: ant.state === 'bite',
        position: Number(this._displayPosition(ant).toFixed(2))
      }
    })
    const recentQuality = this.engine.time - this.lastLandingAt <= 1.8 ? this.lastLandingQuality : ''
    return {
      count: this.ants.filter((ant) => ant.hp > 0).length,
      max: MAX_ANTS,
      entries,
      cursorId: preview.cursorId,
      cursorFloor: preview.cursorFloor,
      direction: preview.direction,
      candidates: preview.candidates,
      hitCapacity: { Perfect: 4, Great: 3, Good: 2, Bad: 1, Miss: 0 },
      lastQuality: recentQuality,
      lastShockFloors: [...this.lastShockFloors],
      layoutSafe: this.layoutSafe(),
      pauseReason: this._pauseReason(),
      queenReinforcement: this.pendingQueenReinforcements.length
        ? Number(Math.min(...this.pendingQueenReinforcements.map((item) => item.remaining)).toFixed(1))
        : null,
      hasAnts: entries.length > 0,
      hasFutureWave: this.waveIndex < this.waves.length || this.pendingWaveSpawns.length > 0
    }
  }

  _emitHudIfChanged() {
    const hud = this.hudState()
    const signature = JSON.stringify({
      count: hud.count,
      cursorFloor: hud.cursorFloor,
      entries: hud.entries.map((ant) => [ant.id, ant.hp, ant.floor, ant.mode, ant.state, ant.phase, ant.remaining, ant.expectedLoss]),
      candidates: hud.candidates,
      quality: hud.lastQuality,
      layoutSafe: hud.layoutSafe,
      pauseReason: hud.pauseReason,
      queenReinforcement: hud.queenReinforcement
    })
    if (signature !== this.lastHudSignature) {
      this.lastHudSignature = signature
      this.engine._emit()
    }
  }

  render(ctx) {
    if (this.destroyed) return
    const e = this.engine
    const targetEntries = this.ants.filter((ant) => ant.hp > 0 && ant.targetFloorId != null && !['retreat', 'depart', 'recover', 'stunned', 'rehang'].includes(ant.state))
    // 锁定框与标签先画：蚂蚁现在趴在楼层正面，必须压在 HUD 文字之上，
    // 否则几条标签条一叠就把虫子本身糊没了。
    for (const ant of targetEntries) {
      const siblings = targetEntries.filter((candidate) => candidate.targetFloorId === ant.targetFloorId)
      this._renderTarget(ctx, ant, siblings.indexOf(ant))
    }
    for (const ant of this.ants) this._renderAnt(ctx, ant)
    this._renderOffscreenProfile(ctx, targetEntries)
  }

  // 蚂蚁贴在楼层正面爬，所以基准朝向是竖直的（头朝上 = -PI/2）。
  // 只有啃宽度的时候才横过来——那时它确实在啃楼层的侧沿。
  _headingAngle(ant) {
    if (ant.state === 'windup' || ant.state === 'bite') {
      // 啃宽度：横在楼层边沿，头朝塔外；啃耐久：伏在正面低头啃板面
      return ant.targetMode === 'width' ? (ant.side > 0 ? 0 : Math.PI) : Math.PI / 2
    }
    if (ant.state === 'retreat' || ant.state === 'depart') return Math.PI / 2
    if (ant.state === 'climb') {
      const target = this.engine.blocks.find((block) => block.id === ant.targetFloorId)
      if (target) return target.index >= ant.position ? -Math.PI / 2 : Math.PI / 2
    }
    if (ant.state === 'recover') return Math.PI / 2
    return ant.routeIntent === 'down' ? Math.PI / 2 : -Math.PI / 2
  }

  // 蚂蚁在楼层正面占的横向车道（相对楼层中心）。
  // 同层最多三只，用 id 派生出稳定且互不重叠的车道，避免叠在一起。
  _faceLane(ant, block, art) {
    const half = block.width / 2
    const margin = 4 + art.scale * 9             // 身体半宽（含腿展），别让腿探出楼层外
    const span = Math.max(0, half - margin)
    if (span <= 0.5) return 0
    const biting = (ant.state === 'windup' || ant.state === 'bite')
    // 啃宽度的蚂蚁贴到边沿去啃，这正是它正在削掉的那一侧
    if (biting && ant.targetMode === 'width') return ant.side * span
    const slot = ((ant.id * 7) % 3)              // 0 / 1 / 2
    const frac = 0.26 + slot * 0.27              // 0.26 / 0.53 / 0.80
    return clamp(ant.side * frac * half, -span, span)
  }

  _renderAnt(ctx, ant) {
    if (ant.hp <= 0 || ant.state === 'dead' || ant.state === 'departed') return
    const e = this.engine
    const position = this._displayPosition(ant)
    const anchor = this._nearestAnchor(position)
    const block = anchor || e.blocks[0]
    const art = ANT_ART[ant.speciesId] || ANT_ART.worker
    // 蚂蚁趴在楼层正面，而不是浮在塔外侧
    const x = block.cx + e.swayOffset(block.index) + this._faceLane(ant, block, art)
    let y = e.screenY(e.worldY(position) + BLOCK_H / 2)
    if (ant.state === 'depart') y += (0.5 - ant.departRemaining) * 36
    if (y < -34 || y > LOGICAL_H + 34) return

    // ---- 步态与转身的渲染态（只在渲染侧累积，不影响玩法逻辑）----
    const now = e.time
    const dt = ant._artT == null ? 0 : Math.max(0, Math.min(0.05, now - ant._artT))
    ant._artT = now
    const walking = ['climb', 'retreat', 'depart', 'recover'].includes(ant.state)
    const agitated = ant.state === 'windup' || ant.state === 'bite'
    const gait = art.gait * (ant.personalityId === 'impatient' ? 1.35 : 1) * (ant.state === 'retreat' ? 1.5 : 1)
    ant._walk = (ant._walk || ant.id * 1.7) + dt * (walking ? gait : agitated ? gait * 0.22 : gait * 0.1)

    const wanted = this._headingAngle(ant)
    if (ant._angle == null) ant._angle = wanted
    else {
      let diff = wanted - ant._angle
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      ant._angle += diff * Math.min(1, dt * 11)
    }

    // 咬合开合：bite 期间快速张合，windup 期间慢速预备
    const bite = ant.state === 'bite'
      ? (0.5 + 0.5 * Math.sin(now * 17 + ant.id)) ** 0.7
      : ant.state === 'windup'
        ? 0.25 + 0.25 * Math.sin(now * 5 + ant.id)
        : 0

    const stunned = ant.state === 'stunned'
    ctx.save()
    ctx.translate(x, y)
    if (stunned) ctx.translate(Math.sin(now * 42 + ant.id) * 1.1, 0)
    ctx.rotate(ant._angle)
    drawAnt(ctx, {
      speciesId: ant.speciesId,
      color: ant.species.color,
      time: now,
      seed: ant.id * 1.37,
      walk: ant._walk,
      bite,
      flash: ant.damageFlash > 0 ? ant.damageFlash / 0.6 : 0,
      alpha: ant.state === 'depart' ? Math.max(0, ant.departRemaining / 0.5) : 1,
      onSurface: true
    })
    if (ant.state === 'bite') drawBiteSparks(ctx, { speciesId: ant.speciesId, time: now, seed: ant.id * 1.37 })
    ctx.restore()

    // ---- 血条：只在掉过血之后出现，不常驻挡画面 ----
    if (ant.hp < ant.maxHp && y > 32 && y < 674) {
      const ratio = ant.hp / ant.maxHp
      const w = 22
      ctx.save()
      ctx.translate(x, y - 12 - art.scale * 6)
      ctx.fillStyle = 'rgba(6,14,24,0.78)'
      ctx.beginPath(); ctx.roundRect(-w / 2 - 1, -2.5, w + 2, 5, 2.5); ctx.fill()
      ctx.fillStyle = ratio > 0.5 ? '#8de9bd' : ratio > 0.25 ? '#ffd27a' : '#ff8d7a'
      ctx.beginPath(); ctx.roundRect(-w / 2, -1.5, Math.max(1.5, w * ratio), 3, 1.5); ctx.fill()
      ctx.restore()
    }
  }

  _renderTarget(ctx, ant, labelSlot = 0) {
    const e = this.engine
    const block = e.blocks.find((candidate) => candidate.id === ant.targetFloorId)
    if (!block) return
    const y = e.screenY(e.worldY(block.index))
    if (y < 38 || y > LOGICAL_H - 46) return
    const x = block.cx + e.swayOffset(block.index)
    const color = ant.state === 'bite' ? '#ffcc65' : ant.species.color
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = ant.state === 'bite' ? 2.4 : 1.6
    ctx.setLineDash(ant.state === 'bite' ? [] : [4, 4])
    ctx.strokeRect(x - block.width / 2 - 3, y - 2, block.width + 6, BLOCK_H + 4)
    ctx.setLineDash([])
    ctx.fillStyle = '#071421e8'
    const label = `${ant.species.shortName} · 第${block.index}层 · ${ant.targetMode === 'durability' ? '耐久' : '宽度'} ${ant.state === 'windup' ? ant.warningRemaining.toFixed(1) + 's' : ant.state === 'bite' ? ant.segmentRemaining.toFixed(1) + 's' : '攀爬'}`
    ctx.font = 'bold 9px system-ui, sans-serif'
    const labelWidth = Math.min(154, ctx.measureText(label).width + 8)
    const labelX = clamp(x - labelWidth / 2, 4, LOGICAL_W - labelWidth - 4)
    const labelTop = labelSlot % 2 === 0 ? y - 14 : y + BLOCK_H + 4
    ctx.fillRect(labelX, labelTop, labelWidth, 11)
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.fillText(label, labelX + labelWidth / 2, labelTop + 9)
    ctx.restore()
  }

  _renderOffscreenProfile(ctx, targetEntries) {
    const e = this.engine
    const offscreen = targetEntries.filter((ant) => {
      const block = e.blocks.find((candidate) => candidate.id === ant.targetFloorId)
      if (!block) return false
      const y = e.screenY(e.worldY(block.index))
      return y < 38 || y > LOGICAL_H - 46
    })
    if (!offscreen.length) return
    const ring = this._livingFloorRing()
    if (!ring.length) return
    const top = ring[0].index
    const left = 20
    const railTop = 258
    const railHeight = 292
    ctx.save()
    ctx.fillStyle = 'rgba(5,14,26,0.72)'
    ctx.fillRect(left - 7, railTop - 13, 38, railHeight + 26)
    ctx.strokeStyle = 'rgba(225,244,255,0.6)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(left + 10, railTop); ctx.lineTo(left + 10, railTop + railHeight); ctx.stroke()
    ctx.fillStyle = '#eff8ff'
    ctx.font = 'bold 8px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`顶 ${top}`, left - 3, railTop - 3)
    ctx.fillText('基 0', left - 3, railTop + railHeight + 11)
    const cursorBlock = e.blocks.find((block) => block.id === this.cursorId && block.index > 0)
    if (cursorBlock) {
      const y = railTop + (top - cursorBlock.index) / Math.max(1, top) * railHeight
      ctx.fillStyle = '#fff1a6'
      ctx.beginPath(); ctx.moveTo(left + 18, y); ctx.lineTo(left + 23, y - 4); ctx.lineTo(left + 23, y + 4); ctx.closePath(); ctx.fill()
      ctx.fillText('游标', left + 26, y + 3)
    }
    for (const ant of offscreen) {
      const block = e.blocks.find((candidate) => candidate.id === ant.targetFloorId)
      if (!block) continue
      const peers = offscreen.filter((candidate) => candidate.targetFloorId === ant.targetFloorId)
      const peerIndex = peers.indexOf(ant)
      const y = railTop + (top - block.index) / Math.max(1, top) * railHeight + (peerIndex - (peers.length - 1) / 2) * 9
      ctx.fillStyle = ant.species.color
      ctx.fillRect(left + 3, y - 3, 15, 6)
      ctx.fillStyle = '#fff'
      ctx.fillText(`${ant.species.shortName} 第${block.index} ${ant.targetMode === 'durability' ? '耐久' : '宽度'}`, left + 21, y + 3)
      const antY = railTop + (top - this._displayPosition(ant)) / Math.max(1, top) * railHeight
      ctx.fillStyle = ant.species.color
      ctx.beginPath(); ctx.arc(left - 1, antY, 3.2, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#fff1a6'
    ctx.fillText('剖面定位', left - 3, railTop + railHeight + 22)
    ctx.restore()
  }

  destroy() {
    this.clear()
    this.destroyed = true
    this.engine = null
  }
}
