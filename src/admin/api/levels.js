// 关卡包（levels）专用数据层 —— T5 关卡编辑器独占。
//
// 职责（docs/PARALLEL_TASKS.md T5 卡）：
//   1. 包一层 api/content.js 的通用接口（levels 包 key = 'levels'，data = { chapters, levels }）；
//   2. levels 包专用的结构校验 / 排序 / 复制 / 基线对照等纯函数。
//
// 结构唯一基准：src/content/defaults/levels.js（经 src/core/content.js 的 DEFAULT_BUNDLE 引入，
// 本文件不重复抄任何数值，全部由基线推导）。基线实测现状（2002 行文件全量读取）：
//   - 7 章 × 每章 8 关 = 56 关（章数以基线为准，任务卡中「8 章」为笔误，levels.js 才是唯一基准）；
//   - 关卡 id 全局连续 1..56（旧存档 stars/bestScores 以 id 为键，禁止重排/断号/重复）；
//   - 第一章（weatherKind 'clear'）关卡不带 weatherKind/chapterStage，sway = 0；
//   - 天气章（第 2..7 章）关卡带 chapterStage 1..8、weatherKind === 所属章 weatherKind；
//   - chapters[i].stages[j] 与该章第 j 关一一对应：city/place/target(/cityscape|landmark|hint)
//     与关卡字段在基线中全量一致（引擎 weather.js 读 stageConfig，HUD 读 level.*，两侧同源）；
//   - legacy 随机天气池 level.weather 恒为 0（verify-chapter.mjs 既有规则：随机天气保持停用）；
//   - 星级阈值不在 levels 包内：引擎常量（得分率 ≥0.85 → 3★，≥0.7 → 2★，见 gameEngine._win），
//     因此校验只要求包内数值参数非负。
//
// 纯函数与 IO 分离：顶层只 import 纯数据（core/content.js），api/content.js（管理端通用接口，
// 会拉起 vue / localStorage 链）在 IO 函数内按需动态 import——scripts/verify-admin-levels.mjs
// 因此可以 node 直跑全部纯函数。数据存取只经 api/content.js，本文件不自己发 RPC、不读写存储。

import { DEFAULT_BUNDLE } from '../../core/content.js'

export const LEVELS_PACK_KEY = 'levels'

// ---------------- 基线事实（由 defaults/levels.js 推导，只读） ----------------

const BASE_CHAPTERS = DEFAULT_BUNDLE.chapters
const BASE_LEVELS = DEFAULT_BUNDLE.levels

function countLevelsOf(chapterId) {
  return BASE_LEVELS.filter((l) => l && l.chapterId === chapterId).length
}

// 校验用的锚点集合：章数 / 每章关数 / 每章 stages 数 / 各章天气种类都以基线现状为准
export const BASELINE = Object.freeze({
  chapterCount: BASE_CHAPTERS.length,
  levelCount: BASE_LEVELS.length,
  chapterIds: Object.freeze(BASE_CHAPTERS.map((c) => c.id)),
  weatherKinds: Object.freeze(BASE_CHAPTERS.map((c) => c.weatherKind)),
  levelsPerChapter: Object.freeze(BASE_CHAPTERS.map((c) => countLevelsOf(c.id))),
  stagesPerChapter: Object.freeze(BASE_CHAPTERS.map((c) => (c.stages || []).length))
})

// 章节天气种类合法集合（与 verify-chapter.mjs 的 expectedWeather 同源：晴 + 六种天气章）
export const CHAPTER_WEATHER_KINDS = ['clear', 'wind', 'cloud', 'lightning', 'rain', 'snow', 'hail']
// 关卡级 weatherKind 合法集合（晴章关卡不带天气字段 —— verify-chapter 既有规则）
export const LEVEL_WEATHER_KINDS = ['wind', 'cloud', 'lightning', 'rain', 'snow', 'hail']

// 关卡可调数值参数（「复制上一关参数」拷贝这些 + stage 天气参数；不含身份/存档锚点字段）
export const LEVEL_TUNABLE_KEYS = ['target', 'speed', 'chargeNeed', 'sway', 'weather']

// stage 上属于「关卡编排」而非「天气参数」的键（编辑器单独同步/展示，不进天气参数区）
export const STAGE_META_KEYS = ['city', 'place', 'cityscape', 'landmark', 'hint', 'stage', 'target']

