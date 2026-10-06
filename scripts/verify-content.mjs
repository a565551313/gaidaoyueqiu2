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

// ================================================================
console.log('C6 · 远端内容握手（T3：远端 → 本地缓存 → 打包默认）')
// ================================================================
// 纯函数 + fetch/storage 桩断言（开发期不依赖真库；与 T1 的 RPC 联通后同源可验）
const passedBeforeC6 = passed
const { isValidBundle } = await import('../src/core/content.js')
const { assembleRemoteBundle, syncRemoteContent } = await import('../src/core/contentRemote.js')

// 造远端包数据：默认字段深拷贝 + __remote 标记（标记在 = 该字段整体来自远端，
// 断言不依赖具体业务字段的语义）
const cloneOf = (v) => JSON.parse(JSON.stringify(v))
const marked = (v) => {
  const c = cloneOf(v)
  if (Array.isArray(c)) {
    if (c.length && c[0] && typeof c[0] === 'object') c[0] = { ...c[0], __remote: true }
  } else if (c && typeof c === 'object') {
    c.__remote = true
  }
  return c
}
const remotePacksAll = {
  levels: { chapters: marked(DEFAULT_BUNDLE.chapters), levels: marked(DEFAULT_BUNDLE.levels) },
  materials: { materials: marked(DEFAULT_BUNDLE.materials) },
  blocks: { blockTypes: marked(DEFAULT_BUNDLE.blockTypes), statSpecs: marked(DEFAULT_BUNDLE.statSpecs) },
  items: { items: marked(DEFAULT_BUNDLE.items), bag: marked(DEFAULT_BUNDLE.bag) },
  skills: { skills: marked(DEFAULT_BUNDLE.skills) },
  pets: { pets: marked(DEFAULT_BUNDLE.pets), petStarCosts: marked(DEFAULT_BUNDLE.petStarCosts) },
  ants: { ants: marked(DEFAULT_BUNDLE.ants) }
}

// —— 组装纯函数：§C1 包字段映射 ——
const full = assembleRemoteBundle({ version: 12, packs: remotePacksAll })
ok(!!full && full.version === 12, '组装：7 包全发布 → 完整 bundle，version 取远端最大发布版本（§C1）')
ok(full.chapters[0].__remote === true && full.levels[0].__remote === true, '映射：levels 包覆盖 chapters + levels')
ok(full.materials[0].__remote === true, '映射：materials 包覆盖 materials')
ok(full.blockTypes[0].__remote === true && full.statSpecs.__remote === true, '映射：blocks 包覆盖 blockTypes + statSpecs')
ok(full.items[0].__remote === true && full.bag.__remote === true, '映射：items 包覆盖 items + bag')
ok(full.skills[0].__remote === true, '映射：skills 包覆盖 skills')
ok(full.pets[0].__remote === true && full.petStarCosts.__remote === true, '映射：pets 包覆盖 pets + petStarCosts')
ok(full.ants.__remote === true, '映射：ants 包整体覆盖 ants（兵种/性格/波次/耐久）')

// —— 组装纯函数：未发布字段保持打包默认 ——
const onlyMat = assembleRemoteBundle({ version: 3, packs: { materials: remotePacksAll.materials } })
ok(onlyMat.materials[0].__remote === true, '组装：只发布 materials → materials 用远端值')
ok(
  JSON.stringify(onlyMat.chapters) === JSON.stringify(DEFAULT_BUNDLE.chapters) &&
  JSON.stringify(onlyMat.levels) === JSON.stringify(DEFAULT_BUNDLE.levels) &&
  JSON.stringify(onlyMat.blockTypes) === JSON.stringify(DEFAULT_BUNDLE.blockTypes) &&
  JSON.stringify(onlyMat.statSpecs) === JSON.stringify(DEFAULT_BUNDLE.statSpecs) &&
  JSON.stringify(onlyMat.items) === JSON.stringify(DEFAULT_BUNDLE.items) &&
  JSON.stringify(onlyMat.bag) === JSON.stringify(DEFAULT_BUNDLE.bag) &&
  JSON.stringify(onlyMat.skills) === JSON.stringify(DEFAULT_BUNDLE.skills) &&
  JSON.stringify(onlyMat.pets) === JSON.stringify(DEFAULT_BUNDLE.pets) &&
  JSON.stringify(onlyMat.petStarCosts) === JSON.stringify(DEFAULT_BUNDLE.petStarCosts) &&
  JSON.stringify(onlyMat.ants) === JSON.stringify(DEFAULT_BUNDLE.ants),
  '组装：未发布包的字段全部保持打包默认值（bundle 永远完整）'
)

