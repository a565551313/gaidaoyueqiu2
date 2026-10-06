// 内容数据化回归（Phase 0）：
//   C1 快照等价——重构后的运行时结构与重构前拍的基线逐块 deepEqual
//      （基线：scripts/fixtures/content-snapshot-v1.json，抽取自旧版硬编码字面量）
//   C2 冻结语义——章节/stages/STAT_SPECS/ANT_PROTOTYPE_CONFIG 等与旧版同样不可变
//   C3 纯数据守卫——src/content/defaults/* 不许出现 import 或箭头函数（只放字面量）
//   C4 Provider 回退——无 localStorage / 缓存损坏时回落打包默认包
//   C5 导出面——data 层对外导出的符号一个不少（引擎/组件/脚本零改动的前提）
// 运行：node scripts/verify-content.mjs（已接入 npm run test:all）

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
function ok(cond, label) {
  if (!cond) {
    console.error(`  ✗ ${label}`)
    process.exit(1)
  }
  passed++
  console.log(`  ✓ ${label}`)
}

const fixture = JSON.parse(readFileSync(join(root, 'scripts/fixtures/content-snapshot-v1.json'), 'utf8'))

// ================================================================
console.log('C1 · 快照等价（运行时结构 == 重构前基线）')
// ================================================================
const { CHAPTERS, CHAPTER, LEVELS, TOTAL_STARS, getLevel, getChapter, getChapterForLevel, getChapterLevels } = await import('../src/data/levels.js')
const { MATERIALS } = await import('../src/data/materials.js')
const { BLOCK_TYPES, BLOCK_TAGS } = await import('../src/data/blockTypes.js')
const { STAT_SPECS, STAT_KEYS, BASE_STATS } = await import('../src/data/blockStats.js')
const { ITEMS, BAG_DEFAULT_CAPACITY, BAG_SLOT_STEP } = await import('../src/data/items.js')
const { SKILLS } = await import('../src/data/skills.js')
const { PETS, PET_STAR_COSTS } = await import('../src/data/pets.js')
const {
  ANT_SPECIES, ANT_PERSONALITIES, ANT_PROTOTYPE_CONFIG, DURABILITY_CONFIG,
  NON_ANT_DURABILITY_SCALE, FLOOR_WIDTH_MIN, antWavesForLevel
} = await import('../src/data/ants.js')

const strip = (obj, drop) => { const o = { ...obj }; for (const k of drop) delete o[k]; return o }
const plain = (v) => JSON.parse(JSON.stringify(v))

assert.deepStrictEqual(plain(CHAPTERS), fixture.chapters)
ok(true, 'CHAPTERS（7 章节 + stages 天气参数）与基线逐字段一致')
assert.deepStrictEqual(plain(LEVELS), fixture.levels)
ok(true, 'LEVELS（56 关全部字段）与基线逐字段一致')
assert.deepStrictEqual(plain(MATERIALS.map((m) => strip(m, ['effect']))), fixture.materials)
ok(true, 'MATERIALS（六轴属性）与基线一致（effect 为派生 getter 另行覆盖）')
assert.deepStrictEqual(plain(BLOCK_TYPES), fixture.blockTypes)
ok(true, 'BLOCK_TYPES 与基线一致')
assert.deepStrictEqual(plain(STAT_SPECS), fixture.statSpecs)
ok(true, 'STAT_SPECS（六轴定义）与基线一致')
assert.deepStrictEqual(plain(ITEMS), fixture.items)
ok(true, 'ITEMS（8 种道具）与基线一致')
assert.deepStrictEqual({ defaultCapacity: BAG_DEFAULT_CAPACITY, slotStep: BAG_SLOT_STEP }, fixture.bag)
ok(true, '背包容量常数（20/5）与基线一致')
assert.deepStrictEqual(plain(SKILLS.map((s) => strip(s, ['effect']))), fixture.skills)
ok(true, 'SKILLS（8 项技能数据）与基线一致（effect 文案函数留在 data 层）')
assert.deepStrictEqual(plain(PETS), fixture.pets)
ok(true, 'PETS（5 只宠物档案）与基线一致')
assert.deepStrictEqual(plain(PET_STAR_COSTS), fixture.petStarCosts)
ok(true, 'PET_STAR_COSTS（升星费用表）与基线一致')
assert.deepStrictEqual(plain(ANT_SPECIES), fixture.ants.species)
assert.deepStrictEqual(plain(ANT_PERSONALITIES), fixture.ants.personalities)
assert.deepStrictEqual(plain(ANT_PROTOTYPE_CONFIG), fixture.ants.prototype)
assert.deepStrictEqual(plain(DURABILITY_CONFIG), fixture.ants.durabilityConfig)
ok(true, '蚂蚁兵种/性格/原型参数/耐久池与基线一致')
assert.equal(NON_ANT_DURABILITY_SCALE, fixture.ants.nonAntDurabilityScale)
assert.equal(FLOOR_WIDTH_MIN, fixture.ants.floorWidthMin)
ok(true, '非蚂蚁伤害系数与宽度下限与基线一致')

