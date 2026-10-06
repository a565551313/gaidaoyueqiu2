// 蚂蚁敌人与楼层耐久数据层。所有数值均待实际试玩验证。
//
// Phase 0 内容数据化：兵种/性格/原型参数/耐久池/波次分档在
// src/content/defaults/ants.js（经 src/core/content.js 注入）。
// 本文件保留：耐久曲线（durabilityForWidth）、波次选择逻辑（antWavesForLevel）
// 与冻结语义。波次数据从旧代码的 if 链改为「按章节内第几关」的五档表
//（upTo 含上界，>8 的关卡回落到最后一档），行为逐档等价，由
// scripts/verify-content.mjs 的快照基线锁定。

import { modOf } from './blocks.js'
import { bundle } from '../core/content.js'

// 耐久池缩小后，非蚂蚁来源的伤害要乘回这个系数，保证它们的相对威胁不变。
export const NON_ANT_DURABILITY_SCALE = bundle.ants.nonAntDurabilityScale

export const DURABILITY_CONFIG = bundle.ants.durabilityConfig

export const FLOOR_WIDTH_MIN = bundle.ants.floorWidthMin

// 蚁群密度与同层攻击节奏均为原型起点，尚未试玩验证；集中配置便于低风险调参。
export const ANT_PROTOTYPE_CONFIG = Object.freeze({ ...bundle.ants.prototype })

export const ANT_SPECIES = bundle.ants.species
export const ANT_PERSONALITIES = bundle.ants.personalities

// 蚂蚁波次：按「章节内第几关」（chapterStage）取分档表。
// 已知平衡留白（见 docs/ENEMY_WEATHER_AUDIT.md P1）：当前 7 个章节共用同一套
// chapterStage 波次，未随章节推进加难 —— 内容化之后在内容包里即可分化，无需改代码。
export function antWavesForLevel(level) {
  const stage = level?.chapterStage || (((Math.max(1, level?.id || 1) - 1) % 8) + 1)
  const tiers = bundle.ants.waveTiers
  const tier = tiers.find((t) => stage <= t.upTo) || tiers[tiers.length - 1]
  return tier.waves
}

// 材质的耐久以前写在这里（MATERIAL_DURABILITY_MULTIPLIERS），
// 也就是说材质数据有一份住在蚂蚁文件里。现在它和其它材质属性一起
// 回到了 data/materials.js 的 stats.durability。
export function durabilityForWidth(width, materialId = 'soil') {
  const cfg = DURABILITY_CONFIG.layers
  const ratio = Math.max(0, Math.min(1, (width - cfg.minWidth) / (cfg.maxWidth - cfg.minWidth)))
  // durabilityMax 现在是材质的「满宽耐久」绝对值（泥土 18），不再是倍率。
  // 曲线形状不变：按宽度在 7/18 ~ 1 之间插值，再按材质的池子大小缩放。
  const full = modOf({ typeId: 'normal', materialId }, 'durabilityMax')
  return Math.round((cfg.min + ratio * (cfg.max - cfg.min)) * (full / cfg.max))
}
