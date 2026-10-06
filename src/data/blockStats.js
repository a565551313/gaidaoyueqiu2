// 方块属性词汇表（数据层）。
//
// 这个文件刻意不 import 材质/类型数据：materials.js 要用 describeStats 生成展示
// 文案，真正的解析器 statsOf 又要同时读材质和类型，放一起会成环。
//
// ——为什么从「倍率」改成「基础值」——
// 旧模型每条属性是一个乘数（windPush: 0.75、durabilityMax: 1.28）。
// 问题是乘数只有和默认值比较才有意义，单看一个数字读不出任何东西，
// 图鉴里显示「风力推偏 0.75x」对玩家毫无信息量。
// 现在每条属性是一个绝对的基础值（基础重量 18），数值本身就是信息，
// 「属性 → 实际效果」的换算收在 blocks.js 的 EFFECT_FROM_STATS 里。
//
// 加一条新属性 = 内容包里一行 + blocks.js 里一条换算 + 消费点一次 effectOf 调用。
//
// Phase 0 内容数据化：STAT_SPECS 的字面量在 src/content/defaults/blockStats.js，
// 经 src/core/content.js 注入；本文件保留冻结语义与全部派生函数。

import { bundle } from '../core/content.js'

export const STAT_SPECS = Object.freeze(bundle.statSpecs)

export const STAT_KEYS = Object.freeze(Object.keys(STAT_SPECS))

// 基准线 = 泥土。任何材质不写的属性都落回这里。
export const BASE_STATS = Object.freeze(
  Object.fromEntries(STAT_KEYS.map((k) => [k, STAT_SPECS[k].base]))
)

// 材质给绝对值，方块类型和落层标记给增量（+2 / -1）。
// 增量用加法而不是乘法：基础值是有量纲的实数，乘法在这里读不出意思。
export function resolveStats(base = {}, deltas = []) {
  const out = { ...BASE_STATS }
  for (const key of STAT_KEYS) {
    if (base[key] != null) out[key] = base[key]
  }
  for (const delta of deltas) {
    if (!delta) continue
    for (const key of STAT_KEYS) {
      if (delta[key] != null) out[key] += delta[key]
    }
  }
  for (const key of STAT_KEYS) out[key] = Math.max(0, out[key])
  return out
}

// 展示文案：只说和基准线不同的部分。
export function describeStats(stats, empty = '无特殊效果') {
  const parts = []
  for (const key of STAT_KEYS) {
    const value = stats?.[key]
    if (value == null || value === STAT_SPECS[key].base) continue
    const spec = STAT_SPECS[key]
    const diff = value - spec.base
    parts.push(`${spec.label} ${diff > 0 ? '+' : ''}${Number(diff.toFixed(2))}`)
  }
  return parts.length ? parts.join(' · ') : empty
}

// 图鉴属性条用的行数据。
export function statRows(stats, keys = STAT_KEYS) {
  return keys.map((key) => {
    const spec = STAT_SPECS[key]
    const value = stats?.[key] ?? spec.base
    return {
      key,
      label: spec.label,
      desc: spec.desc,
      value,
      base: spec.base,
      better: spec.better,
      unit: spec.unit,
      isDefault: value === spec.base,
      text: spec.unit ? `${value} ${spec.unit}` : String(value)
    }
  })
}
