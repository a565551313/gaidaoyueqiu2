// 方块属性的唯一解析点。
//
// 一个方块 = 两个正交的配方引用（typeId 方块类型 × materialId 建筑材质）
// + 一组运行时标记（tags，落层结果）。属性不存在实例上，实例只存会变的东西
// （宽度、耐久、闪白），任何「这块方块的 X 是多少」都现查配方。
//
// 分两层：
//   1) 基础属性（blockStats.js）——给人看的六条轴，绝对值。
//      基础宽度 / 基础耐久 / 基础重量 / 基础硬度 / 基础摩擦 / 基础韧性
//   2) 引擎效果（下面的 EFFECT_FROM_STATS）——给代码用的倍率和上限。
//      windPush / slip / lightningFloors / cutRetain / widthDamage …
//
// 为什么要分两层：玩家读得懂「重量 18」，引擎需要的是「风力增量 ×0.75」。
// 以前只有第二层，于是材质数据里全是 0.75、1.28 这种没有量纲的乘数，
// 单看一个数字读不出任何意思，图鉴也没法展示。
//
// 换算函数是**唯一**允许把基础值翻译成效果的地方。消费点一律调 modOf，
// 不许自己拿 stats 去算 —— 否则同一条属性会出现两套曲线。
import { getMaterial } from './materials.js'
import { getBlockType } from './blockTypes.js'
import { resolveStats, STAT_KEYS, BASE_STATS } from './blockStats.js'

// 落层结果目前不改数值，只改外观（金色描边）。保留这一层是因为
// perfect/shield 本来就和「谁放的方块」是两回事，混在一个字段里会让
// 以后「完美落层的方块更结实」这种设计无处安放。
export const TAG_STATS = Object.freeze({})

// —— 基础属性 → 引擎效果 ——
// 每条换算都标了它必须复现的历史数值。改这些常数等于改游戏平衡，
// scripts/verify.mjs 的第 13 组断言会逐条拦截。
export const EFFECT_FROM_STATS = Object.freeze({
  // 风把下落中的方块吹偏的「增量」倍率。重量 10 = 不减，钢材 18 → 0.75。
  windPush: (s) => clamp(1 - (s.weight - BASE_STATS.weight) * 0.03125, 0, 2),

  // 雨天横向滑移倍率。摩擦 10 = 不减，混凝土 16 → 0.7。
  slip: (s) => clamp(1 - (s.friction - BASE_STATS.friction) * 0.05, 0, 2),

  // 一次落雷最多劈掉几层。默认 3，乌金（硬度 20）封到 1。
  lightningFloors: (s) => (s.hardness >= 20 ? 1 : s.hardness >= 12 ? 2 : 3),

  // 落偏被切时保住多少比例的边缘。韧性 0 = 全切掉，青铜 8 → 0.25。
  cutRetain: (s) => clamp(s.toughness * 0.03125, 0, 0.9),

  // 冰雹砸掉宽度的倍率（只对冰雹生效）。韧性越高崩口越小，青铜 8 → 0.75。
  widthDamage: (s) => clamp(1 - s.toughness * 0.03125, 0.1, 1),

  // 受到的耐久伤害倍率。目前没有任何配方改它，留着给方块类型和标记用。
  durabilityDamage: () => 1,

  // 满宽耐久。宽度→耐久的那条曲线在 ants.js，这里只给池子大小。
  durabilityMax: (s) => s.durability,

  // 基础宽度（点）。技能和道具的加成仍然在 gameEngine 里乘，不走配方。
  baseWidth: (s) => s.width
})

export const EFFECT_KEYS = Object.freeze(Object.keys(EFFECT_FROM_STATS))

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }

// ref: { typeId, materialId, tags } —— 真实方块对象天然满足这个形状，
// 整局生效的查询（风、雨、雷）传一个只有 materialId 的字面量即可。
export function statsOf(ref) {
  if (!ref) return { ...BASE_STATS }
  const deltas = [getBlockType(ref.typeId).stats]
  const tags = ref.tags
  if (tags) for (const tag of tags) if (TAG_STATS[tag]) deltas.push(TAG_STATS[tag])
  return resolveStats(getMaterial(ref.materialId).stats, deltas)
}

// 引擎侧的唯一查询入口。名字沿用 modOf：gameEngine 和 weather 里几十个
// 调用点的语义没变（「这块方块的某个效果系数是多少」），只是数字的来源
// 从手写倍率换成了基础属性换算。
export function modOf(ref, key) {
  const fn = EFFECT_FROM_STATS[key]
  if (!fn) throw new Error(`unknown block effect: ${key}`)
  return fn(statsOf(ref))
}

// 一次性把某个配方组合的全部效果算出来，给调试用。
export function effectsOf(ref) {
  const stats = statsOf(ref)
  const out = {}
  for (const key of EFFECT_KEYS) out[key] = EFFECT_FROM_STATS[key](stats)
  return out
}

export { STAT_KEYS }
