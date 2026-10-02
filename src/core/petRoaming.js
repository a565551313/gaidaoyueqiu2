// 局内宠物的边缘漫游原型参数，尚未真机试玩验证。
// x 仅落在画布右缘窄带，避免穿过中央落层通道；y 避开顶部天气区与底部操作区。
export const PET_ROAM_CONFIG = Object.freeze({
  intervalMinMs: 2800,
  intervalMaxMs: 4800,
  transitionMs: 1600,
  start: Object.freeze({ x: 358, y: 300 }),
  bounds: Object.freeze({ xMin: 348, xMax: 370, yMin: 165, yMax: 520 }),
  step: Object.freeze({ x: 12, y: 64 })
})

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const randomUnit = (random) => clamp(Number(random()) || 0, 0, 1)

export function nextPetRoamDelay(random = Math.random) {
  const t = randomUnit(random)
  return PET_ROAM_CONFIG.intervalMinMs + t * (PET_ROAM_CONFIG.intervalMaxMs - PET_ROAM_CONFIG.intervalMinMs)
}

export function nextPetRoamPosition(current = PET_ROAM_CONFIG.start, random = Math.random) {
  const { bounds, step, start } = PET_ROAM_CONFIG
  const x = Number.isFinite(current?.x) ? current.x : start.x
  const y = Number.isFinite(current?.y) ? current.y : start.y
  return {
    x: clamp(x + (randomUnit(random) * 2 - 1) * step.x, bounds.xMin, bounds.xMax),
    y: clamp(y + (randomUnit(random) * 2 - 1) * step.y, bounds.yMin, bounds.yMax)
  }
}