// —— 组装纯函数：坏包被拒（整体拒绝，宁可不更新也不注入残缺包）——
ok(assembleRemoteBundle(null) === null, '坏包被拒：payload 为 null')
ok(assembleRemoteBundle({ packs: remotePacksAll }) === null, '坏包被拒：version 缺失')
ok(assembleRemoteBundle({ version: 0, packs: {} }) === null, '坏包被拒：version 非正整数（空发布不下发）')
ok(assembleRemoteBundle({ version: 2, packs: { levels: { chapters: remotePacksAll.levels.chapters } } }) === null, '坏包被拒：levels 包缺 levels 字段')
ok(assembleRemoteBundle({ version: 2, packs: { blocks: { blockTypes: remotePacksAll.blocks.blockTypes } } }) === null, '坏包被拒：blocks 包缺 statSpecs 字段')
ok(assembleRemoteBundle({ version: 2, packs: { skills: 'oops' } }) === null, '坏包被拒：包 data 不是对象')
ok(assembleRemoteBundle({ version: 2, packs: { skills: { skills: null } } }) === null, '坏包被拒：字段值为 null（data 层 bundle.skills.map 会崩）')
ok(assembleRemoteBundle({ version: 2, packs: { ants: { ants: { species: [] } } } }) === null, '坏包被拒：ants 缺默认包的顶层键（性格/波次/耐久等）')
ok(assembleRemoteBundle({ version: 2, packs: ['levels'] }) === null, '坏包被拒：packs 不是对象')
ok(assembleRemoteBundle({ version: 2, packs: { materials: { materials: [] } } }) === null, '坏包被拒：组装结果过不了 isValidBundle（materials 空数组）')
ok(assembleRemoteBundle({ version: 2, packs: { futurePack: { x: 1 }, materials: remotePacksAll.materials } }) !== null, '未知包 key 向前兼容：忽略新包，不阻塞已知包')

// —— syncRemoteContent：fetch/storage 桩 ——
function storageStub() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    _map: map
  }
}
function fetchStub(payload) {
  const calls = []
  return {
    calls,
    impl: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => payload } }
  }
}
const cfg6 = { url: 'https://demo.supabase.co/', anonKey: 'anon-test-key' }

// 请求形状：原生 fetch POST RPC 端点 + apikey / Bearer 头（不用 supabase-js）
const fReq = fetchStub({ version: 12, packs: remotePacksAll })
const sReq = storageStub()
const rReq = await syncRemoteContent({ config: cfg6, fetchImpl: fReq.impl, storage: sReq })
ok(rReq.updated === true && rReq.version === 12, 'sync：远端 version 12 > 无缓存基线 0 → 写入（首次发布可到达新玩家）')
ok(fReq.calls.length === 1 && fReq.calls[0].url === 'https://demo.supabase.co/rest/v1/rpc/get_published_content', 'sync：POST {VITE_SUPABASE_URL}/rest/v1/rpc/get_published_content（URL 尾斜杠归一）')
ok(fReq.calls[0].init.method === 'POST' && fReq.calls[0].init.headers.apikey === 'anon-test-key' && fReq.calls[0].init.headers.Authorization === 'Bearer anon-test-key', 'sync：headers 带 apikey + Authorization Bearer anonKey')
const writtenBundle = JSON.parse(sReq._map.get(CONTENT_BUNDLE_KEY))
ok(isValidBundle(writtenBundle) && writtenBundle.version === 12 && writtenBundle.materials[0].__remote === true, 'sync：写入 CONTENT_BUNDLE_KEY 的是通过形状校验的完整组装包')