// 波次：逐档（含 >8 回落与无 chapterStage 的 id 推导）与基线一致
for (const stage of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  assert.deepStrictEqual(plain(antWavesForLevel({ chapterStage: stage })), fixture.ants.wavesByStage[String(stage)])
}
ok(true, 'antWavesForLevel 逐档（stage 1~10）与基线一致')
assert.deepStrictEqual(plain(antWavesForLevel({ id: 3 })), fixture.ants.wavesByStage['3'])
assert.deepStrictEqual(plain(antWavesForLevel({ id: 12 })), fixture.ants.wavesByStage['4'])
ok(true, '无 chapterStage 时按全局 id 推导（id 3 → 第3档，id 12 → 第4档）')

// 顶层派生量
assert.equal(LEVELS.length, 56)
assert.equal(CHAPTERS.length, 7)
assert.equal(TOTAL_STARS, 168)
ok(true, '派生量：56 关 / 7 章 / 168 总星')

// ================================================================
console.log('C2 · 冻结语义（与旧版一致的保护级别）')
// ================================================================
ok(CHAPTERS.every((c) => Object.isFrozen(c) && Object.isFrozen(c.stages) && c.stages.every((s) => Object.isFrozen(s))), '章节与 stages 深冻结')
ok(Object.isFrozen(CHAPTER) && Object.isFrozen(STAT_SPECS) && Object.isFrozen(STAT_KEYS) && Object.isFrozen(BASE_STATS), 'CHAPTER / STAT_SPECS / STAT_KEYS / BASE_STATS 冻结')
ok(Object.isFrozen(ANT_PROTOTYPE_CONFIG) && Object.isFrozen(BLOCK_TAGS), 'ANT_PROTOTYPE_CONFIG / BLOCK_TAGS 冻结')

