// 攻击 / 捣乱系统统一配置。
// 楼层耐久与材质攻击系数供 AttackSystem 使用；
// enemies 为五种捣乱飞行物的统一定义（原 gameEngine 旧敌人系统与 attackSystem
// 已合并为这一份配置，避免两套系统同时刷怪、规则不一致）。
export const ATTACK_CONFIG = {
  durability: { minWidth: 24, maxWidth: 120, min: 18, max: 46, materialMultiplier: 0.18 },
  // maxConcurrent：同屏最多 2 个，且不重复类型（与 README 一致）
  schedule: { maxConcurrent: 2, baseInterval: 6.5, minInterval: 2.8 },
  enemies: {
    bird: {
      name: '飞鸟', unlock: 0.12, weight: 3, hp: 1, coins: 2, r: 18,
      speed: 250, warning: 0.75, damage: 13,
      desc: '贴着目标层低空掠过：啄击该层耐久'
    },
    eagle: {
      name: '老鹰', unlock: 0.3, weight: 2.2, hp: 2, coins: 3, r: 24,
      warning: 0.9, hover: 180, life: 9,
      desc: '楼顶侧上方盘旋，持续狂风把方块往一侧压'
    },
    drone: {
      name: '无人机', unlock: 0.42, weight: 2.2, hp: 2, coins: 3, r: 19,
      warning: 0.9, hover: 215, life: 9,
      desc: '悬停发干扰波，方块移动速度忽快忽慢'
    },
    plane: {
      name: '客机', unlock: 0.55, weight: 2, hp: 3, coins: 4, r: 30,
      speed: 180, warning: 1.0, weatherOnly: ['rain', 'hail', 'storm'],
      widthLoss: { rain: 0.12, hail: 0.2, storm: 0.3 },
      secondMultiplier: 0.5, minWidth: 22,
      desc: '恶劣天气：与待落方块同高掠过气流推偏，随后俯冲坠毁在标记层爆炸'
    },
    ufo: {
      name: 'UFO', unlock: 0.7, weight: 2.4, hp: 3, coins: 5, r: 26,
      warning: 1.15, hover: 150, absorbMin: 2.6, absorbMax: 5.2, minWidth: 22,
      desc: '牵引光束蓄力吸走楼顶整层，击退奖励充能 +1'
    }
  }
}

// 材质对各类攻击的抗性系数（<1 = 更抗，>1 = 更脆弱）。
// ufo 系数作用于“吸取耗时”：系数越小蓄力越慢（越抗吸）。
export const MATERIAL_ATTACK_MODIFIERS = {
  soil: { durability: 1, bird: 1, ufo: 1, plane: 1 },
  concrete: { durability: 1.18, bird: 0.92, ufo: 1.08, plane: 0.92 },
  steel: { durability: 1.28, bird: 0.8, ufo: 1.18, plane: 0.82 },
  bronze: { durability: 1.12, bird: 0.88, ufo: 0.86, plane: 1.08 },
  blackgold: { durability: 1.35, bird: 0.75, ufo: 0.72, plane: 0.62 }
}

export function durabilityForWidth(width, materialId = 'soil') {
  const cfg = ATTACK_CONFIG.durability
  const m = MATERIAL_ATTACK_MODIFIERS[materialId] || MATERIAL_ATTACK_MODIFIERS.soil
  const ratio = Math.max(0, Math.min(1, (width - cfg.minWidth) / (cfg.maxWidth - cfg.minWidth)))
  return Math.round((cfg.min + ratio * (cfg.max - cfg.min)) * m.durability)
}
