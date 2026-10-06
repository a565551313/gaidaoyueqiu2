// 建筑材质（六轴基础属性） —— 纯数据（Phase 0 内容数据化，从 src/data 抽取）。
// 本文件只放字面量：不放函数、不放派生逻辑、不 import 任何东西。
// 运行时经 src/core/content.js（Provider）注入 src/data/*；结构由
// scripts/verify-content.mjs 的快照基线锁定，改这里的数值必须同步更新快照。
// effect 展示文案由 data/materials.js 的 describeStats 现算，不存数据
export const materials = [
  {
    "id": "soil",
    "name": "泥土",
    "price": 0,
    "desc": "默认建筑材质，朴素可靠，没有额外效果。",
    "color": "#a96f45",
    "colors": [
      "#b9794a",
      "#8e4d2f"
    ],
    "colorsDark": [
      "#b8794d",
      "#4d2f35"
    ],
    "ownedByDefault": true,
    "stats": {
      "width": 100,
      "durability": 18,
      "weight": 10,
      "hardness": 5,
      "friction": 10,
      "toughness": 0
    }
  },
  {
    "id": "concrete",
    "name": "混凝土",
    "price": 650,
    "desc": "表面粗糙，雨天更不容易打滑。",
    "color": "#8c98a8",
    "colors": [
      "#c0c8d2",
      "#7a8491"
    ],
    "stats": {
      "width": 100,
      "durability": 21.24,
      "weight": 10,
      "hardness": 5,
      "friction": 16,
      "toughness": 0
    }
  },
  {
    "id": "steel",
    "name": "钢材",
    "price": 900,
    "desc": "坚硬的金属结构，能抵抗高空阵风。",
    "color": "#5b91b8",
    "colors": [
      "#b9d5e8",
      "#4f7695"
    ],
    "stats": {
      "width": 100,
      "durability": 23.04,
      "weight": 18,
      "hardness": 5,
      "friction": 10,
      "toughness": 0
    }
  },
  {
    "id": "bronze",
    "name": "青铜",
    "price": 1200,
    "desc": "韧性金属，落偏时可以保住一部分被切掉的边缘。",
    "color": "#b8783e",
    "colors": [
      "#e2b46b",
      "#8b572c"
    ],
    "stats": {
      "width": 100,
      "durability": 20.16,
      "weight": 10,
      "hardness": 5,
      "friction": 10,
      "toughness": 8
    }
  },
  {
    "id": "blackgold",
    "name": "乌金",
    "price": 1700,
    "desc": "吸收雷光的稀有材质，雷击时最能守住楼体。",
    "color": "#6d5c98",
    "colors": [
      "#777099",
      "#211b35"
    ],
    "stats": {
      "width": 100,
      "durability": 24.3,
      "weight": 10,
      "hardness": 20,
      "friction": 10,
      "toughness": 0
    }
  }
]
