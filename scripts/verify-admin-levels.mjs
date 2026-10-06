// T5 关卡编辑器回归：src/admin/api/levels.js 的纯函数（结构校验 / 排序 / 复制 / 同步）
// 与 LevelEditorView 的接线边界。node 直跑，不依赖 npm install（api/levels.js 的 IO 走
// 动态 import，本脚本只触纯函数——这本身就是 L1 的一条断言）。
//
// 基线事实（实测 src/content/defaults/levels.js，亦即 verify-chapter.mjs 锁定的现状）：
//   7 章 × 每章 8 关 = 56 关。任务卡标题写作「8 章 56 关」，与基线不符——
//   卡内明文「字段结构以 defaults/levels.js 为唯一基准」「每章关数与现状一致」，
//   故校验按基线实测的 7 章执行（章数由 BASELINE 从 levels.js 推导，不写死）。
//
// 运行：node scripts/verify-admin-levels.mjs（npm run test:admin-levels）
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
// 校验结果里找一条含关键字的阻断信息（报告更可读的失败输出）
function hasError(result, keyword) {
  return result.errors.some((e) => e.includes(keyword))
}

const api = await import('../src/admin/api/levels.js')
const {
  LEVELS_PACK_KEY, BASELINE, cloneBaselinePack, sortChapters, sortLevels,
  groupLevelsByChapter, levelStageOf, syncLevelIntoStage, copyFromPreviousLevel, validateLevelsPack
} = api
const defaults = await import('../src/content/defaults/levels.js')

// ================================================================
console.log('L1 · 模块加载与基线锚点（纯函数可在裸 node 直跑）')
// ================================================================
ok(LEVELS_PACK_KEY === 'levels', 'levels 包 key 冻结为 \'levels\'')
ok(defaults.chapters.length === 7 && defaults.levels.length === 56, '基线现状：7 章 56 关（levels.js 为唯一基准；任务卡「8 章」系笔误，每章 8 关）')
ok(BASELINE.chapterCount === defaults.chapters.length && BASELINE.levelCount === defaults.levels.length, 'BASELINE 章数/关数由 defaults/levels.js 推导，不另抄数值')
ok(BASELINE.levelsPerChapter.every((n) => n === 8) && BASELINE.stagesPerChapter.every((n) => n === 8), '基线每章 8 关、每章 8 个 stage')
ok(BASELINE.chapterIds.every((id, i) => defaults.chapters[i].id === id), '基线章 id 清单与 levels.js 一致')

const baseResult = validateLevelsPack(cloneBaselinePack())
ok(baseResult.ok && baseResult.errors.length === 0, '打包基线本身是合法 levels 包')
ok(baseResult.warnings.length === 0, '打包基线零软警告（stage ↔ 关卡字段全量同步）')

// ================================================================
console.log('L2 · 合法编辑通过（改参数不破坏结构）')
// ================================================================
const edited = cloneBaselinePack()
edited.levels[0].target = 33
edited.levels[0].name = '新发射场'
syncLevelIntoStage(edited.levels[0], levelStageOf(edited, edited.levels[0]))
edited.levels[40].sway = 0.2
const editedResult = validateLevelsPack(edited)
ok(editedResult.ok, '改第 1 关目标/名称、第 41 关晃动后仍通过（同步 stage 后无警告）')
ok(editedResult.warnings.length === 0, '同步 stage 后不产生失同步警告')

// ================================================================
console.log('L3 · 缺章拒绝')
// ================================================================
const missing = cloneBaselinePack()
missing.chapters = missing.chapters.slice(0, 6)
const missingResult = validateLevelsPack(missing)
ok(!missingResult.ok, '缺一章 → 校验不通过')
ok(hasError(missingResult, '章数 6 与基线不一致'), '阻断信息指明章数与基线不符')

// ================================================================
console.log('L4 · 重复 id 拒绝')
// ================================================================
const dup = cloneBaselinePack()
dup.levels.find((l) => l.id === 2).id = 1
const dupResult = validateLevelsPack(dup)
ok(!dupResult.ok, '关卡 id 重复 → 校验不通过')
ok(hasError(dupResult, '重复'), '阻断信息指明 id 重复')

// ================================================================
console.log('L5 · 断号拒绝')
// ================================================================
const gap = cloneBaselinePack()
gap.levels.find((l) => l.id === 28).id = 57
const gapResult = validateLevelsPack(gap)
ok(!gapResult.ok, '关卡 id 断号（28 改 57）→ 校验不通过')
ok(hasError(gapResult, '断号'), '阻断信息指明缺 28（断号）')
const shrunk = cloneBaselinePack()
shrunk.levels = shrunk.levels.filter((l) => l.id !== 28)
const shrunkResult = validateLevelsPack(shrunk)
ok(!shrunkResult.ok, '删掉一关（55 关）→ 校验不通过')
ok(hasError(shrunkResult, '总数 55 与基线不一致'), '阻断信息指明总数与基线不符（旧存档兼容锚点，结构扩缩需先改基线）')

