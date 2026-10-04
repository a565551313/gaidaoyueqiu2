// 方块属性的词汇表：有哪些属性、默认值是多少、多个来源怎么合并、怎么翻成人话。
//
// 这个文件刻意不 import 任何东西——materials.js 要用 describeMods 生成展示文案，
// 真正的解析器 modOf 又要同时读材质和类型，放一起会成环。
// 词汇表（这里）和解析器（blocks.js）分开，依赖图就是一棵树。
//
// 加一个全新的属性通道 = 这里一行 + 消费点一次 modOf 调用。
// 加一个用已有属性的方块类型 = 配方表里一行，这里不用动。

// 合并规则只有三种：
//   mul 相乘（削弱型，叠加越多越强）
//   min 取小（上限型）
//   max 取大（保底型）
export const MOD_SPECS = Object.freeze({
  // —— 受击 ——
  widthDamage: { def: 1, merge: 'mul', group: 'defense', label: '削宽伤害', unit: 'x' },
  durabilityDamage: { def: 1, merge: 'mul', group: 'defense', label: '耐久伤害', unit: 'x' },
  durabilityMax: { def: 1, merge: 'mul', group: 'defense', label: '耐久', unit: 'x' },
  lightningFloors: { def: 3, merge: 'min', group: 'defense', label: '雷击上限', unit: '层' },
  sinkResist: { def: 1, merge: 'mul', group: 'defense', label: '抗下陷', unit: 'x' },
  // —— 操作 ——
  slip: { def: 1, merge: 'mul', group: 'control', label: '打滑', unit: 'x' },
  windPush: { def: 1, merge: 'mul', group: 'control', label: '风力推偏', unit: 'x' },
  speed: { def: 1, merge: 'mul', group: 'control', label: '横移速度', unit: 'x' },
  // —— 结算 ——
  scoreMult: { def: 1, merge: 'mul', group: 'score', label: '得分', unit: 'x' },
  cutRetain: { def: 0, merge: 'max', group: 'score', label: '落偏保边', unit: '%' }
})

export const MOD_KEYS = Object.freeze(Object.keys(MOD_SPECS))

export function mergeMod(key, a, b) {
  const rule = MOD_SPECS[key].merge
  if (rule === 'min') return Math.min(a, b)
  if (rule === 'max') return Math.max(a, b)
  return a * b
}

// 把若干份 mods（类型的、材质的、标记的）合并成一个值。
export function resolveMod(modsList, key) {
  const spec = MOD_SPECS[key]
  if (!spec) throw new Error(`unknown block mod: ${key}`)
  let value = spec.def
  for (const mods of modsList) {
    if (mods && Object.hasOwn(mods, key)) value = mergeMod(key, value, mods[key])
  }
  return value
}

const PHRASING = {
  widthDamage: (v) => `冰雹削宽 ${pct(v)}`,
  durabilityDamage: (v) => `受到耐久伤害 ${pct(v)}`,
  durabilityMax: (v) => `耐久 ${pct(v)}`,
  lightningFloors: (v) => `雷击最多劈 ${v} 层`,
  sinkResist: (v) => `坍塌下陷 ${pct(v)}`,
  slip: (v) => `暴雨打滑 ${pct(v)}`,
  windPush: (v) => `风力推偏 ${pct(v)}`,
  speed: (v) => `横移速度 ${pct(v)}`,
  scoreMult: (v) => `得分 ${pct(v)}`,
  cutRetain: (v) => `落偏保边 ${Math.round(v * 100)}%`
}

function pct(v) {
  const delta = Math.round((v - 1) * 100)
  return delta >= 0 ? `+${delta}%` : `${delta}%`
}

// 把 mods 翻成给玩家看的一行字。商店 / 局内 HUD / 图鉴共用，
// 改了数值文案自动跟着变，不可能再漂。
export function describeMods(mods, empty = '无特殊效果') {
  const parts = []
  for (const key of MOD_KEYS) {
    if (!mods || !Object.hasOwn(mods, key)) continue
    if (mods[key] === MOD_SPECS[key].def) continue
    parts.push(PHRASING[key](mods[key]))
  }
  return parts.length ? parts.join(' · ') : empty
}

// 图鉴用：把 mods 摊成可以画成属性条的列表。
// 默认值的轴也要出现——「这个材质在这条轴上没加成」本身就是信息。
export function statsOf(mods, keys = MOD_KEYS) {
  return keys.map((key) => {
    const spec = MOD_SPECS[key]
    const value = mods && Object.hasOwn(mods, key) ? mods[key] : spec.def
    return {
      key,
      label: spec.label,
      unit: spec.unit,
      group: spec.group,
      value,
      def: spec.def,
      isDefault: value === spec.def,
      text: PHRASING[key](value)
    }
  })
}
