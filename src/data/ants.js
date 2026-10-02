// 蚂蚁敌人与楼层耐久原型参数。所有数值均待实际试玩验证。
export const DURABILITY_CONFIG = {
  layers: { minWidth: 24, maxWidth: 120, min: 18, max: 46, materialMultiplier: 0.18 }
}

export const FLOOR_WIDTH_MIN = 26

export const ANT_SPECIES = {
  worker: {
    id: 'worker', name: '锈腹工蚁', shortName: '工蚁', hp: 12, climbSpeed: 1.8,
    durability: [2, 2], width: [2, 2], preference: 'random', color: '#d47a45'
  },
  scout: {
    id: 'scout', name: '青翅斥候', shortName: '斥候', hp: 10, climbSpeed: 2.6,
    durability: [2, 2, 2], width: [2, 2], preference: 'high', color: '#63c9b9'
  },
  soldier: {
    id: 'soldier', name: '钳甲兵蚁', shortName: '钳甲兵', hp: 16, climbSpeed: 1.25,
    durability: [4, 4, 4], width: [4, 4, 2], preference: 'damaged', color: '#a67a58'
  },
  queen: {
    id: 'queen', name: '冠巢蚁后', shortName: '蚁后', hp: 24, climbSpeed: 1.6,
    durability: [4, 4], width: [2, 2, 2], preference: 'damaged', color: '#c68cdc'
  }
}

export const ANT_PERSONALITIES = {
  timid: { id: 'timid', name: '胆小', retreatHits: 1 },
  coward: { id: 'coward', name: '懦弱', retreatHits: 2 },
  impatient: { id: 'impatient', name: '急躁', retreatHits: 0 },
  aggressive: { id: 'aggressive', name: '暴躁', retreatHits: 0 }
}

// 每一项是独立出场位；同组第二只需等第一只出场至少 6 秒。
// 关卡进度达到 92% 后不再触发新的出场位。
export function antWavesForLevel(level) {
  const stage = level?.chapterStage || (((Math.max(1, level?.id || 1) - 1) % 8) + 1)
  if (stage === 1) return [
    { at: 0.18, species: ['worker'] },
    { at: 0.52, species: ['worker'] }
  ]
  if (stage <= 3) return [
    { at: 0.18, species: ['worker'] },
    { at: 0.45, species: ['scout'] },
    { at: 0.68, species: ['worker', 'scout'] }
  ]
  if (stage <= 7) return [
    { at: 0.18, species: ['worker'] },
    { at: 0.40, species: ['worker', 'scout'] },
    { at: 0.64, species: ['soldier', 'scout'] }
  ]
  return [
    { at: 0.18, species: ['worker'] },
    { at: 0.42, species: ['worker', 'scout'] },
    { at: 0.62, species: ['queen'] }
  ]
}

export const MATERIAL_DURABILITY_MULTIPLIERS = {
  soil: { durability: 1 },
  concrete: { durability: 1.18 },
  steel: { durability: 1.28 },
  bronze: { durability: 1.12 },
  blackgold: { durability: 1.35 }
}

export function durabilityForWidth(width, materialId = 'soil') {
  const cfg = DURABILITY_CONFIG.layers
  const m = MATERIAL_DURABILITY_MULTIPLIERS[materialId] || MATERIAL_DURABILITY_MULTIPLIERS.soil
  const ratio = Math.max(0, Math.min(1, (width - cfg.minWidth) / (cfg.maxWidth - cfg.minWidth)))
  return Math.round((cfg.min + ratio * (cfg.max - cfg.min)) * m.durability)
}
