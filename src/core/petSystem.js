// 宠物效果解析与单局运行时。
// GameEngine / WeatherSystem / AntSystem 只读取统一的 effects 接口，
// 避免把“如果是某只宠物”的分支散落在各个系统中。

import { getPet, petLevelCap } from '../data/pets.js'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const scale = (level, from, to) => from + (to - from) * clamp(((level || 1) - 1) / 49, 0, 1)

export function createPetSnapshot(activePetId, petsState = {}) {
  if (!activePetId) return null
  const def = getPet(activePetId)
  const saved = petsState[activePetId]
  if (!def || !saved?.owned) return null
  const star = clamp(Math.floor(Number(saved.star) || 1), 1, 5)
  const level = clamp(Math.floor(Number(saved.level) || 1), 1, petLevelCap(star))
  return {
    id: def.id,
    name: def.name,
    role: def.role,
    color: def.color,
    accent: def.accent,
    level,
    star,
    effects: resolvePetEffects(def.id, level, star)
  }
}

export function resolvePetEffects(id, level = 1, star = 1) {
  const starBoost = star >= 4 ? 1.2 : star >= 2 ? 1.1 : 1
  const effects = {
    perfectWindowMult: 1,
    comboWindowBonus: 0,
    nearPerfectPx: 0,
    weatherDurationMult: 1,
    weatherOpeningReduction: 0,
    blockLightning: false,
    chargeEveryFloors: 0,
    flameRestoreRatio: 0,
    flameShield: false,
    coinMult: 1,
    threeStarCoinMult: 1
  }

  if (id === 'moonRabbit') {
    effects.perfectWindowMult = 1 + scale(level, 0.05, 0.15) * starBoost
    if (star >= 3) effects.comboWindowBonus = star >= 4 ? 0.35 : 0.25
    if (star >= 5) effects.nearPerfectPx = 4
  } else if (id === 'cloudWisp') {
    effects.weatherDurationMult = 1 - scale(level, 0.05, 0.15) * starBoost
    if (star >= 3) effects.weatherOpeningReduction = star >= 4 ? 0.4 : 0.3
    if (star >= 5) effects.blockLightning = true
  } else if (id === 'emberFox') {
    effects.chargeEveryFloors = Math.max(9, Math.round(scale(level, 14, 9)))
    if (star >= 3) effects.flameRestoreRatio = star >= 4 ? 0.06 : 0.04
    if (star >= 5) effects.flameShield = true
  } else if (id === 'starCat') {
    effects.coinMult = 1 + scale(level, 0.03, 0.1) * starBoost
    if (star >= 5) effects.threeStarCoinMult = 1.1
  }
  return effects
}

export function petSkillEffectText(petId, skillKey, state) {
  const star = Number(state?.star) || 1
  const level = Number(state?.level) || 1
  const e = resolvePetEffects(petId, level, star)
  const pct = (n) => `${Math.round(n * 100)}%`
  const texts = {
    calibration: `完美窗口 +${pct(e.perfectWindowMult - 1)}`,
    focus: star >= 3 ? `三连完美后，下次窗口额外 +${pct(e.comboWindowBonus)}` : '3星解锁',
    correction: star >= 5 ? `每局修正一次 ${e.nearPerfectPx}px 内的近似完美` : '5星解锁',
    clearSky: `天气持续时间 -${pct(1 - e.weatherDurationMult)}`,
    softWind: star >= 3 ? `天气开始前3秒强度 -${pct(e.weatherOpeningReduction)}` : '3星解锁',
    lightningGuard: star >= 5 ? '每局抵消第一次楼体雷击' : '5星解锁',
    devicePrecision: '已退役：设备点击区已移除，不影响蚁群。',
    eventRecovery: '已退役：旧事件充能奖励停止，不影响蚁群。',
    foundationIntercept: '已退役：旧事件拦截停止，不提供蚁群护盾或免切。',
    embers: `每 ${e.chargeEveryFloors} 次手动落层充能 +1`,
    flameRepair: star >= 3 ? `烈焰结束恢复 ${pct(e.flameRestoreRatio)} 初始宽度` : '3星解锁',
    flameShield: star >= 5 ? '每局第一次烈焰后获得一次免切护盾' : '5星解锁',
    starlight: `最终金币 +${pct(e.coinMult - 1)}`,
    eventSalvage: '已退役：旧施工事件奖励停止，击退蚂蚁不额外加金币。',
    fullReturn: star >= 5 ? '三星通关金币再 +10%' : '5星解锁'
  }
  return texts[skillKey] || ''
}

export class PetRuntime {
  constructor(snapshot, engine) {
    this.snapshot = snapshot || null
    this.engine = engine
    this.effects = snapshot?.effects || resolvePetEffects(null)
    this.eligibleFloors = 0
    this.manualFloors = 0
    this.focusReady = false
    this.dropWindowMult = 1
    this.nearPerfectUsed = false
    this.lightningBlocked = false
    this.flameShieldCharges = 0
    this.flameShieldGranted = false
    this.flameSequencePending = false
    this.notice = ''
    this.noticeSeq = 0
    this.noticeUntil = 0
  }

  get active() { return !!this.snapshot }