// stage 天气参数键（基线实测并集：wind=intensity/directions/active/calm、cloud=density/active/calm、
// lightning=intensity/active/calm/strikeChance、rain=rainDir/intensity/active/calm、snow=coverage、
// hail=intensity/active/calm/interval；weather.js 另支持 warning，一并纳入）
export const STAGE_PARAM_KEYS = ['intensity', 'directions', 'active', 'calm', 'density', 'strikeChance', 'rainDir', 'coverage', 'interval', 'warning']

// ---------------- 基础工具 ----------------

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

/** 打包默认包的 levels 字段深拷贝（编辑器第一眼 = 当前线上等效内容） */
export function cloneBaselinePack() {
  return { chapters: deepClone(BASE_CHAPTERS), levels: deepClone(BASE_LEVELS) }
}

/** 章节按 number 升序（返回新数组，不改入参；number 缺失按 0 排前，由校验另行报错） */
export function sortChapters(chapters) {
  return [...(Array.isArray(chapters) ? chapters : [])].sort((a, b) => (a?.number ?? 0) - (b?.number ?? 0))
}

/** 关卡按 id 升序（返回新数组，不改入参） */
export function sortLevels(levels) {
  return [...(Array.isArray(levels) ? levels : [])].sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0))
}

/** 按 chapterId 分组，组内按 id 升序 → { [chapterId]: levels[] } */
export function groupLevelsByChapter(levels) {
  const out = {}
  for (const level of sortLevels(levels)) {
    const key = level?.chapterId ?? ''
    ;(out[key] || (out[key] = [])).push(level)
  }
  return out
}

/**
 * 关卡对应的章节 stage 配置（天气参数所在）。
 * 基线现状：天气章关卡带 chapterStage（1..N）；晴章关卡不带，按章内 id 顺序对位。
 */
export function levelStageOf(pack, level) {
  if (!pack || !level) return null
  const chapter = (pack.chapters || []).find((c) => c && c.id === level.chapterId)
  if (!chapter || !Array.isArray(chapter.stages)) return null
  const chapterLevels = sortLevels((pack.levels || []).filter((l) => l && l.chapterId === chapter.id))
  const stageNo = Number(level.chapterStage)
  const idx = Number.isInteger(stageNo) && stageNo >= 1 ? stageNo - 1 : chapterLevels.findIndex((l) => l.id === level.id)
  return idx >= 0 && idx < chapter.stages.length ? chapter.stages[idx] : null
}

/**
 * 基线不变式回写：关卡字段 → 对应 stage 的冗余字段（city/place/target(/cityscape|landmark)/hint）。
 * weatherHint 同时回写 chapterCue（基线中三者恒同步）。只写 stage 上本来就有、且关卡侧有值的键，
 * 因此晴章（stage 有 hint 无 landmark）与天气章（反之）都安全。就地修改并返回 stage。
 */
export function syncLevelIntoStage(level, stage) {
  if (!level || !stage || typeof stage !== 'object') return stage
  if (Object.hasOwn(stage, 'target') && typeof level.target === 'number') stage.target = level.target
  if (Object.hasOwn(stage, 'city') && typeof level.city === 'string') stage.city = level.city
  if (Object.hasOwn(stage, 'place') && typeof level.place === 'string') stage.place = level.place
  if (Object.hasOwn(stage, 'cityscape') && typeof level.cityscape === 'string') stage.cityscape = level.cityscape
  if (level.weatherHint != null && Object.hasOwn(stage, 'hint')) {
    stage.hint = level.weatherHint
    if (level.chapterCue !== undefined) level.chapterCue = level.weatherHint
  }
  if (level.landmarkFeature != null && Object.hasOwn(stage, 'landmark')) stage.landmark = level.landmarkFeature
  return stage
}

/**
 * 「复制上一关参数」：把 id-1 那关的可调参数拷到目标关（数值参数 + 两关 stage 同名天气参数），
 * 身份/文案/存档锚点字段（id、chapterId、chapterNumber、chapterStage、name、city、place、
 * cityscape、landmarkFeature、weatherHint、chapterCue）保持目标关原值。
 * 返回深拷贝后的新 pack（不改入参）；目标关不存在或没有上一关（第 1 关）返回 null。
 */
