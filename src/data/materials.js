// 建筑材质数据层：永久解锁并装备，一局只生效一种材质。
//
// 材质 = 皮肤 + 属性。art 管外观，stats 管数值，两者都住在内容包里
//（Phase 0 起字面量在 src/content/defaults/materials.js，经 src/core/content.js 注入）。
//
// stats 是**绝对基础值**，不是倍率。六条轴的含义见 blockStats.js，
// 「基础值 → 引擎实际效果」的换算在 blocks.js 的 EFFECT_FROM_STATS。
//
// 耐久写成两位小数不是手滑：这些数字是从旧模型的耐久倍率
//（1.18 / 1.28 / 1.12 / 1.35）反推出来的满宽耐久，必须保留两位小数
// 才能让 24~120px 每一个宽度点的取整结果和改版前**逐点相同**。
// 取整数会让付费材质在约 10% 的宽度上悄悄少 1 点耐久 —— 那是一次
// 没人要求过的削弱，而且会让路线①的坍塌率标定失效。

import { describeStats } from './blockStats.js'
import { bundle } from '../core/content.js'

export const MATERIALS = bundle.materials.map((material) => ({ ...material }))

// 商店、局内 HUD 和图鉴都读 material.effect。从 stats 现算，
// 改了数值文案自动跟着变，不可能再漂。
for (const material of MATERIALS) {
  Object.defineProperty(material, 'effect', {
    enumerable: true,
    get() { return describeStats(this.stats) }
  })
}

export function getMaterial(id) {
  return MATERIALS.find((material) => material.id === id) || MATERIALS[0]
}
