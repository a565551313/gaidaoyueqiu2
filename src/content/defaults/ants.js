// 蚂蚁兵种/性格/原型参数/耐久池/波次表 —— 纯数据（Phase 0 内容数据化，从 src/data 抽取）。
// 本文件只放字面量：不放函数、不放派生逻辑、不 import 任何东西。
// 运行时经 src/core/content.js（Provider）注入 src/data/*；结构由
// scripts/verify-content.mjs 的快照基线锁定，改这里的数值必须同步更新快照。
// 波次按章节内第几关分五档（upTo 含上界）；>8 的关卡回落到最后一档
export const species = {
  "worker": {
    "id": "worker",
    "name": "锈腹工蚁",
    "shortName": "工蚁",
    "hp": 12,
    "climbSpeed": 1.8,
    "durability": [
      2,
      2
    ],
    "width": [
      2,
      2
    ],
    "preference": "random",
    "color": "#d47a45"
  },
  "scout": {
    "id": "scout",
    "name": "青翅斥候",
    "shortName": "斥候",
    "hp": 10,
    "climbSpeed": 2.6,
    "durability": [
      2,
      2,
      2
    ],
    "width": [
      2,
      2
    ],
    "preference": "high",
    "color": "#63c9b9"
  },
  "soldier": {
    "id": "soldier",
    "name": "钳甲兵蚁",
    "shortName": "钳甲兵",
    "hp": 16,
    "climbSpeed": 1.25,
    "durability": [
      4,
      4,
      4
    ],
    "width": [
      4,
      4,
      2
    ],
    "preference": "damaged",
    "color": "#a67a58"
  },
  "queen": {
    "id": "queen",
    "name": "冠巢蚁后",
    "shortName": "蚁后",
    "hp": 24,
    "climbSpeed": 1.6,
    "durability": [
      4,
      4
    ],
    "width": [
      2,
      2,
      2
    ],
    "preference": "damaged",
    "color": "#c68cdc"
  }
}
export const personalities = {
  "timid": {
    "id": "timid",
    "name": "胆小",
    "retreatHits": 1
  },
  "coward": {
    "id": "coward",
    "name": "懦弱",
    "retreatHits": 2
  },
  "impatient": {
    "id": "impatient",
    "name": "急躁",
    "retreatHits": 0
  },
  "aggressive": {
    "id": "aggressive",
    "name": "暴躁",
    "retreatHits": 0
  }
}
export const prototype = {
  "maxAlive": 5,
  "maxTargetsPerFloor": 3,
  "spawnGapSeconds": 4.5,
  "warningStaggerSeconds": 0.55,
  "maxFloorBurstDamage": 6,
  "floorDamageWindowSeconds": 2,
  "minFloorAttackGapSeconds": 0.55
}
export const durabilityConfig = {
  "layers": {
    "minWidth": 24,
    "maxWidth": 120,
    "min": 7,
    "max": 18,
    "materialMultiplier": 0.18
  }
}
export const nonAntDurabilityScale = 0.4
export const floorWidthMin = 26
export const waveTiers = [
  {
    "upTo": 1,
    "waves": [
      {
        "at": 0.18,
        "species": [
          "worker"
        ]
      },
      {
        "at": 0.52,
        "species": [
          "worker"
        ]
      }
    ]
  },
  {
    "upTo": 3,
    "waves": [
      {
        "at": 0.18,
        "species": [
          "worker"
        ]
      },
      {
        "at": 0.42,
        "species": [
          "scout"
        ]
      },
      {
        "at": 0.66,
        "species": [
          "worker",
          "scout"
        ]
      }
    ]
  },
  {
    "upTo": 5,
    "waves": [
      {
        "at": 0.16,
        "species": [
          "worker"
        ]
      },
      {
        "at": 0.34,
        "species": [
          "worker",
          "scout"
        ]
      },
      {
        "at": 0.56,
        "species": [
          "soldier",
          "scout"
        ]
      }
    ]
  },
  {
    "upTo": 7,
    "waves": [
      {
        "at": 0.14,
        "species": [
          "worker"
        ]
      },
      {
        "at": 0.3,
        "species": [
          "worker",
          "scout"
        ]
      },
      {
        "at": 0.48,
        "species": [
          "soldier",
          "scout"
        ]
      },
      {
        "at": 0.72,
        "species": [
          "worker",
          "soldier"
        ]
      }
    ]
  },
  {
    "upTo": 8,
    "waves": [
      {
        "at": 0.14,
        "species": [
          "worker"
        ]
      },
      {
        "at": 0.32,
        "species": [
          "worker",
          "scout"
        ]
      },
      {
        "at": 0.54,
        "species": [
          "queen"
        ]
      },
      {
        "at": 0.74,
        "species": [
          "scout",
          "worker"
        ]
      }
    ]
  }
]
