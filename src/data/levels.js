// 第一章：澄河都会圈。每关独立结算，目标层数逐关增加 10 层。
// speed 为 420px 逻辑画布上的移动速度；本章所有关卡保持一致。
// weather: 0 与 sway: 0 分别关闭天气玩法和塔体摆动，二者是独立开关。
export const CHAPTER = Object.freeze({
  id: 'chenghe-metropolitan',
  number: 1,
  name: '澄河都会圈'
})

export const LEVELS = [
  { id: 1, chapterId: CHAPTER.id, name: '郊区发射场', city: '晴原市', place: '郊区发射场', cityscape: 'launchField', target: 30, speed: 150, chargeNeed: 8, sway: 0, enemyShift: 0, enemyRate: 1.15, weather: 0 },
  { id: 2, chapterId: CHAPTER.id, name: '滨河住区', city: '柳汀市', place: '滨河住区', cityscape: 'riversideHomes', target: 40, speed: 150, chargeNeed: 8, sway: 0, enemyShift: 0, enemyRate: 1.15, weather: 0 },
  { id: 3, chapterId: CHAPTER.id, name: '旧渡口', city: '渡川市', place: '旧渡口', cityscape: 'oldFerry', target: 50, speed: 150, chargeNeed: 8, sway: 0, enemyShift: 0, enemyRate: 1.15, weather: 0 },
  { id: 4, chapterId: CHAPTER.id, name: '内河港区', city: '澄浦市', place: '内河港区', cityscape: 'inlandPort', target: 60, speed: 150, chargeNeed: 8, sway: 0, enemyShift: 0, enemyRate: 1.15, weather: 0 },
  { id: 5, chapterId: CHAPTER.id, name: '跨江新区', city: '新桥市', place: '跨江新区', cityscape: 'crossRiverBridge', target: 70, speed: 150, chargeNeed: 8, sway: 0, enemyShift: 0, enemyRate: 1.15, weather: 0 },
  { id: 6, chapterId: CHAPTER.id, name: '科创园区', city: '青梧市', place: '科创园区', cityscape: 'sciencePark', target: 80, speed: 150, chargeNeed: 8, sway: 0, enemyShift: 0, enemyRate: 1.15, weather: 0 },
  { id: 7, chapterId: CHAPTER.id, name: '金融中心', city: '平川市', place: '金融中心', cityscape: 'financeCore', target: 90, speed: 150, chargeNeed: 8, sway: 0, enemyShift: 0, enemyRate: 1.15, weather: 0 },
  { id: 8, chapterId: CHAPTER.id, name: '中央高塔区', city: '中澜市', place: '中央高塔区', cityscape: 'centralTower', target: 100, speed: 150, chargeNeed: 8, sway: 0, enemyShift: 0, enemyRate: 1.15, weather: 0 }
]

export function getLevel(id) {
  return LEVELS.find((level) => level.id === id) || LEVELS[0]
}

export const TOTAL_STARS = LEVELS.length * 3
