// 方块类型（谁放的） —— 纯数据（Phase 0 内容数据化，从 src/data 抽取）。
// 本文件只放字面量：不放函数、不放派生逻辑、不 import 任何东西。
// 运行时经 src/core/content.js（Provider）注入 src/data/*；结构由
// scripts/verify-content.mjs 的快照基线锁定，改这里的数值必须同步更新快照。
export const blockTypes = [
  {
    "id": "normal",
    "name": "标准层",
    "desc": "玩家手动落下的楼层，外观跟随当前建筑材质。",
    "art": {},
    "stats": {}
  },
  {
    "id": "base",
    "name": "地基",
    "desc": "开局就在的那一层，永远不会被蚁群选为目标。",
    "art": {
      "colors": [
        "#3b577d",
        "#17253f"
      ]
    },
    "stats": {}
  },
  {
    "id": "flame",
    "name": "烈焰层",
    "desc": "烈焰技能连续铺三层，沿顶边燃烧。不计分。",
    "art": {
      "colors": [
        "#ffc857",
        "#ee6c32"
      ],
      "tint": "#ffc890",
      "edge": "flame"
    },
    "stats": {}
  },
  {
    "id": "pursuit",
    "name": "追击层",
    "desc": "追击技能补的一层，直接盖在塔顶。不计分。",
    "art": {
      "colors": [
        "#7df3d2",
        "#2b8fe8"
      ],
      "tint": "#bfe8ff"
    },
    "stats": {}
  }
]
