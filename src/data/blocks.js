// 方块属性的唯一解析点。
//
// 一个方块 = 两个正交的配方引用（typeId 方块类型 × materialId 建筑材质）
// + 一组运行时标记（tags，落层结果）。属性不存在实例上，实例只存会变的东西
// （宽度、耐久、闪白），任何「这块方块的 X 是多少」都现查配方。
//
// 以前这些数字被摊平成 engine.antiSlip / antiWind / antiBreak /
// lightningMaxFloors 四个字段，于是「方块的属性」挂在了引擎上，
// 一局只能有一套，也没法让某一层方块和别的层不一样。
import { getMaterial } from './materials.js'
import { getBlockType } from './blockTypes.js'
import { resolveMod, MOD_KEYS } from './blockMods.js'

// 落层结果目前不改数值，只改外观（金色描边）。保留这一层是因为
// perfect/shield 本来就和「谁放的方块」是两回事，混在一个字段里会让
// 以后「完美落层的方块更结实」这种设计无处安放。
export const TAG_MODS = Object.freeze({})

function sourcesOf(ref) {
  if (!ref) return []
  const list = [getBlockType(ref.typeId).mods, getMaterial(ref.materialId).mods]
  const tags = ref.tags
  if (tags) for (const tag of tags) if (TAG_MODS[tag]) list.push(TAG_MODS[tag])
  return list
}

// ref: { typeId, materialId, tags } —— 真实方块对象天然满足这个形状，
// 整局生效的查询（风、雨、雷）传一个只有 materialId 的字面量即可。
export function modOf(ref, key) {
  return resolveMod(sourcesOf(ref), key)
}

// 一次性把某个配方组合的全部属性算出来，给图鉴和调试用。
export function modsOf(ref) {
  const out = {}
  for (const key of MOD_KEYS) out[key] = modOf(ref, key)
  return out
}
