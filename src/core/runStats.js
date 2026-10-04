// 开局结算（RunStats）：把材质配方 + 技能 + 道具 + 宠物的加成，在开局前统一
// 算成一张账本。
//
// 背景：blocks.js 已经是材质配方 → 引擎效果的「唯一翻译点」，但技能/道具/
// 宠物的加成一直是各自为政——直接在 gameEngine 构造函数里手写
// `1 + skills.foundation * 0.01` 这种内联公式，没有任何地方能一眼看出
// "这局的地基宽度到底由哪几笔加成构成"。这正是乌金（硬度→抗雷击）和
// 云母精灵（天气类宠物效果）曾经变成「写了但没人读」死代码的根因：
// 加成的产出方和消费方之间没有一张强制对账的清单。
//
// 这个模块就是那张清单：GameEngine 开局调用一次 buildRunStats(opts)，
// 后续全程只读 engine.runStats，不再各处手写公式。新增技能/道具/宠物/
// 以后的加成来源时，只需要在对应的 resolve*() 里补一条 modifier——
// describeRunStats() 会自动把它列进开局结算清单，不会再出现漏接的加成。
//
// 两种聚合方式：
//   A) 数值叠加型（本文件的 resolveNumeric）：
//        最终值 = 基础值 × Π(各来源倍率) + Σ(各来源加法项)
//      用于地基宽度、完美窗口等「大家都在同一个数轴上叠加」的属性。
//   B) 优先链型（cutProtectionChain）：
//      命中即完全免切、顺序决定谁先判定，材质的韧性是没人触发时的兜底。
//      这类效果在 gameEngine.js 的落子分支里本来就是顺序判定的 if/else，
//      这里只是把同一份顺序显式地写成一张可读、可展示的清单（见下方
//      cutProtectionChain 的用法说明）；如果以后改了判定顺序，请同步
//      修改 gameEngine.js 对应分支与这里，两边保持一致。
import { statsOf } from '../data/blocks.js'

function resolveNumeric(base, modifiers) {
  let mult = 1
  let add = 0
  for (const m of modifiers) {
    if (!m || m.value == null) continue
    if (m.mode === 'add') add += m.value
    else mult *= m.value
  }
  return base * mult + add
}

