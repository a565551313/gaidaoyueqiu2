// 关卡配置
// speed 以 420px 宽逻辑画布为基准，单位为像素/秒
// chargeNeed 为该关充能所需的有效落层数
export const LEVELS = [
  { id: 1, name: '地面发射', target: 60, speed: 150, chargeNeed: 8 },
  { id: 2, name: '穿云破雾', target: 70, speed: 175, chargeNeed: 9 },
  { id: 3, name: '星空之门', target: 80, speed: 200, chargeNeed: 11 },
  { id: 4, name: '银河轨道', target: 90, speed: 230, chargeNeed: 12 },
  { id: 5, name: '环形山脉', target: 100, speed: 260, chargeNeed: 14 },
  { id: 6, name: '月球登陆', target: 120, speed: 290, chargeNeed: 15 }
]

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || LEVELS[0]
}

export const TOTAL_STARS = LEVELS.length * 3 // 18
