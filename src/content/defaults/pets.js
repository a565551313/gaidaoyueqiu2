// 宠物档案 + 升星费用表 —— 纯数据（Phase 0 内容数据化，从 src/data 抽取）。
// 本文件只放字面量：不放函数、不放派生逻辑、不 import 任何东西。
// 运行时经 src/core/content.js（Provider）注入 src/data/*；结构由
// scripts/verify-content.mjs 的快照基线锁定，改这里的数值必须同步更新快照。
export const pets = [
  {
    "id": "moonRabbit",
    "name": "月岩兔",
    "codename": "LUNA-01",
    "role": "精准辅助",
    "unlockStars": 0,
    "color": "#82e7ff",
    "accent": "#ffd66e",
    "bio": "来自月面校准站的小小领航员，会用月光镜片修正落层误差。",
    "skills": [
      {
        "star": 1,
        "key": "calibration",
        "name": "月光校准",
        "desc": "扩大完美判定窗口，等级越高效果越强。"
      },
      {
        "star": 3,
        "key": "focus",
        "name": "连携呼吸",
        "desc": "连续三次完美后，强化下一次手动落层的完美窗口。"
      },
      {
        "star": 5,
        "key": "correction",
        "name": "误差修正",
        "desc": "每局一次，将仅差少量距离的落点修正为完美。"
      }
    ]
  },
  {
    "id": "cloudWisp",
    "name": "云母精灵",
    "codename": "CIRRUS-03",
    "role": "天气防护",
    "unlockStars": 3,
    "color": "#a8d8ff",
    "accent": "#d9c8ff",
    "bio": "栖息在高空云带的翼灵，可以梳理乱流并偏转危险雷光。",
    "skills": [
      {
        "star": 1,
        "key": "clearSky",
        "name": "晴空结界",
        "desc": "缩短强风、暴雨、冰雹、乌云与雷暴的持续时间。"
      },
      {
        "star": 3,
        "key": "softWind",
        "name": "柔风护幕",
        "desc": "天气刚出现时，暂时降低天气强度。"
      },
      {
        "star": 5,
        "key": "lightningGuard",
        "name": "云层偏转",
        "desc": "每局第一次即将命中楼体的雷击会被完全抵消。"
      }
    ]
  },
  {
    "id": "rivetHound",
    "name": "铆钉犬",
    "codename": "BOLT-K9",
    "role": "机械伙伴",
    "unlockStars": 6,
    "color": "#65e0ff",
    "accent": "#ffb45f",
    "bio": "由轨道维修队组装的机械伙伴。施工设备玩法已退役；铆钉犬不改变蚂蚁HP、咬击、落层品质，也不提供蚁群护盾或免切。",
    "skills": [
      {
        "star": 1,
        "key": "devicePrecision",
        "name": "设备识别（已退役）",
        "desc": "施工设备玩法已退役；不扩大点击区，也不改变蚁群目标。"
      },
      {
        "star": 3,
        "key": "eventRecovery",
        "name": "危机回收（已退役）",
        "desc": "旧事件充能奖励已停止；不增加蚁群伤害或落层收益。"
      },
      {
        "star": 5,
        "key": "foundationIntercept",
        "name": "结构拦截（已退役）",
        "desc": "旧事件拦截已停止；不提供蚁群护盾、免切或伤害减免。"
      }
    ]
  },
  {
    "id": "emberFox",
    "name": "燧星狐",
    "codename": "EMBER-07",
    "role": "充能恢复",
    "unlockStars": 10,
    "color": "#ff9b61",
    "accent": "#ffe06f",
    "bio": "尾端燃着星火的敏捷伙伴，能将连续落层产生的余热转化为能量。",
    "skills": [
      {
        "star": 1,
        "key": "embers",
        "name": "余烬积蓄",
        "desc": "每完成若干次手动落层，额外获得一点充能。"
      },
      {
        "star": 3,
        "key": "flameRepair",
        "name": "烈焰修补",
        "desc": "烈焰三连叠结束后，恢复少量楼层宽度。"
      },
      {
        "star": 5,
        "key": "flameShield",
        "name": "火焰护层",
        "desc": "每局第一次释放烈焰后，获得一次免切护盾。"
      }
    ]
  },
  {
    "id": "starCat",
    "name": "星辉猫",
    "codename": "NOVA-15",
    "role": "金币收益",
    "unlockStars": 15,
    "color": "#d9b7ff",
    "accent": "#ffd46a",
    "bio": "对星砂和金币的微光异常敏锐，总能从远征航线中找到额外收获。",
    "skills": [
      {
        "star": 1,
        "key": "starlight",
        "name": "星光拾取",
        "desc": "提高本局最终金币收益，等级越高效果越强。"
      },
      {
        "star": 3,
        "key": "eventSalvage",
        "name": "事件回收（已退役）",
        "desc": "旧施工事件奖励已停止；蚁群击退不触发额外金币。"
      },
      {
        "star": 5,
        "key": "fullReturn",
        "name": "满载归航",
        "desc": "三星通关时，进一步提高最终金币奖励。"
      }
    ]
  }
]
export const starCosts = {
  "2": 500,
  "3": 1000,
  "4": 1800,
  "5": 3000
}
