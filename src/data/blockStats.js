// 方块属性词汇表。
//
// 这个文件刻意不 import 任何东西：materials.js 要用 describeStats 生成展示
// 文案，真正的解析器 statsOf 又要同时读材质和类型，放一起会成环。
//
// ——为什么从「倍率」改成「基础值」——
// 旧模型每条属性是一个乘数（windPush: 0.75、durabilityMax: 1.28）。
// 问题是乘数只有和默认值比较才有意义，单看一个数字读不出任何东西，
// 图鉴里显示「风力推偏 0.75x」对玩家毫无信息量。
// 现在每条属性是一个绝对的基础值（基础重量 18），数值本身就是信息，
// 「属性 → 实际效果」的换算收在 blocks.js 的 EFFECT_FROM_STATS 里。
//
// 加一条新属性 = 这里一行 + blocks.js 里一条换算 + 消费点一次 effectOf 调用。

export const STAT_SPECS = Object.freeze({
  width: {
    label: '基础宽度',
    desc: '方块的基础宽度。落点面积越大越好落，也决定耐久曲线和分数上限。',
    unit: '点',
    base: 100,
    better: 'high'
  },
  durability: {
    label: '基础耐久',
    desc: '方块满宽时的耐久值。蚂蚁啃咬和冰雹砸落都扣这个池子。',
    unit: '',
    base: 18,
    better: 'high'
  },
  weight: {
    label: '基础重量',
    desc: '方块的抗风能力。越重，风和风暴把下落中的方块吹偏得越少。',
    unit: '',
    base: 10,
    better: 'high'
  },
  hardness: {
    label: '基础硬度',
    desc: '方块的抗雷击能力。越硬，一次落雷能劈掉的楼层越少。',
    unit: '',
    base: 5,
    better: 'high'
  },
  friction: {
    label: '基础摩擦',
    desc: '方块的抗打滑能力。越涩，雨天方块横向滑移得越少。',
    unit: '',
    base: 10,
    better: 'high'
  },
  toughness: {
    label: '基础韧性',
    desc: '方块的抗削宽能力。越韧，落偏时保住的边缘越多，被冰雹砸掉的宽度也越少。',
    unit: '',
    base: 0,
    better: 'high'
  }
})

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