  notify(text, color = this.snapshot?.color || '#82e7ff') {
    if (!this.active) return
    this.notice = text
    this.noticeSeq += 1
    this.noticeUntil = (this.engine?.time || 0) + 1.8
    const top = this.engine?.blocks?.[this.engine.blocks.length - 1]
    if (top && this.engine._spawnFloat) {
      this.engine._spawnFloat(top.cx, text, color, this.engine.worldY(top.index) - 70)
    }
  }

  beginDrop(type) {
    this.dropWindowMult = this.effects.perfectWindowMult || 1
    if (type === 'manual' && this.focusReady) {
      this.dropWindowMult += this.effects.comboWindowBonus || 0
      this.focusReady = false
      this.notify('连携呼吸!', this.snapshot.accent)
    }
    return this.dropWindowMult
  }

  tryCorrectNearPerfect(absOffset, perfectWindow) {
    if (!this.active || this.nearPerfectUsed || this.effects.nearPerfectPx <= 0) return false
    if (absOffset <= perfectWindow || absOffset > perfectWindow + this.effects.nearPerfectPx) return false
    this.nearPerfectUsed = true
    this.notify('误差修正!', this.snapshot.accent)
    return true
  }

  afterPlacement(type, isPerfect, combo) {
    if (!this.active) return
    if (type === 'manual' || type === 'ai') this.eligibleFloors += 1
    if (type !== 'manual') return
    this.manualFloors += 1

    if (this.snapshot.id === 'moonRabbit' && isPerfect && combo > 0 && combo % 3 === 0 && this.effects.comboWindowBonus > 0) {
      this.focusReady = true
      this.notify('下次校准强化', this.snapshot.accent)
    }

    const every = this.effects.chargeEveryFloors
    if (every > 0 && this.manualFloors % every === 0) {
      this.addCharge(1)
      this.notify('余烬充能 +1', this.snapshot.accent)
    }
  }

  addCharge(amount) {
    const e = this.engine
    if (!e) return
    e.charge = Math.min(e.chargeCap, e.charge + amount)
    if (e.charge >= e.chargeCap) e.chargeReady = true
  }

  onFlameReleased() {
    if (!this.active || this.snapshot.id !== 'emberFox') return
    this.flameSequencePending = true
  }

  onFlameSequenceEnd() {
    if (!this.flameSequencePending) return
    this.flameSequencePending = false
    const e = this.engine
    if (this.effects.flameRestoreRatio > 0 && e) {
      const before = e.currentWidth
      e.currentWidth = Math.min(e.initialWidthPx, e.currentWidth + e.initialWidthPx * this.effects.flameRestoreRatio)
      if (e.currentWidth > before + 0.05) {
        e._expandTopBlockTo(e.currentWidth)
        e._spawnRestoreEffect()
        this.notify('烈焰修补!', this.snapshot.accent)
      }
    }
    if (this.effects.flameShield && !this.flameShieldGranted) {
      this.flameShieldGranted = true
      this.flameShieldCharges = 1
      this.notify('火焰护层待命', this.snapshot.accent)
    }
  }

  tryConsumeCutShield() {
    if (this.flameShieldCharges <= 0) return false
    this.flameShieldCharges -= 1
    this.notify('火焰护层!', this.snapshot.accent)
    return true
  }

  tryBlockLightning() {
    if (!this.active || !this.effects.blockLightning || this.lightningBlocked) return false
    this.lightningBlocked = true
    this.notify('云层偏转!', this.snapshot.accent)
    return true
  }

  weatherIntensityMult(elapsed = 99) {
    if (!this.active || elapsed >= 3) return 1
    return 1 - (this.effects.weatherOpeningReduction || 0)
  }

  coinMultiplier(stars = 0) {
    let value = this.effects.coinMult || 1
    if (stars >= 3) value *= this.effects.threeStarCoinMult || 1
    return value
  }

  expAward({ cleared, abandoned, stars }) {
    if (!this.active || abandoned) return 0
    if (cleared) return Math.floor(this.eligibleFloors + this.engine.level.target * 0.3 + stars * 10)
    return Math.floor(this.eligibleFloors * 0.6)
  }

  meterState() {
    if (!this.active) return { value: 0, max: 1, label: '' }
    if (this.snapshot.id === 'moonRabbit') {
      return { value: this.focusReady ? 3 : this.engine.combo % 3, max: 3, label: this.focusReady ? '校准就绪' : '连携' }
    }
    if (this.snapshot.id === 'cloudWisp') {
      return { value: this.lightningBlocked ? 0 : 1, max: 1, label: this.lightningBlocked ? '偏转已用' : '云盾待命' }
    }
    if (this.snapshot.id === 'rivetHound') {
      return { value: 0, max: 1, label: '旧事件技能已退役' }
    }
    if (this.snapshot.id === 'emberFox') {
      return { value: this.manualFloors % (this.effects.chargeEveryFloors || 1), max: this.effects.chargeEveryFloors || 1, label: '余烬' }
    }
    return { value: 1, max: 1, label: '拾光' }
  }

  hudState() {
    if (!this.active) return null
    const meter = this.meterState()
    return {
      id: this.snapshot.id,
      name: this.snapshot.name,
      level: this.snapshot.level,
      star: this.snapshot.star,
      color: this.snapshot.color,
      accent: this.snapshot.accent,
      notice: (this.engine?.time || 0) <= this.noticeUntil ? this.notice : '',
      noticeSeq: this.noticeSeq,
      meter
    }
  }
}
