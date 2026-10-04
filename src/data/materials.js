// 建筑材质配置：永久解锁并装备，一局只生效一种材质。
//
// 材质 = 皮肤 + 属性。art 管外观，stats 管数值，两者都住在这里。
//
// stats 是**绝对基础值**，不是倍率。六条轴的含义见 blockStats.js，
// 「基础值 → 引擎实际效果」的换算在 blocks.js 的 EFFECT_FROM_STATS。
//
// 耐久写成两位小数不是手滑：这些数字是从旧模型的耐久倍率
// （1.18 / 1.28 / 1.12 / 1.35）反推出来的满宽耐久，必须保留两位小数
// 才能让 24~120px 每一个宽度点的取整结果和改版前**逐点相同**。
// 取整数会让付费材质在约 10% 的宽度上悄悄少 1 点耐久 —— 那是一次
// 没人要求过的削弱，而且会让路线①的坍塌率标定失效。
import { describeStats } from './blockStats.js'

export const MATERIALS = [
  {
    id: 'soil',
    name: '泥土',
    price: 0,
    desc: '默认建筑材质，朴素可靠，没有额外效果。',
    color: '#a96f45',
    colors: ['#b9794a', '#8e4d2f'],
    // 深色主题下泥土用一组更沉的配色，避免和青铜撞色。
    colorsDark: ['#b8794d', '#4d2f35'],
    ownedByDefault: true,
    stats: { width: 100, durability: 18,    weight: 10, hardness: 5,  friction: 10, toughness: 0 }
  },
  {
    id: 'concrete',
    name: '混凝土',
    price: 650,
    desc: '表面粗糙，雨天更不容易打滑。',
    color: '#8c98a8',
    colors: ['#c0c8d2', '#7a8491'],
    stats: { width: 100, durability: 21.24, weight: 10, hardness: 5,  friction: 16, toughness: 0 }
  },
  {
    id: 'steel',
    name: '钢材',
    price: 900,
    desc: '坚硬的金属结构，能抵抗高空阵风。',
    color: '#5b91b8',
    colors: ['#b9d5e8', '#4f7695'],
    stats: { width: 100, durability: 23.04, weight: 18, hardness: 5,  friction: 10, toughness: 0 }
  },
  {
    id: 'bronze',
    name: '青铜',
    price: 1200,
    desc: '韧性金属，落偏时可以保住一部分被切掉的边缘。',
    color: '#b8783e',
    colors: ['#e2b46b', '#8b572c'],
    // 旧模型里这两条共用一个 antiBreak: 0.25，但它们语义不同：
    // 一条是「冰雹削宽打七五折」，一条是「落偏保住 25% 的边」。
    // 拆开后青铜行为完全不变，而且以后可以单独调其中一条。
    stats: { width: 100, durability: 20.16, weight: 10, hardness: 5,  friction: 10, toughness: 8 }
  },
  {
    id: 'blackgold',
    name: '乌金',
    price: 1700,
    desc: '吸收雷光的稀有材质，雷击时最能守住楼体。',
    color: '#6d5c98',
    colors: ['#777099', '#211b35'],
    stats: { width: 100, durability: 24.3,  weight: 10, hardness: 20, friction: 10, toughness: 0 }
  }
]

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
