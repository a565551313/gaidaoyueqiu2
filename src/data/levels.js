// 关卡配置
// speed 以 420px 宽逻辑画布为基准，单位为像素/秒
// chargeNeed 为该关充能所需的有效落层数
//
// 高空威胁配置：
// - sway       楼体晃动幅度系数（基准最大摆幅 7 逻辑像素 × 该系数）
// - enemyShift 飞行物解锁进度整体提前量（越大越早出敌人）
// - enemyRate  飞行物生成间隔倍率（越小越频繁）
// - weather    天气强度系数（0 关闭；越大风雨雷雹越猛、持续越久）
export const LEVELS = [
  { id: 1, name: '地面发射', target: 60, speed: 150, chargeNeed: 8, sway: 0.7, enemyShift: 0, enemyRate: 1.15, weather: 0.6 },
  { id: 2, name: '穿云破雾', target: 70, speed: 175, chargeNeed: 9, sway: 0.8, enemyShift: 0.02, enemyRate: 1.05, weather: 0.75 },
  { id: 3, name: '星空之门', target: 80, speed: 200, chargeNeed: 11, sway: 0.9, enemyShift: 0.04, enemyRate: 1.0, weather: 0.9 },
  { id: 4, name: '银河轨道', target: 90, speed: 230, chargeNeed: 12, sway: 1.0, enemyShift: 0.06, enemyRate: 0.92, weather: 1.05 },
  { id: 5, name: '环形山脉', target: 100, speed: 260, chargeNeed: 14, sway: 1.1, enemyShift: 0.09, enemyRate: 0.85, weather: 1.2 },
  { id: 6, name: '月球登陆', target: 120, speed: 290, chargeNeed: 15, sway: 1.25, enemyShift: 0.12, enemyRate: 0.78, weather: 1.35 }
]

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || LEVELS[0]
}

export const TOTAL_STARS = LEVELS.length * 3 // 18