// ================================================================
console.log('L6 · 坏天气池拒绝（对照 verify-chapter.mjs 既有规则）')
// ================================================================
const legacyWeather = cloneBaselinePack()
legacyWeather.levels[9].weather = 1
const legacyWeatherResult = validateLevelsPack(legacyWeather)
ok(!legacyWeatherResult.ok && hasError(legacyWeatherResult, 'weather 必须为 0'), 'legacy 随机天气池 weather ≠ 0 → 拒绝（随机天气保持停用）')

const wrongKind = cloneBaselinePack()
wrongKind.levels[9].weatherKind = 'rain'
const wrongKindResult = validateLevelsPack(wrongKind)
ok(!wrongKindResult.ok && hasError(wrongKindResult, '与所属章'), '关卡 weatherKind 与所属章不一致 → 拒绝')

const clearKind = cloneBaselinePack()
clearKind.levels[0].weatherKind = 'wind'
const clearKindResult = validateLevelsPack(clearKind)
ok(!clearKindResult.ok && hasError(clearKindResult, '晴章关卡不得带 weatherKind'), '晴章（第一章）关卡带 weatherKind → 拒绝（保持晴天静塔）')

const clearSway = cloneBaselinePack()
clearSway.levels[0].sway = 0.2
const clearSwayResult = validateLevelsPack(clearSway)
ok(!clearSwayResult.ok && hasError(clearSwayResult, '晴章关卡 sway 必须为 0'), '晴章关卡 sway ≠ 0 → 拒绝')

const chapterKind = cloneBaselinePack()
chapterKind.chapters[1].weatherKind = 'rain'
const chapterKindResult = validateLevelsPack(chapterKind)
ok(!chapterKindResult.ok && hasError(chapterKindResult, '与基线'), '章 weatherKind 偏离基线 → 拒绝（章天气种类为锚点）')

// ================================================================
console.log('L7 · 引用断裂 / 数值与形状拒绝')
// ================================================================
const orphan = cloneBaselinePack()
orphan.levels[3].chapterId = 'ghost-city'
const orphanResult = validateLevelsPack(orphan)
ok(!orphanResult.ok && hasError(orphanResult, '不存在'), 'chapterId 引用不存在的章 → 拒绝（引用断裂）')

const negative = cloneBaselinePack()
negative.levels[0].target = -5
const negativeResult = validateLevelsPack(negative)
ok(!negativeResult.ok && hasError(negativeResult, '不能为负数'), 'target 为负 → 拒绝（包内数值参数一律非负）')

const notNumber = cloneBaselinePack()
notNumber.levels[0].speed = 'fast'
const notNumberResult = validateLevelsPack(notNumber)
ok(!notNumberResult.ok && hasError(notNumberResult, '必须是数字'), 'speed 非数字 → 拒绝（保存前自检：字段齐全、无 undefined）')

const emptyName = cloneBaselinePack()
emptyName.levels[2].name = ' '
const emptyNameResult = validateLevelsPack(emptyName)
ok(!emptyNameResult.ok && hasError(emptyNameResult, 'name 不能为空'), '关卡名称为空白 → 拒绝')

const shapeResult = validateLevelsPack({ chapters: [], levels: [] })
ok(!shapeResult.ok && shapeResult.errors.some((e) => e.includes('非空数组')), 'chapters/levels 空数组 → 拒绝')
ok(validateLevelsPack(null).ok === false, 'data 非 { chapters, levels } 对象 → 拒绝')

// ================================================================
console.log('L8 · 排序 / 分组 / stage 定位')
// ================================================================
assert.deepEqual(sortLevels([{ id: 3 }, { id: 1 }, { id: 2 }]).map((l) => l.id), [1, 2, 3])
ok(true, 'sortLevels 按 id 升序（返回新数组）')
assert.deepEqual(sortChapters([{ number: 2 }, { number: 1 }]).map((c) => c.number), [1, 2])
ok(true, 'sortChapters 按 number 升序（返回新数组）')
const grouped = groupLevelsByChapter(defaults.levels)
ok(Object.keys(grouped).length === 7 && Object.values(grouped).every((ls) => ls.length === 8), 'groupLevelsByChapter：7 章各 8 关，组内按 id 升序')
assert.equal(levelStageOf({ chapters: defaults.chapters, levels: defaults.levels }, defaults.levels[2]).place, '旧渡口')
ok(true, 'levelStageOf：晴章关卡无 chapterStage，按章内 id 顺序对位 stage')
assert.equal(levelStageOf({ chapters: defaults.chapters, levels: defaults.levels }, defaults.levels[8]).intensity, 0.24)
ok(true, 'levelStageOf：天气章按 chapterStage 定位 stage（L9 → 岚河 stages[0]）')