export function copyFromPreviousLevel(pack, levelId) {
  if (!pack || !Array.isArray(pack.levels)) return null
  const sorted = sortLevels(pack.levels)
  const idx = sorted.findIndex((l) => l && l.id === levelId)
  if (idx <= 0) return null // 第 1 关（或找不到目标关）没有上一关
  const prev = sorted[idx - 1]
  const next = deepClone(pack)
  const target = next.levels.find((l) => l && l.id === levelId)
  const prevInNext = next.levels.find((l) => l && l.id === prev.id)
  for (const key of LEVEL_TUNABLE_KEYS) target[key] = prev[key]
  const prevStage = levelStageOf(next, prevInNext)
  const targetStage = levelStageOf(next, target)
  if (prevStage && targetStage) {
    for (const key of Object.keys(prevStage)) {
      if (STAGE_PARAM_KEYS.includes(key) && Object.hasOwn(targetStage, key)) targetStage[key] = deepClone(prevStage[key])
    }
    syncLevelIntoStage(target, targetStage) // target 等共享字段回写 stage
  }
  return next
}

// ---------------- 结构校验 ----------------

function levelTag(level) {
  return `L${level?.id ?? '?'}`
}

function chapterTag(chapter, index) {
  return `第 ${index + 1} 章${chapter && chapter.shortName ? `（${chapter.shortName}）` : ''}`
}

/**
 * levels 包结构校验（保存/发布前的自检）。规则对照基线现状与 verify-chapter.mjs 既有断言：
 *   硬阻断（errors，保存与发布都拦）：
 *     S1  data = { chapters, levels }，两个非空数组
 *     S2  章数与基线一致；章 id/number/weatherKind/每章 stages 数与基线一致（引用与存档锚点）
 *     S3  每章关数与基线一致；关卡总数与基线一致
 *     S4  关卡 id 唯一、正整数、全局连续 1..N（无断号/越界/重复）
 *     S5  chapterId 引用存在；chapterNumber 与所属章一致；天气章 chapterStage ∈ [1, stages 数]
 *         且章内随 id 递增恰为 1..N（晴章不得带 chapterStage）
 *     S6  数值参数（target/speed/chargeNeed/sway/weather）为非负数（星级阈值是引擎常量，
 *         不在包内，包内数值一律非负）；name/city/place/cityscape 非空
 *     S7  天气池：legacy weather 恒为 0；章 weatherKind ∈ 合法集合且与基线一致；
 *         天气章每关 weatherKind === 所属章、weatherHint/landmarkFeature 非空；
 *         晴章关卡不带 weatherKind 且 sway === 0
 *     S8  章 firstLevelId/lastLevelId 与该章关卡实际 id 范围一致（ChapterSelect 解锁链依据）
 *   软提醒（warnings，不阻断）：stage ↔ 关卡冗余字段失同步、sway 明显超基线、
 *     chapterCue 与 weatherHint 失同步
 * 返回 { ok, errors, warnings }。
 */
