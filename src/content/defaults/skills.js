// 永久技能 —— 纯数据（Phase 0 内容数据化，从 src/data 抽取）。
// 本文件只放字面量：不放函数、不放派生逻辑、不 import 任何东西。
// 运行时经 src/core/content.js（Provider）注入 src/data/*；结构由
// scripts/verify-content.mjs 的快照基线锁定，改这里的数值必须同步更新快照。
// effect 文案函数留在 data/skills.js（EFFECT_TEXT），数据只有 id/名称/上限/说明/配色
export const skills = [
  {
    "id": "foundation",
    "name": "磐石根基",
    "max": 20,
    "desc": "每级使开局宽度增加 1%。",
    "color": "#8d6e63"
  },
  {
    "id": "goldenBell",
    "name": "金钟罩",
    "max": 30,
    "desc": "每级增加 1% 概率，使一次非完美落点不切除宽度。",
    "color": "#4dd0e1"
  },
  {
    "id": "unity",
    "name": "心手合一",
    "max": 20,
    "desc": "每级增加 1% 概率，使本次落点直接判定为完美并计入连击。",
    "color": "#ffd54f"
  },
  {
    "id": "pursuit",
    "name": "乘胜追击",
    "max": 20,
    "desc": "完美落点后，每级增加 1% 概率自动再叠一层；自动层不连锁触发。",
    "color": "#ff8a65"
  },
  {
    "id": "stillness",
    "name": "以静制动",
    "max": 20,
    "desc": "每级使楼层移动速度降低 1%，并使高空楼体晃动幅度降低 8%（最多降低 40%）。",
    "color": "#81c784"
  },
  {
    "id": "midas",
    "name": "点石成金",
    "max": 20,
    "desc": "每级使本局金币获取增加 2%。",
    "color": "#ffca28"
  },
  {
    "id": "insight",
    "name": "明察秋毫",
    "max": 20,
    "desc": "每级使完美判定窗口扩大 1%。",
    "color": "#4fc3f7"
  },
  {
    "id": "preemptive",
    "name": "先声夺人",
    "max": 20,
    "desc": "每级提供相当于充能上限 5% 的开局充能，升级后至少获得 1 点。",
    "color": "#ba68c8"
  }
]