// ================================================================
console.log('L9 · 复制上一关参数')
// ================================================================
const source = cloneBaselinePack()
source.levels.find((l) => l.id === 10).target = 55
source.levels.find((l) => l.id === 10).sway = 0.5
const before = JSON.stringify(source)
const copied = copyFromPreviousLevel(source, 11)
ok(copied !== null, '第 11 关可以复制第 10 关参数')
const copiedLevel = copied.levels.find((l) => l.id === 11)
assert.equal(copiedLevel.target, 55)
assert.equal(copiedLevel.sway, 0.5)
ok(true, '数值参数（target/sway）已拷贝')
assert.equal(copiedLevel.name, source.levels.find((l) => l.id === 11).name)
ok(true, '身份字段（name/city/place 等文案）不被覆盖')
assert.equal(copied.chapters[1].stages[2].target, 55)
ok(true, '复制后 stage.target 同步回写（基线不变式）')
assert.equal(JSON.stringify(source), before)
ok(true, '纯函数：入参 pack 不被修改（返回深拷贝）')
assert.equal(copyFromPreviousLevel(source, 1), null)
ok(true, '第 1 关没有上一关 → 返回 null')
const crossChapter = copyFromPreviousLevel(source, 9)
ok(crossChapter !== null && crossChapter.levels.find((l) => l.id === 9).name === '河堤', '跨章复制（第 9 关 ← 第 8 关）只拷可调参数，身份保持')

// ================================================================
console.log('L10 · stage 同步与软警告')
// ================================================================
const stage = { city: '旧市', place: '旧地点', cityscape: 'oldScene', target: 1, hint: '旧提示', landmark: 'oldLandmark' }
const syncedLevel = { target: 42, city: '新市', place: '新地点', cityscape: 'newScene', weatherHint: '新提示', landmarkFeature: 'newLandmark', chapterCue: '旧cue' }
syncLevelIntoStage(syncedLevel, stage)
assert.deepEqual(stage, { city: '新市', place: '新地点', cityscape: 'newScene', target: 42, hint: '新提示', landmark: 'newLandmark' })
ok(true, 'syncLevelIntoStage：target/city/place/cityscape/hint/landmark 全部回写')
assert.equal(syncedLevel.chapterCue, '新提示')
ok(true, 'chapterCue 跟随 weatherHint（基线恒同步）')

const desynced = cloneBaselinePack()
desynced.chapters[0].stages[0].target = 99
const desyncedResult = validateLevelsPack(desynced)
ok(desyncedResult.ok === true && desyncedResult.warnings.some((w) => w.includes('不同步')), 'stage 与关卡字段失同步 → 不阻断但出软警告')
const heavySway = cloneBaselinePack()
heavySway.levels[40].sway = 2
const heavySwayResult = validateLevelsPack(heavySway)
ok(heavySwayResult.ok === true && heavySwayResult.warnings.some((w) => w.includes('sway')), 'sway 远超基线 → 软提醒（不阻断）')

// ================================================================
console.log('L11 · 编辑器接线边界（静态检查）')
// ================================================================
const viewSrc = readFileSync(join(root, 'src/admin/views/LevelEditorView.vue'), 'utf8')
const apiSrc = readFileSync(join(root, 'src/admin/api/levels.js'), 'utf8')
ok(viewSrc.includes("from '../api/levels.js'"), 'LevelEditorView 的数据层只经 api/levels.js')
ok(!/from\s+['"]\.\.\/api\/content\.js['"]/.test(viewSrc), 'LevelEditorView 不直接 import api/content.js（levels 包存取经封装层）')
ok(!/from\s+['"].*store\.js['"]/.test(viewSrc) && !/from\s+['"].*store\.js['"]/.test(apiSrc), '两个独占文件都不 import store.js（与 verify-admin A3 同规）')
ok(!/^import\s[^\n]*['"]\.\/content\.js['"]/m.test(apiSrc), 'api/levels.js 顶层不静态 import content.js（IO 动态加载，纯函数可被裸 node 直跑——本脚本 L1 即证明）')
ok(/<style scoped>/.test(viewSrc), 'LevelEditorView 样式写在 <style scoped>（不动 admin.css）')
ok(viewSrc.includes('保存草稿') && viewSrc.includes('发布') && viewSrc.includes('复制上一关参数'), '视图含草稿保存 / 发布 / 复制上一关参数入口')

console.log(`关卡编辑器回归通过：L1-L11 共 ${passed} 条断言。`)
