// 结构危机原型配置。结构设备没有可磨损生命值；一次命中即中止当前事件。
// 楼层耐久仍由天气/建筑系统使用，不影响三种新事件的倒数或结果。
export const DURABILITY_CONFIG = {
  layers: { minWidth: 24, maxWidth: 120, min: 18, max: 46, materialMultiplier: 0.18 }
}

export const EVENT_CONFIG = {
  cutter: {
    name: '承重切断器', warning: 3.4, finalWindow: 1.2, cancelCoins: 3,
    hitRadius: 18, color: '#ffd36b',
    desc: '锁定塔顶下方 2–4 层中的承重层；命中后该层及以上楼层坍塌。'
  },
  blocker: {
    name: '落位封锁器', warning: 3, finalWindow: 1, cancelCoins: 2,
    hitRadius: 18, color: '#71f5c2', windowFraction: 0.58, windowMin: 30, windowMax: 62,
    desc: '窗口闭合后，只影响下一次手动落层，框外重叠被切除。'
  },
  drill: {
    name: '地基破拆机', warning: 5, tutorialWarning: 5.8, finalWindow: 1.2,
    pressureWindow: 1.2, cancelCoins: 5, hitRadius: 20, color: '#ff6c68',
    desc: '倒数归零时全塔坍塌；承压窗内手动完美落层可中断钻进。'
  }
}

// 八个关卡阶段使用可复现进度脚本；后续天气章节复用相同 stage 脚本。
const STAGE_EVENT_SCHEDULES = {
  1: [
    { type: 'cutter', at: 0.20 },
    { type: 'cutter', at: 0.58 }
  ],
  2: [
    { type: 'cutter', at: 0.18 },
    { type: 'blocker', at: 0.48 }
  ],
  3: [
    { type: 'cutter', at: 0.20 },
    { type: 'blocker', at: 0.45 },
    { type: 'drill', at: 0.70, warning: 5.8 }
  ],
  4: [
    { type: 'cutter', at: 0.18 },
    { type: 'blocker', at: 0.43 },
    { type: 'drill', at: 0.68 },
    { type: 'blocker', at: 0.86, chain: true }
  ],
  5: [
    { type: 'cutter', at: 0.18 },
    { type: 'blocker', at: 0.43 },
    { type: 'drill', at: 0.68 },
    { type: 'blocker', at: 0.86, chain: true }
  ],
  6: [
    { type: 'cutter', at: 0.18 },
    { type: 'blocker', at: 0.43 },
    { type: 'drill', at: 0.68 },
    { type: 'blocker', at: 0.86, chain: true }
  ],
  7: [
    { type: 'cutter', at: 0.18 },
    { type: 'blocker', at: 0.43 },
    { type: 'drill', at: 0.68 },
    { type: 'blocker', at: 0.86, chain: true }
  ],
  8: [
    { type: 'blocker', at: 0.82, chain: true }
  ]
}

// 按关卡的章内 stage 映射到项目全部 56 关；每关使用独立条目避免运行期共享变更。
export const EVENT_SCHEDULES = Object.fromEntries(
  Array.from({ length: 56 }, (_, index) => {
    const levelId = index + 1
    const stage = ((levelId - 1) % 8) + 1
    return [levelId, STAGE_EVENT_SCHEDULES[stage].map((event) => ({ ...event }))]
  })
)

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
