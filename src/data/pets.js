// 宠物配置：只保存不会随存档变化的定义。
// 玩家成长状态（等级、经验、星阶、是否拥有）由 storage/store 管理。

export const PETS = [
  {
    id: 'moonRabbit',
    name: '月岩兔',
    codename: 'LUNA-01',
    role: '精准辅助',
    unlockStars: 0,
    color: '#82e7ff',
    accent: '#ffd66e',
    bio: '来自月面校准站的小小领航员，会用月光镜片修正落层误差。',
    skills: [
      { star: 1, key: 'calibration', name: '月光校准', desc: '扩大完美判定窗口，等级越高效果越强。' },
      { star: 3, key: 'focus', name: '连携呼吸', desc: '连续三次完美后，强化下一次手动落层的完美窗口。' },
      { star: 5, key: 'correction', name: '误差修正', desc: '每局一次，将仅差少量距离的落点修正为完美。' }
    ]
  },
  {
    id: 'cloudWisp',
    name: '云母精灵',
    codename: 'CIRRUS-03',
    role: '天气防护',
    unlockStars: 3,
    color: '#a8d8ff',
    accent: '#d9c8ff',
    bio: '栖息在高空云带的翼灵，可以梳理乱流并偏转危险雷光。',
    skills: [
      { star: 1, key: 'clearSky', name: '晴空结界', desc: '缩短强风、暴雨、冰雹、乌云与雷暴的持续时间。' },
      { star: 3, key: 'softWind', name: '柔风护幕', desc: '天气刚出现时，暂时降低天气强度。' },
      { star: 5, key: 'lightningGuard', name: '云层偏转', desc: '每局第一次即将命中楼体的雷击会被完全抵消。' }
    ]
  },
  {
    id: 'rivetHound',
    name: '铆钉犬',
    codename: 'BOLT-K9',
    role: '敌害防御',
    unlockStars: 6,
    color: '#65e0ff',
    accent: '#ffb45f',
    bio: '由轨道维修队组装的机械伙伴，擅长锁敌、回收能量与紧急拦截。',
    skills: [
      { star: 1, key: 'targeting', name: '锁敌辅助', desc: '点击飞行物时，有概率额外造成一点伤害。' },
      { star: 3, key: 'recycle', name: '能源回收', desc: '每击退一定数量的飞行物，额外获得一点充能。' },
      { star: 5, key: 'intercept', name: '紧急拦截', desc: '每局第一次飞行物对楼体的直接攻击会被拦截。' }
    ]
  },
  {
    id: 'emberFox',
    name: '燧星狐',
    codename: 'EMBER-07',
    role: '充能恢复',
    unlockStars: 10,
    color: '#ff9b61',
    accent: '#ffe06f',
    bio: '尾端燃着星火的敏捷伙伴，能将连续施工产生的余热转化为能量。',
    skills: [
      { star: 1, key: 'embers', name: '余烬积蓄', desc: '每完成若干次手动落层，额外获得一点充能。' },
      { star: 3, key: 'flameRepair', name: '烈焰修补', desc: '烈焰三连叠结束后，恢复少量楼层宽度。' },
      { star: 5, key: 'flameShield', name: '火焰护层', desc: '每局第一次释放烈焰后，获得一次免切护盾。' }
    ]
  },
  {
    id: 'starCat',
    name: '星辉猫',
    codename: 'NOVA-15',
    role: '金币收益',
    unlockStars: 15,
    color: '#d9b7ff',
    accent: '#ffd46a',
    bio: '对星砂和金币的微光异常敏锐，总能从远征航线中找到额外收获。',
    skills: [
      { star: 1, key: 'starlight', name: '星光拾取', desc: '提高本局最终金币收益，等级越高效果越强。' },
      { star: 3, key: 'salvage', name: '战利品搜寻', desc: '击退飞行物时获得额外金币。' },
      { star: 5, key: 'fullReturn', name: '满载归航', desc: '三星通关时，进一步提高最终金币奖励。' }
    ]
  }
]

export const PET_MAX_STAR = 5
export const PET_MAX_LEVEL = 50

// key 为升星后的新星级。
export const PET_STAR_COSTS = {
  2: 500,
  3: 1000,
  4: 1800,
  5: 3000
}

export function getPet(id) {
  return PETS.find((pet) => pet.id === id) || null
}

export function petLevelCap(star) {
  return Math.max(10, Math.min(PET_MAX_LEVEL, (Number(star) || 1) * 10))
}

export function petExpToNext(level) {
  return 50 + Math.max(1, Number(level) || 1) * 10
}

export function petStarCost(nextStar) {
  return PET_STAR_COSTS[nextStar] || 0
}

export function makeDefaultPets() {
  const out = {}
  for (const pet of PETS) {
    out[pet.id] = {
      owned: pet.unlockStars === 0,
      level: 1,
      exp: 0,
      star: 1
    }
  }
  return out
}
