// 六条属性轴定义（STAT_SPECS） —— 纯数据（Phase 0 内容数据化，从 src/data 抽取）。
// 本文件只放字面量：不放函数、不放派生逻辑、不 import 任何东西。
// 运行时经 src/core/content.js（Provider）注入 src/data/*；结构由
// scripts/verify-content.mjs 的快照基线锁定，改这里的数值必须同步更新快照。
export const statSpecs = {
  "width": {
    "label": "基础宽度",
    "desc": "方块的基础宽度。落点面积越大越好落，也决定耐久曲线和分数上限。",
    "unit": "点",
    "base": 100,
    "better": "high"
  },
  "durability": {
    "label": "基础耐久",
    "desc": "方块满宽时的耐久值。蚂蚁啃咬和冰雹砸落都扣这个池子。",
    "unit": "",
    "base": 18,
    "better": "high"
  },
  "weight": {
    "label": "基础重量",
    "desc": "方块的抗风能力。越重，风和风暴把下落中的方块吹偏得越少。",
    "unit": "",
    "base": 10,
    "better": "high"
  },
  "hardness": {
    "label": "基础硬度",
    "desc": "方块的抗雷击能力。越硬，一次落雷能劈掉的楼层越少。",
    "unit": "",
    "base": 5,
    "better": "high"
  },
  "friction": {
    "label": "基础摩擦",
    "desc": "方块的抗打滑能力。越涩，雨天方块横向滑移得越少。",
    "unit": "",
    "base": 10,
    "better": "high"
  },
  "toughness": {
    "label": "基础韧性",
    "desc": "方块的抗削宽能力。越韧，落偏时保住的边缘越多，被冰雹砸掉的宽度也越少。",
    "unit": "",
    "base": 0,
    "better": "high"
  }
}