// ================================================================
console.log('C3 · 纯数据守卫（defaults 目录只放字面量）')
// ================================================================
const defaultsDir = join(root, 'src/content/defaults')
const files = readdirSync(defaultsDir).filter((f) => f.endsWith('.js'))
ok(files.length === 8, `defaults 目录恰好 8 个数据文件（实际 ${files.length}）`)
for (const file of files) {
  const src = readFileSync(join(defaultsDir, file), 'utf8')
  ok(!/^\s*import[\s('"]/m.test(src) && !/[\s;)]import\s*\(/.test(src), `${file} 不含 import 语句（注释里提到 import 一词不算）`)
  ok(!/=>/.test(src), `${file} 不含箭头函数（纯数据）`)
  ok(!/\bfunction\b/.test(src), `${file} 不含函数定义`)
}

// ================================================================
console.log('C4 · Provider 回退链')
// ================================================================
const { bundle, DEFAULT_BUNDLE, CONTENT_BUNDLE_VERSION, getContentBundle, CONTENT_BUNDLE_KEY } = await import('../src/core/content.js')
ok(bundle === DEFAULT_BUNDLE || bundle.chapters === DEFAULT_BUNDLE.chapters, '无 localStorage 时注入打包默认包')
ok(getContentBundle() === bundle, 'getContentBundle 返回当前生效包')
ok(CONTENT_BUNDLE_VERSION === 1 && DEFAULT_BUNDLE.levels.length === 56, '默认包版本 1 且含 56 关')

// 缓存损坏 / 垃圾数据 → 仍回落默认包（用查询串绕过 ESM 缓存取新模块实例）
globalThis.localStorage = {
  _m: new Map([[CONTENT_BUNDLE_KEY, 'not json {{{']]),
  getItem(k) { return this._m.get(k) ?? null },
  setItem(k, v) { this._m.set(k, v) },
  removeItem(k) { this._m.delete(k) }
}
const provider2 = await import('../src/core/content.js?corrupt-cache')
ok(provider2.bundle === provider2.DEFAULT_BUNDLE, '缓存损坏时回落默认包')
globalThis.localStorage.setItem(CONTENT_BUNDLE_KEY, JSON.stringify({ version: 1, chapters: [{}], levels: [{}], materials: [{}] }))
const provider3 = await import('../src/core/content.js?custom-bundle')
ok(provider3.bundle !== provider3.DEFAULT_BUNDLE && provider3.bundle.levels.length === 1, '形状合法的自定义包可注入（Phase 2 远端包的接缝）')
delete globalThis.localStorage

// ================================================================
console.log('C5 · 导出面（data 层对外符号零增减）')
// ================================================================
// 引擎/组件/脚本依赖的全部导出必须仍然存在且类型正确
const modules = {
  levels: await import('../src/data/levels.js'),
  materials: await import('../src/data/materials.js'),
  blockTypes: await import('../src/data/blockTypes.js'),
  blockStats: await import('../src/data/blockStats.js'),
  items: await import('../src/data/items.js'),
  skills: await import('../src/data/skills.js'),
  pets: await import('../src/data/pets.js'),
  ants: await import('../src/data/ants.js')
}
const expected = {
  levels: ['CHAPTER', 'CHAPTERS', 'LEVELS', 'TOTAL_STARS', 'getLevel', 'getChapter', 'getChapterForLevel', 'getChapterLevels'],
  materials: ['MATERIALS', 'getMaterial'],
  blockTypes: ['BLOCK_TYPES', 'getBlockType', 'BLOCK_TAGS'],
  blockStats: ['STAT_SPECS', 'STAT_KEYS', 'BASE_STATS', 'resolveStats', 'describeStats', 'statRows'],
  items: ['ITEMS', 'getItem', 'BAG_DEFAULT_CAPACITY', 'BAG_SLOT_STEP'],
  skills: ['SKILLS', 'skillUpgradeCost', 'getSkill'],
  pets: ['PETS', 'PET_MAX_STAR', 'PET_MAX_LEVEL', 'PET_STAR_COSTS', 'getPet', 'petLevelCap', 'petExpToNext', 'petStarCost', 'makeDefaultPets'],
  ants: ['ANT_SPECIES', 'ANT_PERSONALITIES', 'ANT_PROTOTYPE_CONFIG', 'DURABILITY_CONFIG', 'NON_ANT_DURABILITY_SCALE', 'FLOOR_WIDTH_MIN', 'antWavesForLevel', 'durabilityForWidth']
}
for (const [name, symbols] of Object.entries(expected)) {
  const missing = symbols.filter((s) => modules[name][s] === undefined)
  ok(missing.length === 0, `${name}.js 导出齐全（${symbols.length} 个符号${missing.length ? '，缺 ' + missing.join(',') : ''}）`)
}
// 抽查查找函数行为
ok(getLevel(999) === LEVELS[0] && getChapter('nope').id === CHAPTERS[0].id, 'getLevel/getChapter 越界回退第一章')
ok(getChapterForLevel(9).id === CHAPTERS[1].id && getChapterLevels(CHAPTERS[2].id).length === 8, '章节查找与按章过滤正常')
ok(typeof MATERIALS[0].effect === 'string' && MATERIALS[0].effect.length > 0, '材质 effect 派生文案仍生效')
ok(SKILLS.every((s) => typeof s.effect === 'function'), '技能 effect 文案函数全部挂接')

console.log(`内容数据化回归通过：C1-C5 共 ${passed} 条断言。`)