// 版本门：相同 / 更低不覆盖，严格更大才覆盖
const cachedRaw = sReq._map.get(CONTENT_BUNDLE_KEY)
const rSame = await syncRemoteContent({ config: cfg6, fetchImpl: fetchStub({ version: 12, packs: remotePacksAll }).impl, storage: sReq })
ok(rSame.updated === false && sReq._map.get(CONTENT_BUNDLE_KEY) === cachedRaw, 'sync：远端 version 与缓存相同 → 不覆盖')
const rOld = await syncRemoteContent({ config: cfg6, fetchImpl: fetchStub({ version: 11, packs: remotePacksAll }).impl, storage: sReq })
ok(rOld.updated === false && sReq._map.get(CONTENT_BUNDLE_KEY) === cachedRaw, 'sync：远端 version 低于缓存 → 不覆盖（防降级）')
const rNew = await syncRemoteContent({ config: cfg6, fetchImpl: fetchStub({ version: 13, packs: { materials: remotePacksAll.materials } }).impl, storage: sReq })
ok(rNew.updated === true && JSON.parse(sReq._map.get(CONTENT_BUNDLE_KEY)).version === 13, 'sync：远端 version 严格更大 → 覆盖缓存')
const sBad = storageStub()
sBad._map.set(CONTENT_BUNDLE_KEY, 'not json {{{')
const rFix = await syncRemoteContent({ config: cfg6, fetchImpl: fetchStub({ version: 2, packs: { materials: remotePacksAll.materials } }).impl, storage: sBad })
ok(rFix.updated === true, 'sync：缓存损坏时视同无缓存（远端可覆盖修复）')

// 失败面：任何失败静默回落、永不抛错、缓存不动
const sFail = storageStub()
let rFail = await syncRemoteContent({ config: cfg6, fetchImpl: async () => { throw new Error('network down') }, storage: sFail })
ok(rFail.updated === false && sFail._map.size === 0, 'sync：fetch 抛错（断网）→ 静默失败，缓存不动')
rFail = await syncRemoteContent({ config: cfg6, fetchImpl: async () => ({ ok: false, status: 500 }), storage: sFail })
ok(rFail.updated === false && sFail._map.size === 0, 'sync：HTTP 非 2xx → 静默失败')
rFail = await syncRemoteContent({ config: cfg6, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad body') } }), storage: sFail })
ok(rFail.updated === false && sFail._map.size === 0, 'sync：响应体不是 JSON → 静默失败')
rFail = await syncRemoteContent({ config: cfg6, fetchImpl: fetchStub({ version: 20, packs: { skills: { skills: 'oops' } } }).impl, storage: sFail })
ok(rFail.updated === false && sFail._map.size === 0, 'sync：坏 payload → 拒绝写入')
rFail = await syncRemoteContent({ config: cfg6, fetchImpl: fetchStub({ version: 20, packs: remotePacksAll }).impl, storage: { getItem: () => null, setItem: () => { throw new Error('quota exceeded') } } })
ok(rFail.updated === false, 'sync：写缓存抛错（隐私模式/配额满）→ 静默失败')

// mock 模式（无 VITE_SUPABASE_* 环境变量）：整体 no-op
const touched = { fetch: 0, storage: 0 }
const rNoEnv = await syncRemoteContent({
  fetchImpl: async () => { touched.fetch++; throw new Error('无 env 时不应发请求') },
  storage: { getItem: () => { touched.storage++; return null }, setItem: () => { touched.storage++ } }
})
ok(rNoEnv.updated === false && rNoEnv.reason === 'no-env' && touched.fetch === 0 && touched.storage === 0, 'mock 模式（无环境变量）整体 no-op：不发请求、不碰 localStorage')

// 端到端接缝：写进缓存的包，下一次加载经 pickBundle 注入（远端 → 缓存 → 打包默认）
const finalCached = sReq._map.get(CONTENT_BUNDLE_KEY)
globalThis.localStorage = {
  _m: new Map([[CONTENT_BUNDLE_KEY, finalCached]]),
  getItem(k) { return this._m.get(k) ?? null },
  setItem(k, v) { this._m.set(k, v) },
  removeItem(k) { this._m.delete(k) }
}
const providerRemote = await import('../src/core/content.js?remote-c6')
ok(
  providerRemote.bundle !== providerRemote.DEFAULT_BUNDLE &&
  providerRemote.bundle.version === 13 &&
  providerRemote.bundle.materials[0].__remote === true &&
  JSON.stringify(providerRemote.bundle.levels) === JSON.stringify(providerRemote.DEFAULT_BUNDLE.levels),
  '端到端：写入的缓存包在下次加载时经 pickBundle 注入，未发布字段仍是默认值'
)
delete globalThis.localStorage

console.log(`远端内容握手回归通过：C6 共 ${passed - passedBeforeC6} 条断言。`)