export function buildRunStats({ material, skills = {}, pet = null, inventory = {}, widenActive = false } = {}) {
  const petEffects = pet?.effects || {}
  const materialId = typeof material === 'string' ? material : material?.id
  const materialName = typeof material === 'string' ? material : material?.name || materialId
  const materialStats = statsOf({ typeId: 'normal', materialId })

  // ---- 地基宽度：材质基础 100 点 × 磐石根基(技能) × 加宽卡(道具) ----
  // 注：当前 5 种材质的「基础宽度」都是 100（这条轴目前只给方块类型/未来
  // 内容预留，材质暂不使用），所以这里的 100 和 materialStats.width 恒等；
  // 一旦以后有材质想改宽度，应该把下面的 100 换成 materialStats.width。
  const widthMods = [
    mod('skill:foundation', '磐石根基', (skills.foundation || 0) * 0.01 + 1, (skills.foundation || 0) > 0),
    mod('item:widen', '加宽卡', widenActive ? 1.1 : 1, widenActive)
  ]
  const initialWidthPoints = resolveNumeric(100, widthMods)

  // ---- 完美判定窗口：基础 10px × 明察秋毫(技能) × 宠物窗口倍率 ----
  const perfectWindowMods = [
    mod('skill:insight', '明察秋毫', (skills.insight || 0) * 0.01 + 1, (skills.insight || 0) > 0),
    mod('pet:perfectWindowMult', pet?.name ? `${pet.name}` : '宠物', petEffects.perfectWindowMult || 1, !!petEffects.perfectWindowMult && petEffects.perfectWindowMult !== 1)
  ]
  const perfectWindowPx = resolveNumeric(10, perfectWindowMods)

  // ---- 移动速度 / 晃动幅度：目前只有「以静制动」一个来源，架构保留扩展位 ----
  const speedMods = [mod('skill:stillness', '以静制动', 1 - (skills.stillness || 0) * 0.01, (skills.stillness || 0) > 0)]
  const speedMult = Math.max(0.1, resolveNumeric(1, speedMods))
  const swayReduce = Math.min(0.4, (skills.stillness || 0) * 0.08)

  // ---- 触发概率（技能独占）----
  const goldenBellChance = (skills.goldenBell || 0) * 0.01
  const unityChance = (skills.unity || 0) * 0.01
  const pursuitChance = (skills.pursuit || 0) * 0.01

  // ---- 金币倍率：点石成金(技能) × 星辉猫(宠物)；结算时还会再乘三星/双倍卡 ----
  const coinMods = [
    mod('skill:midas', '点石成金', 1 + (skills.midas || 0) * 0.02, (skills.midas || 0) > 0),
    mod('pet:coinMult', pet?.name ? `${pet.name}` : '宠物', petEffects.coinMult || 1, !!petEffects.coinMult && petEffects.coinMult !== 1)
  ]
  const midasMult = 1 + (skills.midas || 0) * 0.02
  const petCoinMult = petEffects.coinMult || 1

  // ---- 起始充能 ----
  const preemptiveLv = skills.preemptive || 0

  // ---- 切除保护优先链（展示用；真实判定顺序见 gameEngine.js 落子分支） ----
  const cutProtectionChain = [
    {
      id: 'unity', label: '心手合一', source: 'skill',
      chance: unityChance, active: unityChance > 0,
      note: '直接判定为完美：不切除、不消耗材质保护'
    },
    {
      id: 'goldenBell', label: '金钟罩', source: 'skill',
      chance: goldenBellChance, active: goldenBellChance > 0,
      note: '本次落点完全不切除'
    },
    {
      id: 'emberFoxShield', label: '燧星狐 · 护层', source: 'pet',
      active: !!petEffects.flameShield,
      note: '每局限一次，完全不切除（5★解锁）'
    },
    {
      id: 'shieldCard', label: '护盾卡', source: 'item',
      count: inventory.shield || 0, active: (inventory.shield || 0) > 0,
      note: '每张限一次，完全不切除'
    },
    {
      id: 'materialToughness', label: `材质韧性兜底 · ${materialName || ''}`, source: 'material',
      retainPct: (materialStats.toughness || 0) * 0.03125, active: true,
      note: '以上均未触发时，按材质保住一部分被切掉的边缘'
    }
  ]

  return {
    materialId,
    materialName,
    initialWidthPoints,
    perfectWindowPx,
    speedMult,
    swayReduce,
    goldenBellChance,
    unityChance,
    pursuitChance,
    midasMult,
    petCoinMult,
    preemptiveLv,
    cutProtectionChain,
    // 给 describeRunStats() 用的原始加成明细，不参与引擎计算
    _breakdown: { widthMods, perfectWindowMods, speedMods, coinMods }
  }
}

function mod(source, label, value, active) {
  return { source, label, mode: 'mult', value, active }
}

function describeFactor(base, mods, result, unit, digits = 1) {
  const parts = mods.filter((m) => m.active).map((m) => `${m.label}×${m.value.toFixed(2)}`)
  const body = parts.length ? `${base}${unit} × ${parts.join(' × ')}` : `${base}${unit}（无加成）`
  return `${body} = ${result.toFixed(digits)}${unit}`
}

// 给「开局结算清单 / 对局内加成明细」面板用的纯文本行，调试打印同样好用。
export function describeRunStats(runStats) {
  const { _breakdown: b } = runStats
  const lines = []
  lines.push({ key: 'width', label: '地基宽度', text: describeFactor(100, b.widthMods, runStats.initialWidthPoints, '点') })
  lines.push({ key: 'perfectWindow', label: '完美窗口', text: describeFactor(10, b.perfectWindowMods, runStats.perfectWindowPx, 'px') })
  lines.push({ key: 'speed', label: '移动速度', text: `基础 × ${runStats.speedMult.toFixed(2)}` })
  lines.push({ key: 'sway', label: '高空晃动', text: `-${Math.round(runStats.swayReduce * 100)}%（以静制动）` })
  lines.push({
    key: 'coin',
    label: '金币倍率',
    text: `点石成金 ×${runStats.midasMult.toFixed(2)} × 宠物 ×${runStats.petCoinMult.toFixed(2)}（结算时再乘三星/双倍卡）`
  })
  const chainText = runStats.cutProtectionChain
    .map((c) => {
      const tag = c.chance != null ? `${Math.round(c.chance * 100)}%` : c.count != null ? `×${c.count}` : c.retainPct != null ? `保${Math.round(c.retainPct * 100)}%` : ''
      return `${c.label}${c.active ? (tag ? `(${tag})` : '') : '(未激活)'}`
    })
    .join(' → ')
  lines.push({ key: 'cutChain', label: '切除保护优先级', text: chainText })
  return lines
}
