// 建筑材质配置：永久解锁并装备，一局只生效一种材质。
//
// 材质 = 皮肤 + 属性。art 管外观，mods 管数值，两者都住在这里——
// 耐久倍率以前住在 data/ants.js，现在搬回来了，材质数据只有这一处。
//
// 展示用的 effect 字符串由 mods 自动生成（见下方 Object.defineProperty）。
// 以前它是人肉同步的第三份副本，4 个付费材质的耐久加成全都漏写了。
import { describeMods } from './blockMods.js'

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
    mods: {}
  },
  {
    id: 'concrete',
    name: '混凝土',
    price: 650,
    desc: '表面粗糙，雨天更不容易打滑。',
    color: '#8c98a8',
    colors: ['#c0c8d2', '#7a8491'],
    mods: {
      slip: 0.7,
      durabilityMax: 1.18
    }
  },
  {
    id: 'steel',
    name: '钢材',
    price: 900,
    desc: '坚硬的金属结构，能抵抗高空阵风。',
    color: '#5b91b8',
    colors: ['#b9d5e8', '#4f7695'],
    mods: {
      windPush: 0.75,
      durabilityMax: 1.28
    }
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
    mods: {
      widthDamage: 0.75,
      cutRetain: 0.25,
      durabilityMax: 1.12
    }
  },
  {
    id: 'blackgold',
    name: '乌金',
    price: 1700,
    desc: '吸收雷光的稀有材质，雷击时最能守住楼体。',
    color: '#6d5c98',
    colors: ['#777099', '#211b35'],
    mods: {
      lightningFloors: 1,
      durabilityMax: 1.35
    }
  }
]

// 商店、局内 HUD 和图鉴都读 material.effect。从 mods 现算，
// 改了数值文案自动跟着变，不可能再漂。
for (const material of MATERIALS) {
  Object.defineProperty(material, 'effect', {
    enumerable: true,
    get() { return describeMods(this.mods) }
  })
}

export function getMaterial(id) {
  return MATERIALS.find((material) => material.id === id) || MATERIALS[0]
}
