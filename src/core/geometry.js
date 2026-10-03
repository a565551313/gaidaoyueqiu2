// 画布几何常量与数学小工具。
// 单独成文件是为了让渲染层（gameRender.js）和逻辑层（gameEngine.js）
// 共享同一份定义，而不必互相 import 形成循环依赖。

// 逻辑画布尺寸。真实画布按 devicePixelRatio 和容器大小缩放，
// 但所有游戏坐标一律按这个 420 × 720 的逻辑空间来算。
export const LOGICAL_W = 420
export const LOGICAL_H = 720

export const BLOCK_H = 28
export const TOWER_TOP_Y = 330 // 顶部楼层在屏幕上的目标位置

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}
export function lerp(a, b, t) {
  return a + (b - a) * t
}
