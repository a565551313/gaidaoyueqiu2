// 蚂蚁敌人与楼层耐久原型参数。所有数值均待实际试玩验证。
import { modOf } from './blocks.js'

// 耐久池缩小后，非蚂蚁来源的伤害要乘回这个系数，保证它们的相对威胁不变。
export const NON_ANT_DURABILITY_SCALE = 0.4

export const DURABILITY_CONFIG = {
  // 耐久池按 0.4 缩小（原 18~46 -> 7~18）。
  // 这是让「蚁群啃穿一层」在数学上成立的唯一杠杆：满宽 46 点的楼层，
  // 在单层 6 点/2 秒的伤害上限下要啃 15.3 秒，而蚁群整局全部楼层加起来
  // 才打出约 16 点耐久伤害 —— 实测波表×3 都毫无作用（0.0pt）。
  // 缩池后围攻一层约需 6 秒，实测通关率 -3.6pt（p=0.043）。
  // 非蚂蚁来源（冰雹等）在 damageFloor 里按同样系数补偿，天气平衡完全不变。
  layers: { minWidth: 24, maxWidth: 120, min: 7, max: 18, materialMultiplier: 0.18 }
}

export const FLOOR_WIDTH_MIN = 26

// 蚁群密度与同层攻击节奏均为原型起点，尚未试玩验证；集中配置便于低风险调参。
export const ANT_PROTOTYPE_CONFIG = Object.freeze({
  maxAlive: 5,
  maxTargetsPerFloor: 3,
  spawnGapSeconds: 4.5,
  warningStaggerSeconds: 0.55,
  maxFloorBurstDamage: 6,
  floorDamageWindowSeconds: 2,
  minFloorAttackGapSeconds: 0.55
})

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

// 波次与间隔是未试玩验证的原型节奏：第一关保持少量教学，后续逐步增加出场位。
// 同组成员按 ANT_PROTOTYPE_CONFIG.spawnGapSeconds 错峰；92% 后停止新出场。
export function antWavesForLevel(level) {
  const stage = level?.chapterStage || (((Math.max(1, level?.id || 1) - 1) % 8) + 1)
  if (stage === 1) return [
    { at: 0.18, species: ['worker'] },
    { at: 0.52, species: ['worker'] }
  ]
  if (stage <= 3) return [
    { at: 0.18, species: ['worker'] },
    { at: 0.42, species: ['scout'] },
    { at: 0.66, species: ['worker', 'scout'] }
  ]
  if (stage <= 5) return [
    { at: 0.16, species: ['worker'] },
    { at: 0.34, species: ['worker', 'scout'] },
    { at: 0.56, species: ['soldier', 'scout'] }
  ]
  if (stage <= 7) return [
    { at: 0.14, species: ['worker'] },
    { at: 0.30, species: ['worker', 'scout'] },
    { at: 0.48, species: ['soldier', 'scout'] },
    { at: 0.72, species: ['worker', 'soldier'] }
  ]
  return [
    { at: 0.14, species: ['worker'] },
    { at: 0.32, species: ['worker', 'scout'] },
    { at: 0.54, species: ['queen'] },
    { at: 0.74, species: ['scout', 'worker'] }
  ]
}

// 材质的耐久倍率以前写在这里（MATERIAL_DURABILITY_MULTIPLIERS），
// 也就是说材质数据有一份住在蚂蚁文件里。现在它和其它材质属性一起
// 回到了 data/materials.js 的 mods.durabilityMax。
export function durabilityForWidth(width, materialId = 'soil') {
  const cfg = DURABILITY_CONFIG.layers
  const ratio = Math.max(0, Math.min(1, (width - cfg.minWidth) / (cfg.maxWidth - cfg.minWidth)))
  const scale = modOf({ typeId: 'normal', materialId }, 'durabilityMax')
  return Math.round((cfg.min + ratio * (cfg.max - cfg.min)) * scale)
}
