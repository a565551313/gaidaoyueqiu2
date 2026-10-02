// 建筑材质配置：永久解锁并装备，一局只生效一种材质。
export const MATERIALS = [
  {
    id: 'soil',
    name: '泥土',
    price: 0,
    desc: '默认建筑材质，朴素可靠，没有额外效果。',
    effect: '无特殊效果',
    color: '#a96f45',
    colors: ['#b9794a', '#8e4d2f'],
    ownedByDefault: true,
    // 各材质对楼层耐久的影响统一配置在 data/ants.js 的
    // MATERIAL_DURABILITY_MULTIPLIERS（这里不再保留一份永不生效的副本）。
    effects: {}
  },
  {
    id: 'concrete',
    name: '混凝土',
    price: 650,
    desc: '表面粗糙，雨天更不容易打滑。',
    effect: '抗滑 +30%：暴雨打滑距离减少 30%',
    color: '#8c98a8',
    colors: ['#c0c8d2', '#7a8491'],
    effects: { antiSlip: 0.3 }
  },
  {
    id: 'steel',
    name: '钢材',
    price: 900,
    desc: '坚硬的金属结构，能抵抗高空阵风。',
    effect: '抗风 +25%：风力推偏与额外晃动减少 25%',
    color: '#5b91b8',
    colors: ['#b9d5e8', '#4f7695'],
    effects: { antiWind: 0.25 }
  },
  {
    id: 'bronze',
    name: '青铜',
    price: 1200,
    desc: '韧性金属，落偏时可以保住一部分被切掉的边缘。',
    effect: '抗碎 +25%：普通落偏与冰雹损伤减少 25%',
    color: '#b8783e',
    colors: ['#e2b46b', '#8b572c'],
    effects: { antiBreak: 0.25 }
  },
  {
    id: 'blackgold',
    name: '乌金',
    price: 1700,
    desc: '吸收雷光的稀有材质，雷击时最能守住楼体。',
    effect: '抗雷劈：雷击最多劈掉 1 层',
    color: '#6d5c98',
    colors: ['#777099', '#211b35'],
    effects: { lightningMaxFloors: 1 }
  }
]

export function getMaterial(id) {
  return MATERIALS.find((material) => material.id === id) || MATERIALS[0]
}