export function validateLevelsPack(data) {
  const errors = []
  const warnings = []

  // —— S1 形状 ——
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['levels 包 data 必须是 { chapters, levels } 形状的对象'], warnings }
  }
  const chapters = data.chapters
  const levels = data.levels
  if (!Array.isArray(chapters) || chapters.length === 0) errors.push('chapters 必须是非空数组')
  if (!Array.isArray(levels) || levels.length === 0) errors.push('levels 必须是非空数组')
  if (errors.length) return { ok: false, errors, warnings }

  // —— S2 章级结构与基线锚点 ——
  if (chapters.length !== BASELINE.chapterCount) {
    errors.push(`章数 ${chapters.length} 与基线不一致（应为 ${BASELINE.chapterCount} 章：${BASELINE.chapterIds.join(' / ')}）`)
  }
  const seenIds = new Set()
  chapters.forEach((c, i) => {
    if (!c || typeof c !== 'object') {
      errors.push(`第 ${i + 1} 个章条目不是对象`)
      return
    }
    if (typeof c.id !== 'string' || !c.id) errors.push(`${chapterTag(c, i)}：id 缺失或非字符串`)
    else if (seenIds.has(c.id)) errors.push(`章节 id 重复：${c.id}`)
    else seenIds.add(c.id)
    if (!Number.isInteger(c.number) || c.number !== i + 1) errors.push(`${chapterTag(c, i)}：number 应为 ${i + 1}（章序从 1 连续递增，与数组位次一致）`)
    if (typeof c.name !== 'string' || !c.name.trim()) errors.push(`${chapterTag(c, i)}：name 不能为空`)
    if (typeof c.shortName !== 'string' || !c.shortName.trim()) errors.push(`${chapterTag(c, i)}：shortName 不能为空`)
    if (!Array.isArray(c.stages)) errors.push(`${chapterTag(c, i)}：stages 必须是数组`)
    if (!CHAPTER_WEATHER_KINDS.includes(c.weatherKind)) errors.push(`${chapterTag(c, i)}：weatherKind「${String(c.weatherKind)}」不合法（${CHAPTER_WEATHER_KINDS.join('/')}）`)
    const base = BASE_CHAPTERS[i]
    if (base) {
      if (c.id !== base.id) errors.push(`${chapterTag(c, i)}：id「${String(c.id)}」与基线「${base.id}」不一致（章 id 是关卡引用与引擎 chapterMode 判定的锚点，禁止改名）`)
      if (c.weatherKind !== base.weatherKind) errors.push(`${chapterTag(c, i)}：weatherKind「${String(c.weatherKind)}」与基线「${base.weatherKind}」不一致`)
      if (Array.isArray(c.stages) && c.stages.length !== BASELINE.stagesPerChapter[i]) {
        errors.push(`${chapterTag(c, i)}：stages 数 ${c.stages.length} 与基线不一致（应为 ${BASELINE.stagesPerChapter[i]}）`)
      }
    }
  })

  const chapterById = new Map()
  chapters.forEach((c) => { if (c && typeof c === 'object' && c.id) chapterById.set(c.id, c) })
  const baseChapterById = new Map(BASE_CHAPTERS.map((c) => [c.id, c]))

  // —— S3 每章关数 / 总数 ——
  const byChapter = groupLevelsByChapter(levels)
  chapters.forEach((c, i) => {
    if (!c || typeof c !== 'object') return
    const count = (byChapter[c.id] || []).length
    if (count !== BASELINE.levelsPerChapter[i]) {
      errors.push(`${chapterTag(c, i)}：关数 ${count} 与基线不一致（应为 ${BASELINE.levelsPerChapter[i]}）`)
    }
  })
  if (levels.length !== BASELINE.levelCount) {
    errors.push(`关卡总数 ${levels.length} 与基线不一致（应为 ${BASELINE.levelCount}，结构扩缩需先更新 defaults/levels.js 基线）`)
  }

  // —— S4 关卡 id：类型 / 唯一 / 连续 ——
  levels.forEach((l, i) => {
    if (!l || typeof l !== 'object') errors.push(`第 ${i + 1} 个关卡条目不是对象`)
    else if (!Number.isInteger(l.id) || l.id < 1) errors.push(`关卡条目 id 非法：${String(l.id)}（须为正整数）`)
  })
  const idCount = new Map()
  levels.forEach((l) => { if (l && Number.isInteger(l.id)) idCount.set(l.id, (idCount.get(l.id) || 0) + 1) })
  for (const [id, n] of idCount) if (n > 1) errors.push(`关卡 id 重复：${id} 出现 ${n} 次`)
  const idsAllSane = levels.every((l) => l && Number.isInteger(l.id) && l.id >= 1) && idCount.size === levels.length
  if (idsAllSane) {
    const sortedIds = sortLevels(levels).map((l) => l.id)
    for (let i = 0; i < sortedIds.length; i++) {
      if (sortedIds[i] !== i + 1) {
        errors.push(i === 0
          ? `关卡 id 断号：最小 id 为 ${sortedIds[0]}，应从 1 开始（id 必须全局连续 1..${BASELINE.levelCount}，旧存档以 id 为键，禁止重排）`
          : `关卡 id 断号：缺 ${i + 1}（…${sortedIds[i - 1]} → ${sortedIds[i]}…），id 必须全局连续 1..${BASELINE.levelCount}`)
        break
      }
    }
  }

  // —— S5 引用与章内序号 ——
  const orphan = levels.filter((l) => l && typeof l === 'object' && !chapterById.has(l.chapterId))
  for (const l of orphan.slice(0, 3)) errors.push(`${levelTag(l)}：chapterId「${String(l.chapterId)}」不存在（引用断裂）`)
  levels.forEach((l) => {
    if (!l || typeof l !== 'object') return
    const ch = chapterById.get(l.chapterId)
    if (!ch) return // 上面已报
    if (l.chapterNumber !== undefined && l.chapterNumber !== ch.number) {
      errors.push(`${levelTag(l)}：chapterNumber ${String(l.chapterNumber)} 与所属章 ${ch.number} 不一致`)
    }
    const stageCount = Array.isArray(ch.stages) ? ch.stages.length : 0
    const base = baseChapterById.get(ch.id)
    const baseKind = base ? base.weatherKind : ch.weatherKind
    if (baseKind === 'clear') {
      if (l.chapterStage) errors.push(`${levelTag(l)}：晴章关卡不得带 chapterStage（基线现状：第一章关卡无章内序号）`)
    } else if (!Number.isInteger(l.chapterStage) || l.chapterStage < 1 || l.chapterStage > stageCount) {
      errors.push(`${levelTag(l)}：chapterStage ${String(l.chapterStage)} 非法（应为 1..${stageCount}）`)
    }
  })
  chapters.forEach((c, i) => {
    if (!c || typeof c !== 'object') return
    if (BASELINE.weatherKinds[i] === 'clear') return
    const ls = byChapter[c.id] || []
    for (let s = 0; s < ls.length; s++) {
      if (ls[s]?.chapterStage !== s + 1) {
        errors.push(`${chapterTag(c, i)}：章内序号应随 id 递增恰为 1..${ls.length}（第 ${s + 1} 关是 ${String(ls[s]?.chapterStage)}）`)
        break
      }
    }
  })

  // —— S6 数值与文本参数 ——
  levels.forEach((l) => {
    if (!l || typeof l !== 'object') return
    for (const key of LEVEL_TUNABLE_KEYS) {
      const v = l[key]
      if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${levelTag(l)}：${key} 必须是数字（当前 ${String(v)}）`)
      else if (v < 0) errors.push(`${levelTag(l)}：${key} 不能为负数（当前 ${v}）`)
    }
    if (typeof l.target === 'number' && l.target < 1) errors.push(`${levelTag(l)}：target 至少为 1 层`)
    if (typeof l.speed === 'number' && l.speed < 1) errors.push(`${levelTag(l)}：speed 至少为 1`)
    if (typeof l.chargeNeed === 'number' && l.chargeNeed < 1) errors.push(`${levelTag(l)}：chargeNeed 至少为 1`)
    for (const key of ['name', 'city', 'place', 'cityscape']) {
      if (typeof l[key] !== 'string' || !l[key].trim()) errors.push(`${levelTag(l)}：${key} 不能为空`)
    }
    if (l.weatherKind !== undefined && !LEVEL_WEATHER_KINDS.includes(l.weatherKind)) {
      errors.push(`${levelTag(l)}：weatherKind「${String(l.weatherKind)}」不合法（${LEVEL_WEATHER_KINDS.join('/')}）`)
    }
  })

  // —— S7 天气池（对照 verify-chapter.mjs 既有规则） ——
  levels.forEach((l) => {
    if (!l || typeof l !== 'object') return
    if (l.weather !== 0) errors.push(`${levelTag(l)}：legacy 天气池强度 weather 必须为 0（随机天气已停用，当前 ${String(l.weather)}）`)
    const ch = chapterById.get(l.chapterId)
    if (!ch) return
    const base = baseChapterById.get(ch.id)
    const kind = base ? base.weatherKind : ch.weatherKind
    if (kind === 'clear') {
      if (l.weatherKind !== undefined) errors.push(`${levelTag(l)}：晴章关卡不得带 weatherKind（第一章保持晴天静塔）`)
      if (l.sway !== 0) errors.push(`${levelTag(l)}：晴章关卡 sway 必须为 0（当前 ${String(l.sway)}）`)
    } else {
      if (l.weatherKind !== ch.weatherKind) errors.push(`${levelTag(l)}：weatherKind「${String(l.weatherKind)}」与所属章「${String(ch.weatherKind)}」不一致`)
      if (typeof l.weatherHint !== 'string' || !l.weatherHint.trim()) errors.push(`${levelTag(l)}：weatherHint 不能为空（天气章每关都要有提示）`)
      if (typeof l.landmarkFeature !== 'string' || !l.landmarkFeature.trim()) errors.push(`${levelTag(l)}：landmarkFeature 不能为空`)
    }
  })

  // —— S8 解锁链 ——
  chapters.forEach((c, i) => {
    if (!c || typeof c !== 'object') return
    const ls = byChapter[c.id] || []
    const ids = ls.map((l) => (l && Number.isInteger(l.id) ? l.id : null)).filter((v) => v !== null)
    if (!ids.length) return
    const min = Math.min(...ids)
    const max = Math.max(...ids)
    if (c.firstLevelId !== min || c.lastLevelId !== max) {
      errors.push(`${chapterTag(c, i)}：firstLevelId/lastLevelId（${String(c.firstLevelId)}–${String(c.lastLevelId)}）与该章关卡实际范围（${min}–${max}）不一致（ChapterSelect 解锁链依据）`)
    }
  })

  // —— 软提醒（不阻断） ——
  levels.forEach((l) => {
    if (!l || typeof l !== 'object') return
    if (typeof l.sway === 'number' && l.sway > 1) warnings.push(`${levelTag(l)}：sway ${l.sway} 远超基线最大值 0.16，晃动会非常剧烈`)
    if (typeof l.weatherHint === 'string' && typeof l.chapterCue === 'string' && l.weatherHint !== l.chapterCue) {
      warnings.push(`${levelTag(l)}：chapterCue 与 weatherHint 不一致（基线恒同步，引擎浮字读 cue）`)
    }
  })
  chapters.forEach((c) => {
    if (!c || typeof c !== 'object' || !Array.isArray(c.stages)) return
    const ls = byChapter[c.id] || []
    ls.forEach((l) => {
      const stage = levelStageOf({ chapters, levels }, l)
      if (!stage || typeof stage !== 'object' || !l || typeof l !== 'object') return
      if (stage.target !== l.target) warnings.push(`${levelTag(l)}：stage.target（${String(stage.target)}）与关卡 target（${String(l.target)}）不同步`)
      if (stage.city !== undefined && stage.city !== l.city) warnings.push(`${levelTag(l)}：stage.city 与关卡 city 不同步`)
      if (stage.place !== undefined && stage.place !== l.place) warnings.push(`${levelTag(l)}：stage.place 与关卡 place 不同步`)
      if (stage.hint !== undefined && l.weatherHint !== undefined && stage.hint !== l.weatherHint) warnings.push(`${levelTag(l)}：stage.hint 与 weatherHint 不同步`)
      if (stage.landmark !== undefined && l.landmarkFeature !== undefined && stage.landmark !== l.landmarkFeature) warnings.push(`${levelTag(l)}：stage.landmark 与 landmarkFeature 不同步`)
      if (stage.cityscape !== undefined && l.cityscape !== undefined && stage.cityscape !== l.cityscape) warnings.push(`${levelTag(l)}：stage.cityscape 与关卡 cityscape 不同步`)
    })
  })

  return { ok: errors.length === 0, errors, warnings }
}

// ---------------- IO：对 api/content.js 通用接口的 levels 包封装 ----------------
// 动态 import：保证本模块被 node 直跑纯函数测试时不拉起 vue / localStorage 链（见文件头注释）。

/** 取草稿；从未初始化时返回打包基线（version 0，isBaseline=true），管理员第一眼即当前线上等效内容 */
export async function getLevelsPack() {
  const { getPack } = await import('./content.js')
  const res = await getPack(LEVELS_PACK_KEY)
  if (!res) return { data: cloneBaselinePack(), version: 0, isBaseline: true }
  return { data: res.data, version: res.version, isBaseline: false }
}

/** 保存草稿（version+1，玩家不可见）。调用方应先通过 validateLevelsPack 自检 */
export async function saveLevelsDraft(data) {
  const { savePack } = await import('./content.js')
  return savePack(LEVELS_PACK_KEY, data)
}

/** 发布当前草稿；mock 模式下 content.js 会同步写本机玩家缓存键（刷新 / 即生效） */
export async function publishLevelsDraft() {
  const { publishPack } = await import('./content.js')
  return publishPack(LEVELS_PACK_KEY)
}

/** levels 包在包列表里的状态行（{ key, status, version, updated_at } | null） */
export async function levelsPackStatus() {
  const { listPacks } = await import('./content.js')
  const rows = await listPacks()
  return (rows || []).find((r) => r && r.key === LEVELS_PACK_KEY) || null
}
