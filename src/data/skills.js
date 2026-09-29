// 技能学院配置：8 项永久技能
// 升级到新等级所需金币 = 100 × 新等级
export const SKILLS = [
  {
    id: 'foundation',
    name: '磐石根基',
    max: 20,
    desc: '每级使开局宽度增加 1%。',
    effect: (lv) => `开局宽度 +${lv}%`,
    color: '#8d6e63'
  },
  {
    id: 'goldenBell',
    name: '金钟罩',
    max: 30,
    desc: '每级增加 1% 概率，使一次非完美落点不切除宽度。',
    effect: (lv) => `免切概率 ${lv}%`,
    color: '#4dd0e1'
  },
  {
    id: 'unity',
    name: '心手合一',
    max: 20,
    desc: '每级增加 1% 概率，使本次落点直接判定为完美并计入连击。',
    effect: (lv) => `直接完美概率 ${lv}%`,
    color: '#ffd54f'
  },
  {
    id: 'pursuit',
    name: '乘胜追击',
    max: 20,
    desc: '完美落点后，每级增加 1% 概率自动再叠一层；自动层不连锁触发。',
    effect: (lv) => `追击概率 ${lv}%`,
    color: '#ff8a65'
  },
  {
    id: 'stillness',
    name: '以静制动',
    max: 20,
    desc: '每级使楼层移动速度降低 1%。',
    effect: (lv) => `移动速度 -${lv}%`,
    color: '#81c784'
  },
  {
    id: 'midas',
    name: '点石成金',
    max: 20,
    desc: '每级使本局金币获取增加 2%。',
    effect: (lv) => `金币获取 +${lv * 2}%`,
    color: '#ffca28'
  },
  {
    id: 'insight',
    name: '明察秋毫',
    max: 20,
    desc: '每级使完美判定窗口扩大 1%。',
    effect: (lv) => `完美窗口 +${lv}%`,
    color: '#4fc3f7'
  },
  {
    id: 'preemptive',
    name: '先声夺人',
    max: 20,
    desc: '每级提供相当于充能上限 5% 的开局充能，升级后至少获得 1 点。',
    effect: (lv) => `开局充能 ${Math.floor(lv * 5)}% 上限`,
    color: '#ba68c8'
  }
]

export function skillUpgradeCost(newLevel) {
  return 100 * newLevel
}

export function getSkill(id) {
  return SKILLS.find((s) => s.id === id)
}
